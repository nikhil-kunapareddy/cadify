# CADify

AI-powered engineering drawing to 3D CAD conversion. macOS desktop app built
with Tauri 2, React 19, TypeScript, Tailwind CSS v4, Three.js and pdf.js.

**Workflow:** Upload PDF drawing → Generate 3D model → Preview → Export STEP / STL

## Download

Get the `.dmg` from [Releases](https://github.com/nikhil-kunapareddy/cadify/releases/latest).
It runs on Apple Silicon Macs with macOS 13 or later.

1. Open the `.dmg` and drag CADify to Applications.
2. Clear the download flag once. The app is signed ad hoc rather than notarized, so macOS blocks its first launch:
   ```bash
   xattr -dr com.apple.quarantine /Applications/CADify.app
   ```
3. Open CADify, go to **Settings → AI Configuration**, and paste an Anthropic API key. It is stored in the macOS Keychain.

The app bundles Python 3.11, CadQuery and the CAD worker, so there is nothing else
to install. Generation uses Claude Opus 5.5. The sample drawing cost about $0.22.

## Run

```bash
npm install
npm run tauri dev        # desktop app with the mock generation backend
npm run tauri:worker     # desktop app with the real CAD worker (see worker/README.md)
npm run dev              # browser preview at http://localhost:1420 (in-memory, no native APIs)
scripts/release/build-macos.sh   # self-contained release .dmg (embeds Python + CadQuery)
```

Requires Node 22+, Rust 1.80+, and the Xcode Command Line Tools.

## Checks

```bash
npm run typecheck        # TypeScript (strict)
npm run lint             # ESLint, including React Compiler hook rules
npm test                 # Vitest: formatting, errors, PDF validation, mock pipeline
cd src-tauri && cargo test && cargo clippy --all-targets
cd worker && .venv/bin/python -m unittest discover -s tests   # CAD worker
```

The Rust tests include end-to-end IPC tests (`src-tauri/src/ipc_tests.rs`).
They invoke commands with the same payloads the webview sends, against a mock
Tauri runtime.

## What is real and what is mocked

| Area | Status |
| --- | --- |
| PDF upload, validation, rendering, zoom, pages, thumbnails | Real (pdf.js) |
| Projects, history, rename, delete (to Trash), reveal in Finder | Real (SQLite + project folders) |
| API key storage | Real (macOS Keychain via `security-framework`) |
| API key validation | Real (`GET /v1/models` from Rust) |
| 3D viewer | Real (Three.js; STL parsed in a Web Worker) |
| Export with native save dialogs | Real (only validated formats) |
| Generation (`npm run tauri dev`) | **Mock.** It plays back the stages and returns a bundled sample bracket. |
| Generation (`npm run tauri:worker` and the release `.dmg`) | **Real:** Claude reads the PDF and writes CadQuery code; the worker builds, validates and exports the solid in a sandbox. |
| Worker bridge (spawn, events, answers, cancel) | Real, tested with a stub worker |

The mock backend is labeled in the status bar, the generation view and the
inspector, so its output is never mistaken for a model of your drawing.
Switch scenarios (clarification, failures, warnings) in **Settings →
Developer**.

Set up and try the real worker: [worker/README.md](worker/README.md).
Protocol: [docs/worker-protocol.md](docs/worker-protocol.md).

## Layout

```
src/
├── app/            App root and routes (state-based views)
├── components/
│   ├── ui/         Design system: Button, IconButton, Tooltip, Dropdown, Dialog, Toaster,
│   │               ProgressIndicator, SegmentedControl, Input, Badge, Panel, States
│   ├── layout/     AppShell, AppHeader (workflow stepper), StatusBar, dialogs
│   ├── upload/     EmptyWorkspace, FileUploader, illustration
│   ├── drawing/    Left Drawing panel (document card, page thumbnails)
│   ├── pdf/        PDFViewer, PdfToolbar, PageThumbnail
│   ├── viewer/     ModelViewer, ViewerToolbar, viewerEngine (Three.js), STL worker
│   ├── inspector/  InspectorPanel, sections, ExportCard
│   ├── generation/ GenerationView, StageList, ClarificationPanel
│   ├── settings/   Settings view: AI key, appearance, storage, about, developer
│   └── history/    ProjectsView, RecentProjectsDialog, rename/delete dialogs
├── services/
│   ├── contracts.ts   Typed service interfaces (UI depends only on these)
│   ├── tauri/         Production implementations (IPC to Rust)
│   ├── browser/       In-memory adapters for the browser preview
│   ├── mock/          Mock generation backend and sample assets
│   └── pdf/           pdf.js wrapper
├── stores/         Zustand stores (project, generation, export, credentials, ui, theme…)
├── hooks/  types/  styles/ (design tokens)  utils/  config/
src-tauri/src/      projects.rs, files.rs, exports.rs, credentials.rs, settings.rs,
                    generation.rs (worker bridge), db.rs, ipc_tests.rs
worker/             CAD worker (Python): Claude + CadQuery pipeline, sandbox, tests
samples/            Sample drawing PDF + STEP/STL, and the CadQuery script that builds them
```

## Data locations

- Projects: `~/Documents/CADify Projects/<name>-<id>/` (configurable in Settings → Storage)
- Database: `~/Library/Application Support/com.cadify.desktop/cadify.db`
- API key: Keychain item `com.cadify.desktop` / `anthropic-api-key`
- Temporary files: `~/Library/Caches/com.cadify.desktop/tmp`

## Regenerating the sample assets

```bash
uv venv .venv && uv pip install --python .venv/bin/python cadquery matplotlib
.venv/bin/python samples/scripts/build_sample.py samples
cp samples/mounting-bracket.{stl,step,meta.json} src/services/mock/assets/
```

## License

MIT. See [LICENSE](LICENSE).
