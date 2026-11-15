package com.freeiptv.app.plugins;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.provider.Settings;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.hls.HlsMediaSource;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.ui.PlayerView;

@CapacitorPlugin(name = "ExoPlayerPlugin")
public class ExoPlayerPlugin extends Plugin {

    private static final String TAG = "ExoPlayerPlugin";
    private ExoPlayer player;
    private PlayerView playerView;
    private Context context;

    @Override
    public void load() {
        context = getContext().getApplicationContext();
    }

    @PluginMethod()
    public void play(final PluginCall call) {
        final String url = call.getString("url");
        final String title = call.getString("title", "Contenido");

        if (url == null || url.isEmpty()) {
            call.reject("URL no proporcionada");
            return;
        }

        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    // Liberar jugador previo si existe
                    releasePlayer();

                    // Crear instancia de ExoPlayer con soporte de audio avanzado
                    DefaultTrackSelector trackSelector = new DefaultTrackSelector(context);
                    AudioAttributes audioAttributes = new AudioAttributes.Builder()
                            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                            .setUsage(C.USAGE_MEDIA)
                            .build();

                    player = new ExoPlayer.Builder(context)
                            .setTrackSelector(trackSelector)
                            .setAudioAttributes(audioAttributes, true)
                            .build();

                    // Crear o reutilizar PlayerView para mostrar la imagen/video
                    if (playerView == null) {
                        playerView = new PlayerView(getContext());
                        playerView.setPlayer(player);
                        playerView.setUseController(false);
                        playerView.setBackgroundColor(Color.BLACK);
                        // Permitir eventos táctiles para no bloquear clics en la UI
                        playerView.setClickable(false);
                        playerView.setFocusable(false);
                        playerView.setFocusableInTouchMode(false);

                        ViewGroup rootView = (ViewGroup) bridge.getWebView().getParent();
                        if (rootView != null) {
                            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                                    ViewGroup.LayoutParams.MATCH_PARENT,
                                    ViewGroup.LayoutParams.MATCH_PARENT
                            );
                            rootView.addView(playerView, params);
                            playerView.bringToFront();
                        }
                    } else {
                        playerView.setPlayer(player);
                        playerView.setVisibility(View.VISIBLE);
                        playerView.setClickable(false);
                        playerView.setFocusable(false);
                        playerView.bringToFront();
                    }

                    // Escuchar eventos de reproducción
                    player.addListener(new Player.Listener() {
                        @Override
                        public void onIsPlayingChanged(boolean isPlaying) {
                            JSObject data = new JSObject();
                            data.put("playing", isPlaying);
                            data.put("state", player != null ? player.getPlaybackState() : 0);
                            notifyListeners("playbackStateChanged", data);
                        }

                        @Override
                        public void onPlayerError(PlaybackException error) {
                            Log.e(TAG, "ExoPlayer error", error);
                            JSObject data = new JSObject();
                            data.put("error", error != null ? error.getMessage() : "Playback error");
                            notifyListeners("playbackError", data);

                            // Ocultar PlayerView en caso de error para evitar pantalla negra permanente
                            getActivity().runOnUiThread(() -> {
                                if (playerView != null) {
                                    playerView.setVisibility(View.GONE);
                                }
                            });
                        }
                    });

                    // Construir la fuente de medios según el tipo de URL
                    DefaultHttpDataSource.Factory httpDataSourceFactory = new DefaultHttpDataSource.Factory()
                            .setUserAgent("Free-IPTV-Pro/1.6")
                            .setAllowCrossProtocolRedirects(true);

                    DefaultDataSource.Factory dataSourceFactory = new DefaultDataSource.Factory(context, httpDataSourceFactory);
                    MediaItem mediaItem = MediaItem.fromUri(Uri.parse(url));

                    boolean isHls = url.toLowerCase().contains(".m3u8");

