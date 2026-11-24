# CAD worker protocol (v1)

The Rust backend runs the CAD worker as a child process and relays its
progress to the UI. The worker does the actual work: send the drawing to
Claude, interpret views and dimensions, build the solid (e.g. CadQuery /
OpenCascade), validate it, and write STEP/STL files.

Backend side: `src-tauri/src/generation.rs`. Frontend client:
`src/services/tauri/generation.ts`. Reference worker: `worker/` (see
`worker/README.md`). Bridge test with a stub worker:
`src-tauri/src/ipc_tests.rs::worker_bridge_relays_events_answers_and_cancel`.

## Launch

| Source | Command |
| --- | --- |
| `CADIFY_WORKER_CMD` env var | e.g. `python3 /path/to/cadify_worker.py` |
| Bundled resource | `python3 <Resources>/worker/cadify_worker.py` |
| Debug builds only | `worker/.venv/bin/python worker/cadify_worker.py` in the repository |

If none of these exists, `generation_start` fails with `WORKER_UNAVAILABLE`.
The worker runs in its own process group, and cancelling kills the whole group,
including CAD subprocesses.

To use the worker instead of the mock backend, build the frontend with
`VITE_CADIFY_GENERATION_BACKEND=worker`.

Environment passed to the worker:

- `ANTHROPIC_API_KEY`: read from the macOS Keychain by the backend. It is never
  sent to the webview.
- `CADIFY_PROTOCOL_VERSION=1`.

The working directory is a fresh per-run temp folder. It is deleted when the run ends.

## Messages

JSON Lines in both directions: one JSON object per line, UTF-8.

### stdin → worker

First line, always:

```json
{
  "type": "start",
  "runId": "…",
  "drawingPath": "/…/project/mounting-bracket.pdf",
  "drawingFileName": "mounting-bracket.pdf",
  "pageCount": 2,
  "modelName": "Mounting bracket",
  "outputDir": "/…/project",
  "workDir": "/…/tmp/<runId>",
  "outputs": ["step", "stl"]
}
```

After a `clarification_required` event, the worker blocks on stdin for:

```json
{ "type": "answer", "answers": [{ "questionId": "slot-depth", "optionId": "through" }, { "questionId": "r", "value": 0 }] }
```

An answer with neither `optionId` nor `value` means "let CADify decide". The
worker must infer the value and report an `INFERRED_DIMENSIONS` warning.

### worker → stdout

Each line is a `GenerationEvent`. The TypeScript source of truth is
`src/types/generation.ts`.

| type | fields |
| --- | --- |
| `stage_started` | `stage`, `detail?` |
| `stage_progress` | `stage`, `progress?` (0–1, real progress only), `detail?` (e.g. "Fixing the model (attempt 2)") |
| `stage_completed` | `stage`, `detail?` (short facts, e.g. "17 dimensions") |
| `warning` | `warning: { code, message }` |
| `clarification_required` | `request: { id, summary, questions[] }` |
| `completed` | `result: GenerationResult` (terminal) |
| `failed` | `error: { code, message, detail? }`, `stage?` (terminal) |
| `cancelled` | (terminal) |

Stages, in order: `prepare`, `extract`, `analyze`, `identify`, `reconstruct`,
`solid`, `validate`, `export`.

Error codes the UI understands include `API_AUTH_FAILED`, `API_RATE_LIMITED`,
`INTERPRETATION_FAILED`, `INSUFFICIENT_DIMENSIONS`, `GEOMETRY_FAILED` and
`VALIDATION_FAILED`. See `src/types/errors.ts`.

### Output files

Before emitting `completed`, write these into `outputDir`:

- `model.step` if `step` was requested
- `model.stl` if `stl` was requested
- `preview-mesh.stl`, always (the viewport preview mesh)

Mark an artifact `validated: true` only after re-reading the exported file
successfully. `result.usage` (optional) reports Claude token usage: `model`,
`servedBy`, `requests`, `inputTokens`, `outputTokens`, `cacheReadTokens`,
`cacheWriteTokens`. The inspector shows it. The backend exposes a format for download only if it is marked
validated and the file exists on disk.

## Rules

- Never print anything except protocol lines to stdout. Use stderr for logs;
  the last 2 KB of stderr is attached to protocol failures.
- Report only facts the pipeline produced. Do not invent dimensions, features
  or progress percentages.
- Exit after a terminal event. If the process exits without one, the backend
  reports `WORKER_PROTOCOL`.
- Cancellation kills the process. Write outputs atomically (temp file + rename)
  so a cancel never leaves partial files.
