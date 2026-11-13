// =========================================================
// Free-IPTV Pro - TVNavigation.js (FASE 6)
// Navegación 100% operable mediante control remoto (DPAD)
// para Android TV y Fire TV.
// =========================================================

class TVNavigation {
  constructor(options = {}) {
    this.options = {
      focusClass: 'tv-focused',
      focusBorderColor: '#3b82f6',
      focusShadow: '0 0 20px rgba(59, 130, 246, 0.8)',
      selectableSelector: '[tabindex="0"], .tv-cat-item, .channel-card, .category-pill, button, a',
      ...options
    };

    this.focusedElement = null;
    this.focusableElements = [];
    this.currentIndex = -1;
    this.isTVMode = false;
    this.inFullscreenPlayer = false;
    this.backHandler = options.onBack || null;

    this.init();
  }

  init() {
    this.detectTVMode();
    this.bindKeydown();
    this.refreshFocusables();
    this.injectFocusStyles();
  }

  detectTVMode() {
    const ua = this.options.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
    // Android TV / Google TV / Fire TV estrictos (nunca un smartphone o tablet táctil)
    this.isTVMode = /android tv|googletv/i.test(ua) || /aftm|aftl|aftt|aftb|afts|firetv/i.test(ua);

    if (this.isTVMode) {
      document.body.classList.add('tv-mode');
      console.log('[TVNavigation] Modo Android TV detectado');
    }
  }

  bindKeydown() {
    document.addEventListener('keydown', (e) => {
      if (!this.isTVMode) return;

      const key = e.key;
      const code = e.keyCode || e.which;

      // Mapeo DPAD estándar Android TV
      // Arriba = 19 / ArrowUp, Abajo = 20 / ArrowDown
      // Izquierda = 21 / ArrowLeft, Derecha = 22 / ArrowRight
      // OK/Enter = 23 / 66 / Enter, Back = 4 / Backspace / Escape

      if (key === 'ArrowUp' || code === 19) {
        e.preventDefault();
        this.moveFocus('up');
        return;
      }
      if (key === 'ArrowDown' || code === 20) {
        e.preventDefault();
        this.moveFocus('down');
        return;
      }
      if (key === 'ArrowLeft' || code === 21) {
        e.preventDefault();
        this.moveFocus('left');
        return;
      }
      if (key === 'ArrowRight' || code === 22) {
        e.preventDefault();
        this.moveFocus('right');
        return;
      }

      // OK / Enter / Select
      if (key === 'Enter' || code === 13 || code === 23 || code === 66) {
        e.preventDefault();
        this.activateFocused();
        return;
      }

      // Back / Atrás
      if (key === 'Backspace' || key === 'Escape' || code === 4 || code === 27) {
        e.preventDefault();
        this.handleBack();
        return;
      }
    }, true);
  }

