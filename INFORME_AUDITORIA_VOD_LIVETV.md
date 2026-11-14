================================================================================
INFORME TÉCNICO DE AUDITORÍA — DISEÑO, UI/UX Y REPRODUCCIÓN
Proyecto: world_ip_tv-1.6.0.1 / Free-IPTV Pro (APK Android — Capacitor)
Versión auditada: v1.0.23 (APP_VERSION en www/js/app.js)
Autoría: auditoría estática de código fuente (SIN modificaciones)
Fecha: 13 de noviembre de 2026
================================================================================

1. ALCANCE Y METODOLOGÍA
--------------------------------------------------------------------------------
Se audité exclusivamente el código fuente existente en el repositorio
`world_ip_tv-1.6.0.1`. Se analizaron los archivos de la aplicación Android
basada en Capacitor (`free_iptv_app/www/`) y el reproductor web local
(`app/static/index.html`).

Archivos revisados (listado no exhaustivo, los relevantes):
  free_iptv_app/www/index.html
  free_iptv_app/www/css/app.css
  free_iptv_app/www/js/app.js
  free_iptv_app/www/js/player.js
  free_iptv_app/www/js/xtream.js
  free_iptv_app/www/js/platform/ExoPlayerPlugin.js
  free_iptv_app/www/js/platform/ExternalPlayer.js
  free_iptv_app/www/js/platform/TVNavigation.js
  free_iptv_app/www/js/platform/PlaybackManager.js
  free_iptv_app/capacitor.config.json
  free_iptv_app/package.json

RESTRICCIÓN CUMPLIDA: NO se modificó ninguna línea de código. El presente
informe es de solo lectura.

2. ARQUITECTURA DEL SISTEMA (contexto necesario para entender los defectos)
--------------------------------------------------------------------------------
La APK "Free-IPTV Pro" es una WebView (Capacitor v8) que carga `www/index.html`.
Posee una arquitectura de DOS MODO:
  - Modo A (Free/Público): canales abiertos por país (grilla de TV en vivo).
  - Modo B (Privadas/Xtream): canales, PELÍCULAS (VOD) y SERIES de un panel
    Xtream Codes.

Capas de reproducción (player.js / VideoPlayerManager):
  - MOTOR 1 WebView: <video> + HLS.js para .m3u8 (TV en vivo rápido).
  - MOTOR 2 Nativo: Media3 / ExoPlayer mediante plugin nativo
    (ExoPlayerPlugin.js) superpuesto al WebView (soporte AC-3/E-AC-3).
  - MOTOR 3 Externo: derivación a VLC / MX Player mediante Intent nativo
    (ExternalPlayer.js / openMediaInExternalPlayer).

Comportamiento clave documentado en el código:
  - switchContentType('vod'/'series') DETIENE la reproducción de TV en vivo
    al cambiar de pestaña (app.js, líneas 1260-1280).
  - VOD y Series se reproducen EXCLUSIVAMENTE en reproductor EXTERNO
    (player.js, línea 255-263: play() redirige a openMediaInExternalPlayer).
  - exitFullscreenMode() NO detiene la TV en vivo (solo la detiene si el
    contentType no es 'live', player.js líneas 911-914).
  - El botón Atrás (TVNavigation / onBack, app.js líneas 66-88): si está en
    fullscreen sale del fullscreen SIN detener; si está en 'home' pide salir
    de la app (confirmExitApp).

3. FALLO CRÍTICO 1 — VOD: TV EN VIVO SIGUE REPRODUCIÉNDOSE EN SEGUNDO PLANO
--------------------------------------------------------------------------------
SÍNTOMA reportado: al reproducir un canal de TV en Vivo y navegar a la
cartelera VOD, el audio/video del canal en vivo continúa sonando de fondo.

3.1 Análisis de causa raíz (evidencia de código)
--------------------------------------------------------------------------------
La intención de detener existe, pero su implementación es FRÁGIL y no
garantiza el apagado inmediato y sincrónico de la señal en vivo.

a) switchContentType() no espera la detención (app.js, líneas 1261-1276):
   - Llama a `window.playerManager.stopPlayback()` (asíncrono) SIN `await`.
   - Llama a `window.playerManager.stop()` que NO EXISTE en la clase
     VideoPlayerManager (player.js solo define stopPlayback()). La llamada
     lanza excepción, es capturada por `try/catch`, pero es código muerto
     que indica falta de definición clara de la API de detención.
   - Como stopPlayback() no se espera, la teardown (destruir HLS.js, pausar
     <video>, remover src, detener ExoPlayer nativo) se ejecuta de forma
     "fire-and-forget" mientras la UI de VOD ya se está renderizando. Puede
     quedar audio residual de la señal en vivo durante el intervalo.

