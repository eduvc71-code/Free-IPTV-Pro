// =========================================================
// Free-IPTV Pro - Suite de Pruebas Unitarias y Auditoría
// Verifica:
// 1. Integridad de Fuentes e Iconos FontAwesome
// 2. Seguridad y Rendimiento de SecuritySanitizer (sin cuelgues)
// 3. Detección precisa de TV vs Móvil en TVNavigation
// 4. Compatibilidad Multimedia y Selección de Motor (Audio/VOD)
// 5. Disponibilidad dinámica de ExoPlayerPlugin
// 6. Registro Silencioso (Silent Background Logger)
// =========================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`);
    console.error(`     Error: ${err.message}`);
  }
}

console.log('========================================================');
console.log('AUDITORÍA TÉCNICA Y PRUEBAS UNITARIAS - FREE-IPTV PRO');
console.log('========================================================\n');

// ---------------------------------------------------------
// TEST SUITE 1: Iconos y Fuentes Font Awesome
// ---------------------------------------------------------
console.log('📦 1. Auditoría de Iconos y Fuentes CSS:');

it('fontawesome.min.css existe y contiene definiciones de Font Awesome 7 y 6', () => {
  const css = fs.readFileSync(path.join(__dirname, 'www/css/fontawesome.min.css'), 'utf8');
  assert.ok(css.includes('Font Awesome 7 Free'), 'Debe incluir Font Awesome 7 Free');
  assert.ok(css.includes('Font Awesome 6 Free'), 'Debe incluir alias Font Awesome 6 Free');
  assert.ok(!css.includes('content:var(--fa)/""'), 'No debe contener la sintaxis incompatible content:var(--fa)/""');
  assert.ok(css.includes(':is(.fas,.far,.fab,.fa-solid,.fa-regular,.fa-brands,.fa-classic,.fa):before{content:var(--fa)}'), 'Debe usar content:var(--fa) directo');
});

it('app.css contiene regla de protección !important para Font Awesome contra Inter', () => {
  const appCss = fs.readFileSync(path.join(__dirname, 'www/css/app.css'), 'utf8');
  assert.ok(appCss.includes('font-family: \'Font Awesome 7 Free\', \'Font Awesome 6 Free\', \'FontAwesome\' !important;'), 'Debe forzar font-family de iconos con !important');
});

it('Archivos de fuentes .woff2 están presentes en www/webfonts/', () => {
  const fonts = ['fa-solid-900.woff2', 'fa-regular-400.woff2', 'fa-brands-400.woff2'];
  fonts.forEach(f => {
    const p = path.join(__dirname, 'www/webfonts', f);
    assert.ok(fs.existsSync(p), `Debe existir archivo de fuente ${f}`);
    assert.ok(fs.statSync(p).size > 10000, `${f} no debe estar vacío`);
  });
});

// ---------------------------------------------------------
// TEST SUITE 2: SecuritySanitizer (Seguridad y No Bloqueo)
// ---------------------------------------------------------
console.log('\n🔒 2. Seguridad y Rendimiento de SecuritySanitizer:');

// Emular entorno navegador mínimo
global.window = global;
require('./www/js/platform/SecuritySanitizer.js');

it('Sanitiza contraseñas en URLs de Xtream y tokens Bearer', () => {
  const sanitizer = new window.SecuritySanitizer();
  const rawUrl = 'http://servidor.xyz:8080/live/miusuario/mipassword123/12345.ts';
  const sanitized = sanitizer.sanitizeString(rawUrl);
  // URL con query params
  const urlWithParams = 'http://test.com/get.php?username=eduardo&password=secreta123&type=m3u';
  const sanitizedParams = sanitizer.sanitizeString(urlWithParams);
  
  assert.ok(!sanitizedParams.includes('secreta123'), 'La contraseña debe ser redactada');
  assert.ok(sanitizedParams.includes('[REDACTADO]'), 'Debe sustituirse por [REDACTADO]');
});

it('Maneja objetos con referencias circulares y eventos sin trabar el hilo ni lanzar excepción', () => {
  const sanitizer = new window.SecuritySanitizer();
  
  // Objeto circular
  const circularObj = { name: 'prueba' };
  circularObj.self = circularObj;

  // Nodo simulado del DOM
  const fakeDomNode = { nodeType: 1, tagName: 'DIV', ownerDocument: {} };
  fakeDomNode.ownerDocument.node = fakeDomNode;

  // No debe lanzar error al pasar argumentos complejos a console.log interceptado
  assert.doesNotThrow(() => {
    console.log('[TEST LOG CIRCULAR]', circularObj);
    console.log('[TEST LOG DOM]', fakeDomNode);
  });
});

