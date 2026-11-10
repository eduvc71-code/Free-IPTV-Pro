// =========================================================
// Free-IPTV Pro - MediaCompatibility.js (FASE 3)
// Tabla de compatibilidad dinámica según plataforma detectada.
// Ej: iOS soporta AC3 nativamente, Android WebView no.
// =========================================================

class MediaCompatibility {
  constructor(detector) {
    this.detector = detector;
  }

  getTable() {
    const d = this.detector ? this.detector.getInfo() : {};
    const det = this.detector || window.platformDetector;
    const hlsNative = det ? det.supportsNativeHLS() : false;
    const ac3Native = det ? det.supportsNativeAC3() : false;
    const mp4Native = det ? det.canPlayMP4() : true;
    const tsNative = det ? det.canPlayTS() : false;

    return {
      platform: d.platform || 'unknown',
      hlsNative: hlsNative,
      hlsJsRequired: !hlsNative,
      mp4Native: mp4Native,
      tsNative: tsNative,
      mkvNative: false,
      aviNative: false,
      ac3Native: ac3Native,
      eac3Native: ac3Native,
      aacNative: true,
      externalPlayerRecommended: !ac3Native,
      pipSupported: !!(d.isAndroid || d.isIOS),
      fullscreenSupported: true,
      backgroundAudio: !!(det && det.isNative())
    };
  }

  // Indica si un archivo/URL necesita derivación a reproductor externo
  needsExternalPlayer(urlOrMime) {
    const url = String(urlOrMime).toLowerCase();
    if (/\.(mkv|avi|wmv|flv)($|\?)/i.test(url)) return true;
    
    const d = this.detector ? this.detector.getInfo() : {};
    const det = this.detector || window.platformDetector;
    const supportsAC3 = det ? det.supportsNativeAC3() : false;

    // Android WebView no decodifica Dolby; si la URL sugiere AC3/EAC3, derivar
    if (d.isAndroid && !supportsAC3 && /\.(ac3|eac3|ac-3|e-ac-3)/i.test(url)) return true;
    return false;
  }

  // Motor de reproducción recomendado para una URL dada
  recommendedEngine(url) {
    const det = this.detector || window.platformDetector;
    const hlsNative = det ? det.supportsNativeHLS() : false;

    if (/\.m3u8($|\?)/i.test(url)) {
      return hlsNative ? 'native_hls' : 'hlsjs';
    }

    if (this.needsExternalPlayer(url)) return 'external_player';

    if (/\.mp4($|\?)/i.test(url)) return 'native_video';
    if (/\.ts($|\?)/i.test(url)) return 'native_video';

    return 'native_video';
  }

  // Devuelve un resumen legible para logs / diagnóstico
  summary() {
    const t = this.getTable();
    return `Compatibilidad [${t.platform}]: HLS=${t.hlsNative ? 'nativo' : 'hls.js'}, MP4=${t.mp4Native}, TS=${t.tsNative}, AC3=${t.ac3Native}, Externo=${t.externalPlayerRecommended}`;
  }
}

window.MediaCompatibility = MediaCompatibility;
