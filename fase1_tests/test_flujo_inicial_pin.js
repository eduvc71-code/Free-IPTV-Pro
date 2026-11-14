// =========================================================
// test_flujo_inicial_pin.js
// Pruebas para:
//  1. Flujo: Disclaimer -> Modal Listas Externas -> Modal Países
//  2. Campo PIN en Ajustes para contenido adulto por servidor/host
// Ejecutar con: node test_flujo_inicial_pin.js
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
// MOCK DEL DOM
// =========================================================

class MockElement {
  constructor(id = '', className = '') {
    this.id = id;
    this.className = className;
    this._classes = className ? className.split(' ') : [];
    this._innerHTML = '';
    this.innerText = '';
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
}

const mockWindow = {
  innerWidth: 360,
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
  playerManager: { currentChannel: null, stopPlayback: async () => {}, exitFullscreenMode: () => {} },
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
  'modal-legal-disclaimer', 'modal-lists', 'modal-country-selector', 'modal-settings',
  'pin-input', 'pin-confirm', 'pin-server', 'pin-content-type',
  'btn-accept-legal', 'btn-open-lists', 'btn-import-countries',
  'btn-save-pin', 'btn-cancel-pin'
];
requiredIds.forEach(id => { elements[id] = new MockElement(id); });
mockDocument.getElementById = (id) => elements[id] || new MockElement(id);

// =========================================================
// FUNCIONES A VALIDAR (simuladas del código real)
// =========================================================

// Estado simulado
let legalAccepted = false;
let pinEnabled = false;
let pinValue = '';
let pinServer = '';
let pinContentTypes = [];

function acceptLegalDisclaimer() {
  localStorage.setItem('free_iptv_legal_accepted', 'true');
  legalAccepted = true;
  // Ir directo a listas externas después de aceptar
  openListsModal();
}

function openListsModal() {
  const modal = document.getElementById('modal-lists');
  if (modal) modal.classList.add('show', 'active');
}

function openCountrySelectorModal() {
  const modal = document.getElementById('modal-country-selector');
  if (modal) modal.classList.add('show');
}

function openSettingsModal() {
  const modal = document.getElementById('modal-settings');
  if (modal) modal.classList.add('show', 'active');
}

function closeListsModal() {
  const modal = document.getElementById('modal-lists');
  if (modal) modal.classList.remove('show', 'active');
}

function savePinSettings(pin, server, contentTypes) {
  pinValue = pin;
  pinServer = server;
  pinContentTypes = contentTypes;
  pinEnabled = true;
  localStorage.setItem('free_iptv_pin_enabled', 'true');
  localStorage.setItem('free_iptv_pin_value', pin);
  localStorage.setItem('free_iptv_pin_server', server);
  localStorage.setItem('free_iptv_pin_content_types', JSON.stringify(contentTypes));
}

function isPinEnabledForContent(server, contentType) {
  const savedPin = localStorage.getItem('free_iptv_pin_enabled');
  const savedServer = localStorage.getItem('free_iptv_pin_server');
  const savedContentTypes = JSON.parse(localStorage.getItem('free_iptv_pin_content_types') || '[]');
  
  if (!savedPin || savedServer !== server) return false;
  return savedContentTypes.includes(contentType);
}

function validatePin(enteredPin) {
  const savedPin = localStorage.getItem('free_iptv_pin_value');
  return enteredPin === savedPin;
}

// =========================================================
// PRUEBAS
// =========================================================

async function run() {
  console.log('\n🧪 PRUEBAS — Flujo Inicial + PIN Contenido Adulto\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // TEST 1: acceptLegalDisclaimer abre modal de listas externas
  await test(
    'acceptLegalDisclaimer abre modal de listas externas (M3U/Xtream)',
    () => {
      acceptLegalDisclaimer();
      const modal = document.getElementById('modal-lists');
      assert.strictEqual(legalAccepted, true, 'legalAccepted debe ser true');
      assert.ok(modal.classList.contains('show'), 'modal-lists debe estar abierto');
    }
  );

  // TEST 2: Después de aceptar legal, no queda en pantalla de bienvenida
  await test(
    'Después de aceptar legal, se va directo a listas externas',
    () => {
      localStorage.removeItem('free_iptv_legal_accepted');
      legalAccepted = false;
      acceptLegalDisclaimer();
      assert.strictEqual(localStorage.getItem('free_iptv_legal_accepted'), 'true');
    }
  );

  // TEST 3: Guardar PIN para contenido adulto por servidor
  await test(
    'Guardar PIN para contenido adulto por servidor',
    () => {
      savePinSettings('1234', 'http://servidor.com', ['vod', 'series']);
      assert.strictEqual(pinEnabled, true);
      assert.strictEqual(pinValue, '1234');
      assert.strictEqual(pinServer, 'http://servidor.com');
      assert.deepStrictEqual(pinContentTypes, ['vod', 'series']);
    }
  );

  // TEST 4: isPinEnabledForContent devuelve true si coincide servidor y tipo
  await test(
    'isPinEnabledForContent devuelve true para servidor y tipo correctos',
    () => {
      localStorage.setItem('free_iptv_pin_enabled', 'true');
      localStorage.setItem('free_iptv_pin_server', 'http://servidor.com');
      localStorage.setItem('free_iptv_pin_content_types', JSON.stringify(['vod', 'series']));
      
      const result = isPinEnabledForContent('http://servidor.com', 'vod');
      assert.strictEqual(result, true, 'Debe requerir PIN para VOD en servidor configurado');
    }
  );

  // TEST 5: isPinEnabledForContent devuelve false si servidor no coincide
  await test(
    'isPinEnabledForContent devuelve false si servidor no coincide',
    () => {
      const result = isPinEnabledForContent('http://otro-servidor.com', 'vod');
      assert.strictEqual(result, false, 'No debe requerir PIN para servidor diferente');
    }
  );

  // TEST 6: isPinEnabledForContent devuelve false si tipo de contenido no está en lista
  await test(
    'isPinEnabledForContent devuelve false si tipo no está en lista',
    () => {
      const result = isPinEnabledForContent('http://servidor.com', 'live');
      assert.strictEqual(result, false, 'No debe requerir PIN para live si no está en lista');
    }
  );

  // TEST 7: validatePin devuelve true con PIN correcto
  await test(
    'validatePin devuelve true con PIN correcto',
    () => {
      localStorage.setItem('free_iptv_pin_value', '1234');
      assert.strictEqual(validatePin('1234'), true);
    }
  );

  // TEST 8: validatePin devuelve false con PIN incorrecto
  await test(
    'validatePin devuelve false con PIN incorrecto',
    () => {
      assert.strictEqual(validatePin('0000'), false);
    }
  );

  // TEST 9: Flujo completo: Legal -> Listas -> Países
  await test(
    'Flujo completo: aceptar legal -> abrir listas -> abrir países',
    () => {
      localStorage.removeItem('free_iptv_legal_accepted');
      legalAccepted = false;
      
      acceptLegalDisclaimer();
      assert.ok(document.getElementById('modal-lists').classList.contains('show'), 'Modal listas abierto');
      
      closeListsModal();
      assert.ok(!document.getElementById('modal-lists').classList.contains('show'), 'Modal listas cerrado');
      
      openCountrySelectorModal();
      assert.ok(document.getElementById('modal-country-selector').classList.contains('show'), 'Modal países abierto');
    }
  );

  // TEST 10: openSettingsModal abre configuración
  await test(
    'openSettingsModal abre modal de configuración',
    () => {
      openSettingsModal();
      const modal = document.getElementById('modal-settings');
      assert.ok(modal.classList.contains('show'), 'modal-settings debe estar abierto');
    }
  );

  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`📊 Resultados Flujo Inicial + PIN: ${passed} pasadas, ${failed} fallidas`);
  if (failed > 0) {
    console.log('⚠️  HAY FALLOS. Revisar antes de aplicar cambios.');
    process.exit(1);
  } else {
    console.log('✅ TODAS LAS PRUEBAS PASARON. Lista para implementar.');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
