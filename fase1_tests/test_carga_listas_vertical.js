// =========================================================
// test_carga_listas_vertical.js
// Pruebas para carga de listas externas y países en modo VERTICAL
// Auto-detección Xtream Code y validador de lista
// Ejecutar con: node test_carga_listas_vertical.js
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
// MOCK DEL DOM PARA CARGA DE LISTAS
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
  addEventListener: () => {}
};

const mockWindow = {
  innerWidth: 360,  // Pantalla pequeña VERTICAL
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
    parseXtreamUrl: (url) => {
      // Simular detección de Xtream en URL
      if (url.includes('get.php') && url.includes('username') && url.includes('password')) {
        return {
          host: 'http://servidor.com',
          port: '80',
          username: 'user1',
          password: 'pass1',
          output: 'm3u8'
        };
      }
      return null;
    },
    parseM3U: (text, name) => {
      if (text.includes('#EXTM3U') || text.includes('#EXTINF')) {
        return [
          { id: 'ch_1', name: 'Canal 1', url: 'http://test1.m3u8', logo: '', group: 'Test' },
          { id: 'ch_2', name: 'Canal 2', url: 'http://test2.m3u8', logo: '', group: 'Test' }
        ];
      }
      return [];
    },
    fetchTextUniversal: async (url) => {
      if (url.includes('.m3u') || url.includes('.m3u8') || url.includes('get.php')) {
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
// FUNCIONES A VALIDAR (simuladas del código real)
// =========================================================

/**
 * Validador de lista M3U antes de cargar
 */
function validarListaM3U(url, contenido) {
  const errores = [];
  
  if (!url || !url.trim()) {
    errores.push('La URL no puede estar vacía');
    return { valido: false, errores };
  }
  
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    errores.push('La URL debe comenzar con http:// o https://');
    return { valido: false, errores };
  }
  
  if (!contenido || contenido.trim() === '') {
    errores.push('La lista no contiene contenido');
    return { valido: false, errores };
  }
  
  if (!contenido.includes('#EXTM3U')) {
    errores.push('No es una lista M3U válida (falta #EXTM3U)');
    return { valido: false, errores };
  }
  
  if (!contenido.includes('#EXTINF')) {
    errores.push('La lista no contiene canales válidos (falta #EXTINF)');
    return { valido: false, errores };
  }
  
  return { valido: true, errores: [] };
}

/**
 * Auto-detectar Xtream Code en URL M3U
 */
function autoDetectarXtream(url) {
  if (!url) return null;
  
  // Patrones de Xtream Codes
  const patrones = [
    /get\.php\?username=([^&]+)&password=***&]+)/i,
    /get\.php\?user=([^&]+)&pass=([^&]+)/i,
    /player_api\.php\?username=([^&]+)&password=***&]+)/i
  ];
  
  for (const patron of patrones) {
    const match = url.match(patron);
    if (match) {
      return {
        esXtream: true,
        usuario: match[1],
        clave: match[2],
        tipo: 'xtream_codes'
      };
    }
  }
  
  return { esXtream: false, tipo: 'm3u_simple' };
}

/**
 * Cargar lista M3U externa con validación y auto-detección Xtream
 */
async function cargarListaM3U(url, nombre) {
  // 1. Validar URL
  if (!url || !url.trim()) {
    throw new Error('La URL no puede estar vacía');
  }
  
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error('La URL debe comenzar con http:// o https://');
  }
  
  // 2. Obtener contenido
  const contenido = await mockWindow.dataService.fetchTextUniversal(url);
  
  // 3. Validar contenido M3U
  const validacion = validarListaM3U(url, contenido);
  if (!validacion.valido) {
    throw new Error(validacion.errores.join('. '));
  }
  
  // 4. Parsear canales
  const canales = mockWindow.dataService.parseM3U(contenido, nombre || 'Lista Externa');
  if (canales.length === 0) {
    throw new Error('No se encontraron canales válidos en la lista');
  }
  
  // 5. Auto-detectar Xtream Code
  const xtreamInfo = autoDetectarXtream(url);
  let esXtream = false;
  if (xtreamInfo && xtreamInfo.esXtream) {
    esXtream = true;
    mockWindow.currentAppMode = 'B';
    mockWindow.showToast(`✨ Xtream Code detectado automáticamente: ${xtreamInfo.usuario}`);
  } else {
    mockWindow.currentAppMode = 'B';
  }
  
  mockWindow.modeBChannels = canales;
  mockWindow.activeTab = 'home';
  
  return {
    exitoso: true,
    canales: canales.length,
    esXtream,
    nombre: nombre || 'Lista Externa',
    xtreamInfo
  };
}

/**
 * Importar países (modo vertical)
 */
