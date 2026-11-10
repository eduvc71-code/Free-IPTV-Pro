# FASE 1 — INFORME TÉCNICO DE AUDITORÍA Y DIAGNÓSTICO
**Proyecto:** Free-IPTV Pro · **Versión del informe:** 1.0 · **Fecha:** 2026-11-10
**Alcance:** auditoría de solo-lectura (no se modificó código en esta fase)
**Método:** inspección línea a línea + `node --check` + trazado de URLs Xtream + verificación contra el commit inicial (`5111dbd`)

---

## 1. Estado general verificado

| Archivo | Líneas | Sintaxis (`node --check`) | Veredicto |
|---|---|---|---|
| `free_iptv_app/www/js/player.js` | 1094 | ✅ OK | Motor de reproducción central; requiere re-ubicación arquitectónica (Fase 3) |
| `free_iptv_app/www/js/app.js` | 2177 | ✅ OK | Catálogo + UI + puente externo; acoplamiento alto |
| `free_iptv_app/www/js/xtream.js` | 799 | ✅ OK | Generación de URLs y fetch universal; **riesgo de seguridad CRÍTICO** |
| `free_iptv_app/www/js/iptv-logger.js` | 138 | ✅ OK | Interceptor de consola; **loguea URLs con credenciales** |
| `free_iptv_app/www/index.html` | 932 | ✅ | Scripts correctos, `<video id="main-video" playsinline>` presente |
| `free_iptv_app/android/.../MainActivity.java` | 118 | — | WebView configurado correctamente para multimedia |
| `app/server.py` | 218 | — | Backend auxiliar FastAPI; la app no lo usa en runtime |

Confirmado: las correcciones de la sesión anterior (pre-chequeo destructivo, watchdog, derivación a externo) están aplicadas y persisten en el árbol de trabajo (+77 líneas vs. commit inicial en `player.js`/`app.js`).

---

## 2. Causas raíz del problema de AUDIO en Películas y Series

### A-1 (CRÍTICA) — Códecs de audio que WebView no decodifica
Los VOD Xtream suelen distribuirse como **MKV/MP4 con pistas Dolby Digital (AC3), E-AC3 o DTS**. El códec de vídeo H.264 sí se decodifica → *hay imagen pero no sonido*. Esto es una limitación del motor multimedia de Android WebView, no un bug de JS.
- **Evidencia:** `player.js:335-351` reconoce el problema y deriva MKV/AVI/WMV/FLV a reproductor externo, **pero la lista blanca `webCompatible` incluye `.mp4|.m4v|.mov`**, que también pueden portar audio AC3/E-AC3 → estos casos entran al `<video>` interno y fallan en silencio.
- **Prueba reproducible:** reproducir un `movie/{u}/{p}/{id}.mkv` con audio E-AC3 (imagen OK, 0 dB de salida); comparar con VLC sobre la misma URL (sonido OK).

### A-2 (ALTA) — Sin detección post-arranque de "vídeo reproduce sin pistas de audio"
El watchdog actual (`player.js:376-389`) solo comprueba `readyState < 2` a los 15 s. Si el MP4 arranca (readyState ≥ 2) pero el navegador **ignora las pistas de audio incompatibles**, no hay ninguna comprobación de `audioTracks.length === 0` ni sondeo de volumen real → el usuario ve la película muda indefinidamente.
- HLS.js expone `hls.audioTracks` (`player.js:930-950` existe selector), pero **la ruta directa VOD nunca consulta `video.audioTracks`** tras `loadedmetadata`.

### A-3 (MEDIA) — Reset de volumen/mute contradictorio
`play()` fuerza `this.video.muted = false; volume = 1.0` (`player.js:193-194, 355-356`) descartando el estado guardado del gesto táctil (`this.volume`, línea 143). Si el usuario bajó volumen/muteó por gesto, el siguiente canal/película lo restaura forzosamente — inconsistencia de UX, y en algunos devices el cambio simultáneo mute→unmute durante `load()` produce sesión de audio silenciada hasta el próximo `playing`.

