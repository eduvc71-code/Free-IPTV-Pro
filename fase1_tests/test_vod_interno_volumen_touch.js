// =========================================================
// test_vod_interno_volumen_touch.js
// Pruebas para:
//  1. Reproducción interna de VOD (no solo externo)
//  2. Volumen sincronizado con botones nativos
//  3. Touch gestures en pantallas táctiles
//  4. Controles remotos DPAD
// Ejecutar con: node test_vod_interno_volumen_touch.js
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
// MOCK DEL DOM PARA PRUEBAS DE REPRODUCCIÓN
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
  playerManager: { currentChannel: null, stopPlayback: async () => {}, exitFullscreenMode: () => {}, toggleFullscreen: () => {} },
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

// =========================================================
// CÓDIGO A VALIDAR (extraído de player.js)
// =========================================================

// Simulación de la lógica actual de player.js para VOD
function esContenidoVOD(channel) {
  return channel.isVod || channel.type === 'vod' || channel.series_id || channel.episode_id || 
         (window.currentContentType && window.currentContentType !== 'live');
}

function esMotorExternoNecesario(channel) {
  // Regla actual: VOD va SIEMPRE a externo
  if (esContenidoVOD(channel)) {
    return 'externo_solo';
  }
  return 'interno';
}

// Nueva lógica propuesta: VOD puede ir interno o externo
function motorRecomendadoParaVOD(channel, usarInterno = true) {
  if (esContenidoVOD(channel)) {
    return usarInterno ? 'interno' : 'externo';
  }
  return 'interno';
}

// Simulación de control de volumen con botones físicos
class ControlVolumen {
  constructor() {
    this.volumen = 1.0;
    this.volumenAnterior = 1.0;
  }

  subirVolumen() {
    this.volumen = Math.min(1.0, this.volumen + 0.1);
    return Math.round(this.volumen * 100);
  }

  bajarVolumen() {
    this.volumen = Math.max(0.0, this.volumen - 0.1);
    return Math.round(this.volumen * 100);
  }

  silenciar() {
    if (this.volumen > 0) {
      this.volumenAnterior = this.volumen;
      this.volumen = 0;
    } else {
      this.volumen = this.volumenAnterior || 1.0;
    }
    return Math.round(this.volumen * 100);
  }

  obtenerVolumen() {
    return Math.round(this.volumen * 100);
  }
}

// Simulación de gestos táctiles
class GestosTactiles {
  constructor() {
    this.ultimoGesto = null;
    this.ultimaPosicion = { x: 0, y: 0 };
  }

  detectarGasto(contactoX, contactoY, anchoPantalla) {
    const tercioIzquierdo = anchoPantalla * 0.33;
    const tercioDerecho = anchoPantalla * 0.66;

    if (contactoX < tercioIzquierdo) {
      this.ultimoGesto = 'brillo';
    } else if (contactoX > tercioDerecho) {
      this.ultimoGesto = 'volumen';
    } else {
      this.ultimoGesto = 'play_pause';
    }

    this.ultimaPosicion = { x: contactoX, y: contactoY };
    return this.ultimoGesto;
  }

  obtenerUltimoGesto() {
    return this.ultimoGesto;
  }
}

// =========================================================
// PRUEBAS
// =========================================================