                    if (isHls) {
                        HlsMediaSource hlsMediaSource = new HlsMediaSource.Factory(dataSourceFactory)
                                .createMediaSource(mediaItem);
                        player.setMediaSource(hlsMediaSource);
                    } else {
                        ProgressiveMediaSource progressiveMediaSource = new ProgressiveMediaSource.Factory(dataSourceFactory)
                                .createMediaSource(mediaItem);
                        player.setMediaSource(progressiveMediaSource);
                    }

                    player.prepare();
                    player.setPlayWhenReady(true);

                    JSObject result = new JSObject();
                    result.put("status", "playing");
                    result.put("url", url);
                    result.put("title", title);
                    call.resolve(result);

                } catch (Exception ex) {
                    Log.e(TAG, "Error iniciando ExoPlayer: " + ex.getMessage(), ex);
                    call.reject("Error iniciando ExoPlayer: " + ex.getMessage());
                }
            }
        });
    }

    @PluginMethod()
    public void openCastSettings(final PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_CAST_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            try {
                Intent intent = new Intent("android.settings.WIRELESS_SETTINGS");
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
            } catch (Exception ex) {
                call.reject("No se pudo abrir la configuración de pantalla inalámbrica: " + ex.getMessage());
            }
        }
    }

    @PluginMethod()
    public void setLayout(final PluginCall call) {
        final int x = call.getInt("x", 0);
        final int y = call.getInt("y", 0);
        final int w = call.getInt("w", ViewGroup.LayoutParams.MATCH_PARENT);
        final int h = call.getInt("h", ViewGroup.LayoutParams.MATCH_PARENT);

        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (playerView != null) {
                    FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(w, h);
                    params.leftMargin = x;
                    params.topMargin = y;
                    playerView.setLayoutParams(params);
                }
                call.resolve();
            }
        });
    }

    @PluginMethod()
    public void pause(final PluginCall call) {
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (player != null) {
                    player.setPlayWhenReady(false);
                    call.resolve();
                } else {
                    call.reject("No hay reproducción activa");
                }
            }
        });
    }

    @PluginMethod()
    public void stop(final PluginCall call) {
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                releasePlayer();
                call.resolve();
            }
        });
    }

    @PluginMethod()
    public void seek(final PluginCall call) {
        final long positionMs = call.getLong("positionMs", 0L);
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (player != null) {
                    player.seekTo(positionMs);
                    call.resolve();
                } else {
                    call.reject("No hay reproducción activa");
                }
            }
        });
    }

    @PluginMethod()
    public void setVolume(final PluginCall call) {
        final double volume = call.getDouble("volume", 1.0);
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (player != null) {
                    player.setVolume((float) volume);
                    call.resolve();
                } else {
                    call.reject("No hay reproducción activa");
                }
            }
        });
    }

    @PluginMethod()
    public void setAudioTrack(final PluginCall call) {
        // La selección de pistas se maneja por DefaultTrackSelector
        call.resolve();
    }

    @PluginMethod()
    public void isSupported(final PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("platform", "android");
        result.put("engine", "exoplayer_media3");
        call.resolve(result);
    }

    @PluginMethod()
    public void getDuration(final PluginCall call) {
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (player != null) {
                    JSObject result = new JSObject();
                    result.put("durationMs", player.getDuration());
                    call.resolve(result);
                } else {
                    call.reject("No hay reproducción activa");
                }
            }
        });
    }

    @PluginMethod()
    public void getCurrentPosition(final PluginCall call) {
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (player != null) {
                    JSObject result = new JSObject();
                    result.put("positionMs", player.getCurrentPosition());
                    call.resolve(result);
                } else {
                    call.reject("No hay reproducción activa");
                }
            }
        });
    }

    private void releasePlayer() {
        if (playerView != null) {
            try {
                ViewGroup parent = (ViewGroup) playerView.getParent();
                if (parent != null) {
                    parent.removeView(playerView);
                }
            } catch (Exception ignored) {}
            playerView = null;
        }
        if (player != null) {
            try {
                player.stop();
                player.release();
            } catch (Exception ignored) {}
            player = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        releasePlayer();
        super.handleOnDestroy();
    }
}
