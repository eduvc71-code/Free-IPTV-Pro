// =========================================================
// Free-IPTV Pro - Ultra-Modern Video Player Engine
// =========================================================

// =========================================================
// IPTV Custom Loaders for HLS.js
// Resolves 302 redirects and root-relative /hls/ segments in Android WebView
// =========================================================

class IPTVPlaylistLoader extends (typeof Hls !== 'undefined' ? Hls.DefaultConfig.loader : Object) {
  constructor(config) {
    super(config);
  }

  load(context, config, callbacks) {
    if (context && context.url) {
      // 1. Desempaquetar proxy Capacitor si viene en la URL
      if (context.url.includes('_capacitor_http_interceptor_')) {
        try {
          const u = new URL(context.url).searchParams.get('u');
          if (u) context.url = decodeURIComponent(u);
        } catch (e) {}
      }

      // 2. Si la URL apunta a localhost, resolverla contra el origen real del stream
      if (context.url.startsWith('https://localhost/') || context.url.startsWith('http://localhost/')) {
        try {
          const urlObj = new URL(context.url);
          if (window._activeStreamOrigin) {
            context.url = window._activeStreamOrigin + urlObj.pathname + urlObj.search;
          }
        } catch (e) {}
      }
    }

    console.log('[IPTV] PlaylistLoader solicitando:', context.url);

    const origOnSuccess = callbacks.onSuccess;
    callbacks.onSuccess = (response, stats, ctx, networkDetails) => {
      try {
        if (response && typeof response.data === 'string') {
          let effectiveUrl = response.url || context.url;
          if (effectiveUrl.includes('_capacitor_http_interceptor_')) {
            try {
              const u = new URL(effectiveUrl).searchParams.get('u');
              if (u) effectiveUrl = decodeURIComponent(u);
            } catch (e) {}
          }

          if (effectiveUrl && effectiveUrl.startsWith('http') && !effectiveUrl.includes('localhost')) {
            try {
              const uObj = new URL(effectiveUrl);
              window._activeStreamOrigin = uObj.origin;
              window._activeStreamBase = effectiveUrl.substring(0, effectiveUrl.lastIndexOf('/') + 1);
            } catch (e) {}
          }

          const origin = window._activeStreamOrigin || '';
          const base = window._activeStreamBase || '';

          if (origin) {
            // Reescribir rutas raíz: líneas que inician con / (ej: /hls/...) -> http://cdn/hls/...
            response.data = response.data.replace(/^(?!\s*#)(\/[^\r\n]+)/gm, (match, path) => {
              return origin + path;
            });

            // Reescribir rutas relativas sin slash (ej: chunk1.ts)
            if (base) {
              response.data = response.data.replace(/^(?!\s*#)(?!https?:\/\/|\/)([^\r\n]+)/gm, (match, rel) => {
                return base + rel;
              });
            }

            // Reescribir URI="..." en claves o listas secundarias
            response.data = response.data.replace(/URI=["']([^"']+)["']/g, (match, uri) => {
              if (uri.startsWith('/')) return 'URI="' + origin + uri + '"';
              if (!uri.startsWith('http') && base) return 'URI="' + base + uri + '"';
              return match;
            });
          }
          console.log('[IPTV] Lista .m3u8 reescrita con origen CDN:', origin);
        }
      } catch (err) {
        console.warn('[IPTV] Advertencia al reescribir lista:', err);
      }

      origOnSuccess(response, stats, ctx, networkDetails);
    };

    super.load(context, config, callbacks);
  }
}

class IPTVFragmentLoader extends (typeof Hls !== 'undefined' ? Hls.DefaultConfig.loader : Object) {
  constructor(config) {
    super(config);
  }

  load(context, config, callbacks) {
    if (context && context.url) {
      // 1. Desempaquetar proxy si viene envuelto
      if (context.url.includes('_capacitor_http_interceptor_')) {
        try {
          const u = new URL(context.url).searchParams.get('u');
          if (u) context.url = decodeURIComponent(u);
        } catch (e) {}
      }

      // 2. Corregir cualquier URL que haya quedado en localhost
      if (context.url.startsWith('https://localhost/') || context.url.startsWith('http://localhost/')) {
        try {
          const urlObj = new URL(context.url);
          if (window._activeStreamOrigin) {
            context.url = window._activeStreamOrigin + urlObj.pathname + urlObj.search;
            console.log('[IPTV] FragmentLoader redirigió segmento localhost a:', context.url);
          }
        } catch (e) {}
      }
    }

    super.load(context, config, callbacks);
  }
}

