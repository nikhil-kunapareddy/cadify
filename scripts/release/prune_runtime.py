"""Slims the embedded Python runtime before it is copied into CADify.app.

Usage: python3 prune_runtime.py <runtime>
Run it with a Python other than the runtime's own: it rewrites the runtime's
native libraries, which must not be mapped into the running process.

1. Removes stdlib parts a headless worker never uses (tests, Tk, IDLE, headers).
2. Strips local symbols from every native library (about 40% of their size)
   and re-signs each one ad hoc, since Apple Silicon refuses modified code.
3. Precompiles all Python files (unchecked-hash .pyc): the app runs the
   worker with -B, so it never writes bytecode into its own bundle.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

STDLIB_REMOVE = ["test", "idlelib", "tkinter", "turtledemo", "turtle.py", "ensurepip", "lib2to3/tests"]
TOP_REMOVE = ["include", "share", "lib/pkgconfig"]
TOP_GLOBS = ["lib/tcl*", "lib/tk*", "lib/itcl*", "lib/thread*", "lib/tdbc*", "lib/libtcl*", "lib/libtk*"]


def rm(path: Path) -> None:
    if path.is_symlink() or path.is_file():
        path.unlink()
    elif path.is_dir():
        shutil.rmtree(path)


def tree_size(path: Path) -> int:
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file() and not f.is_symlink())


def main() -> None:
    runtime = Path(sys.argv[1]).resolve()
    python = runtime / "python"
    stdlib = next((python / "lib").glob("python3.*"))
    start = tree_size(python)

    # ---------------------------------------------------------------- stdlib
    for rel in STDLIB_REMOVE:
        rm(stdlib / rel)
    for so in (stdlib / "lib-dynload").glob("_tkinter*"):
        rm(so)
    for rel in TOP_REMOVE:
        rm(python / rel)
    for pattern in TOP_GLOBS:
        for path in python.glob(pattern):
            rm(path)
    for script in (python / "bin").iterdir():
        if not script.name.startswith("python") or script.name.endswith("-config"):
            rm(script)
    # Empty dotfile placeholders (lib-dynload/.empty, setuptools' .lock) get
    # Finder flags on an HFS+ disk image, which codesign rejects in a bundle.
    for dotfile in list(python.rglob(".*")):
        if dotfile.is_file() and not dotfile.is_symlink() and dotfile.stat().st_size == 0:
            rm(dotfile)

    # ---------------------------------------------------------------- symbols
    # Local symbols only: exported ones stay, so linking and dlsym still work.
    libs = [str(p) for p in python.rglob("*") if p.is_file() and not p.is_symlink() and p.suffix in {".so", ".dylib"}]
    for i in range(0, len(libs), 200):
        chunk = libs[i : i + 200]
        subprocess.run(["/usr/bin/strip", "-x", *chunk], check=True, stderr=subprocess.DEVNULL)
        subprocess.run(["/usr/bin/codesign", "--force", "--sign", "-", *chunk], check=True, stderr=subprocess.DEVNULL)

    # ---------------------------------------------------------------- bytecode
    for cache in list(python.rglob("__pycache__")):
        rm(cache)
    for target in (stdlib, runtime / "worker"):
        # Exit status is ignored: a few third-party files are deliberately
        # invalid Python (test data); the smoke test proves imports work.
        compile_cmd = [str(python / "bin" / "python3"), "-E", "-s", "-m", "compileall", "-q", "-j", "0"]
        subprocess.run([*compile_cmd, "--invalidation-mode", "unchecked-hash", str(target)], stdout=subprocess.DEVNULL)
    print(f"Runtime: {start / 1e6:.0f} MB -> {tree_size(python) / 1e6:.0f} MB ({len(libs)} native libraries stripped)")


if __name__ == "__main__":
    main()
