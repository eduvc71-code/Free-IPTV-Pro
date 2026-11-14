// =========================================================
// Free-IPTV Pro - Main Application Controller
// Dual Mode Architecture (Modo A: Free vs Modo B: Privadas)
// 3-Column Landscape TV & Mobile Responsive Virtual Engine
// =========================================================
const APP_VERSION = 'v1.0.23';

let playerManager;
let dataService;

// Application State
let currentAppMode = 'A'; // 'A' = Free/Public, 'B' = Private (Xtream/M3U)
let activeTab = 'home';
let americasCountries = [];
let currentCountry = null;

// Channels & Virtual Pagination State
let modeAChannels = [];
let modeBChannels = [];
let allChannels = [];
let activeCategoriesMap = {};
let activeCategoriesList = [];
let currentSelectedCategory = 'Todos';

// Content Type State (Modo B: En Vivo vs Películas vs Series)
let currentContentType = 'live'; // 'live' | 'vod' | 'series'
let currentActiveAccount = null;
let vodCategories = [];
let seriesCategories = [];
let currentVodItem = null;
let currentSeriesItem = null;
let currentSeriesInfo = null;
let currentSeriesSeasons = [];
let selectedSeasonNum = null;

// Virtual Lazy Rendering Pagination
let displayedChannelCount = 0;
const PAGE_SIZE = 40;
let currentRenderedList = [];

document.addEventListener('DOMContentLoaded', async () => {
  playerManager = new VideoPlayerManager();
  dataService = new IPTVDataService();

  // Exponer instancias al window para uso global (botón Atrás, eventos inline, etc.)
  window.playerManager = playerManager;
  window.dataService = dataService;

  // Eliminar completamente registros de historial reciente
  try {
    localStorage.removeItem('free_iptv_history_v2');
    localStorage.removeItem('free_iptv_history');
  } catch (e) {}

  initNavigation();
  initSearch();
  initSleepTimerModal();
  initXtreamSmartParser();
  initTVRemoteControl();
  initVirtualScrollListeners();

  // Load Auto-play switch state
  const isAuto = isAutoplayEnabled();
  const mobAuto = document.getElementById('toggle-autoplay');
  const tvAuto = document.getElementById('tv-toggle-autoplay');
  if (mobAuto) mobAuto.checked = isAuto;
  if (tvAuto) tvAuto.checked = isAuto;

  // FASE 6 + FASE 1: Configurar handler del botón Atrás (Back) para Android TV / Fire TV
  window.tvNavigation.onBack = () => {
    const playerContainer = document.getElementById('player-container');
    const isFullscreen = playerContainer && playerContainer.classList.contains('fullscreen-player');
    const hasActivePlayback = window.playerManager && window.playerManager.currentChannel;

    // 1. Si hay reproducción de TV en vivo activa ➡️ detener señal y volver al menú principal
    if (hasActivePlayback && typeof window.returnToMainMenu === 'function') {
      window.returnToMainMenu();
      return;
    }

    // 2. Si está en pantalla completa sin reproducción activa ➡️ salir al menú
    if (isFullscreen && window.playerManager) {
      window.playerManager.exitFullscreenMode();
      return;
    }

    // 3. Si está en una categoría de TV (no home) ➡️ volver al selector de categorías/home
    if (window.activeTab && window.activeTab !== 'home' && typeof window.switchTab === 'function') {
      window.switchTab('home');
      return;
    }

    // 4. Si está en pantalla principal sin reproducción ➡️ solicitar confirmación de salida
    if (typeof window.confirmExitApp === 'function') {
      window.confirmExitApp();
    } else if (typeof navigator.app === 'object' && typeof navigator.app.exitApp === 'function') {
      navigator.app.exitApp();
    }
  };

  // FASE 7: Marcar contenedores como "scrolling" para que MemoryManager no limpie durante scroll activo
  const origScrollHandler = window.initVirtualScrollListeners;
  if (typeof origScrollHandler === 'function') {
    // Se envuelve después de que se defina; se hace abajo en initVirtualScrollListeners
  }

  // Cero residuos: Limpiar caché y datos previos en instalaciones nuevas para garantizar inicio limpio sin canales precargados
  if (!localStorage.getItem('free_iptv_clean_start_v4')) {
    localStorage.removeItem('free_iptv_imported_countries');
    localStorage.removeItem('free_iptv_active_account');
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('free_iptv_') || k.startsWith('countries_') || k.startsWith('playlist_') || k.startsWith('xtream_')) {
          if (k !== 'free_iptv_legal_accepted' && k !== 'free_iptv_app_mode') {
            localStorage.removeItem(k);
          }
        }
      });
      sessionStorage.clear();
    } catch (e) {}
    localStorage.setItem('free_iptv_clean_start_v4', 'true');
  }

  // Load countries catalog for Mode A
  await loadAmericasCountries();

  // Check Legal Disclaimer acceptance
  const isLegalAccepted = localStorage.getItem('free_iptv_legal_accepted') === 'true';
  if (!isLegalAccepted) {
    showLegalDisclaimerModal();
  }

  // Restore saved App Mode (Default: A)
  const savedMode = localStorage.getItem('free_iptv_app_mode') || 'A';
  await switchAppMode(savedMode, false);
});

// =========================================================
// DUAL MODE ARCHITECTURE (Modo A vs Modo B Isolation)
// =========================================================
async function switchAppMode(mode, userInitiated = true) {
  if (mode !== 'A' && mode !== 'B') mode = 'A';
  currentAppMode = mode;
  localStorage.setItem('free_iptv_app_mode', mode);

  // Update Buttons in Mobile and TV Header
  const btnA = document.getElementById('mode-btn-a');
  const btnB = document.getElementById('mode-btn-b');
  const tvBtnA = document.getElementById('tv-mode-btn-a');
  const tvBtnB = document.getElementById('tv-mode-btn-b');

  const isModeA = (mode === 'A');

  if (btnA) {
    btnA.className = `flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${isModeA ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`;
  }
  if (btnB) {
    btnB.className = `flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${!isModeA ? 'bg-yellow-600 text-white shadow' : 'text-gray-400 hover:text-white'}`;
  }
  if (tvBtnA) {
    tvBtnA.className = `px-3 py-1 rounded-lg font-bold transition flex items-center gap-1.5 ${isModeA ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`;
  }
  if (tvBtnB) {
    tvBtnB.className = `px-3 py-1 rounded-lg font-bold transition flex items-center gap-1.5 ${!isModeA ? 'bg-yellow-600 text-white' : 'text-gray-400 hover:text-white'}`;
  }

  // Show / Hide Content Type Switcher (En Vivo vs Películas vs Series)
  const contentTypeBar = document.getElementById('content-type-bar');
  const tvContentTypeBar = document.getElementById('tv-content-type-bar');
  if (contentTypeBar) {
    if (isModeA) {
      contentTypeBar.classList.add('hidden');
      contentTypeBar.classList.remove('flex');
    } else {
      contentTypeBar.classList.remove('hidden');
      contentTypeBar.classList.add('flex');
    }
  }
  if (tvContentTypeBar) {
    if (isModeA) {
      tvContentTypeBar.classList.add('hidden');
      tvContentTypeBar.classList.remove('flex');
    } else {
      tvContentTypeBar.classList.remove('hidden');
      tvContentTypeBar.classList.add('flex');
    }
  }
  if (isModeA) {
    currentContentType = 'live';
    window.currentContentType = 'live';
    document.body.classList.remove('vod-mode');
    updateContentTypeButtons();
  }

  // STOP and CLEAR current playback when switching modes (Total Isolation)
  if (playerManager) {
    if (playerManager.hls) {
      try { playerManager.hls.destroy(); } catch (e) {}
      playerManager.hls = null;
    }
    if (playerManager.video) {
      playerManager.video.pause();
      playerManager.video.removeAttribute('src');
      playerManager.video.load();
    }
    playerManager.currentChannel = null;
  }

  const titleEl = document.getElementById('current-country-title');

  if (isModeA) {
    // ---- MODO A: CANALES PÚBLICOS / FREE ----
    if (userInitiated) showToast("🌎 Modo A: Canales Públicos y Gratuitos");
    const importedJson = localStorage.getItem('free_iptv_imported_countries');
    let importedCodes = [];
    try { importedCodes = JSON.parse(importedJson || '[]'); } catch {}

    if (importedCodes && importedCodes.length > 0) {
      await loadImportedCountries(importedCodes);
    } else {
      renderNoChannelsState('A');
    }
  } else {
    // ---- MODO B: MIS LISTAS PRIVADAS (XTREAM / M3U) ----
    if (userInitiated) showToast("🔑 Modo B: Mis Listas Privadas (Xtream / M3U)");
    
    // Check if there is an active Xtream account or saved playlist
    const savedAccounts = dataService.getSavedAccounts();
    const savedPlaylists = dataService.getCustomPlaylists();

    if (savedAccounts.length > 0) {
      await loadAccountChannelsDirect(savedAccounts[0]);
    } else if (savedPlaylists.length > 0) {
      await loadSavedPlaylistByIndex(0);
    } else {
      renderNoChannelsState('B');
      switchTab('xtream');
    }
  }
}

function openCurrentModeSelector() {
  if (currentAppMode === 'A') {
    openCountrySelectorModal();
  } else {
    switchTab('xtream');
  }
}

async function refreshActiveModeList() {
  if (currentAppMode === 'A') {
    await refreshFreePlaylists();
  } else {
    const savedAccounts = dataService.getSavedAccounts();
    if (savedAccounts.length > 0) {
      showToast("Actualizando canales del servidor privado... 🔄");
      await quickConnectAccount(0, true);
    } else {
      switchTab('xtream');
      showToast("Conecta tu cuenta Xtream o carga una lista.");
    }
  }
}

// Clean Empty State when no list is loaded in the active mode
function renderNoChannelsState(mode = currentAppMode) {
  allChannels = [];
  activeCategoriesMap = {};
  activeCategoriesList = [];
  currentSelectedCategory = 'Todos';

  const titleEl = document.getElementById('current-country-title');
  const catContainer = document.getElementById('categories-container');
  const tvCatList = document.getElementById('tv-categories-list');
  const container = document.getElementById('channels-list');
  const tvContainer = document.getElementById('tv-channels-list');

  if (catContainer) catContainer.innerHTML = '';
  if (tvCatList) tvCatList.innerHTML = '';
  if (tvContainer) tvContainer.innerHTML = '';

  if (mode === 'A') {
    if (titleEl) titleEl.innerHTML = `<span>🌎 Sin países importados</span>`;
    if (container) {
      container.innerHTML = `
        <div class="p-8 text-center flex flex-col items-center justify-center my-6">
          <div class="w-14 h-14 rounded-3xl bg-blue-600/15 border border-blue-500/25 flex items-center justify-center text-blue-400 text-2xl mb-3 shadow-xl">
            <i class="fa-solid fa-earth-americas"></i>
          </div>
          <h3 class="text-sm font-bold text-gray-100 mb-1">Modo A: Canales Públicos</h3>
          <p class="text-xs text-gray-400 max-w-xs mb-5 leading-relaxed">
            No hay canales precargados por defecto. Selecciona los países que deseas importar para disfrutar de señales abiertas.
          </p>
          <button onclick="openCountrySelectorModal()" class="w-full max-w-xs py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-blue-600/30 active:scale-95 flex items-center justify-center gap-2">
            <i class="fa-solid fa-earth-americas"></i> Seleccionar Países a Importar
          </button>
        </div>
      `;
    }
  } else {
    if (titleEl) titleEl.innerHTML = `<span>🔑 Sin lista privada</span>`;
    if (container) {
      container.innerHTML = `
        <div class="p-8 text-center flex flex-col items-center justify-center my-6">
          <div class="w-14 h-14 rounded-3xl bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center text-yellow-400 text-2xl mb-3 shadow-xl">
            <i class="fa-solid fa-key"></i>
          </div>
          <h3 class="text-sm font-bold text-gray-100 mb-1">Modo B: Mis Listas Privadas</h3>
          <p class="text-xs text-gray-400 max-w-xs mb-5 leading-relaxed">
            Conecta tu panel Xtream Codes o carga tu lista M3U externa para sintonizar tus canales privados.
          </p>
          <button onclick="switchTab('xtream')" class="w-full max-w-xs py-3 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-yellow-600/30 active:scale-95 flex items-center justify-center gap-2">
            <i class="fa-solid fa-key"></i> Conectar Cuenta Xtream / M3U
          </button>
        </div>
      `;
    }
  }

  if (playerManager) {
    playerManager.showIdleState(mode === 'A' ? "Modo A: Canales Libres" : "Modo B: Lista Privada", 0);
  }
}

