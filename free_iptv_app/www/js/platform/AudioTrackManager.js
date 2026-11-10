// =========================================================
// Free-IPTV Pro - AudioTrackManager.js (FASE 3)
// Abstracción de pistas de audio y subtítulos para:
// - HLS.js (audioTracks / subtitleTracks)
// - <video> HTML5 nativo (audioTracks / textTracks)
// - Motores nativos (puente Capacitor, si aplica)
// =========================================================

class AudioTrackManager {
  constructor(videoElement, hlsInstance = null) {
    this.video = videoElement;
    this.hls = hlsInstance || null;
    this.onTrackChange = null; // callback(trackId, type) donde type: 'audio' | 'subtitle'
  }

  setHls(hls) {
    this.hls = hls;
  }

  // ------------------------------------------------------------------
  // Audio
  // ------------------------------------------------------------------
  getAudioTracks() {
    // HLS.js primero (más completo en Android WebView)
    if (this.hls && this.hls.audioTracks && this.hls.audioTracks.length > 0) {
      return this.hls.audioTracks.map((t, idx) => ({
        id: idx,
        name: t.name || t.lang || `Audio ${idx + 1}`,
        lang: t.lang || '',
        active: this.hls.audioTrack === idx,
        source: 'hlsjs'
      }));
    }

    // Fallback a video nativo
    if (this.video && this.video.audioTracks && this.video.audioTracks.length > 0) {
      const tracks = [];
      for (let i = 0; i < this.video.audioTracks.length; i++) {
        const t = this.video.audioTracks[i];
        tracks.push({
          id: i,
          name: t.label || t.language || `Audio ${i + 1}`,
          lang: t.language || '',
          active: t.enabled,
          source: 'native'
        });
      }
      return tracks;
    }

    return [];
  }

  setAudioTrack(trackId) {
    if (this.hls && this.hls.audioTracks) {
      this.hls.audioTrack = trackId;
      if (this.onTrackChange) this.onTrackChange(trackId, 'audio');
      return true;
    }

    if (this.video && this.video.audioTracks) {
      for (let i = 0; i < this.video.audioTracks.length; i++) {
        this.video.audioTracks[i].enabled = (i === trackId);
      }
      if (this.onTrackChange) this.onTrackChange(trackId, 'audio');
      return true;
    }

    return false;
  }

  // ------------------------------------------------------------------
  // Subtítulos
  // ------------------------------------------------------------------
  getSubtitleTracks() {
    if (this.hls && this.hls.subtitleTracks && this.hls.subtitleTracks.length > 0) {
      return this.hls.subtitleTracks.map((t, idx) => ({
        id: idx,
        name: t.name || t.lang || `Subtítulo ${idx + 1}`,
        lang: t.lang || '',
        active: this.hls.subtitleTrack === idx,
        source: 'hlsjs'
      }));
    }

    if (this.video && this.video.textTracks && this.video.textTracks.length > 0) {
      const tracks = [];
      for (let i = 0; i < this.video.textTracks.length; i++) {
        const t = this.video.textTracks[i];
        tracks.push({
          id: i,
          name: t.label || t.language || `Subtítulo ${i + 1}`,
          lang: t.language || '',
          active: t.mode === 'showing',
          source: 'native'
        });
      }
      return tracks;
    }

    return [];
  }

  setSubtitleTrack(trackId) {
    if (this.hls && this.hls.subtitleTracks) {
      this.hls.subtitleTrack = trackId; // -1 para desactivar
      if (this.onTrackChange) this.onTrackChange(trackId, 'subtitle');
      return true;
    }

    if (this.video && this.video.textTracks) {
      for (let i = 0; i < this.video.textTracks.length; i++) {
        this.video.textTracks[i].mode = (i === trackId) ? 'showing' : 'disabled';
      }
      if (this.onTrackChange) this.onTrackChange(trackId, 'subtitle');
      return true;
    }

    return false;
  }

  // ------------------------------------------------------------------
  // Utilidad: pista activa actual
  // ------------------------------------------------------------------
  getActiveAudioTrack() {
    const tracks = this.getAudioTracks();
    return tracks.find(t => t.active) || null;
  }

  getActiveSubtitleTrack() {
    const tracks = this.getSubtitleTracks();
    return tracks.find(t => t.active) || null;
  }
}

window.AudioTrackManager = AudioTrackManager;
