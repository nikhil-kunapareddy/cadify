#!/usr/bin/env bash
# Builds a self-contained CADify.app for Apple Silicon and packages it as a
# .dmg. The app embeds a Python runtime with CadQuery and the CAD worker, so
# users only need an Anthropic API key.
#
# Usage:  scripts/release/build-macos.sh
# Output: build/release/CADify_<version>_aarch64.dmg and its .sha256
# Needs:  uv, Node/npm, Rust, Xcode command line tools, network access.
#
# The app is signed ad hoc (no Apple Developer ID), so Gatekeeper asks users
# to approve it on first launch.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PYTHON_VERSION="3.11.15"
VERSION="$(node -p 'require("./package.json").version')"
OUT="$ROOT/build/release"
RUNTIME="$OUT/runtime"
APP="$ROOT/src-tauri/target/release/bundle/macos/CADify.app"
DMG="$OUT/CADify_${VERSION}_aarch64.dmg"
RESOURCES="$APP/Contents/Resources"

step() { printf '\n==> %s\n' "$*"; }

[[ "$(uname -m)" == "arm64" ]] || { echo "Build on an Apple Silicon Mac." >&2; exit 1; }

step "Python $PYTHON_VERSION (python-build-standalone via uv)"
uv python install "$PYTHON_VERSION" --install-dir "$OUT/python-dist" --no-bin
BUILD_PY="$OUT/python-dist/cpython-${PYTHON_VERSION}-macos-aarch64-none/bin/python3"
rm -rf "$RUNTIME" && mkdir -p "$RUNTIME"
ditto "$(dirname "$(dirname "$BUILD_PY")")" "$RUNTIME/python"
rm -f "$RUNTIME"/python/lib/python3.*/EXTERNALLY-MANAGED
PY="$RUNTIME/python/bin/python3"

step "Worker packages (worker/requirements.lock)"
uv pip install --python "$PY" --link-mode copy -r worker/requirements.lock
# Viewer, plotting and NURBS extras that the headless build path never imports.
uv pip uninstall --python "$PY" numba llvmlite scipy matplotlib pillow contourpy kiwisolver cycler \
  trame trame-client trame-common trame-components trame-server trame-vtk trame-vuetify wslink msgpack

step "Worker sources"
# Allowlist: never copy worker/.env, the venv, tests or local tools.
mkdir -p "$RUNTIME/worker/cadify"
cp worker/cadify_worker.py "$RUNTIME/worker/"
cp worker/cadify/*.py "$RUNTIME/worker/cadify/"

step "Slim the runtime"
"$BUILD_PY" -E -s scripts/release/prune_runtime.py "$RUNTIME"

step "Smoke test: runtime"
"$PY" -B -E -s scripts/release/smoke_test.py "$RUNTIME/worker"

step "Tauri app (worker backend)"
VITE_CADIFY_GENERATION_BACKEND=worker npm run tauri -- build --bundles app

step "Embed the runtime and sign ad hoc"
rm -rf "$RESOURCES/python" "$RESOURCES/worker"
ditto "$RUNTIME/python" "$RESOURCES/python"
ditto "$RUNTIME/worker" "$RESOURCES/worker"
# Sync and Finder attributes (e.g. iCloud File Provider tags when the repo
# lives in ~/Documents) are not allowed inside a signed bundle.
xattr -cr "$APP"
codesign --force --sign - "$APP"
codesign --verify --strict "$APP"

step "Smoke test: inside CADify.app"
"$RESOURCES/python/bin/python3" -B -E -s scripts/release/smoke_test.py "$RESOURCES/worker"
# Secrets guard: no .env files, and no Anthropic key anywhere in the bundle.
if find "$RESOURCES" \( -name '.env' -o -name '.env.*' \) | grep -q . || grep -rlq 'sk-ant-api' "$RESOURCES"; then
  echo "Refusing to package: a secret is inside the app." >&2
  exit 1
fi
# Running the worker must not have written into the bundle.
codesign --verify --strict "$APP"

step "Disk image"
# Staged outside the repo: a synced folder (iCloud Documents) re-tags files
# as they are written, and those tags would break the signature in the image.
STAGE="$(mktemp -d)"
rm -f "$DMG"
ditto --noextattr --norsrc "$APP" "$STAGE/CADify.app"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "CADify $VERSION" -srcfolder "$STAGE" -fs HFS+ -format ULMO -ov "$DMG"
rm -rf "$STAGE"
(cd "$OUT" && shasum -a 256 "$(basename "$DMG")" > "$(basename "$DMG").sha256")

step "Verify the disk image"
MOUNT="$(mktemp -d)"
hdiutil attach -nobrowse -readonly -mountpoint "$MOUNT" "$DMG" > /dev/null
trap 'hdiutil detach "$MOUNT" -quiet || true' EXIT
codesign --verify --strict "$MOUNT/CADify.app"
# Copy out the way a user installs it (outside any synced folder).
VERIFY="$(mktemp -d)"
ditto "$MOUNT/CADify.app" "$VERIFY/CADify.app"
codesign --verify --strict "$VERIFY/CADify.app"
rm -rf "$VERIFY"
echo "  ok   signature valid in the image and after copying out"

step "Done"
du -sh "$APP" "$DMG"
cat "$DMG.sha256"