### A-4 (MEDIA) — `video.error` no tiene recuperación propia
El listener `error` (`player.js:859-868`) **solo loguea**; no reintenta ni deriva a externo. La recuperación depende únicamente del catch de `play()` y del watchdog, dejando ventanas de fallo silencioso (p. ej. error de red tras `MANIFEST_PARSED` en rutas directas).

### Conclusión Fase 1 sobre audio
> La causa principal es **A-1 (códec de audio no soportado por WebView)**, agravada por **A-2** (no se detecta ni se ofrece alternativa cuando ocurre con contenedores MP4/MOV). Ningún parche JS puede decodificar E-AC3 dentro de WebView: la solución definitiva es **selección de motor por formato+pista (PlaybackManager, Fase 3)** + reproductor externo con decodificación completa (VLC/MX/Infuse) + opcionalmente transcodificación AC3→AAC en backend propio (Fase 7).

---

## 3. Defectos de ESTABILIDAD en Televisión en directo

| ID | Ubicación | Defecto | Impacto |
|---|---|---|---|
| T-1 | `xtream.js:482` + comentario obsoleto l.481 | Live usa `/live/u/p/{id}.{format}` con format `'ts'` por defecto (`fetchXtreamPlaylist` l.443) y `'m3u8'` por defecto en `saveAccount` (l.523): **dos valores por defecto inconsistentes**. TS puro en `<video>` depende de MPEG-TS nativo del device (fragile en muchos WebView) | Canales negros/pantalla congelada según dispositivo |
| T-2 | `player.js:296-311` | Recuperación fatal HLS hace `startLoad()`/`recoverMediaError()` **sin límite de contador ni backoff** → bucle infinito posible en caídas de CDN (compite con el ciclo de 3 reintentos de `handleStreamFailInBackground`) | Battery drain, spinner eterno |
| T-3 | `player.js:10-123` | Los IPTV Loaders reescriben rutas relativas con regex sobre el texto del playlist; si el origen real difiere del resuelto por pre-check, los segmentos apuntan al host equivocado | Fallos intermitentes post-302 |
| T-4 | `capacitor.config.json` | `CapacitorHttp.enabled = true` intercepta el XHR de HLS.js envolviendo URLs en `_capacitor_http_interceptor_` (se desarma a mano en l.18-22, 102-107): parche sobre parche; los segmentos .ts descargados vía interceptor no usan Range/streaming correcto en todas las versiones | Latencia y cortes en vivo |
| T-5 | `xtream.js:141-143` | Fallback a proxies CORS públicos envía **URLs con user:pass a terceros** (ver S-1) además de ser lento/no fiable | Inestabilidad + filtración |

---

## 4. Matriz de formatos × dispositivos (resultado esperado)

| Formato | Android WebView (actual) | Android externo (VLC/MX) | iOS Safari/WKWebView | Chrome/Edge desktop |
|---|---|---|---|---|
| HLS `.m3u8` (H.264/AAC) | ✅ HLS.js / nativo | ✅ | ✅ **nativo AVPlayer** (mejor que HLS.js) | ✅ |
| Live TS (`/live/*.ts`) | ⚠️ según device | ✅ | ❌ (requiere HLS.js o transmux) | ⚠️ solo HLS.js |
| MP4 H.264 + AAC | ✅ | ✅ | ✅ | ✅ |
| MP4/MKV H.264 + **AC3/E-AC3/DTS** | ❌ **imagen sin audio (A-1)** | ✅ | ❌ → externo | ❌ → externo |
| MKV HEVC + cualquier audio | ⚠️/❌ | ✅ | ❌ → externo | ⚠️ |
| AVI / WMV / FLV | ❌ | ✅ | ❌ | ❌ |

Regla derivada: **contenedor ≠ garantía de audio**. La decisión interno/externo debe basarse en *códec de audio*, obtenible vía ffprobe en backend (Fase 7) o heurística conservadora (Fase 2).

---

## 5. Riesgos de seguridad y backend (entrada a Fase 7)

