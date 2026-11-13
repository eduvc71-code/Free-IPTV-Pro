// =========================================================
// Free-IPTV Pro - EPGManager.js (FASE R5)
// Guia de programacion (EPG) del panel Xtream Codes.
// Fuente: player_api.php?action=get_epg_info&stream_id=...
// No requiere XMLTV configurado en la cuenta.
// =========================================================

class EPGManager {
  constructor() {
    this.cache = {};        // stream_id -> lista de programas
    this.cacheTime = {};    // stream_id -> timestamp
    this.TTL = 30 * 60 * 1000; // 30 min
    this.currentStreamId = null;
  }

  // Obtiene la programacion de un canal
  async fetchForStream(streamId) {
    if (!streamId) return [];

    const now = Date.now();
    if (this.cache[streamId] && (now - (this.cacheTime[streamId] || 0)) < this.TTL) {
      return this.cache[streamId];
    }

    const acc = this.getAccount();
    if (!acc) return [];

    const url = `${acc.server}/player_api.php?username=${encodeURIComponent(acc.username)}` +
                `&password=${encodeURIComponent(acc.password)}` +
                `&action=get_epg_info&stream_id=${encodeURIComponent(streamId)}`;

    try {
      const text = await this.fetchText(url);
      const data = JSON.parse(text);
      if (!Array.isArray(data)) return [];

      const programs = data
        .map(p => ({
          id: p.id,
          title: p.title || p.name || 'Programa',
          desc: p.description || '',
          start: p.start_timestamp ? Number(p.start_timestamp) * 1000 : 0,
          end: p.end_timestamp ? Number(p.end_timestamp) * 1000 : 0,
          lang: p.lang || '',
          channelId: p.channel_id || ''
        }))
        .filter(p => p.start > 0)
        .sort((a, b) => a.start - b.start);

      this.cache[streamId] = programs;
      this.cacheTime[streamId] = now;
      return programs;
    } catch (e) {
      console.warn('[EPG] No se pudo obtener la programacion:', e.message);
      return [];
    }
  }

  // Cuenta Xtream activa
  getAccount() {
    try {
      const saved = localStorage.getItem('free_iptv_active_account');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    try {
      const accs = JSON.parse(localStorage.getItem('free_iptv_xtream_accounts') || '[]');
      return accs && accs.length ? accs[0] : null;
    } catch (e) {
      return null;
    }
  }

  // Descarga de texto (usa CapacitorHttp si esta disponible)
  async fetchText(url) {
    const cap = window.Capacitor;
    const capHttp = cap && (cap.Plugins && cap.Plugins.CapacitorHttp) || window.CapacitorHttp;
    if (capHttp && typeof capHttp.get === 'function') {
      const res = await capHttp.get({ url, headers: { 'Accept': 'application/json' } });
      if (res && res.data !== undefined && res.data !== null) {
        return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      }
    }
    const resp = await fetch(url);
    return await resp.text();
  }

  // Actualiza el panel EPG de la columna 3
  async updatePanel(channel) {
    const panel = document.getElementById('tv-epg-panel');
    if (!panel) return;

    // v1.6.1.0: el panel EPG esta oculto -> no se descarga programacion
    if (getComputedStyle(panel).display === 'none') return;

    const titleEl = document.getElementById('tv-epg-channel-title');
    const nowEl = document.getElementById('tv-epg-now');
    const nowTime = document.getElementById('tv-epg-now-time');
    const nowTitle = document.getElementById('tv-epg-now-title');
    const barWrap = document.getElementById('tv-epg-bar-wrap');
    const barFill = document.getElementById('tv-epg-bar-fill');
    const startEl = document.getElementById('tv-epg-start');
    const endEl = document.getElementById('tv-epg-end');
    const listEl = document.getElementById('tv-epg-list');
    const emptyEl = document.getElementById('tv-epg-empty');

    // El panel solo se muestra en el layout de 3 columnas
    const isWide = window.innerWidth >= 900;
    if (!isWide) {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    panel.classList.add('flex');

    if (!channel) {
      if (titleEl) titleEl.innerText = 'Selecciona un canal';
      if (listEl) listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      if (nowEl) nowEl.style.display = 'none';
      if (barWrap) barWrap.style.display = 'none';
      return;
    }

    if (titleEl) titleEl.innerText = channel.name || 'Canal';

    // Solo hay EPG para cuentas Xtream (Modo B) con stream_id
    const streamId = channel.stream_id;
    if (!streamId) {
      if (listEl) listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      if (emptyEl) emptyEl.innerHTML =
        '<i class="fa-solid fa-circle-info text-xl mb-1 block opacity-40"></i> EPG no disponible para este origen';
      if (nowEl) nowEl.style.display = 'none';
      if (barWrap) barWrap.style.display = 'none';
      return;
    }

    const programs = await this.fetchForStream(streamId);
    if (!programs || programs.length === 0) {
      if (listEl) listEl.innerHTML = '';
      if (emptyEl) {
        emptyEl.style.display = 'block';
        emptyEl.innerHTML =
          '<i class="fa-solid fa-calendar-day text-xl mb-1 block opacity-40"></i> Sin informacion de programacion disponible';
      }
      if (nowEl) nowEl.style.display = 'none';
      if (barWrap) barWrap.style.display = 'none';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    const now = Date.now();
    const current = programs.find(p => p.start <= now && p.end > now);
    const upcoming = programs.filter(p => p.start > now).slice(0, 8);

    // Bloque AHORA
    if (current) {
      if (nowEl) nowEl.style.display = 'flex';
      if (nowTime) nowTime.innerText = this.fmtTime(current.start) + '-' + this.fmtTime(current.end);
      if (nowTitle) nowTitle.innerText = current.title;
      if (barWrap) barWrap.style.display = 'block';
      if (startEl) startEl.innerText = this.fmtTime(current.start);
      if (endEl) endEl.innerText = this.fmtTime(current.end);
      const total = current.end - current.start;
      const pct = total > 0 ? Math.min(100, Math.max(0, ((now - current.start) / total) * 100)) : 0;
      if (barFill) barFill.style.width = pct.toFixed(1) + '%';
    } else {
      if (nowEl) nowEl.style.display = 'none';
      if (barWrap) barWrap.style.display = 'none';
    }

    // Proximos programas
    if (listEl) {
      listEl.innerHTML = '';
      upcoming.forEach(p => {
        const row = document.createElement('div');
        row.className = 'xm-epg-row';
        const dur = Math.max(0, Math.round((p.end - p.start) / 60000));
        row.innerHTML = `
          <span class="xm-epg-row-time">${this.fmtTime(p.start)}</span>
          <span class="xm-epg-row-title">${p.title}</span>
          <span class="xm-epg-row-dur">${dur}m</span>
        `;
        listEl.appendChild(row);
      });
    }
  }

  fmtTime(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
}

window.EPGManager = EPGManager;
window.epgManager = new EPGManager();
console.log('[EPGManager] Módulo cargado');
