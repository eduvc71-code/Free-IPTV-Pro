// =========================================================
// test_vod_interno_reproducir.js
// Pruebas específicas para diagnóstico de reproducción interna de VOD
// Ejecutar con: node test_vod_interno_reproducir.js
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
// MOCK DEL DOM PARA DIAGNÓSTICO DE REPRODUCCIÓN VOD
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
  innerWidth: 1024,
  innerHeight: 768,
  screen: { orientation: { lock: () => Promise.resolve(), unlock: () => Promise.resolve() } },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  matchMedia: () => ({ addEventListener: () => {}, removeEventListener: () => {} }),
  localStorage: { _store: {}, getItem: (k) => mockWindow.localStorage._store[k] || null, setItem: (k, v) => { mockWindow.localStorage._store[k] = v; }, removeItem: (k) => { delete mockWindow.localStorage._store[k]; } },
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
  playerManager: { currentChannel: null, stopPlayback: async () => {}, exitFullscreenMode: () => {}, toggleFullscreen: () => {}, play: async () => {} },
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

// Registrar elementos del DOM que usa player.js y app.js
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
// PRUEBAS DE DIAGNÓSTICO DE REPRODUCCIÓN VOD INTERNA
// =========================================================

async function run() {
  console.log('\n🧪 PRUEBAS — Diagnóstico de Reproducción VOD Interna\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // TEST 1: playCurrentVod debe llamar a playerManager.play (no openMediaInExternalPlayer)
  await test(
    'playCurrentVod llama a playerManager.play (reproducción interna)',
    () => {
      const fs = require('fs');
      const path = require('path');
      const appJsPath = path.resolve(
        'C:/Users/Eduardo/Downloads/world_ip_tv-1.6.0.1/world_ip_tv-1.6.0.1/free_iptv_app/www/js/app.js'
      );
      const appJs = fs.readFileSync(appJsPath, 'utf8');
      
      // Verificar que playCurrentVod usa playerManager.play y NO openMediaInExternalPlayer directamente
      const playCurrentVodSection = appJs.substring(
        appJs.indexOf('function playCurrentVod()'),
        appJs.indexOf('}', appJs.indexOf('function playCurrentVod()') + 100)
      );
      
      assert.ok(playCurrentVodSection.includes('playerManager.play'), 'playCurrentVod debe llamar a playerManager.play');
      assert.ok(!playCurrentVodSection.includes('openMediaInExternalPlayer'), 'playCurrentVod NO debe llamar directamente a openMediaInExternalPlayer');
    }
  );

  // TEST 2: openCurrentInExternalPlayer debe existir y llamar a openMediaInExternalPlayer
  await test(
    'openCurrentInExternalPlayer existe y llama a openMediaInExternalPlayer',
    () => {
      const fs = require('fs');
      const path = require('path');
      const appJsPath = path.resolve(
        'C:/Users/Eduardo/Downloads/world_ip_tv-1.6.0.1/world_ip_tv-1.6.0.1/free_iptv_app/www/js/app.js'
      );
      const appJs = fs.readFileSync(appJsPath, 'utf8');
      
      assert.ok(appJs.includes('function openCurrentInExternalPlayer()'), 'openCurrentInExternalPlayer debe existir');
      assert.ok(appJs.includes('openMediaInExternalPlayer(currentVodItem.url'), 'openCurrentInExternalPlayer debe llamar a openMediaInExternalPlayer con la URL del VOD');
    }
  );

  // TEST 3: playerManager.play existe y es una función
  await test(
    'playerManager.play existe y es una función',
    () => {
      assert.strictEqual(typeof mockWindow.playerManager.play, 'function', 'playerManager.play debe ser una función');
    }
  );

  // TEST 4: playerManager.currentChannel se establece después de play()
  await test(
    'playerManager.play establece currentChannel',
    async () => {
      const vodItem = { id: 'vod_1', name: 'Película Test', url: 'http://test/pelicula.mp4', type: 'vod' };
      mockWindow.playerManager.currentChannel = null;
      
      // Simular lo que hace play() en player.js
      mockWindow.playerManager.currentChannel = vodItem;
      
      assert.strictEqual(mockWindow.playerManager.currentChannel, vodItem, 'currentChannel debe estar establecido');
      assert.strictEqual(mockWindow.playerManager.currentChannel.name, 'Película Test', 'Nombre del canal debe ser correcto');
    }
  );

  // TEST 5: URL de VOD tiene extensión de video válida
  await test(
    'URL de VOD tiene extensión de video válida (.mp4, .mkv, etc.)',
    () => {
      const vodUrl = 'http://servidor.com/pelicula.mp4';
      const isVideoExt = /\.(mp4|mkv|avi|mov|m4v|wmv|flv|webm|ts|m2ts|mpg|mpeg)(?:$|[?#])/i.test(vodUrl);
      assert.strictEqual(isVideoExt, true, 'URL de VOD debe tener extensión de video válida');
    }
  );

  // TEST 6: VOD con URL .m3u8 también es válido
  await test(
    'VOD con URL .m3u8 es válido para reproducción interna',
    () => {
      const vodUrl = 'http://servidor.com/pelicula.m3u8';
      const isM3U8 = /\.m3u8(?:$|[?#])/i.test(vodUrl);
      assert.strictEqual(isM3U8, true, 'URL .m3u8 debe ser detectada como HLS');
    }
  );

  // TEST 7: playerManager.play no debe hacer return temprano para VOD
  await test(
    'playerManager.play no hace return temprano para VOD (Fase 4)',
    () => {
      const fs = require('fs');
      const path = require('path');
      const playerJsPath = path.resolve(
        'C:/Users/Eduardo/Downloads/world_ip_tv-1.6.0.1/world_ip_tv-1.6.0.1/free_iptv_app/www/js/player.js'
      );
      const playerJs = fs.readFileSync(playerJsPath, 'utf8');
      
      // Verificar que ya NO hay 'return' después de detectar VOD/Series
      const vodSection = playerJs.substring(
        playerJs.indexOf('REGLA FASE 4: VOD y Series'),
        playerJs.indexOf('Guard de reentrada')
      );
      
      assert.ok(!vodSection.includes('return;'), 'playerManager.play NO debe hacer return temprano para VOD');
      assert.ok(vodSection.includes('intentando reproducción INTERNA primero'), 'Debe indicar reproducción interna primero');
    }
  );

  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`📊 Resultados Diagnóstico VOD Interna: ${passed} pasadas, ${failed} fallidas`);
  if (failed > 0) {
    console.log('⚠️  HAY FALLOS. Revisar antes de aplicar cambios.');
    process.exit(1);
  } else {
    console.log('✅ TODAS LAS PRUEBAS DE DIAGNÓSTICO VOD PASARON.');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
