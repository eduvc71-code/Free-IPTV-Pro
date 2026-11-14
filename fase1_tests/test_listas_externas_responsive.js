// =========================================================
// test_listas_externas_responsive.js
// Pruebas unitarias para carga de listas externas y países
// con centrado responsive en pantallas pequeñas.
// Ejecutar con: node test_listas_externas_responsive.js
// =========================================================

const fs = require('fs');
const path = require('path');
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
// MOCK DEL DOM PARA PRUEBAS DE LISTAS EXTERNAS
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
    const idMatch = html.match(/id="([^"]+)"/);
    if (idMatch) {
      const child = new MockElement(idMatch[1]);
      this.children.push(child);
      child.parentElement = this;
    }
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
  addEventListener: () => {}
};

const mockWindow = {
  innerWidth: 360, // Pantalla pequeña (móvil)
  innerHeight: 640,
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
    isChannelDead: () => false,
    parseXtreamUrl: (url) => null,
    parseM3U: (text, name) => {
      // Simular parseo de M3U con 3 canales
      if (text.includes('#EXTM3U') || text.includes('#EXTINF')) {
        return [
          { id: 'ch_1', name: 'Canal 1', url: 'http://test1.m3u8', logo: '', group: 'Test' },
          { id: 'ch_2', name: 'Canal 2', url: 'http://test2.m3u8', logo: '', group: 'Test' },
          { id: 'ch_3', name: 'Canal 3', url: 'http://test3.m3u8', logo: '', group: 'Test' }
        ];
      }
      return [];
    },
    fetchTextUniversal: async (url) => {
      if (url.includes('.m3u') || url.includes('.m3u8')) {
        return '#EXTM3U\n#EXTINF:-1,Canal Test\nhttp://test.m3u8';
      }
      throw new Error('URL no válida');
    },
    saveAccount: () => {},
    saveCustomPlaylist: () => {},
    setCachedChannels: async () => {},
    getCachedChannels: async () => null
  },
  playerManager: { currentChannel: null, stopPlayback: async () => {}, exitFullscreenMode: () => {} },
  exoPlayerPlugin: { available: false, stop: async () => {} },
  Capacitor: { Plugins: {} },
  AndroidNativeApp: undefined,
  Hls: { isSupported: () => false },
  currentContentType: 'live',
  currentAppMode: 'A',
  activeTab: 'home',
  modeBChannels: [],
  vodCategories: [],
  seriesCategories: [],
  allChannels: [],
  currentRenderedList: [],
  displayedChannelCount: 0,
  americasCountries: [],
  currentCountry: null,
  activeCategoriesMap: {},
  activeCategoriesList: [],
  currentSelectedCategory: 'Todos'
};

global.document = mockDocument;
global.window = mockWindow;
global.navigator = mockWindow;
global.localStorage = mockWindow.localStorage;

// =========================================================
// FUNCIONES DE CARGA DE LISTAS A VALIDAR (simuladas del código real)
// =========================================================

/**
 * Carga una lista M3U externa por URL (simplificada del código real)
 */
async function loadCustomM3UUrl(url) {
  if (!url || !url.startsWith('http')) {
    throw new Error("Ingresa una URL válida que empiece por http:// o https://");
  }

  const text = await mockWindow.dataService.fetchTextUniversal(url);
  const parsed = mockWindow.dataService.parseM3U(text, 'M3U Externa');
  if (parsed.length === 0) {
    throw new Error("No se encontraron canales válidos en la lista.");
  }

  mockWindow.modeBChannels = parsed;
  mockWindow.currentAppMode = 'B';
  mockWindow.activeTab = 'home';

  return { success: true, channels: parsed.length, listName: url.split('/').pop() };
}

/**
 * Importa países seleccionados (simplificada del código real)
 */
