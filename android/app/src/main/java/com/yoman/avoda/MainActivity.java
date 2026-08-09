package com.yoman.avoda;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
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
 * Native WebView shell for yoman-avoda — deliberately NOT a Trusted Web Activity.
 *
 * A TWA runs the site inside Chrome, and the content filters installed on the users'
 * devices block Chrome, so a TWA build never opens. A plain WebView renders in-process
 * and is not affected. See CLAUDE.md, "APK — מעטפת WebView מקורית".
 *
 * <p>Since the "shell loads the live site" change, this loads {@link #APP_URL} over the
 * network instead of the copy that used to be bundled in assets/. Web releases therefore
 * reach installed devices the moment GitHub Pages updates, with no new APK — the same
 * arrangement the gius shell already uses. The site's service worker keeps it working
 * offline afterwards, exactly as it does in a browser.
 *
 * <p><b>The bundled assets were removed on purpose, not merely dropped.</b> A file://
 * fallback copy would live in a <i>different storage origin</i> from the https site, so
 * anything typed into it offline would land in a localStorage partition the online app
 * never reads — silent data loss in a data-entry app. See android/README.md.
 */
public class MainActivity extends Activity {

    private static final String APP_URL = "https://ygtotlrl-lab.github.io/yoman-avoda/";

    /**
     * The only origin allowed to reach the native share bridge.
     *
     * <p>⛔ A native bridge on a remotely loaded page is reach handed to whoever serves
     * the page. It must never be callable from an arbitrary site, so this is enforced
     * twice over — see {@link #installShareBridge()}.
     *
     * <p>Origin, not URL: scheme + host + port. All four of the organisation's apps sit
     * on this one origin, which is ours; the path is irrelevant to the security boundary.
     */
    private static final String APP_ORIGIN = "https://ygtotlrl-lab.github.io";
    private static final String APP_HOST = "ygtotlrl-lab.github.io";
    private static final Set<String> ALLOWED_ORIGINS = new HashSet<>(Arrays.asList(APP_ORIGIN));

    private static final int FILE_CHOOSER_REQUEST = 1001;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    /** true once any real page has painted — keeps a late error from wiping a live app. */
    private boolean loadedOnce = false;
    /** legacy-bridge path only: is the interface currently attached? */
    private boolean legacyBridgeAttached = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage — ENTRIES/ARCHIVE live here
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        // The site is https-only now that we no longer serve a file:// page, so there is
        // no reason to allow mixed content wholesale (the old shell needed it to let a
        // file:// document reach Supabase over https).
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        // No file:// access is needed any more either.
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        webView.setWebViewClient(new ShellWebViewClient());

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (filePathCallback != null) { filePathCallback.onReceiveValue(null); }
                filePathCallback = cb;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        installShareBridge();

        // restoreState() returns null when there was no history to restore — then
        // (and on a normal cold start) load the site.
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(APP_URL);
        } else {
            loadedOnce = true;
        }
    }

    // ── Share bridge, origin-restricted ──────────────────────────────────────────
    //
    // The report-sharing feature needs a native hand-off: html2canvas produces a JPEG in
    // the page, and the shell writes it to cache, exposes it through FileProvider and
    // fires ACTION_SEND. That is why the bridge exists and why it stays.
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
    private void installShareBridge() {
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
        // else: the legacy interface is attached by ShellWebViewClient once we know the
        // page's origin. It is deliberately NOT attached here — at this point nothing has
        // been loaded, and an interface attached unconditionally is exactly the thing this
        // whole block exists to avoid.
    }

    /** Legacy path only: attach on our origin, detach anywhere else. */
    private void syncLegacyBridge(String url) {
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

    private class ShellWebViewClient extends WebViewClient {

        // ⛔ http/https ALWAYS stays inside the WebView. Handing a web URL to the system
        // browser would land the user in Chrome, which the content filters on their
        // devices block — the very failure that made the TWA build unusable. Everything
        // else (tel:, mailto:, whatsapp:, …) has no renderer here and goes to the system:
        // that is how the WhatsApp/Signal fallback path works.
        @Override
        public boolean shouldOverrideUrlLoading(WebView wv, WebResourceRequest request) {
            return handleUrl(request.getUrl());
        }

        @SuppressWarnings("deprecation")
        @Override
        public boolean shouldOverrideUrlLoading(WebView wv, String url) {
            return handleUrl(Uri.parse(url));
        }

        private boolean handleUrl(Uri uri) {
            String scheme = uri.getScheme();
            if (scheme == null) return false;
            if (scheme.equals("http") || scheme.equals("https")) return false;
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (ActivityNotFoundException e) {
                Toast.makeText(MainActivity.this, "אין אפליקציה שיודעת לפתוח את הקישור", Toast.LENGTH_SHORT).show();
            }
            return true;
        }

        @Override
        public void onPageStarted(WebView wv, String url, android.graphics.Bitmap favicon) {
            syncLegacyBridge(url);
        }

        @Override
        public void onPageFinished(WebView wv, String url) {
            syncLegacyBridge(url);
            if (url != null && !url.startsWith("data:")) loadedOnce = true;
        }

        @Override
        public void onReceivedError(WebView wv, WebResourceRequest request, WebResourceError error) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && request.isForMainFrame()) {
                showOfflinePage();
            }
        }

        @SuppressWarnings("deprecation")
        @Override
        public void onReceivedError(WebView wv, int errorCode, String description, String failingUrl) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) showOfflinePage();
        }
    }

    /**
     * Cold start with no network and nothing in the service-worker cache. Once the app has
     * loaded once, the service worker answers offline and this never runs — so it only
     * shows while the shell is still empty.
     */
    private void showOfflinePage() {
        if (loadedOnce) return;
        String html =
            "<!doctype html><html lang='he' dir='rtl'><head>"
            + "<meta charset='utf-8'>"
            + "<meta name='viewport' content='width=device-width,initial-scale=1'>"
            + "<style>"
            + "body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;"
            + "justify-content:center;gap:18px;background:#f4f6f9;color:#0f172a;text-align:center;padding:24px;"
            + "font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif}"
            + "h1{font-size:20px;margin:0}p{margin:0;color:#475569;line-height:1.6}"
            + "a{background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700}"
            + "</style></head><body>"
            + "<h1>אין חיבור לאינטרנט</h1>"
            + "<p>יומן עבודה לא הצליח להתחבר.<br>בדוק את החיבור ונסה שוב.</p>"
            + "<a href='" + APP_URL + "'>נסה שוב</a>"
            + "</body></html>";
        webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && filePathCallback != null) {
            filePathCallback.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            filePathCallback = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private void toastUi(final String msg) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
            }
        });
    }

    // ── The share itself. Reached only through one of the two guarded paths above. ──
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

                    Intent toStart;
                    if (appPackage != null && !appPackage.isEmpty()) {
                        send.setPackage(appPackage);
                        if (send.resolveActivity(getPackageManager()) != null) {
                            // target app installed → go straight to it
                            toStart = send;
                        } else {
                            // not installed → generic chooser
                            Intent generic = new Intent(Intent.ACTION_SEND);
                            generic.setType(mime);
                            generic.putExtra(Intent.EXTRA_STREAM, uri);
                            generic.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            toStart = Intent.createChooser(generic, "שיתוף הדו\"ח");
                        }
                    } else {
                        toStart = Intent.createChooser(send, "שיתוף הדו\"ח");
                    }
                    toStart.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
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
     * be attached off-origin (see {@link #syncLegacyBridge}); this is the second lock.
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