// =========================================================
// HIGH-PERFORMANCE CATEGORY-FIRST ENGINE & DATA MAPPING
// =========================================================
function setAppChannelsData(channels, sourceTitle = '') {
  allChannels = channels || [];

  if (allChannels.length === 0) {
    renderNoChannelsState(currentAppMode);
    return;
  }

  // 1. Build Instant O(1) Category Index
  const grouped = dataService.groupChannelsByCategory(allChannels);
  activeCategoriesMap = grouped.map;

  // Sort categories alphabetically or keep original order
  activeCategoriesList = grouped.categories;

  // 2. Select initial category:
  // If "CHILE" is present, default to it; otherwise default to the first category with channels
  let initialCat = 'Todos';
  const chileMatch = activeCategoriesList.find(c => c.name.toUpperCase().includes('CHILE'));
  if (chileMatch) {
    initialCat = chileMatch.name;
  } else if (activeCategoriesList.length > 0) {
    initialCat = activeCategoriesList[0].name;
  }

  currentSelectedCategory = initialCat;

  // 3. Update Title & Badges
  const titleEl = document.getElementById('current-country-title');
  if (titleEl && sourceTitle) {
    titleEl.innerHTML = sourceTitle;
  }

  // 4. Render Categories in Mobile Slider & TV Column 1
  renderCategoriesUI();

  // 5. Render Channels for the selected category (Immediate, 0ms lag!)
  selectCategory(currentSelectedCategory);

  // Auto-play only if enabled by user
  if (isAutoplayEnabled() && activeCategoriesMap[currentSelectedCategory]?.length > 0) {
    playSelectedChannel(activeCategoriesMap[currentSelectedCategory][0]);
  } else if (!playerManager.currentChannel) {
    playerManager.showIdleState(currentSelectedCategory, activeCategoriesMap[currentSelectedCategory]?.length || allChannels.length);
  }
}

// Render Categories UI in both Mobile Horizontal Slider & TV Column 1
function renderCategoriesUI() {
  const catContainer = document.getElementById('categories-container');
  const tvCatList = document.getElementById('tv-categories-list');

  // Mobile Horizontal Slider
  if (catContainer) {
    catContainer.innerHTML = '';
    
    // "Todos" chip
    const allBtn = document.createElement('button');
    allBtn.className = `category-pill px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap transition ${currentSelectedCategory === 'Todos' ? 'bg-blue-600 text-white active' : 'bg-gray-900 text-gray-300 border border-gray-800'}`;
    allBtn.innerText = `Todos (${allChannels.length})`;
    allBtn.onclick = () => selectCategory('Todos');
    catContainer.appendChild(allBtn);

    activeCategoriesList.forEach(cat => {
      const btn = document.createElement('button');
      const isAct = currentSelectedCategory === cat.name;
      btn.className = `category-pill px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap transition ${isAct ? 'bg-blue-600 text-white active' : 'bg-gray-900 text-gray-300 border border-gray-800'}`;
      btn.innerText = `${cat.name} (${cat.count})`;
      btn.onclick = () => selectCategory(cat.name);
      catContainer.appendChild(btn);
    });
  }

  // TV Landscape 3-Column Pane (Col 1)
  if (tvCatList) {
    tvCatList.innerHTML = '';

    // "Todos" item
    const tvAll = document.createElement('div');
    tvAll.className = `tv-cat-item ${currentSelectedCategory === 'Todos' ? 'active' : ''}`;
    tvAll.tabIndex = 0;
    tvAll.innerHTML = `<span>Todos</span> <span class="text-[10px] text-gray-400 bg-black/40 px-1.5 py-0.5 rounded font-mono">${allChannels.length}</span>`;
    tvAll.onclick = () => selectCategory('Todos');
    tvAll.onkeydown = (e) => { if (e.key === 'Enter') selectCategory('Todos'); };
    tvCatList.appendChild(tvAll);

    activeCategoriesList.forEach(cat => {
      const item = document.createElement('div');
      item.className = `tv-cat-item ${currentSelectedCategory === cat.name ? 'active' : ''}`;
      item.tabIndex = 0;
      item.innerHTML = `
        <span class="truncate mr-2">${cat.name}</span>
        <span class="text-[10px] text-gray-400 bg-black/40 px-1.5 py-0.5 rounded font-mono flex-shrink-0">${cat.count}</span>
      `;
      item.onclick = () => selectCategory(cat.name);
      item.onkeydown = (e) => { if (e.key === 'Enter') selectCategory(cat.name); };
      tvCatList.appendChild(item);
    });
  }
}

// Category Selection with High-Performance Rendering
function selectCategory(catName) {
  currentSelectedCategory = catName;

  // Highlight in Mobile
  document.querySelectorAll('.category-pill').forEach(p => {
    const isAct = (catName === 'Todos' && p.innerText.startsWith('Todos')) || p.innerText.startsWith(catName + ' (');
    p.classList.toggle('active', isAct);
    p.classList.toggle('bg-blue-600', isAct);
    p.classList.toggle('text-white', isAct);
    p.classList.toggle('bg-gray-900', !isAct);
    p.classList.toggle('text-gray-300', !isAct);
  });

  // Highlight in TV Pane
  document.querySelectorAll('.tv-cat-item').forEach(el => {
    const isAct = (catName === 'Todos' && el.querySelector('span')?.innerText === 'Todos') || 
                  (el.querySelector('span')?.innerText === catName);
    el.classList.toggle('active', isAct);
  });

  // Update TV Category Badge
  const tvBadge = document.getElementById('tv-category-badge');
  if (tvBadge) {
    const count = (catName === 'Todos') ? allChannels.length : (activeCategoriesMap[catName]?.length || 0);
    tvBadge.innerText = `${catName} (${count})`;
  }

  // Filter list
  const filtered = (catName === 'Todos') ? allChannels : (activeCategoriesMap[catName] || []);
  currentRenderedList = filtered;
  displayedChannelCount = 0;

  // Clear and render first page (40 channels = ~1ms execution time)
  const container = document.getElementById('channels-list');
  const tvContainer = document.getElementById('tv-channels-list');
  if (container) container.innerHTML = '';
  if (tvContainer) tvContainer.innerHTML = '';

  renderNextChannelBatch();
}

// Virtual Lazy Append (Appends 40 channels at a time on scroll)
function renderNextChannelBatch() {
  if (!currentRenderedList || currentRenderedList.length === 0) {
    renderEmptyFilteredMessage();
    return;
  }

  const nextBatch = currentRenderedList.slice(displayedChannelCount, displayedChannelCount + PAGE_SIZE);
  if (nextBatch.length === 0) return;

  const container = document.getElementById('channels-list');
  const tvContainer = document.getElementById('tv-channels-list');

  const isGrid = (currentContentType !== 'live');
  const containerClass = isGrid ? 'flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-3' : 'flex-1 overflow-y-auto p-2 space-y-1.5';

  if (container) container.className = containerClass;
  if (tvContainer) tvContainer.className = containerClass;

  nextBatch.forEach((item, idx) => {
    const absoluteIdx = displayedChannelCount + idx + 1;
    let cardMob, cardTv;

    if (currentContentType === 'vod') {
      cardMob = createVodCardElement(item, absoluteIdx, false);
      cardTv = createVodCardElement(item, absoluteIdx, true);
    } else if (currentContentType === 'series') {
      cardMob = createSeriesCardElement(item, absoluteIdx, false);
      cardTv = createSeriesCardElement(item, absoluteIdx, true);
    } else {
      cardMob = createChannelCardElement(item, absoluteIdx, false);
      cardTv = createChannelCardElement(item, absoluteIdx, true);
    }

    if (container) container.appendChild(cardMob);
    if (tvContainer) tvContainer.appendChild(cardTv);
  });

  displayedChannelCount += nextBatch.length;
}

function renderEmptyFilteredMessage() {
  const container = document.getElementById('channels-list');
  const tvContainer = document.getElementById('tv-channels-list');
  let typeLabel = 'canales';
  let icon = 'fa-satellite-dish';
  if (currentContentType === 'vod') {
    typeLabel = 'películas';
    icon = 'fa-film';
  } else if (currentContentType === 'series') {
    typeLabel = 'series';
    icon = 'fa-clapperboard';
  }

  const html = `
    <div class="p-8 text-center text-gray-500 text-xs">
      <i class="fa-solid ${icon} text-3xl mb-2 opacity-40"></i>
      <p class="font-bold text-gray-300">No hay ${typeLabel} en esta categoría</p>
      <p class="text-[11px] text-gray-500 mt-1">Selecciona otra categoría o usa el buscador.</p>
    </div>
  `;
  if (container) container.innerHTML = html;
  if (tvContainer) tvContainer.innerHTML = html;
}

// Reusable Channel Card DOM Creator
function createChannelCardElement(ch, numberIndex, isTvLayout = false) {
  const card = document.createElement('div');
  const isFav = dataService.isFavorite(ch);
  const isPlaying = playerManager.currentChannel && (playerManager.currentChannel.url === ch.url || playerManager.currentChannel.id === ch.id);
  const isDead = dataService.isChannelDead(ch.url);

  card.id = `card-${ch.id}`;
  card.className = `channel-card p-2.5 flex items-center justify-between cursor-pointer ${isPlaying ? 'active' : ''} ${isDead ? 'opacity-50' : ''}`;
  card.setAttribute('tabindex', '0');

  card.onclick = (e) => {
    if (e.target.closest('.fav-btn')) return;
    playSelectedChannel(ch);
  };
  card.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      playSelectedChannel(ch);
    }
  };

  const channelNum = ch.num || numberIndex;

  const logoHtml = ch.logo
    ? `<img src="${ch.logo}" class="w-8 h-8 object-contain rounded-lg bg-black/40 p-0.5 flex-shrink-0" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-500 text-xs\\'><i class=\\'fa-solid fa-tv\\'></i></div>';">`
    : `<div class="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-500 text-xs flex-shrink-0"><i class="fa-solid fa-tv"></i></div>`;

  const eqHtml = isPlaying ? `
    <div class="equalizer-wave">
      <div class="equalizer-bar"></div>
      <div class="equalizer-bar"></div>
      <div class="equalizer-bar"></div>
      <div class="equalizer-bar"></div>
    </div>
  ` : '';

  card.innerHTML = `
    <div class="flex items-center gap-2.5 truncate flex-1 mr-1">
      <span class="text-[11px] font-mono font-bold text-gray-400 w-6 text-right flex-shrink-0">${channelNum}</span>
      <div class="relative flex-shrink-0">
        ${logoHtml}
      </div>
      <div class="truncate">
        <div class="flex items-center gap-1.5 truncate">
          <p class="text-xs font-bold text-gray-100 truncate">${ch.name}</p>
          ${eqHtml}
        </div>
        <span class="text-[10px] text-gray-400 truncate block">${ch.group || 'En Vivo'}</span>
      </div>
    </div>
    <button class="fav-btn p-1.5 text-gray-400 hover:text-yellow-400 active:scale-125 transition flex-shrink-0" onclick="toggleFav(event, '${ch.id}')" title="Favorito">
      <i class="${isFav ? 'fa-solid text-yellow-400' : 'fa-regular text-gray-400'} fa-star text-xs"></i>
    </button>
  `;

  return card;
}

// Scroll Listener for Virtual Infinite Pagination
function initVirtualScrollListeners() {
  const handleScroll = (el) => {
    if (!el) return;

    // FASE 7: Marcar como scrolling para evitar limpieza de DOM durante interacción
    if (window.memoryManager) {
      window.memoryManager.markScrolling(el.id || 'container', true);
      clearTimeout(el._scrollEndTimer);
      el._scrollEndTimer = setTimeout(() => {
        if (window.memoryManager) {
          window.memoryManager.markScrolling(el.id || 'container', false);
        }
      }, 150);
    }

    if (el.scrollHeight - el.scrollTop - el.clientHeight < 180) {
      if (displayedChannelCount < currentRenderedList.length) {
        renderNextChannelBatch();
      }
    }
  };

  const container = document.getElementById('channels-list');
  const tvContainer = document.getElementById('tv-channels-list');

  if (container) {
    container.addEventListener('scroll', () => handleScroll(container), { passive: true });
  }
  if (tvContainer) {
    tvContainer.addEventListener('scroll', () => handleScroll(tvContainer), { passive: true });
  }
}

