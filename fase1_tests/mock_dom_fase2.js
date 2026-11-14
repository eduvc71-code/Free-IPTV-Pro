// =========================================================
// Mock DOM para pruebas de Fase 2 (UI/UX y diseño)
// =========================================================

class MockElement {
  constructor(id = '', className = '') {
    this.id = id;
    this.className = className;
    this.classList = {
      _classes: className ? className.split(' ') : [],
      add: function (...c) { this._classes.push(...c); },
      remove: function (...c) { this._classes = this._classes.filter(x => !c.includes(x)); },
      contains: function (c) { return this._classes.includes(c); },
      toggle: function (c, force) {
        if (force === undefined) force = !this._classes.includes(c);
        if (force) this._classes.push(c);
        else this._classes = this._classes.filter(x => x !== c);
        return force;
      }
    };
    this.style = {};
    this.innerHTML = '';
    this.innerText = '';
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.tabIndex = -1;
    this.offsetParent = null; // null = oculto
    this.getBoundingClientRect = () => ({ width: 100, height: 100, left: 0, top: 0 });
    this.appendChild = (el) => { this.children.push(el); el.parentElement = this; return el; };
    this.remove = () => {};
    this.querySelector = () => null;
    this.querySelectorAll = () => [];
    this.addEventListener = () => {};
    this.setAttribute = () => {};
    this.removeAttribute = () => {};
    this.focus = () => {};
    this.scrollIntoView = () => {};
    this.click = () => {};
  }
}

global.document = {
  getElementById: (id) => {
    // Simular elementos clave del index.html
    const keyMap = {
      'player-container': new MockElement('player-container', 'relative w-full aspect-video bg-black'),
      'modal-vod-detail': new MockElement('modal-vod-detail', 'modal-overlay'),
      'modal-series-detail': new MockElement('modal-series-detail', 'modal-overlay'),
      'modal-audio-subtitles': new MockElement('modal-audio-subtitles', 'modal-overlay'),
      'modal-lists': new MockElement('modal-lists', 'modal-overlay'),
      'modal-exit-confirm': new MockElement('modal-exit-confirm', 'modal-overlay'),
      'modal-country-selector': new MockElement('modal-country-selector', 'modal-overlay'),
      'modal-sleep-timer': new MockElement('modal-sleep-timer', 'modal-overlay'),
      'modal-iptv-logs': new MockElement('modal-iptv-logs', 'modal-overlay'),
      'main-video': new MockElement('main-video', ''),
      'player-overlay': new MockElement('player-overlay', 'player-overlay controls-hidden'),
      'toast': new MockElement('toast', ''),
      'tv-global-header': new MockElement('tv-global-header', 'hidden items-center justify-between'),
      'btn-player-minimize': new MockElement('btn-player-minimize', 'hidden'),
      'btn-fs-icon': new MockElement('btn-fs-icon', 'fa-solid fa-expand'),
      'hud-channel-title': new MockElement('hud-channel-title', ''),
      'hud-channel-group': new MockElement('hud-channel-group', ''),
      'hud-quality-badge': new MockElement('hud-quality-badge', 'badge-quality hidden'),
      'player-sleep-badge': new MockElement('player-sleep-badge', 'sleep-badge hidden'),
      'player-idle': new MockElement('player-idle', 'hidden'),
      'player-error': new MockElement('player-error', 'hidden'),
      'player-loading': new MockElement('player-loading', 'hidden'),
      'player-bg-retry': new MockElement('player-bg-retry', 'hidden'),
      'gesture-hud': new MockElement('gesture-hud', 'gesture-hud'),
      'tv-channels-list': new MockElement('tv-channels-list', ''),
      'channels-list': new MockElement('channels-list', ''),
      'content-type-bar': new MockElement('content-type-bar', 'hidden items-center'),
      'tv-content-type-bar': new MockElement('tv-content-type-bar', 'xm-tabs'),
      'btn-content-live': new MockElement('btn-content-live', ''),
      'btn-content-vod': new MockElement('btn-content-vod', ''),
      'btn-content-series': new MockElement('btn-content-series', ''),
      'tv-btn-content-live': new MockElement('tv-btn-content-live', 'xm-tab active'),
      'tv-btn-content-vod': new MockElement('tv-btn-content-vod', 'xm-tab'),
      'tv-btn-content-series': new MockElement('tv-btn-content-series', 'xm-tab'),
      'btn-player-minimize': new MockElement('btn-player-minimize', 'hidden'),
    };
    return keyMap[id] || new MockElement(id);
  },
  querySelectorAll: () => [],
  addEventListener: () => {},
  body: new MockElement('body', ''),
  createElement: (tag) => new MockElement(tag)
};

global.window = {
  addEventListener: () => {},
  matchMedia: () => ({ addEventListener: () => {}, removeEventListener: () => {} }),
  innerWidth: 1024,
  innerHeight: 768,
  dispatchEvent: () => true
};
global.navigator = { app: { exitApp: () => {} } };
global.localStorage = { _store: {}, getItem: (k) => global.localStorage._store[k] || null, setItem: (k, v) => { global.localStorage._store[k] = v; }, removeItem: (k) => { delete global.localStorage._store[k]; } };
global.sessionStorage = { _store: {}, getItem: (k) => null, setItem: () => {}, removeItem: () => {} };
global.showToast = (msg) => {};
global.dataService = { getFavorites: () => [], isFavorite: () => false, toggleFavorite: () => false };