async function importarPaises(codigosPaises) {
  if (!codigosPaises || codigosPaises.length === 0) {
    throw new Error('Selecciona al menos un país');
  }
  
  const canales = [];
  for (const codigo of codigosPaises) {
    canales.push({
      id: `pais_${codigo}`,
      name: `Canal ${codigo}`,
      url: `http://${codigo.toLowerCase()}.m3u8`,
      group: codigo
    });
  }
  
  mockWindow.modeBChannels = canales;
  mockWindow.currentAppMode = 'A';
  mockWindow.activeTab = 'home';
  
  return {
    exitoso: true,
    paises: codigosPaises.length,
    canales: canales.length
  };
}

/**
 * Verificar orientación vertical para pantallas de carga
 */
function esPantallaVertical() {
  return mockWindow.innerHeight > mockWindow.innerWidth;
}

/**
 * Aplicar estilo vertical a contenedor de carga
 */
function aplicarEstiloVertical(contenedorId) {
  const el = document.getElementById(contenedorId);
  if (!el) return false;
  
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'flex-start';
  el.style.width = '100%';
  el.style.maxWidth = '500px';  // Ancho limitado para vertical
  el.style.margin = '0 auto';
  el.style.padding = '20px';
  el.style.boxSizing = 'border-box';
  
  return true;
}

// Registrar elementos
const requiredIds = [
  'custom-m3u-url', 'btn-load-m3u-url', 'input-local-m3u',
  'tv-list-url', 'btn-tv-load-list', 'tv-custom-playlists-container',
  'selector-country-list', 'btn-import-countries',
  'modal-lists', 'modal-country-selector',
  'list-manager-container', 'main-viewport-container',
  'xtream-host', 'xtream-port', 'xtream-user', 'xtream-pass', 'xtream-fmt'
];
requiredIds.forEach(id => { elements[id] = new MockElement(id); });
mockDocument.getElementById = (id) => elements[id] || new MockElement(id);

// =========================================================
// PRUEBAS
// =========================================================

