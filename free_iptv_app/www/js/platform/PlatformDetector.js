// =========================================================
// Free-IPTV Pro - PlatformDetector.js (FASE 3)
// Detecta en tiempo de arranque el entorno de ejecución:
// Android Native, iOS Native, Web Browser, Android TV, PWA.
// =========================================================

class PlatformDetector {
  constructor() {
    this.platform = 'unknown';
    this.isAndroid = false;
    this.isIOS = false;
    this.isWeb = false;
    this.isAndroidTV = false;
    this.isPWA = false;
    this.isCapacitor = false;
    this.userAgent = navigator.userAgent || '';
    this.detect();
  }

  detect() {
    const ua = this.userAgent;

    // Detectar Capacitor / entorno nativo
    this.isCapacitor = !!(
      window.Capacitor ||
      (window.webkit && window.webkit.messageHandlers)
    );

    // Android
    this.isAndroid = /android/i.test(ua);

    // iOS (iPhone, iPad, iPod, o iOS 13+ en iPad en modo desktop)
    this.isIOS = /iphone|ipad|ipod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // Android TV: no es móvil, menciona "Android TV"
    this.isAndroidTV = this.isAndroid && !/Mobile/i.test(ua) && /android tv/i.test(ua);

    // PWA (modo standalone instalado)
    this.isPWA = !!(
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
      navigator.standalone === true
    );

    // Web Browser puro
    this.isWeb = !this.isCapacitor && !this.isAndroid && !this.isIOS;

    // Clasificación de plataforma
    if (this.isCapacitor && this.isAndroid) this.platform = 'android_native';
    else if (this.isCapacitor && this.isIOS) this.platform = 'ios_native';
    else if (this.isAndroidTV) this.platform = 'android_tv';
    else if (this.isPWA) this.platform = 'pwa';
    else if (this.isWeb) this.platform = 'web_browser';
    else this.platform = 'unknown';
  }

  getInfo() {
    return {
      platform: this.platform,
      isAndroid: this.isAndroid,
      isIOS: this.isIOS,
      isWeb: this.isWeb,
      isAndroidTV: this.isAndroidTV,
      isPWA: this.isPWA,
      isCapacitor: this.isCapacitor,
      userAgent: this.userAgent
    };
  }

  isNative() { return this.isCapacitor; }

  // iOS gestiona HLS y AC3/EAC3 por hardware; Android WebView no.
  supportsNativeHLS() {
    return this.isIOS || this.canPlayType('application/vnd.apple.mpegurl') ||
      this.canPlayType('application/x-mpegURL');
  }

  supportsNativeAC3() {
    return this.isIOS;
  }

  canPlayType(mimeType) {
    const v = document.createElement('video');
    return v.canPlayType ? v.canPlayType(mimeType) : '';
  }

  canPlayMP4() { return !!this.canPlayType('video/mp4'); }
  canPlayTS() { return !!this.canPlayType('video/mp2t'); }
}

window.PlatformDetector = PlatformDetector;
window.platformDetector = new PlatformDetector();

console.log('[PlatformDetector] Entorno detectado:', window.platformDetector.getInfo());