b) Posible persistencia de la superficie nativa ExoPlayer:
   - Cuando TV en vivo se reproduce por ExoPlayer (superficie nativa Android
     superpuesta al WebView), stopPlayback() invoca
     `exoPlayerPlugin.stop()`. No hay garantía ni espera de que la superficie
     nativa se desmonte completamente antes de mostrar el catálogo VOD.
   - Si la señal venía en estado "Reconectando en segundo plano"
     (player-bg-retry, handleStreamFailInBackground con bgRetryTimer),
     stopPlayback() limpia el temporizador, pero no hay una barrera de
     sincronización que asegure silencio absoluto al entrar a VOD.

c) El contenedor del reproductor permanece montado detrás de VOD:
   - El `<div id="player-container">` y `<video id="main-video">` siguen en
     el DOM cuando se abre la cartelera VOD o el modal de detalle de película
     (modal-vod-detail, z-index 99999). Aunque switchContentType intente
     detener, cualquier ruta de código que reanude playback (autoplay,
     retry, visibilitychange) podría reactivar la señal en vivo por detrás
     del modal VOD.

d) Inconsistencia entre motores:
   - TV en vivo puede ir por HLS.js (WebView) o por ExoPlayer nativo según
     getEnginePreference() / needsExo. stopPlayback() cubre ambos, pero la
     falta de `await` y el método `stop()` inexistente debilitan la certeza
     del apagado.

3.2 Impacto
--------------------------------------------------------------------------------
- Experiencia de usuario deficiente: audio de TV en vivo superpuesto al
  catálogo VOD (confusión, doble sonido).
- Consumo de datos y batería innecesario por una señal que el usuario ya
  abandonó.
- Riesgo de conflictos de focus de audio entre WebView y ExoPlayer nativo.

3.3 Recomendación técnica (sin escribir código aún)
--------------------------------------------------------------------------------
1. Hacer `await` a `stopPlayback()` dentro de `switchContentType()` antes
   de renderizar contenido VOD/Series.
2. Eliminar la llamada a `window.playerManager.stop()` (método inexistente)
   o implementarlo como alias de `stopPlayback()`.
3. Añadir una barrera de sincronización (promesa) que confirme la detención
   de ExoPlayer nativo (`exoPlayerPlugin.stop()`) y la liberación del
   `<video>` antes de mostrar la UI de VOD.
4. Ocultar/desmontar `player-container` al entrar a cartelera VOD y
   restaurarlo solo al volver a TV en vivo.
5. Centralizar una única función `stopAllPlayback()` usada por todos los
   puntos de salida de TV en vivo (cambio a VOD/Series, cambio de modo A/B,
   salir de la app).

4. FALLO CRÍTICO 2 — TV EN VIVO: NO HAY FORMA DE RETORNAR AL MENÚ PRINCIPAL
--------------------------------------------------------------------------------
SÍNTOMA reportado: al estar reproduciendo TV en Vivo no existe una forma
clave/limpia de volver al menú principal de la APK sin cerrar la aplicación.

4.1 Análisis de causa raíz (evidencia de código)
--------------------------------------------------------------------------------
El manejo del botón Atrás (Android TV / Fire TV / teclado) está en
`window.tvNavigation.onBack` (app.js, líneas 66-88):

  1. Si está en fullscreen (player-container tiene clase 'fullscreen-player'):
     -> `playerManager.exitFullscreenMode()` y RETORNA.
        - Salida: sale del fullscreen PERO NO detiene la reproducción ni
          vuelve al menú. Se queda en la pestaña 'home' con el player activo.
  2. Si activeTab !== 'home': -> `switchTab('home')`.
  3. Si está en 'home': -> `confirmExitApp()` (sale de la aplicación).

Consecuencias para el usuario en TV en Vivo:
- Desde pantalla completa: Back solo quita el fullscreen; el player y la
  señal en vivo siguen visibles y sonando. No hay paso intermedio de
  "volver al menú y detener la señal".
- Desde pantalla normal (home, live activo): Back ejecuta confirmExitApp(),
  es decir, CIERRA la app por completo. No hay opción de "volver al menú
  principal manteniendo la app abierta y deteniendo el canal".

