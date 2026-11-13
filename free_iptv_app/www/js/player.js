// =========================================================
// Free-IPTV Pro - Video Player Engine (REESCRITO)
// Reproducción interna prioritaria para VOD/Series/TV
// Auto-ocultar controles, restaurar audio, rotación automática
// =========================================================

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
    this.isExoPlayerActive = false; // FASE: saber si ExoPlayer nativo está al frente

    // Sleep Timer
    this.sleepTimerInterval = null;
    this.sleepTimeRemaining = 0;

    // Background auto-reconnect & silent skip
    this.bgRetryCount = 0;
    this.maxBgRetries = 3;
    this.bgRetryTimer = null;

    // FASE 2: estado de audio
    this.audioTrackInfo = null;
    this._externalRedirected = false;
    this._ffmpegRetried = false;
    this._codecFailCount = 0;

    // Auto-ocultar controles
    this.controlsVisible = true;
    this.CONTROLS_HIDE_DELAY = 3000; // 3 segundos sin tocar

    this.initTouchGestures();
    this.initVideoEvents();
    this.initVisibilityHandler(); // Restaurar audio al volver de VLC
    this.initRotationHandler();   // Rotación automática
    this.initExoListener();       // Sincronizar estado del reproductor nativo
    this.initHardwareVolumeKeys(); // Botones fisicos de volumen del dispositivo
  }

  // Mantiene sincronizado el estado del reproductor nativo (Media3) con la UI web
  initExoListener() {
    if (!window.exoPlayerPlugin) return;
    window.exoPlayerPlugin.on('playbackStateChanged', (data) => {
      if (!data) return;
      // STATE_ENDED (4) o STATE_IDLE (1): el player nativo dejo de reproducir.
      // Si el stop fue solicitado por nosotros (play() cambiando de canal) el flag
      // ya fue reseteado: no tocarlo aqui para no dejar al player nativo "vivo"
      // logicamente y disparar un stop() recursivo.
      if (data.state === 4 || data.state === 1) {
        if (this._exoStopRequested) {
          this._exoStopRequested = false;
          this.isExoPlayerActive = false;
          return;
        }
        this.isExoPlayerActive = false;
        this.updatePlayIcon(false);
        this.showControls();
      }
    });
    window.exoPlayerPlugin.on('playbackError', (data) => {
      console.error('[IPTV] Error del reproductor nativo:', data && data.error);
      this.isExoPlayerActive = false;
      this.showControls();

      // FASE 2: si el fallo es de DECODIFICACION de audio se reintenta con el
      // renderer FFmpeg software (EXTENSION_RENDERER_MODE_PREFER). Normalmente
      // no haria falta: ExoPlayerPlugin YA oculta AC-3/E-AC-3 del decoder
      // hardware, asi que el renderer FFmpeg recibe el track desde el primer
      // intento. Este reintento es la red de seguridad por si acaso.
      const audioFail = data && (data.audioDecodeFailed || /decoder|decode|ac-3|eac3|ac3/i.test(data.error || ''));
      if (audioFail && !this._ffmpegRetried && this.currentChannel && this.currentChannel.url) {
        console.warn('[IPTV] Decodificacion de audio fallida; reintentando con FFmpeg software.');
        this._ffmpegRetried = true;
        if (typeof showToast === 'function') {
          showToast('🎧 Codec no soportado por el dispositivo. Reintentando con decodificador software...');
        }
        this.playWithExo(this.currentChannel.url, this.currentChannel, this._playToken, 2)
          .then(ok => { if (!ok) this._ffmpegRetried = false; })
          .catch(() => { this._ffmpegRetried = false; });
        return;
      }

      // Si tampoco hay motor software disponible, se deriva a VLC/MX Player:
      // mejor un reproductor externo con sonido que una pantalla muda.
      const audioFail2 = data && (data.audioDecodeFailed || /decoder|decode|ac-3|eac3|ac3/i.test(data.error || ''));
      if (audioFail2 && !this._externalRedirected && typeof openMediaInExternalPlayer === 'function') {
        console.warn('[IPTV] Audio no decodificable; delegando a reproductor externo.');
        this._externalRedirected = true;
        if (typeof showToast === 'function') {
          showToast('🔊 Dolby no compatible con este dispositivo. Abriendo en VLC...');
        }
        if (this.currentChannel && this.currentChannel.url) {
          openMediaInExternalPlayer(this.currentChannel.url, this.currentChannel.name || 'Contenido');
        }
      }
    });
  }

  // =========================================================
  // VISIBILITY: Restaurar audio al volver de reproductor externo (VLC/MX Player)
  // =========================================================
  initVisibilityHandler() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;           // solo nos interesa al volver
      if (!this.currentChannel) return;

      // ExoPlayer nativo activo: si su superficie ya no está en primer plano,
      // liberar el estado (si no, la app cree que sigue reproduciendo).
      if (this.isExoPlayerActive) {
        this.isExoPlayerActive = false;
        this.showControls();
        return;
      }

      // NO recargar el canal solo por volver al primer plano.
      // Con HLS.js el `currentSrc` suele estar vacío hasta que carga el manifiesto,
      // y recargarlo reiniciaba la transmisión en vivo (el usuario veía el corte).
      // Solo se reintenta si el elemento de video esta REALMENTE en error.
      if (this.video.error) {
        console.log('[IPTV] Video en error al volver al primer plano; reintentando.');
        this.play(this.currentChannel, true);
      } else if (this.video.readyState >= 2 && this.video.paused) {
        this.video.play().catch(() => {});
      }
    });

    // Escuchar evento custom cuando ExoPlayer termine o vuelva de externo
    window.addEventListener('freeiptv:resume-playback', () => {
      if (this.currentChannel && !this.isExoPlayerActive) {
        console.log('[IPTV] Reanudando playback tras volver de externo');
        this.play(this.currentChannel, true);
      }
    });
  }

  // =========================================================
  // ROTACIÓN: Bloquear landscape al reproducir, desbloquear al salir
  // =========================================================
  initRotationHandler() {
    // Detectar cambio de orientación y ajustar UI
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        this.adjustPlayerForOrientation();
      }, 100);
    });

    window.matchMedia('(orientation: landscape)').addEventListener('change', (e) => {
      setTimeout(() => {
        this.adjustPlayerForOrientation();
      }, 100);
    });
  }

  adjustPlayerForOrientation() {
    const isLandscape = window.innerWidth > window.innerHeight;
    const isSmallScreen = window.innerWidth <= 600; // Teléfonos pequeños

    if (this.currentChannel && this.container) {
      if (isLandscape || isSmallScreen) {
        // Aprovechar pantalla máxima en móviles pequeños y landscape
        this.container.style.width = '100vw';
        this.container.style.height = '100vh';
        this.container.style.maxHeight = 'none';
        this.container.style.borderRadius = '0';
      } else {
        this.container.style.width = '';
        this.container.style.height = '';
        this.container.style.maxHeight = '';
        this.container.style.borderRadius = '';
      }
    }

    // Reubicar la superficie de video nativa (si ExoPlayer está activo)
    if (this.isExoPlayerActive && window.exoPlayerPlugin) {
      setTimeout(() => {
        window.exoPlayerPlugin.setLayout(this.getPlayerLayout());
      }, 160);
    }
  }

  // =========================================================
  // CONTROLES: Auto-ocultar e iconos
  // =========================================================
  // NOTA: showControls() NO debe llamar a resetControlsTimeout().
  // resetControlsTimeout() ya invoca showControls(); si ambos se llaman
  // mutuamente se produce recursión infinita (stack overflow) al reproducir.
  showControls() {
    this.controlsVisible = true;
    this.overlay.classList.remove('controls-hidden');
    this.overlay.classList.add('controls-visible');

    const minBtn = document.getElementById('btn-player-minimize');
    const isFs = this.container.classList.contains('fullscreen-player');
    if (minBtn) {
      if (isFs) minBtn.classList.remove('hidden');
      else minBtn.classList.add('hidden');
    }
  }

  hideControls() {
    if (this.isLocked) return;
    this.controlsVisible = false;
    this.overlay.classList.add('controls-hidden');
    this.overlay.classList.remove('controls-visible');

    const minBtn = document.getElementById('btn-player-minimize');
    if (minBtn) minBtn.classList.add('hidden');
  }

  toggleControls() {
    if (this.controlsVisible) {
      this.hideControls();
    } else {
      // resetControlsTimeout() muestra los controles y programa el auto-ocultado
      this.resetControlsTimeout();
    }
  }

  resetControlsTimeout() {
    clearTimeout(this.controlsTimer);
    this.showControls(); // Siempre mostrar al interactuar
    if (!this.video.paused && !this.isLocked) {
      this.controlsTimer = setTimeout(() => {
        this.hideControls();
      }, this.CONTROLS_HIDE_DELAY);
    }
  }

  // =========================================================
  // PLAY: Reproducción interna prioritaria para TODO el contenido
  // =========================================================
  async play(channel, isSilentBg = false) {
    if (!channel || !channel.url) return;

    // Guard de reentrada: cada play() invalida los callbacks asincronos del
    // anterior (evita que un play() viejo pise al nuevo -> bucle de estados).
    this._playToken = (this._playToken || 0) + 1;
    const token = this._playToken;

    // =========================================================
    // DETENER EL REPRODUCTOR NATIVO (ExoPlayer) SI ESTA ACTIVO
    // IMPORTANTE: va ANTES de resetear el flag. Si el flag se resetea primero,
    // el stop() nunca se ejecuta, la superficie nativa sigue visible y sonando
    // ENCIMA del reproductor web -> imposible cambiar de canal (bucle).
    // =========================================================
    if (this.isExoPlayerActive && window.exoPlayerPlugin) {
      this._exoStopRequested = true;
      try { await window.exoPlayerPlugin.stop(); } catch (e) {}
    }
    this.isExoPlayerActive = false;

    this.currentChannel = channel;
    this.hideIdle();

    this._externalRedirected = false;
    this._ffmpegRetried = false;
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
      try { this.hls.destroy(); } catch (e) {}
      this.hls = null;
    }

    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.video.muted = false;
    this.video.volume = 1.0;
    // Se resetea tambien el volumen interno: si un play anterior lo dejo a 0
    // (por ejemplo tras pulsar el boton fisico de volumen), el canal nuevo
    // arrancaba MUDO aunque el <video> recibiese volumen 1.0.
    this.volume = 1.0;

    const isM3U8 = /\.m3u8(?:$|[?#])/i.test(streamUrl);
    const isVodExt = /\.(mp4|mkv|avi|mov|m4v|wmv|flv|webm|ts|m2ts|mpg|mpeg)(?:$|[?#])/i.test(streamUrl);
    const isMP4 = /\.mp4(?:$|[?#])/i.test(streamUrl);
    const isTS = /\.ts(?:$|[?#])/i.test(streamUrl);
    const isVod = channel.type === 'vod' || channel.type === 'episode' || channel.type === 'series';

    // Contadores de reintento: se reinician en cada cambio de canal
    this._hlsNetworkRetries = 0;
    this._codecFailCount = 0;

    // =========================================================
    // DECISIÓN DE MOTOR DE REPRODUCCIÓN
    // - MOTOR 1: WebView (HLS.js)  -> TV en directo, rapido y barato
    // - MOTOR 2: Media3/ExoPlayer -> HLS/DASH, MP4/TS con AAC/AC-3 nativo
    //   + extension FFmpeg software (E-AC-3 5.1, TrueHD, DTS) como RESERVA:
    //     si el MediaCodec del dispositivo no decodifica el codec, Media3 cae
    //     automaticamente al decodificador software y sigue sonando.
    // - El usuario puede forzar el modo desde Ajustes (auto | web | native | ffmpeg).
    // =========================================================
    const enginePref = this.getEnginePreference();
    const exoAvailable = !!(window.exoPlayerPlugin && window.exoPlayerPlugin.available);
    const forceNative = (enginePref === 'native');
    const forceWeb = (enginePref === 'web');
    // Modo del renderer de extension FFmpeg:
    //   0 = OFF (solo hardware) | 1 = ON (hardware + FFmpeg de reserva) | 2 = PREFER (FFmpeg primero)
    const extensionMode = this.getExtensionRendererMode();

    // Contenedores/codecs que el WebView NO puede reproducir
    const hardFormat = isTS || /\.(mkv|avi|wmv|flv|m4v|mov)(?:$|[?#])/i.test(streamUrl);

    const needsExo = exoAvailable && !forceWeb && (
      forceNative ||
      isVod ||
      hardFormat ||
      isVodExt
    );

    // [MOD VOD] Forzamos bypass total del HTML5 para VOD y pasamos a ExoPlayer.
    if (needsExo) {
      console.log('[IPTV] Derivando directamente a ExoPlayer (VOD o Ext incompatible)');
      this.showLoading(false);
      const started = await this.playWithExo(streamUrl, channel, token, extensionMode);
      if (started) {
        this.resetControlsTimeout();
        return;
      }
      // Si ExoPlayer no pudo arrancar, se cae al flujo HTML5 de abajo.
      console.warn('[IPTV] ExoPlayer no arranco, cayendo al flujo HTML5 (Posible error de codec o HLS)');
    }

    // Guardar origen para fragmentos relativos
    try {
      const uObj = new URL(streamUrl);
      window._activeStreamOrigin = uObj.origin;
      window._activeStreamBase = streamUrl.substring(0, streamUrl.lastIndexOf('/') + 1);
    } catch (e) {
      window._activeStreamOrigin = '';
      window._activeStreamBase = '';
    }

    const onPlaybackStarted = () => {
      // Guard de reentrada: si se lanzo otro play() mientras tanto, abortar.
      if (token !== this._playToken) {
        console.log('[IPTV] play() obsoleto, ignorando callback de arranque');
        return;
      }
      console.log('[IPTV] Reproducción iniciada con éxito (HTML5)');
      this.showLoading(false);
      this.hideError();
      this.hideBgRetry();
      this.bgRetryCount = 0;
      this.updatePlayIcon(true);
      this.updateQualityBadge();
      this.showControls();
      this.resetControlsTimeout();
      this.adjustPlayerForOrientation();
    };

    // =========================================================
    // 1. HLS (.m3u8) - Usar HLS.js siempre para mejor compatibilidad
    // =========================================================
    if (isM3U8 && typeof Hls !== 'undefined' && Hls.isSupported()) {
      console.log('[IPTV] Usando HLS.js para:', streamUrl);

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

      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        onPlaybackStarted();
        try { this.collectHlsAudioTracks(); } catch (e) {}
        this.video.play().catch(error => {
          console.error('[IPTV] Error video.play():', error);
        });
      });

      this.hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('[IPTV] HLS ERROR:', data.details, data.fatal);
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // startLoad() sin limite reintenta en bucle y deja la app colgada.
            // Limitar los reintentos y luego pasar al flujo de error normal.
            this._hlsNetworkRetries = (this._hlsNetworkRetries || 0) + 1;
            if (this._hlsNetworkRetries <= 3) {
              console.warn('[IPTV] Error de red HLS, reintento ' + this._hlsNetworkRetries + '/3');
              this.hls.startLoad();
            } else {
              this.showLoading(false);
              this.handleStreamFailInBackground();
            }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            this._codecFailCount++;
            // Solo derivar a ExoPlayer si HTML5 falló 2 veces y es VOD/Series
            if (this._codecFailCount >= 2 && this.isVodOrCodecSensitive()) {
              this.playWithExo(streamUrl, channel);
              return;
            }
            this.hls.recoverMediaError();
          } else {
            this.showLoading(false);
            this.handleStreamFailInBackground();
          }
        }
      });

      // Pre-resolución de redirecciones 302 para HLS
      let effectiveStreamUrl = streamUrl;
      try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
          const preCheck = await window.Capacitor.Plugins.CapacitorHttp.get({
            url: streamUrl,
            headers: { 'User-Agent': 'IPTVSmartersPro', 'Range': 'bytes=0-0' },
            connectTimeout: 8000,
            readTimeout: 8000
          });
          if (preCheck && preCheck.url && preCheck.url.startsWith('http')) {
            effectiveStreamUrl = preCheck.url;
          }
        }
      } catch (e) {}

      try {
        const uObj = new URL(effectiveStreamUrl);
        window._activeStreamOrigin = uObj.origin;
        window._activeStreamBase = effectiveStreamUrl.substring(0, effectiveStreamUrl.lastIndexOf('/') + 1);
      } catch (e) {}

      this.hls.loadSource(effectiveStreamUrl);
      this.hls.attachMedia(this.video);

    } else {
      // =========================================================
      // 2. REPRODUCCIÓN DIRECTA (MP4, TS, MKV, AVI, etc.) - HTML5 nativo
      // =========================================================
      console.log('[IPTV] Usando reproducción directa HTML5:', streamUrl);

      this.video.muted = false;
      this.video.volume = 1.0;
      this.video.src = streamUrl;
      this.video.load();

      this.video.play().then(() => {
        onPlaybackStarted();
      }).catch(async (error) => {
        // Guard de reentrada: si el usuario ya cambio de canal, abortar.
        if (token !== this._playToken) {
          console.log('[IPTV] Error de play() obsoleto, ignorando');
          return;
        }
        console.error('[IPTV] Error en reproducción directa:', error);

        const errName = error && error.name ? error.name : '';
        const isType = channel && (channel.type === 'vod' || channel.type === 'episode' || channel.type === 'series');

        // Si falló por códec o es VOD/Series, intentar ExoPlayer nativo (fallback real)
        if (errName === 'NotSupportedError' || isType) {
          await this.playWithExo(streamUrl, channel, token);
          return;
        }

        // Para canales en vivo que fallen, usar ExoPlayer o externo
        if ((errName === 'NotSupportedError' || isType) && window.exoPlayerPlugin && window.exoPlayerPlugin.available) {
          try {
            await this.playWithExo(streamUrl, channel, token);
            return;
          } catch (e) {
            console.warn('[IPTV] ExoPlayer no disponible:', e.message);
          }
        }

        if (typeof openMediaInExternalPlayer === 'function') {
          showToast('🔊 Sin soporte interno. Abriendo en reproductor externo...');
          openMediaInExternalPlayer(streamUrl, channel?.name || 'Contenido');
        } else {
          this.handleStreamFailInBackground();
        }
      });

      // Timeout de seguridad: si en 15s no arrancó el contenido DIRECTO de VOD,
      // probar ExoPlayer nativo.
      // NO se aplica a TV en vivo: un canal lento o un pico de red NO debe
      // reiniciar la transmisión (provocaba cortes constantes).
      clearTimeout(this.vodStartTimer);
      if (isVod) {
        this.vodStartTimer = setTimeout(() => {
          // Guard de reentrada: solo si este play() sigue siendo el vigente.
          if (token !== this._playToken) return;
          if (this.currentChannel === channel && this.video.readyState < 2 && !this.isExoPlayerActive) {
            console.warn('[IPTV] Arranque de VOD agotado; probando ExoPlayer nativo.');
            this.playWithExo(streamUrl, channel, token);
          }
        }, 15000);
      }
    }

    this.resetControlsTimeout();
  }

  // =========================================================
  // STOP: cancela toda la reproduccion (web + nativa) y limpia el estado.
  // Usado al cambiar de modo, cerrar la app o cambiar de categoria.
  // =========================================================
  async stopPlayback() {
    this._playToken = (this._playToken || 0) + 1;

    clearTimeout(this.bgRetryTimer);
    clearTimeout(this.vodStartTimer);
    clearTimeout(this.controlsTimer);

    if (this.hls) {
      try { this.hls.destroy(); } catch (e) {}
      this.hls = null;
    }

    if (this.isExoPlayerActive && window.exoPlayerPlugin) {
      this._exoStopRequested = true;
      try { await window.exoPlayerPlugin.stop(); } catch (e) {}
    }
    this.isExoPlayerActive = false;

    try {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    } catch (e) {}

    this.bgRetryCount = 0;
    this._hlsNetworkRetries = 0;
    this._codecFailCount = 0;
    this.currentChannel = null;
    this.updatePlayIcon(false);
  }

  // =========================================================
  // EXOPLAYER NATIVO: reproduce dentro de la misma pantalla de la app
  // (superficie de video nativa superpuesta al WebView) -> AC-3 con audio
  // =========================================================
  async playWithExo(url, channel, token = this._playToken, extensionMode = 1) {
    if (!window.exoPlayerPlugin || !window.exoPlayerPlugin.available) return false;

    try {
      this.isExoPlayerActive = true;

      // El <video> HTML5 queda sin contenido y en silencio: la superficie nativa
      // lo covers. Ademas se libera el audio focus del WebView (si lo retiene,
      // ExoPlayer lo pierde y el video se reproduce MUDO).
      try {
        this.video.pause();
        this.video.src = '';
        this.video.removeAttribute('src');
        this.video.load();
        this.video.muted = true;
        this.video.volume = 0;
      } catch (e) {}

      // Breve espera: el WebView necesita soltar el audio focus antes de que
      // arranque el reproductor nativo.
      await new Promise(r => setTimeout(r, 400));

      const layout = this.getPlayerLayout();
      await window.exoPlayerPlugin.play(url, channel.name || 'Contenido', layout, extensionMode);

      // Sincroniza el volumen interno con el reproductor nativo (si no, el
      // reproductor arranca con el volumen que dejo la ultima reproduccion).
      try {
        if (window.exoPlayerPlugin.setVolume) {
          await window.exoPlayerPlugin.setVolume(this.volume != null ? this.volume : 1.0);
        }
      } catch (e) {}

      // Si mientras tanto se lanzo otro play(), abortar este.
      if (token !== this._playToken) {
        try { await window.exoPlayerPlugin.stop(); } catch (e) {}
        return false;
      }

      this.showLoading(false);
      this.hideError();
      this.hideBgRetry();
      this.bgRetryCount = 0;
      this.updatePlayIcon(true);
      this.showControls();
      this.bindExoLayoutSync();

      // Diagnostico del audio en campo (si sigue mudo, esto dice el motivo)
      try {
        const info = await window.exoPlayerPlugin.getAudioInfo();
        console.log('[IPTV] Audio nativo:', JSON.stringify(info));
        if (info && typeof showToast === 'function') {
          if (info.hasAudio === false) {
            showToast('\u{26A0}\u{FE0F} Esta señal NO incluye pista de audio');
          } else if (info.systemVolume === 0) {
            showToast('\u{1F507} El volumen del dispositivo está en 0');
          } else if (info.focusGranted === false) {
            showToast('\u{26A0}\u{FE0F} No se pudo tomar el foco de audio');
          }
        }
      } catch (e) {}

      console.log('[IPTV] Reproduciendo con ExoPlayer nativo (AC-3/Dolby soportado)');
      return true;
    } catch (e) {
      console.warn('[IPTV] ExoPlayer nativo fallo:', e.message);
      this.isExoPlayerActive = false;
      return false;
    }
  }

  /**
   * Diagnostico del audio del motor ACTIVO (WebView / Media3).
   * Devuelve el codec real y el numero de canales de la pista seleccionada.
   */
  async getActiveEngineAudioInfo() {
    try {
      if (this.isExoPlayerActive && window.exoPlayerPlugin) {
        return await window.exoPlayerPlugin.getAudioInfo();
      }
      const v = this.video;
      return {
        hasAudio: !!(v && v.mozHasAudio !== false && v.audioTracks !== undefined && v.audioTracks.length >= 0),
        mimeType: 'HTML5 (WebView)',
        channels: 2,
        volume: v ? v.volume : 1.0,
        muted: v ? v.muted : false,
        engine: 'web'
      };
    } catch (e) {
      return { hasAudio: false, mimeType: '', channels: 0, error: e.message };
    }
  }

  // Rectangulo del reproductor en CSS px (el plugin lo convierte a px de Android)
  getPlayerLayout() {
    const el = this.container;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  /**
   * Modo del renderer de extension FFmpeg que se pasa al reproductor nativo:
   *   0 = OFF    -> solo decodificadores hardware
   *   1 = ON     -> hardware primero, FFmpeg software de reserva (recomendado)
   *   2 = PREFER -> FFmpeg software primero (maxima compatibilidad)
   */
  getExtensionRendererMode() {
    const pref = this.getEnginePreference();
    if (pref === 'native') return 0;   // solo hardware
    if (pref === 'ffmpeg') return 2;   // software primero
    return 1;                          // auto: hardware + reserva software
  }

  // Preferencia de motor de reproduccion: auto | web | native | ffmpeg
  getEnginePreference() {
    try { return localStorage.getItem('free_iptv_engine') || 'auto'; } catch (e) { return 'auto'; }
  }

  // Mantiene la superficie nativa alineada con el reproductor (rotacion/fullscreen)
  bindExoLayoutSync() {
    if (this._exoLayoutBound) return;
    this._exoLayoutBound = true;

    const sync = () => {
      if (this.isExoPlayerActive && window.exoPlayerPlugin) {
        window.exoPlayerPlugin.setLayout(this.getPlayerLayout());
      }
    };
    this._exoLayoutSync = sync;

    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', () => setTimeout(sync, 150));
    if (window.matchMedia) {
      const mq = window.matchMedia('(orientation: landscape)');
      if (mq.addEventListener) mq.addEventListener('change', () => setTimeout(sync, 150));
    }
  }

  // =========================================================
  // EXOPLAYER FALLBACK: Solo cuando HTML5 falló realmente
  // =========================================================
  async tryExoPlayerFallback(url, channel) {
    if (this.isExoPlayerActive) return;
    if (!window.exoPlayerPlugin || !window.exoPlayerPlugin.available) {
      console.warn('[IPTV] ExoPlugin no disponible');
      return false;
    }

    try {
      this.showLoading(false);
      this.isExoPlayerActive = true;
      this.video.pause();
      this.video.removeAttribute('src');

      // Bloquear orientación landscape para video nativo
      if (window.screen && window.screen.orientation && typeof window.screen.orientation.lock === 'function') {
        await window.screen.orientation.lock('landscape').catch(() => {});
      }

      await window.exoPlayerPlugin.play(url, channel.name || 'Contenido', null,
        this.getExtensionRendererMode());

      // Escuchar cuando ExoPlayer termine para regresar a HTML5
      window.exoPlayerPlugin.on('playbackStateChanged', (data) => {
        if (!data.playing && data.state === 4) { // STATE_ENDED
          this.isExoPlayerActive = false;
          this.showControls();
        }
      });

      window.exoPlayerPlugin.on('playbackError', (data) => {
        console.error('[IPTV] ExoPlayer error:', data.error);
        this.isExoPlayerActive = false;
        if (typeof openMediaInExternalPlayer === 'function') {
          openMediaInExternalPlayer(url, channel.name || 'Contenido');
        }
      });

      this.showToast('🎬 Reproduciendo con ExoPlayer nativo...');
      return true;
    } catch (e) {
      console.warn('[IPTV] ExoPlayer falló:', e.message);
      this.isExoPlayerActive = false;
      return false;
    }
  }

  // =========================================================
  // REDIRIGIR A EXTERNO (VLC / MX Player) - Último recurso
  // =========================================================
  _redirectToExternalPlayer(msg = 'Abriendo en reproductor externo...') {
    if (this._externalRedirected) return;
    this._externalRedirected = true;
    this.showLoading(false);
    this.isExoPlayerActive = false;
    if (msg && typeof showToast === 'function') showToast(msg);
    if (this.currentChannel && this.currentChannel.url && typeof openMediaInExternalPlayer === 'function') {
      openMediaInExternalPlayer(this.currentChannel.url, this.currentChannel.name || 'Contenido');
    }
  }

  openCurrentInExternalPlayer() {
    this.closeTracksModal();
    if (!this.currentChannel || !this.currentChannel.url) {
      if (typeof showToast === 'function') showToast("⚠️ No hay ningún contenido seleccionado.");
      return;
    }
    // Abrir directamente en VLC / MX Player a través del puente nativo
    if (typeof openMediaInExternalPlayer === 'function') {
      openMediaInExternalPlayer(this.currentChannel.url, this.currentChannel.name || 'Contenido IPTV');
    } else if (window.AndroidNativeApp && typeof window.AndroidNativeApp.openExternalPlayer === 'function') {
      window.AndroidNativeApp.openExternalPlayer(this.currentChannel.url, this.currentChannel.name || 'Contenido IPTV');
    }
  }

  // =========================================================
  // CONTROLES DE REPRODUCCIÓN
  // =========================================================
  togglePlay() {
    // Con el motor nativo (Media3) los controles los gestiona la
    // superficie nativa.
    if (this.isExoPlayerActive && window.exoPlayerPlugin) {
      try { window.exoPlayerPlugin.toggle(); } catch (e) {}
      this.resetControlsTimeout();
      return;
    }

    if (this.video.paused) {
      this.video.play().catch(() => {});
      this.updatePlayIcon(true);
    } else {
      this.video.pause();
      this.updatePlayIcon(false);
    }
    this.showControls();
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

  // =========================================================
  // FULLSCREEN CON ROTACIÓN AUTOMÁTICA
  // =========================================================
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
    this.hideControls(); // Ocultar controles al entrar fullscreen, reaparecen con click

    const icon = document.getElementById('btn-fs-icon');
    if (icon) icon.className = 'fa-solid fa-compress text-base';

    const minBtn = document.getElementById('btn-player-minimize');
    if (minBtn) {
      minBtn.classList.add('hidden');
      if (typeof currentContentType !== 'undefined' && currentContentType !== 'live') {
        minBtn.innerHTML = '<i class="fa-solid fa-arrow-left text-white text-lg"></i>';
      } else {
        minBtn.innerHTML = '<i class="fa-solid fa-compress text-blue-400 text-sm"></i>';
      }
    }

    // Bloquear landscape al entrar fullscreen
    try {
      if (this.container.requestFullscreen) {
        this.container.requestFullscreen().catch(() => {});
      } else if (this.container.webkitRequestFullscreen) {
        this.container.webkitRequestFullscreen();
      }
    } catch (e) {}

    try {
      if (window.screen && window.screen.orientation && typeof window.screen.orientation.lock === 'function') {
        window.screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) {}

    if (window.tvNavigation && typeof window.tvNavigation.setInFullscreen === 'function') {
      window.tvNavigation.setInFullscreen(true);
    }

    this.showToast("Pantalla Completa 🖥️");
    this.adjustPlayerForOrientation();
  }

  exitFullscreenMode() {
    this.container.classList.remove('fullscreen-player');
    document.body.classList.remove('in-fullscreen');
    this.showControls(); // Mostrar controles al salir

    const icon = document.getElementById('btn-fs-icon');
    if (icon) icon.className = 'fa-solid fa-expand text-base';

    const minBtn = document.getElementById('btn-player-minimize');
    if (minBtn) minBtn.classList.add('hidden');

    if (document.fullscreenElement || document.webkitFullscreenElement) {
      try {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } catch (e) {}
    }

    // SI ESTAMOS EN VOD O SERIES, AL MINIMIZAR SE DETIENE Y SE OCULTA (RETORNO AL MENU PRINCIPAL)
    if (typeof currentContentType !== 'undefined' && currentContentType !== 'live') {
       this.stopPlayback();
       this.container.classList.add('hidden');
    }

    try {
      if (window.screen && window.screen.orientation && typeof window.screen.orientation.unlock === 'function') {
        window.screen.orientation.unlock().catch(() => {});
      }
    } catch (e) {}

    if (window.tvNavigation && typeof window.tvNavigation.setInFullscreen === 'function') {
      window.tvNavigation.setInFullscreen(false);
    }

    this.showToast("Vista normal");
    this.adjustPlayerForOrientation();
  }

  // =========================================================
  // TOGGLE CONTROLES CON CLICK EN EL VIDEO
  // =========================================================
  togglePlayerControls() {
    if (this.isLocked) return;
    this.toggleControls();
  }

  // =========================================================
  // RESTANTES MÉTODOS (sin cambios críticos de funcionalidad)
  // =========================================================
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

  // Sleep Timer
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
    let startX = 0, startY = 0, isTracking = false, gestureType = null, lastTap = 0;
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
          // Doble tap: click central = play/pause, lados = cambiar canal
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
        if (gestureType === 'brightness') this.adjustBrightness(step);
        else this.adjustVolume(step);
        startY = touch.clientY;
      }
    }, { passive: true });

    el.addEventListener('touchend', () => {
      isTracking = false;
      gestureType = null;
      setTimeout(() => this.hideHUD(), 1100);
    });

    // Click en el video: mostrar/ocultar controles
    this.container.addEventListener('click', (e) => {
      if (this.isLocked) return;
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
      this.togglePlayerControls();
    });
  }

  // =========================================================
  // HUD gestos: brillo (arrastre vertical izq) y volumen (der)
  // =========================================================
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

  /**
   * Control de volumen del modal "Audio y Subtítulos".
   * Funciona igual con el reproductor WebView y con el ExoPlayer nativo.
   */
  onVolumeSlider(value) {
    const v = Math.min(1, Math.max(0, (parseFloat(value) || 0) / 100));
    this.setVolumeLevel(v);
    const label = document.getElementById('player-volume-value');
    if (label) label.textContent = Math.round(v * 100) + '%';
  }

  /** Refleja el volumen actual en el slider del modal. */
  syncVolumeUI() {
    const slider = document.getElementById('player-volume-slider');
    const label = document.getElementById('player-volume-value');
    const v = this.volume != null ? this.volume : 1.0;
    if (slider) slider.value = Math.round(v * 100);
    if (label) label.textContent = Math.round(v * 100) + '%';
  }

  /**
   * Ajusta el volumen del reproductor (para el reproductor nativo ExoPlayer
   * el volumen se controla desde el propio player nativo).
   */
  setVolumeLevel(volume) {
    const v = Math.min(1, Math.max(0, volume));
    this.volume = v;

    if (this.isExoPlayerActive && window.exoPlayerPlugin && window.exoPlayerPlugin.setVolume) {
      try { window.exoPlayerPlugin.setVolume(v); } catch (e) {}
    } else {
      this.video.volume = v;
    }

    const pct = Math.round(v * 100);
    const icon = pct === 0 ? 'fa-solid fa-volume-xmark text-red-400' : (pct < 50 ? 'fa-solid fa-volume-low text-blue-400' : 'fa-solid fa-volume-high text-blue-400');
    this.showHUD(icon, pct);
  }

  /**
   * Botones FISICOS del dispositivo (volumen +/-) y teclas del teclado.
   * Android emite keydown con keyCode 24 (subir volumen) y 25 (bajar volumen).
   */
  initHardwareVolumeKeys() {
    document.addEventListener('keydown', (e) => {
      const code = e.keyCode || e.which;
      const key = e.key;

      // Volumen + / -
      if (code === 24 || key === 'VolumeUp') {
        e.preventDefault();
        this.setVolumeLevel(this.volume + 0.1);
        return;
      }
      if (code === 25 || key === 'VolumeDown') {
        e.preventDefault();
        this.setVolumeLevel(this.volume - 0.1);
        return;
      }
      // Silencio (mute)
      if (code === 173 || key === 'VolumeMute') {
        e.preventDefault();
        this.setVolumeLevel(this.volume > 0 ? 0 : 0.5);
        return;
      }
    });
  }

  showHUD(iconClass, percent) {
    if (!this.hud) return;
    this.hudIcon.className = iconClass + ' text-base';
    this.hudBar.style.width = `${percent}%`;
    this.hudText.innerText = `${percent}%`;
    this.hud.classList.add('show');
    // Garantizar que se oculte siempre (evita que quede pegado en pantalla)
    clearTimeout(this._hudTimer);
    this._hudTimer = setTimeout(() => this.hideHUD(), 1100);
  }

  hideHUD() {
    clearTimeout(this._hudTimer);
    if (this.hud) this.hud.classList.remove('show');
  }

  initVideoEvents() {
    this.video.addEventListener('loadedmetadata', () => {
      console.log('[IPTV] LOADED METADATA');
      this.video.muted = false;
      this.video.volume = 1.0;
      this.updateQualityBadge();
    });

    this.video.addEventListener('playing', () => {
      console.log('[IPTV] VIDEO PLAYING');
      this.video.muted = false;
      this.video.volume = 1.0;
      clearTimeout(this.vodStartTimer);
      this.showLoading(false);
      this.hideError();
      this.hideBgRetry();
      this.updatePlayIcon(true);
      this.updateQualityBadge();
      this.showControls();
      this.resetControlsTimeout();
    });

    this.video.addEventListener('pause', () => {
      this.updatePlayIcon(false);
      this.overlay.classList.remove('hidden-controls');
      this.showControls();
    });

    this.video.addEventListener('waiting', () => {
      console.warn('[IPTV] VIDEO WAITING');
      this.showLoading(true);
    });

    this.video.addEventListener('error', () => {
      console.error('[IPTV] VIDEO ERROR:', this.video.error?.message);
    });

    const onFsChange = () => {
      const isFs = !!document.fullscreenElement || !!document.webkitFullscreenElement;
      if (!isFs && !this.container.classList.contains('fullscreen-player')) {
        document.body.classList.remove('in-fullscreen');
        const icon = document.getElementById('btn-fs-icon');
        if (icon) icon.className = 'fa-solid fa-expand text-base';
        const minBtn = document.getElementById('btn-player-minimize');
        if (minBtn) minBtn.classList.add('hidden');
        if (window.tvNavigation && typeof window.tvNavigation.setInFullscreen === 'function') {
          window.tvNavigation.setInFullscreen(false);
        }
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
  }

  // =========================================================
  // MANEJO DE ERRORES Y REINTENTOS
  // =========================================================
  handleStreamFailInBackground() {
    this.showLoading(false);
    this.isExoPlayerActive = false;

    if (this.bgRetryCount < this.maxBgRetries) {
      this.bgRetryCount++;
      const retryMsg = `Reintentando señal (${this.bgRetryCount}/${this.maxBgRetries})...`;
      this.showBgRetry(true, retryMsg);
      clearTimeout(this.bgRetryTimer);
      this.bgRetryTimer = setTimeout(() => {
        if (this.currentChannel) {
          this.play(this.currentChannel, true);
        }
      }, 2000);
    } else {
      clearTimeout(this.bgRetryTimer);
      this.hideBgRetry();
      this.showLoading(false);

      if (this.hls) {
        try { this.hls.destroy(); } catch (e) {}
        this.hls = null;
      }
      // Detener la superficie nativa si estaba reproduciendo
      if (this.isExoPlayerActive && window.exoPlayerPlugin) {
        try { window.exoPlayerPlugin.stop(); } catch (e) {}
      }
      this.isExoPlayerActive = false;
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
      this.showError("Canal temporalmente inactivo", `La señal de "${chName}" no respondió tras ${this.maxBgRetries} intentos.`);
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
    if (isAutoSkip) this.showToast(`Señal caída. Sintonizando: ${nextCh.name} 📺`);
    else this.showToast(`Siguiente: ${nextCh.name} 📺`);
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
    if (this.bgRetryBadge) this.bgRetryBadge.classList.add('hidden');
  }

  updateQualityBadge() {
    const qBadge = document.getElementById('hud-quality-badge');
    if (!qBadge) return;
    if (this.video.videoHeight >= 1080) { qBadge.innerText = 'FHD'; qBadge.classList.remove('hidden'); }
    else if (this.video.videoHeight >= 720) { qBadge.innerText = 'HD'; qBadge.classList.remove('hidden'); }
    else if (this.video.videoHeight > 0) { qBadge.innerText = 'SD'; qBadge.classList.remove('hidden'); }
    else { qBadge.innerText = 'EN VIVO'; }
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
      if (channel.logo) { logoEl.src = channel.logo; logoEl.classList.remove('hidden'); }
      else { logoEl.classList.add('hidden'); }
    }
  }

  // =========================================================
  // FULLSCREEN & MINIMIZAR
  // =========================================================
  toggleFullscreen() {
    const isCurrentlyFs = this.container.classList.contains('fullscreen-player') || !!document.fullscreenElement || !!document.webkitFullscreenElement;
    if (!isCurrentlyFs) this.enterFullscreenMode();
    else this.exitFullscreenMode();
  }

  exitFullscreenMode() {
    this.container.classList.remove('fullscreen-player');
    document.body.classList.remove('in-fullscreen');

    const icon = document.getElementById('btn-fs-icon');
    if (icon) icon.className = 'fa-solid fa-expand text-base';
    const minBtn = document.getElementById('btn-player-minimize');
    if (minBtn) minBtn.classList.add('hidden');

    if (document.fullscreenElement || document.webkitFullscreenElement) {
      try { if (document.exitFullscreen) document.exitFullscreen().catch(() => {}); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } catch (e) {}
    }
    try { if (window.screen && window.screen.orientation && typeof window.screen.orientation.unlock === 'function') { window.screen.orientation.unlock().catch(() => {}); } } catch (e) {}

    if (window.tvNavigation && typeof window.tvNavigation.setInFullscreen === 'function') {
      window.tvNavigation.setInFullscreen(false);
    }
    this.showToast("Vista normal");
    this.resetControlsTimeout();
    this.adjustPlayerForOrientation();
  }

  // =========================================================
  // AUDIO / SUBTÍTULOS
  // =========================================================
  getAudioTracks() {
    if (this.hls && this.hls.audioTracks && this.hls.audioTracks.length > 0) {
      return this.hls.audioTracks.map((t, idx) => ({
        id: idx, name: t.name || t.lang || `Audio ${idx+1}`, lang: t.lang || '',
        active: this.hls.audioTrack === idx, source: 'hlsjs'
      }));
    }
    if (this.video && this.video.audioTracks && this.video.audioTracks.length > 0) {
      const tracks = [];
      for (let i = 0; i < this.video.audioTracks.length; i++) {
        const t = this.video.audioTracks[i];
        tracks.push({ id: i, name: t.label || t.language || `Audio ${i+1}`, lang: t.language || '', active: t.enabled, source: 'native' });
      }
      return tracks;
    }
    return [];
  }

  getSubtitleTracks() {
    if (this.hls && this.hls.subtitleTracks && this.hls.subtitleTracks.length > 0) {
      return this.hls.subtitleTracks.map((t, idx) => ({
        id: idx, name: t.name || t.lang || `Subtítulo ${idx+1}`, lang: t.lang || '',
        active: this.hls.subtitleTrack === idx, source: 'hlsjs'
      }));
    }
    if (this.video && this.video.textTracks && this.video.textTracks.length > 0) {
      const tracks = [];
      for (let i = 0; i < this.video.textTracks.length; i++) {
        const t = this.video.textTracks[i];
        tracks.push({ id: i, name: t.label || t.language || `Subtítulo ${i+1}`, lang: t.language || '', active: t.mode === 'showing', source: 'native' });
      }
      return tracks;
    }
    return [];
  }

  setAudioTrack(trackId) {
    if (this.hls && this.hls.audioTracks) { this.hls.audioTrack = trackId; this.renderTracksUI(); return true; }
    if (this.video && this.video.audioTracks) {
      for (let i = 0; i < this.video.audioTracks.length; i++) this.video.audioTracks[i].enabled = (i === trackId);
      this.renderTracksUI();
    }
    return false;
  }

  setSubtitleTrack(trackId) {
    if (this.hls && this.hls.subtitleTracks) { this.hls.subtitleTrack = trackId; this.renderTracksUI(); return true; }
    if (this.video && this.video.textTracks) {
      for (let i = 0; i < this.video.textTracks.length; i++) this.video.textTracks[i].mode = (i === trackId) ? 'showing' : 'disabled';
      this.renderTracksUI();
    }
    return false;
  }

  openTracksModal() {
    const modal = document.getElementById('modal-audio-subtitles');
    if (!modal) return;
    this.renderTracksUI();
    this.syncVolumeUI();
    modal.classList.add('show', 'active');
  }

  closeTracksModal() {
    const modal = document.getElementById('modal-audio-subtitles');
    if (modal) modal.classList.remove('show', 'active');
  }

    /** Muestra el codec, los canales y el decoder REAL del motor activo. */
  async renderEngineDiagnostic() {
    const box = document.getElementById('player-engine-diag');
    if (!box) return;
    try {
      const info = await this.getActiveEngineAudioInfo();
      if (!info) { box.innerHTML = ''; return; }
      const engine = this.isExoPlayerActive ? 'Media3' : 'WebView (HLS.js)';
      const codec = info.mimeType || 'desconocido';
      const ch = info.channels ? (info.channels + ' canales') : '?';
      const warn = (info.hasAudio === false)
        ? '<span class="text-red-400 font-semibold">SIN PISTA DE AUDIO</span>'
        : '';
      const vol = (info.volume !== undefined)
        ? ' - vol ' + Math.round(info.volume * 100) + '%' : '';

      // --- Diagnostico del MOTOR: renderer FFmpeg + decoder REAL usado ---
      let extra = '';
      if (this.isExoPlayerActive && window.exoPlayerPlugin
          && typeof window.exoPlayerPlugin.getRendererInfo === 'function') {
        const ri = await window.exoPlayerPlugin.getRendererInfo();
        if (ri && ri.decoderUsed) {
          const ffmpegOk = !!ri.ffmpegRan;
          extra += '<div class="p-2 bg-gray-950/70 rounded-xl text-[10px] mt-1.5 leading-relaxed">'
            + '<div class="flex items-center justify-between gap-2">'
            + '<span class="text-gray-400"><i class="fa-solid fa-microchip mr-1"></i>decoder</span>'
            + '<span class="' + (ffmpegOk ? 'text-emerald-400 font-bold' : 'text-amber-300 font-semibold') + '">'
            + this._esc(ri.decoderUsed) + (ffmpegOk ? ' (FFmpeg)' : '') + '</span>'
            + '</div>'
            + '<div class="flex items-center justify-between gap-2">'
            + '<span class="text-gray-400"><i class="fa-solid fa-puzzle-piece mr-1"></i>renderer FFmpeg</span>'
            + '<span class="' + (ri.ffmpegRendererLoaded ? 'text-emerald-400' : 'text-red-400') + '">'
            + (ri.ffmpegRendererLoaded ? 'registrado' : 'NO disponible')
            + (ri.hideUnreliableFromHardware ? ' - oculta AC3 al hw' : ' - sin ocultar') + '</span>'
            + '</div>'
            + '<div class="flex items-center justify-between gap-2">'
            + '<span class="text-gray-400"><i class="fa-solid fa-tv mr-1"></i>hardware anuncia</span>'
            + '<span class="text-gray-300 text-right">'
            + this._esc(ri.hardwareClaimsEac3 ? 'E-AC-3/AC-3 (origen del bug)' : 'ninguno') + '</span>'
            + '</div>'
            + (ri.lastPlaybackError
              ? '<div class="text-red-400 mt-1 break-all">ultimo error: ' + this._esc(ri.lastPlaybackError) + '</div>'
              : '')
            + '</div>';
        }
      }

      box.innerHTML = '<div class="p-2.5 bg-gray-900/60 rounded-xl text-[11px] text-gray-300 flex items-center justify-between gap-2">'
        + '<span><i class="fa-solid fa-microchip text-blue-400 mr-1.5"></i>' + engine + '</span>'
        + '<span class="text-gray-400">' + codec + ' - ' + ch + vol + warn + '</span>'
        + '</div>' + extra;
    } catch (e) {
      box.innerHTML = '';
    }
  }

  _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  renderTracksUI() {
    // Diagnostico del motor ACTIVO: codec real y nº de canales de la pista.
    this.renderEngineDiagnostic();
    const audioContainer = document.getElementById('player-audio-tracks-list');
    const subContainer = document.getElementById('player-subtitle-tracks-list');
    if (!audioContainer || !subContainer) return;

    const audioTracks = this.getAudioTracks();
    audioContainer.innerHTML = '';
    if (audioTracks.length === 0) {
      audioContainer.innerHTML = `<div class="p-2.5 bg-gray-900/60 rounded-xl text-[11px] text-gray-400 flex items-center justify-between"><span>Audio Estéreo / Por defecto</span><i class="fa-solid fa-check text-blue-400"></i></div>`;
    } else {
      audioTracks.forEach(t => {
        const item = document.createElement('div');
        item.className = `p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition ${t.active ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-300 hover:bg-gray-800'}`;
        item.innerHTML = `<div class="flex items-center gap-2"><i class="fa-solid fa-volume-high text-xs"></i><span>${t.name}</span></div>${t.active ? '<i class="fa-solid fa-check text-xs"></i>' : ''}`;
        item.onclick = () => this.setAudioTrack(t.id);
        audioContainer.appendChild(item);
      });
    }

    const subTracks = this.getSubtitleTracks();
    subContainer.innerHTML = '';
    const isNoneActive = (this.hls ? this.hls.subtitleTrack === -1 : true);
    const noneItem = document.createElement('div');
    noneItem.className = `p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition ${isNoneActive ? 'bg-yellow-500 text-black' : 'bg-gray-900 text-gray-300 hover:bg-gray-800'}`;
    noneItem.innerHTML = `<span>Desactivados</span>${isNoneActive ? '<i class="fa-solid fa-check text-xs"></i>' : ''}`;
    noneItem.onclick = () => this.setSubtitleTrack(-1);
    subContainer.appendChild(noneItem);

    if (subTracks.length > 0) {
      subTracks.forEach(t => {
        const item = document.createElement('div');
        item.className = `p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition ${t.active ? 'bg-yellow-500 text-black' : 'bg-gray-900 text-gray-300 hover:bg-gray-800'}`;
        item.innerHTML = `<div class="flex items-center gap-2"><i class="fa-solid fa-closed-captioning text-xs"></i><span>${t.name}</span></div>${t.active ? '<i class="fa-solid fa-check text-xs"></i>' : ''}`;
        item.onclick = () => this.setSubtitleTrack(t.id);
        subContainer.appendChild(item);
      });
    }
  }

  collectHlsAudioTracks() {
    const tracks = this.getAudioTracks();
    this.audioTrackInfo = { tracks: tracks, source: 'hlsjs' };
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

  showLoading(show) {
    if (this.loading) this.loading.classList.toggle('hidden', !show);
  }

  hideIdle() {
    const idleEl = document.getElementById('player-idle');
    if (idleEl) idleEl.classList.add('hidden');
  }

  showIdleState(countryName = 'Canales en vivo', channelCount = 0) {
    this.showLoading(false);
    this.hideError();
    this.hideBgRetry();
    const idleEl = document.getElementById('player-idle');
    const idleSub = document.getElementById('player-idle-sub');
    const idleTitle = document.getElementById('player-idle-title');
    if (idleTitle) idleTitle.innerText = countryName;
    if (idleSub) idleSub.innerText = channelCount > 0 ? `${channelCount} canales disponibles. Toca cualquier canal para reproducir.` : "Selecciona un canal de la lista para iniciar la reproducción.";
    if (idleEl) idleEl.classList.remove('hidden');
  }

  showError(title = "Canal no disponible", detail = "Por favor elige otro canal o actualiza la lista.") {
    if (this.errorOverlay) {
      if (this.errorText) {
        this.errorText.innerHTML = `<span class="font-bold text-amber-400 text-sm block mb-1">${title}</span><span class="text-gray-300 text-[11px] leading-relaxed block">${detail}</span>`;
      }
      this.errorOverlay.classList.remove('hidden');
    }
  }

  hideError() {
    if (this.errorOverlay) this.errorOverlay.classList.add('hidden');
  }

  showToast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }

  destroy() {
    clearTimeout(this.controlsTimer);
    clearTimeout(this.bgRetryTimer);
    clearInterval(this.sleepTimerInterval);
    if (this.hls) { try { this.hls.destroy(); } catch (e) {} this.hls = null; }
    this.isExoPlayerActive = false;
  }
}

window.VideoPlayerManager = VideoPlayerManager;

// IPTV Playlist Loader para HLS.js (resuelve 302 y rutas relativas)
class IPTVPlaylistLoader extends (typeof Hls !== 'undefined' ? Hls.DefaultConfig.loader : Object) {
  constructor(config) { super(config); }
  load(context, config, callbacks) {
    if (context && context.url) {
      if (context.url.includes('_capacitor_http_interceptor_')) {
        try { const u = new URL(context.url).searchParams.get('u'); if (u) context.url = decodeURIComponent(u); } catch (e) {}
      }
      if (context.url.startsWith('https://localhost/') || context.url.startsWith('http://localhost/')) {
        try { const urlObj = new URL(context.url); if (window._activeStreamOrigin) { context.url = window._activeStreamOrigin + urlObj.pathname + urlObj.search; } } catch (e) {}
      }
    }
    const origOnSuccess = callbacks.onSuccess;
    callbacks.onSuccess = (response, stats, ctx, networkDetails) => {
      try {
        if (response && typeof response.data === 'string') {
          let effectiveUrl = response.url || context.url;
          if (effectiveUrl.includes('_capacitor_http_interceptor_')) {
            try { const u = new URL(effectiveUrl).searchParams.get('u'); if (u) effectiveUrl = decodeURIComponent(u); } catch (e) {}
          }
          if (effectiveUrl && effectiveUrl.startsWith('http') && !effectiveUrl.includes('localhost')) {
            try { const uObj = new URL(effectiveUrl); window._activeStreamOrigin = uObj.origin; window._activeStreamBase = effectiveUrl.substring(0, effectiveUrl.lastIndexOf('/') + 1); } catch (e) {}
          }
          const origin = window._activeStreamOrigin || '';
          const base = window._activeStreamBase || '';
          if (origin) {
            response.data = response.data.replace(/^(?!\s*#)(\/[^\r\n]+)/gm, (match, path) => origin + path);
            if (base) {
              response.data = response.data.replace(/^(?!\s*#)(?!https?:\/\/|\/)([^\r\n]+)/gm, (match, rel) => base + rel);
            }
            response.data = response.data.replace(/URI=["']([^"']+)["']/g, (match, uri) => {
              if (uri.startsWith('/')) return 'URI="' + origin + uri + '"';
              if (!uri.startsWith('http') && base) return 'URI="' + base + uri + '"';
              return match;
            });
          }
        }
      } catch (err) {}
      origOnSuccess(response, stats, ctx, networkDetails);
    };
    super.load(context, config, callbacks);
  }
}

class IPTVFragmentLoader extends (typeof Hls !== 'undefined' ? Hls.DefaultConfig.loader : Object) {
  constructor(config) { super(config); }
  load(context, config, callbacks) {
    if (context && context.url) {
      if (context.url.includes('_capacitor_http_interceptor_')) {
        try { const u = new URL(context.url).searchParams.get('u'); if (u) context.url = decodeURIComponent(u); } catch (e) {}
      }
      if (context.url.startsWith('https://localhost/') || context.url.startsWith('http://localhost/')) {
        try { const urlObj = new URL(context.url); if (window._activeStreamOrigin) { context.url = window._activeStreamOrigin + urlObj.pathname + urlObj.search; } } catch (e) {}
      }
    }
    super.load(context, config, callbacks);
  }
}
