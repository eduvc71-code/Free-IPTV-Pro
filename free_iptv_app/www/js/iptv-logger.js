// =========================================================
// Free-IPTV Pro - iptv-logger.js (DESACTIVADO)
// Logs del frontend deshabilitados por solicitud del usuario.
// =========================================================

window.iptvLogEntries = [];

window.openIptvLogsModal = function() { /* Logs desactivados */ };
window.closeIptvLogsModal = function() { /* Logs desactivados */ };
window.clearIptvLogs = function() { /* Logs desactivados */ };
window.copyIptvLogs = function() { /* Logs desactivados */ };

// Interceptor de consola desactivado (no captura nada)
(function() {
  // No se sobreescribe console.log/warn/error para evitar ruido de logs
})();
