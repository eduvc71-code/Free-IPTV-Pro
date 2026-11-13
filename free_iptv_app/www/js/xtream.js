// =========================================================
// Free-IPTV Pro - M3U & Xtream Codes Service Layer
// =========================================================
class IPTVDataService {
  constructor() {
    this.favKey = 'free_iptv_favorites_v2';
    this.savedAccountsKey = 'free_iptv_xtream_accounts';
    this.savedPlaylistsKey = 'free_iptv_custom_playlists_v2';
    this.deadChannelsKey = 'free_iptv_dead_channels';
    this.db = null;
    // Limpiar historial previo si existe
    try {
      localStorage.removeItem('free_iptv_history_v2');
      localStorage.removeItem('free_iptv_recent_channels');
    } catch (e) {}
  }

  // Parse Raw M3U / M3U8 Content with robust metadata extraction
  parseM3U(content, defaultGroup = 'General') {
    if (!content) return [];
    const lines = content.split(/\r?\n/);
    const channels = [];
    let currentExtinf = null;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF:')) {
        currentExtinf = line;
      } else if (!line.startsWith('#') && currentExtinf) {
        // Extract Logo
        const logoMatch = currentExtinf.match(/tvg-logo="([^"]*)"/i);
        const logo = logoMatch ? logoMatch[1].trim() : '';

