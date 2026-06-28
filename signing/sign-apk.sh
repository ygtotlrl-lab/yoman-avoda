#!/bin/bash
# Re-sign an APK with the PERMANENT yoman-avoda key (signing/yoman.keystore).
# Requires Android build-tools on PATH (zipalign + apksigner). Run wherever those exist.
# Usage: ./sign-apk.sh <unsigned.apk> [output.apk]
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
KS="$HERE/yoman.keystore"
IN="${1:?usage: sign-apk.sh <unsigned.apk> [output.apk]}"
OUT="${2:-yoman-signed.apk}"
ALIGNED="${OUT%.apk}-aligned.apk"

zipalign -p -f 4 "$IN" "$ALIGNED"
apksigner sign \
  --ks "$KS" --ks-key-alias yoman \
  --ks-pass pass:yoman123 --key-pass pass:yoman123 \
  --out "$OUT" "$ALIGNED"
rm -f "$ALIGNED"
apksigner verify --print-certs "$OUT"
echo "✅ Signed with permanent key -> $OUT"