// =========================================================
// MODO A: PAÍSES PÚBLICOS LOADERS
// =========================================================
async function loadImportedCountries(codes, forceRefresh = false) {
  showChannelsLoading(true);
  const cacheKey = 'countries_' + codes.slice().sort().join('_');
  const titleEl = document.getElementById('current-country-title');

  // 1. Instant Cache Load (0ms)
  if (!forceRefresh) {
    const cached = await dataService.getCachedChannels(cacheKey);
    if (cached && cached.length > 0) {
      modeAChannels = cached;
      showChannelsLoading(false);
      setAppChannelsData(modeAChannels, `🌎 <span>${codes.length} Países (${modeAChannels.length} canales)</span>`);
      showToast(`⚡ ${modeAChannels.length} canales cargados desde memoria.`);
      return;
    }
  }

  if (titleEl) {
    titleEl.innerHTML = `<span>⏳ Descargando listas online...</span>`;
  }

  let rawChannels = [];
  for (const code of codes) {
    const country = americasCountries.find(c => c.code === code);
    if (!country) continue;

    let content = null;
    const candidateUrls = [
      `https://iptv-org.github.io/iptv/countries/${country.code.toLowerCase()}.m3u`,
      country.url,
      country.fallbackUrl
    ].filter(Boolean);

    for (const fetchUrl of candidateUrls) {
      try {
        content = await dataService.fetchTextUniversal(fetchUrl);
        if (content && (content.includes('#EXTM3U') || content.includes('#EXTINF'))) {
          break;
        }
      } catch (err) {}
    }

    if (!content) {
      try {
        const localPath = country.localPath || `data/playlists/${country.code.toLowerCase()}.m3u`;
        const resp = await fetch(localPath);
        if (resp.ok) content = await resp.text();
      } catch {}
    }

    if (content) {
      const parsed = dataService.parseM3U(content, country.name);
      const validStreams = parsed.filter(ch => ch.url && (ch.url.startsWith('http://') || ch.url.startsWith('https://')));
      rawChannels.push(...validStreams);
    }
  }

  if (rawChannels.length === 0) {
    showChannelsLoading(false);
    renderNoChannelsState('A');
    showToast("No se encontraron canales en los países seleccionados.");
    return;
  }

  // Progressive Verification
  showToast(`Verificando señales en vivo... 🛰️`);
  if (titleEl) {
    titleEl.innerHTML = `<span>🛰️ Verificando señales...</span>`;
  }

  await dataService.filterActiveStreamsProgressive(
    rawChannels,
    (firstBatch) => {
      // First 10 working channels immediately!
      modeAChannels = firstBatch;
      showChannelsLoading(false);
      setAppChannelsData(modeAChannels, `🌎 <span>${firstBatch.length} canales listos (cargando más...)</span>`);
      showToast("🎉 ¡Primeros canales listos! Toca para reproducir... 🍿");
    },
    (currentList, checked, total, isDone) => {
      modeAChannels = currentList;
      if (isDone) {
        dataService.setCachedChannels(cacheKey, currentList);
        setAppChannelsData(modeAChannels, `🌎 <span>${codes.length} Países (${currentList.length} activos)</span>`);
        showToast(`✅ Grilla completa: ${currentList.length} canales activos guardados.`);
      }
    }
  );

  showChannelsLoading(false);
  if (modeAChannels.length === 0) {
    renderNoChannelsState('A');
  }
}

// Load Americas Countries Catalog
async function loadAmericasCountries() {
  try {
    const res = await fetch('data/americas_countries.json?v=' + Date.now());
    americasCountries = await res.json();
    renderCountriesGrid(americasCountries);
  } catch (e) {
    console.error("Error loading countries", e);
  }
}

function renderCountriesGrid(countries) {
  const grid = document.getElementById('countries-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const query = (document.getElementById('countries-search-input')?.value || '').toLowerCase().trim();
  const filtered = query
    ? countries.filter(c => c.name.toLowerCase().includes(query) || c.code.toLowerCase().includes(query))
    : countries;

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="col-span-2 p-8 text-center text-gray-400 text-xs"><p>No se encontraron países.</p></div>`;
    return;
  }

  filtered.forEach(c => {
    const card = document.createElement('div');
    const isCurrent = currentCountry && currentCountry.code === c.code;
    card.className = `flex items-center gap-3 p-3 bg-gray-900 border ${isCurrent ? 'border-blue-500 bg-blue-500/10' : 'border-gray-800'} rounded-2xl active:scale-95 transition cursor-pointer`;
    card.onclick = () => {
      switchAppMode('A');
      selectSingleCountry(c);
      switchTab('home');
    };
    card.innerHTML = `
      <span class="text-2xl">${c.flag}</span>
      <div class="truncate flex-1">
        <p class="text-xs font-bold text-gray-100 truncate">${c.name}</p>
        <span class="text-[10px] text-gray-400 font-semibold">${c.code}</span>
      </div>
    `;
    grid.appendChild(card);
  });
}

function filterCountries() {
  renderCountriesGrid(americasCountries);
}

async function selectSingleCountry(country) {
  currentCountry = country;
  await loadImportedCountries([country.code]);
}

// Refresh Free Playlists Button Handler
async function refreshFreePlaylists() {
  const importedJson = localStorage.getItem('free_iptv_imported_countries');
  let codes = [];
  try { codes = JSON.parse(importedJson || '[]'); } catch {}

  if (!codes || codes.length === 0) {
    openCountrySelectorModal();
    showToast("Selecciona los países que deseas importar.");
    return;
  }

  showChannelsLoading(true);
  showToast("Actualizando señales públicas seleccionadas... 🔄");
  sessionStorage.removeItem('free_iptv_dead_channels');

  try {
    await loadAmericasCountries();
    await loadImportedCountries(codes, true);
  } catch (e) {
    showToast("Aviso: " + e.message);
  } finally {
    showChannelsLoading(false);
  }
}

// =========================================================
// MODO B: XTREAM CODES & LISTAS PRIVADAS ENGINE
// =========================================================
async function connectXtreamCodes() {
  let server = document.getElementById('xtream-host').value.trim();
  const port = document.getElementById('xtream-port')?.value.trim();
  const user = document.getElementById('xtream-user').value.trim();
  const pass = document.getElementById('xtream-pass').value.trim();
  let fmt = document.getElementById('xtream-fmt')?.value || 'm3u8';

  if (!server || !user || !pass) {
    alert("Por favor ingresa Servidor, Usuario y Contraseña");
    return;
  }

  server = server.replace(/\/+$/, '');
  if (port && !server.match(/:\d+$/)) {
    server = `${server}:${port}`;
  }

  const btn = document.getElementById('btn-xtream-connect');
  btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin mr-2"></i> Conectando al panel...`;
  btn.disabled = true;

  try {
    // Default format: m3u8 for full Android WebView HLS playback!
    const channels = await dataService.fetchXtreamPlaylist(server, user, pass, fmt);
    modeBChannels = channels;
    dataService.saveAccount(server, user, pass, fmt);
    
    const cacheKey = `xtream_${server}_${user}`;
    await dataService.setCachedChannels(cacheKey, channels);

    currentActiveAccount = { server, username: user, password: pass, format: fmt };
    localStorage.setItem('free_iptv_active_account', JSON.stringify(currentActiveAccount));
    currentContentType = 'live';
    window.currentContentType = 'live';
    document.body.classList.remove('vod-mode');
    updateContentTypeButtons();

    switchAppMode('B', false);
    setAppChannelsData(modeBChannels, `🔑 <span>Xtream (${user})</span>`);
    switchTab('home');

    showToast(`¡Conectado con éxito! ${modeBChannels.length} canales listos.`);
  } catch (e) {
    alert("Error al conectar con Xtream Codes: " + e.message);
  } finally {
    btn.innerHTML = `<i class="fa-solid fa-bolt"></i> Conectar y Cargar Canales`;
    btn.disabled = false;
  }
}

async function loadAccountChannelsDirect(acc, forceRefresh = false) {
  loadAccountToForm(acc);
  currentActiveAccount = acc;
  localStorage.setItem('free_iptv_active_account', JSON.stringify(currentActiveAccount));
  currentContentType = 'live';
  window.currentContentType = 'live';
  document.body.classList.remove('vod-mode');
  updateContentTypeButtons();

  const cacheKey = `xtream_${acc.server}_${acc.username}`;

  if (!forceRefresh) {
    const cached = await dataService.getCachedChannels(cacheKey);
    if (cached && cached.length > 0) {
      modeBChannels = cached;
      setAppChannelsData(modeBChannels, `🔑 <span>Xtream (${acc.username})</span>`);
      showToast(`⚡ ${modeBChannels.length} canales cargados desde memoria.`);
      return;
    }
  }

  await connectXtreamCodes();
}

function loadAccountToForm(acc) {
  if (!acc) return;
  const parsed = dataService.parseXtreamUrl(acc.server + '/get.php?user=' + acc.username + '&pass=' + acc.password);
  if (parsed) {
    document.getElementById('xtream-host').value = parsed.host;
    const portEl = document.getElementById('xtream-port');
    if (portEl) portEl.value = parsed.port || '';
  } else {
    document.getElementById('xtream-host').value = acc.server;
  }
  document.getElementById('xtream-user').value = acc.username;
  document.getElementById('xtream-pass').value = acc.password;
  if (document.getElementById('xtream-fmt')) {
    document.getElementById('xtream-fmt').value = acc.format || 'm3u8';
  }
}

async function quickConnectAccount(idx, forceRefresh = false) {
  const acc = dataService.getSavedAccounts()[idx];
  if (!acc) return;
  switchAppMode('B', false);
  await loadAccountChannelsDirect(acc, forceRefresh);
  switchTab('home');
}

function deleteAccount(idx) {
  const acc = dataService.getSavedAccounts()[idx];
  if (acc) {
    const cacheKey = `xtream_${acc.server}_${acc.username}`;
    dataService.clearCachedChannels(cacheKey);
  }
  dataService.deleteAccount(idx);
  renderSavedAccounts();
  showToast("Cuenta eliminada");
}

function renderSavedAccounts() {
  const accounts = dataService.getSavedAccounts();
  const container = document.getElementById('xtream-saved-accounts');
  if (!container) return;
  container.innerHTML = '';

  if (accounts.length === 0) {
    container.innerHTML = `<p class="text-[11px] text-gray-500 italic">No hay cuentas guardadas aún.</p>`;
    return;
  }

  accounts.forEach((acc, idx) => {
    const item = document.createElement('div');
    item.className = "flex items-center justify-between p-2.5 bg-gray-950 border border-gray-800 rounded-xl text-xs";
    item.innerHTML = `
      <div class="truncate cursor-pointer flex-1 mr-2" onclick="quickConnectAccount(${idx}, false)">
        <p class="font-bold text-gray-200 truncate">${acc.username} @ ${acc.server.replace(/^https?:\/\//, '')}</p>
        <span class="text-[10px] text-gray-500">Formato: ${(acc.format || 'm3u8').toUpperCase()}</span>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="quickConnectAccount(${idx}, false)" class="px-2.5 py-1 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg text-[10px] font-bold active:scale-95 transition">
          Entrar
        </button>
        <button onclick="quickConnectAccount(${idx}, true)" class="p-1 text-gray-400 hover:text-blue-400 active:scale-95 transition" title="Actualizar">
          <i class="fa-solid fa-rotate-right text-xs"></i>
        </button>
        <button onclick="deleteAccount(${idx})" class="p-1 text-gray-500 hover:text-red-400 active:scale-95 transition" title="Eliminar">
          <i class="fa-solid fa-trash-can text-xs"></i>
        </button>
      </div>
    `;
    container.appendChild(item);
  });
}

// Custom M3U Loader via URL
async function loadCustomM3UUrl() {
  const input = document.getElementById('custom-m3u-url');
  const url = input?.value.trim();
  if (!url || !url.startsWith('http')) {
    alert("Ingresa una URL válida que empiece por http:// o https://");
    return;
  }

  // Auto-detect Xtream in URL
  const xtreamParsed = dataService.parseXtreamUrl(url);
  if (xtreamParsed) {
    document.getElementById('xtream-host').value = xtreamParsed.host || xtreamParsed.server;
    const portEl = document.getElementById('xtream-port');
    if (portEl) portEl.value = xtreamParsed.port || '';
    document.getElementById('xtream-user').value = xtreamParsed.username;
    document.getElementById('xtream-pass').value = xtreamParsed.password;
    if (document.getElementById('xtream-fmt')) {
      document.getElementById('xtream-fmt').value = 'm3u8';
    }
    showToast("✨ Suscripción Xtream detectada. Conectando al panel...");
    await connectXtreamCodes();
    return;
  }

  const btn = document.getElementById('btn-load-m3u-url');
  if (btn) {
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin mr-1.5"></i> Conectando...`;
    btn.disabled = true;
  }
  showChannelsLoading(true);

  try {
    const text = await dataService.fetchTextUniversal(url);
    const parsed = dataService.parseM3U(text, 'M3U Externa');
    if (parsed.length === 0) {
      throw new Error("No se encontraron canales válidos en la lista.");
    }
    modeBChannels = parsed;

    const listName = url.split('/').pop().split('?')[0] || 'Lista Privada';
    dataService.saveCustomPlaylist(listName, url, modeBChannels.length);
    await dataService.setCachedChannels('playlist_' + url, modeBChannels);

    switchAppMode('B', false);
    setAppChannelsData(modeBChannels, `📁 <span>${listName}</span>`);
    switchTab('home');

    showToast(`¡Lista cargada y guardada! ${modeBChannels.length} canales.`);
  } catch (e) {
    alert("Error al cargar la lista: " + e.message + "\n\nTip: Puedes descargar el archivo .m3u y cargarlo con el botón 'Archivo Local'.");
  } finally {
    showChannelsLoading(false);
    if (btn) {
      btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-down mr-1"></i> Cargar por URL`;
      btn.disabled = false;
    }
  }
}

// Custom M3U Loader via Local File Picker (Zero CORS!)
function handleM3UFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  showChannelsLoading(true);

  reader.onload = async (e) => {
    try {
      const text = e.target.result;
      const parsed = dataService.parseM3U(text, file.name.replace(/\.[^/.]+$/, ""));
      if (parsed.length === 0) {
        alert("El archivo seleccionado no contiene canales M3U válidos.");
        return;
      }
      modeBChannels = parsed;
      dataService.saveCustomPlaylist(file.name, 'file://' + file.name, modeBChannels.length);
      await dataService.setCachedChannels('playlist_file://' + file.name, modeBChannels);

      switchAppMode('B', false);
      setAppChannelsData(modeBChannels, `📁 <span>${file.name}</span>`);
      switchTab('home');

      showToast(`¡Archivo local cargado! ${modeBChannels.length} canales.`);
    } catch (err) {
      alert("Error al procesar el archivo: " + err.message);
    } finally {
      showChannelsLoading(false);
    }
  };

  reader.onerror = () => {
    showChannelsLoading(false);
    alert("Error al leer el archivo del dispositivo.");
  };

  reader.readAsText(file);
}

