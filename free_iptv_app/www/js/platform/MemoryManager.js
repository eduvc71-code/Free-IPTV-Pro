// =========================================================
// Free-IPTV Pro - MemoryManager.js (FASE 7)
// Optimización de memoria y limpieza de DOM fuera de vista.
// Complementa el Virtual Scrolling ya existente.
// =========================================================

class MemoryManager {
  constructor(options = {}) {
    this.options = {
      maxRenderedItems: 200,       // Máximo de elementos DOM en lista antes de limpiar
      offscreenThreshold: 500,     // px fuera del viewport para considerar limpieza
      cleanupIntervalMs: 30000,    // Cada 30s revisar memoria
      ...options
    };

    this.cleanupTimer = null;
    this.start();
  }

  start() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = setInterval(() => this.cleanup(), this.options.cleanupIntervalMs);
    console.log('[MemoryManager] Monitoreo de memoria iniciado');
  }

  stop() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  cleanup() {
    if (!this.options.maxRenderedItems) return;

    const containers = [
      document.getElementById('channels-list'),
      document.getElementById('tv-channels-list'),
      document.getElementById('favorites-list'),
      document.getElementById('tv-categories-list'),
      document.getElementById('series-episodes-list'),
      document.getElementById('series-seasons-tabs')
    ];

    let totalRemoved = 0;
    let channelRemoved = 0;

    containers.forEach(container => {
      if (!container) return;

      // No tocar si el contenedor está siendo scrolleado activamente (evitar parpadeo)
      const isScrolling = (container.dataset && container.dataset.scrolling === 'true');

      // Contar elementos renderizados
      const items = Array.from(container.children);
      if (items.length <= this.options.maxRenderedItems) return;

      // Si está scrolleando, no limpiar para evitar saltos visuales
      if (isScrolling) return;

      // Mantener solo los primeros N elementos (paginación virtual hacia adelante)
      // Los sobrantes se eliminan del DOM pero se conserva la referencia en JS (currentRenderedList)
      const toRemove = items.slice(this.options.maxRenderedItems);
      toRemove.forEach(el => {
        el.remove();
        totalRemoved++;
      });

      // Contenedores de canales: notificar para ajustar displayedChannelCount
      if (container.id === 'channels-list' || container.id === 'tv-channels-list') {
        channelRemoved += toRemove.length;
      }

      if (totalRemoved > 0) {
        console.log(`[MemoryManager] ${totalRemoved} elementos DOM eliminados de ${container.id || 'contenedor'}`);
      }
    });

    // Notificar al controlador de la app para que descuente los elementos
    // eliminados del DOM y la paginación virtual no quede desfasada.
    if (channelRemoved > 0) {
      try {
        window.dispatchEvent(new CustomEvent('freeiptv:dom-trimmed', {
          detail: { removed: channelRemoved }
        }));
      } catch (e) {}
    }

    // Forzar garbage collection hint si está disponible
    if (window.gc && typeof window.gc === 'function') {
      try { window.gc(); } catch (e) {}
    }
  }

  // Marcar que un contenedor está siendo scrolleado (para no limpiar durante el scroll)
  markScrolling(containerId, scrolling) {
    const el = document.getElementById(containerId);
    if (el) el.dataset.scrolling = scrolling ? 'true' : 'false';
  }

  // Liberar referencias de canales muertos para liberar memoria
  purgeDeadChannels() {
    try {
      sessionStorage.removeItem('free_iptv_dead_channels');
    } catch (e) {}
    console.log('[MemoryManager] Referencias de canales muertos purgadas');
  }

  getMemoryInfo() {
    if (window.performance && window.performance.memory) {
      const m = window.performance.memory;
      return {
        usedJSHeapSize: Math.round(m.usedJSHeapSize / 1048576) + ' MB',
        totalJSHeapSize: Math.round(m.totalJSHeapSize / 1048576) + ' MB',
        jsHeapSizeLimit: Math.round(m.jsHeapSizeLimit / 1048576) + ' MB'
      };
    }
    return null;
  }

  logMemory(label = 'memoria') {
    const info = this.getMemoryInfo();
    if (info) {
      console.log(`[MemoryManager] ${label}:`, info);
    }
  }
}

window.MemoryManager = MemoryManager;
window.memoryManager = new MemoryManager();

console.log('[MemoryManager] Módulo cargado');
