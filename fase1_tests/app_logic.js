// =========================================================
// app_logic.js
// Versión aislada de la lógica de navegación (app.js) con
// las correcciones propuestas para la Fase 1:
//   - switchContentType usa `await stopPlayback()` y elimina
//     la llamada al método inexistente `stop()`.
//   - Nueva función returnToMainMenu() para volver al menú
//     principal deteniendo la señal de TV en vivo.
// =========================================================

const state = {
  playerManager: null,
  currentContentType: 'live',
  modeBChannels: []
};

function getActiveXtreamAccount() {
  return { server: 'http://test', username: 'test', password: 'test' };
}

function setPlayerManager(pm) {
  state.playerManager = pm;
}

/**
 * Cambia el tipo de contenido (live / vod / series).
 * CORRECCIÓN FASE 1: se espera stopPlayback() antes de seguir.
 */
async function switchContentType(type) {
  if (type !== 'live' && type !== 'vod' && type !== 'series') type = 'live';
  state.currentContentType = type;
  const isVodOrSeries = (type === 'vod' || type === 'series');

  if (isVodOrSeries) {
    if (state.playerManager) {
      try {
        // CORREGIDO: await explícito para garantizar detención completa
        await state.playerManager.stopPlayback();
        // ELIMINADO: playerManager.stop() (método inexistente en player.js)
        if (state.playerManager.video) {
          state.playerManager.video.pause();
          state.playerManager.video.removeAttribute('src');
          state.playerManager.video.load();
        }
        if (state.playerManager.hls) {
          state.playerManager.hls.destroy();
          state.playerManager.hls = null;
        }
      } catch (e) {}
    }
    if (global.exoPlayerPlugin && typeof global.exoPlayerPlugin.stop === 'function') {
      try { await global.exoPlayerPlugin.stop(); } catch (e) {}
    }
  }

  if (type === 'live') {
    // setAppChannelsData(modeBChannels);
  } else if (type === 'vod') {
    // loadVodContent();
  } else if (type === 'series') {
    // loadSeriesContent();
  }
  return { type, stopped: isVodOrSeries };
}

/**
 * Vuelve al menú principal deteniendo cualquier reproducción en vivo.
 * NUEVA FUNCIÓN para la Fase 1.
 */
async function returnToMainMenu() {
  if (state.playerManager) {
    await state.playerManager.stopPlayback();
    state.playerManager.exitFullscreenMode();
  }
  state.currentContentType = 'live';
  return { action: 'returnToMainMenu', stopped: true };
}

module.exports = {
  switchContentType,
  returnToMainMenu,
  getActiveXtreamAccount,
  setPlayerManager,
  get state() { return state; }
};