function renderSavedCustomPlaylists() {
  const container = document.getElementById('custom-playlists-container');
  if (!container) return;
  const list = dataService.getCustomPlaylists();
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = `<p class="text-[11px] text-gray-500 italic">No tienes listas guardadas.</p>`;
    return;
  }

  list.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = "flex items-center justify-between p-2.5 bg-gray-950 border border-gray-800 rounded-xl text-xs";
    el.innerHTML = `
      <div class="truncate cursor-pointer flex-1 mr-2" onclick="loadSavedPlaylistByIndex(${idx}, false)">
        <p class="font-bold text-gray-200 truncate">${item.name}</p>
        <span class="text-[10px] text-gray-500">${item.channels || 0} canales • ${item.date}</span>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="loadSavedPlaylistByIndex(${idx}, false)" class="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-bold active:scale-95 transition">
          Ver
        </button>
        <button onclick="deleteCustomPlaylist(${idx})" class="p-1 text-gray-500 hover:text-red-400 active:scale-95 transition" title="Eliminar">
          <i class="fa-solid fa-trash-can text-xs"></i>
        </button>
      </div>
    `;
    container.appendChild(el);
  });
}

async function loadSavedPlaylistByIndex(idx, forceRefresh = false) {
  const item = dataService.getCustomPlaylists()[idx];
  if (!item) return;

  const cacheKey = `playlist_${item.url}`;
  if (!forceRefresh) {
    const cached = await dataService.getCachedChannels(cacheKey);
    if (cached && cached.length > 0) {
      modeBChannels = cached;
      switchAppMode('B', false);
      setAppChannelsData(modeBChannels, `📁 <span>${item.name}</span>`);
      switchTab('home');
      showToast(`⚡ ${modeBChannels.length} canales cargados desde memoria.`);
      return;
    }
  }

  if (item.url && item.url.startsWith('http')) {
    document.getElementById('custom-m3u-url').value = item.url;
    loadCustomM3UUrl();
  }
}

function deleteCustomPlaylist(idx) {
  const item = dataService.getCustomPlaylists()[idx];
  if (item) {
    dataService.clearCachedChannels('playlist_' + item.url);
  }
  dataService.deleteCustomPlaylist(idx);
  renderSavedCustomPlaylists();
  showToast("Lista eliminada");
}

// Smart Xtream URL Auto-Parser
function initXtreamSmartParser() {
  const smartInput = document.getElementById('xtream-smart-url');
  const handleInput = (inputEl) => {
    if (!inputEl) return;
    const val = inputEl.value.trim();
    if (val.length > 10) {
      const parsed = dataService.parseXtreamUrl(val);
      if (parsed) {
        document.getElementById('xtream-host').value = parsed.host || parsed.server;
        const portEl = document.getElementById('xtream-port');
        if (portEl) portEl.value = parsed.port || '';
        document.getElementById('xtream-user').value = parsed.username;
        document.getElementById('xtream-pass').value = parsed.password;
        if (document.getElementById('xtream-fmt')) {
          document.getElementById('xtream-fmt').value = 'm3u8';
        }
        showToast("✨ Enlace Xtream reconocido: Servidor, Puerto, Usuario y Clave listos");
        const alertBox = document.getElementById('xtream-auto-detected-badge');
        if (alertBox) alertBox.classList.remove('hidden');
      }
    }
  };

  if (smartInput) {
    smartInput.addEventListener('input', () => handleInput(smartInput));
    smartInput.addEventListener('paste', () => setTimeout(() => handleInput(smartInput), 80));
  }
}

// =========================================================
// PLAYBACK & SELECTION CONTROLLERS
// =========================================================
function playSelectedChannel(ch) {
  if (!ch) return;

  // Remove active highlight from all cards in both mobile and TV
  document.querySelectorAll('.channel-card').forEach(c => {
    c.classList.remove('active');
    const eq = c.querySelector('.equalizer-wave');
    if (eq) eq.remove();
  });

  // Highlight active cards
  document.querySelectorAll(`#card-${ch.id}`).forEach(activeCard => {
    activeCard.classList.add('active');
    const titleArea = activeCard.querySelector('.text-gray-100')?.parentElement;
    if (titleArea && !titleArea.querySelector('.equalizer-wave')) {
      const eq = document.createElement('div');
      eq.className = 'equalizer-wave';
      eq.innerHTML = '<div class="equalizer-bar"></div><div class="equalizer-bar"></div><div class="equalizer-bar"></div><div class="equalizer-bar"></div>';
      titleArea.appendChild(eq);
    }
  });

  playerManager.play(ch);
  updatePlayerFavIcon(ch);

  // Update TV Below-Player Panel
  const tvSub = document.getElementById('tv-hud-channel-subtitle');
  if (tvSub) {
    tvSub.innerText = `${ch.group || 'En Vivo'} • Señal HD`;
  }
}

function markChannelCardOffline(channelId) {
  document.querySelectorAll(`#card-${channelId}`).forEach(card => {
    card.classList.add('opacity-50');
    const badge = card.querySelector('.badge-live');
    if (badge) {
      badge.outerHTML = `<span class="text-[9px] font-bold text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded">OFFLINE</span>`;
    }
  });
}

function toggleFav(event, chId) {
  event.stopPropagation();
  let ch = allChannels.find(c => c.id === chId);
  if (!ch) {
    ch = dataService.getFavorites().find(c => c.id === chId || c.url === chId);
  }
  if (!ch) return;

  const added = dataService.toggleFavorite(ch);
  document.querySelectorAll(`#card-${ch.id} .fav-btn i`).forEach(btn => {
    btn.className = (added ? 'fa-solid text-yellow-400' : 'fa-regular text-gray-400') + ' fa-star text-xs';
  });

  if (playerManager.currentChannel && (playerManager.currentChannel.url === ch.url || playerManager.currentChannel.id === ch.id)) {
    updatePlayerFavIcon(ch);
  }

  showToast(added ? 'Agregado a favoritos ⭐' : 'Eliminado de favoritos');

  if (activeTab === 'favorites') {
    renderFavorites();
  }
}

function updatePlayerFavIcon(channel) {
  const isFav = dataService.isFavorite(channel);
  const icon = document.getElementById('btn-player-fav-icon');
  if (icon) {
    icon.className = (isFav ? 'fa-solid text-yellow-400 text-base' : 'fa-regular text-white text-base') + ' fa-star';
  }
}

function toggleCurrentPlayerFav() {
  if (!playerManager.currentChannel) return;
  const ch = playerManager.currentChannel;
  const added = dataService.toggleFavorite(ch);
  updatePlayerFavIcon(ch);
  showToast(added ? 'Agregado a favoritos ⭐' : 'Eliminado de favoritos');
}

// =========================================================
// MODO B: PELÍCULAS (VOD) Y SERIES XTREAM ENGINE
// =========================================================
function renderRecentRow() {
  // Historial eliminado a solicitud del usuario
}

function getActiveXtreamAccount() {
  if (currentActiveAccount && currentActiveAccount.server && currentActiveAccount.username) {
    return currentActiveAccount;
  }
  try {
    const saved = localStorage.getItem('free_iptv_active_account');
    if (saved) {
      currentActiveAccount = JSON.parse(saved);
      return currentActiveAccount;
    }
  } catch {}
  const accounts = dataService.getSavedAccounts();
  if (accounts.length > 0) {
    currentActiveAccount = accounts[0];
    return currentActiveAccount;
  }
  return null;
}

async function switchContentType(type) {
  if (type !== 'live' && type !== 'vod' && type !== 'series') type = 'live';
  currentContentType = type;
  window.currentContentType = type;
  updateContentTypeButtons();

  const isVodOrSeries = (type === 'vod' || type === 'series');
  document.body.classList.toggle('vod-mode', isVodOrSeries);

  // Al pasar a Películas o Series, detener y destruir inmediatamente cualquier reproducción de TV en vivo en segundo plano
  if (isVodOrSeries) {
    if (window.playerManager) {
      try {
        // CORRECCIÓN FASE 1: await explícito para garantizar detención completa antes de cargar VOD/Series
        await window.playerManager.stopPlayback();
        // Nota: se omite la llamada a stop() (método no existe en VideoPlayerManager)
        if (window.playerManager.video) {
          window.playerManager.video.pause();
          window.playerManager.video.removeAttribute('src');
          window.playerManager.video.load();
        }
        if (window.playerManager.hls) {
          window.playerManager.hls.destroy();
          window.playerManager.hls = null;
        }
      } catch (e) {}
    }
    if (window.exoPlayerPlugin && typeof window.exoPlayerPlugin.stop === 'function') {
      try { await window.exoPlayerPlugin.stop(); } catch (e) {}
    }
  }

  const titleEl = document.getElementById('current-country-title');

  if (type === 'live') {
    if (titleEl) {
      const acc = getActiveXtreamAccount();
      titleEl.innerHTML = acc ? `🔑 <span>Xtream (${acc.username}) - En Vivo</span>` : `🔑 <span>En Vivo</span>`;
    }
    setAppChannelsData(modeBChannels);
  } else if (type === 'vod') {
    loadVodContent();
  } else if (type === 'series') {
    loadSeriesContent();
  }

  // FASE 2: actualizar indicador de señal en vivo
  updateLiveSignalIndicator();
}