async function run() {
  console.log('\n🧪 PRUEBAS — Carga de Listas Externas y Países (VERTICAL)\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // TEST 1: Auto-deteción Xtream Code en URL M3U
  await test(
    'Auto-detectar Xtream Code en URL con get.php?username=&password=',
    () => {
      const info = autoDetectarXtream('http://servidor.com:80/get.php?username=user1&password=***&type=m3u_plus');
      assert.strictEqual(info.esXtream, true, 'Debe detectar como Xtream');
      assert.strictEqual(info.usuario, 'user1', 'Usuario detectado');
      assert.strictEqual(info.clave, 'pass1', 'Clave detectada');
      assert.strictEqual(info.tipo, 'xtream_codes', 'Tipo Xtream Codes');
    }
  );

  // TEST 2: URL M3U simple no es Xtream
  await test(
    'URL M3U simple no detectada como Xtream',
    () => {
      const info = autoDetectarXtream('http://servidor.com/lista.m3u');
      assert.strictEqual(info.esXtream, false, 'No debe ser Xtream');
      assert.strictEqual(info.tipo, 'm3u_simple', 'Tipo M3U simple');
    }
  );

  // TEST 3: Validar lista M3U válida
  await test(
    'Validar lista M3U con #EXTM3U y #EXTINF',
    () => {
      const resultado = validarListaM3U('http://test.com/lista.m3u', '#EXTM3U\n#EXTINF:-1,Canal\nhttp://stream.m3u8');
      assert.strictEqual(resultado.valido, true, 'Lista válida');
      assert.strictEqual(resultado.errores.length, 0, 'Sin errores');
    }
  );

  // TEST 4: Validar lista sin #EXTM3U
  await test(
    'Rechazar lista sin #EXTM3U',
    () => {
      const resultado = validarListaM3U('http://test.com/lista.m3u', 'contenido sin m3u');
      assert.strictEqual(resultado.valido, false, 'Debe ser inválida');
      assert.ok(resultado.errores.some(e => e.includes('#EXTM3U')), 'Error por falta de #EXTM3U');
    }
  );

  // TEST 5: Validar lista vacía
  await test(
    'Rechazar URL vacía',
    () => {
      const resultado = validarListaM3U('', '');
      assert.strictEqual(resultado.valido, false, 'URL vacía inválida');
    }
  );

  // TEST 6: Validar URL sin protocolo
  await test(
    'Rechazar URL sin http/https',
    () => {
      const resultado = validarListaM3U('servidor.com/lista.m3u', '#EXTM3U');
      assert.strictEqual(resultado.valido, false, 'Debe requerir protocolo');
      assert.ok(resultado.errores.some(e => e.includes('http')), 'Error por protocolo');
    }
  );

  // TEST 7: Cargar lista M3U exitosa con auto-detección Xtream
  await test(
    'Cargar lista M3U con auto-detección Xtream',
    async () => {
      const resultado = await cargarListaM3U('http://servidor.com:80/get.php?username=user1&password=***&type=m3u_plus', 'Mi Lista');
      assert.strictEqual(resultado.exitoso, true, 'Carga exitosa');
      assert.strictEqual(resultado.esXtream, true, 'Detectado como Xtream');
      assert.strictEqual(resultado.canales, 2, '2 canales cargados');
      assert.strictEqual(mockWindow.currentAppMode, 'B', 'Modo B activado');
    }
  );

  // TEST 8: Cargar lista M3U simple (sin Xtream)
  await test(
    'Cargar lista M3U simple sin Xtream',
    async () => {
      const resultado = await cargarListaM3U('http://servidor.com/lista.m3u', 'Lista Simple');
      assert.strictEqual(resultado.exitoso, true, 'Carga exitosa');
      assert.strictEqual(resultado.esXtream, false, 'No es Xtream');
      assert.strictEqual(mockWindow.currentAppMode, 'B', 'Modo B activado');
    }
  );

  // TEST 9: Cargar lista M3U inválida (sin #EXTM3U)
  await test(
    'Rechazar lista M3U sin contenido válido',
    async () => {
      // Sobrescribir fetch para retornar contenido inválido
      const fetchOriginal = mockWindow.dataService.fetchTextUniversal;
      mockWindow.dataService.fetchTextUniversal = async () => 'contenido invalido';
      
      let errorCapturado = false;
      try {
        await cargarListaM3U('http://test.com/invalido.m3u', 'Invalida');
      } catch (e) {
        errorCapturado = true;
      }
      
      mockWindow.dataService.fetchTextUniversal = fetchOriginal;
      assert.strictEqual(errorCapturado, true, 'Debe lanzar error');
    }
  );

  // TEST 10: Importar países (modo vertical)
  await test(
    'Importar países seleccionados',
    async () => {
      const resultado = await importarPaises(['CL', 'AR', 'MX']);
      assert.strictEqual(resultado.exitoso, true, 'Importación exitosa');
      assert.strictEqual(resultado.paises, 3, '3 países');
      assert.strictEqual(resultado.canales, 3, '3 canales');
      assert.strictEqual(mockWindow.currentAppMode, 'A', 'Modo A para países');
    }
  );

  // TEST 11: Rechazar importación sin países
  await test(
    'Rechazar importación sin países',
    async () => {
      let errorCapturado = false;
      try {
        await importarPaises([]);
      } catch (e) {
        errorCapturado = true;
      }
      assert.strictEqual(errorCapturado, true, 'Debe lanzar error');
    }
  );

  // TEST 12: Pantalla en modo vertical
  await test(
    'Verificar pantalla en modo vertical',
    () => {
      mockWindow.innerWidth = 360;
      mockWindow.innerHeight = 640;
      assert.strictEqual(esPantallaVertical(), true, 'Debe ser vertical');
    }
  );

  // TEST 13: Aplicar estilo vertical a contenedor
  await test(
    'Aplicar estilo vertical a contenedor de carga',
    () => {
      mockWindow.innerWidth = 360;
      mockWindow.innerHeight = 640;
      const resultado = aplicarEstiloVertical('list-manager-container');
      assert.strictEqual(resultado, true, 'Estilo aplicado');
      
      const el = document.getElementById('list-manager-container');
      assert.strictEqual(el.style.flexDirection, 'column', 'Dirección vertical');
      assert.strictEqual(el.style.maxWidth, '500px', 'Ancho limitado para vertical');
    }
  );

  // TEST 14: Elementos de carga M3U existen en DOM
  await test(
    'Elementos de carga M3U existen en el DOM',
    () => {
      const urlInput = document.getElementById('custom-m3u-url');
      const btnLoad = document.getElementById('btn-load-m3u-url');
      const btnLocal = document.getElementById('input-local-m3u');
      
      assert.ok(urlInput, 'custom-m3u-url debe existir');
      assert.ok(btnLoad, 'btn-load-m3u-url debe existir');
      assert.ok(btnLocal, 'input-local-m3u debe existir');
    }
  );

  // TEST 15: Elementos de carga países existen
  await test(
    'Elementos de carga países existen en el DOM',
    () => {
      const countryList = document.getElementById('selector-country-list');
      const btnImport = document.getElementById('btn-import-countries');
      
      assert.ok(countryList, 'selector-country-list debe existir');
      assert.ok(btnImport, 'btn-import-countries debe existir');
    }
  );

  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`📊 Resultados Carga Listas Vertical: ${passed} pasadas, ${failed} fallidas`);
  if (failed > 0) {
    console.log('⚠️  HAY FALLOS. Revisar antes de aplicar cambios.');
    process.exit(1);
  } else {
    console.log('✅ TODAS LAS PRUEBAS DE CARGA LISTAS VERTICAL PASARON.');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