        // Extract Group / Category
        const groupMatch = currentExtinf.match(/group-title="([^"]*)"/i);
        let group = groupMatch && groupMatch[1] ? groupMatch[1].trim() : defaultGroup;
        if (!group) group = defaultGroup;

        // Extract Name (after the last comma)
        const commaIdx = currentExtinf.lastIndexOf(',');
        let name = commaIdx !== -1 ? currentExtinf.substring(commaIdx + 1).trim() : 'Canal';
        if (!name) name = 'Canal en vivo';

        let streamUrl = line;

        channels.push({
          id: 'ch_' + channels.length + '_' + Math.random().toString(36).substring(2, 7),
          name: name,
          logo: logo,
          group: group,
          url: streamUrl,
          rawUrl: line
        });
        currentExtinf = null;
      }
    }
    return channels;
  }

  // Group channels into a fast O(1) Category Map
  groupChannelsByCategory(channels) {
    const map = {};
    const categories = [];

    channels.forEach(ch => {
      const cat = ch.group || 'General';
      if (!map[cat]) {
        map[cat] = [];
        categories.push(cat);
      }
      map[cat].push(ch);
    });

    return {
      map: map,
      categories: categories.map(name => ({
        name: name,
        count: map[name].length
      }))
    };
  }

  // Multi-tier Ultra-Fast Fetch with Native OkHttp & Direct Fetch
  async fetchTextUniversal(url) {
    if (!url) throw new Error("La URL está vacía.");
    url = url.trim();

    // 0. A: Local Asset (data/americas_countries.json, data/playlists/...) via Native AssetManager
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (window.AndroidNativeApp && typeof window.AndroidNativeApp.readAsset === 'function') {
        try {
          const assetData = window.AndroidNativeApp.readAsset(url);
          if (assetData && assetData.length > 5) {
            console.log("[IPTV] Archivo local cargado via AndroidNativeApp.readAsset:", url);
            return assetData;
          }
        } catch (assetErr) {
          console.warn("[IPTV] Error leyendo asset nativo:", assetErr);
        }
      }
      // Fallback local fetch
      try {
        const localResp = await fetch(url);
        if (localResp.ok) {
          const lTxt = await localResp.text();
          if (lTxt && lTxt.length > 5) return lTxt;
        }
      } catch (lErr) {}
    }

    // 0. B: Remote URL via Native Android HTTP (Zero CORS, auto redirects, full SSL)
    if (url.startsWith('http://') || url.startsWith('https://')) {
      if (window.AndroidNativeApp && typeof window.AndroidNativeApp.fetchUrl === 'function') {
        try {
          console.log("[IPTV] Conectando via AndroidNativeApp.fetchUrl:", url);
          const nativeRes = window.AndroidNativeApp.fetchUrl(url, 'IPTVSmartersPro/3.1.5.1 (Linux; Android 14) Mobile', 25000);
          if (nativeRes && !nativeRes.startsWith("ERROR:")) {
            console.log("[IPTV] ¡Respuesta nativa Android obtenida con éxito! (" + nativeRes.length + " bytes)");
            return nativeRes;
          }
          console.warn("[IPTV] AndroidNativeApp.fetchUrl retorno:", nativeRes);
        } catch (nativeAppErr) {
          console.warn("[IPTV] Fallo AndroidNativeApp.fetchUrl:", nativeAppErr);
        }
      }
    }

    // 1. Check if Capacitor Native HTTP is available (Bypasses CORS completely)
    const cap = window.Capacitor;
    const capHttp = cap?.Plugins?.CapacitorHttp || window.CapacitorHttp;
    if (capHttp && typeof capHttp.get === 'function') {
      try {
        console.log("[IPTV] Conectando nativamente con CapacitorHttp:", url);
        const response = await Promise.race([
          capHttp.get({
            url: url,
            headers: {
              'User-Agent': 'IPTVSmartersPro/3.1.5.1 (Linux; Android 14) Mobile',
              'Accept': '*/*'
            },
            connectTimeout: 15000,
            readTimeout: 20000
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout nativo")), 22000))
        ]);
        if (response && response.data !== undefined && response.data !== null) {
          const resStr = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
          if (resStr.length > 5) {
            console.log("[IPTV] ¡Respuesta nativa obtenida!");
            return resStr;
          }
        }
      } catch (nativeErr) {
        console.warn("[IPTV] CapacitorHttp fallo:", nativeErr.message || nativeErr);
      }
    }

    // 2. Direct fetch with 15 second timeout
    try {
      console.log("[IPTV] Intentando fetch directo...");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const resp = await fetch(url, {
        headers: { 'Accept': '*/*' },
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timer);
      if (resp.ok) {
        const text = await resp.text();
        if (text && text.length > 5) return text;
      }
    } catch (directErr) {
      console.warn("[IPTV] Fetch directo fallo:", directErr.message);
    }

    // 3. Fallback to Fast CORS Proxies
    console.log("[IPTV] Intentando proxies de rescate...");
    const proxies = [
      `https://corsproxy.io/?${encodeURIComponent(url)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    ];

    for (const proxyUrl of proxies) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 9000);
        const pResp = await fetch(proxyUrl, { signal: controller.signal, cache: 'no-store' });
        clearTimeout(timer);
        if (pResp.ok) {
          const pTxt = await pResp.text();
          if (pTxt && pTxt.length > 5) return pTxt;
        }
      } catch (pErr) {}
    }

    throw new Error("No se pudo conectar a la URL externa (CORS o servidor caído). Verifica tu conexión o el enlace.");
  }

  // Live Stream Ping & Reachability Check (Instant Verification)
  async pingStreamUrl(url) {
    if (!url || typeof url !== 'string') return false;
    url = url.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) return false;

    // 0. Try Android Native pingUrl (Instant HEAD/GET, zero CORS, cross-protocol)
    if (window.AndroidNativeApp && typeof window.AndroidNativeApp.pingUrl === 'function') {
      try {
        const alive = window.AndroidNativeApp.pingUrl(url, 4000);
        if (alive) return true;
      } catch (e) {}
    }

    // 1. Try Capacitor Native Http (sin CORS)
    const cap = window.Capacitor;
    const capHttp = cap?.Plugins?.CapacitorHttp || window.CapacitorHttp;
    if (capHttp && typeof capHttp.request === 'function') {
      try {
        const resp = await Promise.race([
          capHttp.request({
            method: 'GET',
            url: url,
            headers: {
              'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
              'Range': 'bytes=0-1000'
            },
            connectTimeout: 6000,
            readTimeout: 6000
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
        ]);
        if (resp && resp.status >= 200 && resp.status < 400) {
          return true;
        }
        // Status no valido: NO abandonar aqui, se intenta el fallback de fetch.
      } catch {
        // Error nativo (timeout / red): se intenta el fallback de fetch.
      }
    }

    // 2. Browser Direct Fetch with HEAD or Range
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const resp = await fetch(url, {
        method: 'HEAD',
        headers: { 'Accept': '*/*' },
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timer);
      if (resp.ok || resp.status === 200 || resp.status === 206) return true;
    } catch {}

    // 3. Fallback no-cors probe
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      await fetch(url, {
        method: 'GET',
        mode: 'no-cors',
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timer);
      return true;
    } catch {
      return false;
    }
  }

  // Open / Init IndexedDB for Large Channel Lists
  async openDB() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open('FreeIPTV_Storage_v3', 1);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('channels_cache')) {
            db.createObjectStore('channels_cache', { keyPath: 'key' });
          }
        };
        request.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(this.db);
        };
        request.onerror = (e) => reject(e);
      } catch (err) {
        reject(err);
      }
    });
  }

  async setCachedChannels(key, channels) {
    if (!key || !channels || channels.length === 0) return;
    try {
      const db = await this.openDB();
      const tx = db.transaction('channels_cache', 'readwrite');
      tx.objectStore('channels_cache').put({
        key: key,
        channels: channels,
        timestamp: Date.now(),
        count: channels.length
      });
    } catch (e) {
      console.warn("[Cache] Fallback localStorage:", e);
      try {
        localStorage.setItem('cache_' + key, JSON.stringify(channels.slice(0, 600)));
      } catch {}
    }
  }

  async getCachedChannels(key) {
    if (!key) return null;
    try {
      const db = await this.openDB();
      return new Promise((resolve) => {
        const tx = db.transaction('channels_cache', 'readonly');
        const req = tx.objectStore('channels_cache').get(key);
        req.onsuccess = () => {
          if (req.result && Array.isArray(req.result.channels) && req.result.channels.length > 0) {
            resolve(req.result.channels);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      try {
        const item = localStorage.getItem('cache_' + key);
        return item ? JSON.parse(item) : null;
      } catch {
        return null;
      }
    }
  }

  async clearCachedChannels(key) {
    try {
      const db = await this.openDB();
      const tx = db.transaction('channels_cache', 'readwrite');
      tx.objectStore('channels_cache').delete(key);
    } catch {}
    try {
      localStorage.removeItem('cache_' + key);
    } catch {}
  }

  // Filter channels with progressive loading:
  async filterActiveStreamsProgressive(channels, onFirstBatchReady = null, onProgress = null) {
    if (!channels || channels.length === 0) return [];
    const valid = [];
    const batchSize = 12;
    const MAX_VERIFY_MS = 25000;   // nunca bloquear la carga mas de 25s
    const startedAt = Date.now();
    let checkedCount = 0;
    let firstBatchDispatched = false;

    // Fast-path: quickly ping the first 12 candidates
    const initialBatch = channels.slice(0, 12);
    const initialResults = await Promise.all(initialBatch.map(async (ch) => {
      const isAlive = await this.pingStreamUrl(ch.url);
      return { ch, isAlive };
    }));

    for (const r of initialResults) {
      checkedCount++;
      if (r.isAlive) valid.push(r.ch);
    }

    if (valid.length > 0 && typeof onFirstBatchReady === 'function') {
      firstBatchDispatched = true;
      onFirstBatchReady(valid.slice());
    }

    const remaining = channels.slice(12);
    for (let i = 0; i < remaining.length; i += batchSize) {
      // Limite de tiempo: si se agota, se aceptan los canales sin verificar
      // para no dejar la app cargando indefinidamente.
      if (Date.now() - startedAt > MAX_VERIFY_MS) {
        const notChecked = remaining.slice(i);
        console.warn('[IPTV] Limite de verificacion alcanzado; se aceptan ' + notChecked.length + ' canales sin verificar.');
        valid.push(...notChecked);
        if (typeof onFirstBatchReady === 'function' && !firstBatchDispatched) {
          firstBatchDispatched = true;
          onFirstBatchReady(valid.slice());
        }
        if (typeof onProgress === 'function') {
          onProgress(valid.slice(), checkedCount + notChecked.length, channels.length, true);
        }
        return valid;
      }

      const batch = remaining.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(async (ch) => {
        const isAlive = await this.pingStreamUrl(ch.url);
        return { ch, isAlive };
      }));

      for (const res of results) {
        checkedCount++;
        if (res.isAlive) {
          valid.push(res.ch);
        }
      }

      if (!firstBatchDispatched && valid.length >= 5 && typeof onFirstBatchReady === 'function') {
        firstBatchDispatched = true;
        onFirstBatchReady(valid.slice());
      }

      if (typeof onProgress === 'function') {
        onProgress(valid.slice(), checkedCount, channels.length, false);
      }

      await new Promise(r => setTimeout(r, 60));
    }

    if (typeof onProgress === 'function') {
      onProgress(valid.slice(), checkedCount, channels.length, true);
    }

    // Ningun canal supero la verificacion de red (servidor lento, bloqueado o
    // sin soporte de Range). En ese caso se devuelven TODOS los canales:
    // es preferible mostrarlos y que el usuario vea cuales funcionan al
    // reproducir, antes que dejar la grilla completamente vacia.
    if (valid.length === 0 && channels.length > 0) {
      console.warn('[IPTV] Ningun canal supero la verificacion de red. Se muestran todos.');
      if (typeof onFirstBatchReady === 'function') onFirstBatchReady(channels.slice());
      if (typeof onProgress === 'function') {
        onProgress(channels.slice(), checkedCount, channels.length, true);
      }
      return channels;
    }

    return valid;
  }

  // Parse and extract parameters from long M3U Xtream URLs with rock-solid Port preservation
  parseXtreamUrl(url) {
    if (!url || typeof url !== 'string') return null;
    url = url.trim();

    let rawUrl = url;
    let hasProtocol = /^https?:\/\//i.test(rawUrl);
    let fullUrl = hasProtocol ? rawUrl : 'http://' + rawUrl;

    let server = '';
    let host = '';
    let port = '';
    let username = '';
    let password = '';
    let output = ''; // Sin formato explícito: se decide al construir URLs (ver getLiveStreamUrl)

    // Extract port explicitly using regex
    const portRegex = /:(\d{2,5})(?:[/?#]|$)/;
    const portMatch = rawUrl.match(portRegex);
    if (portMatch) {
      port = portMatch[1];
    }

    try {
      const urlObj = new URL(fullUrl);
      const params = urlObj.searchParams;

      username = params.get('username') || params.get('user') || '';
      password = params.get('password') || params.get('pass') || '';
      output = params.get('output') || (rawUrl.includes('.m3u8') ? 'm3u8' : 'ts');

      if (!port && urlObj.port) {
        port = urlObj.port;
      }

      if (!username || !password) {
        const parts = urlObj.pathname.split('/').filter(Boolean);
        if (parts.length >= 3 && (parts[0] === 'live' || parts[0] === 'movie' || parts[0] === 'series' || parts[0] === 'get.php')) {
          username = parts[1];
          password = parts[2];
        }
      }

      const protocol = urlObj.protocol || 'http:';
      const hostname = urlObj.hostname;
      host = `${protocol}//${hostname}`;
      server = port ? `${host}:${port}` : host;

    } catch (e) {
      const protoMatch = rawUrl.match(/^(https?:\/\/)/i);
      const protocol = protoMatch ? protoMatch[1].toLowerCase() : 'http://';
      const cleanNoProto = rawUrl.replace(/^https?:\/\//i, '');
      const hostPart = cleanNoProto.split(/[/?#]/)[0];
      const hostNameOnly = hostPart.split(':')[0];

      host = `${protocol}${hostNameOnly}`;
      server = port ? `${host}:${port}` : host;

      const userMatch = rawUrl.match(/[?&](?:username|user)=([^&#]+)/i);
      const passMatch = rawUrl.match(/[?&](?:password|pass)=([^&#]+)/i);

      if (userMatch) username = decodeURIComponent(userMatch[1]);
      if (passMatch) password = decodeURIComponent(passMatch[1]);
    }

    if (username && password) {
      return {
        server: server,    // e.g. "http://mallorca.plus:80"
        host: host,        // e.g. "http://mallorca.plus"
        port: port || '',  // e.g. "80"
        username: username,
        password: password,
        output: output || 'ts'
      };
    }
    return null;
  }

  // Connect to Xtream Codes (Player API & M3U Plus)
  async fetchXtreamPlaylist(server, username, password, format = 'ts') {
    let cleanServer = server.replace(/\/+$/, '');
    if (!cleanServer.startsWith('http://') && !cleanServer.startsWith('https://')) {
      cleanServer = 'http://' + cleanServer;
    }

    // Respetar exactamente el formato solicitado
    const streamExt = format;

    // 1. PRIMARY: Official Xtream Player API (Super Fast, <2 seconds, maps categories)
    try {
      console.log("[IPTV] Conectando a Xtream Player API...", cleanServer);
      const catUrl = `${cleanServer}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_live_categories`;
      const streamUrl = `${cleanServer}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_live_streams`;

      const [catText, streamText] = await Promise.all([
        this.fetchTextUniversal(catUrl).catch(() => '[]'),
        this.fetchTextUniversal(streamUrl)
      ]);

      let categories = [];
      try { categories = JSON.parse(catText); } catch {}
      const categoryMap = {};
      if (Array.isArray(categories)) {
        categories.forEach(c => {
          if (c.category_id && c.category_name) {
            categoryMap[String(c.category_id)] = c.category_name;
          }
        });
      }

      let streams = [];
      try { streams = JSON.parse(streamText); } catch {}

      if (Array.isArray(streams) && streams.length > 0) {
        console.log(`[IPTV] Xtream Player API éxito: ${streams.length} canales`);
        return streams.map(item => {
          const catName = categoryMap[String(item.category_id)] || item.category_name || 'En Vivo';
          // FASE 2: usar el formato solicitado explícitamente (.ts o .m3u8).
          // No forzar m3u8 sobre canales que solo existen como .ts.
          const streamLiveUrl = this.getLiveStreamUrl(cleanServer, username, password, item.stream_id, streamExt);
          return {
            id: 'ch_xtream_' + (item.stream_id || Math.random().toString(36).substring(2, 6)),
            num: item.num || '',
            name: item.name || 'Canal Xtream',
            logo: item.stream_icon || '',
            group: catName,
            category_id: String(item.category_id || ''),
            stream_id: item.stream_id,
            url: streamLiveUrl,
            direct_source: item.direct_source || streamLiveUrl
          };
        });
      }
    } catch (apiErr) {
      console.warn("[IPTV] Player API fallo, intentando get.php m3u_plus...", apiErr.message);
    }

    // 2. FALLBACK: Fetch M3U Plus format (/get.php) only if player_api failed
    const m3uUrl = `${cleanServer}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus&output=${streamExt}`;
    try {
      const text = await this.fetchTextUniversal(m3uUrl);
      if (text && (text.includes('#EXTM3U') || text.includes('#EXTINF'))) {
        return this.parseM3U(text, 'Xtream Live');
      }
    } catch (m3uErr) {
      console.warn("[IPTV] Fallback /get.php fallo:", m3uErr.message);
    }

    throw new Error("No se pudo obtener la lista de canales del panel Xtream. Verifica que el Servidor, Puerto, Usuario y Clave sean correctos y el servicio esté activo.");
  }

  // Saved Xtream Accounts
  getSavedAccounts() {
    try {
      return JSON.parse(localStorage.getItem(this.savedAccountsKey)) || [];
    } catch {
      return [];
    }
  }

  // =========================================================
  // FASE 2: URLs de streams por tipo (sin conversiones incorrectas)
  // - LIVE: respeta el formato solicitado (.ts nativo o .m3u8 HLS).
  //   NUNCA se fuerza .m3u8 sobre un canal que solo existe como .ts,
  //   ni se renombra .ts a .m3u8 (eso rompía canales en WebView).
  // - VOD/Series: SIEMPRE usa container_extension real (mp4/mkv/ts...);
  //   no se convierten a m3u8.
  // =========================================================
  getLiveStreamUrl(cleanServer, username, password, streamId, format) {
    const ext = (format === 'm3u8' || format === 'ts') ? format : 'ts';
    return `${cleanServer}/live/${username}/${password}/${streamId}.${ext}`;
  }

  saveAccount(server, username, password, format = 'ts') {
    let accounts = this.getSavedAccounts();
    accounts = accounts.filter(a => !(a.server === server && a.username === username));
    accounts.unshift({
      server,
      username,
      password,
      format: format || 'ts',
      savedAt: new Date().toISOString()
    });
    if (accounts.length > 10) accounts.pop();
    localStorage.setItem(this.savedAccountsKey, JSON.stringify(accounts));
  }

  deleteAccount(idx) {
    let accounts = this.getSavedAccounts();
    accounts.splice(idx, 1);
    localStorage.setItem(this.savedAccountsKey, JSON.stringify(accounts));
  }

  // Custom M3U Playlists
  getCustomPlaylists() {
    try {
      return JSON.parse(localStorage.getItem(this.savedPlaylistsKey)) || [];
    } catch {
      return [];
    }
  }

  saveCustomPlaylist(name, url, channelCount = 0) {
    let list = this.getCustomPlaylists();
    list = list.filter(l => l.url !== url && l.name !== name);
    list.unshift({
      name,
      url,
      channels: channelCount,
      date: new Date().toLocaleDateString()
    });
    if (list.length > 10) list.pop();
    localStorage.setItem(this.savedPlaylistsKey, JSON.stringify(list));
  }

  deleteCustomPlaylist(idx) {
    let list = this.getCustomPlaylists();
    list.splice(idx, 1);
    localStorage.setItem(this.savedPlaylistsKey, JSON.stringify(list));
  }

  // Favorites Management
  getFavorites() {
    try {
      return JSON.parse(localStorage.getItem(this.favKey)) || [];
    } catch {
      return [];
    }
  }

  isFavorite(channel) {
    if (!channel || !channel.url) return false;
    const favs = this.getFavorites();
    return favs.some(f => f.url === channel.url || f.id === channel.id);
  }

  toggleFavorite(channel) {
    if (!channel || !channel.url) return false;
    let favs = this.getFavorites();
    const idx = favs.findIndex(f => f.url === channel.url || f.id === channel.id);
    if (idx >= 0) {
      favs.splice(idx, 1);
    } else {
      favs.unshift(channel);
    }
    localStorage.setItem(this.favKey, JSON.stringify(favs));
    return idx < 0;
  }

  // Fetch VOD (Películas) Categories from Xtream Player API
  async fetchVodCategories(server, username, password) {
    let cleanServer = server.replace(/\/+$/, '');
    if (!cleanServer.startsWith('http://') && !cleanServer.startsWith('https://')) {
      cleanServer = 'http://' + cleanServer;
    }
    const url = `${cleanServer}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_vod_categories`;
    try {
      const text = await this.fetchTextUniversal(url);
      const data = JSON.parse(text);
      if (Array.isArray(data)) return data;
      return [];
    } catch (e) {
      console.warn('[IPTV] Error al obtener categorías VOD:', e);
      return [];
    }
  }

  // Fetch VOD (Películas) Streams (optionally filtered by category)
  async fetchVodStreams(server, username, password, categoryId = null) {
    let cleanServer = server.replace(/\/+$/, '');
    if (!cleanServer.startsWith('http://') && !cleanServer.startsWith('https://')) {
      cleanServer = 'http://' + cleanServer;
    }
    let url = `${cleanServer}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_vod_streams`;
    if (categoryId && categoryId !== 'all' && categoryId !== 'Todos') {
      url += `&category_id=${encodeURIComponent(categoryId)}`;
    }
    try {
      const text = await this.fetchTextUniversal(url);
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        return data.map(item => {
          const ext = item.container_extension || 'mp4';
          const streamUrl = `${cleanServer}/movie/${username}/${password}/${item.stream_id}.${ext}`;
          return {
            id: 'vod_' + item.stream_id,
            stream_id: item.stream_id,
            name: item.name || item.title || 'Película',
            title: item.title || item.name,
            year: item.year || '',
            rating: item.rating ? Number(item.rating).toFixed(1) : (item.rating_5based ? (Number(item.rating_5based) * 2).toFixed(1) : ''),
            logo: item.stream_icon || '',
            cover: item.stream_icon || '',
            backdrop: item.stream_icon || '',
            group: item.category_name || 'Películas',
            category_id: String(item.category_id || ''),
            plot: item.plot || 'Sin descripción disponible.',
            cast: item.cast || '',
            director: item.director || '',
            genre: item.genre || '',
            duration: item.episode_run_time ? `${item.episode_run_time} min` : '',
            extension: ext,
            type: 'vod',
            url: streamUrl
          };
        });
      }
      return [];
    } catch (e) {
      console.warn('[IPTV] Error al obtener películas VOD:', e);
      return [];
    }
  }

  // Fetch Series Categories from Xtream Player API
  async fetchSeriesCategories(server, username, password) {
    let cleanServer = server.replace(/\/+$/, '');
    if (!cleanServer.startsWith('http://') && !cleanServer.startsWith('https://')) {
      cleanServer = 'http://' + cleanServer;
    }
    const url = `${cleanServer}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_series_categories`;
    try {
      const text = await this.fetchTextUniversal(url);
      const data = JSON.parse(text);
      if (Array.isArray(data)) return data;
      return [];
    } catch (e) {
      console.warn('[IPTV] Error al obtener categorías de series:', e);
      return [];
    }
  }

  // Fetch Series Streams (optionally filtered by category)
  async fetchSeriesStreams(server, username, password, categoryId = null) {
    let cleanServer = server.replace(/\/+$/, '');
    if (!cleanServer.startsWith('http://') && !cleanServer.startsWith('https://')) {
      cleanServer = 'http://' + cleanServer;
    }
    let url = `${cleanServer}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_series`;
    if (categoryId && categoryId !== 'all' && categoryId !== 'Todos') {
      url += `&category_id=${encodeURIComponent(categoryId)}`;
    }
    try {
      const text = await this.fetchTextUniversal(url);
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        return data.map(item => {
          return {
            id: 'series_' + item.series_id,
            series_id: item.series_id,
            name: item.name || item.title || 'Serie',
            title: item.title || item.name,
            year: item.year || '',
            rating: item.rating ? Number(item.rating).toFixed(1) : '',
            logo: item.cover || '',
            cover: item.cover || '',
            backdrop: Array.isArray(item.backdrop_path) && item.backdrop_path[0] ? item.backdrop_path[0] : (item.cover || ''),
            group: item.category_name || 'Series',
            category_id: String(item.category_id || ''),
            plot: item.plot || 'Sin descripción disponible.',
            cast: item.cast || '',
            director: item.director || '',
            genre: item.genre || '',
            type: 'series'
          };
        });
      }
      return [];
    } catch (e) {
      console.warn('[IPTV] Error al obtener series:', e);
      return [];
    }
  }

  // Fetch Detailed Series Info with Seasons & Episodes
  async fetchSeriesInfo(server, username, password, seriesId) {
    let cleanServer = server.replace(/\/+$/, '');
    if (!cleanServer.startsWith('http://') && !cleanServer.startsWith('https://')) {
      cleanServer = 'http://' + cleanServer;
    }
    const url = `${cleanServer}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_series_info&series_id=${encodeURIComponent(seriesId)}`;
    try {
      const text = await this.fetchTextUniversal(url);
      const data = JSON.parse(text);
      const episodesMap = data.episodes || {};

      const formattedSeasons = [];
      const seasonNumbers = Object.keys(episodesMap).sort((a, b) => Number(a) - Number(b));

      seasonNumbers.forEach(sNum => {
        const rawEps = episodesMap[sNum] || [];
        const eps = rawEps.map(ep => {
          const ext = ep.container_extension || 'mp4';
          const epUrl = `${cleanServer}/series/${username}/${password}/${ep.id}.${ext}`;
          return {
            id: 'ep_' + ep.id,
            episode_id: ep.id,
            episode_num: ep.episode_num || '',
            season: ep.season || sNum,
            title: ep.title || `Episodio ${ep.episode_num}`,
            name: ep.title || `Episodio ${ep.episode_num}`,
            cover: ep.info?.movie_image || '',
            duration: ep.info?.duration || (ep.info?.duration_secs ? `${Math.round(ep.info.duration_secs / 60)} min` : ''),
            plot: ep.info?.plot || '',
            rating: ep.info?.rating || '',
            url: epUrl,
            extension: ext,
            type: 'episode'
          };
        });

        formattedSeasons.push({
          seasonNumber: sNum,
          name: `Temporada ${sNum}`,
          episodes: eps
        });
      });

      return {
        info: data.info || {},
        seasons: formattedSeasons
      };
    } catch (e) {
      console.warn('[IPTV] Error al obtener detalles de la serie:', e);
      return { info: {}, seasons: [] };
    }
  }

  // Track Offline/Dead Channels
  markChannelDead(url) {
    if (!url) return;
    let dead = [];
    try {
      dead = JSON.parse(sessionStorage.getItem(this.deadChannelsKey)) || [];
    } catch {}
    if (!dead.includes(url)) {
      dead.push(url);
      sessionStorage.setItem(this.deadChannelsKey, JSON.stringify(dead));
    }
  }

  isChannelDead(url) {
    try {
      const dead = JSON.parse(sessionStorage.getItem(this.deadChannelsKey)) || [];
      return dead.includes(url);
    } catch {
      return false;
    }
  }
}

if (typeof window !== 'undefined') {
  window.IPTVDataService = IPTVDataService;
}