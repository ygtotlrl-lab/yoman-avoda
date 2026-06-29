#!/bin/bash
# Copy the live web app into the APK's assets/ (single source of truth = repo root).
# Run from the repo root (or anywhere): it resolves paths relative to this script.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
ASSETS="$HERE/app/src/main/assets"

rm -rf "$ASSETS"
mkdir -p "$ASSETS/icons"
cp "$ROOT/index.html"     "$ASSETS/index.html"
cp "$ROOT/manifest.json"  "$ASSETS/manifest.json"
cp "$ROOT/sw.js"          "$ASSETS/sw.js"
cp "$ROOT/icons/"*        "$ASSETS/icons/" 2>/dev/null || true

echo "Copied web assets -> $ASSETS"
ls -la "$ASSETS"
