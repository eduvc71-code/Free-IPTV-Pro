# 📱 Plan de Acción Multiplataforma — Free-IPTV (iOS, Web, TV, Desktop)

> Documento de estrategia derivado de la auditoría del frontend (`free_iptv_app/www`).
> Objetivo: que la app funcione en **iOS**, **navegadores (PWA)**, **Android TV/Fire TV** y **desktop**, sin perder la base Android/Capacitor actual.

---

## 1. Resumen ejecutivo

La app está construida sobre **Capacitor + WebView (Android)**. El 90 % del código (`www/`) es HTML/CSS/JS estándar, por lo que es portable. Los puntos que impiden multiplataforma hoy:

| Problema | Impacto | Solución |
|---|---|---|
| Puente nativo `AndroidNativeApp` (Java) para reproductor externo | Sin equivalente en iOS | Plugin Capacitor propio o `@capacitor/browser` (ya contemplado en el JS) |
| HLS.js con `enableWorker:false` y loaders custom | Funciona en iOS Safari **nativo**; no usar fetch/XHR proxies en iOS | Detección de `canPlayType('application/vnd.apple.mpegurl')` → ruta nativa AVPlayer (ya existe fallback) |
| CORS proxies públicos (`corsproxy.io`, `allorigins`) | Inseguros, rompen streams pesados, no aplican a video | Eliminarlos para video; usar red directa + ATS en iOS |
| Sin proyecto iOS en el repo | No se puede compilar `.ipa` | `npx cap add ios` (requiere macOS + Xcode) |
| Mixed content http/https | Android lo permite vía config; iOS **ATS lo bloquea** | Info.plist con `NSAllowsArbitraryLoads` o proxy TLS propio |
| Audio Dolby E-AC3 (AC3) en VOD/Series | WebView no decodifica → "sin audio" | Derivar a reproductor externo (VLC/MX/Infuse en iOS) — implementado en esta auditoría |

---

## 2. Fase 0 — Correcciones inmediatas (ya aplicadas en esta auditoría)

1. **Reproducción de Películas/Series** (`player.js`):
   - Se eliminó el pre-chequeo HTTP completo (que descargaba toda la película antes de reproducir) para URLs directas; ahora aplica únicamente a `.m3u8` y con `Range: bytes=0-0`.
   - Detección de contenedores no compatibles con WebView (MKV/AVI/WMV/FLV) → apertura automática en reproductor externo.
   - `catch` de `video.play()`: en `NotSupportedError` o contenido VOD/episodio, deriva a VLC/MX Player en vez de fallar silenciosamente.
   - Watchdog de 15 s para evitar "pantalla negra" en arranques lentos.
2. **`openMediaInExternalPlayer()`** soporta tres rutas: puente Android → Capacitor Browser (iOS) → pestaña web.

---

## 3. Fase 1 — Soporte iOS (objetivo principal)

### 3.1 Añadir plataforma iOS al proyecto Capacitor
```bash
cd free_iptv_app
npm i -D @capacitor/ios @capacitor/browser @capacitor/app
npx cap add ios
npx cap sync ios
```

### 3.2 Ajustes nativos iOS
- **Info.plist**:
  ```xml
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsArbitraryLoads</key><true/></dict>
  <key>LSApplicationQueriesSchemes</key>
  <array>
    <string>vlc</string><string>infuse-x</string>
  </array>
  <key>UIBackgroundModes</key>
  <array><string>audio</string></array>
  ```
  - `NSAllowsArbitraryLoads`: necesario porque la mayoría de servidores IPTV son `http://` puro (ATS de iOS los bloquearía).
  - `LSApplicationQueriesSchemes`: permite detectar/abrir VLC e Infuse vía URL scheme.
  - `UIBackgroundModes: audio`: reproducción con pantalla bloqueada / app en segundo plano.
- **WKWebView**: verificar `allowsInlineMediaPlayback = true` en el bridge de Capacitor (viene habilitado por defecto en Capacitor 6+).

### 3.3 Estrategia de reproducción en iOS
| Formato | Comportamiento deseado | Implementación |
|---|---|---|
| `.m3u8` (HLS) | **AVPlayer nativo** (WKWebView lo soporta) | El código ya hace `canPlayType('application/vnd.apple.mpegurl')` → asignar `video.src` directo, **sin HLS.js**. Opcional: forzar ruta nativa si `Capacitor.Platform === 'ios'`. |
| `.mp4/.m4v` H.264/AAC | Directo en `<video>` | Ya funciona |
| `.mkv/.avi` + AC3/E-AC3 | Externo: abrir `vlc://URL` o `infuse-x://URL`, fallback Safari | Extender el puente: plugin `ExternalPlayer` (API Capacitor idéntica en Android/iOS) |
| `.ts` crudo | No soportado por AVPlayer → externo o pedir Xtream `format=mp4` | Documentar límite |

