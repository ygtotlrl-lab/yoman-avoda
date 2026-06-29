package com.yoman.avoda;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;

public class MainActivity extends Activity {

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int FILE_CHOOSER_REQUEST = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        // Allow the file:// page to load https resources (Supabase sync)
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebViewClient(new WebViewClient());

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (filePathCallback != null) { filePathCallback.onReceiveValue(null); }
                filePathCallback = cb;
                try {
                    Intent intent = params.createIntent();
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        // JS bridge: window.AndroidShare.shareImage(base64, mime, appPackage)
        webView.addJavascriptInterface(new ShareBridge(), "AndroidShare");

        webView.loadUrl("file:///android_asset/index.html");
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
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    // ── Native image-share bridge ──
    private class ShareBridge {
        @JavascriptInterface
        public void shareImage(final String base64Data, final String mimeType, final String appPackage) {
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
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        Toast.makeText(MainActivity.this, "שגיאה בהכנת התמונה לשיתוף", Toast.LENGTH_SHORT).show();
                    }
                });
            }
        }
    }
}
