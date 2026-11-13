// =========================================================
// Free-IPTV Pro - ExoPlayerPlugin.js (FASE 3 / Corrección)
// Bridge JavaScript hacia el plugin nativo Android ExoPlayer (Media3 + FFmpeg Audio)
// Reproduce AC-3 / E-AC-3 dentro de la MISMA pantalla de la app mediante una
// superficie de video nativa superpuesta al WebView.
// =========================================================

class ExoPlayerPluginBridge {
  constructor() {
    this._available = false;
    this.plugin = null;
    this.listeners = {};
    this.checkAvailability();
    if (typeof document !== 'undefined') {
      document.addEventListener('DOMContentLoaded', () => this.checkAvailability());
    }
  }

  get available() {
    if (this._available && this.plugin) return true;
    return this.checkAvailability();
  }

  set available(val) {
    this._available = !!val;
  }

  checkAvailability() {
    try {
      const cap = window.Capacitor;
      if (cap && typeof cap.registerPlugin === 'function') {
        // Enlazar dinámicamente el plugin local de Java usando el método recomendado de Capacitor 3+
        this.plugin = cap.registerPlugin('ExoPlayerPlugin');
        this._available = true;
        return true;
      }

      // Fallback para versiones antiguas
      if (cap && cap.Plugins && cap.Plugins.ExoPlayerPlugin) {
        this.plugin = cap.Plugins.ExoPlayerPlugin;
        this._available = true;
        return true;
      }
    } catch (e) {
      console.warn('[ExoPlayerPlugin] Error verificando disponibilidad:', e);
    }
    return false;
  }

  async isSupported() {
    if (!this.available) return false;
    try {
      const result = await this.plugin.isSupported();
      return result && result.supported === true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Reproduce contenido con ExoPlayer nativo (Media3).
   * @param {string} url
   * @param {string} title
   * @param {object} layout {x,y,w,h} en CSS px del area del reproductor
   * @param {number} extensionMode Modo del renderer FFmpeg software:
   *        0 = OFF (solo hardware) | 1 = ON (hardware + reserva software) | 2 = PREFER (software primero)
   */
  async play(url, title = 'Contenido', layout = null, extensionMode = 1) {
    if (!this.available) throw new Error('ExoPlayerPlugin no disponible');
    const opts = { url, title };
    if (layout) {
      opts.x = layout.x || 0;
      opts.y = layout.y || 0;
      opts.w = layout.w || 0;
      opts.h = layout.h || 0;
    }
    opts.extensionMode = extensionMode;
    return await this.plugin.play(opts);
  }

  /** Re-posiciona la superficie nativa (rotacion / fullscreen / resize). */
  async setLayout(layout) {
    if (!this.available || !layout) return;
    try {
      await this.plugin.setLayout({
        x: layout.x || 0,
        y: layout.y || 0,
        w: layout.w || 0,
        h: layout.h || 0
      });
    } catch (e) {
      console.warn('[ExoPlayerPlugin] setLayout fallo:', e);
    }
  }

  async pause() {
    if (!this.available) throw new Error('ExoPlayerPlugin no disponible');
    return await this.plugin.pause({});
  }

  async resume() {
    if (!this.available) throw new Error('ExoPlayerPlugin no disponible');
    return await this.plugin.resume({});
  }

  /** Alterna pausa/reproduccion segun el estado real del player nativo. */
  async toggle() {
    if (!this.available) throw new Error('ExoPlayerPlugin no disponible');
    return await this.plugin.toggle({});
  }

  /** Estado actual del player nativo. */
  async getState() {
    if (!this.available) return { playing: false, state: 0, positionMs: 0, durationMs: 0 };
    return await this.plugin.getState({});
  }

  /** Diagnostico del audio nativo (mimeType de la pista activa + disponibilidad FFmpeg). */
  async getAudioInfo() {
    if (!this.available) return { hasAudio: false, mimeType: '', channels: 0, ffmpegAvailable: false };
    try {
      return await this.plugin.getAudioInfo({});
    } catch (e) {
      return { hasAudio: false, mimeType: '', channels: 0, ffmpegAvailable: false, error: e.message };
    }
  }

  /**
   * Diagnostico del MOTOR de audio:
   *  - si el renderer FFmpeg esta registrado y su version
   *  - que codecs de audio ANUNCIA el hardware (causa tipica del bug)
   *  - la configuracion aplicada (modo / si se oculto AC-3 al hardware)
   *  - EL DECISIVO: nombre real del decoder que llego a ejecutarse
   */
  async getRendererInfo() {
    if (!this.available) return { disponible: false, motivo: 'ExoPlayerPlugin no disponible' };
    try {
      return await this.plugin.getRendererInfo({});
    } catch (e) {
      return { disponible: false, motivo: e.message };
    }
  }

  async stop() {
    if (!this.available) throw new Error('ExoPlayerPlugin no disponible');
    return await this.plugin.stop({});
  }

  async seek(positionMs) {
    if (!this.available) throw new Error('ExoPlayerPlugin no disponible');
    return await this.plugin.seek({ positionMs });
  }

  async setVolume(volume) {
    if (!this.available) throw new Error('ExoPlayerPlugin no disponible');
    return await this.plugin.setVolume({ volume });
  }

  async setAudioTrack(trackIndex) {
    if (!this.available) throw new Error('ExoPlayerPlugin no disponible');
    return await this.plugin.setAudioTrack({ trackIndex });
  }

  async getDuration() {
    if (!this.available) return 0;
    const result = await this.plugin.getDuration({});
    return result ? result.durationMs : 0;
  }

  async getCurrentPosition() {
    if (!this.available) return 0;
    const result = await this.plugin.getCurrentPosition({});
    return result ? result.positionMs : 0;
  }

  on(event, callback) {
    this.listeners[event] = callback;
    try {
      const cap = window.Capacitor;
      if (cap && cap.Plugins && cap.Plugins.ExoPlayerPlugin) {
        cap.Plugins.ExoPlayerPlugin.addListener(event, (data) => {
          if (callback) callback(data);
        });
      }
    } catch (e) {
      console.warn('[ExoPlayerPlugin] Error registrando listener:', e);
    }
  }
}

window.ExoPlayerPluginBridge = ExoPlayerPluginBridge;
window.exoPlayerPlugin = new ExoPlayerPluginBridge();
