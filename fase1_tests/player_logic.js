// =========================================================
// player_logic.js
// Versión aislada (sin DOM real) de los métodos clave de
// VideoPlayerManager (player.js) para pruebas unitarias.
// Reproduce la lógica actual de la app v1.0.23.
// =========================================================

class VideoPlayerManager {
  constructor(video, container) {
    this.video = video || {
      pause: () => {},
      removeAttribute: () => {},
      load: () => {},
      muted: false,
      volume: 1,
      error: null,
      readyState: 0,
      paused: true,
      play: () => Promise.resolve()
    };
    this.container = container || {
      classList: { add: () => {}, remove: () => {}, contains: () => false }
    };
    this.hls = null;
    this.currentChannel = null;
    this.controlsTimer = null;
    this.bgRetryTimer = null;
    this.vodStartTimer = null;
    this.isExoPlayerActive = false;
    this._playToken = 0;
    this._exoStopRequested = false;
    this.bgRetryCount = 0;
    this._hlsNetworkRetries = 0;
    this._codecFailCount = 0;
    this.calls = []; // registro de llamadas para assertions
  }

  async stopPlayback() {
    this._playToken = (this._playToken || 0) + 1;
    clearTimeout(this.bgRetryTimer);
    clearTimeout(this.vodStartTimer);
    clearTimeout(this.controlsTimer);
    this.calls.push('clearTimers');

    if (this.hls) {
      try { this.hls.destroy(); } catch (e) {}
      this.hls = null;
      this.calls.push('hlsDestroy');
    }

    if (this.isExoPlayerActive && global.exoPlayerPlugin) {
      this._exoStopRequested = true;
      try { await global.exoPlayerPlugin.stop(); } catch (e) {}
      this.calls.push('exoStop');
    }
    this.isExoPlayerActive = false;

    try {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.calls.push('videoCleanup');
    } catch (e) {}

    this.bgRetryCount = 0;
    this._hlsNetworkRetries = 0;
    this._codecFailCount = 0;
    this.currentChannel = null;
    this.calls.push('stateReset');
  }

  async play(channel, isSilentBg = false) {
    if (!channel || !channel.url) return;
    this._playToken = (this._playToken || 0) + 1;
    const token = this._playToken;
    this.currentChannel = channel;
    this.calls.push('playStart');

    if (this.isExoPlayerActive && global.exoPlayerPlugin) {
      this._exoStopRequested = true;
      try { await global.exoPlayerPlugin.stop(); } catch (e) {}
    }
    this.isExoPlayerActive = false;

    if (this.hls) { try { this.hls.destroy(); } catch (e) {} this.hls = null; }

    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();

    const isM3U8 = /\.m3u8(?:$|[?#])/i.test(channel.url);
    if (isM3U8 && typeof Hls !== 'undefined' && Hls.isSupported()) {
      this.hls = new Hls();
      this.hls.loadSource(channel.url);
      this.hls.attachMedia(this.video);
    } else {
      this.video.src = channel.url;
      this.video.load();
      await this.video.play().catch(() => {});
    }
    this.calls.push('playDone');
    return true;
  }

  exitFullscreenMode() {
    this.container.classList.remove('fullscreen-player');
    this.calls.push('exitFullscreen');
    // Comportamiento actual (player.js líneas 910-914):
    // solo detiene si currentContentType !== 'live'.
    // Para TV en vivo explícitamente NO detiene nada.
  }

  toggleFullscreen() {
    const isFs = this.container.classList.contains('fullscreen-player');
    if (!isFs) {
      this.container.classList.add('fullscreen-player');
      this.calls.push('enterFullscreen');
    } else {
      this.exitFullscreenMode();
    }
  }
}

module.exports = { VideoPlayerManager };
