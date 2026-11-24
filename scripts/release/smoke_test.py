"""Checks an embedded worker runtime the same way the app will run it.

Usage: <runtime>/python/bin/python3 -B -E -s smoke_test.py <worker dir>

1. Packages import from the embedded runtime, not from another Python.
2. The real runner builds the fixture bracket under sandbox-exec.
3. The worker entry point speaks the protocol (API pointed at a dead port).
4. TLS to api.anthropic.com verifies (an invalid key must get a 401).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "worker" / "tests" / "fixtures" / "bracket_model.py"
SAMPLE_PDF = ROOT / "samples" / "mounting-bracket-drawing.pdf"


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"  {'ok  ' if ok else 'FAIL'} {label}{f' ({detail})' if detail else ''}")
    if not ok:
        sys.exit(1)


def main() -> None:
    worker = Path(sys.argv[1]).resolve()
    sys.path.insert(0, str(worker))

    import anthropic
    import cadquery

    prefix = Path(sys.prefix).resolve()
    for module in (cadquery, anthropic):
        check(f"{module.__name__} from embedded runtime", Path(module.__file__).resolve().is_relative_to(prefix), module.__file__)

    from cadify.sandbox import run_code

    with tempfile.TemporaryDirectory() as tmp:
        result = run_code(FIXTURE.read_text(), Path(tmp), 1)
        check("sandboxed build", result.ok, result.error or "")
        r = result.report
        bbox = r["bbox"]
        check("bracket envelope 120 x 80 x 70", all(abs(bbox[k] - v) < 0.1 for k, v in {"x": 120, "y": 80, "z": 70}.items()), str(bbox))
        check("STEP written and watertight STL", r["stepOk"] and r["mesh"]["watertight"])

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
        env = dict(os.environ, ANTHROPIC_API_KEY="sk-ant-smoke-test-not-a-real-key", ANTHROPIC_BASE_URL="http://127.0.0.1:9")
        proc = subprocess.run(
            [sys.executable, "-B", "-E", "-s", str(worker / "cadify_worker.py")],
            input=json.dumps(start) + "\n",
            capture_output=True,
            text=True,
            env=env,
            timeout=120,
        )
        events = [json.loads(line) for line in proc.stdout.splitlines()]
        last = events[-1] if events else {}
        check("worker protocol", last.get("type") == "failed" and last["error"]["code"] == "NETWORK_OFFLINE", proc.stderr[-300:])

    client = anthropic.Anthropic(api_key="sk-ant-smoke-test-not-a-real-key", max_retries=0)
    try:
        client.models.list()
        check("TLS to api.anthropic.com", False, "an invalid key was accepted")
    except anthropic.AuthenticationError:
        check("TLS to api.anthropic.com", True)
    except anthropic.APIConnectionError as exc:
        check("TLS to api.anthropic.com", False, repr(exc.__cause__ or exc))


if __name__ == "__main__":
    main()
