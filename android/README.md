# yoman-avoda — Native WebView APK

A native Android **WebView** shell (not a TWA) that loads the app from bundled
assets: `file:///android_asset/index.html`. Replaces the PWABuilder TWA so that
image sharing attaches the file via a native bridge.

- **Package ID:** `com.yoman.avoda`
- **Loads:** `file:///android_asset/index.html` (offline-bundled; Supabase sync still uses the network)
- **Icon:** the new task-board+chart icon (`res/mipmap-xxxhdpi/ic_launcher.png`, copied from `icons/icon-512.png`)
- **WebView:** JavaScript, DOM storage (localStorage), DB, file access, mixed content allowed
- **Share bridge:** `window.AndroidShare.shareImage(base64, mime, appPackage)` →
  decodes to a cache file, exposes it via `FileProvider`, fires `ACTION_SEND`.
  Targeted package (`com.whatsapp` / `org.thoughtcrime.securesms`) when given,
  else a generic chooser. The website calls it from `sendWhatsApp()`/`sendSignal()`
  with a browser fallback when `window.AndroidShare` is absent.
- **File chooser:** `WebChromeClient.onShowFileChooser` wired for `<input type=file>`.

## Build (where Android SDK + Gradle exist — NOT in the agent environment)

```bash
# 1) bundle the current web app into assets/ (single source of truth = repo root)
./copy-assets.sh

# 2) build the unsigned release APK
cd android        # this folder (or open it in Android Studio)
gradle :app:assembleRelease        # or: ./gradlew :app:assembleRelease

# Unsigned APK output:
#   android/app/build/outputs/apk/release/app-release-unsigned.apk
```

## Sign with the PERMANENT key (required so it installs over previous builds)

```bash
zipalign -p -f 4 app-release-unsigned.apk yoman-aligned.apk
apksigner sign --ks ../signing/yoman.keystore --ks-key-alias yoman \
  --ks-pass pass:yoman123 --key-pass pass:yoman123 \
  --out yoman-avoda.apk yoman-aligned.apk
apksigner verify --print-certs yoman-avoda.apk    # SHA256 must be 29:F5:0B:...:F8:B5
```

(or run `../signing/sign-apk.sh app-release-unsigned.apk yoman-avoda.apk`)

## Notes
- The in-app auto-updater fetches GitHub `raw` and calls `location.reload()`. In a
  `file://` WebView, reload re-loads the bundled copy — so to ship new web code you
  rebuild the APK (re-run `copy-assets.sh` + build). The mechanism itself is unchanged.
- First install of a build signed with this permanent key requires a one-time
  uninstall of the old app (different signature). After that, installs are seamless.
