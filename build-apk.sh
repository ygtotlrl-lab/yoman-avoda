#!/bin/bash
# ==============================================
# יומן עבודה - PWA + APK Build Script
# הרץ את הסקריפט הזה במחשב שלך
# ==============================================

set -e

REPO="ygtotlrl-lab/yoman-avoda"
PAGES_URL="https://ygtotlrl-lab.github.io/yoman-avoda"

# Ask for token
echo "Enter your GitHub token:"
read -s TOKEN
echo ""

echo "========================================="
echo "  יומן עבודה - PWA & APK Setup"
echo "========================================="
echo ""

# ---- Step 1: Enable GitHub Pages ----
echo "[1/4] Enabling GitHub Pages..."
PAGES_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "https://api.github.com/repos/$REPO/pages" \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Content-Type: application/json" \
  -d '{"source":{"branch":"main","path":"/"}}')

if [ "$PAGES_RESPONSE" = "201" ] || [ "$PAGES_RESPONSE" = "409" ]; then
  echo "   ✅ GitHub Pages enabled!"
  echo "   URL: $PAGES_URL"
else
  echo "   ⚠️  Response code: $PAGES_RESPONSE"
  echo "   You may need to enable Pages manually in repo Settings."
fi

echo ""
echo "[2/4] Waiting for GitHub Pages deployment (60 seconds)..."
sleep 60

# Verify Pages is live
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$PAGES_URL/manifest.json")
if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ Site is live!"
else
  echo "   ⏳ Site may still be deploying. Check: $PAGES_URL"
  echo "   Continuing anyway..."
fi

# ---- Step 2: Install Bubblewrap ----
echo ""
echo "[3/4] Installing Bubblewrap for APK build..."

if ! command -v node &> /dev/null; then
  echo "   ❌ Node.js not found! Install from https://nodejs.org"
  exit 1
fi

npm install -g @nicolo-ribaudo/nicolo-nicola-bubblewrap 2>/dev/null || \
npm install -g @nicolo-nicola/nicolo-bubblewrap 2>/dev/null || \
npm install -g nicolo-bubblewrap 2>/dev/null || \
echo "   ℹ️  Bubblewrap not available via npm. Using PWABuilder instead."

# ---- Step 3: Build APK ----
echo ""
echo "[4/4] Building APK..."
echo ""

# Create bubblewrap config directory
mkdir -p /tmp/yoman-apk
cd /tmp/yoman-apk

# Check if bubblewrap is available
if command -v bubblewrap &> /dev/null; then
  echo "   Using Bubblewrap to build APK..."
  bubblewrap init --manifest="$PAGES_URL/manifest.json"
  bubblewrap build
  echo ""
  echo "   ✅ APK built! Check /tmp/yoman-apk/"
else
  echo "========================================="
  echo "  APK Build - Use PWABuilder (easiest)"
  echo "========================================="
  echo ""
  echo "  Bubblewrap is not available."
  echo "  Use PWABuilder instead:"
  echo ""
  echo "  1. Open: https://www.pwabuilder.com"
  echo "  2. Enter: $PAGES_URL"
  echo "  3. Click 'Package for stores' → Android"
  echo "  4. Download the APK!"
  echo ""
  echo "  Or use the Android Studio method below."
  echo ""
fi

echo ""
echo "========================================="
echo "  Summary"
echo "========================================="
echo ""
echo "  PWA URL: $PAGES_URL/%D7%99%D7%95%D7%9E%D7%9F%20%D7%A2%D7%91%D7%95%D7%93%D7%94.html"
echo ""
echo "  The PWA can be installed directly from Chrome:"
echo "  → Open the URL on Android"
echo "  → Tap the browser menu (⋮)"
echo "  → Select 'Add to Home Screen' or 'Install app'"
echo ""
echo "  For APK distribution, use PWABuilder.com"
echo "========================================="
