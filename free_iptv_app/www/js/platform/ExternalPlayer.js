// =========================================================
// Free-IPTV Pro - ExternalPlayer.js (FASE 3)
// Centraliza la derivación a reproductores externos:
// - Android: Intents a VLC / MX Player
// - iOS: esquemas URL vlc:// o Safari
// - Web / PWA: nueva pestaña o enlace directo
// =========================================================

class ExternalPlayer {
  constructor(detector) {
    this.detector = detector;
  }

  // ------------------------------------------------------------------
  // Entrada principal
  // ------------------------------------------------------------------
  async open(url, title = 'Contenido') {
    if (!url) return false;

    const d = this.detector.getInfo();

    // Intentar plugin de Capacitor si existe (más limpio que intent raw)
    const viaPlugin = await this.openViaCapacitorPlugin(url, title);
    if (viaPlugin) return true;

    // Android Nativo
    if (d.isAndroid && d.isCapacitor) {
      return this.openAndroidExternal(url, title);
    }

    // iOS Nativo
    if (d.isIOS && d.isCapacitor) {
      return this.openIOSExternal(url, title);
    }

    // Web Browser / PWA
    return this.openWebExternal(url, title);
  }

  // ------------------------------------------------------------------
  // Android: intent VLC / MX Player
  // ------------------------------------------------------------------
  openAndroidExternal(url, title) {
    try {
      // 1. Puente nativo seguro en MainActivity.java
      if (window.AndroidNativeApp && typeof window.AndroidNativeApp.openExternalPlayer === 'function') {
        window.AndroidNativeApp.openExternalPlayer(url, title);
        return true;
      }

      // 2. Intent a VLC / MX Player si no está el puente directo
      const cleanUrl = url.replace(/^https?:\/\//, '');
      const intentUrl = `intent://${cleanUrl}#Intent;package=org.videolan.vlc;scheme=http;end`;
      const fallbackIntent = `intent://${cleanUrl}#Intent;package=com.mxtech.videoplayer.ad;scheme=http;end`;

      window.location.href = intentUrl;

      // Pequeño timeout para intentar fallback si VLC no responde
      setTimeout(() => {
        if (!document.hidden) {
          window.location.href = fallbackIntent;
        }
      }, 1500);

      return true;
    } catch (e) {
      console.warn('[ExternalPlayer] Android intent falló:', e);
      window.location.href = url;
      return false;
    }
  }

  // ------------------------------------------------------------------
  // iOS: esquema vlc:// o Safari
  // ------------------------------------------------------------------
  openIOSExternal(url, title) {
    try {
      const vlcUrl = `vlc://${url.replace(/^https?:\/\//, '')}`;
      window.location.href = vlcUrl;
      return true;
    } catch (e) {
      console.warn('[ExternalPlayer] iOS vlc:// falló:', e);
      window.location.href = url;
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Web / PWA: abrir en pestaña nueva
  // ------------------------------------------------------------------
  openWebExternal(url, title) {
    try {
      window.open(url, '_blank', 'noopener');
      return true;
    } catch (e) {
      console.warn('[ExternalPlayer] Web open falló:', e);
      window.location.href = url;
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Puentes Capacitor (plugins de terceros o propios)
  // ------------------------------------------------------------------
  async openViaCapacitorPlugin(url, title) {
    try {
      const cap = window.Capacitor;
      if (!cap || !cap.Plugins) return false;

      // Intentar plugin genérico ExternalApp / App
      const plugin = cap.Plugins.ExternalApp || cap.Plugins.App;
      if (plugin && typeof plugin.openUrl === 'function') {
        await plugin.openUrl({ url });
        return true;
      }
    } catch (e) {
      // Ignorar, se usará el fallback de intent / esquema
    }
    return false;
  }
}

window.ExternalPlayer = ExternalPlayer;