class VideoPlayerManager {
  constructor() {
    this.video = document.getElementById('main-video');
    this.container = document.getElementById('player-container');
    this.overlay = document.getElementById('player-overlay');
    this.hud = document.getElementById('gesture-hud');
    this.hudIcon = document.getElementById('gesture-icon');
    this.hudBar = document.getElementById('gesture-bar-fill');
    this.hudText = document.getElementById('gesture-text');
    this.loading = document.getElementById('player-loading');
    this.bgRetryBadge = document.getElementById('player-bg-retry');
    this.errorOverlay = document.getElementById('player-error');
    this.errorText = document.getElementById('player-error-text');

    this.hls = null;
    this.currentChannel = null;
    this.controlsTimer = null;
    this.brightness = 1.0;
    this.volume = 1.0;
    this.aspectRatios = ['contain', 'cover', 'fill'];
    this.aspectLabels = ['Ajustar', 'Zoom', 'Estirar'];
    this.currentAspectIdx = 0;
    this.isLocked = false;

    // Sleep Timer
    this.sleepTimerInterval = null;
    this.sleepTimeRemaining = 0;

    // Background auto-reconnect & silent skip
    this.bgRetryCount = 0;
    this.maxBgRetries = 3;
    this.bgRetryTimer = null;

    // FASE 2: estado de audio (pistas, fallo de códec, derivación externa)
    this.audioTrackInfo = null;      // { tracks: [...], source: 'hlsjs'|'xtream' }
    this._externalRedirected = false; // no derivar 2 veces a externo en la misma sesión
    this._codecFailCount = 0;         // fallos MEDIA_ERROR consecutivos por códec

    this.initTouchGestures();
    this.initVideoEvents();
  }

