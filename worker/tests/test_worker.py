"""Worker tests. Run: worker/.venv/bin/python -m unittest discover -s worker/tests

The pipeline test replaces Claude with scripted responses but runs the real
CadQuery code in the real sandbox, so it covers everything except the API call.
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from cadify.claude import Usage  # noqa: E402
from cadify.meshcheck import check_mesh  # noqa: E402
from cadify.pipeline import Pipeline, StartMessage, envelope_error  # noqa: E402
from cadify.prompts import RESPONSE_SCHEMA  # noqa: E402
from cadify.protocol import WorkerError  # noqa: E402
from cadify.sandbox import UnsafeCodeError, check_code, run_code  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"
BRACKET_CODE = (FIXTURES / "bracket_model.py").read_text()
BRACKET_ANALYSIS = json.loads((FIXTURES / "bracket_analysis.json").read_text())
SAMPLE_PDF = ROOT.parent / "samples" / "mounting-bracket-drawing.pdf"
SAMPLE_STL = ROOT.parent / "samples" / "mounting-bracket.stl"


class SandboxChecks(unittest.TestCase):
    def test_accepts_contract_code(self):
        check_code(BRACKET_CODE)

    def test_rejects_escapes(self):
        cases = {
            "import os\ndef build(): pass": "import of 'os'",
            "import cadquery as cq\ndef build():\n    open('/tmp/x', 'w')": "'open'",
            "import cadquery as cq\ndef build():\n    return ().__class__": "dunder",
            "import cadquery as cq\ndef build():\n    return cq.occ_impl.exporters": "occ_impl",
            "from subprocess import run\ndef build(): pass": "subprocess",
            "import cadquery as cq\nresult = 1": "build()",
        }
        for code, expected in cases.items():
            with self.subTest(code=code):
                with self.assertRaises(UnsafeCodeError) as ctx:
                    check_code(code)
                self.assertIn(expected, str(ctx.exception))


class Schemas(unittest.TestCase):
    def test_every_object_is_closed_and_fully_required(self):
        def walk(node):
            if isinstance(node, dict):
                if node.get("type") == "object":
                    self.assertIs(node.get("additionalProperties"), False)
                    self.assertEqual(sorted(node["required"]), sorted(node["properties"]))
                for value in node.values():
                    walk(value)
            elif isinstance(node, list):
                for value in node:
                    walk(value)

        walk(RESPONSE_SCHEMA)


class MeshCheck(unittest.TestCase):
    def test_sample_mesh_is_watertight(self):
        report = check_mesh(SAMPLE_STL.read_bytes())
        self.assertGreater(report.triangles, 1000)
        self.assertTrue(report.watertight)

    def test_missing_triangle_opens_edges(self):
        data = SAMPLE_STL.read_bytes()
        count = int.from_bytes(data[80:84], "little")
        holed = data[:80] + (count - 1).to_bytes(4, "little") + data[84 + 50 :]
        report = check_mesh(holed)
        self.assertFalse(report.watertight)
        self.assertEqual(report.open_edges, 3)

    def test_envelope_is_orientation_agnostic(self):
        expected = {"length_mm": 120, "width_mm": 80, "height_mm": 70}
        self.assertAlmostEqual(envelope_error({"x": 80, "y": 120, "z": 70}, expected), 0.0)
        self.assertAlmostEqual(envelope_error({"x": 132, "y": 80, "z": 70}, expected), 0.1)


class Runner(unittest.TestCase):
    def test_builds_validates_and_exports_bracket(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = run_code(BRACKET_CODE, Path(tmp), 1)
            self.assertTrue(result.ok, result.error)
            r = result.report
            self.assertTrue(r["valid"])
            self.assertEqual(r["solidCount"], 1)
            self.assertAlmostEqual(r["bbox"]["x"], 120, delta=0.1)
            self.assertAlmostEqual(r["bbox"]["y"], 80, delta=0.1)
            self.assertAlmostEqual(r["bbox"]["z"], 70, delta=0.1)
            self.assertTrue(r["stepOk"])
            self.assertTrue(r["mesh"]["watertight"])
            for name in ("model.step", "model.stl", "preview-mesh.stl"):
                self.assertTrue((Path(r["outDir"]) / name).is_file())

    def test_reports_errors_with_model_line(self):
        code = "import cadquery as cq\ndef build():\n    return cq.Workplane('XY').box(10, 10, 10).fillet(50)\n"
        with tempfile.TemporaryDirectory() as tmp:
            result = run_code(code, Path(tmp), 1)
        self.assertFalse(result.ok)
        self.assertIn("line 3", result.error)

    def test_runtime_import_guard(self):
        # Bypasses the static check to prove the runtime layer also blocks imports.
        code = "def build():\n    import socket\n"
        with tempfile.TemporaryDirectory() as tmp:
            result = run_code(code, Path(tmp), 1)
        self.assertFalse(result.ok)
        self.assertIn("not allowed", result.error)


class FakeSession:
    """Scripted stand-in for ClaudeSession."""

    def __init__(self, analysis, codes):
        self.analysis = analysis
        self.codes = list(codes)
        self.fix_problems: list[str] = []
        self.clarifications = None
        self.usage = Usage(model="fake")

    def analyze(self, pdf, file_name, page_count):
        assert pdf.startswith(b"%PDF-")
        return self.analysis

    def write_code(self, clarifications):
        self.clarifications = clarifications
        return {"code": self.codes.pop(0), "notes": ""}

    def fix_code(self, problem, attempt, max_attempts):
        self.fix_problems.append(problem)
        return {"code": self.codes.pop(0), "notes": ""}


class PipelineEndToEnd(unittest.TestCase):
    def run_pipeline(self, analysis, codes, answers):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        start = StartMessage.parse(
            {
                "type": "start",
                "runId": "run-123456789",
                "drawingPath": str(SAMPLE_PDF),
                "drawingFileName": SAMPLE_PDF.name,
                "pageCount": 2,
                "modelName": "Bracket",
                "outputDir": str(root / "project"),
                "workDir": str(root / "work"),
                "outputs": ["step", "stl"],
            }
        )
        events: list[dict] = []
        inbox = [{"type": "answer", "answers": answers}]
        session = FakeSession(analysis, codes)
        pipeline = Pipeline(start, session, events.append, lambda: inbox.pop(0) if inbox else None)
        return pipeline, session, events, root

    def test_clarifies_fixes_and_exports(self):
        broken = BRACKET_CODE.replace("return body", "raise ValueError('fillet radius too large')")
        pipeline, session, events, root = self.run_pipeline(BRACKET_ANALYSIS, [broken, BRACKET_CODE], [{"questionId": "slot-depth"}])
        result = pipeline.run()

        started = [e["stage"] for e in events if e["type"] == "stage_started"]
        self.assertEqual(started, ["prepare", "extract", "analyze", "identify", "reconstruct", "solid", "validate", "export"])
        clar = next(e for e in events if e["type"] == "clarification_required")
        self.assertEqual(clar["request"]["questions"][0]["options"][0]["id"], "through")
        self.assertIn("best judgment", session.clarifications)
        self.assertIn("fillet radius too large", session.fix_problems[0])
        self.assertTrue(any(e["type"] == "stage_progress" for e in events))

        self.assertEqual(result["backend"], "worker")
        self.assertAlmostEqual(result["dimensions"]["length"], 120, delta=0.1)
        self.assertEqual([a["format"] for a in result["artifacts"]], ["step", "stl"])
        self.assertTrue(all(a["validated"] for a in result["artifacts"]))
        self.assertEqual(result["validation"]["watertight"]["status"], "pass")
        self.assertEqual(result["validation"]["dimensionConsistency"]["status"], "warn")  # one inferred answer
        self.assertIn("INFERRED_DIMENSIONS", [w["code"] for w in result["warnings"]])
        self.assertEqual(sum(f["count"] for f in result["features"]), 15)
        for name in ("model.step", "model.stl", "preview-mesh.stl", "model.py"):
            self.assertTrue((root / "project" / name).is_file())
        self.assertIn("def build", (root / "project" / "model.py").read_text())
        json.dumps(result)  # must be serializable for the protocol

    def test_insufficient_dimensions(self):
        analysis = dict(BRACKET_ANALYSIS, can_build=False, missing_information="Wall height is not dimensioned.")
        pipeline, *_ = self.run_pipeline(analysis, [], [])
        with self.assertRaises(WorkerError) as ctx:
            pipeline.run()
        self.assertEqual(ctx.exception.code, "INSUFFICIENT_DIMENSIONS")
        self.assertEqual(pipeline.state.stage, "identify")

    def test_not_a_drawing(self):
        pipeline, *_ = self.run_pipeline(dict(BRACKET_ANALYSIS, is_engineering_drawing=False), [], [])
        with self.assertRaises(WorkerError) as ctx:
            pipeline.run()
        self.assertEqual(ctx.exception.code, "INTERPRETATION_FAILED")


@unittest.skipUnless(Path("/usr/bin/sandbox-exec").exists(), "macOS sandbox-exec not available")
class OsSandbox(unittest.TestCase):
    """The OS layer must hold even if Python-level restrictions were bypassed."""

    def run_sandboxed(self, script: str, run_dir: Path):
        import os
        import subprocess

        from cadify.sandbox import _sandbox_profile

        profile = _sandbox_profile(os.path.realpath(run_dir))
        return subprocess.run(["/usr/bin/sandbox-exec", "-p", profile, sys.executable, "-c", script], capture_output=True, text=True)

    def test_blocks_writes_outside_run_dir_and_network(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as outside, tempfile.TemporaryDirectory() as run_dir:
            target = Path(outside) / "escaped.txt"
            proc = self.run_sandboxed(f"open({str(target)!r}, 'w').write('x')", Path(run_dir))
            self.assertNotEqual(proc.returncode, 0)
            self.assertFalse(target.exists())

            inside = Path(run_dir) / "ok.txt"
            self.assertEqual(self.run_sandboxed(f"open({str(inside)!r}, 'w').write('x')", Path(run_dir)).returncode, 0)

            net = self.run_sandboxed("import socket; socket.create_connection(('1.1.1.1', 443), timeout=3)", Path(run_dir))
            self.assertNotEqual(net.returncode, 0)


class EntryPoint(unittest.TestCase):
    def test_protocol_and_offline_error(self):
        """Runs the real worker process; the API points at a dead local port, so nothing leaves the machine."""
        import os
        import subprocess

        with tempfile.TemporaryDirectory() as tmp:
            start = {
                "type": "start",
                "runId": "smoke-1",
                "drawingPath": str(SAMPLE_PDF),
                "drawingFileName": SAMPLE_PDF.name,
                "pageCount": 2,
                "modelName": "Bracket",
                "outputDir": str(Path(tmp) / "project"),
                "workDir": str(Path(tmp) / "work"),
                "outputs": ["step"],
            }
            env = dict(os.environ, ANTHROPIC_API_KEY="sk-ant-test-not-a-real-key-000000", ANTHROPIC_BASE_URL="http://127.0.0.1:9")
            proc = subprocess.run(
                [sys.executable, str(ROOT / "cadify_worker.py")],
                input=json.dumps(start) + "\n",
                capture_output=True,
                text=True,
                env=env,
                timeout=120,
            )
        events = [json.loads(line) for line in proc.stdout.splitlines()]  # every stdout line must be JSON
        self.assertEqual([e["stage"] for e in events if e["type"] == "stage_started"], ["prepare", "extract", "analyze"])
        self.assertEqual(events[-1]["type"], "failed")
        self.assertEqual(events[-1]["error"]["code"], "NETWORK_OFFLINE")
        self.assertEqual(events[-1]["stage"], "analyze")
        self.assertEqual(proc.returncode, 1)


if __name__ == "__main__":
    unittest.main()