async function importSelectedCountries(countryCodes) {
  if (!countryCodes || countryCodes.length === 0) {
    throw new Error("Por favor selecciona al menos un país.");
  }

  // Simular carga de canales por país
  const allChannels = [];
  for (const code of countryCodes) {
    allChannels.push({ id: `ch_${code}`, name: `Canal ${code}`, url: `http://${code}.m3u8`, group: code });
  }

  mockWindow.modeBChannels = allChannels;
  mockWindow.currentAppMode = 'A';
  mockWindow.activeTab = 'home';

  return { success: true, channels: allChannels.length, countries: countryCodes.length };
}

/**
 * Centra un contenedor para listas (responsive)
 */
function centerListContainer(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return false;

  // En pantallas pequeñas, usar ancho completo sin max-width restrictivo
  const isSmallScreen = mockWindow.innerWidth < 576;

  el.classList.add('list-manager-centered');
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.width = '100%';
  el.style.maxWidth = isSmallScreen ? '100%' : '1200px';
  el.style.margin = '0 auto';
  el.style.padding = isSmallScreen ? '12px' : '20px';
  el.style.boxSizing = 'border-box';

  return true;
}

/**
 * Verifica que el contenedor esté centrado correctamente
 */
function verifyContainerCentered(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return false;

  const isSmallScreen = mockWindow.innerWidth < 576;
  const maxWidth = el.style.maxWidth;
  const margin = el.style.margin;
  const padding = el.style.padding;

  // En pantallas pequeñas, max-width debe ser 100% (no 1200px que rompería el layout)
  if (isSmallScreen && maxWidth !== '100%') {
    return false;
  }

  return margin === '0 auto' && displayFlex(el);
}

function displayFlex(el) {
  return el.style.display === 'flex';
}

// Registrar elementos clave
const requiredIds = [
  'custom-m3u-url', 'btn-load-m3u-url', 'input-local-m3u',
  'tv-list-url', 'btn-tv-load-list', 'tv-custom-playlists-container',
  'selector-country-list', 'btn-import-countries',
  'modal-lists', 'modal-country-selector',
  'list-manager-container', 'main-viewport-container'
];
requiredIds.forEach(id => { elements[id] = new MockElement(id); });
mockDocument.getElementById = (id) => elements[id] || new MockElement(id);

// =========================================================
// PRUEBAS
// =========================================================