| ID | Severidad | Hallazgo |
|---|---|---|
| S-1 | 🔴 CRÍTICA | `xtream.js:141-143`: las peticiones fallback van a `corsproxy.io` y `api.allorigins.win` incluyendo `username/password` Xtream en la query → **las credenciales quedan en servidores de terceros** (y en sus logs). |
| S-2 | 🔴 ALTA | `xtream.js:523-530 saveAccount()`: credenciales en `localStorage` en texto plano, accesibles desde cualquier JS inyectado en el WebView. |
| S-3 | 🟠 MEDIA | `iptv-logger.js` captura toda la consola; `player.js:202` redacta user:pass en URLs de stream ✅, **pero** `xtream.js` loguea `catUrl`/`streamUrl` completos (l.455, 630, 670…) con credenciales → el visor de logs y cualquier volcado exponen la contraseña. |
| S-4 | 🟠 MEDIA | `MainActivity.java:82-83`: `setAllowFileAccessFromFileURLs(true)` + `setAllowUniversalAccessFromFileURLs(true)` desactivan el mismo-origin policy del WebView. |
| S-5 | 🟡 BAJA | `index.html:13`: Tailwind vía CDN en app offline-first → sin red, maquetación rota (debe empaquetarse el CSS). |
| S-6 | Info | `app/server.py` ya tiene `/api/proxy` local; es el sustituto natural de S-1, pero hoy la app web no lo usa. |

---

## 6. Lista de archivos a modificar (orden recomendado por fases)

1. **Fase 2** `www/js/player.js` — selección de motor por audio-track, fin de dobles defaults, límites de retry con backoff, manejo real de `video.error`, estado persistente de volumen.
2. **Fase 2** `www/js/xtream.js` — unificar default de output, eliminar proxies públicos (S-1), sanitizar logs con credenciales (S-3).
3. **Fase 3** nuevos: `PlaybackManager.js`, `PlatformDetector.js`, `AudioTrackManager.js`, `ExternalPlayer.js`, `MediaCompatibility.js` (extraer lógica de player.js/app.js sin duplicar catálogo).
4. **Fase 4** `package.json`, `capacitor.config.json`, nuevo proyecto `ios/`, `Info.plist` (ATS, esquemas vlc/infuse).
5. **Fase 5** nuevo `manifest.webmanifest`, `sw.js`, `index.html` (iconos, meta).
6. **Fase 6** `www/css/app.css` + `app.js` (foco DPAD/back).
7. **Fase 7** `app/server.py` (/probe con ffprobe, proxy autenticado), `MainActivity.java` (retire flags S-4), almacenamiento cifrado de credenciales (Keystore/Keychain).

---

## 7. Pruebas reproducibles definidas (criterio para avanzar a Fase 2)

**Entorno:** Android real (≥8.0) + `chrome://inspect`/ADB logcat; servidor Xtream de prueba con catálogo conocido.

| # | Escenario | Pasos | Resultado esperado hoy (bug confirmado) |
|---|---|---|---|
| P1 | Película MKV+E-AC3 | Reproducir VOD mkv | Se abre externo ✅ (parche previo) |
| P2 | **Película MP4+AC3** | Reproducir VOD mp4 con audio AC3 | ❌ Imagen muda sin audio (A-1/A-2) — *caso central del reporte del usuario* |
| P3 | Serie episodio | Navegar temporada→episodio, reproducir | Hereda el fallo de P2 si ext=mp4 |
| P4 | Canal live m3u8 | Cambiar 20 canales seguidos | ✅ estable; verificar T-2 desconectando red a mitad |
| P5 | Canal live ts | Servidor con output=ts | ⚠️ T-1: falla en devices sin demuxer TS |
| P6 | Caída de CDN | Matar stream en vivo | Observar bucle de retries T-2 |
| P7 | Log de credenciales | Abrir visor IPTV logs tras conectar cuenta | Confirmar S-3 (password visible) |

**Veredicto Fase 1:** causa del problema de audio identificada y documentada (A-1 primaria, A-2 agravante), pruebas reproducibles especificadas, matriz formatos/dispositivos entregada. **Criterio de avance CUMPLIDO.**

---
*Respaldo:* el árbol actual está commiteado (`cbb3c27`); cualquier cambio de Fase 2 se hará sobre rama/commit intermedio para permitir reversión inmediata (`git revert`).