function updateContentTypeButtons() {
  const isLive = (currentContentType === 'live');
  const isVod = (currentContentType === 'vod');
  const isSeries = (currentContentType === 'series');

  // Mobile Buttons
  const btnLive = document.getElementById('btn-content-live');
  const btnVod = document.getElementById('btn-content-vod');
  const btnSeries = document.getElementById('btn-content-series');

  const activeMobileClass = "flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 bg-yellow-500 text-black shadow active:scale-95";
  const inactiveMobileClass = "flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 text-gray-400 hover:text-white active:scale-95";

  if (btnLive) btnLive.className = isLive ? activeMobileClass : inactiveMobileClass;
  if (btnVod) btnVod.className = isVod ? activeMobileClass : inactiveMobileClass;
  if (btnSeries) btnSeries.className = isSeries ? activeMobileClass : inactiveMobileClass;

  // TV Buttons
  const tvBtnLive = document.getElementById('tv-btn-content-live');
  const tvBtnVod = document.getElementById('tv-btn-content-vod');
  const tvBtnSeries = document.getElementById('tv-btn-content-series');

  const activeTvClass = "px-3 py-1 rounded-lg font-bold transition flex items-center gap-1.5 bg-yellow-500 text-black shadow";
  const inactiveTvClass = "px-3 py-1 rounded-lg font-bold transition flex items-center gap-1.5 text-gray-400 hover:text-white";

  if (tvBtnLive) tvBtnLive.className = isLive ? activeTvClass : inactiveTvClass;
  if (tvBtnVod) tvBtnVod.className = isVod ? activeTvClass : inactiveTvClass;
  if (tvBtnSeries) tvBtnSeries.className = isSeries ? activeTvClass : inactiveTvClass;
}

// =========================================================
// FASE 2: Indicador de señal en vivo activa en el header
// Muestra un badge "EN VIVO" cuando hay reproducción de TV en curso.
// =========================================================
function updateLiveSignalIndicator() {
  const indicator = document.getElementById('live-signal-indicator');
  if (!indicator) return;
  const isLiveActive =
    currentContentType === 'live' &&
    window.playerManager &&
    window.playerManager.currentChannel;
  if (isLiveActive) {
    indicator.classList.remove('hidden');
  } else {
    indicator.classList.add('hidden');
  }
}

// =========================================================
// FASE 2: Catálogo VOD / Series Profesional
// Grid de carteles responsivo con scroll vertical.
// =========================================================

/**
 * Renderiza el grid de películas VOD con diseño profesional
 * (carteles tipo Netflix con botón de reproducir overlay)
 */
function renderVodGrid(streams) {
  const container = document.getElementById('channels-list');
  const tvContainer = document.getElementById('tv-channels-list');

  const isTvLayout = window.innerWidth >= 760;
  const columnas = isTvLayout ? 5 : (window.innerWidth >= 576 ? 3 : 2);
  const gridClass = `vod-grid-container`;

  const html = streams.map((vod, idx) => {
    const poster = vod.cover || vod.logo || '';
    const nombre = vod.name || vod.title || 'Sin título';
    const año = vod.year || '';
    const genero = vod.group || 'Película';
    const streamId = vod.stream_id || idx;

    return `
      <div class="vod-poster-card" id="vod-${streamId}" tabindex="0">
        <div class="poster-wrapper">
          <img src="${poster}" 
               onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<div class=\\'poster-placeholder\\'><i class=\\'fa-solid fa-film\\'></i></div>';" 
               alt="${nombre}">
          <div class="poster-overlay">
            <button class="btn-play-poster" onclick="playVodItemFromGrid('${streamId}')" title="Reproducir">
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
  }).join('');

  if (container) {
    container.className = gridClass;
    container.innerHTML = html;
    // Asignar eventos onclick a cada tarjeta
    streams.forEach((vod, idx) => {
      const el = document.getElementById(`vod-${vod.stream_id || idx}`);
      if (el) {
        el.onclick = () => openVodDetailModal(vod);
        el.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            openVodDetailModal(vod);
          }
        };
      }
    });
  }

  if (tvContainer) {
    tvContainer.className = gridClass;
    tvContainer.innerHTML = html;
    streams.forEach((vod, idx) => {
      const el = document.getElementById(`vod-${vod.stream_id || idx}`);
      if (el) {
        el.onclick = () => openVodDetailModal(vod);
        el.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            openVodDetailModal(vod);
          }
        };
      }
    });
  }
}

/**
 * Renderiza el grid de Series con diseño profesional
 */
function renderSeriesGrid(streams) {
  const container = document.getElementById('channels-list');
  const tvContainer = document.getElementById('tv-channels-list');

  const isTvLayout = window.innerWidth >= 760;
  const columnas = isTvLayout ? 5 : (window.innerWidth >= 576 ? 3 : 2);
  const gridClass = `vod-grid-container`;

  const html = streams.map((serie, idx) => {
    const poster = serie.cover || serie.logo || '';
    const nombre = serie.name || serie.title || 'Sin título';
    const año = serie.year || '';
    const genero = serie.group || 'Serie';
    const seriesId = serie.series_id || idx;

    return `
      <div class="vod-poster-card" id="series-${seriesId}" tabindex="0">
        <div class="poster-wrapper">
          <img src="${poster}" 
               onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<div class=\\'poster-placeholder\\'><i class=\\'fa-solid fa-clapperboard\\'></i></div>';" 
               alt="${nombre}">
          <div class="poster-overlay">
            <button class="btn-play-poster" onclick="playSerieItemFromGrid('${seriesId}')" title="Ver detalles">
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
  }).join('');

  if (container) {
    container.className = gridClass;
    container.innerHTML = html;
    streams.forEach((serie, idx) => {
      const el = document.getElementById(`series-${serie.series_id || idx}`);
      if (el) {
        el.onclick = () => openSeriesDetailModal(serie);
        el.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            openSeriesDetailModal(serie);
          }
        };
      }
    });
  }

  if (tvContainer) {
    tvContainer.className = gridClass;
    tvContainer.innerHTML = html;
    streams.forEach((serie, idx) => {
      const el = document.getElementById(`series-${serie.series_id || idx}`);
      if (el) {
        el.onclick = () => openSeriesDetailModal(serie);
        el.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            openSeriesDetailModal(serie);
          }
        };
      }
    });
  }
}

/**
 * Abre el modal de detalle de película con diseño profesional
 */
function openVodDetailModal(vod) {
  currentVodItem = vod;
  const modal = document.getElementById('modal-vod-detail');
  if (!modal) return;

  const poster = vod.cover || vod.logo || '';
  const nombre = vod.name || vod.title || 'Película';
  const año = vod.year || '';
  const duracion = vod.duration || '';
  const rating = vod.rating || '';
  const genero = vod.genre || vod.group || 'Película';
  const sinopsis = vod.plot || 'Sin descripción disponible para esta película.';
  const reparto = vod.cast || '';

  // Llenar datos del modal
  const titleEl = document.getElementById('vod-modal-title');
  const nameEl = document.getElementById('vod-modal-name');
  const posterEl = document.getElementById('vod-modal-poster');
  const yearEl = document.getElementById('vod-modal-year');
  const durationEl = document.getElementById('vod-modal-duration');
  const ratingEl = document.getElementById('vod-modal-rating');
  const genreEl = document.getElementById('vod-modal-genre');
  const plotEl = document.getElementById('vod-modal-plot');
  const castEl = document.getElementById('vod-modal-cast');
  const castContainer = document.getElementById('vod-modal-cast-container');

  if (titleEl) titleEl.innerText = `Detalle de ${nombre}`;
  if (nameEl) nameEl.innerText = nombre;
  if (posterEl) {
    posterEl.src = poster;
    posterEl.onerror = () => { posterEl.src = ''; };
  }
  if (yearEl) {
    yearEl.innerText = año || 'N/A';
    yearEl.style.display = año ? 'inline-block' : 'none';
    yearEl.className = 'vod-modal-badge year';
  }
  if (durationEl) {
    durationEl.innerText = duracion || '';
    durationEl.style.display = duracion ? 'inline-block' : 'none';
    durationEl.className = 'vod-modal-badge';
  }
  if (ratingEl) {
    ratingEl.innerHTML = rating ? `<i class="fa-solid fa-star text-[9px] mr-1"></i>${rating}` : '';
    ratingEl.style.display = rating ? 'inline-block' : 'none';
    ratingEl.className = 'vod-modal-badge';
  }
  if (genreEl) genreEl.innerText = genero;
  if (plotEl) plotEl.innerText = sinopsis;
  if (castEl && castContainer) {
    if (reparto) {
      castContainer.style.display = 'block';
      castEl.innerText = reparto;
    } else {
      castContainer.style.display = 'none';
    }
  }

  modal.classList.add('show', 'active');
}

/**
 * Abre el modal de detalle de serie con diseño profesional
 */
function openSeriesDetailModal(serie) {
  currentSeriesItem = serie;
  const modal = document.getElementById('modal-series-detail');
  if (!modal) return;

  const poster = serie.cover || serie.logo || '';
  const nombre = serie.name || serie.title || 'Serie';
  const año = serie.year || '';
  const genero = serie.genre || serie.group || 'Serie';
  const sinopsis = serie.plot || 'Sin descripción disponible.';
  const seriesId = serie.series_id || 0;

  // Llenar datos del modal
  const titleEl = document.getElementById('series-modal-title');
  const nameEl = document.getElementById('series-modal-name');
  const posterEl = document.getElementById('series-modal-poster');
  const yearEl = document.getElementById('series-modal-year');
  const genreEl = document.getElementById('series-modal-genre');
  const plotEl = document.getElementById('series-modal-plot');
  const seasonsTabs = document.getElementById('series-seasons-tabs');
  const episodesList = document.getElementById('series-episodes-list');

  if (titleEl) titleEl.innerText = `Detalle de ${nombre}`;
  if (nameEl) nameEl.innerText = nombre;
  if (posterEl) {
    posterEl.src = poster;
    posterEl.onerror = () => { posterEl.src = ''; };
  }
  if (yearEl) {
    yearEl.innerText = año || 'N/A';
    yearEl.style.display = año ? 'inline-block' : 'none';
  }
  if (genreEl) genreEl.innerText = genero;
  if (plotEl) plotEl.innerText = 'Cargando temporadas y episodios...';

  if (seasonsTabs) seasonsTabs.innerHTML = `<span class="text-xs text-gray-500 py-1"><i class="fa-solid fa-spinner animate-spin mr-1.5"></i>Cargando temporadas...</span>`;
  if (episodesList) episodesList.innerHTML = '';

  modal.classList.add('show', 'active');

  const acc = getActiveXtreamAccount();
  if (!acc) {
    if (plotEl) plotEl.innerText = "Error: no hay cuenta activa.";
    return;
  }

  // Cargar temporadas y episodios
  dataService.fetchSeriesInfo(acc.server, acc.username, acc.password, serie.series_id)
    .then(seriesInfo => {
      currentSeriesInfo = seriesInfo;
      if (seriesInfo.info && seriesInfo.info.plot) {
        if (plotEl) plotEl.innerText = seriesInfo.info.plot;
      }
      currentSeriesSeasons = seriesInfo.seasons || [];
      renderSeriesSeasons(currentSeriesSeasons);
    })
    .catch(err => {
      if (seasonsTabs) seasonsTabs.innerHTML = `<span class="text-xs text-red-400">Error al cargar episodios: ${err.message}</span>`;
    });
}

/**
 * Renderiza las temporadas de una serie
 */
function renderSeriesSeasons(seasons) {
  const tabsContainer = document.getElementById('series-seasons-tabs');
  if (!tabsContainer) return;
  tabsContainer.innerHTML = '';

  if (!seasons || seasons.length === 0) {
    tabsContainer.innerHTML = `<span class="text-xs text-gray-500">No hay temporadas disponibles.</span>`;
    return;
  }

  seasons.forEach((season, idx) => {
    const btn = document.createElement('button');
    const isFirst = (idx === 0);
    btn.className = `season-tab ${isFirst ? 'active' : ''}`;
    btn.innerText = `Temp ${season.season_num}`;
    btn.onclick = () => selectSeriesSeason(season.season_num);
    tabsContainer.appendChild(btn);
  });

  if (seasons.length > 0) {
    selectSeriesSeason(seasons[0].season_num);
  }
}

/**
 * Selecciona una temporada y renderiza sus episodios
 */
function selectSeriesSeason(seasonNum) {
  selectedSeasonNum = seasonNum;
  const tabsContainer = document.getElementById('series-seasons-tabs');
  if (tabsContainer) {
    tabsContainer.querySelectorAll('button').forEach(btn => {
      const isAct = btn.innerText === `Temp ${seasonNum}`;
      btn.className = `season-tab ${isAct ? 'active' : ''}`;
    });
  }

  const seasonObj = currentSeriesSeasons.find(s => String(s.season_num) === String(seasonNum));
  renderSeriesEpisodes(seasonObj ? seasonObj.episodes : []);
}

/**
 * Renderiza los episodios de una temporada
 */