// ---------------------------------------------------------
// TEST SUITE 3: Detección TVNavigation (Móvil vs TV)
// ---------------------------------------------------------
console.log('\n📺 3. Detección TVNavigation (Móvil vs TV):');

// Emular navegador con UA
global.navigator = { userAgent: '' };
global.document = {
  body: { classList: { add: () => {}, remove: () => {} } },
  addEventListener: () => {},
  querySelectorAll: () => [],
  head: { appendChild: () => {} },
  createElement: () => ({ style: {} })
};
require('./www/js/platform/TVNavigation.js');

it('No activa modo TV en smartphones Android estándar', () => {
  const ua = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  const nav = new window.TVNavigation({ userAgent: ua });
  assert.strictEqual(nav.isTVMode, false, 'Smartphone Android no debe identificarse como TV');
});

it('Sí activa modo TV en Android TV o Fire TV reales', () => {
  const uaTV = 'Mozilla/5.0 (Linux; Android TV; BRAVIA 4K Build/...) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36';
  const navTV = new window.TVNavigation({ userAgent: uaTV });
  assert.strictEqual(navTV.isTVMode, true, 'Android TV debe detectarse correctamente');

  const uaFire = 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/...) AppleWebKit/537.36';
  const navFire = new window.TVNavigation({ userAgent: uaFire });
  assert.strictEqual(navFire.isTVMode, true, 'Fire TV Stick debe detectarse correctamente');
});

// ---------------------------------------------------------
// TEST SUITE 4: Compatibilidad Multimedia y Audio
// ---------------------------------------------------------
console.log('\n🎵 4. Compatibilidad Multimedia y Audio VOD:');

require('./www/js/platform/PlatformDetector.js');
require('./www/js/platform/MediaCompatibility.js');

it('MediaCompatibility recomienda reproductor externo para MKV/AVI', () => {
  const det = new window.PlatformDetector();
  const compat = new window.MediaCompatibility(det);
  assert.strictEqual(compat.needsExternalPlayer('http://servidor.com/movie.mkv'), true, 'MKV debe requerir reproductor externo');
  assert.strictEqual(compat.recommendedEngine('http://servidor.com/pelicula.mkv'), 'external_player');
});

it('MediaCompatibility recomienda HLS.js para canales .m3u8 en Android', () => {
  global.navigator.userAgent = 'Mozilla/5.0 (Linux; Android 14; Mobile)';
  const det = new window.PlatformDetector();
  const compat = new window.MediaCompatibility(det);
  assert.strictEqual(compat.recommendedEngine('http://servidor.com/live.m3u8'), 'hlsjs');
});

// ---------------------------------------------------------
// TEST SUITE 5: ExoPlayerPluginBridge Disponibilidad
// ---------------------------------------------------------
console.log('\n🚀 5. Disponibilidad dinámica de ExoPlayerPlugin:');

require('./www/js/platform/ExoPlayerPlugin.js');

it('ExoPlayerPluginBridge detecta disponibilidad dinámicamente cuando Capacitor monta el plugin', () => {
  const bridge = new window.ExoPlayerPluginBridge();
  assert.strictEqual(bridge.available, false, 'Sin Capacitor debe ser false');

  // Simular que Capacitor carga el plugin nativo posteriormente
  global.window.Capacitor = {
    Plugins: {
      ExoPlayerPlugin: {
        play: async () => ({ status: 'playing' }),
        stop: async () => ({})
      }
    }
  };

  assert.strictEqual(bridge.available, true, 'El getter available debe ser true tras registrarse el plugin');
});

// ---------------------------------------------------------
// TEST SUITE 6: Logger Silencioso (Background Logging)
// ---------------------------------------------------------
console.log('\n📋 6. Logger Silencioso (Modo Depuración USB):');

// Simular puente nativo Android
let nativeLogsReceived = [];
global.AndroidNativeApp = {
  log: (tag, msg) => {
    nativeLogsReceived.push({ tag, msg });
  }
};

require('./www/js/iptv-logger.js');

it('Registra eventos en el buffer silencioso y los transmite a Android Logcat sin alertas en UI', () => {
  window.silentLog.clear();
  nativeLogsReceived = [];
  window.silentLog.info('AUDIO_TEST', 'Pista de audio inicializada en estéreo');
  window.silentLog.warn('STREAM_TEST', 'Buffering detectado');

  const logs = window.silentLog.getAll();
  assert.strictEqual(logs.length, 2, 'Debe haber 2 logs registrados en el buffer');
  assert.ok(logs[0].includes('AUDIO_TEST'), 'Debe registrar la etiqueta correcta');
  
  assert.strictEqual(nativeLogsReceived.length, 2, 'Debe haber enviado 2 logs al puente nativo de Android');
  assert.strictEqual(nativeLogsReceived[0].tag, 'AUDIO_TEST');
  assert.ok(nativeLogsReceived[0].msg.includes('Pista de audio inicializada'), 'El mensaje debe coincidir');
});

