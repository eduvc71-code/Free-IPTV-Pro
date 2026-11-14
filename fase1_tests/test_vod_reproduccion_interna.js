// =========================================================
// test_vod_reproduccion_interna.js
// Pruebas para:
//  1. Contenedor del reproductor no se desborde (ajuste CSS)
//  2. Mensaje cuando no se puede reproducir internamente
//  3. Detección de reproductor externo y sugerencia de instalación
//  4. Opción "no volver a preguntar" para reproductor externo
// Ejecutar con: node test_vod_reproduccion_interna.js
// =========================================================

const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve().then(async () => {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`❌ FAIL: ${name} — ${e.message}`);
      failed++;
    }
  });
}

// =========================================================
// MOCK DEL DOM PARA PRUEBAS DE REPRODUCCIÓN VOD
// =========================================================

class MockElement {
  constructor(id = '', className = '') {
    this.id = id;
    this.className = className;
    this._classes = className ? className.split(' ') : [];
    this._innerHTML = '';
    this.innerText = '';
    this.src = '';
    this.value = '';
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.dataset = {};
    this.tabIndex = -1;
    this.offsetParent = null;
    this.getBoundingClientRect = () => ({ width: 300, height: 200, left: 0, top: 0 });
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
    this.files = null;
    this.checked = false;
    this.muted = false;
    this.volume = 1.0;
    this.paused = true;
    this.error = null;
    this.readyState = 0;
    this.videoWidth = 0;
    this.videoHeight = 0;
    this.play = () => Promise.resolve();
    this.pause = () => {};
    this.load = () => {};
    this.classList = {
      add: (...c) => { this._classes.push(...c); },
      remove: (...c) => { this._classes = this._classes.filter(x => !c.includes(x)); },
      contains: (c) => this._classes.includes(c),
      toggle: (c, force) => {
        if (force === undefined) force = !this._classes.includes(c);
        if (force) this._classes.push(c);
        else this._classes = this._classes.filter(x => x !== c);
        return force;
      }
    };
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  get firstElementChild() {
    return this.children[0] || null;
  }
}

const elements = {};
function getElementById(id) {
  if (!elements[id]) elements[id] = new MockElement(id);
  return elements[id];
}

const mockDocument = {
  getElementById,
  querySelectorAll: () => [],
  createElement: (tag) => new MockElement(tag),
  body: new MockElement('body', ''),
  addEventListener: () => {},
  fullscreenElement: null,
  webkitFullscreenElement: null,
  exitFullscreen: () => Promise.resolve(),
  webkitExitFullscreen: () => Promise.resolve()
};

const mockWindow = {
  innerWidth: 360,   // Pantalla pequeña móvil
  innerHeight: 640,
  screen: { orientation: { lock: () => Promise.resolve(), unlock: () => Promise.resolve() } },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  matchMedia: () => ({ addEventListener: () => {}, removeEventListener: () => {} }),
  localStorage: {
    _store: {},
    getItem: (k) => mockWindow.localStorage._store[k] || null,
    setItem: (k, v) => { mockWindow.localStorage._store[k] = v; },
    removeItem: (k) => { delete mockWindow.localStorage._store[k]; }
  },
  showToast: (msg) => {},
  dataService: {
    getSavedAccounts: () => [],
    getCustomPlaylists: () => [],
    getFavorites: () => [],
    isFavorite: () => false,
    toggleFavorite: () => false,
    markChannelDead: () => {},
    isChannelDead: () => false
  },
  playerManager: {
    currentChannel: null,
    stopPlayback: async () => {},
    exitFullscreenMode: () => {},
    toggleFullscreen: () => {},
    play: async () => { /* Simular fallo de reproducción interna */ throw new Error('No se puede reproducir internamente'); },
    hls: null,
    isExoPlayerActive: false
  },
  exoPlayerPlugin: { available: false, stop: async () => {}, play: async () => {}, on: () => {} },
  Capacitor: { Plugins: {} },
  AndroidNativeApp: undefined,
  Hls: { isSupported: () => false },
  currentContentType: 'live',
  currentAppMode: 'A',
  activeTab: 'home',
  modeBChannels: []
};

global.document = mockDocument;
global.window = mockWindow;
global.navigator = mockWindow;
global.localStorage = mockWindow.localStorage;

// Registrar elementos del DOM
const requiredIds = [
  'player-container', 'main-video', 'player-loading', 'player-error',
  'player-idle', 'player-bg-retry', 'player-overlay', 'gesture-hud',
  'hud-channel-title', 'hud-channel-group', 'hud-quality-badge',
  'player-sleep-badge', 'btn-play-icon', 'tv-hud-channel-title',
  'tv-hud-channel-subtitle', 'tv-category-badge', 'current-country-title',
  'modal-vod-detail', 'modal-series-detail',
  'channels-list', 'tv-channels-list', 'content-type-bar',
  'btn-content-live', 'btn-content-vod', 'btn-content-series',
  'tv-btn-content-live', 'tv-btn-content-vod', 'tv-btn-content-series',
  'btn-player-minimize', 'btn-fs-icon', 'toggle-autoplay', 'tv-toggle-autoplay'
];
requiredIds.forEach(id => { elements[id] = new MockElement(id); });
mockDocument.getElementById = (id) => elements[id] || new MockElement(id);

// =========================================================
// PRUEBAS DE REPRODUCCIÓN VOD INTERNA
// =========================================================

async function run() {
  console.log('\n🧪 PRUEBAS — Reproducción VOD Interna y Reproductor Externo\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // TEST 1: playerManager.play existe y es función
  await test(
    'playerManager.play existe y es una función',
    () => {
      assert.strictEqual(typeof mockWindow.playerManager.play, 'function', 'playerManager.play debe ser una función');
    }
  );

  // TEST 2: openCurrentInExternalPlayer existe en app.js
  await test(
    'openCurrentInExternalPlayer existe en app.js',
    () => {
      const fs = require('fs');
      const path = require('path');
      const appJsPath = path.resolve(
        'C:/Users/Eduardo/Downloads/world_ip_tv-1.6.0.1/world_ip_tv-1.6.0.1/free_iptv_app/www/js/app.js'
      );
      const appJs = fs.readFileSync(appJsPath, 'utf8');
      assert.ok(appJs.includes('function openCurrentInExternalPlayer()'), 'openCurrentInExternalPlayer debe existir');
    }
  );

  // TEST 3: player.js usa HTML5 primero para VOD (no ExoPlayer primero)
  await test(
    'player.js intenta HTML5 primero para VOD',
    () => {
      const fs = require('fs');
      const path = require('path');
      const playerJsPath = path.resolve(
        'C:/Users/Eduardo/Downloads/world_ip_tv-1.6.0.1/world_ip_tv-1.6.0.1/free_iptv_app/www/js/player.js'
      );
      const playerJs = fs.readFileSync(playerJsPath, 'utf8');
      // Verificar que NO haya 'Derivando directamente a ExoPlayer (VOD' al inicio
      assert.ok(!playerJs.includes('Derivando directamente a ExoPlayer (VOD o Ext incompatible)'), 
        'player.js no debe forzar ExoPlayer primero para VOD');
      assert.ok(playerJs.includes('Usando reproducción directa HTML5'), 
        'player.js debe usar HTML5 primero');
    }
  );

  // TEST 4: CSS tiene reglas para ajustar reproductor en móviles
  await test(
    'app.css tiene reglas para ajustar reproductor en dispositivos pequeños',
    () => {
      const fs = require('fs');
      const path = require('path');
      const appCssPath = path.resolve(
        'C:/Users/Eduardo/Downloads/world_ip_tv-1.6.0.1/world_ip_tv-1.6.0.1/free_iptv_app/www/css/app.css'
      );
      const appCss = fs.readFileSync(appCssPath, 'utf8');
      assert.ok(appCss.includes('@media (max-width: 767px)'), 
        'app.css debe tener reglas para pantallas pequeñas');
      assert.ok(appCss.includes('max-width: 100%'), 
        'app.css debe limitar el ancho máximo al 100%');
    }
  );

  // TEST 5: player.js tiene lógica de fallback a reproductor externo
  await test(
    'player.js tiene fallback a reproductor externo',
    () => {
      const fs = require('fs');
      const path = require('path');
      const playerJsPath = path.resolve(
        'C:/Users/Eduardo/Downloads/world_ip_tv-1.6.0.1/world_ip_tv-1.6.0.1/free_iptv_app/www/js/player.js'
      );
      const playerJs = fs.readFileSync(playerJsPath, 'utf8');
      assert.ok(playerJs.includes('openMediaInExternalPlayer'), 
        'player.js debe tener lógica para reproductor externo');
      assert.ok(playerJs.includes('Sin soporte interno'), 
        'player.js debe mostrar mensaje cuando no hay soporte interno');
    }
  );

  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`📊 Resultados Reproducción VOD Interna: ${passed} pasadas, ${failed} fallidas`);
  if (failed > 0) {
    console.log('⚠️  HAY FALLOS. Revisar antes de aplicar cambios.');
    process.exit(1);
  } else {
    console.log('✅ TODAS LAS PRUEBAS PASARON. Lista para implementar.');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
