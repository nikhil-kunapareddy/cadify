"""JSON-lines protocol with the CADify backend (see docs/worker-protocol.md).

stdout carries protocol messages only. Anything else that prints (libraries,
stray debug output) is redirected to stderr so it cannot corrupt the stream.
"""
from __future__ import annotations

import json
import sys
import threading
from typing import Any, Callable, Optional

_protocol_out = sys.stdout
_lock = threading.Lock()


def claim_stdout() -> None:
    """Route ordinary prints to stderr; keep the real stdout for protocol lines."""
    global _protocol_out
    _protocol_out = sys.stdout
    sys.stdout = sys.stderr


def emit(event: dict[str, Any]) -> None:
    line = json.dumps(event, separators=(",", ":"), ensure_ascii=False)
    with _lock:
        _protocol_out.write(line + "\n")
        _protocol_out.flush()


def read_message() -> Optional[dict[str, Any]]:
    line = sys.stdin.readline()
    if not line:
        return None
    return json.loads(line)


def log(*parts: Any) -> None:
    print("[cadify-worker]", *parts, file=sys.stderr, flush=True)


Emit = Callable[[dict[str, Any]], None]
Read = Callable[[], Optional[dict[str, Any]]]


class WorkerError(Exception):
    """A failure reported to the UI as a `failed` event with an error code."""

    def __init__(self, code: str, message: str, detail: Optional[str] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.detail = detail

    def to_error(self) -> dict[str, Any]:
        error: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.detail:
            error["detail"] = self.detail[:2000]
        return error
