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
import com.freeiptv.app.plugins.ExoPlayerPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Registrar plugin nativo ExoPlayer (Media3 + FFmpeg Audio para AC-3/E-AC-3)
        this.registerPlugin(ExoPlayerPlugin.class);
        hideSystemUI();
        configureWebView();
        if (getWindow() != null && getWindow().getDecorView() != null) {
            getWindow().getDecorView().post(this::hideSystemUI);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        hideSystemUI();
        configureWebView();
        if (getWindow() != null && getWindow().getDecorView() != null) {
            getWindow().getDecorView().post(this::hideSystemUI);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }

    private void hideSystemUI() {
        try {
            Window window = getWindow();
            if (window == null) return;

            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);

            // Permitir pantalla completa real de extremo a extremo cubriendo muescas (cutouts/notches) en horizontal
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                WindowManager.LayoutParams lp = window.getAttributes();
                lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                window.setAttributes(lp);
            }

            // Barras de sistema 100% transparentes: la app se extiende de borde a borde y los botones quedan por detrás
            window.setStatusBarColor(android.graphics.Color.TRANSPARENT);
            window.setNavigationBarColor(android.graphics.Color.TRANSPARENT);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                window.setStatusBarContrastEnforced(false);
                window.setNavigationBarContrastEnforced(false);
            }

            WindowCompat.setDecorFitsSystemWindows(window, false);
            WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(window, window.getDecorView());
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);

            View decorView = window.getDecorView();
            int uiOptions = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
            decorView.setSystemUiVisibility(uiOptions);

            decorView.setOnSystemUiVisibilityChangeListener(new View.OnSystemUiVisibilityChangeListener() {
                @Override
                public void onSystemUiVisibilityChange(int visibility) {
                    if ((visibility & View.SYSTEM_UI_FLAG_FULLSCREEN) == 0) {
                        decorView.setSystemUiVisibility(uiOptions);
                        if (controller != null) {
                            controller.hide(WindowInsetsCompat.Type.systemBars());
                        }
                    }
                }
            });
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
                                android.widget.Toast.makeText(MainActivity.this, "Instala VLC o MX Player para reproducir formatos externos.", android.widget.Toast.LENGTH_LONG).show();
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