Además, `exitFullscreenMode()` en player.js (líneas 910-914) detiene la
reproducción SOLO cuando `currentContentType !== 'live'`. Para TV en vivo
explícitamente NO detiene nada, dejando la señal activa.

4.2 Impacto
--------------------------------------------------------------------------------
- El usuario se siente "atrapado" en la pantalla del reproductor.
- La única salida es cerrar toda la aplicación (pérdida de contexto,
  listas cargadas, cuenta Xtream activa en memoria).
- Mala experiencia en dispositivos Android TV / Fire TV donde el botón
  Atrás es el principal mecanismo de navegación.

4.3 Recomendación técnica (sin escribir código aún)
--------------------------------------------------------------------------------
1. Añadir un estado de navegación claro: "en reproducción de TV en vivo"
   vs "en menú principal".
2. Rediseñar el handler del botón Atrás para que, desde TV en vivo:
   - 1er Back: si está en fullscreen, salir de fullscreen Y detener la
     reproducción, volviendo al menú de canales (home) sin cerrar la app.
   - 2do Back (ya en menú/home sin reproducción activa): mostrar
     confirmExitApp().
3. Implementar una función `returnToMainMenu()` que detenga la señal en
   vivo (`stopPlayback()`), salga de fullscreen, oculte el player y posicione
   el foco en el menú principal/categorías.
4. Que `exitFullscreenMode()` detenga la reproducción de TV en vivo también
   (o al menos ofrezca una opción explícita "Detener señal y volver al menú").

5. AUDITORÍA UI/UX Y DISEÑO
--------------------------------------------------------------------------------
5.1 Fortalezas observadas
--------------------------------------------------------------------------------
- Diseño oscuro ("modo cinema") apropiado para reproductor de video.
- Paleta consistente (Azul Neon / Cian) con variables CSS en :root.
- Soporte completo para Android TV / Fire TV: navegación DPAD, foco visible
  (outline azul neon), teclas de medios (Play/Pause, Canal +/-), gestos de
  brillo/volumen.
- Diseño responsivo: layout móvil (pestañas + nav inferior) y layout TV
  landscape (3 columnas: categorías | canales | reproductor).
- Rediseño "Xtream-Masters" (app.css Fase R1-R6): grid de 3 columnas, tabs
  estilo streaming, tarjetas de canal compactas, pósters VOD verticales,
  panel EPG.
- Accesibilidad básica: tabindex en cards, manejo de teclado (Enter),
  badges de estado (EN VIVO, HD/FHD/SD), toasts de notificación.
- Funcionalidades avanzadas: temporizador de apagado, bloqueo de pantalla,
  Picture-in-Picture, cambio de relación de aspecto, selección de pistas de
  audio/subtítulos, diagnóstico de códecs.

5.2 Debilidades y riesgos UI/UX
--------------------------------------------------------------------------------
a) DOBLE SISTEMA DE DISEÑO: coexisten el tema original "Azul Neon" y el
   rediseño "Xtream-Masters" sin un sistema de diseño único. Riesgo de
   inconsistencias visuales y mantenimiento duplicado.
b) DEPENDENCIAS EXTERNAS CRÍTICAS: Tailwind CSS y FontAwesome se cargan por
   CDN (https://cdn.tailwindcss.com, cdnjs). Sin conexión a internet la UI
   se desestiliza y los iconos no se ven (excepto webfonts locales en la APK).
c) SUPERPOSICIÓN REPRODUCTOR / MODAL VOD: el contenedor del player permanece
   montado detrás de los modales VOD/Series. Si la señal no se detiene
   correctamente (Fallo 1), el usuario ve audio superpuesto al catálogo.
d) NAVEGACIÓN ATRÁS AMBIGUA: desde TV en vivo no hay retorno claro al menú
   principal (Fallo 2).
e) VOD SIN REPRODUCTOR INTERNO: las películas/series se abren exclusivamente
   en reproductor externo (VLC/MX). El usuario abandona la app para ver VOD;
   no hay pausa/reanudación dentro de la APK para VOD.
f) CARGA DE CONTENIDO EN CADA CAMBIO DE PESTAÑA: al cambiar de VOD a Live y
   viceversa se vuelve a consultar el panel Xtream (no siempre hay caché
   válida), generando tiempos de espera.
g) OVERLAY DE CONTROLES AUTOCERRABLE: los controles se ocultan tras 3s; en
   TV remoto sin ratón puede ser difícil recuperarlos si no se sabe tocar el
   centro del video.

