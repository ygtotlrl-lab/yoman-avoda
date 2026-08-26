package com.yoman.avoda;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.core.content.FileProvider;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * The yoman-avoda shell — identity, plus the one bridge in the organisation.
 *
 * <p>All of the shell behaviour lives in {@link ShellActivity}, which is
 * byte-for-byte identical in the four repos. What is unique here is the
 * origin-restricted share bridge, and it is unique because only this page calls
 * navigator.share with an image: html2canvas produces a JPEG in the page, and
 * the shell writes it to cache, exposes it through FileProvider and fires
 * ACTION_SEND.
 *
 * <p>⚠️ זו החריגה **המדודה** של המעטפת (סבב 40, ומעוגנת בחילוץ של סבב 41):
 * שלוש האחיות אינן מכריזות גשר, אינן מכריזות \`FileProvider\`, ואין להן
 * תלויות androidx — ⛔ ואין להעתיק לשם את הבלוק הזה «לשם אחידות».
 */
public class MainActivity extends ShellActivity {

    @Override
    protected String appUrl() { return "https://ygtotlrl-lab.github.io/yoman-avoda/"; }

    @Override
    protected String offlineLine() { return "יומן עבודה לא הצליח להתחבר."; }

    @Override
    protected String accentColor() { return "#2563eb"; }

    /**
     * The only origin allowed to reach the native share bridge.
     *
     * <p>⛔ A native bridge on a remotely loaded page is reach handed to whoever serves
     * the page. It must never be callable from an arbitrary site, so this is enforced
     * twice over — see {@link #installBridge()}.
     *
     * <p>Origin, not URL: scheme + host + port. All four of the organisation's apps sit
     * on this one origin, which is ours; the path is irrelevant to the security boundary.
     */
    private static final String APP_ORIGIN = "https://ygtotlrl-lab.github.io";
    private static final String APP_HOST = "ygtotlrl-lab.github.io";
    private static final Set<String> ALLOWED_ORIGINS = new HashSet<>(Arrays.asList(APP_ORIGIN));

    /** legacy-bridge path only: is the interface currently attached? */
    private boolean legacyBridgeAttached = false;

    // ── Share bridge, origin-restricted ──────────────────────────────────────────
    //
    // ⛔ addJavascriptInterface injects into EVERY frame of EVERY page the WebView loads,
    // with no origin concept at all. On the old shell that was harmless — the only page
    // was the one baked into the APK. Loading the live site changes that: the WebView can
    // now, in principle, end up on a page we do not serve, and the bridge would go with it.
    //
    // Two paths, and the first one is preferred because the platform enforces it:
    //
    //   1. WebViewCompat.addWebMessageListener(..., ALLOWED_ORIGINS, ...) — the origin
    //      allow-list is checked by WebView itself, PER FRAME, before the message is
    //      delivered. A cross-origin iframe cannot reach it either. Needs WebView 88+.
    //
    //   2. Legacy addJavascriptInterface, for WebViews older than that. Guarded twice:
    //      the interface is attached only while the shell is on our origin and removed
    //      the moment it navigates away, AND every call re-verifies the live document
    //      host on the UI thread before touching anything. A call from anywhere else is
    //      dropped.
    //
    // The page uses whichever exists (see _androidShareImage in index.html).
    @Override
    protected void installBridge() {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(
                webView, "AndroidShareBridge", ALLOWED_ORIGINS,
                new WebViewCompat.WebMessageListener() {
                    @Override
                    public void onPostMessage(@NonNull WebView view, @NonNull WebMessageCompat message,
                                              @NonNull Uri sourceOrigin, boolean isMainFrame,
                                              @NonNull JavaScriptReplyProxy replyProxy) {
                        // Belt and braces: WebView already filtered by ALLOWED_ORIGINS.
                        if (!isMainFrame || !APP_ORIGIN.equals(String.valueOf(sourceOrigin))) return;
                        try {
                            JSONObject o = new JSONObject(String.valueOf(message.getData()));
                            shareImage(o.optString("data"), o.optString("mime"), o.optString("pkg"));
                        } catch (Exception e) {
                            toastUi("שגיאה בהכנת התמונה לשיתוף");
                        }
                    }
                });
        }
        // else: the legacy interface is attached by onShellNavigation once we know the
        // page's origin. It is deliberately NOT attached here — at this point nothing has
        // been loaded, and an interface attached unconditionally is exactly the thing this
        // whole block exists to avoid.
    }

    /** Legacy path only: attach on our origin, detach anywhere else. */
    @Override
    protected void onShellNavigation(String url) {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        boolean ours = isAppOrigin(url);
        if (ours && !legacyBridgeAttached) {
            webView.addJavascriptInterface(new ShareBridge(), "AndroidShare");
            legacyBridgeAttached = true;
        } else if (!ours && legacyBridgeAttached) {
            webView.removeJavascriptInterface("AndroidShare");
            legacyBridgeAttached = false;
        }
    }

    /** https + exactly our host. Anything else — including http on the same host — is not us. */
    private static boolean isAppOrigin(String url) {
        if (url == null) return false;
        try {
            Uri u = Uri.parse(url);
            return "https".equals(u.getScheme()) && APP_HOST.equals(u.getHost());
        } catch (Exception e) {
            return false;
        }
    }

    // ── The share itself. Reached only through one of the two guarded paths above. ──
    // appPackage is kept for the page's bridge signature only — ⛔ it no longer routes
    // the share (סבב 59); ר' share-bridge-rule ב-CLAUDE.md
    private void shareImage(final String base64Data, final String mimeType, final String appPackage) {
        try {
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            File dir = new File(getCacheDir(), "shared");
            dir.mkdirs();
            final File f = new File(dir, "yoman_" + System.currentTimeMillis() + ".jpg");
            FileOutputStream fos = new FileOutputStream(f);
            fos.write(bytes);
            fos.flush();
            fos.close();

            final String mime = (mimeType == null || mimeType.isEmpty()) ? "image/jpeg" : mimeType;
            final Uri uri = FileProvider.getUriForFile(
                MainActivity.this, getPackageName() + ".fileprovider", f);

            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType(mime);
                    send.putExtra(Intent.EXTRA_STREAM, uri);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                    // ⛔ שיתוף רק ב-createChooser · אין FLAG_ACTIVITY_NEW_TASK (סבב 59) —
                    // ר' share-bridge-rule ב-CLAUDE.md
                    Intent toStart = Intent.createChooser(send, "שיתוף הדו\"ח");
                    try {
                        startActivity(toStart);
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "שגיאה בשיתוף", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        } catch (Exception e) {
            toastUi("שגיאה בהכנת התמונה לשיתוף");
        }
    }

    /**
     * Legacy bridge object — used only when WEB_MESSAGE_LISTENER is unavailable.
     *
     * <p>@JavascriptInterface methods run on a private binder thread, so the live document
     * URL is read on the UI thread before anything happens. The interface should not even
     * be attached off-origin (see {@link #onShellNavigation(String)}); this is the second lock.
     */
    private class ShareBridge {
        @JavascriptInterface
        public void shareImage(final String base64Data, final String mimeType, final String appPackage) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    if (!isAppOrigin(webView.getUrl())) return;   // ⛔ not our page — drop it
                    MainActivity.this.shareImage(base64Data, mimeType, appPackage);
                }
            });
        }
    }
}