  async play(channel, isSilentBg = false) {
    if (!channel || !channel.url) return;

    this.currentChannel = channel;
    this.hideIdle();

    // FASE 2: flags de audio/derivación por sesión de reproducción
    this._externalRedirected = false;
    this.audioTrackInfo = null;
    if (!isSilentBg) this._codecFailCount = 0;

    if (!isSilentBg) {
      this.bgRetryCount = 0;
      this.showLoading(true);
    }

    clearTimeout(this.bgRetryTimer);
    this.hideError();
    this.hideBgRetry();
    this.updateChannelMetadata(channel);

    const streamUrl = channel.url.trim();

    // Limpiar reproductor anterior
    if (this.hls) {
      try {
        this.hls.destroy();
      } catch (e) {
        console.warn('[IPTV] Error destruyendo HLS:', e);
      }
      this.hls = null;
    }

    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.video.muted = false;
    this.video.volume = 1.0;

    const isM3U8 = /\.m3u8(?:$|[?#])/i.test(streamUrl);
    // VOD/Series Xtream: extensiones reales reportadas por player_api.php
    const isVodExt = /\.(mp4|mkv|avi|mov|m4v|wmv|flv|webm|ts|m2ts|mpg|mpeg)(?:$|[?#])/i.test(streamUrl);
    const isMP4 = /\.mp4(?:$|[?#])/i.test(streamUrl);
    const isTS = /\.ts(?:$|[?#])/i.test(streamUrl);

    // FASE 2: el usuario/puente puede forzar reproductor externo (botón "Abrir en VLC")
    if (channel.forceExternal && typeof openMediaInExternalPlayer === 'function') {
      this.showLoading(false);
      openMediaInExternalPlayer(streamUrl, channel.name || 'Contenido');
      this.resetControlsTimeout();
      return;
    }

    console.log('[IPTV] Iniciando reproducción:', {
      url: streamUrl.replace(/\/\/([^/@]+)@/, '//[REDACTED]@'),
      format: isM3U8 ? 'HLS' : isMP4 ? 'MP4' : isTS ? 'TS' : 'UNKNOWN',
      hlsAvailable: typeof Hls !== 'undefined',
      hlsSupported: typeof Hls !== 'undefined' && Hls.isSupported()
    });

    // 1. Pre-resolución de redirecciones (302) SOLO para listas HLS (.m3u8)
    //    Nota: para VOD/Series (mp4/mkv/ts) se omite el pre-chequeo completo:
    //    descarga datos innecesarios y puede timeear en servidores lentos.
    let effectiveStreamUrl = streamUrl;
    try {
      if (isM3U8 && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
        console.log('[IPTV] Verificando redirección CDN para:', streamUrl);
        const preCheck = await window.Capacitor.Plugins.CapacitorHttp.get({
          url: streamUrl,
          headers: { 'User-Agent': 'IPTVSmartersPro', 'Range': 'bytes=0-0' },
          connectTimeout: 8000,
          readTimeout: 8000
        });
        if (preCheck && preCheck.url && preCheck.url.startsWith('http')) {
          effectiveStreamUrl = preCheck.url;
          console.log('[IPTV] URL resuelta tras redirección 302:', effectiveStreamUrl);
        }
      }
    } catch (e) {
      console.warn('[IPTV] No se resolvió redirección previa (usando URL directa):', e.message);
    }

    // Guardar origen y base para resolución de fragmentos relativos
    try {
      const uObj = new URL(effectiveStreamUrl);
      window._activeStreamOrigin = uObj.origin;
      window._activeStreamBase = effectiveStreamUrl.substring(0, effectiveStreamUrl.lastIndexOf('/') + 1);
    } catch (e) {
      window._activeStreamOrigin = '';
      window._activeStreamBase = '';
    }

    const onPlaybackStarted = () => {
      console.log('[IPTV] Reproducción iniciada con éxito');
      this.showLoading(false);
      this.hideError();
      this.hideBgRetry();
      this.bgRetryCount = 0;
      this.updatePlayIcon(true);
      this.updateQualityBadge();
    };

    if (isM3U8 && typeof Hls !== 'undefined' && Hls.isSupported()) {
      console.log('[IPTV] Usando HLS.js con IPTV Loaders');

      this.hls = new Hls({
        enableWorker: false,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 3,
        levelLoadingTimeOut: 20000,
        fragLoadingTimeOut: 20000,
        pLoader: IPTVPlaylistLoader,
        fLoader: IPTVFragmentLoader
      });

      this.hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        console.log('[IPTV] MEDIA_ATTACHED');
      });

      this.hls.on(Hls.Events.MANIFEST_LOADING, (event, data) => {
        console.log('[IPTV] MANIFEST_LOADING:', data.url);
      });

      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('[IPTV] MANIFEST_PARSED');
        onPlaybackStarted();
        // FASE 2: exponer pistas de audio HLS al AudioTrackManager
        try { this.collectHlsAudioTracks(); } catch (e) {}
        this.video.play().catch(error => {
          console.error('[IPTV] Error video.play():', error);
        });
      });

      this.hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        try { this.collectHlsAudioTracks(); } catch (e) {}
      });

      this.hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
        console.log('[IPTV] FRAG_LOADED:', data.frag?.url);
      });

      this.hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('[IPTV] HLS ERROR:', {
          type: data.type,
          details: data.details,
          fatal: data.fatal,
          url: data.url,
          response: data.response
        });

        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('[IPTV] Network fatal error, intentando startLoad()...');
              this.hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('[IPTV] Media fatal error, intentando recoverMediaError()...');
              // FASE 2: si el códec de audio (p.ej. AC3/E-AC3) no es decodificable
              // por WebView, tras 2 recuperaciones derivar a reproductor externo.
              this._codecFailCount++;
              if (this._codecFailCount >= 2 && this.isVodOrCodecSensitive()) {
                this._redirectToExternalPlayer('⚠️ Códec de audio no compatible. Abriendo en VLC / MX Player...');
                return;
              }
              this.hls.recoverMediaError();
              break;
            default:
              this.showLoading(false);
              this.handleStreamFailInBackground();
              break;
          }
        }
      });

      this.hls.loadSource(effectiveStreamUrl);
      this.hls.attachMedia(this.video);

    } else {
      // Reproducción directa: MP4, TS u otro formato
      if (isM3U8) {
        const nativeHls = this.video.canPlayType(
          'application/vnd.apple.mpegurl'
        );

        if (!nativeHls) {
          console.error('[IPTV] HLS no soportado por HLS.js ni por el vídeo nativo');
          this.showLoading(false);
          this.showError(
            'Formato HLS no compatible',
            'Este dispositivo no dispone de un reproductor compatible con esta señal.'
          );
          return;
        }
      }

      // Formatos NO compatibles con HTML5/WebView (MKV, AVI, WMV, FLV...):
      // casi siempre llevan audio Dolby/E-AC3 que WebView no decodifica.
      // Se envían directo al reproductor externo (VLC / MX Player / Player iOS).
      const webCompatible = /\.(mp4|m4v|webm|mov|ts|m2ts|mpg|mpeg)(?:$|[?#])/i.test(streamUrl) || isM3U8;
      if (isVodExt && !webCompatible) {
        this.showLoading(false);
        if (typeof openMediaInExternalPlayer === 'function') {
          showToast('🎬 Formato no compatible internamente. Abriendo en VLC / MX Player...');
          openMediaInExternalPlayer(streamUrl, channel.name || 'Película');
        } else {
          this.showError(
            'Formato de video no compatible',
            'Esta película usa un contenedor (MKV/AVI) que el navegador no puede reproducir. Instálala en VLC o MX Player.'
          );
        }
        return;
      }

      console.log('[IPTV] Usando reproducción directa con URL:', effectiveStreamUrl);

      this.video.muted = false;
      this.video.volume = 1.0;
      this.video.src = effectiveStreamUrl;
      this.video.load();

      this.video.play().then(() => {
        onPlaybackStarted();
      }).catch(error => {
        console.error('[IPTV] Error en reproducción directa:', error);
        // Si el fallo es de códec/formato (NotSupportedError) o de red,
        // ofrecer automáticamente el reproductor externo para VOD/Series
        const errName = error && error.name ? error.name : '';
        const isType = channel && (channel.type === 'vod' || channel.type === 'episode' || channel.type === 'series');
        if ((errName === 'NotSupportedError' || isType) && typeof openMediaInExternalPlayer === 'function') {
          showToast('🔊 Sin soporte interno (códec/audio). Abriendo en reproductor externo...');
          openMediaInExternalPlayer(streamUrl, channel?.name || 'Contenido');
        } else {
          this.handleStreamFailInBackground();
        }
      });

      // Timeout de seguridad: si en 15s no arrancó ni metadata ni playing,
      // intentar recuperación externa (evita "pantalla negra" en películas)
      clearTimeout(this.vodStartTimer);
      this.vodStartTimer = setTimeout(() => {
        if (this.currentChannel === channel && this.video.readyState < 2) {
          console.warn('[IPTV] Arranque agotado para contenido directo; derivando a reproductor externo.');
          if (typeof openMediaInExternalPlayer === 'function') {
            this.showLoading(false);
            openMediaInExternalPlayer(streamUrl, channel?.name || 'Contenido');
          } else {
            this.handleStreamFailInBackground();
          }
        }
      }, 15000);
    }

    this.resetControlsTimeout();
  }

  // Handle stream fails: 3 silent background attempts, then terminate cycle and show inactive status
  handleStreamFailInBackground() {
    this.showLoading(false);

    if (this.bgRetryCount < this.maxBgRetries) {
      this.bgRetryCount++;
      const retryMsg = `Reintentando señal (${this.bgRetryCount}/${this.maxBgRetries})...`;
      this.showBgRetry(true, retryMsg);
      clearTimeout(this.bgRetryTimer);

      this.bgRetryTimer = setTimeout(() => {
        if (this.currentChannel) {
          console.log(`[Player] Intento ${this.bgRetryCount}/${this.maxBgRetries} para: ${this.currentChannel.name}`);
          this.play(this.currentChannel, true);
        }
      }, 2000);
    } else {
      // 3 attempts reached: TERMINATE CYCLE IMMEDIATELY!
      console.warn("[Player] Canal inactivo tras 3 reintentos. Terminando ciclo.");
      clearTimeout(this.bgRetryTimer);
      this.hideBgRetry();
      this.showLoading(false);

      if (this.hls) {
        try { this.hls.destroy(); } catch (e) {}
        this.hls = null;
      }
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();

      const deadCh = this.currentChannel;
      if (deadCh) {
        if (typeof dataService !== 'undefined' && dataService) {
          dataService.markChannelDead(deadCh.url);
        }
        if (typeof markChannelCardOffline === 'function') {
          markChannelCardOffline(deadCh.id);
        }
      }

      const chName = deadCh ? deadCh.name : 'Este canal';
      this.showError(
        "Canal temporalmente inactivo",
        `La señal de "${chName}" no respondió tras ${this.maxBgRetries} intentos. Puedes reintentar o elegir otro canal de la grilla.`
      );
      this.showToast(`⚠️ ${chName}: Canal temporalmente inactivo`);
    }
  }

  playNextChannel(isAutoSkip = false) {
    clearTimeout(this.bgRetryTimer);
    this.hideBgRetry();

    if (!allChannels || allChannels.length === 0) return;

    let currentIdx = allChannels.findIndex(c => c.url === this.currentChannel?.url || c.id === this.currentChannel?.id);
    if (currentIdx === -1) currentIdx = 0;

    let nextIdx = (currentIdx + 1) % allChannels.length;
    let attempts = 0;

    while (attempts < allChannels.length && dataService && dataService.isChannelDead(allChannels[nextIdx].url)) {
      nextIdx = (nextIdx + 1) % allChannels.length;
      attempts++;
    }

    if (attempts >= allChannels.length) {
      this.showError("No hay señales disponibles en esta lista actualmente.");
      return;
    }

    const nextCh = allChannels[nextIdx];
    if (isAutoSkip) {
      this.showToast(`Señal caída. Sintonizando: ${nextCh.name} 📺`);
    } else {
      this.showToast(`Siguiente: ${nextCh.name} 📺`);
    }
    playSelectedChannel(nextCh);
  }

  playPreviousChannel() {
    clearTimeout(this.bgRetryTimer);
    this.hideBgRetry();

    if (!allChannels || allChannels.length === 0) return;

    let currentIdx = allChannels.findIndex(c => c.url === this.currentChannel?.url || c.id === this.currentChannel?.id);
    if (currentIdx === -1) currentIdx = 0;

    let prevIdx = (currentIdx - 1 + allChannels.length) % allChannels.length;
    const prevCh = allChannels[prevIdx];
    this.showToast(`Anterior: ${prevCh.name} 📺`);
    playSelectedChannel(prevCh);
  }

  retryNow() {
    clearTimeout(this.bgRetryTimer);
    this.bgRetryCount = 0;
    if (this.currentChannel) {
      this.play(this.currentChannel);
    }
  }

  showBgRetry(show, text = 'Reconectando en segundo plano...') {
    if (this.bgRetryBadge) {
      this.bgRetryBadge.classList.toggle('hidden', !show);
      const spanEl = this.bgRetryBadge.querySelector('span');
      if (spanEl && text) spanEl.innerText = text;
    }
  }

  hideBgRetry() {
    if (this.bgRetryBadge) {
      this.bgRetryBadge.classList.add('hidden');
    }
  }

  updateQualityBadge() {
    const qBadge = document.getElementById('hud-quality-badge');
    if (!qBadge) return;
    if (this.video.videoHeight >= 1080) {
      qBadge.innerText = 'FHD';
      qBadge.classList.remove('hidden');
    } else if (this.video.videoHeight >= 720) {
      qBadge.innerText = 'HD';
      qBadge.classList.remove('hidden');
    } else if (this.video.videoHeight > 0) {
      qBadge.innerText = 'SD';
      qBadge.classList.remove('hidden');
    } else {
      qBadge.innerText = 'EN VIVO';
    }
  }

  updateChannelMetadata(channel) {
    const titleEl = document.getElementById('hud-channel-title');
    const groupEl = document.getElementById('hud-channel-group');
    const logoEl = document.getElementById('hud-channel-logo');
    const tvTitleEl = document.getElementById('tv-hud-channel-title');

    if (titleEl) titleEl.innerText = channel.name || 'Canal en vivo';
    if (tvTitleEl) tvTitleEl.innerText = channel.name || 'Canal en vivo';
    if (groupEl) groupEl.innerText = channel.group || 'General';

    if (logoEl) {
      if (channel.logo) {
        logoEl.src = channel.logo;
        logoEl.classList.remove('hidden');
      } else {
        logoEl.classList.add('hidden');
      }
    }
  }

  togglePlay() {
    if (this.video.paused) {
      this.video.play().catch(() => {});
      this.updatePlayIcon(true);
    } else {
      this.video.pause();
      this.updatePlayIcon(false);
    }
    this.resetControlsTimeout();
  }

  updatePlayIcon(isPlaying) {
    const icon = document.getElementById('btn-play-icon');
    if (icon) {
      icon.className = isPlaying ? 'fa-solid fa-pause text-2xl' : 'fa-solid fa-play text-2xl ml-1';
    }
    const tvIcon = document.getElementById('tv-btn-play-icon');
    if (tvIcon) {
      tvIcon.className = isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
    }
  }

  // Robust Fullscreen & Minimizar (Exit Fullscreen without hanging)
  toggleFullscreen() {
    const isCurrentlyFs = this.container.classList.contains('fullscreen-player') || 
                          !!document.fullscreenElement || 
                          !!document.webkitFullscreenElement;

    if (!isCurrentlyFs) {
      this.enterFullscreenMode();
    } else {
      this.exitFullscreenMode();
    }
  }

  enterFullscreenMode() {
    this.container.classList.add('fullscreen-player');
    document.body.classList.add('in-fullscreen');

    const icon = document.getElementById('btn-fs-icon');
    if (icon) icon.className = 'fa-solid fa-compress text-base';

    const minBtn = document.getElementById('btn-player-minimize');
    if (minBtn) minBtn.classList.remove('hidden');

    try {
      if (this.container.requestFullscreen) {
        this.container.requestFullscreen().catch(() => {});
      } else if (this.container.webkitRequestFullscreen) {
        this.container.webkitRequestFullscreen();
      }
    } catch (e) {}

    try {
      if (window.screen && window.screen.orientation && typeof window.screen.orientation.lock === 'function') {
        const p = window.screen.orientation.lock('landscape');
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (e) {}

    this.showToast("Pantalla Completa 🖥️");
    this.resetControlsTimeout();
  }

  exitFullscreenMode() {
    // 1. Remove CSS classes first (Guarantees immediate visual exit!)
    this.container.classList.remove('fullscreen-player');
    document.body.classList.remove('in-fullscreen');

    const icon = document.getElementById('btn-fs-icon');
    if (icon) icon.className = 'fa-solid fa-expand text-base';

    const minBtn = document.getElementById('btn-player-minimize');
    if (minBtn) minBtn.classList.add('hidden');

    // 2. Safely exit HTML5 Fullscreen without blocking
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      try {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      } catch (e) {}
    }

    // 3. Unlock orientation safely
    try {
      if (window.screen && window.screen.orientation && typeof window.screen.orientation.unlock === 'function') {
        const p = window.screen.orientation.unlock();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (e) {}

    this.showToast("Vista normal");
    this.resetControlsTimeout();
  }

  togglePiP() {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    } else if (document.pictureInPictureEnabled && this.video) {
      this.video.requestPictureInPicture().catch(() => {});
    }
    this.resetControlsTimeout();
  }

  toggleAspectRatio() {
    this.currentAspectIdx = (this.currentAspectIdx + 1) % this.aspectRatios.length;
    const mode = this.aspectRatios[this.currentAspectIdx];
    const label = this.aspectLabels[this.currentAspectIdx];
    this.video.style.objectFit = mode;
    this.showToast(`Relación: ${label}`);
    this.resetControlsTimeout();
  }

  toggleLock() {
    this.isLocked = !this.isLocked;
    const lockShield = document.getElementById('player-lock-shield');
    const lockIcon = document.getElementById('btn-lock-icon');

    if (this.isLocked) {
      this.overlay.classList.add('hidden-controls');
      if (lockShield) lockShield.classList.remove('hidden');
      if (lockIcon) lockIcon.className = 'fa-solid fa-lock text-amber-400';
      this.showToast("Pantalla bloqueada 🔒");
    } else {
      if (lockShield) lockShield.classList.add('hidden');
      if (lockIcon) lockIcon.className = 'fa-solid fa-lock-open text-white';
      this.overlay.classList.remove('hidden-controls');
      this.showToast("Pantalla desbloqueada 🔓");
      this.resetControlsTimeout();
    }
  }

  // Sleep Timer (15, 30, 45, 60, 90 min)
  setSleepTimer(minutes) {
    clearInterval(this.sleepTimerInterval);
    const badge = document.getElementById('player-sleep-badge');

    if (minutes <= 0) {
      this.sleepTimeRemaining = 0;
      if (badge) badge.classList.add('hidden');
      this.showToast("Temporizador desactivado");
      return;
    }

    this.sleepTimeRemaining = minutes * 60;
    if (badge) {
      badge.classList.remove('hidden');
      badge.innerHTML = `<i class="fa-solid fa-moon text-purple-400"></i> ${minutes}m`;
    }
    this.showToast(`Apagado en ${minutes} minutos 🌙`);

    this.sleepTimerInterval = setInterval(() => {
      this.sleepTimeRemaining--;
      if (this.sleepTimeRemaining <= 0) {
        clearInterval(this.sleepTimerInterval);
        this.video.pause();
        if (badge) badge.classList.add('hidden');
        this.showToast("Modo reposo: Reproducción detenida 😴");
      } else {
        const mins = Math.ceil(this.sleepTimeRemaining / 60);
        if (badge) badge.innerHTML = `<i class="fa-solid fa-moon text-purple-400"></i> ${mins}m`;
      }
    }, 1000);
  }

  initTouchGestures() {
    let startX = 0;
    let startY = 0;
    let isTracking = false;
    let gestureType = null;
    let lastTap = 0;

    const el = this.container;

    el.addEventListener('touchstart', (e) => {
      if (this.isLocked) return;
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        isTracking = true;

        const rect = el.getBoundingClientRect();
        const touchXRelative = startX - rect.left;
        gestureType = touchXRelative < rect.width / 2 ? 'brightness' : 'volume';

        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        if (tapLength < 280 && tapLength > 50) {
          if (touchXRelative < rect.width * 0.35) {
            this.playPreviousChannel();
          } else if (touchXRelative > rect.width * 0.65) {
            this.playNextChannel();
          } else {
            this.togglePlay();
          }
          e.preventDefault();
        }
        lastTap = currentTime;
      }
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (!isTracking || this.isLocked || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const deltaY = startY - touch.clientY;

      if (Math.abs(deltaY) > 15) {
        const step = deltaY / 300;
        if (gestureType === 'brightness') {
          this.adjustBrightness(step);
        } else {
          this.adjustVolume(step);
        }
        startY = touch.clientY;
      }
    }, { passive: true });

    el.addEventListener('touchend', () => {
      isTracking = false;
      gestureType = null;
      setTimeout(() => this.hideHUD(), 1200);
    });

    this.container.addEventListener('click', (e) => {
      if (this.isLocked) return;
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;

      if (this.overlay.classList.contains('hidden-controls')) {
        this.overlay.classList.remove('hidden-controls');
        this.resetControlsTimeout();
      } else {
        this.overlay.classList.add('hidden-controls');
      }
    });
  }

  adjustBrightness(delta) {
    this.brightness = Math.min(1.0, Math.max(0.15, this.brightness + delta));
    this.video.style.filter = `brightness(${this.brightness})`;
    const pct = Math.round(this.brightness * 100);
    this.showHUD('fa-solid fa-sun text-yellow-400', pct);
  }

  adjustVolume(delta) {
    this.volume = Math.min(1.0, Math.max(0.0, this.video.volume + delta));
    this.video.volume = this.volume;
    const pct = Math.round(this.volume * 100);
    const icon = pct === 0 ? 'fa-solid fa-volume-xmark text-red-400' : (pct < 50 ? 'fa-solid fa-volume-low text-blue-400' : 'fa-solid fa-volume-high text-blue-400');
    this.showHUD(icon, pct);
  }

  showHUD(iconClass, percent) {
    if (!this.hud) return;
    this.hudIcon.className = iconClass + ' text-xl';
    this.hudBar.style.width = `${percent}%`;
    this.hudText.innerText = `${percent}%`;
    this.hud.classList.add('show');
  }

  hideHUD() {
    if (this.hud) this.hud.classList.remove('show');
  }

  resetControlsTimeout() {
    clearTimeout(this.controlsTimer);
    if (!this.isLocked) {
      this.overlay.classList.remove('hidden-controls');
      this.controlsTimer = setTimeout(() => {
        if (!this.video.paused && !this.isLocked) {
          this.overlay.classList.add('hidden-controls');
        }
      }, 4200);
    }
  }

  initVideoEvents() {
    this.video.addEventListener('loadedmetadata', () => {
      console.log('[IPTV] LOADED METADATA:', {
        width: this.video.videoWidth,
        height: this.video.videoHeight,
        duration: this.video.duration
      });
      this.updateQualityBadge();
    });

    this.video.addEventListener('playing', () => {
      console.log('[IPTV] VIDEO PLAYING');
      clearTimeout(this.vodStartTimer); // arranque OK: cancelar watchdog externo
      this.showLoading(false);
      this.hideError();
      this.hideBgRetry();
      this.updatePlayIcon(true);
      this.updateQualityBadge();
    });

    this.video.addEventListener('pause', () => {
      this.updatePlayIcon(false);
      this.overlay.classList.remove('hidden-controls');
    });

    this.video.addEventListener('waiting', () => {
      console.warn('[IPTV] VIDEO WAITING');
      this.showLoading(true);
    });

    this.video.addEventListener('error', () => {
      console.error('[IPTV] VIDEO ERROR:', {
        code: this.video.error?.code,
        message: this.video.error?.message,
        source: this.video.currentSrc,
        networkState: this.video.networkState,
        readyState: this.video.readyState
      });
    });

    const onFsChange = () => {
      const isFs = !!document.fullscreenElement || !!document.webkitFullscreenElement;
      if (!isFs && !this.container.classList.contains('fullscreen-player')) {
        document.body.classList.remove('in-fullscreen');
        const icon = document.getElementById('btn-fs-icon');
        if (icon) icon.className = 'fa-solid fa-expand text-base';
        const minBtn = document.getElementById('btn-player-minimize');
        if (minBtn) minBtn.classList.add('hidden');
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
  }

  showLoading(show) {
    if (this.loading) this.loading.classList.toggle('hidden', !show);
  }

  showIdleState(countryName = 'Canales en vivo', channelCount = 0) {
    this.showLoading(false);
    this.hideError();
    this.hideBgRetry();
    const idleEl = document.getElementById('player-idle');
    const idleSub = document.getElementById('player-idle-sub');
    const idleTitle = document.getElementById('player-idle-title');
    if (idleTitle) idleTitle.innerText = countryName;
    if (idleSub) idleSub.innerText = channelCount > 0 
      ? `${channelCount} canales disponibles. Toca cualquier canal para reproducir.`
      : "Selecciona un canal de la lista para iniciar la reproducción.";
    if (idleEl) idleEl.classList.remove('hidden');
  }

  hideIdle() {
    const idleEl = document.getElementById('player-idle');
    if (idleEl) idleEl.classList.add('hidden');
  }

  showError(title = "Canal no disponible", detail = "Por favor elige otro canal o actualiza la lista.") {
    if (this.errorOverlay) {
      if (this.errorText) {
        this.errorText.innerHTML = `
          <span class="font-bold text-amber-400 text-sm block mb-1">${title}</span>
          <span class="text-gray-300 text-[11px] leading-relaxed block">${detail}</span>
        `;
      }
      this.errorOverlay.classList.remove('hidden');
    }
  }

  hideError() {
    if (this.errorOverlay) this.errorOverlay.classList.add('hidden');
  }

  showToast(msg) {
    if (typeof showToast === 'function') {
      showToast(msg);
    }
  }

  // Audio & Subtitles Tracks Management
  getAudioTracks() {
    if (this.hls && this.hls.audioTracks && this.hls.audioTracks.length > 0) {
      return this.hls.audioTracks.map((t, idx) => ({
        id: idx,
        name: t.name || t.lang || `Pista ${idx + 1}`,
        lang: t.lang || '',
        active: this.hls.audioTrack === idx
      }));
    }
    if (this.video && this.video.audioTracks && this.video.audioTracks.length > 0) {
      const tracks = [];
      for (let i = 0; i < this.video.audioTracks.length; i++) {
        const t = this.video.audioTracks[i];
        tracks.push({
          id: i,
          name: t.label || t.language || `Audio ${i + 1}`,
          lang: t.language || '',
          active: t.enabled
        });
      }
      return tracks;
    }
    return [];
  }

  getSubtitleTracks() {
    if (this.hls && this.hls.subtitleTracks && this.hls.subtitleTracks.length > 0) {
      return this.hls.subtitleTracks.map((t, idx) => ({
        id: idx,
        name: t.name || t.lang || `Subtítulo ${idx + 1}`,
        lang: t.lang || '',
        active: this.hls.subtitleTrack === idx
      }));
    }
    if (this.video && this.video.textTracks && this.video.textTracks.length > 0) {
      const tracks = [];
      for (let i = 0; i < this.video.textTracks.length; i++) {
        const t = this.video.textTracks[i];
        tracks.push({
          id: i,
          name: t.label || t.language || `Subtítulo ${i + 1}`,
          lang: t.language || '',
          active: t.mode === 'showing'
        });
      }
      return tracks;
    }
    return [];
  }

  setAudioTrack(trackId) {
    if (this.hls && this.hls.audioTracks) {
      this.hls.audioTrack = trackId;
      console.log('[IPTV] Pista de audio cambiada a:', trackId);
      this.renderTracksUI();
      return;
    }
    if (this.video && this.video.audioTracks) {
      for (let i = 0; i < this.video.audioTracks.length; i++) {
        this.video.audioTracks[i].enabled = (i === trackId);
      }
      this.renderTracksUI();
    }
  }

  setSubtitleTrack(trackId) {
    if (this.hls && this.hls.subtitleTracks) {
      this.hls.subtitleTrack = trackId; // -1 to disable
      console.log('[IPTV] Subtítulo cambiado a:', trackId);
      this.renderTracksUI();
      return;
    }
    if (this.video && this.video.textTracks) {
      for (let i = 0; i < this.video.textTracks.length; i++) {
        this.video.textTracks[i].mode = (i === trackId) ? 'showing' : 'disabled';
      }
      this.renderTracksUI();
    }
  }

  openTracksModal() {
    const modal = document.getElementById('modal-audio-subtitles');
    if (!modal) return;
    this.renderTracksUI();
    modal.classList.add('show', 'active');
  }

  closeTracksModal() {
    const modal = document.getElementById('modal-audio-subtitles');
    if (modal) modal.classList.remove('show', 'active');
  }

  renderTracksUI() {
    const audioContainer = document.getElementById('player-audio-tracks-list');
    const subContainer = document.getElementById('player-subtitle-tracks-list');
    if (!audioContainer || !subContainer) return;

    // 1. Audio Tracks
    const audioTracks = this.getAudioTracks();
    audioContainer.innerHTML = '';
    if (audioTracks.length === 0) {
      audioContainer.innerHTML = `
        <div class="p-2.5 bg-gray-900/60 rounded-xl text-[11px] text-gray-400 flex items-center justify-between">
          <span>Audio Estéreo / Por defecto</span>
          <i class="fa-solid fa-check text-blue-400"></i>
        </div>
      `;
    } else {
      audioTracks.forEach(t => {
        const item = document.createElement('div');
        item.className = `p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition ${t.active ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-300 hover:bg-gray-800'}`;
        item.innerHTML = `
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-volume-high text-xs"></i>
            <span>${t.name}</span>
          </div>
          ${t.active ? '<i class="fa-solid fa-check text-xs"></i>' : ''}
        `;
        item.onclick = () => this.setAudioTrack(t.id);
        audioContainer.appendChild(item);
      });
    }

    // 2. Subtitle Tracks
    const subTracks = this.getSubtitleTracks();
    subContainer.innerHTML = '';
    
    // "Desactivados" option
    const isNoneActive = (this.hls ? this.hls.subtitleTrack === -1 : true);
    const noneItem = document.createElement('div');
    noneItem.className = `p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition ${isNoneActive ? 'bg-yellow-500 text-black' : 'bg-gray-900 text-gray-300 hover:bg-gray-800'}`;
    noneItem.innerHTML = `
      <span>Desactivados</span>
      ${isNoneActive ? '<i class="fa-solid fa-check text-xs"></i>' : ''}
    `;
    noneItem.onclick = () => this.setSubtitleTrack(-1);
    subContainer.appendChild(noneItem);

    if (subTracks.length > 0) {
      subTracks.forEach(t => {
        const item = document.createElement('div');
        item.className = `p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition ${t.active ? 'bg-yellow-500 text-black' : 'bg-gray-900 text-gray-300 hover:bg-gray-800'}`;
        item.innerHTML = `
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-closed-captioning text-xs"></i>
            <span>${t.name}</span>
          </div>
          ${t.active ? '<i class="fa-solid fa-check text-xs"></i>' : ''}
        `;
        item.onclick = () => this.setSubtitleTrack(t.id);
        subContainer.appendChild(item);
      });
    }
  }

  openCurrentInExternalPlayer() {
    this.closeTracksModal();
    if (!this.currentChannel || !this.currentChannel.url) {
      alert("No hay ningún contenido reproduciéndose actualmente.");
      return;
    }
    if (typeof openMediaInExternalPlayer === 'function') {
      openMediaInExternalPlayer(this.currentChannel.url, this.currentChannel.name || 'Contenido IPTV');
    }
  }

  // FASE 2: Métodos auxiliares de audio y derivación externa
  collectHlsAudioTracks() {
    const tracks = this.getAudioTracks();
    this.audioTrackInfo = {
      tracks: tracks,
      source: 'hlsjs'
    };
    console.log('[IPTV] Pistas de audio HLS recolectadas:', tracks);
    return tracks;
  }

  isVodOrCodecSensitive() {
    if (!this.currentChannel) return false;
    const type = this.currentChannel.type;
    if (type === 'vod' || type === 'series' || type === 'episode') return true;
    const url = this.currentChannel.url || '';
    return /\.(mp4|mkv|avi|mov|wmv|flv|ts)(?:$|[?#])/i.test(url);
  }

  _redirectToExternalPlayer(msg = 'Abriendo en reproductor externo...') {
    if (this._externalRedirected) return;
    this._externalRedirected = true;
    this.showLoading(false);
    if (msg && typeof showToast === 'function') {
      showToast(msg);
    }
    if (this.currentChannel && this.currentChannel.url && typeof openMediaInExternalPlayer === 'function') {
      openMediaInExternalPlayer(this.currentChannel.url, this.currentChannel.name || 'Contenido');
    }
  }
}

// =========================================================
// Diagnóstico Temporal de Audio & Pistas
// =========================================================
function diagnoseVideoAudio(video) {
  if (!video) return;

  console.log('[AUDIO DIAGNOSTIC]', {
    muted: video.muted,
    volume: video.volume,
    paused: video.paused,
    source: video.currentSrc,
    readyState: video.readyState,
    networkState: video.networkState,
    error: video.error?.message || null
  });

  video.addEventListener('loadedmetadata', () => {
    console.log('[AUDIO METADATA]', {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      audioTracksAvailable: video.audioTracks
        ? video.audioTracks.length
        : 'API no disponible'
    });
  });

  video.addEventListener('playing', () => {
    console.log('[AUDIO PLAYING]', {
      muted: video.muted,
      volume: video.volume
    });
  });
}

window.diagnoseVideoAudio = diagnoseVideoAudio;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    diagnoseVideoAudio(document.getElementById('main-video'));
  });
} else {
  diagnoseVideoAudio(document.getElementById('main-video'));
}