5.3 Recomendaciones UI/UX (no código)
--------------------------------------------------------------------------------
1. Unificar en un único sistema de diseño (elegir Xtream-Masters o Azul Neon)
   y eliminar reglas CSS solapadas/muertas.
2. Empaquetar Tailwind y FontAwesome localmente para funcionar 100% offline
   en la APK.
3. Garantizar que al abrir cartelera VOD el reproductor de TV en vivo esté
   detenido y oculto (relacionado con Fallo 1).
4. Añadir botón explícito "Volver al menú / Detener señal" en el reproductor
   de TV en vivo (relacionado con Fallo 2).
5. Considerar reproductor interno para VOD (o al menos un modal de "abriendo
   en externo" con confirmación) para no sacar al usuario de la app.
6. Mantener los controles del player visibles por defecto en Android TV
   (DPAD) o añadir indicador claro de cómo recuperarlos.

6. OTROS HALLAZGOS TÉCNICOS MENORES
--------------------------------------------------------------------------------
6.1 app.js, línea 186-196: al cambiar de modo (A↔B) se detiene y limpia
   correctamente la reproducción (buena práctica).
6.2 player.js, línea 255: VOD/Series se redirigen a reproductor externo
   SIEMPRE; no hay camino de reproducción interna para VOD.
6.3 app.js, líneas 1251-1294: `switchContentType` detiene playback al ir a
   VOD/Series pero NO al volver a 'live' (no es necesario, pero el flujo de
   retorno al menú está incompleto).
6.4 xtream.js: `fetchVodStreams` y `fetchSeriesStreams` usan
   `player_api.php` de Xtream; si falla, no hay fallback a M3U para VOD.
6.5 app.js, líneas 66-88 (onBack): si el exit modal está abierto, Back
   ejecuta `exitApplication()` directamente sin segundo confirmación.

7. PLAN DE ACCIÓN (priorizado, sin modificar código en esta fase)
--------------------------------------------------------------------------------
El plan está dividido en 4 fases. Cada fase incluye objetivo, acciones,
entregable y criterio de aceptación. Se estima en días-hombre (d/h) como
referencia relativa.

FASE 1 — CORRECCIÓN DE FALLOS CRÍTICOS (Bloqueador)
--------------------------------------------------------------------------------
Objetivo: eliminar la reproducción en segundo plano al entrar a VOD y
establecer un retorno claro al menú principal desde TV en vivo.

Acciones:
  F1.1 Revisar `switchContentType()`: hacer `await stopPlayback()` antes de
       cargar VOD/Series; eliminar la llamada a `stop()` inexistente.
  F1.2 Crear función unificada `stopAllPlayback()` que detenga HLS.js,
       ExoPlayer nativo y `<video>`, y limpie todos los temporizadores
       (bgRetryTimer, vodStartTimer, controlsTimer).
  F1.3 Usar `stopAllPlayback()` en todos los puntos de salida de TV en vivo:
       cambio a VOD/Series, cambio de modo A/B, retorno al menú, salir de app.
  F1.4 Implementar `returnToMainMenu()`: detener señal, salir de fullscreen,
       ocultar player-container, volver a home/categorías sin cerrar app.
  F1.5 Rediseñar handler de botón Atrás (onBack):
       - En TV en vivo + fullscreen -> detener y volver al menú de canales.
       - En TV en vivo + pantalla normal -> detener y volver al menú.
       - En menú sin reproducción -> confirmExitApp().
  F1.6 Ocultar/desmontar `player-container` al entrar a cartelera VOD y
       restaurarlo al volver a TV en vivo.

Entregable F1: Flujo TV en vivo -> VOD sin audio residual; botón/Back que
devuelve al menú principal sin cerrar la app.
Criterio de aceptación: Al pasar de TV en vivo a VOD, silencio total de la
señal en vivo; desde cualquier pantalla de reproducción, el usuario puede
volver al menú principal sin salir de la APK.

FASE 2 — UI/UX Y DISEÑO (Alta prioridad)
--------------------------------------------------------------------------------
Objetivo: consolidar la experiencia visual y de navegación.

Acciones:
  F2.1 Unificar sistema de diseño (elegir una base: Azul Neon o Xtream-Masters)
       y eliminar reglas CSS muertas o solapadas.
  F2.2 Empaquetar Tailwind CSS y FontAwesome localmente en la APK
       (funcionamiento 100% offline).
  F2.3 Añadir indicador/estado claro de "señal en vivo activa" en el menú
       principal cuando haya reproducción en pausa o fondo.
  F2.4 Mejorar visibilidad de controles del reproductor en Android TV
       (DPAD), evitando que queden ocultos sin aviso.
  F2.5 Revisar z-index y capas: asegurar que modales VOD/Series cubran
       completamente el player y que no haya filtrado de UI del player detrás.

Entregable F2: Identidad visual única, funcionamiento offline, controles
claros en TV, sin superposiciones visuales entre player y modales.

FASE 3 — REPRODUCCIÓN VOD (Media prioridad)
--------------------------------------------------------------------------------
Objetivo: evaluar incorporar reproducción interna de VOD o mejorar la
derivación externa.

Acciones:
  F3.1 Evaluar reproductor interno para VOD (HLS.js/ExoPlayer dentro de la
       app) vs. mantener derivación exclusiva a VLC/MX Player.
  F3.2 Si se mantiene externo: añadir modal de confirmación "Abriendo en
       reproductor externo" y botón para volver a la app tras cerrar externo.
  F3.3 Añadir caché de categorías VOD/Series para evitar reconsultas
       innecesarias al cambiar de pestaña.

Entregable F3: Flujo VOD claro, con o sin reproductor interno, sin pérdida
de contexto de la app.

FASE 4 — ROBUSTEZ Y PRUEBAS (Media prioridad)
--------------------------------------------------------------------------------
Objetivo: estabilizar y validar en dispositivos reales.

Acciones:
  F4.1 Pruebas en Android TV / Fire TV (control remoto, DPAD, fullscreen,
       botón Atrás).
  F4.2 Pruebas de transición Live <-> VOD <-> Series (audio, memoria, focus
       de audio entre WebView y ExoPlayer).
  F4.3 Pruebas offline (sin CDN) y con lista Xtream real.
  F4.4 Validación de fugas de memoria al cambiar repetidamente de canal y
       de modo (MemoryManager ya existe en platform/).

Entregable F4: Informe de pruebas y app estable en dispositivos objetivo.

Resumen de prioridad y esfuerzo estimado (referencia):
  Fase 1 (Críticos):      Alta  | ~5-8 d/h
  Fase 2 (UI/UX):         Alta  | ~6-10 d/h
  Fase 3 (VOD):           Media | ~4-7 d/h
  Fase 4 (Pruebas):       Media | ~5-8 d/h
  Total estimado:         ~20-33 d/h (referencia, a confirmar con el equipo)

8. CRITERIOS DE ACEPTACIÓN / DEFINICIÓN DE HECHO
--------------------------------------------------------------------------------
- [ ] Al cambiar de TV en vivo a VOD, la señal en vivo se detiene por completo
      (sin audio residual).
- [ ] Desde cualquier pantalla de TV en vivo existe una acción clara
      (botón o botón Atrás) que detiene la señal y vuelve al menú principal
      sin cerrar la aplicación.
- [ ] El reproductor de TV en vivo queda oculto/detenido mientras el usuario
      navega la cartelera VOD.
- [ ] La app funciona sin conexión a internet (Tailwind/FontAwesome locales).
- [ ] No hay superposición visual entre el reproductor y los modales VOD/
      Series.
- [ ] Código documentado y sin funciones inexistentes llamadas
      (ej. `stop()`).

9. CONCLUSIÓN
--------------------------------------------------------------------------------
La APK Free-IPTV Pro v1.0.23 tiene una arquitectura de reproducción sólida
(múltiples motores, soporte ExoPlayer nativo, TV remoto, diseño moderno) pero
presenta dos fallos críticos de experiencia que afectan directamente al
usuario:

1. La detención de TV en vivo al entrar a VOD está intencionada pero mal
   implementada (falta de `await`, método `stop()` inexistente, teardown no
   sincronizado), lo que permite que la señal siga sonando de fondo.
2. No existe un camino claro de "volver al menú principal" desde TV en vivo;
   el botón Atrás o bien solo sale del fullscreen manteniendo la señal, o
   bien cierra la aplicación por completo.

Ambos son corregibles con cambios de lógica en `app.js` y `player.js`
(Phase 1 del plan de acción) sin alterar la arquitectura general. Se recomienda
abordar la Fase 1 antes de cualquier otra evolución del producto.

================================================================================
FIN DEL INFORME — No se modificó ningún archivo de código fuente.
================================================================================