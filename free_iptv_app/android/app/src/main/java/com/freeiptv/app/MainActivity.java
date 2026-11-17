package com.freeiptv.app;

import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        } catch (Exception ignored) {}
        configureWebView();
        safeHideSystemUI();
    }

    @Override
    public void onResume() {
        super.onResume();
        configureWebView();
        safeHideSystemUI();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            safeHideSystemUI();
        }
    }

    private void safeHideSystemUI() {
        try {
            Window window = getWindow();
            if (window == null) return;
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

            View decorView = window.getDecorView();
            if (decorView != null) {
                decorView.post(() -> {
                    try {
                        WindowCompat.setDecorFitsSystemWindows(window, false);
                        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(window, decorView);
                        controller.hide(WindowInsetsCompat.Type.systemBars());
                        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    } catch (Exception ignored) {}
                });
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void configureWebView() {
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                WebSettings settings = webView.getSettings();
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
                settings.setAllowFileAccess(true);
                settings.setAllowContentAccess(true);
                settings.setAllowFileAccessFromFileURLs(true);
                settings.setAllowUniversalAccessFromFileURLs(true);
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
                settings.setMediaPlaybackRequiresUserGesture(false);

                // Puente nativo para cierre de app y reproductor externo (Dolby Audio)
                webView.addJavascriptInterface(new Object() {
                    @android.webkit.JavascriptInterface
                    public void exitApp() {
                        runOnUiThread(() -> {
                            try {
                                finishAffinity();
                                System.exit(0);
                            } catch (Exception e) {
                                finish();
                            }
                        });
                    }

                    @android.webkit.JavascriptInterface
                    public void openExternalPlayer(String url, String title) {
                        runOnUiThread(() -> {
                            try {
                                android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_VIEW);
                                intent.setDataAndType(android.net.Uri.parse(url), "video/*");
                                intent.putExtra("title", title);
                                intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                                startActivity(android.content.Intent.createChooser(intent, "Reproducir con:"));
                            } catch (Exception e) {
                                android.widget.Toast.makeText(MainActivity.this, "Instala VLC o MX Player para reproducir formatos externos.", android.widget.Toast.LENGTH_LONG).show()
                                        ;
                            }
                        });
                    }
                }, "AndroidNativeApp");
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