  refreshFocusables() {
    if (!this.isTVMode) return;
    const nodes = Array.from(document.querySelectorAll(this.options.selectableSelector));
    // Filtrar elementos visibles y no deshabilitados
    this.focusableElements = nodes.filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' &&
             style.visibility !== 'hidden' &&
             !el.hasAttribute('disabled') &&
             el.offsetParent !== null;
    });
    this.currentIndex = Math.max(0, Math.min(this.currentIndex, this.focusableElements.length - 1));
    this.applyFocus(this.currentIndex);
  }

  applyFocus(index) {
    if (index < 0 || index >= this.focusableElements.length) return;

    // Quitar foco anterior
    if (this.focusedElement) {
      this.focusedElement.classList.remove(this.options.focusClass);
      this.focusedElement.style.outline = '';
      this.focusedElement.style.boxShadow = '';
      this.focusedElement.style.border = '';
    }

    this.currentIndex = index;
    this.focusedElement = this.focusableElements[index];

    // Aplicar foco visual de alto contraste
    this.focusedElement.classList.add(this.options.focusClass);
    this.focusedElement.style.outline = `3px solid ${this.options.focusBorderColor}`;
    this.focusedElement.style.outlineOffset = '2px';
    this.focusedElement.style.boxShadow = this.options.focusShadow;
    this.focusedElement.style.zIndex = '50';
    this.focusedElement.style.borderRadius = '8px';
    this.focusedElement.style.background = 'rgba(59, 130, 246, 0.15)';

    // Hacer scroll al elemento enfocado si es necesario
    try {
      this.focusedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    } catch (e) {}
  }

  moveFocus(direction) {
    if (!this.isTVMode || this.focusableElements.length === 0) return;

    let next = this.currentIndex;

    // Para TV en modo 3 columnas, intentamos navegar por filas/columnas aproximadas
    if (direction === 'up' || direction === 'down') {
      const currentRect = this.focusedElement ? this.focusedElement.getBoundingClientRect() : null;
      if (currentRect) {
        const candidates = this.focusableElements.map((el, idx) => {
          const r = el.getBoundingClientRect();
          return { el, idx, r };
        }).filter(c => c.r.width > 0 && c.r.height > 0);

        if (direction === 'up') {
          const above = candidates.filter(c => c.r.bottom < currentRect.top - 5)
            .sort((a, b) => b.r.bottom - a.r.bottom);
          if (above.length > 0) {
            next = above[0].idx;
          } else {
            next = (this.currentIndex - 1 + this.focusableElements.length) % this.focusableElements.length;
          }
        } else {
          const below = candidates.filter(c => c.r.top > currentRect.bottom + 5)
            .sort((a, b) => a.r.top - b.r.top);
          if (below.length > 0) {
            next = below[0].idx;
          } else {
            next = (this.currentIndex + 1) % this.focusableElements.length;
          }
        }
      } else {
        next = direction === 'up'
          ? (this.currentIndex - 1 + this.focusableElements.length) % this.focusableElements.length
          : (this.currentIndex + 1) % this.focusableElements.length;
      }
    } else {
      // Izquierda / Derecha
      next = direction === 'left'
        ? (this.currentIndex - 1 + this.focusableElements.length) % this.focusableElements.length
        : (this.currentIndex + 1) % this.focusableElements.length;
    }

    this.applyFocus(next);
  }

  activateFocused() {
    if (!this.focusedElement) return;
    // Disparar click nativo para respetar listeners existentes
    this.focusedElement.click();
  }

  handleBack() {
    if (typeof this.backHandler === 'function') {
      this.backHandler();
      return;
    }

    // Comportamiento predeterminado según estado de la app
    const playerContainer = document.getElementById('player-container');
    const isFullscreen = playerContainer && playerContainer.classList.contains('fullscreen-player');

    if (isFullscreen) {
      // Si está a pantalla completa ➡️ salir al menú sin detener reproducción
      const exitBtn = document.getElementById('btn-player-minimize');
      if (exitBtn && typeof exitBtn.click === 'function') {
        exitBtn.click();
      } else if (window.playerManager && typeof window.playerManager.exitFullscreenMode === 'function') {
        window.playerManager.exitFullscreenMode();
      }
      return;
    }

    // Si está en una categoría ➡️ volver al selector de categorías (no implementado como pila,
    // así que intentamos ir a home si existe una función global)
    if (typeof window.switchTab === 'function' && window.activeTab !== 'home') {
      window.switchTab('home');
      return;
    }

    // Si está en pantalla principal ➡️ solicitar confirmación de salida
    if (typeof window.confirmExitApp === 'function') {
      window.confirmExitApp();
    } else if (typeof navigator.app === 'object' && typeof navigator.app.exitApp === 'function') {
      navigator.app.exitApp();
    }
  }

  setInFullscreen(isFullscreen) {
    this.inFullscreenPlayer = isFullscreen;
    // Cuando entramos/salimos de fullscreen, reajustar foco
    if (isFullscreen) {
      this.clearFocus();
    } else {
      this.refreshFocusables();
    }
  }

  clearFocus() {
    if (this.focusedElement) {
      this.focusedElement.classList.remove(this.options.focusClass);
      this.focusedElement.style.outline = '';
      this.focusedElement.style.boxShadow = '';
      this.focusedElement.style.border = '';
      this.focusedElement = null;
    }
    this.currentIndex = -1;
  }

  destroy() {
    this.clearFocus();
    document.removeEventListener('keydown', this._keydownHandler, true);
  }

  injectFocusStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .tv-focused {
        outline: 3px solid #3b82f6 !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 20px rgba(59, 130, 246, 0.8) !important;
        z-index: 50 !important;
        background: rgba(59, 130, 246, 0.15) !important;
        border-radius: 8px !important;
        transition: all 0.1s ease;
      }
      body.tv-mode .channel-card.tv-focused {
        border: 3px solid #3b82f6 !important;
        transform: scale(1.03);
        z-index: 60 !important;
      }
      body.tv-mode .tv-cat-item.tv-focused {
        background: rgba(59, 130, 246, 0.25) !important;
        border-left: 4px solid #3b82f6 !important;
        color: #60a5fa !important;
      }
      body.tv-mode .nav-btn.tv-focused,
      body.tv-mode button.tv-focused {
        background: #3b82f6 !important;
        color: #fff !important;
      }
    `;
    if (document.head) {
      document.head.appendChild(style);
    }
  }
}

window.TVNavigation = TVNavigation;
window.tvNavigation = new TVNavigation({
  onBack: null // Se asignará desde app.js si se necesita lógica personalizada
});

console.log('[TVNavigation] Módulo cargado. Modo TV:', window.tvNavigation.isTVMode);
