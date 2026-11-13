// =========================================================
// PRUEBA UNITARIA - Carga de listas en los 2 modos
// Simula el entorno Capacitor nativo exacto de la APK.
// =========================================================
(function runUnitTests() {
  const R = [];
  const log = (nombre, ok, detalle) => R.push({ nombre, ok, detalle: detalle || '' });

  function T(msg) { console.log('[TEST] ' + msg); }

  // ============ MOCK DEL ENTORNO CAPACITOR NATIVO (igual que la APK) ============
  const RED = {
    // Tabla de respuestas por URL
    respuestas: {},
    registrar: function (patron, tipo, cuerpo) {
      this.respuestas[patron] = { tipo: tipo, cuerpo: cuerpo };
    },
    resolver: function (url) {
      for (const patron in this.respuestas) {
        if (url.indexOf(patron) !== -1) return this.respuestas[patron];
      }
      return null;
    }
  };

  window.Capacitor = {
    isNativePlatform: function () { return true; },
    getPlatform: function () { return 'android'; },
    Plugins: {
      CapacitorHttp: {
        get: async function (o) {
          const r = RED.resolver(o.url);
          if (!r) return { status: 404, headers: {}, url: o.url, data: '' };
          if (r.tipo === 'json') return { status: 200, headers: {}, url: o.url, data: JSON.stringify(r.cuerpo) };
          return { status: 200, headers: {}, url: o.url, data: r.cuerpo };
        },
        request: async function (o) {
          const r = RED.resolver(o.url);
          if (!r) return { status: 404, headers: {}, url: o.url, data: '' };
          return { status: 200, headers: {}, url: o.url, data: r.tipo === 'json' ? JSON.stringify(r.cuerpo) : r.cuerpo };
        }
      }
    }
  };

  // ============ DATOS DE PRUEBA ============
  const M3U_LOCAL = '#EXTM3U\n' +
    '#EXTINF:-1 group-title="Deportes",Canal A\nhttp://srv.test/live/u/p/1.ts\n' +
    '#EXTINF:-1 group-title="Deportes",Canal B\nhttp://srv.test/live/u/p/2.ts\n' +
    '#EXTINF:-1 group-title="Series",Serie E1\nhttp://srv.test/series/u/p/3.mp4\n';

  const XTREAM_CATEGORIES = [{ category_id: '10', category_name: 'Deportes' }];
  const XTREAM_STREAMS = [
    { stream_id: '101', name: 'Canal 1', category_id: '10', stream_icon: '' },
    { stream_id: '102', name: 'Canal 2', category_id: '10', stream_icon: '' }
  ];

  RED.registrar('player_api.php', 'json', XTREAM_CATEGORIES); // se sobrescribe abajo
  RED.registrar('get_live_categories', 'json', XTREAM_CATEGORIES);
  RED.registrar('get_live_streams', 'json', XTREAM_STREAMS);
  RED.registrar('mi-lista.test', 'm3u', M3U_LOCAL);
  RED.registrar('data/playlists/', 'm3u', M3U_LOCAL);
  RED.registrar('iptv-org.github.io', 'm3u', M3U_LOCAL);
  RED.registrar('romaxa55.github.io', 'm3u', M3U_LOCAL);

  // Respuestas del panel Xtream (2 endpoints distintos)
  const origGet = window.Capacitor.Plugins.CapacitorHttp.get;
  window.Capacitor.Plugins.CapacitorHttp.get = async function (o) {
    const url = o.url;
    if (url.indexOf('get_live_categories') !== -1) {
      return { status: 200, headers: {}, url: url, data: JSON.stringify(XTREAM_CATEGORIES) };
    }
    if (url.indexOf('get_live_streams') !== -1) {
      return { status: 200, headers: {}, url: url, data: JSON.stringify(XTREAM_STREAMS) };
    }
    if (url.indexOf('get_vod_categories') !== -1) {
      return { status: 200, headers: {}, url: url, data: JSON.stringify([{ category_id: '20', category_name: 'Peliculas' }]) };
    }
    if (url.indexOf('get_vod_streams') !== -1) {
      return { status: 200, headers: {}, url: url, data: JSON.stringify([{ stream_id: '201', name: 'Pelicula 1', category_id: '20', container_extension: 'mp4', stream_icon: '' }]) };
    }
    if (url.indexOf('get_series') !== -1) {
      return { status: 200, headers: {}, url: url, data: JSON.stringify([{ series_id: '30', name: 'Serie 1', category_id: '30', cover: '' }]) };
    }
    if (url.indexOf('get_series_info') !== -1) {
      return { status: 200, headers: {}, url: url, data: JSON.stringify({ info: {}, episodes: { '1': [{ id: '301', episode_num: '1', title: 'Ep 1', container_extension: 'mp4' }] } }) };
    }
    const r = RED.resolver(url);
    if (!r) return { status: 404, headers: {}, url: url, data: '' };
    if (r.tipo === 'json') return { status: 200, headers: {}, url: url, data: JSON.stringify(r.cuerpo) };
    return { status: 200, headers: {}, url: url, data: r.cuerpo };
  };

  // ============ EJECUCION DE LOS CASOS ============
  (async function () {
    const ds = eval("dataService");

    // --- CASO 1: Modo A - Lista publica via importSelectedCountries() ---
    try {
      localStorage.setItem('free_iptv_imported_countries', JSON.stringify(['CL']));
      // Interceptar solo el filtro de red para aislar la carga (no es lo que probamos)
      const origFilter = ds.filterActiveStreamsProgressive;
      ds.filterActiveStreamsProgressive = async function (ch, a, b) {
        const v = ch.slice(0, 20);
        if (a) a(v);
        if (b) b(v, v.length, ch.length, true);
        return v;
      };
      await eval("loadImportedCountries")(['CL'], true);
      ds.filterActiveStreamsProgressive = origFilter;
      const n = eval("allChannels").length;
      log('CASO 1 - Modo A (lista publica)', n > 0, n + ' canales, cats=' + eval("activeCategoriesList").length);
    } catch (e) {
      log('CASO 1 - Modo A (lista publica)', false, 'EXCEPCION: ' + e.message);
    }

    // --- CASO 2: Modo B - Cuenta Xtream via connectXtreamCodes() ---
    try {
      document.getElementById('xtream-host').value = 'http://srv.test:8080';
      document.getElementById('xtream-port').value = '8080';
      document.getElementById('xtream-user').value = 'usuario';
      document.getElementById('xtream-pass').value = 'clave';
      const origFilter2 = ds.filterActiveStreamsProgressive;
      ds.filterActiveStreamsProgressive = async function (ch, a, b) {
        const v = ch.slice(0, 20);
        if (a) a(v);
        if (b) b(v, v.length, ch.length, true);
        return v;
      };
      await eval("connectXtreamCodes")();
      ds.filterActiveStreamsProgressive = origFilter2;
      const n = eval("allChannels").length;
      log('CASO 2 - Modo B (cuenta Xtream)', n > 0, n + ' canales, modo=' + eval("currentAppMode") + ', titulo=' + (document.getElementById('current-country-title') || {}).innerText);
    } catch (e) {
      log('CASO 2 - Modo B (cuenta Xtream)', false, 'EXCEPCION: ' + e.message);
    }

    // --- CASO 3: Modo B - M3U externa por URL via loadCustomM3UUrl() ---
    try {
      const origFilter3 = ds.filterActiveStreamsProgressive;
      ds.filterActiveStreamsProgressive = async function (ch, a, b) {
        const v = ch.slice(0, 20);
        if (a) a(v);
        if (b) b(v, v.length, ch.length, true);
        return v;
      };
      document.getElementById('custom-m3u-url').value = 'http://mi-lista.test/lista.m3u';
      await eval("loadCustomM3UUrl")();
      ds.filterActiveStreamsProgressive = origFilter3;
      const n = eval("allChannels").length;
      log('CASO 3 - Modo B (M3U por URL)', n > 0, n + ' canales, modo=' + eval("currentAppMode"));
    } catch (e) {
      log('CASO 3 - Modo B (M3U por URL)', false, 'EXCEPCION: ' + e.message);
    }

    // --- CASO 4: fetchTextUniversal directo (ruta nativa) ---
    try {
      const t = await ds.fetchTextUniversal('http://mi-lista.test/lista.m3u');
      log('CASO 4 - fetchTextUniversal nativo', typeof t === 'string' && t.indexOf('#EXTM3U') !== -1, 'len=' + (t || '').length);
    } catch (e) {
      log('CASO 4 - fetchTextUniversal nativo', false, 'EXCEPCION: ' + e.message);
    }

    // --- CASO 5: ping (filtro de red) ---
    try {
      const p = await ds.pingStreamUrl('http://srv.test/live/u/p/1.ts');
      log('CASO 5 - pingStreamUrl nativo', p === true, 'resultado=' + p);
    } catch (e) {
      log('CASO 5 - pingStreamUrl nativo', false, 'EXCEPCION: ' + e.message);
    }

    // --- CASO 6: cambio de modo con listas ya cargadas ---
    try {
      await eval("switchAppMode")('A', false);
      await eval("switchAppMode")('B', false);
      log('CASO 6 - switchAppMode A<->B', true, 'modo=' + eval("currentAppMode"));
    } catch (e) {
      log('CASO 6 - switchAppMode A<->B', false, 'EXCEPCION: ' + e.message);
    }

    // --- CASO 7: el boton Ajustes abre y el selector de modo ---
    try {
      eval("openSettingsModal")();
      const abierto = document.getElementById('modal-settings').classList.contains('show');
      const conListas = eval("hasLoadedLists")();
      eval("closeSettingsModal")();
      log('CASO 7 - Ajustes + selector de modo', abierto && conListas, 'abierto=' + abierto + ' hayListas=' + conListas);
    } catch (e) {
      log('CASO 7 - Ajustes + selector de modo', false, 'EXCEPCION: ' + e.message);
    }

    // --- CASO 8: ESCENARIO REAL APK - servidor lento / sin soporte Range ---
    // El ping nativo falla -> antes se descartaba TODO (0 canales). Ahora debe
    // usar el fallback de fetch y, si tampoco, mostrar todos los canales.
    try {
      const capReq = window.Capacitor.Plugins.CapacitorHttp.request;
      window.Capacitor.Plugins.CapacitorHttp.request = async function () {
        return { status: 403, headers: {}, url: 'x', data: '' };   // servidor rechaza
      };
      const origF2 = ds.filterActiveStreamsProgressive;
      ds.filterActiveStreamsProgressive = async function (ch, a, b) {
        const real = origF2.call(ds, ch, a, b);
        return real;
      };
      const t0 = Date.now();
      const resF = await ds.filterActiveStreamsProgressive(
        [{url:'http://srv.test/live/u/p/1.ts',name:'A'},{url:'http://srv.test/live/u/p/2.ts',name:'B'}],
        null, null);
      log('CASO 8 - Filtro con servidor que rechaza (403)', resF.length === 2, 'resultado=' + resF.length + ' en ' + (Date.now()-t0) + 'ms');
      window.Capacitor.Plugins.CapacitorHttp.request = capReq;
      ds.filterActiveStreamsProgressive = origF2;
    } catch (e) {
      log('CASO 8 - Filtro con servidor que rechaza (403)', false, 'EXCEPCION: ' + e.message);
    }
    // --- RESUMEN ---
    console.log('\n===== RESULTADO PRUEBA UNITARIA =====');
    R.forEach(function (r) {
      console.log((r.ok ? 'PASA  ' : 'FALLA ') + r.nombre + '  |  ' + r.detalle);
    });
    const fallos = R.filter(r => !r.ok).length;
    console.log('===== ' + (R.length - fallos) + '/' + R.length + ' CASOS OK =====\n');
    window.__TEST_RESULT__ = R;
  })();
})();