function renderSeriesEpisodes(episodes) {
  const listContainer = document.getElementById('series-episodes-list');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  if (!episodes || episodes.length === 0) {
    listContainer.innerHTML = `<div class="vod-empty-state" style="padding:20px"><i class="fa-solid fa-clapperboard"></i><h3>Sin episodios</h3><p>No hay episodios disponibles en esta temporada.</p></div>`;
    return;
  }

  episodes.forEach(ep => {
    const item = document.createElement('div');
    item.className = 'episode-item';
    item.onclick = () => {
      closeSeriesDetailModal();
      openMediaInExternalPlayer(ep.url, ep.title || ep.name || 'Episodio');
    };

    const epNum = ep.episode_num || ep.episode_id || '?';
    item.innerHTML = `
      <div class="episode-number">${epNum}</div>
      <div class="episode-info">
        <div class="episode-title">${ep.title || `Episodio ${epNum}`}</div>
        <div class="episode-meta">Temporada ${ep.season || seasonNum} • Episodio ${epNum}</div>
      </div>
    `;
    listContainer.appendChild(item);
  });
}

/**
 * Reproduce una película desde el grid (llamada desde el botón overlay)
 */
function playVodItemFromGrid(streamId) {
  if (!currentRenderedList) return;
  const vod = currentRenderedList.find(v => String(v.stream_id || v.id) === String(streamId));
  if (vod) {
    closeVodDetailModal();
    openMediaInExternalPlayer(vod.url, vod.name || vod.title || 'Película');
  }
}

/**
 * Abre detalles de serie desde el grid (llamada desde el botón overlay)
 */
function playSerieItemFromGrid(streamId) {
  if (!currentRenderedList) return;
  const serie = currentRenderedList.find(s => String(s.series_id || s.id) === String(streamId));
  if (serie) {
    closeSeriesDetailModal();
    openSeriesDetailModal(serie);
  }
}

// =========================================================
// FASE 1: Retorno al menú principal desde TV en vivo
// Detiene la señal en vivo, sale de fullscreen y vuelve al
// menú de canales sin cerrar la aplicación.
// =========================================================
async function returnToMainMenu() {
  if (window.playerManager) {
    try {
      await window.playerManager.stopPlayback();
      window.playerManager.exitFullscreenMode();
    } catch (e) {}
  }
  currentContentType = 'live';
  window.currentContentType = 'live';
  document.body.classList.remove('vod-mode');
  updateContentTypeButtons();
  updateLiveSignalIndicator();
  if (typeof window.switchTab === 'function') {
    window.switchTab('home');
  }
  showToast("📺 Señal detenida. Volviendo al menú principal.");
}

async function loadVodContent() {
  const acc = getActiveXtreamAccount();
  if (!acc) {
    showToast("Conecta tu cuenta Xtream para ver películas.");
    switchTab('xtream');
    return;
  }

  showChannelsLoading(true);
  const titleEl = document.getElementById('current-country-title');
  if (titleEl) titleEl.innerHTML = `🎬 <span>Películas VOD (${acc.username})</span>`;

  try {
    vodCategories = await dataService.fetchVodCategories(acc.server, acc.username, acc.password);
    if (!vodCategories || vodCategories.length === 0) {
      vodCategories = [{ category_id: 'all', category_name: 'Todas las Películas' }];
    }

    renderContentCategoriesUI(vodCategories, 'vod');

    // Cargar primera categoría
    const firstCat = vodCategories[0];
    await onSelectVodCategory(firstCat.category_id, firstCat.category_name);
  } catch (err) {
    showToast("Error cargando películas: " + err.message);
  } finally {
    showChannelsLoading(false);
  }
}

async function onSelectVodCategory(catId, catName) {
  const acc = getActiveXtreamAccount();
  if (!acc) return;

  highlightContentCategory(catName);
  showChannelsLoading(true);

  try {
    const streams = await dataService.fetchVodStreams(acc.server, acc.username, acc.password, catId);
    currentRenderedList = streams;
    displayedChannelCount = 0;

    // FASE 2: Renderizar grid de carteles VOD profesional
    renderVodGrid(streams);

    const tvBadge = document.getElementById('tv-category-badge');
    if (tvBadge) tvBadge.innerText = `${catName} (${streams.length})`;
  } catch (err) {
    showToast("Error al cargar categoría: " + err.message);
  } finally {
    showChannelsLoading(false);
  }
}

async function loadSeriesContent() {
  const acc = getActiveXtreamAccount();
  if (!acc) {
    showToast("Conecta tu cuenta Xtream para ver series.");
    switchTab('xtream');
    return;
  }

  showChannelsLoading(true);
  const titleEl = document.getElementById('current-country-title');
  if (titleEl) titleEl.innerHTML = `🍿 <span>Series (${acc.username})</span>`;

  try {
    seriesCategories = await dataService.fetchSeriesCategories(acc.server, acc.username, acc.password);
    if (!seriesCategories || seriesCategories.length === 0) {
      seriesCategories = [{ category_id: 'all', category_name: 'Todas las Series' }];
    }

    renderContentCategoriesUI(seriesCategories, 'series');

    // Cargar primera categoría
    const firstCat = seriesCategories[0];
    await onSelectSeriesCategory(firstCat.category_id, firstCat.category_name);
  } catch (err) {
    showToast("Error cargando series: " + err.message);
  } finally {
    showChannelsLoading(false);
  }
}

async function onSelectSeriesCategory(catId, catName) {
  const acc = getActiveXtreamAccount();
  if (!acc) return;

  highlightContentCategory(catName);
  showChannelsLoading(true);

  try {
    const streams = await dataService.fetchSeriesStreams(acc.server, acc.username, acc.password, catId);
    currentRenderedList = streams;
    displayedChannelCount = 0;

    // FASE 2: Renderizar grid de carteles Series profesional
    renderSeriesGrid(streams);

    const tvBadge = document.getElementById('tv-category-badge');
    if (tvBadge) tvBadge.innerText = `${catName} (${streams.length})`;
  } catch (err) {
    showToast("Error al cargar series: " + err.message);
  } finally {
    showChannelsLoading(false);
  }
}

function renderContentCategoriesUI(categories, type) {
  const catContainer = document.getElementById('categories-container');
  const tvCatList = document.getElementById('tv-categories-list');

  if (catContainer) {
    catContainer.innerHTML = '';
    categories.forEach((cat, idx) => {
      const btn = document.createElement('button');
      const isFirst = (idx === 0);
      btn.className = `category-pill px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap transition ${isFirst ? 'bg-yellow-500 text-black active' : 'bg-gray-900 text-gray-300 border border-gray-800'}`;
      btn.innerText = cat.category_name;
      btn.onclick = () => {
        if (type === 'vod') onSelectVodCategory(cat.category_id, cat.category_name);
        else onSelectSeriesCategory(cat.category_id, cat.category_name);
      };
      catContainer.appendChild(btn);
    });
  }

  if (tvCatList) {
    tvCatList.innerHTML = '';
    categories.forEach((cat, idx) => {
      const item = document.createElement('div');
      const isFirst = (idx === 0);
      item.className = `tv-cat-item ${isFirst ? 'active' : ''}`;
      item.tabIndex = 0;
      item.innerHTML = `<span class="truncate mr-2">${cat.category_name}</span>`;
      item.onclick = () => {
        if (type === 'vod') onSelectVodCategory(cat.category_id, cat.category_name);
        else onSelectSeriesCategory(cat.category_id, cat.category_name);
      };
      item.onkeydown = (e) => {
        if (e.key === 'Enter') {
          if (type === 'vod') onSelectVodCategory(cat.category_id, cat.category_name);
          else onSelectSeriesCategory(cat.category_id, cat.category_name);
        }
      };
      tvCatList.appendChild(item);
    });
  }
}

function highlightContentCategory(catName) {
  document.querySelectorAll('.category-pill').forEach(p => {
    const isAct = p.innerText === catName;
    p.classList.toggle('active', isAct);
    p.classList.toggle('bg-yellow-500', isAct);
    p.classList.toggle('text-black', isAct);
    p.classList.toggle('bg-gray-900', !isAct);
    p.classList.toggle('text-gray-300', !isAct);
  });

  document.querySelectorAll('.tv-cat-item').forEach(el => {
    const isAct = el.querySelector('span')?.innerText === catName;
    el.classList.toggle('active', isAct);
  });
}

function createVodCardElement(vod, numberIndex, isTvLayout = false) {
  const card = document.createElement('div');
  card.id = `vod-${vod.stream_id}`;
  card.className = `vod-poster-card group`;
  card.setAttribute('tabindex', '0');

  card.onclick = () => openVodModal(vod);
  card.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      openVodModal(vod);
    }
  };

  const posterImg = vod.cover || vod.logo
    ? `<img src="${vod.cover || vod.logo}" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'w-full h-full bg-gray-800 flex items-center justify-center text-yellow-500 text-3xl\\'><i class=\\'fa-solid fa-film\\'></i></div>';">`
    : `<div class="w-full h-full bg-gray-800 flex items-center justify-center text-yellow-500 text-3xl"><i class="fa-solid fa-film"></i></div>`;

  const yearHtml = vod.year
    ? `<span class="text-[10px] text-gray-400 bg-black/50 px-1.5 py-0.5 rounded">${vod.year}</span>`
    : '';

  card.innerHTML = `
    <div class="poster-wrapper">
      ${posterImg}
    </div>
    <div class="vod-card-body">
      <h4 class="text-xs font-bold text-gray-100 line-clamp-2 group-hover:text-yellow-400 transition leading-snug">${vod.name}</h4>
      <div class="flex items-center justify-between mt-2 pt-1 border-t border-white/10">
        ${yearHtml}
        <span class="text-[10px] text-gray-400 truncate max-w-[100px]">${vod.group || 'Película'}</span>
      </div>
    </div>
  `;
  return card;
}

function createSeriesCardElement(series, numberIndex, isTvLayout = false) {
  const card = document.createElement('div');
  card.id = `series-${series.series_id}`;
  card.className = `vod-poster-card group`;
  card.setAttribute('tabindex', '0');

  card.onclick = () => openSeriesModal(series);
  card.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      openSeriesModal(series);
    }
  };

  const posterImg = series.cover || series.logo
    ? `<img src="${series.cover || series.logo}" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'w-full h-full bg-gray-800 flex items-center justify-center text-purple-400 text-3xl\\'><i class=\\'fa-solid fa-clapperboard\\'></i></div>';">`
    : `<div class="w-full h-full bg-gray-800 flex items-center justify-center text-purple-400 text-3xl"><i class="fa-solid fa-clapperboard"></i></div>`;

  const yearHtml = series.year
    ? `<span class="text-[10px] text-gray-400 bg-black/50 px-1.5 py-0.5 rounded">${series.year}</span>`
    : '';

  card.innerHTML = `
    <div class="poster-wrapper">
      ${posterImg}
    </div>
    <div class="vod-card-body">
      <h4 class="text-xs font-bold text-gray-100 line-clamp-2 group-hover:text-purple-400 transition leading-snug">${series.name}</h4>
      <div class="flex items-center justify-between mt-2 pt-1 border-t border-white/10">
        ${yearHtml}
        <span class="text-[10px] text-gray-400 truncate max-w-[100px]">${series.group || 'Serie'}</span>
      </div>
    </div>
  `;
  return card;
}

function openVodModal(vod) {
  currentVodItem = vod;
  const modal = document.getElementById('modal-vod-detail');
  if (!modal) return;

  const titleEl = document.getElementById('vod-title-text');
  const nameEl = document.getElementById('vod-modal-name');
  const posterEl = document.getElementById('vod-modal-poster');
  const yearEl = document.getElementById('vod-modal-year');
  const durationEl = document.getElementById('vod-modal-duration');
  const ratingEl = document.getElementById('vod-modal-rating');
  const genreEl = document.getElementById('vod-modal-genre');
  const plotEl = document.getElementById('vod-modal-plot');
  const castEl = document.getElementById('vod-modal-cast');
  const castContainer = document.getElementById('vod-modal-cast-container');

  if (titleEl) titleEl.innerText = vod.name || 'Película';
  if (nameEl) nameEl.innerText = vod.name || 'Película';
  if (posterEl) {
    posterEl.src = vod.cover || vod.logo || '';
    posterEl.onerror = () => { posterEl.src = ''; };
  }
  if (yearEl) {
    yearEl.innerText = vod.year || 'N/A';
    yearEl.style.display = vod.year ? 'inline-block' : 'none';
  }
  if (durationEl) {
    durationEl.innerText = vod.duration || '';
    durationEl.style.display = vod.duration ? 'inline-block' : 'none';
  }
  if (ratingEl) {
    ratingEl.innerHTML = vod.rating ? `<i class="fa-solid fa-star text-[9px] mr-1"></i>${vod.rating}` : '';
    ratingEl.style.display = vod.rating ? 'inline-block' : 'none';
  }
  if (genreEl) genreEl.innerText = vod.genre || vod.group || '';
  if (plotEl) plotEl.innerText = vod.plot || 'Sin descripción disponible para esta película.';
  if (castEl && castContainer) {
    if (vod.cast) {
      castContainer.style.display = 'block';
      castEl.innerText = vod.cast;
    } else {
      castContainer.style.display = 'none';
    }
  }

  modal.classList.add('show', 'active');
}

