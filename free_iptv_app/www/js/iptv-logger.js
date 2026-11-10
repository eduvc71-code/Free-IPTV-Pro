// =========================================================
// IPTV Diagnostic Logger & Live Console Interceptor
// Captures [IPTV] events, Hls.js states, and network errors
// directly on Android device without needing USB/ADB.
// =========================================================

window.iptvLogEntries = [];

(function() {
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  function formatArg(arg) {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
    try {
      return JSON.stringify(arg, (key, value) => {
        if (value instanceof HTMLElement) return `<${value.tagName.toLowerCase()} id="${value.id}">`;
        return value;
      }, 2);
    } catch (e) {
      return String(arg);
    }
  }

  function appendLog(level, args) {
    const time = new Date().toTimeString().split(' ')[0];
    const text = args.map(formatArg).join(' ');
    
    // Prioritize IPTV, Video, and network related logs
    const entry = `[${time}] [${level}] ${text}`;
    window.iptvLogEntries.push(entry);

    if (window.iptvLogEntries.length > 500) {
      window.iptvLogEntries.shift();
    }

    // Auto-update modal if open
    const modal = document.getElementById('modal-iptv-logs');
    const logBox = document.getElementById('iptv-logs-content');
    if (modal && modal.classList.contains('show') && logBox) {
      logBox.textContent = window.iptvLogEntries.join('\n');
      logBox.scrollTop = logBox.scrollHeight;
    }
  }

  console.log = function(...args) {
    origLog.apply(console, args);
    appendLog('LOG', args);
  };

  console.warn = function(...args) {
    origWarn.apply(console, args);
    appendLog('WARN', args);
  };

  console.error = function(...args) {
    origError.apply(console, args);
    appendLog('ERROR', args);
  };
})();

window.openIptvLogsModal = function() {
  const modal = document.getElementById('modal-iptv-logs');
  const logBox = document.getElementById('iptv-logs-content');
  if (!modal || !logBox) return;

  if (window.iptvLogEntries && window.iptvLogEntries.length > 0) {
    logBox.textContent = window.iptvLogEntries.join('\n');
  } else {
    logBox.textContent = '--- Sin registros aún. Reproduce un canal para ver eventos [IPTV] ---';
  }

  modal.classList.add('show');
  setTimeout(() => {
    logBox.scrollTop = logBox.scrollHeight;
  }, 100);
};

window.closeIptvLogsModal = function() {
  const modal = document.getElementById('modal-iptv-logs');
  if (modal) modal.classList.remove('show');
};

window.clearIptvLogs = function() {
  window.iptvLogEntries = [];
  const logBox = document.getElementById('iptv-logs-content');
  if (logBox) logBox.textContent = '--- Registros limpiados ---';
  if (typeof showToast === 'function') showToast('Logs limpiados');
};

window.copyIptvLogs = async function() {
  const text = (window.iptvLogEntries && window.iptvLogEntries.length > 0)
    ? window.iptvLogEntries.join('\n')
    : (document.getElementById('iptv-logs-content')?.textContent || 'Sin logs');

  const btnText = document.getElementById('btn-copy-logs-text');

  let copied = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch (e) {
    console.warn('Clipboard API error, trying fallback:', e);
  }

  if (!copied) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      copied = document.execCommand('copy');
      document.body.removeChild(textarea);
    } catch (e) {
      console.error('Fallback copy failed:', e);
    }
  }

  if (copied) {
    if (btnText) btnText.textContent = '¡Copiado con Éxito! ✓';
    if (typeof showToast === 'function') showToast('¡Logs copiados al portapapeles!');
    setTimeout(() => {
      if (btnText) btnText.textContent = 'Copiar Todos los Logs';
    }, 2500);
  } else {
    if (typeof showToast === 'function') showToast('Error al copiar. Selecciona y copia manualmente.');
  }
};
