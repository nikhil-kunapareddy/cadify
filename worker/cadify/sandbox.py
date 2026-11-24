"""Static checks and sandboxed execution for model-generated CadQuery code.

Defense in depth, since the code is written by a model:
1. AST checks reject imports other than cadquery/math, dangerous builtins,
   dunder attribute access and attributes that lead to the OS.
2. The code runs in a separate process (runner.py) with restricted
   builtins, a timeout and an environment without the API key.
3. On macOS the process runs under sandbox-exec: no network, and writes only
   inside the run's working directory and the system temp folders.
"""
from __future__ import annotations

import ast
import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

ALLOWED_IMPORTS = {"cadquery", "math"}
BLOCKED_NAMES = {
    "open", "exec", "eval", "compile", "__import__", "globals", "locals", "vars", "getattr", "setattr",
    "delattr", "input", "breakpoint", "memoryview", "help", "exit", "quit", "dir",
}
BLOCKED_ATTRS = {
    "os", "sys", "subprocess", "shutil", "socket", "builtins", "importlib", "ctypes", "pathlib", "io",
    "pickle", "marshal", "system", "popen", "spawn", "exporters", "importers", "occ_impl", "remove",
    "unlink", "rmtree", "write_text", "write_bytes",
}
RUN_TIMEOUT_S = 180


class UnsafeCodeError(Exception):
    def __init__(self, problems: list[str]):
        super().__init__("; ".join(problems))
        self.problems = problems


def check_code(code: str) -> None:
    """Raises UnsafeCodeError (or SyntaxError) if the code breaks the contract."""
    tree = ast.parse(code, filename="model.py")
    problems: list[str] = []
    defines_build = False
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] not in ALLOWED_IMPORTS:
                    problems.append(f"line {node.lineno}: import of '{alias.name}' is not allowed")
        elif isinstance(node, ast.ImportFrom):
            if node.level or (node.module or "").split(".")[0] not in ALLOWED_IMPORTS:
                problems.append(f"line {node.lineno}: import from '{node.module}' is not allowed")
        elif isinstance(node, ast.Name) and node.id in BLOCKED_NAMES:
            problems.append(f"line {node.lineno}: use of '{node.id}' is not allowed")
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("__"):
                problems.append(f"line {node.lineno}: dunder attribute '{node.attr}' is not allowed")
            elif node.attr in BLOCKED_ATTRS:
                problems.append(f"line {node.lineno}: attribute '{node.attr}' is not allowed")
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "build":
            defines_build = True
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            problems.append(f"line {node.lineno}: global/nonlocal statements are not allowed")
    if not defines_build:
        problems.append("the program must define a function named build()")
    if problems:
        raise UnsafeCodeError(problems)


@dataclass
class RunResult:
    ok: bool
    report: dict[str, Any]
    error: Optional[str] = None


def _sandbox_profile(work_dir: str) -> str:
    return f"""(version 1)
(allow default)
(deny network*)
(deny file-write*)
(allow file-write*
  (subpath "{work_dir}")
  (subpath "/private/var/folders")
  (subpath "/private/tmp")
  (literal "/dev/null")
  (literal "/dev/stdout")
  (literal "/dev/stderr")
  (literal "/dev/dtracehelper"))
"""


def run_code(code: str, work_dir: Path, attempt: int) -> RunResult:
    """Executes `code` in runner.py and returns its report."""
    run_dir = (work_dir / f"attempt-{attempt}").resolve()
    out_dir = run_dir / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    code_path = run_dir / "model.py"
    code_path.write_text(code, encoding="utf-8")

    runner = Path(__file__).with_name("runner.py")
    cmd = [sys.executable, str(runner), str(code_path), str(out_dir)]
    sandbox = shutil.which("sandbox-exec")
    if sandbox:
        cmd = [sandbox, "-p", _sandbox_profile(os.path.realpath(run_dir)), *cmd]

    env = {
        "PATH": "/usr/bin:/bin",
        "HOME": str(run_dir),
        "TMPDIR": str(run_dir),
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONNOUSERSITE": "1",
        "LANG": "en_US.UTF-8",
    }
    try:
        proc = subprocess.run(cmd, cwd=run_dir, env=env, capture_output=True, text=True, timeout=RUN_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        return RunResult(False, {}, f"Execution timed out after {RUN_TIMEOUT_S} s (the geometry may be too complex or stuck).")

    report_path = out_dir / "report.json"
    if not report_path.is_file():
        tail = (proc.stderr or "")[-1500:]
        return RunResult(False, {}, f"The code crashed the CAD kernel (exit {proc.returncode}).\n{tail}".strip())
    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["outDir"] = str(out_dir)
    if not report.get("ok"):
        return RunResult(False, report, report.get("error") or "Unknown execution error")
    return RunResult(True, report)
