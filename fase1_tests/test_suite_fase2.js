// =========================================================
// test_suite_fase2.js
// Pruebas unitarias para la Fase 2 (UI/UX y diseño)
// Ejecutar con: node test_suite_fase2.js
// =========================================================

require('./mock_dom_fase2.js');
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

// Leer app.css real para verificar reglas locales
const appCssPath = path.resolve(
  'C:/Users/Eduardo/Downloads/world_ip_tv-1.6.0.1/world_ip_tv-1.6.0.1/free_iptv_app/www/css/app.css'
);
let appCssContent = '';
try {
  appCssContent = fs.readFileSync(appCssPath, 'utf8');
} catch (e) {
  console.warn('No se pudo leer app.css real:', e.message);
}

// Leer app.js real para verificar que no quede playerManager.stop()
const appJsPath = path.resolve(
  'C:/Users/Eduardo/Downloads/world_ip_tv-1.6.0.1/world_ip_tv-1.6.0.1/free_iptv_app/www/js/app.js'
);
let appJsContent = '';
try {
  appJsContent = fs.readFileSync(appJsPath, 'utf8');
} catch (e) {
  console.warn('No se pudo leer app.js real:', e.message);
}

async function run() {
  console.log('\n🧪 FASE 2 — Pruebas unitarias de UI/UX y diseño\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ---------- TEST 1: Los modales VOD/Series existen en el DOM ----------
  await test(
    'Los modales VOD/Series existen en el DOM para cubrir el player',
    () => {
      const vodModal = document.getElementById('modal-vod-detail');
      const seriesModal = document.getElementById('modal-series-detail');
      const playerContainer = document.getElementById('player-container');

      assert.ok(vodModal, 'modal-vod-detail debe existir');
      assert.ok(seriesModal, 'modal-series-detail debe existir');
      assert.ok(playerContainer, 'player-container debe existir');
    }
  );

  // ---------- TEST 2: app.css define utilidades clave para funcionar sin Tailwind CDN ----------
  await test(
    'app.css define clases utilitarias básicas (flex, grid, gap, p, w, h) para reducir dependencia del CDN',
    () => {
      const required = [
        '.flex { display: flex; }',
        '.grid { display: grid; }',
        '.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }',
        '.flex-col { flex-direction: column; }',
        '.items-center { align-items: center; }',
        '.justify-center { justify-content: center; }',
        '.gap-2 { gap: 8px; }',
        '.gap-3 { gap: 12px; }',
        '.w-full { width: 100%; }',
        '.h-full { height: 100%; }',
        '.p-3 { padding: 12px; }',
        '.p-4 { padding: 16px; }',
        '.mt-2 { margin-top: 8px; }',
        '.mb-2 { margin-bottom: 8px; }',
        '.relative { position: relative; }',
        '.absolute { position: absolute; }',
        '.hidden { display: none !important; }',
        '.block { display: block; }',
      ];
      let missing = [];
      required.forEach((cls) => {
        if (!appCssContent.includes(cls)) missing.push(cls);
      });
      assert.strictEqual(missing.length, 0, `Faltan utilidades CSS locales: ${missing.join(', ')}`);
    }
  );

  // ---------- TEST 3: app.css mapea colores Tailwind a colores Neon ----------
  await test(
    'app.css mapea clases Tailwind a colores del tema Neon y define shadow-neon',
    () => {
      const checks = [
        { name: 'bg-blue-600 usa var(--neon-blue)', str: '.bg-blue-600 { background: var(--neon-blue)' },
        { name: 'text-gray-100 usa var(--text-bright)', str: '.text-gray-100 { color: var(--text-bright)' },
        { name: 'shadow-neon clase CSS', str: '.shadow-neon { box-shadow: var(--shadow-neon)' },
        { name: 'variable --shadow-neon definida', str: '--shadow-neon:' },
      ];
      let missing = [];
      checks.forEach((c) => {
        if (!appCssContent.includes(c.str)) missing.push(c.name);
      });
      assert.strictEqual(missing.length, 0, `Faltan mapeos de colores: ${missing.join(', ')}`);
    }
  );

  // ---------- TEST 4: Indicador de señal activa puede agregarse al header ----------
  await test(
    'Se puede crear un elemento indicador de señal activa en el menú principal',
    () => {
      const header = document.getElementById('tv-global-header');
      assert.ok(header, 'tv-global-header debe existir para insertar el indicador');

      const indicator = document.createElement('div');
      indicator.id = 'live-signal-indicator';
      indicator.className = 'live-signal-indicator hidden';
      indicator.innerText = 'EN VIVO';
      header.appendChild(indicator);

      const el = document.getElementById('live-signal-indicator');
      assert.ok(el, 'El indicador de señal activa debe poder agregarse al header');
      assert.strictEqual(el.id, 'live-signal-indicator');
    }
  );

  // ---------- TEST 5: Los modales del sistema existen ----------
  await test(
    'Los modales del sistema existen en el DOM',
    () => {
      const modals = [
        'modal-vod-detail',
        'modal-series-detail',
        'modal-audio-subtitles',
        'modal-exit-confirm',
        'modal-country-selector',
        'modal-sleep-timer',
        'modal-iptv-logs',
        'modal-lists'
      ];
      modals.forEach((id) => {
        const el = document.getElementById(id);
        assert.ok(el, `El modal ${id} debe existir en el DOM`);
      });
    }
  );

  // ---------- TEST 6: No queda referencia al método inexistente playerManager.stop() ----------
  await test(
    'No quedan referencias al método inexistente playerManager.stop() en app.js',
    () => {
      // Buscar cualquier llamada a playerManager.stop(
      const hasStopCall = /playerManager\.stop\(/.test(appJsContent);
      assert.strictEqual(hasStopCall, false, 'No debe quedar ninguna referencia a playerManager.stop()');
    }
  );

  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`📊 Resultados Fase 2: ${passed} pasadas, ${failed} fallidas`);
  if (failed > 0) {
    console.log('⚠️  HAY FALLOS. Revisar antes de aplicar cambios.');
    process.exit(1);
  } else {
    console.log('✅ TODAS LAS PRUEBAS FASE 2 PASARON. Lista para continuar.');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
