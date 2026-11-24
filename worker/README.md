# CADify CAD worker

Turns a PDF engineering drawing into a solid model:

```
PDF ──▶ Claude (interpret views, dimensions, notes) ──▶ Claude (write CadQuery code)
    ──▶ CadQuery / OpenCascade in a sandbox ──▶ validate ──▶ STEP + STL + preview mesh
                      ▲                        │
                      └── error or wrong size ◀┘   up to 3 fix rounds
```

One conversation per run: the PDF and system prompt are a cached prefix, so
the code and fix turns re-read them cheaply. Dimensions, validity, watertightness
and file checks come from the CAD kernel, not from the model.

## Setup

```bash
uv venv --python 3.11 worker/.venv
uv pip install --python worker/.venv/bin/python -r worker/requirements.txt
```

CadQuery wheels currently need Python 3.10–3.12.

## Try it on a drawing (terminal)

Put your key in `worker/.env` (created from `.env.example`, `chmod 600`, git-ignored):

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

Then:

```bash
worker/.venv/bin/python worker/try_drawing.py samples/mounting-bracket-drawing.pdf
# cheaper / faster:
worker/.venv/bin/python worker/try_drawing.py drawing.pdf --model claude-haiku-5-5 --effort medium
```

Only this terminal tool reads `worker/.env`. The app never does: it passes the
Keychain key to the worker.

It asks clarification questions in the terminal, writes `model.step`,
`model.stl` and `result.json` to `./cadify-output/<name>/`, and prints the
token usage plus an estimated cost.

## Use it from the app

```bash
npm run tauri:worker
```

Debug builds find `worker/.venv` automatically. The API key comes from the
Keychain (Settings → AI Configuration). Optional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `CADIFY_MODEL` | `claude-opus-5-5` | e.g. `claude-sonnet-5-5`, `claude-haiku-5-5` |
| `CADIFY_EFFORT` | `high` | `low` … `max` |
| `CADIFY_WORKER_CMD` | (auto) | override the worker command entirely |

On Opus 5.5 and Sonnet 5.5, requests opt into server-side refusal fallbacks
(`fallbacks: "default"`). A false-positive safety decline is retried on a
fallback model instead of failing the run.

## Safety of generated code

The code Claude writes is executed. Before it runs, it goes through three layers:

1. **Static check** (`sandbox.check_code`): only `cadquery` and `math` imports. Blocked builtins
   (`open`, `exec`, `eval`, …), dunder attributes, and OS-reaching attributes.
2. **Separate process** (`runner.py`): restricted builtins, a 180 s timeout, and an environment
   without the API key.
3. **macOS sandbox** (`sandbox-exec`): no network, and writes only inside the run's working folder.

This is defense in depth, not a hard security boundary. Don't point it at
untrusted drawings until it runs in a stronger sandbox (a VM or container).

## Tests

```bash
cd worker && .venv/bin/python -m unittest discover -s tests -v
```

The pipeline test scripts Claude's replies (including a broken first attempt
and a clarification) but runs the real CadQuery code in the real sandbox. No
test calls the Anthropic API.

## Layout

| File | Role |
| --- | --- |
| `cadify_worker.py` | Entry point: protocol in, events out |
| `cadify/pipeline.py` | The 8 stages, clarification, fix loop, result |
| `cadify/claude.py` | The Claude conversation (structured outputs, caching, fallbacks) |
| `cadify/prompts.py` | System prompt, per-turn instructions, JSON schemas |
| `cadify/sandbox.py` | Static checks and sandboxed execution |
| `cadify/runner.py` | Child process: build, validate, export |
| `cadify/meshcheck.py` | STL parsing and watertightness |
| `try_drawing.py` | Terminal tool for trying drawings |
