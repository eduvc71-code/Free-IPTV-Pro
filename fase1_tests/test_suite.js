// =========================================================
// test_suite.js
// Pruebas unitarias para la Fase 1 de la auditoría.
// Ejecutar con: node test_suite.js
// =========================================================

require('./mock_globals.js');
const assert = require('assert');
const { VideoPlayerManager } = require('./player_logic.js');
const { switchContentType, returnToMainMenu, setPlayerManager } = require('./app_logic.js');

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

async function run() {
  console.log('\n🧪 FASE 1 — Pruebas unitarias de lógica de reproducción\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Test 1: stopPlayback detiene HLS.js, limpia video y resetea estado
  await test(
    'stopPlayback detiene HLS.js, limpia <video> y resetea estado',
    async () => {
      const video = {
        pause: () => {},
        removeAttribute: () => {},
        load: () => {},
        src: '',
        paused: true,
        error: null
      };
      const container = {
        classList: { remove: () => {}, add: () => {}, contains: () => false }
      };
      const pm = new VideoPlayerManager(video, container);
      pm.hls = { destroy: () => { pm.calls.push('hlsDestroyCalled'); } };
      pm.currentChannel = { url: 'http://test/live.m3u8', name: 'Test Canal' };
      pm.isExoPlayerActive = false;

      await pm.stopPlayback();

      assert.strictEqual(pm.currentChannel, null, 'currentChannel debe ser null');
      assert.strictEqual(pm.hls, null, 'hls debe ser null');
      assert(pm.calls.includes('hlsDestroy'), 'hls.destroy debe haberse llamado');
      assert(pm.calls.includes('videoCleanup'), 'video debe limpiarse');
      assert(pm.calls.includes('stateReset'), 'estado debe resetearse');
    }
  );

  // Test 2: stopPlayback detiene ExoPlayer nativo cuando está activo
  await test(
    'stopPlayback detiene ExoPlayer nativo cuando está activo',
    async () => {
      const video = { pause: () => {}, removeAttribute: () => {}, load: () => {}, src: '' };
      const container = { classList: { remove: () => {} } };
      const pm = new VideoPlayerManager(video, container);
      pm.isExoPlayerActive = true;
      pm.currentChannel = { url: 'http://test/live.m3u8' };
      let exoStopped = false;
      global.exoPlayerPlugin = {
        available: true,
        stop: async () => { exoStopped = true; }
      };

      await pm.stopPlayback();

      assert.strictEqual(exoStopped, true, 'exoPlayerPlugin.stop debe haberse llamado');
      assert.strictEqual(pm.isExoPlayerActive, false, 'isExoPlayerActive debe ser false');
    }
  );

  // Test 3: switchContentType('vod') llama a stopPlayback (con await)
  await test(
    'switchContentType("vod") detiene reproducción previa antes de cargar VOD',
    async () => {
      let stopCalled = false;
      setPlayerManager({
        stopPlayback: async () => { stopCalled = true; },
        video: { pause: () => {}, removeAttribute: () => {}, load: () => {} },
        hls: null
      });

      const result = await switchContentType('vod');

      assert.strictEqual(stopCalled, true, 'stopPlayback debe llamarse al cambiar a VOD');
      assert.strictEqual(result.stopped, true, 'debe indicar que se detuvo');
    }
  );

  // Test 4: switchContentType no falla por método stop() inexistente
  await test(
    'switchContentType no falla por método stop() inexistente',
    async () => {
      let errorCaught = false;
      setPlayerManager({
        stopPlayback: async () => {},
        video: { pause: () => {}, removeAttribute: () => {}, load: () => {} },
        hls: null,
        stop: undefined // método inexistente (el error original de la app)
      });

      try {
        await switchContentType('series');
      } catch (e) {
        errorCaught = true;
      }

      assert.strictEqual(errorCaught, false, 'no debe lanzar error por stop() inexistente');
    }
  );

  // Test 5: returnToMainMenu detiene playback, sale de fullscreen y vuelve a live
  await test(
    'returnToMainMenu detiene playback, sale de fullscreen y vuelve al menú',
    async () => {
      let stopCalled = false;
      let exitFsCalled = false;
      setPlayerManager({
        stopPlayback: async () => { stopCalled = true; },
        exitFullscreenMode: () => { exitFsCalled = true; },
        video: { pause: () => {}, removeAttribute: () => {}, load: () => {} },
        hls: null
      });

      const result = await returnToMainMenu();

      assert.strictEqual(stopCalled, true, 'stopPlayback debe llamarse');
      assert.strictEqual(exitFsCalled, true, 'exitFullscreenMode debe llamarse');
      assert.strictEqual(result.action, 'returnToMainMenu', 'debe indicar retorno al menú');
    }
  );

  // Test 6: switchContentType de VOD a Live no lanza errores y cambia el tipo
  await test(
    'switchContentType de VOD a Live no lanza errores y cambia el tipo',
    async () => {
      const pm = new VideoPlayerManager(
        { pause: () => {}, removeAttribute: () => {}, load: () => {}, src: '' },
        { classList: { remove: () => {} } }
      );
      pm.currentChannel = { url: 'http://test/vod.mp4', name: 'Película' };
      setPlayerManager(pm);

      const result = await switchContentType('live');

      assert.strictEqual(result.type, 'live', 'contentType debe ser live');
      assert.strictEqual(result.stopped, false, 'no debe marcar como detenido al entrar a live');
    }
  );

  // Test 7: stopPlayback limpia temporizadores de reintento en segundo plano
  await test(
    'stopPlayback limpia bgRetryTimer y vodStartTimer',
    async () => {
      const video = { pause: () => {}, removeAttribute: () => {}, load: () => {}, src: '' };
      const container = { classList: { remove: () => {} } };
      const pm = new VideoPlayerManager(video, container);
      pm.bgRetryTimer = setTimeout(() => {}, 5000);
      pm.vodStartTimer = setTimeout(() => {}, 5000);
      pm.controlsTimer = setTimeout(() => {}, 5000);

      await pm.stopPlayback();

      assert(pm.calls.includes('clearTimers'), 'todos los temporizadores deben limpiarse');
    }
  );

  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`📊 Resultados: ${passed} pasadas, ${failed} fallidas`);
  if (failed > 0) {
    console.log('⚠️  HAY FALLOS. No se deben aplicar cambios hasta revisar.');
    process.exit(1);
  } else {
    console.log('✅ TODAS LAS PRUEBAS PASARON. La lógica de Fase 1 es válida.');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
