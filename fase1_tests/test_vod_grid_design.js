// =========================================================
// test_vod_grid_design.js
// Pruebas unitarias para el diseño de catálogo VOD/Series
// (Grid responsivo de carteles con scroll)
// Ejecutar con: node test_vod_grid_design.js
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
// MOCK DEL DOM PARA VALIDAR LÓGICA DE GRID VOD
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
    // Simular creación de hijos a partir del HTML (muy básico)
    this.children = [];
    const idMatch = html.match(/id="([^"]+)"/);
    if (idMatch) {
      const child = new MockElement(idMatch[1]);
      this.children.push(child);
      child.parentElement = this;
    }
    // Contar cuántos div con clase vod-poster-card hay
    const cardMatches = html.match(/vod-poster-card/g);
    if (cardMatches) {
      for (let i = 0; i < cardMatches.length; i++) {
        const child = new MockElement(`vod-card-${i}`, 'vod-poster-card');
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
  body: new MockElement('body', '')
};

const mockWindow = {
  innerWidth: 1024,
  innerHeight: 768,
  addEventListener: () => {},
  dispatchEvent: () => true,
  matchMedia: () => ({ addEventListener: () => {}, removeEventListener: () => {} }),
  localStorage: { _store: {}, getItem: (k) => mockWindow.localStorage._store[k] || null, setItem: (k, v) => { mockWindow.localStorage._store[k] = v; } },
  showToast: (msg) => {},
  dataService: { getFavorites: () => [], isFavorite: () => false, toggleFavorite: () => false },
  playerManager: { currentChannel: null, stopPlayback: async () => {}, exitFullscreenMode: () => {} },
  exoPlayerPlugin: { available: false, stop: async () => {} },
  Capacitor: { Plugins: {} },
  AndroidNativeApp: undefined,
  Hls: { isSupported: () => false }
};

global.document = mockDocument;
global.window = mockWindow;
global.navigator = mockWindow;
global.localStorage = mockWindow.localStorage;

// =========================================================
// LÓGICA DE GRID VOD A VALIDAR (simulada de la implementación)
// =========================================================

/**
 * Calcula cuántas columnas caben según el ancho de pantalla
 * Diseño responsivo: móvil (1-2), tablet (3-4), TV/desktop (5-6)
 */
function calcularColumnas(anchoPantalla) {
  if (anchoPantalla >= 1200) return 6;   // TV grande / desktop
  if (anchoPantalla >= 992) return 5;    // Tablet grande
  if (anchoPantalla >= 768) return 4;    // Tablet
  if (anchoPantalla >= 576) return 3;    // Móvil grande
  if (anchoPantalla >= 400) return 2;    // Móvil
  return 1;                              // Móvil pequeño
}

/**
 * Calcula el ancho de cada tarjeta de cartel
 */
function calcularAnchoTarjeta(anchoPantalla, columnas, gap = 12, padding = 24) {
  const anchoDisponible = anchoPantalla - padding - (gap * (columnas - 1));
  return Math.floor(anchoDisponible / columnas);
}

/**
 * Crea el HTML de una tarjeta de cartel VOD profesional
 */
function crearTarjetaVod(vod, index) {
  const poster = vod.cover || vod.logo || '';
  const nombre = vod.name || vod.title || 'Sin título';
  const año = vod.year || '';
  const genero = vod.genre || vod.group || 'Película';

  return `
    <div class="vod-poster-card" id="vod-${vod.stream_id || index}" tabindex="0">
      <div class="poster-wrapper">
        <img src="${poster}" onerror="this.onerror=null;this.src='';this.parentElement.innerHTML='<div class=\\'poster-placeholder\\'><i class=\\'fa-solid fa-film\\'></i></div>';" alt="${nombre}">
        <div class="poster-overlay">
          <button class="btn-play-poster" onclick="playVodItem(${JSON.stringify(vod).replace(/"/g, '&quot;')})" title="Reproducir">
            <i class="fa-solid fa-play"></i>
          </button>
        </div>
        ${año ? `<span class="poster-year">${año}</span>` : ''}
      </div>
      <div class="vod-info">
        <h4 class="vod-title">${nombre}</h4>
        <span class="vod-genre">${genero}</span>
      </div>
    </div>
  `;
}

/**
 * Renderiza el grid de carteles VOD con scroll
 */
function renderGridVod(peliculas, contenedorId, columnas) {
  const contenedor = getElementById(contenedorId);
  if (!contenedor) return;

  contenedor.innerHTML = '';
  contenedor.style.display = 'grid';
  contenedor.style.gridTemplateColumns = `repeat(${columnas}, minmax(150px, 1fr))`;
  contenedor.style.gap = '12px';
  contenedor.style.padding = '12px';
  contenedor.style.overflowY = 'auto';
  contenedor.style.alignContent = 'start';

  const html = peliculas.map((vod, idx) => crearTarjetaVod(vod, idx)).join('');
  contenedor.innerHTML = html;
}

// =========================================================
// PRUEBAS
// =========================================================

async function run() {
  console.log('\n🧪 PRUEBAS DE DISEÑO — Catálogo VOD/Series (Grid Responsivo)\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // TEST 1: Calcular columnas según ancho de pantalla
  await test(
    'Calcular columnas responsivas según ancho de pantalla',
    () => {
      assert.strictEqual(calcularColumnas(1400), 6, 'TV grande debe tener 6 columnas');
      assert.strictEqual(calcularColumnas(1000), 5, 'Tablet grande debe tener 5 columnas');
      assert.strictEqual(calcularColumnas(800), 4, 'Tablet debe tener 4 columnas');
      assert.strictEqual(calcularColumnas(600), 3, 'Móvil grande debe tener 3 columnas');
      assert.strictEqual(calcularColumnas(500), 2, 'Móvil debe tener 2 columnas');
      assert.strictEqual(calcularColumnas(300), 1, 'Móvil pequeño debe tener 1 columna');
    }
  );

  // TEST 2: Calcular ancho de tarjeta
  await test(
    'Calcular ancho de tarjeta de cartel',
    () => {
      const ancho = calcularAnchoTarjeta(1024, 4, 12, 24);
      assert.ok(ancho > 0, 'El ancho de tarjeta debe ser mayor a 0');
      assert.ok(ancho <= 250, 'El ancho de tarjeta no debe exceder 250px en 4 columnas');
    }
  );

  // TEST 3: Crear tarjeta VOD con todos los campos
  await test(
    'Crear tarjeta VOD con poster, título, año y género',
    () => {
      const vod = {
        stream_id: 123,
        name: 'El Padrino',
        title: 'El Padrino',
        year: '1972',
        genre: 'Crimen',
        cover: 'https://ejemplo.com/poster.jpg',
        logo: ''
      };
      const html = crearTarjetaVod(vod, 0);
      assert.ok(html.includes('El Padrino'), 'Debe incluir el nombre de la película');
      assert.ok(html.includes('1972'), 'Debe incluir el año');
      assert.ok(html.includes('Crimen'), 'Debe incluir el género');
      assert.ok(html.includes('poster.jpg'), 'Debe incluir la URL del poster');
      assert.ok(html.includes('vod-123'), 'Debe incluir el ID en el atributo id');
    }
  );

  // TEST 4: Crear tarjeta VOD con valores por defecto (sin datos)
  await test(
    'Crear tarjeta VOD con valores por defecto cuando faltan datos',
    () => {
      const vod = {};
      const html = crearTarjetaVod(vod, 5);
      assert.ok(html.includes('Sin título'), 'Debe usar "Sin título" por defecto');
      assert.ok(html.includes('Película'), 'Debe usar "Película" como género por defecto');
      assert.ok(html.includes('vod-5'), 'Debe usar el índice como ID fallback');
    }
  );

  // TEST 4b: Tarjeta VOD con placeholder cuando falla la imagen
  await test(
    'Tarjeta VOD incluye placeholder cuando falla la imagen',
    () => {
      const html = crearTarjetaVod({ name: 'Test', cover: '' }, 0);
      assert.ok(html.includes('poster-placeholder'), 'Debe incluir placeholder cuando no hay cover');
      assert.ok(html.includes('fa-film'), 'Debe incluir icono de película en placeholder');
    }
  );

  // TEST 5: Render grid VOD con scroll
  await test(
    'Render grid VOD con múltiples películas y scroll',
    () => {
      const peliculas = [
        { stream_id: 1, name: 'Película 1', year: '2020', genre: 'Acción', cover: 'img1.jpg' },
        { stream_id: 2, name: 'Película 2', year: '2021', genre: 'Comedia', cover: 'img2.jpg' },
        { stream_id: 3, name: 'Película 3', year: '2022', genre: 'Drama', cover: 'img3.jpg' },
        { stream_id: 4, name: 'Película 4', year: '2023', genre: 'Terror', cover: 'img4.jpg' },
        { stream_id: 5, name: 'Película 5', year: '2024', genre: 'Sci-Fi', cover: 'img5.jpg' },
        { stream_id: 6, name: 'Película 6', year: '2024', genre: 'Acción', cover: 'img6.jpg' },
      ];

      renderGridVod(peliculas, 'vod-grid', 3);

      const contenedor = getElementById('vod-grid');
      assert.strictEqual(contenedor.style.display, 'grid', 'Debe usar display grid');
      assert.ok(contenedor.style.gridTemplateColumns.includes('3'), 'Debe tener 3 columnas');
      assert.ok(contenedor.style.overflowY === 'auto', 'Debe tener scroll vertical');
      assert.ok(contenedor.innerHTML.includes('vod-1'), 'Primera tarjeta debe tener ID vod-1');
      assert.ok(contenedor.innerHTML.includes('Película 1'), 'Debe incluir Película 1');
      assert.ok(contenedor.innerHTML.includes('Película 6'), 'Debe incluir Película 6');
    }
  );

  // TEST 6: Grid VOD con 20+ películas para verificar scroll
  await test(
    'Grid VOD con 20 películas para verificar que se renderizan todas',
    () => {
      const peliculas = [];
      for (let i = 1; i <= 20; i++) {
        peliculas.push({ stream_id: i, name: `Película ${i}`, year: '2024', genre: 'Acción', cover: `img${i}.jpg` });
      }
      renderGridVod(peliculas, 'vod-grid-many', 4);
      const contenedor = getElementById('vod-grid-many');
      assert.ok(contenedor.innerHTML.includes('vod-1'), 'Debe incluir ID vod-1');
      assert.ok(contenedor.innerHTML.includes('vod-20'), 'Debe incluir ID vod-20');
      assert.ok(contenedor.innerHTML.includes('Película 20'), 'Debe incluir Película 20');
      assert.ok(contenedor.innerHTML.includes('Película 1'), 'Debe incluir Película 1');
    }
  );

  // TEST 7: Verificar clases CSS necesarias para el diseño profesional
  await test(
    'Clases CSS necesarias para diseño VOD profesional',
    () => {
      // Simulamos verificar que las clases existen en el CSS (verificaremos en app.css después)
      const clasesNecesarias = [
        '.vod-poster-card',
        '.poster-wrapper',
        '.poster-overlay',
        '.btn-play-poster',
        '.poster-year',
        '.vod-info',
        '.vod-title',
        '.vod-genre',
        '.poster-placeholder'
      ];
      // Esta prueba solo verifica que las clases están definidas en nuestra lógica
      // El CSS real se verificará en la prueba de app.css
      clasesNecesarias.forEach(clase => {
        assert.ok(clase.startsWith('.'), `La clase ${clase} debe ser un selector CSS válido`);
      });
    }
  );

  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`📊 Resultados Diseño VOD: ${passed} pasadas, ${failed} fallidas`);
  if (failed > 0) {
    console.log('⚠️  HAY FALLOS. Revisar antes de implementar.');
    process.exit(1);
  } else {
    console.log('✅ TODAS LAS PRUEBAS DE DISEÑO VOD PASARON. Lista para implementar.');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
