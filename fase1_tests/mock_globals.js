// =========================================================
// Entorno de mocks para pruebas unitarias (Node.js)
// Simula el mínimo necesario del navegador/Capacitor para
// probar la lógica de reproducción sin tocar archivos reales.
// =========================================================

global.window = {};
global.document = {
  getElementById: () => ({
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    innerText: '',
    innerHTML: '',
    className: '',
    src: '',
    pause: () => {},
    removeAttribute: () => {},
    load: () => {},
    error: null,
    readyState: 0,
    paused: true,
    play: () => Promise.resolve(),
    videoWidth: 0,
    videoHeight: 0,
    audioTracks: [],
    textTracks: [],
    style: {}
  }),
  querySelectorAll: () => [],
  addEventListener: () => {},
  fullscreenElement: null,
  webkitFullscreenElement: null,
  exitFullscreen: () => Promise.resolve(),
  webkitExitFullscreen: () => Promise.resolve(),
  body: { classList: { add: () => {}, remove: () => {} } }
};
global.navigator = { app: { exitApp: () => {} } };
global.localStorage = {
  _store: {},
  getItem: (k) => global.localStorage._store[k] || null,
  setItem: (k, v) => { global.localStorage._store[k] = v; },
  removeItem: (k) => { delete global.localStorage._store[k]; }
};
global.sessionStorage = {
  _store: {},
  getItem: (k) => global.sessionStorage._store[k] || null,
  setItem: (k, v) => { global.sessionStorage._store[k] = v; },
  removeItem: (k) => { delete global.sessionStorage._store[k]; }
};
global.Capacitor = { Plugins: {} };
global.AndroidNativeApp = undefined;
global.showToast = (msg) => { /* noop */ };
global.dataService = {
  getSavedAccounts: () => [],
  getCustomPlaylists: () => [],
  getFavorites: () => [],
  isFavorite: () => false,
  toggleFavorite: () => false,
  markChannelDead: () => {},
  isChannelDead: () => false,
  groupChannelsByCategory: (ch) => ({ map: {}, categories: [] })
};
global.playerManager = null;
global.exoPlayerPlugin = { available: false, stop: async () => {}, play: async () => {} };
global.openMediaInExternalPlayer = () => {};
global.Hls = {
  isSupported: () => false,
  Events: { ERROR: 'error', MANIFEST_PARSED: 'parsed' },
  DefaultConfig: { loader: class {} }
};
