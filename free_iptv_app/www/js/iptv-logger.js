// =========================================================
// Free-IPTV Pro - iptv-logger.js
// Sistema de Registro Silencioso (Silent Background Logger)
// Guarda eventos internamente y los transmite al Android Logcat (ADB)
// SIN interrumpir la pantalla ni mostrar popups molestos.
// =========================================================

(function() {
  const MAX_LOG_ENTRIES = 500;
  window.iptvLogEntries = [];

  function formatTime() {
    const d = new Date();
    return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
  }

  function appendSilentLog(level, tag, message) {
    const entry = `[${formatTime()}] [${level}] [${tag}] ${message}`;
    window.iptvLogEntries.push(entry);
    if (window.iptvLogEntries.length > MAX_LOG_ENTRIES) {
      window.iptvLogEntries.shift();
    }

    // Transmitir a Android Logcat a través del puente nativo si está disponible
    try {
      if (window.AndroidNativeApp && typeof window.AndroidNativeApp.log === 'function') {
        window.AndroidNativeApp.log(tag || 'FreeIPTV', `[${level}] ${message}`);
      }
    } catch (e) {}
  }

  // API pública silenciosa
  window.silentLog = {
    info: (tag, msg) => appendSilentLog('INFO', tag, msg),
    warn: (tag, msg) => appendSilentLog('WARN', tag, msg),
    error: (tag, msg) => appendSilentLog('ERROR', tag, msg),
    debug: (tag, msg) => appendSilentLog('DEBUG', tag, msg),
    getAll: () => window.iptvLogEntries.slice(),
    clear: () => { window.iptvLogEntries = []; },
    exportText: () => window.iptvLogEntries.join('\n')
  };

  // Interceptar console de forma no intrusiva para volcar a Logcat
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  console.log = function(...args) {
    origLog.apply(console, args);
    try {
      const msg = args.map(a => (typeof a === 'object' ? (a?.message || JSON.stringify(a).slice(0, 150)) : String(a))).join(' ');
      appendSilentLog('LOG', 'FreeIPTV', msg);
    } catch (e) {}
  };

  console.warn = function(...args) {
    origWarn.apply(console, args);
    try {
      const msg = args.map(a => (typeof a === 'object' ? (a?.message || JSON.stringify(a).slice(0, 150)) : String(a))).join(' ');
      appendSilentLog('WARN', 'FreeIPTV', msg);
    } catch (e) {}
  };

  console.error = function(...args) {
    origError.apply(console, args);
    try {
      const msg = args.map(a => (typeof a === 'object' ? (a?.message || JSON.stringify(a).slice(0, 150)) : String(a))).join(' ');
      appendSilentLog('ERROR', 'FreeIPTV', msg);
    } catch (e) {}
  };

  // Compatibilidad con modales de diagnóstico anteriores (100% silenciosos)
  window.openIptvLogsModal = function() {
    console.log('[FreeIPTV] Diagnóstico en modo silencioso activo. Total logs:', window.iptvLogEntries.length);
  };
  window.closeIptvLogsModal = function() {};
  window.clearIptvLogs = function() { window.silentLog.clear(); };
  window.copyIptvLogs = function() {
    try {
      navigator.clipboard.writeText(window.silentLog.exportText());
    } catch (e) {}
  };

  silentLog.info('SYSTEM', 'Logger silencioso iniciado. Logs activos para depuración USB (ADB).');
})();
