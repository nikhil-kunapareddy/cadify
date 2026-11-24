"""Run the CAD worker pipeline on a PDF from the terminal (no app needed).

    worker/.venv/bin/python worker/try_drawing.py samples/mounting-bracket-drawing.pdf
    ... --model claude-haiku-5-5 --effort medium --out ./out

The API key is read from the environment, or from worker/.env
(ANTHROPIC_API_KEY=...). Variables already set in the shell win.

Clarification questions are asked interactively. Prints the measured token
usage and an estimated cost at list prices.
"""
from __future__ import annotations

import argparse
import json
import os
import stat
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))

import anthropic  # noqa: E402

from cadify.claude import DEFAULT_MODEL, ClaudeSession, map_api_error  # noqa: E402
from cadify.pipeline import Pipeline, StartMessage  # noqa: E402
from cadify.protocol import WorkerError  # noqa: E402

# USD per million tokens (input, output, cache read). List prices, Nov 2026;
# check https://platform.claude.com/docs/en/about-claude/pricing before relying on them.
PRICES = {
    "claude-opus-5-5": (4.00, 20.00, 0.20),
    "claude-sonnet-5-5": (2.00, 10.00, 0.10),
    "claude-haiku-5-5": (0.10, 0.50, None),
}


ENV_FILE = Path(__file__).resolve().parent / ".env"


def load_env_file(path: Path = ENV_FILE) -> None:
    """Loads KEY=VALUE lines into os.environ without overriding existing values."""
    if not path.is_file():
        return
    if path.stat().st_mode & (stat.S_IRWXG | stat.S_IRWXO):
        print(f"warning: {path} is readable by other users; run: chmod 600 {path}", file=sys.stderr)
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.removeprefix("export ").partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and value and key not in os.environ:
            os.environ[key] = value


class Terminal:
    def __init__(self) -> None:
        self.pending: Optional[dict[str, Any]] = None

    def emit(self, event: dict[str, Any]) -> None:
        kind = event["type"]
        if kind == "stage_started":
            print(f"  … {event['stage']}", file=sys.stderr)
        elif kind == "stage_completed":
            print(f"  ✓ {event['stage']}: {event.get('detail', '')}", file=sys.stderr)
        elif kind == "stage_progress":
            print(f"    {event.get('detail', '')}", file=sys.stderr)
        elif kind == "warning":
            print(f"  ! {event['warning']['message']}", file=sys.stderr)
        elif kind == "clarification_required":
            self.pending = event["request"]

    def read_message(self) -> Optional[dict[str, Any]]:
        request, self.pending = self.pending, None
        if request is None:
            return None
        print(f"\n{request['summary']}", file=sys.stderr)
        answers = []
        for q in request["questions"]:
            print(f"\n{q['prompt']}" + (f"  ({q['context']})" if q.get("context") else ""), file=sys.stderr)
            if q["kind"] == "choice":
                for i, opt in enumerate(q.get("options") or [], 1):
                    print(f"  {i}. {opt['label']}" + (f" - {opt['description']}" if opt.get("description") else ""), file=sys.stderr)
                raw = input("  choose a number (Enter = let CADify decide): ").strip()
                opts = q.get("options") or []
                if raw.isdigit() and 1 <= int(raw) <= len(opts):
                    answers.append({"questionId": q["id"], "optionId": opts[int(raw) - 1]["id"]})
                    continue
            else:
                hint = f" [suggested {q.get('suggestedValue')}]" if q.get("suggestedValue") is not None else ""
                raw = input(f"  value in mm{hint} (Enter = let CADify decide): ").strip()
                try:
                    answers.append({"questionId": q["id"], "value": float(raw)})
                    continue
                except ValueError:
                    pass
            answers.append({"questionId": q["id"]})
        print(file=sys.stderr)
        return {"type": "answer", "answers": answers}


def estimate_cost(usage: dict[str, Any]) -> Optional[float]:
    price = PRICES.get(usage["model"])
    if not price:
        return None
    inp, out, cached = price
    cached = cached if cached is not None else inp * 0.1
    # Cache writes bill at 1.25x input for the 5-minute TTL.
    return (
        usage["inputTokens"] * inp + usage["cacheWriteTokens"] * inp * 1.25 + usage["cacheReadTokens"] * cached + usage["outputTokens"] * out
    ) / 1_000_000


def main() -> int:
    load_env_file()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--model", default=os.environ.get("CADIFY_MODEL", DEFAULT_MODEL))
    parser.add_argument(
        "--effort", default=os.environ.get("CADIFY_EFFORT", "high"), choices=["low", "medium", "high", "xhigh", "max"]
    )
    parser.add_argument("--out", type=Path, default=None, help="output folder (default: ./cadify-output/<pdf name>)")
    args = parser.parse_args()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print(f"No API key found. Add it to {ENV_FILE}:\n  ANTHROPIC_API_KEY=sk-ant-...", file=sys.stderr)
        return 2
    if not args.pdf.is_file():
        print(f"File not found: {args.pdf}", file=sys.stderr)
        return 2

    out = args.out or Path("cadify-output") / args.pdf.stem
    terminal = Terminal()
    with tempfile.TemporaryDirectory() as work:
        start = StartMessage.parse(
            {
                "type": "start",
                "runId": str(uuid.uuid4()),
                "drawingPath": str(args.pdf.resolve()),
                "drawingFileName": args.pdf.name,
                "pageCount": max(1, args.pdf.read_bytes().count(b"/Type /Page") - args.pdf.read_bytes().count(b"/Type /Pages")),
                "modelName": args.pdf.stem,
                "outputDir": str(out.resolve()),
                "workDir": work,
                "outputs": ["step", "stl"],
            }
        )
        session = ClaudeSession(anthropic.Anthropic(max_retries=3), model=args.model, effort=args.effort)
        print(f"Generating {args.pdf.name} with {args.model} (effort {args.effort})\n", file=sys.stderr)
        try:
            result = Pipeline(start, session, terminal.emit, terminal.read_message).run()
        except anthropic.APIError as exc:
            err = map_api_error(exc)
            print(f"\nFailed: {err.code}: {err.message}\n{err.detail or ''}", file=sys.stderr)
            return 1
        except WorkerError as err:
            print(f"\nFailed: {err.code}: {err.message}\n{err.detail or ''}", file=sys.stderr)
            return 1
        finally:
            u = session.usage.to_json()
            cost = estimate_cost(u)
            print(
                f"\nClaude usage: {u['requests']} requests · {u['inputTokens']:,} input · {u['cacheReadTokens']:,} cached"
                f" · {u['cacheWriteTokens']:,} cache-write · {u['outputTokens']:,} output"
                + (f" · ≈ ${cost:.3f} at list price" if cost is not None else ""),
                file=sys.stderr,
            )

    (out / "result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    d = result["dimensions"]
    print(f"\nModel: {d['length']:.1f} × {d['width']:.1f} × {d['height']:.1f} mm · {len(result['features'])} feature groups")
    for name, check in result["validation"].items():
        print(f"  {check['status']:>4}  {name}: {check.get('detail', '')}")
    print(f"Files: {out}/model.step, model.stl, model.py (CadQuery source), result.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
