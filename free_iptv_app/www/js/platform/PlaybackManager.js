// =========================================================
// Free-IPTV Pro - PlaybackManager.js (FASE 3)
// Fachada unificada de reproducción. Reemplaza llamadas directas
// al elemento <video> o a Hls.js con una API estándar:
//   play(mediaItem), pause(), seek(seconds), setAudioTrack(id), setSubtitleTrack(id)
// =========================================================

class PlaybackManager {
  constructor(videoElement, options = {}) {
    this.video = videoElement;
    this.detector = options.detector || window.platformDetector;
    this.compatibility = options.compatibility || new MediaCompatibility(this.detector);
    this.audioManager = options.audioManager || new AudioTrackManager(videoElement);
    this.externalPlayer = options.externalPlayer || new ExternalPlayer(this.detector);

    this.hls = null;
    this.currentMedia = null;
    this.engine = null; // 'hlsjs' | 'native_video' | 'external_player' | 'native_hls'
    this.onEvent = options.onEvent || (() => {});
  }

  // ------------------------------------------------------------------
  // Reproducción principal
  // ------------------------------------------------------------------
  async play(mediaItem) {
    if (!mediaItem || !mediaItem.url) {
      console.warn('[PlaybackManager] play(): mediaItem o url faltante');
      return false;
    }

    this.currentMedia = mediaItem;
    this.stop();

    const url = mediaItem.url;
    this.engine = this.compatibility.recommendedEngine(url);

    // Notificar inicio
    this.onEvent('playback_start', {
      media: mediaItem,
      engine: this.engine,
      platform: this.detector.platform
    });

    console.log(`[PlaybackManager] Motor seleccionado: ${this.engine} | URL: ${url}`);

    // Derivación a reproductor externo (MKV, AC3 en Android WebView, etc.)
    if (this.engine === 'external_player') {
      return this.externalPlayer.open(url, mediaItem.name || 'Contenido');
    }

    // HLS.js (Android WebView, Web Browser, PWA sin HLS nativo)
    if (this.engine === 'hlsjs') {
      return this.initHls(url);
    }

    // HLS nativo (iOS Safari / WKWebView gestiona m3u8 por hardware)
    if (this.engine === 'native_hls') {
      return this.initNative(url);
    }

    // MP4 / TS directo en elemento <video>
    return this.initNative(url);
  }

  // ------------------------------------------------------------------
  // Motores internos
  // ------------------------------------------------------------------
  initHls(url) {
    if (typeof Hls === 'undefined') {
      console.error('[PlaybackManager] Hls.js no está cargado');
      this.onEvent('playback_error', { error: 'Hls.js no disponible' });
      return false;
    }

    if (this.hls) {
      try { this.hls.destroy(); } catch (e) {}
      this.hls = null;
    }

    this.hls = new Hls({
      enableWorker: false,
      lowLatencyMode: false,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      manifestLoadingTimeOut: 20000,
      manifestLoadingMaxRetry: 3,
      levelLoadingTimeOut: 20000,
      fragLoadingTimeOut: 20000
    });

    // Conectar AudioTrackManager a Hls.js
    this.audioManager.setHls(this.hls);

    this.hls.loadSource(url);
    this.hls.attachMedia(this.video);

    this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
      this.video.play().catch((err) => {
        console.warn('[PlaybackManager] HLS video.play() falló:', err);
        this.onEvent('playback_error', { error: err });
      });
      this.onEvent('hls_manifest_parsed', {});
    });

    this.hls.on(Hls.Events.ERROR, (event, data) => {
      this.onEvent('hls_error', { data });

      // Códec de audio no soportado (ej. AC3/EAC3 en Android WebView)
      if (data.fatal && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        this.onEvent('codec_unsupported', { media: this.currentMedia });
      }
    });

    return true;
  }

  initNative(url) {
    this.video.src = url;
    this.video.load();

    return this.video.play()
      .then(() => {
        this.onEvent('native_playing', {});
      })
      .catch((err) => {
        console.error('[PlaybackManager] Reproducción nativa falló:', err);
        this.onEvent('playback_error', { error: err });
        return false;
      });
  }

  // ------------------------------------------------------------------
  // API estándar de control
  // ------------------------------------------------------------------
  pause() {
    if (this.video) this.video.pause();
    this.onEvent('playback_pause', {});
  }

  resume() {
    if (this.video) {
      return this.video.play().catch(() => {});
    }
    this.onEvent('playback_resume', {});
  }

  stop() {
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }
    if (this.hls) {
      try { this.hls.destroy(); } catch (e) {}
      this.hls = null;
    }
    this.audioManager.setHls(null);
    this.onEvent('playback_stop', {});
  }

  seek(seconds) {
    if (this.video) {
      this.video.currentTime = seconds;
      this.onEvent('seek', { seconds });
    }
  }

  setAudioTrack(trackId) {
    const result = this.audioManager.setAudioTrack(trackId);
    this.onEvent('audio_track_changed', { trackId, result });
    return result;
  }

  setSubtitleTrack(trackId) {
    const result = this.audioManager.setSubtitleTrack(trackId);
    this.onEvent('subtitle_track_changed', { trackId, result });
    return result;
  }

  getAudioTracks() {
    return this.audioManager.getAudioTracks();
  }

  getSubtitleTracks() {
    return this.audioManager.getSubtitleTracks();
  }

  togglePlay() {
    if (this.video.paused) this.resume();
    else this.pause();
  }

  setVolume(volume) {
    if (this.video) this.video.volume = Math.max(0, Math.min(1, volume));
  }

  getDuration() {
    return this.video ? this.video.duration : 0;
  }

  getCurrentTime() {
    return this.video ? this.video.currentTime : 0;
  }

  isPlaying() {
    return this.video && !this.video.paused && !this.video.ended;
  }

  getEngine() {
    return this.engine;
  }

  getCurrentMedia() {
    return this.currentMedia;
  }

  destroy() {
    this.stop();
    this.onEvent = null;
  }
}

window.PlaybackManager = PlaybackManager;
