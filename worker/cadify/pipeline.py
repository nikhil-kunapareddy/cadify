"""The generation pipeline: drawing -> interpretation -> CadQuery code -> solid -> files.

Stage ids match the UI (src/config/app.ts). Every number reported to the UI
comes from Claude's reading of the drawing or from the CAD kernel; nothing is
fabricated. Dimensions in the result are measured from the built solid.
"""
from __future__ import annotations

import os
import shutil
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional

from .claude import ModelSession
from .prompts import FEATURE_KINDS
from .protocol import Emit, Read, WorkerError, log
from .sandbox import RunResult, UnsafeCodeError, check_code, run_code

MAX_REQUEST_BYTES = 32 * 1024 * 1024  # Anthropic request size limit
MAX_FIX_ATTEMPTS = 3
ENVELOPE_PASS = 0.01  # 1 %: dimensions consistent
ENVELOPE_RETRY = 0.05  # > 5 %: ask Claude to fix the model


@dataclass
class StartMessage:
    run_id: str
    drawing_path: Path
    drawing_file_name: str
    page_count: int
    model_name: str
    output_dir: Path
    work_dir: Path
    outputs: list[str]

    @classmethod
    def parse(cls, msg: dict[str, Any]) -> "StartMessage":
        if msg.get("type") != "start":
            raise WorkerError("WORKER_PROTOCOL", "Expected a start message")
        return cls(
            run_id=str(msg["runId"]),
            drawing_path=Path(msg["drawingPath"]),
            drawing_file_name=str(msg.get("drawingFileName") or Path(msg["drawingPath"]).name),
            page_count=int(msg.get("pageCount") or 1),
            model_name=str(msg.get("modelName") or "Model"),
            output_dir=Path(msg["outputDir"]),
            work_dir=Path(msg["workDir"]),
            outputs=[o for o in msg.get("outputs", ["step", "stl"]) if o in ("step", "stl")] or ["step", "stl"],
        )


@dataclass
class RunState:
    stage: Optional[str] = None
    warnings: list[dict[str, str]] = field(default_factory=list)
    inferred_questions: int = 0
    attempts: int = 0
    code: str = ""


def _fmt_bytes(n: int) -> str:
    return f"{n / 1024:.1f} KB" if n < 1024 * 1024 else f"{n / 1024 / 1024:.1f} MB"


def envelope_error(measured: dict[str, float], expected: dict[str, float]) -> float:
    """Largest relative difference between the sorted envelopes (orientation-agnostic)."""
    m = sorted([measured["x"], measured["y"], measured["z"]])
    e = sorted([expected["length_mm"], expected["width_mm"], expected["height_mm"]])
    worst = 0.0
    for a, b in zip(m, e):
        if b <= 0:
            continue
        worst = max(worst, abs(a - b) / b)
    return worst