### 3.4 Plugin Capacitor unificado `ExternalPlayer` (recomendado)
Crear plugin local que expone `open({url, title})`:
- **Android**: `Intent.ACTION_VIEW video/*` (equivale al puente actual).
- **iOS**: intenta `vlc://`, luego `infuse-x://`, luego abre en `SFSafariViewController`.
Esto reemplaza el `addJavascriptInterface` ad-hoc de `MainActivity.java` y da paridad total entre plataformas.

### 3.5 Compilación y distribución
- Build `.ipa` con Xcode (macOS físico, GitHub Actions runner `macos-latest`, o servicio tipo Codemagic).
- Distribución: TestFlight (hasta 10 000 testers) → App Store requiere revisión (⚠️ ver sección Legal abajo).

---

## 4. Fase 2 — PWA / Web multi-dispositivo

1. Añadir `manifest.webmanifest` + Service Worker (Workbox) a `www/` → instalable en Windows/macOS/Linux/Android.
2. En Chrome/Edge desktop el navegador decide el reproductor al hacer `window.open(url)`; en Linux se integra con mpv/VLC vía mime-types.
3. Servidor propio de proxy CORS (Fase 4) elimina dependencia de `corsproxy.io`/`allorigins` en modo web.
4. Publicar en GitHub Pages como demo pública (la infraestructura de Pages ya existe en el repo raíz).

## 5. Fase 3 — Android TV / Fire TV / Smart TV

- El layout TV ya existe (`tv-*` en index.html). Falta:
  - Navegación DPAD completa (foco visible en tarjetas VOD/Series: `tabindex` + estilos `:focus`).
  - Hints `leanback` en el manifest Android; probar control remoto (Back = cerrar modal antes que salir de la app).
  - Amazon Fire TV: mismo APK; publicar vía sideload primero.
  - Samsung/LG TVs: portar `www/` a Tizen/webOS (solo HTML/JS; reproductor HLS nativo disponible).

## 6. Fase 4 — Backend intermedio (calidad y desbloqueo)

Desplegar un micro-servicio (el repo ya tiene `app/server.py` con aiohttp como semilla):
- **Proxy de playlist/API Xtream** → resuelve CORS sin proxies públicos inseguros.
- **Endpoint `/probe?url=`** → resuelve redirects 302 y detecta códecs/audio (FFmpeg `ffprobe`) para decidir interno vs externo *antes* de reproducir.
- **Transcodificación opcional** (FFmpeg `-c:v copy -c:a aac`) para películas con audio E-AC3 en dispositivos sin reproductor externo (iOS sin VLC).
- Cacheo ligero y métricas de canales caídos (reutiliza `iptv_checker/`).

## 7. Fase 5 — Calidad, CI/CD y pruebas

- Lint/CI: `eslint` + `node --check` en GitHub Actions (el workflow `check_iptv.yml` ya cubre playlists).
- Pruebas de humo automatizadas: Playwright sobre la PWA (reproducir canal conocido, abrir modal VOD).
- Matriz de pruebas manuales por release: Android 10–14, iOS 16/17, Chrome, Safari, Edge, Android TV.
- Telemetría de errores de reproducción (`iptv-logger.js` puede enviar al endpoint del backend de la Fase 4).

## 8. Riesgos y consideraciones legales

- ⚠️ **App Store**: Apple rechaza apps que facilitan acceso a contenido pirata. Mitigación: distribuir iOS vía **TestFlight / perfil empresarial / PWA instalable** (en Safari: Compartir → Añadir a pantalla de inicio — sin revisión de Apple), y solo listas provistas por el usuario.
- Proxies CORS públicos pueden filtrar credenciales Xtream del usuario → migrar a proxy propio (Fase 4).
- Credenciales en la URL (`/movie/user/pass/id.mp4`) quedan en logs de intermediarios; evaluar tokens de sesión en el backend.

## 9. Roadmap resumido (8 semanas)

| Semana | Hito |
|---|---|
| 1 | ✅ Correcciones VOD/series (hechas) + QA Android |
| 2 | Plugin `ExternalPlayer` unificado; retirar puente Java ad-hoc |
| 3 | `cap add ios`, Info.plist, prueba AVPlayer en dispositivo real |
| 4 | Build iOS en CI (GitHub Actions macOS) + TestFlight interno |
| 5 | PWA (manifest + SW) + proxy CORS propio desplegado |
| 6 | Android TV: foco DPAD + manejo del botón Back |
| 7 | ffprobe automático interno-vs-externo + transcodificación opcional |
| 8 | Beta pública multiplataforma + telemetría |