function closeVodDetailModal() {
  const modal = document.getElementById('modal-vod-detail');
  if (modal) modal.classList.remove('show', 'active');
}

function playCurrentVod() {
  if (!currentVodItem || !currentVodItem.url) return;
  closeVodDetailModal();
  openMediaInExternalPlayer(currentVodItem.url, currentVodItem.name);
}

async function openSeriesModal(series) {
  currentSeriesItem = series;
  const modal = document.getElementById('modal-series-detail');
  if (!modal) return;

  const titleEl = document.getElementById('series-title-text');
  const nameEl = document.getElementById('series-modal-name');
  const posterEl = document.getElementById('series-modal-poster');
  const yearEl = document.getElementById('series-modal-year');
  const genreEl = document.getElementById('series-modal-genre');
  const plotEl = document.getElementById('series-modal-plot');
  const seasonsTabs = document.getElementById('series-seasons-tabs');
  const episodesList = document.getElementById('series-episodes-list');

  if (titleEl) titleEl.innerText = series.name || 'Serie';
  if (nameEl) nameEl.innerText = series.name || 'Serie';
  if (posterEl) {
    posterEl.src = series.cover || series.logo || '';
    posterEl.onerror = () => { posterEl.src = ''; };
  }
  if (yearEl) {
    yearEl.innerText = series.year || 'N/A';
    yearEl.style.display = series.year ? 'inline-block' : 'none';
  }
  if (genreEl) {
    genreEl.innerText = series.genre || series.group || 'Serie';
    genreEl.style.display = (series.genre || series.group) ? 'inline-block' : 'none';
  }
  if (plotEl) plotEl.innerText = series.plot || 'Cargando información de temporadas y episodios...';

  if (seasonsTabs) seasonsTabs.innerHTML = `<span class="text-xs text-gray-500 py-1"><i class="fa-solid fa-spinner animate-spin mr-1.5"></i>Cargando temporadas...</span>`;
  if (episodesList) episodesList.innerHTML = '';

  modal.classList.add('show', 'active');

  const acc = getActiveXtreamAccount();
  if (!acc) {
    if (plotEl) plotEl.innerText = "Error: no hay cuenta activa.";
    return;
  }

  try {
    const seriesInfo = await dataService.fetchSeriesInfo(acc.server, acc.username, acc.password, series.series_id);
    currentSeriesInfo = seriesInfo;
    if (seriesInfo.info && seriesInfo.info.plot) {
      if (plotEl) plotEl.innerText = seriesInfo.info.plot;
    }
    currentSeriesSeasons = seriesInfo.seasons || [];
    renderSeriesSeasons(currentSeriesSeasons);
  } catch (err) {
    if (seasonsTabs) seasonsTabs.innerHTML = `<span class="text-xs text-red-400">Error al cargar episodios: ${err.message}</span>`;
  }
}

function renderSeriesSeasons(seasons) {
  const tabsContainer = document.getElementById('series-seasons-tabs');
  if (!tabsContainer) return;
  tabsContainer.innerHTML = '';

  if (!seasons || seasons.length === 0) {
    tabsContainer.innerHTML = `<span class="text-xs text-gray-500">No hay temporadas disponibles.</span>`;
    return;
  }

  seasons.forEach((season, idx) => {
    const btn = document.createElement('button');
    const isFirst = (idx === 0);
    btn.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${isFirst ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`;
    btn.innerText = `Temp ${season.season_num}`;
    btn.onclick = () => selectSeriesSeason(season.season_num);
    tabsContainer.appendChild(btn);
  });

  selectSeriesSeason(seasons[0].season_num);
}

function selectSeriesSeason(seasonNum) {
  selectedSeasonNum = seasonNum;
  const tabsContainer = document.getElementById('series-seasons-tabs');
  if (tabsContainer) {
    tabsContainer.querySelectorAll('button').forEach(btn => {
      const isAct = btn.innerText === `Temp ${seasonNum}`;
      btn.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${isAct ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`;
    });
  }

  const seasonObj = currentSeriesSeasons.find(s => String(s.season_num) === String(seasonNum));
  renderSeriesEpisodes(seasonObj ? seasonObj.episodes : []);
}

function renderSeriesEpisodes(episodes) {
  const listContainer = document.getElementById('series-episodes-list');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  if (!episodes || episodes.length === 0) {
    listContainer.innerHTML = `<p class="text-xs text-gray-500 italic p-3 text-center">No hay episodios disponibles en esta temporada.</p>`;
    return;
  }

  episodes.forEach(ep => {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between p-2.5 bg-gray-900 border border-gray-800 rounded-xl hover:border-purple-500/40 transition cursor-pointer';
    item.onclick = () => playSeriesEpisode(ep);

    item.innerHTML = `
      <div class="flex items-center gap-2.5 truncate flex-1 mr-2">
        <span class="w-6 h-6 rounded-md bg-gray-800 text-purple-300 font-mono text-[11px] font-bold flex items-center justify-center flex-shrink-0">${ep.episode_num}</span>
        <div class="truncate">
          <p class="text-xs font-bold text-gray-200 truncate">${ep.title}</p>
          <span class="text-[10px] text-gray-500">Temporada ${ep.season} • Episodio ${ep.episode_num}</span>
        </div>
      </div>
      <div class="flex items-center gap-1.5 flex-shrink-0">
        <button onclick="event.stopPropagation(); playEpisodeExternal('${ep.id}')" class="w-7 h-7 rounded-full bg-orange-600/25 text-orange-400 hover:bg-orange-600 hover:text-white flex items-center justify-center transition active:scale-90" title="Reproducir en VLC / Externo (Dolby Audio)">
          <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
        </button>
        <button onclick="playSeriesEpisode(ep)" class="w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center hover:bg-purple-500 transition active:scale-90" title="Reproducir episodio">
          <i class="fa-solid fa-play text-[10px] ml-0.5"></i>
        </button>
      </div>
    `;
    listContainer.appendChild(item);
  });
}

async function openMediaInExternalPlayer(url, title = 'IPTV') {
  if (!url) return;

  // DETENER Y DESTRUIR INMEDIATAMENTE CUALQUIER REPRODUCCION EN VIVO EN SEGUNDO PLANO
  if (window.playerManager) {
    try {
      // CORRECCIÓN FASE 1: await explícito para garantizar detención completa
      await window.playerManager.stopPlayback();
      // Nota: se omite la llamada a stop() (método no existe en VideoPlayerManager)
      if (window.playerManager.video) {
        window.playerManager.video.pause();
        window.playerManager.video.removeAttribute('src');
        window.playerManager.video.load();
      }
      if (window.playerManager.hls) {
        window.playerManager.hls.destroy();
        window.playerManager.hls = null;
      }
    } catch (e) {}
  }
  if (window.exoPlayerPlugin && typeof window.exoPlayerPlugin.stop === 'function') {
    try { window.exoPlayerPlugin.stop(); } catch (e) {}
  }

  // 1. Android nativo (puente JS en MainActivity)
  if (window.AndroidNativeApp && typeof window.AndroidNativeApp.openExternalPlayer === 'function') {
    window.AndroidNativeApp.openExternalPlayer(url, title);
    showToast("🎬 Abriendo en reproductor externo (VLC / MX)...");
    return;
  }
  // 2. iOS nativo (Capacitor): abrir en VLC / Player via URL scheme o Safari
  const cap = window.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.Browser) {
    try {
      cap.Plugins.Browser.open({ url });
      showToast("🎬 Abriendo en reproductor externo...");
      return;
    } catch (e) { /* continúa con fallback web */ }
  }
  // 3. Web: nueva pestaña (el SO decide el reproductor de .m3u8/.mp4)
  try {
    const w = window.open(url, '_blank');
    if (!w) {
      // Pop-up bloqueado: usar un <a download/blank> sintético dentro del gesto táctil
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  } catch (e) {
    showToast('No se pudo abrir el reproductor externo');
  }
}

function playVodExternal() {
  if (!currentVodItem || !currentVodItem.url) return;
  closeVodDetailModal();
  openMediaInExternalPlayer(currentVodItem.url, currentVodItem.name);
}

function playEpisodeExternal(epId) {
  if (!currentSeriesSeasons) return;
  for (const s of currentSeriesSeasons) {
    const found = s.episodes?.find(e => e.id === epId || String(e.episode_id) === String(epId));
    if (found && found.url) {
      closeSeriesDetailModal();
      openMediaInExternalPlayer(found.url, found.title || found.name);
      return;
    }
  }
}

function playSeriesEpisode(ep) {
  if (!ep || !ep.url) return;
  closeSeriesDetailModal();
  openMediaInExternalPlayer(ep.url, ep.title || ep.name || 'Episodio');
}

function closeSeriesDetailModal() {
  const modal = document.getElementById('modal-series-detail');
  if (modal) modal.classList.remove('show', 'active');
}

// Render Favorites Tab
function renderFavorites() {
  const favs = dataService.getFavorites();
  const container = document.getElementById('favorites-list');
  if (!container) return;
  container.innerHTML = '';

  if (favs.length === 0) {
    container.innerHTML = `
      <div class="p-12 text-center text-gray-500 text-xs">
        <i class="fa-regular fa-star text-5xl mb-3 text-yellow-500/50"></i>
        <p class="font-bold text-gray-200 text-sm">No tienes canales favoritos</p>
        <p class="text-[11px] text-gray-400 mt-1 max-w-xs mx-auto">Toca la estrella ⭐ en cualquier canal para agregarlo aquí.</p>
      </div>
    `;
    return;
  }

  favs.forEach((ch, idx) => {
    const card = createChannelCardElement(ch, idx + 1, false);
    container.appendChild(card);
  });
}

// Search Engine (Debounced & Fast)
function initSearch() {
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear-btn');
  const tvSearchCat = document.getElementById('tv-search-categories');
  const tvSearchCh = document.getElementById('tv-search-channels');

  let debounceTimer = null;

  const performChannelSearch = (query) => {
    const q = query.toLowerCase().trim();
    if (!q) {
      selectCategory(currentSelectedCategory);
      return;
    }

    const matches = allChannels.filter(c => 
      c.name.toLowerCase().includes(q) || (c.group && c.group.toLowerCase().includes(q))
    );

    currentRenderedList = matches;
    displayedChannelCount = 0;

    const container = document.getElementById('channels-list');
    const tvContainer = document.getElementById('tv-channels-list');
    if (container) container.innerHTML = '';
    if (tvContainer) tvContainer.innerHTML = '';

    renderNextChannelBatch();
  };

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value;
      if (clearBtn) clearBtn.classList.toggle('hidden', q.length === 0);
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => performChannelSearch(q), 150);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.classList.add('hidden');
      selectCategory(currentSelectedCategory);
      searchInput.focus();
    });
  }

  if (tvSearchCh) {
    tvSearchCh.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => performChannelSearch(e.target.value), 150);
    });
  }

  // Filter Categories in TV Column 1
  if (tvSearchCat) {
    tvSearchCat.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll('.tv-cat-item').forEach(item => {
        const text = item.querySelector('span')?.innerText.toLowerCase() || '';
        item.style.display = (!q || text.includes(q)) ? 'flex' : 'none';
      });
    });
  }
}

// Tab Navigation
function initNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.nav-btn').forEach(b => {
    const isActive = b.dataset.tab === tab;
    b.classList.toggle('text-blue-500', isActive);
    b.classList.toggle('text-gray-400', !isActive);
  });

  document.querySelectorAll('.tab-view').forEach(v => v.classList.add('hidden'));
  const currentView = document.getElementById(`view-${tab}`);
  if (currentView) currentView.classList.remove('hidden');

  if (tab === 'home') {
    // Vista de canales
  } else if (tab === 'favorites') {
    renderFavorites();
  } else if (tab === 'countries') {
    renderCountriesGrid(americasCountries);
  } else if (tab === 'xtream') {
    renderSavedAccounts();
    renderSavedCustomPlaylists();
  }
}