class Pipeline:
    def __init__(
        self,
        start: StartMessage,
        session: ModelSession,
        emit: Emit,
        read_message: Read,
        runner: Callable[[str, Path, int], RunResult] = run_code,
    ):
        self.start = start
        self.session = session
        self.emit = emit
        self.read_message = read_message
        self.runner = runner
        self.state = RunState()

    # ---------------------------------------------------------------- helpers

    def _begin(self, stage: str) -> None:
        self.state.stage = stage
        self.emit({"type": "stage_started", "stage": stage})

    def _done(self, stage: str, detail: str) -> None:
        self.emit({"type": "stage_completed", "stage": stage, "detail": detail})

    def _warn(self, code: str, message: str) -> None:
        warning = {"code": code, "message": message}
        self.state.warnings.append(warning)
        self.emit({"type": "warning", "warning": warning})

    # ------------------------------------------------------------------ run

    def run(self) -> dict[str, Any]:
        s = self.start

        self._begin("prepare")
        if not s.drawing_path.is_file():
            raise WorkerError("FILE_NOT_FOUND", "The drawing is missing from the project folder")
        s.work_dir.mkdir(parents=True, exist_ok=True)
        working_copy = s.work_dir / "drawing.pdf"
        shutil.copyfile(s.drawing_path, working_copy)
        pdf = working_copy.read_bytes()
        self._done("prepare", f"Working copy created · {_fmt_bytes(len(pdf))}")

        self._begin("extract")
        # Base64 grows the payload by 4/3; keep the request under the API limit.
        if len(pdf) * 4 / 3 > MAX_REQUEST_BYTES - 1024 * 1024:
            raise WorkerError("FILE_TOO_LARGE", "The drawing exceeds the 32 MB API request limit")
        version = pdf[5:8].decode("ascii", "replace") if pdf.startswith(b"%PDF-") else "?"
        self._done("extract", f"{s.page_count} {'page' if s.page_count == 1 else 'pages'} · PDF {version}")

        self._begin("analyze")
        analysis = self.session.analyze(pdf, s.drawing_file_name, s.page_count)
        if not analysis.get("is_engineering_drawing", False):
            raise WorkerError(
                "INTERPRETATION_FAILED",
                "This does not look like a mechanical engineering drawing",
                analysis.get("missing_information") or None,
            )
        views = analysis.get("views") or []
        self._done("analyze", f"{len(views)} {'view' if len(views) == 1 else 'views'} · {analysis.get('part_name') or 'part'}")

        self._begin("identify")
        if not analysis.get("can_build", False):
            raise WorkerError(
                "INSUFFICIENT_DIMENSIONS", "The drawing is missing dimensions needed to build a solid", analysis.get("missing_information")
            )
        clarifications = self._clarify(analysis)
        for assumption in (analysis.get("assumptions") or [])[:3]:
            self._warn("ASSUMPTION", f"Assumed: {assumption}")
        features = analysis.get("features") or []
        feature_total = sum(max(0, int(f.get("count") or 0)) for f in features)
        detail = f"{analysis.get('dimensions_read', 0)} dimensions · {feature_total} features"
        if clarifications:
            detail += " · clarified"
        self._done("identify", detail)

        self._begin("reconstruct")
        code = self.session.write_code(clarifications).get("code", "")
        code = self._checked(code)
        self._done("reconstruct", f"CadQuery script · {len(code.splitlines())} lines")

        self._begin("solid")
        result = self._build_until_valid(code, analysis)
        report = result.report
        detail = f"{report['solidCount']} {'solid' if report['solidCount'] == 1 else 'solids'} · {report['faceCount']} faces"
        if self.state.attempts > 1:
            detail += f" · fixed after {self.state.attempts} attempts"
        self._done("solid", detail)

        self._begin("validate")
        validation, err = self._validation(report, analysis)
        if validation["solidValid"]["status"] == "fail":
            raise WorkerError("VALIDATION_FAILED", "The generated solid is not valid")
        if err > ENVELOPE_PASS:
            self._warn("DIMENSION_MISMATCH", f"Model envelope differs from the drawing by {err * 100:.1f} %.")
        self._done("validate", " · ".join(v["detail"] for v in validation.values() if v.get("detail"))[:160])

        self._begin("export")
        artifacts, preview = self._export(report)
        self._done("export", " · ".join(f"{a['format'].upper()} {_fmt_bytes(a['sizeBytes'])}" for a in artifacts))

        return self._result(analysis, report, validation, artifacts, preview)

    # --------------------------------------------------------- clarification

    def _clarify(self, analysis: dict[str, Any]) -> str:
        blocking = [q for q in analysis.get("questions") or [] if q.get("blocking")]
        if not blocking:
            return ""
        request = {
            "id": f"clarify-{self.start.run_id[:8]}",
            "summary": f"{len(blocking)} {'detail' if len(blocking) == 1 else 'details'} on the drawing "
            "could change the geometry. Confirm them so the model matches your intent.",
            "questions": [
                {
                    "id": q["id"],
                    "prompt": q["prompt"],
                    "context": q.get("context") or None,
                    "kind": q["kind"],
                    **(
                        {"options": [{"id": o["id"], "label": o["label"], "description": o.get("description") or None} for o in q.get("options") or []]}
                        if q["kind"] == "choice"
                        else {"unit": "mm", "suggestedValue": q.get("suggested_value_mm")}
                    ),
                }
                for q in blocking
            ],
        }
        self.emit({"type": "clarification_required", "request": request})
        msg = self.read_message()
        if msg is None or msg.get("type") != "answer":
            raise WorkerError("WORKER_PROTOCOL", "No answer received for the clarification")
        answers = {a.get("questionId"): a for a in msg.get("answers") or []}

        lines: list[str] = []
        delegated = 0
        for q in blocking:
            a = answers.get(q["id"], {})
            if a.get("optionId"):
                label = next((o["label"] for o in q.get("options") or [] if o["id"] == a["optionId"]), a["optionId"])
                lines.append(f"- {q['prompt']} -> {label}")
            elif a.get("value") is not None:
                lines.append(f"- {q['prompt']} -> {a['value']} mm")
            else:
                delegated += 1
                suggestion = q.get("suggested_option_id") or q.get("suggested_value_mm")
                lines.append(f"- {q['prompt']} -> not specified; use your best judgment (your suggestion: {suggestion}) and mark it inferred")
        if delegated:
            self.state.inferred_questions = delegated
            self._warn(
                "INFERRED_DIMENSIONS",
                f"Model contains inferred dimensions: {delegated} {'value was' if delegated == 1 else 'values were'} chosen by CADify.",
            )
        return "\n".join(lines)

    # ------------------------------------------------------------- modeling

    def _checked(self, code: str) -> str:
        """Returns safe code, asking Claude to fix contract violations."""
        for attempt in range(1, MAX_FIX_ATTEMPTS + 1):
            try:
                check_code(code)
                return code
            except (UnsafeCodeError, SyntaxError) as exc:
                problem = (
                    f"The program was rejected before running: {exc}"
                    if isinstance(exc, UnsafeCodeError)
                    else f"The program has a syntax error: {exc}"
                )
                log("code rejected:", problem)
                if attempt == MAX_FIX_ATTEMPTS:
                    raise WorkerError("GEOMETRY_FAILED", "The generated code broke the modeling contract", problem) from exc
                code = self.session.fix_code(problem, attempt, MAX_FIX_ATTEMPTS).get("code", "")
        return code

    def _build_until_valid(self, code: str, analysis: dict[str, Any]) -> RunResult:
        last_problem = ""
        for attempt in range(1, MAX_FIX_ATTEMPTS + 2):
            self.state.attempts = attempt
            started = time.monotonic()
            result = self.runner(code, self.start.work_dir, attempt)
            log(f"attempt {attempt}: ok={result.ok} in {time.monotonic() - started:.1f}s")
            if result.ok:
                err = envelope_error(result.report["bbox"], analysis["overall"])
                if err <= ENVELOPE_RETRY:
                    self.state.code = code
                    return result
                b = result.report["bbox"]
                o = analysis["overall"]
                last_problem = (
                    f"The solid's bounding box is {b['x']:.2f} x {b['y']:.2f} x {b['z']:.2f} mm, but the drawing's "
                    f"overall size is {o['length_mm']} x {o['width_mm']} x {o['height_mm']} mm "
                    f"({err * 100:.1f} % off). Correct the dimensions."
                )
            else:
                last_problem = f"Execution error:\n{result.error}"
            if attempt > MAX_FIX_ATTEMPTS:
                break
            self.emit({"type": "stage_progress", "stage": "solid", "detail": f"Fixing the model (attempt {attempt + 1})"})
            code = self._checked(self.session.fix_code(last_problem, attempt, MAX_FIX_ATTEMPTS).get("code", ""))
        raise WorkerError("GEOMETRY_FAILED", "Geometry generation failed", last_problem)

    # ----------------------------------------------------------- validation

    def _validation(self, report: dict[str, Any], analysis: dict[str, Any]) -> tuple[dict[str, Any], float]:
        mesh = report["mesh"]
        err = envelope_error(report["bbox"], analysis["overall"])
        dims = int(analysis.get("dimensions_read") or 0)
        inferred = sum(1 for f in analysis.get("features") or [] if f.get("inferred")) + self.state.inferred_questions
        consistency_detail = f"Envelope within {err * 100:.1f} % · {dims} dimensions read"
        if inferred:
            consistency_detail += f" · {inferred} inferred"
        validation = {
            "solidValid": {"status": "pass" if report["valid"] else "fail", "detail": "Valid B-rep solid" if report["valid"] else "BRepCheck failed"},
            "watertight": (
                {"status": "pass", "detail": "Closed mesh, no open edges"}
                if mesh["watertight"]
                else {"status": "warn", "detail": f"{mesh['openEdges']} open and {mesh['nonmanifoldEdges']} non-manifold edges"}
            ),
            "dimensionConsistency": {
                "status": "pass" if err <= ENVELOPE_PASS and not inferred else "warn",
                "detail": consistency_detail,
            },
            "exportValidation": {
                "status": "pass" if report["stepOk"] and mesh["triangles"] > 0 else "fail",
                "detail": "STEP re-imported and STL re-read" if report["stepOk"] else "STEP re-import did not match",
            },
        }
        return validation, err

    # ---------------------------------------------------------------- export

    def _export(self, report: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        out = Path(report["outDir"])
        dest = self.start.output_dir
        dest.mkdir(parents=True, exist_ok=True)

        def place(name: str) -> int:
            tmp = dest / f".{name}.partial"
            shutil.copyfile(out / name, tmp)
            os.replace(tmp, dest / name)
            return (dest / name).stat().st_size

        artifacts = []
        if "step" in self.start.outputs:
            artifacts.append({"format": "step", "fileName": "model.step", "sizeBytes": place("model.step"), "validated": bool(report["stepOk"])})
        if "stl" in self.start.outputs:
            artifacts.append(
                {"format": "stl", "fileName": "model.stl", "sizeBytes": place("model.stl"), "validated": report["mesh"]["triangles"] > 0}
            )
        preview = {"format": "stl", "sizeBytes": place("preview-mesh.stl"), "triangleCount": report["mesh"]["triangles"]}
        # Keep the parametric CadQuery source next to the exports.
        source = dest / ".model.py.partial"
        source.write_text(f"# Generated by CADify from {self.start.drawing_file_name}\n{self.state.code}", encoding="utf-8")
        os.replace(source, dest / "model.py")
        return artifacts, preview

    # ---------------------------------------------------------------- result

    def _result(
        self,
        analysis: dict[str, Any],
        report: dict[str, Any],
        validation: dict[str, Any],
        artifacts: list[dict[str, Any]],
        preview: dict[str, Any],
    ) -> dict[str, Any]:
        features = []
        for i, f in enumerate(analysis.get("features") or []):
            kind = f.get("kind") if f.get("kind") in FEATURE_KINDS else "other"
            features.append(
                {
                    "id": f"f{i + 1}",
                    "kind": kind,
                    "label": f.get("label") or kind.capitalize(),
                    "count": max(1, int(f.get("count") or 1)),
                    **({"parameters": f["parameters"]} if f.get("parameters") else {}),
                    **({"inferred": True} if f.get("inferred") else {}),
                }
            )
        drawing_type = analysis.get("drawing_type") or None
        if analysis.get("units") == "in":
            drawing_type = f"{drawing_type or 'Drawing'} · inch units converted to mm"
            self.state.warnings.append({"code": "UNITS_CONVERTED", "message": "The drawing is in inches; the model was built in millimeters."})
        bbox = report["bbox"]
        return {
            "runId": self.start.run_id,
            "backend": "worker",
            "modelName": self.start.model_name,
            "sourceFileName": self.start.drawing_file_name,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "units": "mm",
            **({"drawingType": drawing_type} if drawing_type else {}),
            "dimensions": {"length": bbox["x"], "width": bbox["y"], "height": bbox["z"]},
            "solidCount": report["solidCount"],
            "features": features,
            "validation": validation,
            "artifacts": artifacts,
            "preview": preview,
            "warnings": self.state.warnings,
            "usage": self.session.usage.to_json(),
        }
