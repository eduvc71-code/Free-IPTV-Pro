// =========================================================
// Free-IPTV Pro - ExoPlayerPlugin.js (FASE 3 / Corrección)
// Bridge JavaScript hacia el plugin nativo Android ExoPlayer (Media3 + FFmpeg Audio)
// Permite reproducir AC-3 / E-AC-3 / MKV directamente dentro de la app
// sin salir a VLC o MX Player.
// =========================================================

class ExoPlayerPluginBridge {
  constructor() {
    this.available = false;
    this.plugin = null;
    this.listeners = {};
    this.checkAvailability();
  }

  checkAvailability() {
    try {
      const cap = window.Capacitor;
      if (cap && cap.Plugins && cap.Plugins.ExoPlayerPlugin) {
        this.plugin = cap.Plugins.ExoPlayerPlugin;
        this.available = true;
        console.log('[ExoPlayerPlugin] Plugin nativo disponible');
      } else {
        console.warn('[ExoPlayerPlugin] Plugin nativo NO disponible (¿compilado para Android?)');
      }
    } catch (e) {
      console.warn('[ExoPlayerPlugin] Error verificando disponibilidad:', e);
    }
  }

  async isSupported() {
    if (!this.available) return false;
    try {
      const result = await this.plugin.isSupported();
      return result && result.supported === true;
    } catch (e) {
      console.warn('[ExoPlayerPlugin] isSupported falló:', e);
      return false;
    }
  }

  async play(url, title = 'Contenido') {
    if (!this.available) {
      throw new Error('ExoPlayerPlugin no disponible');
    }
    return await this.plugin.play({ url, title });
  }

  async pause() {
    if (!this.available) throw new Error('ExoPlayerPlugin no disponible');
    return await this.plugin.pause({});
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