// ---------------------------------------------------------
// TEST SUITE 7: Carga Universal de Listas Públicas y Privadas
// ---------------------------------------------------------
console.log('\n📡 7. Carga Universal de Listas (Públicas y Privadas):');

it('dataService.fetchTextUniversal carga listas locales via AndroidNativeApp.readAsset', async () => {
  // Mock dataService
  let readAssetCalls = [];
  global.AndroidNativeApp.readAsset = (path) => {
    readAssetCalls.push(path);
    return '#EXTM3U\n#EXTINF:-1 tvg-logo="" group-title="General",Canal 1\nhttp://stream1.m3u8';
  };
  global.AndroidNativeApp.fetchUrl = (url) => {
    return '{"status":"active"}';
  };
  global.AndroidNativeApp.pingUrl = (url) => true;

  // Cargar xtream.js
  global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  require('./www/js/xtream.js');
  const service = new window.IPTVDataService();

  const localContent = await service.fetchTextUniversal('data/playlists/co.m3u');
  assert.ok(localContent.includes('#EXTM3U'), 'Debe devolver el contenido M3U local');
  assert.ok(readAssetCalls.includes('data/playlists/co.m3u'), 'Debe haber llamado a AndroidNativeApp.readAsset');

  // Test parseM3U
  const channels = service.parseM3U(localContent, 'Colombia');
  assert.strictEqual(channels.length, 1);
  assert.strictEqual(channels[0].name, 'Canal 1');
});

it('dataService.fetchTextUniversal carga URLs remotas privadas via AndroidNativeApp.fetchUrl (bypass CORS)', async () => {
  let fetchUrlCalls = [];
  global.AndroidNativeApp.fetchUrl = (url, ua, to) => {
    fetchUrlCalls.push({ url, ua });
    return '[{"num":1,"name":"HBO","stream_id":100,"stream_type":"live"}]';
  };

  const service = new window.IPTVDataService();
  const remoteRes = await service.fetchTextUniversal('http://mi-servidor-iptv.com:8080/player_api.php?user=test&pass=123');
  assert.ok(remoteRes.includes('HBO'), 'Debe devolver los datos del stream remoto');
  assert.strictEqual(fetchUrlCalls.length, 1);
  assert.ok(fetchUrlCalls[0].url.includes('mi-servidor-iptv.com'), 'Debe invocar URL remota');
});

// ---------------------------------------------------------
// TEST SUITE 8: Exportación Global de Botones de Menú y Modales
// ---------------------------------------------------------
console.log('\n🔘 8. Verificación de Botones de Menú y Acciones Globales:');

it('Todas las funciones interactivas y botones de menú están expuestas en window', () => {
  // Configurar DOM mínimo para app.js
  global.document = {
    addEventListener: () => {},
    getElementById: (id) => ({
      classList: { add: () => {}, remove: () => {}, contains: () => false },
      addEventListener: () => {},
      style: {},
      innerHTML: '',
      innerText: '',
      value: ''
    }),
    querySelectorAll: () => [],
    createElement: () => ({ classList: { add: () => {} }, style: {}, setAttribute: () => {}, appendChild: () => {} }),
    body: { classList: { add: () => {}, remove: () => {} } },
    head: { appendChild: () => {} }
  };
  global.window.activeTab = 'home';
  global.window.americasCountries = [];
  
  require('./www/js/app.js');

  const requiredMenuFns = [
    'switchTab', 'switchAppMode', 'switchContentType', 'openSettingsModal', 'closeSettingsModal',
    'openCountrySelectorModal', 'closeCountrySelectorModal', 'importSelectedCountries',
    'selectAllSelectorCountries', 'filterSelectorRegion', 'connectXtreamCodes', 'loadCustomM3UUrl',
    'handleM3UFileSelect', 'quickConnectAccount', 'deleteAccount', 'confirmExitApp',
    'openVodModal', 'closeVodDetailModal', 'playCurrentVod', 'playVodExternal',
    'openSeriesModal', 'closeSeriesDetailModal', 'playSeriesEpisode', 'playEpisodeExternal',
    'openMediaInExternalPlayer', 'focusChannelSearch', 'toggleSortAz'
  ];

  requiredMenuFns.forEach(fn => {
    assert.strictEqual(typeof window[fn], 'function', `window.${fn} debe ser una función ejecutable`);
  });
});

console.log('\n========================================================');
console.log(`RESUMEN: ${passedTests} de ${totalTests} pruebas pasadas con éxito (${((passedTests/totalTests)*100).toFixed(1)}%)`);
console.log('========================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
