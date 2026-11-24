"""CADify CAD worker entry point.

Launched by the CADify backend (src-tauri/src/generation.rs). Reads one
`start` message on stdin, streams GenerationEvents on stdout, and exits after
a terminal event. See docs/worker-protocol.md.

Environment:
  ANTHROPIC_API_KEY  provided by the backend from the macOS Keychain
  CADIFY_MODEL       optional model override (default: claude-opus-5-5)
  CADIFY_EFFORT      optional effort level (default: high)
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from cadify.protocol import WorkerError, claim_stdout, emit, log, read_message  # noqa: E402


def main() -> int:
    claim_stdout()
    stage = None
    try:
        start_msg = read_message()
        if start_msg is None:
            raise WorkerError("WORKER_PROTOCOL", "No start message received")

        try:
            import anthropic  # noqa: F401
            import cadquery  # noqa: F401
        except ImportError as exc:
            raise WorkerError(
                "WORKER_UNAVAILABLE",
                "The CAD worker's Python environment is incomplete",
                f"{exc}. Run: uv pip install -r worker/requirements.txt",
            ) from exc

        import anthropic

        from cadify.claude import DEFAULT_MODEL, ClaudeSession, map_api_error
        from cadify.pipeline import Pipeline, StartMessage

        start = StartMessage.parse(start_msg)
        model = os.environ.get("CADIFY_MODEL", DEFAULT_MODEL)
        effort = os.environ.get("CADIFY_EFFORT", "high")
        log(f"run {start.run_id} · model {model} · effort {effort}")

        session = ClaudeSession(anthropic.Anthropic(max_retries=3), model=model, effort=effort)
        pipeline = Pipeline(start, session, emit, read_message)
        try:
            result = pipeline.run()
        except anthropic.APIError as exc:
            stage = pipeline.state.stage
            raise map_api_error(exc) from exc
        except WorkerError:
            stage = pipeline.state.stage
            raise
        u = result["usage"]
        log(f"done · {u['requests']} requests · in {u['inputTokens']} (+{u['cacheReadTokens']} cached) · out {u['outputTokens']}")
        emit({"type": "completed", "result": result})
        return 0
    except WorkerError as err:
        event = {"type": "failed", "error": err.to_error()}
        if stage:
            event["stage"] = stage
        emit(event)
        return 1
    except Exception as exc:  # noqa: BLE001 - never die silently
        log("unexpected error:", repr(exc))
        emit({"type": "failed", "error": {"code": "UNKNOWN", "message": "The CAD worker hit an unexpected error", "detail": repr(exc)[:2000]}})
        return 1


if __name__ == "__main__":
    sys.exit(main())