// Auto-play switch controller
function isAutoplayEnabled() {
  return localStorage.getItem('free_iptv_autoplay') === 'true';
}

function toggleAutoplay(enabled) {
  localStorage.setItem('free_iptv_autoplay', enabled ? 'true' : 'false');
  showToast(enabled ? "Auto-play: Activado ▶️" : "Auto-play: Desactivado ⏸️");
  const m = document.getElementById('toggle-autoplay');
  const tv = document.getElementById('tv-toggle-autoplay');
  if (m) m.checked = enabled;
  if (tv) tv.checked = enabled;
}

// Country Selector Modal
let selectorActiveRegion = 'all';
let selectedCountryCodes = new Set();

function openCountrySelectorModal() {
  const modal = document.getElementById('modal-country-selector');
  if (!modal) return;

  try {
    const saved = JSON.parse(localStorage.getItem('free_iptv_imported_countries') || '[]');
    selectedCountryCodes = new Set(saved);
  } catch {
    selectedCountryCodes = new Set();
  }

  selectorActiveRegion = 'all';
  renderSelectorCountries();
  modal.classList.add('show');
}

function closeCountrySelectorModal() {
  const modal = document.getElementById('modal-country-selector');
  if (modal) modal.classList.remove('show');
}

function filterSelectorRegion(region) {
  selectorActiveRegion = region;
  document.querySelectorAll('.region-tab').forEach(t => {
    const isAct = t.getAttribute('onclick').includes(`'${region}'`);
    t.classList.toggle('active', isAct);
    t.classList.toggle('bg-blue-600', isAct);
    t.classList.toggle('text-white', isAct);
    t.classList.toggle('bg-gray-900', !isAct);
    t.classList.toggle('text-gray-300', !isAct);
  });
  renderSelectorCountries();
}

function renderSelectorCountries() {
  const listEl = document.getElementById('selector-country-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const filtered = selectorActiveRegion === 'all'
    ? americasCountries
    : americasCountries.filter(c => c.region === selectorActiveRegion);

  filtered.forEach(c => {
    const isChecked = selectedCountryCodes.has(c.code);
    const item = document.createElement('label');
    item.className = `flex items-center justify-between p-2.5 rounded-xl border ${isChecked ? 'bg-blue-600/10 border-blue-500/40' : 'bg-gray-950 border-gray-800'} cursor-pointer active:scale-98 transition select-none`;
    item.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="text-xl">${c.flag}</span>
        <div>
          <p class="text-xs font-bold text-gray-100">${c.name}</p>
          <span class="text-[10px] text-gray-400">${c.region_name || c.code}</span>
        </div>
      </div>
      <input type="checkbox" value="${c.code}" ${isChecked ? 'checked' : ''} onchange="toggleCountrySelection('${c.code}', this.checked)" class="w-4 h-4 rounded text-blue-600 bg-gray-900 border-gray-700">
    `;
    listEl.appendChild(item);
  });

  updateSelectorCount();
}

function toggleCountrySelection(code, checked) {
  if (checked) selectedCountryCodes.add(code);
  else selectedCountryCodes.delete(code);
  updateSelectorCount();
}

function selectAllSelectorCountries(selectAll) {
  const filtered = selectorActiveRegion === 'all'
    ? americasCountries
    : americasCountries.filter(c => c.region === selectorActiveRegion);

  filtered.forEach(c => {
    if (selectAll) selectedCountryCodes.add(c.code);
    else selectedCountryCodes.delete(c.code);
  });
  renderSelectorCountries();
}

function updateSelectorCount() {
  const countEl = document.getElementById('selector-selected-count');
  if (countEl) countEl.innerText = `${selectedCountryCodes.size} seleccionados`;
}

async function importSelectedCountries() {
  if (selectedCountryCodes.size === 0) {
    alert("Por favor selecciona al menos un país para importar canales.");
    return;
  }

  const codes = Array.from(selectedCountryCodes);
  localStorage.setItem('free_iptv_imported_countries', JSON.stringify(codes));
  closeCountrySelectorModal();

  switchAppMode('A', false);
  showToast(`Importando ${codes.length} países seleccionados... ⏳`);
  await loadImportedCountries(codes);
  switchTab('home');
}

// Legal Disclaimer Handlers
function showLegalDisclaimerModal() {
  const modal = document.getElementById('modal-legal-disclaimer');
  if (modal) modal.classList.add('show');
}

function acceptLegalDisclaimer() {
  localStorage.setItem('free_iptv_legal_accepted', 'true');
  const modal = document.getElementById('modal-legal-disclaimer');
  if (modal) modal.classList.remove('show');
  openCountrySelectorModal();
}

// Lists & Settings Modals
function focusChannelSearch() {
  const tvInput = document.getElementById('tv-search-channels');
  const mobInput = document.getElementById('search-input');
  if (tvInput && tvInput.offsetParent !== null) {
    tvInput.focus();
    tvInput.select();
  } else if (mobInput) {
    mobInput.focus();
    mobInput.select();
  }
}

let isAzSorted = false;
function toggleSortAz() {
  if (!currentRenderedList || currentRenderedList.length === 0) return;
  isAzSorted = !isAzSorted;
  currentRenderedList.sort((a, b) => {
    const nameA = (a.name || a.title || '').toLowerCase();
    const nameB = (b.name || b.title || '').toLowerCase();
    return isAzSorted ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
  });
  displayedChannelCount = 0;
  const container = document.getElementById('channels-list');
  const tvContainer = document.getElementById('tv-channels-list');
  if (container) container.innerHTML = '';
  if (tvContainer) tvContainer.innerHTML = '';
  renderNextChannelBatch();
  showToast(isAzSorted ? "Canales ordenados A-Z" : "Canales ordenados Z-A");
}

function openSettingsModal() {
  const modal = document.getElementById('modal-settings');
  if (modal) {
    modal.classList.add('show', 'active');
  } else {
    openListsModal();
  }
}

function closeSettingsModal() {
  const modal = document.getElementById('modal-settings');
  if (modal) modal.classList.remove('show', 'active');
  closeListsModal();
}

function openListsModal() {
  const modal = document.getElementById('modal-lists');
  if (modal) modal.classList.add('show', 'active');
}

function closeListsModal() {
  const modal = document.getElementById('modal-lists');
  if (modal) modal.classList.remove('show', 'active');
}

// Sleep Timer Modal
function initSleepTimerModal() {
  window.openSleepTimerModal = () => {
    const modal = document.getElementById('modal-sleep-timer');
    if (modal) modal.classList.add('show');
  };
  window.closeSleepTimerModal = () => {
    const modal = document.getElementById('modal-sleep-timer');
    if (modal) modal.classList.remove('show');
  };
  window.setSleepTimerValue = (minutes) => {
    playerManager.setSleepTimer(minutes);
    closeSleepTimerModal();
  };
}

// Exit App Dialog & Action
function confirmExitApp() {
  const modal = document.getElementById('modal-exit-confirm');
  if (modal) modal.classList.add('show');
}

function closeExitModal() {
  const modal = document.getElementById('modal-exit-confirm');
  if (modal) modal.classList.remove('show');
}

function exitApplication() {
  closeExitModal();
  if (window.AndroidNativeApp && typeof window.AndroidNativeApp.exitApp === 'function') {
    window.AndroidNativeApp.exitApp();
    return;
  }
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.exitApp();
    return;
  }
  if (navigator.app && navigator.app.exitApp) {
    navigator.app.exitApp();
    return;
  }
  window.close();
}

function showChannelsLoading(show) {
  const el = document.getElementById('channels-loading-spinner');
  if (el) el.classList.toggle('hidden', !show);
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.remove('opacity-0', 'pointer-events-none');
  toast.classList.add('opacity-100');
  setTimeout(() => {
    toast.classList.remove('opacity-100');
    toast.classList.add('opacity-0', 'pointer-events-none');
  }, 2400);
}

// Android TV & Remote Control (D-Pad) Navigation Support
function initTVRemoteControl() {
  let focusedCardIdx = -1;

  document.addEventListener('keydown', (e) => {
    const key = e.key;
    const code = e.keyCode;

    // 1. Android TV Remote Media Keys
    if (key === 'MediaPlayPause' || key === 'Play' || key === 'Pause' || code === 179 || code === 85) {
      e.preventDefault();
      playerManager.togglePlay();
      return;
    }
    if (key === 'ChannelUp' || key === 'PageUp' || code === 166 || code === 33) {
      e.preventDefault();
      playerManager.playNextChannel();
      return;
    }
    if (key === 'ChannelDown' || key === 'PageDown' || code === 167 || code === 34) {
      e.preventDefault();
      playerManager.playPreviousChannel();
      return;
    }

    // 2. Back / Escape Key (Handle Fullscreen, Modals, or App Exit)
    if (key === 'Escape' || key === 'Back' || code === 27 || code === 4 || code === 8) {
      const container = document.getElementById('player-container');
      if (container && (container.classList.contains('fullscreen-player') || document.fullscreenElement)) {
        e.preventDefault();
        playerManager.exitFullscreenMode();
        return;
      }

      const countryModal = document.getElementById('modal-country-selector');
      if (countryModal && countryModal.classList.contains('show')) {
        e.preventDefault();
        closeCountrySelectorModal();
        return;
      }

      const sleepModal = document.getElementById('modal-sleep-timer');
      if (sleepModal && sleepModal.classList.contains('show')) {
        e.preventDefault();
        closeSleepTimerModal();
        return;
      }

      const exitModal = document.getElementById('modal-exit-confirm');
      if (exitModal && exitModal.classList.contains('show')) {
        e.preventDefault();
        exitApplication();
        return;
      }

      const vodModal = document.getElementById('modal-vod-detail');
      if (vodModal && (vodModal.classList.contains('active') || vodModal.classList.contains('show'))) {
        e.preventDefault();
        closeVodDetailModal();
        return;
      }

      const seriesModal = document.getElementById('modal-series-detail');
      if (seriesModal && (seriesModal.classList.contains('active') || seriesModal.classList.contains('show'))) {
        e.preventDefault();
        closeSeriesDetailModal();
        return;
      }

      const tracksModal = document.getElementById('modal-audio-subtitles');
      if (tracksModal && (tracksModal.classList.contains('active') || tracksModal.classList.contains('show'))) {
        e.preventDefault();
        playerManager.closeTracksModal();
        return;
      }

      if (activeTab !== 'home') {
        e.preventDefault();
        switchTab('home');
        return;
      }

      e.preventDefault();
      confirmExitApp();
      return;
    }

    // 3. Arrow Navigation on Channels List
    const activeCards = Array.from(document.querySelectorAll('#tv-channels-list .channel-card, #channels-list .channel-card')).filter(el => el.offsetParent !== null);
    if (activeCards.length === 0) return;

    if (key === 'ArrowDown' || code === 40) {
      e.preventDefault();
      focusedCardIdx = Math.min(focusedCardIdx + 1, activeCards.length - 1);
      activeCards[focusedCardIdx]?.focus();
      activeCards[focusedCardIdx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (key === 'ArrowUp' || code === 38) {
      e.preventDefault();
      focusedCardIdx = Math.max(focusedCardIdx - 1, 0);
      activeCards[focusedCardIdx]?.focus();
      activeCards[focusedCardIdx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (key === 'Enter' || code === 13) {
      if (document.activeElement && document.activeElement.classList.contains('channel-card')) {
        e.preventDefault();
        document.activeElement.click();
      }
    }
  });
}

// Exportar funciones globales en window para eventos inline y pruebas unitarias
if (typeof window !== 'undefined') {
  const globalAppFns = {
    switchTab, switchAppMode, switchContentType, returnToMainMenu,
    openSettingsModal, closeSettingsModal,
    openCountrySelectorModal, closeCountrySelectorModal, importSelectedCountries,
    selectAllSelectorCountries, filterSelectorRegion, connectXtreamCodes, loadCustomM3UUrl,
    handleM3UFileSelect, quickConnectAccount, deleteAccount, confirmExitApp,
    openVodModal, closeVodDetailModal, playCurrentVod, playVodExternal,
    openSeriesModal, closeSeriesDetailModal, playSeriesEpisode, playEpisodeExternal,
    renderVodGrid, renderSeriesGrid,
    openVodDetailModal, openSeriesDetailModal,
    renderSeriesSeasons, selectSeriesSeason, renderSeriesEpisodes,
    playVodItemFromGrid, playSerieItemFromGrid,
    openMediaInExternalPlayer, focusChannelSearch, toggleSortAz
  };
  Object.assign(window, globalAppFns);
}