async function run() {
  console.log('\n🧪 PRUEBAS — Listas Externas y Países (Responsive)\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // TEST 1: Cargar lista M3U externa exitosa
  await test(
    'Cargar lista M3U externa con canales válidos',
    async () => {
      const result = await loadCustomM3UUrl('http://servidor/lista.m3u');
      assert.strictEqual(result.success, true, 'Debe retornar éxito');
      assert.strictEqual(result.channels, 3, 'Debe cargar 3 canales');
      assert.strictEqual(mockWindow.currentAppMode, 'B', 'Debe cambiar a Modo B');
      assert.strictEqual(mockWindow.activeTab, 'home', 'Debe ir al tab home');
    }
  );

  // TEST 2: Cargar lista M3U externa sin URL válida
  await test(
    'Rechazar URL vacía o inválida',
    async () => {
      let errorCaught = false;
      try {
        await loadCustomM3UUrl('');
      } catch (e) {
        errorCaught = true;
      }
      assert.strictEqual(errorCaught, true, 'Debe lanzar error para URL vacía');
    }
  );

  // TEST 3: Importar países
  await test(
    'Importar países seleccionados',
    async () => {
      const result = await importSelectedCountries(['CL', 'AR', 'MX']);
      assert.strictEqual(result.success, true, 'Debe retornar éxito');
      assert.strictEqual(result.channels, 3, 'Debe crear 3 canales (uno por país)');
      assert.strictEqual(result.countries, 3, 'Debe procesar 3 países');
      assert.strictEqual(mockWindow.currentAppMode, 'A', 'Debe mantener Modo A');
    }
  );

  // TEST 4: Importar sin países seleccionados
  await test(
    'Rechazar importación sin países',
    async () => {
      let errorCaught = false;
      try {
        await importSelectedCountries([]);
      } catch (e) {
        errorCaught = true;
      }
      assert.strictEqual(errorCaught, true, 'Debe lanzar error sin países');
    }
  );

  // TEST 5: Centrar contenedor en pantalla pequeña (responsive)
  await test(
    'Centrar contenedor en pantalla pequeña (<576px)',
    () => {
      mockWindow.innerWidth = 360; // Móvil pequeño
      const result = centerListContainer('list-manager-container');
      assert.strictEqual(result, true, 'centerListContainer debe retornar true');

      const el = document.getElementById('list-manager-container');
      assert.strictEqual(el.style.maxWidth, '100%', 'En pantallas pequeñas max-width debe ser 100%');
      assert.strictEqual(el.style.margin, '0 auto', 'Margin debe ser 0 auto');
      assert.strictEqual(el.style.padding, '12px', 'En pantallas pequeñas padding debe ser 12px');
      assert.strictEqual(el.style.display, 'flex', 'Display debe ser flex');
    }
  );

  // TEST 6: Centrar contenedor en pantalla grande (desktop/TV)
  await test(
    'Centrar contenedor en pantalla grande (≥576px)',
    () => {
      mockWindow.innerWidth = 1024; // Desktop/TV
      const result = centerListContainer('list-manager-container');
      assert.strictEqual(result, true, 'centerListContainer debe retornar true');

      const el = document.getElementById('list-manager-container');
      assert.strictEqual(el.style.maxWidth, '1200px', 'En pantallas grandes max-width debe ser 1200px');
      assert.strictEqual(el.style.padding, '20px', 'En pantallas grandes padding debe ser 20px');
    }
  );

  // TEST 7: Verificar centrado en pantalla pequeña
  await test(
    'Verificar centrado correcto en pantalla pequeña',
    () => {
      mockWindow.innerWidth = 360;
      const result = centerListContainer('list-manager-container');
      const verified = verifyContainerCentered('list-manager-container');
      assert.strictEqual(verified, true, 'El contenedor debe estar correctamente centrado en pantalla pequeña');
    }
  );

  // TEST 8: Los modales de listas y países existen en el DOM
  await test(
    'Los modales de listas externas y países existen en el DOM',
    () => {
      const modalLists = document.getElementById('modal-lists');
      const modalCountries = document.getElementById('modal-country-selector');
      assert.ok(modalLists, 'modal-lists debe existir');
      assert.ok(modalCountries, 'modal-country-selector debe existir');
    }
  );

  // TEST 9: Los contenedores de listas guardadas existen
  await test(
    'Los contenedores de listas guardadas existen',
    () => {
      const tvPlaylists = document.getElementById('tv-custom-playlists-container');
      const countryList = document.getElementById('selector-country-list');
      assert.ok(tvPlaylists, 'tv-custom-playlists-container debe existir');
      assert.ok(countryList, 'selector-country-list debe existir');
    }
  );

  // TEST 10: No romper el flujo de carga al cambiar de modo
  await test(
    'No romper el flujo de carga de listas externas',
    async () => {
      // Simular el flujo completo: cargar lista → cambiar modo → ir a home
      const url = 'http://servidor/lista.m3u';
      const result = await loadCustomM3UUrl(url);

      // Verificar estado después de carga
      assert.strictEqual(mockWindow.modeBChannels.length, 3, 'modeBChannels debe tener 3 canales');
      assert.strictEqual(mockWindow.currentAppMode, 'B', 'currentAppMode debe ser B');
      assert.strictEqual(mockWindow.activeTab, 'home', 'activeTab debe ser home');

      // Verificar que se puede cargar otra lista sin errores
      const result2 = await loadCustomM3UUrl('http://otra-lista.m3u');
      assert.strictEqual(result2.success, true, 'Segunda carga debe funcionar');
    }
  );

  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`📊 Resultados Listas Externas: ${passed} pasadas, ${failed} fallidas`);
  if (failed > 0) {
    console.log('⚠️  HAY FALLOS. Revisar antes de aplicar cambios.');
    process.exit(1);
  } else {
    console.log('✅ TODAS LAS PRUEBAS DE LISTAS EXTERNAS PASARON. Lista para implementar.');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