async function run() {
  console.log('\n🧪 PRUEBAS — VOD Interno, Volumen, Touch y Controles Remotos\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // TEST 1: VOD actual se va SIEMPRE a externo (problema reportado)
  await test(
    'VOD actual: contenido VOD se clasifica como externo_solo',
    () => {
      const vodChannel = { id: 'vod_1', name: 'Película', type: 'vod', url: 'http://test/pelicula.mp4' };
      const resultado = esMotorExternoNecesario(vodChannel);
      assert.strictEqual(resultado, 'externo_solo', 'VOD actual va SIEMPRE a externo - ESTE ES EL PROBLEMA');
    }
  );

  // TEST 2: Nueva lógica permite VOD interno
  await test(
    'Nueva lógica: VOD puede reproducirse INTERNAMENTE',
    () => {
      const vodChannel = { id: 'vod_1', name: 'Película', type: 'vod', url: 'http://test/pelicula.mp4' };
      const resultadoInterno = motorRecomendadoParaVOD(vodChannel, true);
      const resultadoExterno = motorRecomendadoParaVOD(vodChannel, false);
      assert.strictEqual(resultadoInterno, 'interno', 'VOD puede ir interno');
      assert.strictEqual(resultadoExterno, 'externo', 'VOD puede ir externo (opcional)');
    }
  );

  // TEST 3: Series también pueden ir interno
  await test(
    'Series: pueden reproducirse internamente',
    () => {
      const serie = { id: 'serie_1', name: 'Serie', series_id: '123', url: 'http://test/serie.mp4' };
      const resultado = motorRecomendadoParaVOD(serie, true);
      assert.strictEqual(resultado, 'interno', 'Series pueden ir interno');
    }
  );

  // TEST 4: TV en vivo SIEMPRE va interno (no cambiar)
  await test(
    'TV en vivo: siempre va a reproductor interno',
    () => {
      const canal = { id: 'ch_1', name: 'Canal', type: 'live', url: 'http://test/canal.m3u8' };
      window.currentContentType = 'live';
      const resultado = motorRecomendadoParaVOD(canal, true);
      assert.strictEqual(resultado, 'interno', 'TV en vivo va interno');
    }
  );

  // TEST 5: Control de volumen - subir
  await test(
    'Volumen: subir desde 0.5 hasta 0.6',
    () => {
      const vol = new ControlVolumen();
      vol.volumen = 0.5;
      const resultado = vol.subirVolumen();
      assert.strictEqual(resultado, 60, 'Volumen debería ser 60%');
      assert.strictEqual(vol.obtenerVolumen(), 60, 'Volumen actual debería ser 60');
    }
  );

  // TEST 6: Control de volumen - bajar
  await test(
    'Volumen: bajar desde 0.5 hasta 0.4',
    () => {
      const vol = new ControlVolumen();
      vol.volumen = 0.5;
      const resultado = vol.bajarVolumen();
      assert.strictEqual(resultado, 40, 'Volumen debería ser 40%');
    }
  );

  // TEST 7: Control de volumen - silenciar y restaurar
  await test(
    'Volumen: silenciar y restaurar',
    () => {
      const vol = new ControlVolumen();
      vol.volumen = 0.7;
      const resultadoSilenciar = vol.silenciar();
      assert.strictEqual(resultadoSilenciar, 0, 'Volumen silenciado debería ser 0');
      const resultadoRestaurar = vol.silenciar();
      assert.strictEqual(resultadoRestaurar, 70, 'Volumen restaurado debería ser 70');
    }
  );

  // TEST 8: Control de volumen - límites (no exceder 100 ni bajar de 0)
  await test(
    'Volumen: límites máximo y mínimo',
    () => {
      const vol = new ControlVolumen();
      vol.volumen = 1.0;
      const max = vol.subirVolumen();
      assert.strictEqual(max, 100, 'No debe exceder 100');
      vol.volumen = 0.0;
      const min = vol.bajarVolumen();
      assert.strictEqual(min, 0, 'No debe bajar de 0');
    }
  );

  // TEST 9: Gestos táctiles - zona izquierda (brillo)
  await test(
    'Touch: gesto de brillo en zona izquierda',
    () => {
      const gestos = new GestosTactiles();
      const gesto = gestos.detectarGasto(100, 300, 1024); // Izquierda
      assert.strictEqual(gesto, 'brillo', 'Zona izquierda = brillo');
    }
  );

  // TEST 10: Gestos táctiles - zona derecha (volumen)
  await test(
    'Touch: gesto de volumen en zona derecha',
    () => {
      const gestos = new GestosTactiles();
      const gesto = gestos.detectarGasto(800, 300, 1024); // Derecha
      assert.strictEqual(gesto, 'volumen', 'Zona derecha = volumen');
    }
  );

  // TEST 11: Gestos táctiles - zona centro (play/pause)
  await test(
    'Touch: gesto de play/pause en zona centro',
    () => {
      const gestos = new GestosTactiles();
      const gesto = gestos.detectarGasto(500, 300, 1024); // Centro
      assert.strictEqual(gesto, 'play_pause', 'Zona centro = play/pause');
    }
  );

  // TEST 12: Verificar que botones físicos de volumen existan en player.js
  await test(
    'Código: initHardwareVolumeKeys existe en player.js',
    () => {
      const fs = require('fs');
      const path = require('path');
      const playerJsPath = path.resolve(
        'C:/Users/Eduardo/Downloads/world_ip_tv-1.6.0.1/world_ip_tv-1.6.0.1/free_iptv_app/www/js/player.js'
      );
      const playerJs = fs.readFileSync(playerJsPath, 'utf8');
      assert.ok(playerJs.includes('initHardwareVolumeKeys'), 'player.js debe tener initHardwareVolumeKeys');
      assert.ok(playerJs.includes('VolumeUp') || playerJs.includes('keyCode === 24'), 'Debe manejar tecla Volumen Up');
      assert.ok(playerJs.includes('VolumeDown') || playerJs.includes('keyCode === 25'), 'Debe manejar tecla Volumen Down');
    }
  );

  // TEST 13: Verificar que gestos táctiles existan en player.js
  await test(
    'Código: initTouchGestures existe en player.js',
    () => {
      const fs = require('fs');
      const path = require('path');
      const playerJsPath = path.resolve(
        'C:/Users/Eduardo/Downloads/world_ip_tv-1.6.0.1/world_ip_tv-1.6.0.1/free_iptv_app/www/js/player.js'
      );
      const playerJs = fs.readFileSync(playerJsPath, 'utf8');
      assert.ok(playerJs.includes('initTouchGestures'), 'player.js debe tener initTouchGestures');
      assert.ok(playerJs.includes('touchstart'), 'Debe manejar touchstart');
      assert.ok(playerJs.includes('touchmove'), 'Debe manejar touchmove');
    }
  );

  // TEST 14: Verificar que controles remotos DPAD existan en app.js
  await test(
    'Código: initTVRemoteControl existe en app.js',
    () => {
      const fs = require('fs');
      const path = require('path');
      const appJsPath = path.resolve(
        'C:/Users/Eduardo/Downloads/world_ip_tv-1.6.0.1/world_ip_tv-1.6.0.1/free_iptv_app/www/js/app.js'
      );
      const appJs = fs.readFileSync(appJsPath, 'utf8');
      assert.ok(appJs.includes('initTVRemoteControl'), 'app.js debe tener initTVRemoteControl');
      assert.ok(appJs.includes('MediaPlayPause') || appJs.includes('key === \'MediaPlayPause\''), 'Debe manejar tecla Play/Pause remoto');
      assert.ok(appJs.includes('ChannelUp') || appJs.includes('key === \'ChannelUp\''), 'Debe manejar tecla Canal Up');
      assert.ok(appJs.includes('ChannelDown') || appJs.includes('key === \'ChannelDown\''), 'Debe manejar tecla Canal Down');
    }
  );

  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`📊 Resultados VOD/Volumen/Touch/Remoto: ${passed} pasadas, ${failed} fallidas`);
  if (failed > 0) {
    console.log('⚠️  HAY FALLOS. Revisar antes de aplicar cambios.');
    process.exit(1);
  } else {
    console.log('✅ TODAS LAS PRUEBAS PASARON. Lista para implementar.');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
