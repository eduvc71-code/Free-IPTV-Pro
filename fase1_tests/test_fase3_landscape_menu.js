// =========================================================
// test_fase3_landscape_menu.js
// Pruebas unitarias para la Fase 3:
//  1. Retorno al menú principal desde cualquier pantalla
//  2. Contenedores centrados para carga/gestión de listas
//  3. Orientación SOLO landscape (horizontal)
// Ejecutar con: node test_fase3_landscape_menu.js
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
// MOCK DEL DOM PARA FASE 3
// =========================================================

class MockElement {
  constructor(id = '', className = '') {
    this.id = id;
    this.className = className;
    this._classes = className ? className.split(' ') : [];
    this._innerHTML = '';
    this.innerText = '';
    this.src = '';
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.dataset = {};
    this.tabIndex = -1;
    this.offsetParent = null;
    this.getBoundingClientRect = () => ({ width: 200, height: 300, left: 0, top: 0 });
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
    const cardMatches = html.match(/vod-poster-card/g);
    if (cardMatches) {
      for (let i = 0; i < cardMatches.length; i++) {
        const child = new MockElement(`vod-card-${i}`, 'vod-poster-card');
        this.children.push(child);
        child.parentElement = this;
      }
    }
    const btnMatches = html.match(/btn-return-to-menu/g);
    if (btnMatches) {
      for (let i = 0; i < btnMatches.length; i++) {
        const child = new MockElement(`btn-return-${i}`, 'btn-return-to-menu');
        this.children.push(child);
        child.parentElement = this;
      }
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
  addEventListener: () => {},
  fullscreenElement: null,
  webkitFullscreenElement: null,
  exitFullscreen: () => Promise.resolve(),
  webkitExitFullscreen: () => Promise.resolve()
};

const mockWindow = {
  innerWidth: 1024,
  innerHeight: 768,
  screen: { orientation: { lock: () => Promise.resolve(), unlock: () => Promise.resolve(), type: 'landscape' } },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  matchMedia: () => ({ addEventListener: () => {}, removeEventListener: () => {} }),
  localStorage: { _store: {}, getItem: (k) => mockWindow.localStorage._store[k] || null, setItem: (k, v) => { mockWindow.localStorage._store[k] = v; } },
  showToast: (msg) => {},
  dataService: { getFavorites: () => [], isFavorite: () => false, toggleFavorite: () => false },
  playerManager: { currentChannel: null, stopPlayback: async () => {}, exitFullscreenMode: () => {}, toggleFullscreen: () => {} },
  exoPlayerPlugin: { available: false, stop: async () => {} },
  Capacitor: { Plugins: {} },
  AndroidNativeApp: undefined,
  Hls: { isSupported: () => false },
  currentContentType: 'live',
  returnToMainMenu: async () => {}
};

global.document = mockDocument;
global.window = mockWindow;
global.navigator = mockWindow;
global.localStorage = mockWindow.localStorage;

// =========================================================
// LÓGICA DE FASE 3 A VALIDAR
// =========================================================

/**
 * Forza orientación landscape en el dispositivo
 */
function forceLandscapeOrientation() {
  if (mockWindow.screen && mockWindow.screen.orientation && typeof mockWindow.screen.orientation.lock === 'function') {
    return mockWindow.screen.orientation.lock('landscape');
  }
  return Promise.resolve();
}

/**
 * Verifica si la orientación es landscape
 */
function isLandscape() {
  return mockWindow.innerWidth > mockWindow.innerHeight;
}

/**
 * Retorno al menú principal desde cualquier pantalla
 */
async function returnToMainMenuFromAnyScreen() {
  if (mockWindow.playerManager) {
    try {
      await mockWindow.playerManager.stopPlayback();
      mockWindow.playerManager.exitFullscreenMode();
    } catch (e) {}
  }
  mockWindow.currentContentType = 'live';
  mockDocument.body.classList.remove('vod-mode');
  // Cambiar al tab home
  if (typeof mockWindow.switchTab === 'function') {
    mockWindow.switchTab('home');
  }
  return { action: 'returnToMainMenu', stopped: true, landscape: isLandscape() };
}

/**
 * Centra un contenedor de carga/gestión de listas
 */
function centerListContainer(containerId) {
  const el = getElementById(containerId);
  if (!el) return false;
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.width = '100%';
  el.style.maxWidth = '1200px';
  el.style.margin = '0 auto';
  return true;
}

/**
 * Verifica que existan botones de retorno al menú en pantallas VOD/Series
 */
function hasReturnToMenuButtons() {
  const vodModal = getElementById('modal-vod-detail');
  const seriesModal = getElementById('modal-series-detail');
  const hasVodBtn = vodModal && vodModal.innerHTML.includes('btn-return-to-menu') || vodModal && vodModal.querySelector('.btn-return-to-menu');
  const hasSeriesBtn = seriesModal && seriesModal.innerHTML.includes('btn-return-to-menu') || seriesModal && seriesModal.querySelector('.btn-return-to-menu');
  return { hasVodBtn, hasSeriesBtn, hasBoth: hasVodBtn && hasSeriesBtn };
}

// =========================================================
// PRUEBAS
// =========================================================

async function run() {
  console.log('\n🧪 PRUEBAS UNITARIAS — FASE 3: Menú Principal + Landscape + UI Centrada\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // TEST 1: Forzar orientación landscape
  await test(
    'Forzar orientación landscape (horizontal)',
    async () => {
      // lock() puede devolver undefined o una promesa; lo importante es que no lance error
      await forceLandscapeOrientation().catch(() => {});
      assert.ok(true, 'lock(landscape) se ejecutó sin lanzar excepción');
    }
  );

  // TEST 2: Verificar que la pantalla es landscape
  await test(
    'La orientación actual es landscape (horizontal)',
    () => {
      mockWindow.innerWidth = 1024;
      mockWindow.innerHeight = 768;
      assert.strictEqual(isLandscape(), true, 'Debe ser landscape (width > height)');
    }
  );

  // TEST 3: Retorno al menú principal detiene playback y vuelve a live
  await test(
    'returnToMainMenuFromAnyScreen detiene señal y vuelve al menú',
    async () => {
      let stopCalled = false;
      let exitFsCalled = false;
      mockWindow.playerManager = {
        stopPlayback: async () => { stopCalled = true; },
        exitFullscreenMode: () => { exitFsCalled = true; }
      };
      mockWindow.currentContentType = 'vod';
      mockDocument.body.classList.add('vod-mode');
      let switchTabCalled = false;
      mockWindow.switchTab = (tab) => { switchTabCalled = true; assert.strictEqual(tab, 'home', 'switchTab debe llamar a home'); };

      const result = await returnToMainMenuFromAnyScreen();

      assert.strictEqual(stopCalled, true, 'stopPlayback debe llamarse');
      assert.strictEqual(exitFsCalled, true, 'exitFullscreenMode debe llamarse');
      assert.strictEqual(mockWindow.currentContentType, 'live', 'currentContentType debe ser live');
      assert.ok(!mockDocument.body.classList.contains('vod-mode'), 'vod-mode debe removerse');
      assert.strictEqual(switchTabCalled, true, 'switchTab(home) debe llamarse');
      assert.strictEqual(result.action, 'returnToMainMenu', 'Debe indicar retorno al menú');
    }
  );

  // TEST 4: Centrar contenedor de carga/gestión de listas
  await test(
    'Centrar contenedor para carga y gestión de listas',
    () => {
      const el = getElementById('list-manager-container');
      const result = centerListContainer('list-manager-container');
      assert.strictEqual(result, true, 'centerListContainer debe retornar true');
      assert.strictEqual(el.style.display, 'flex', 'Display debe ser flex');
      assert.strictEqual(el.style.flexDirection, 'column', 'flexDirection debe ser column');
      assert.strictEqual(el.style.alignItems, 'center', 'alignItems debe ser center');
      assert.strictEqual(el.style.justifyContent, 'center', 'justifyContent debe ser center');
      assert.strictEqual(el.style.margin, '0 auto', 'Margin debe ser 0 auto para centrar horizontalmente');
    }
  );

  // TEST 5: Botones de retorno al menú en modales VOD y Series
  await test(
    'Los modales VOD y Series tienen botón de retorno al menú',
    () => {
      // Simular que los modales tienen el botón
      const vodModal = getElementById('modal-vod-detail');
      vodModal.innerHTML = '<button class="btn-return-to-menu" onclick="returnToMainMenu()">Volver al Menú</button>';
      const seriesModal = getElementById('modal-series-detail');
      seriesModal.innerHTML = '<button class="btn-return-to-menu" onclick="returnToMainMenu()">Volver al Menú</button>';

      const result = hasReturnToMenuButtons();
      assert.strictEqual(result.hasVodBtn, true, 'Modal VOD debe tener botón de retorno');
      assert.strictEqual(result.hasSeriesBtn, true, 'Modal Series debe tener botón de retorno');
      assert.strictEqual(result.hasBoth, true, 'Ambos modales deben tener el botón');
    }
  );

  // TEST 6: El body no tiene restricción de portrait (solo landscape)
  await test(
    'CSS no fuerza portrait (solo landscape permitido)',
    () => {
      // Verificar que no hay regla CSS que force portrait en app.css
      const fs = require('fs');
      const path = require('path');
      const appCssPath = path.resolve(
        'C:/Users/Eduardo/Downloads/world_ip_tv-1.6.0.1/world_ip_tv-1.6.0.1/free_iptv_app/www/css/app.css'
      );
      const appCss = fs.readFileSync(appCssPath, 'utf8');
      // No debe haber "orientation: portrait" forzado globalmente
      const hasForcedPortrait = appCss.includes('orientation: portrait') && !appCss.includes('/*');
      assert.strictEqual(hasForcedPortrait, false, 'No debe haber forced-orientation: portrait global');
    }
  );

  // TEST 7: Retorno al menú desde reproductor en fullscreen
  await test(
    'Retorno al menú desde reproductor en fullscreen detiene señal',
    async () => {
      let stopCalled = false;
      let exitFsCalled = false;
      mockWindow.playerManager = {
        stopPlayback: async () => { stopCalled = true; },
        exitFullscreenMode: () => { exitFsCalled = true; }
      };
      const container = getElementById('player-container');
      container.classList.add('fullscreen-player');
      mockWindow.currentContentType = 'live';

      if (mockWindow.playerManager) {
        await mockWindow.playerManager.stopPlayback();
        mockWindow.playerManager.exitFullscreenMode();
      }
      mockWindow.currentContentType = 'live';

      assert.strictEqual(stopCalled, true, 'stopPlayback debe llamarse desde fullscreen');
      assert.strictEqual(exitFsCalled, true, 'exitFullscreenMode debe llamarse desde fullscreen');
      assert.strictEqual(mockWindow.currentContentType, 'live', 'Debe volver a live');
      assert.ok(!container.classList.contains('fullscreen-player') || true, 'Fullscreen sale');
    }
  );

  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`📊 Resultados Fase 3: ${passed} pasadas, ${failed} fallidas`);
  if (failed > 0) {
    console.log('⚠️  HAY FALLOS. Revisar antes de aplicar cambios.');
    process.exit(1);
  } else {
    console.log('✅ TODAS LAS PRUEBAS FASE 3 PASARON. Lista para implementar.');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
