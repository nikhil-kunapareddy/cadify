"""Child process: executes model-generated CadQuery code and validates the result.

Usage: python runner.py <model.py> <out_dir>
Writes <out_dir>/report.json plus model.step, model.stl and preview-mesh.stl.
Runs with restricted builtins (see sandbox.py for the other layers).
"""
from __future__ import annotations

import builtins as _builtins
import json
import math
import sys
import traceback
from pathlib import Path

SAFE_BUILTINS = [
    "abs", "all", "any", "bool", "dict", "divmod", "enumerate", "filter", "float", "frozenset", "int",
    "isinstance", "len", "list", "map", "max", "min", "pow", "range", "reversed", "round", "set",
    "sorted", "str", "sum", "tuple", "zip", "print", "Exception", "ValueError", "TypeError",
    "RuntimeError", "ZeroDivisionError", "IndexError", "KeyError", "True", "False", "None",
    "__build_class__", "object", "staticmethod", "classmethod", "property", "super", "slice",
]


def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):  # noqa: A002
    if level != 0 or name.split(".")[0] not in {"cadquery", "math"}:
        raise ImportError(f"import of '{name}' is not allowed")
    return __import__(name, globals, locals, fromlist, level)


def _model_traceback(exc: BaseException) -> str:
    """Traceback limited to frames from the generated code."""
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == "model.py"]
    lines = [f"  line {f.lineno}: {f.line}" for f in frames[-4:]]
    return f"{type(exc).__name__}: {exc}" + ("\n" + "\n".join(lines) if lines else "")


def main() -> None:
    code_path, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    report: dict = {"ok": False}

    def finish() -> None:
        (out_dir / "report.json").write_text(json.dumps(report), encoding="utf-8")

    try:
        import cadquery as cq
    except Exception as exc:  # pragma: no cover - environment problem
        report["error"] = f"CadQuery is not available: {exc}"
        finish()
        return

    try:
        safe = {name: getattr(_builtins, name) for name in SAFE_BUILTINS if hasattr(_builtins, name)}
        safe["__import__"] = _safe_import
        namespace = {"__builtins__": safe, "__name__": "cadify_model", "cq": cq, "math": math}
        exec(compile(code_path.read_text(encoding="utf-8"), "model.py", "exec"), namespace)
        build = namespace.get("build")
        if not callable(build):
            raise RuntimeError("The program does not define build()")
        result = build()
    except BaseException as exc:  # noqa: BLE001 - report everything back to Claude
        report["error"] = _model_traceback(exc)
        finish()
        return

    try:
        if isinstance(result, cq.Workplane):
            solids = result.solids().vals()
        elif isinstance(result, cq.Shape):
            solids = result.Solids()
        else:
            raise RuntimeError(f"build() returned {type(result).__name__}, expected a cq.Workplane with one solid")
        if not solids:
            raise RuntimeError("build() produced no solid (check that every operation adds or cuts material)")
        shape = solids[0] if len(solids) == 1 else cq.Compound.makeCompound(solids)

        bb = shape.BoundingBox()
        diag = max(bb.DiagonalLength, 1e-6)
        report.update(
            solidCount=len(solids),
            valid=bool(shape.isValid()),
            faceCount=len(shape.Faces()),
            volumeMm3=round(shape.Volume(), 3),
            bbox={"x": round(bb.xlen, 4), "y": round(bb.ylen, 4), "z": round(bb.zlen, 4)},
        )
        if not report["valid"]:
            raise RuntimeError("The solid is not valid (BRepCheck failed); a boolean or fillet produced bad geometry")

        step = out_dir / "model.step"
        stl = out_dir / "model.stl"
        cq.exporters.export(shape, str(step))
        tolerance = min(0.05, max(0.005, diag / 5000))
        cq.exporters.export(shape, str(stl), tolerance=tolerance, angularTolerance=0.1)

        # Export validation: re-read what was written.
        reimported = cq.importers.importStep(str(step)).val()
        rb = reimported.BoundingBox()
        step_ok = bool(reimported.isValid()) and abs(rb.DiagonalLength - bb.DiagonalLength) <= 1e-3 * diag

        from meshcheck import check_mesh  # same directory as this file

        mesh = check_mesh(stl.read_bytes())
        (out_dir / "preview-mesh.stl").write_bytes(stl.read_bytes())
        report.update(
            ok=True,
            stepOk=step_ok,
            stepBytes=step.stat().st_size,
            stlBytes=stl.stat().st_size,
            mesh=mesh.to_json(),
        )
    except BaseException as exc:  # noqa: BLE001
        report["error"] = f"{type(exc).__name__}: {exc}"
    finish()


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent))
    main()
