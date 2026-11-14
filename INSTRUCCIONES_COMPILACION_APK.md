================================================================================
INSTRUCCIONES DE COMPILACIÓN APK — Free-IPTV Pro v1.0.23
(Fases 1 y 2 aplicadas y validadas con pruebas unitarias)
================================================================================

REQUISITOS PREVIOS (en tu PC)
--------------------------------------------------------------------------------
1. Java Development Kit (JDK) 8 o 17 instalado
   - Variable de entorno: JAVA_HOME
2. Android SDK / Android Studio instalado
   - Variable de entorno: ANDROID_HOME (apuntar al SDK de Android)
   - Añadir %ANDROID_HOME%\platform-tools y %ANDROID_HOME%\tools al PATH
3. Gradle (opcional, el proyecto incluye gradlew)
4. Node.js instalado (ya verificado: v22.23.3)

En tu celular Android:
- Activar "Opciones de desarrollador"
- Activar "Depuración USB"
- Conectar el celular por USB al PC y aceptar la depuración

================================================================================
PASOS DE COMPILACIÓN
================================================================================

PASO 1 — Sincronizar recursos web con la app Capacitor
--------------------------------------------------------------------------------
El código HTML/CSS/JS vive en `free_iptv_app/www/`. Debe copiarse a la plataforma
Android nativa.

Abrir terminal en: `free_iptv_app/`

cd "C:\Users\Eduardo\Downloads\world_ip_tv-1.6.0.1\world_ip_tv-1.6.0.1\free_iptv_app"

npx cap copy
npx cap sync

Esto copia www/ a android/app/src/main/assets/public/ y sincroniza plugins.

PASO 2 — Abrir el proyecto en Android Studio (opcional, para revisar)
--------------------------------------------------------------------------------
npx cap open android

PASO 3 — Compilar el APK
--------------------------------------------------------------------------------
Opción A: Usando los scripts del proyecto (raíz del repositorio)

En PowerShell (como administrador si es necesario):
  .\compilar_apk.ps1

O en CMD:
  compilar_apk.bat

Opción B: Compilación directa con Gradle desde free_iptv_app/android/

cd android
.\gradlew assembleDebug

El APK resultante se genera en:
  free_iptv_app/android/app/build/outputs/apk/debug/app-debug.apk

PASO 4 — Instalar en el celular (depuración USB activa)
--------------------------------------------------------------------------------
Desde la carpeta del proyecto (raíz):

.\instalar_apk.bat

O manualmente con adb:

adb install -r "free_iptv_app/android/app/build/outputs/apk/debug/app-debug.apk"

PASO 5 — Verificar en el celular
--------------------------------------------------------------------------------
1. Abrir la app Free-IPTV Pro
2. Conectar tu cuenta Xtream / cargar una lista (Modo B)
3. Reproducir un canal de TV en Vivo
4. Ir a Películas (VOD) → debe detenerse el audio del canal en vivo
5. Presionar botón Atrás (Back) desde TV en vivo → debe detener la señal y
   volver al menú principal sin cerrar la app
6. Verificar que aparece el badge rojo "EN VIVO" en el header cuando hay
   señal activa

================================================================================
ARCHIVOS MODIFICADOS (Fases 1 y 2)
================================================================================

free_iptv_app/www/js/app.js
  - switchContentType: async + await stopPlayback() antes de cargar VOD/Series
  - Eliminadas llamadas a playerManager.stop() (método inexistente)
  - Nueva función returnToMainMenu() (volver al menú sin cerrar app)
  - Nueva función updateLiveSignalIndicator() (badge EN VIVO en header)
  - openMediaInExternalPlayer: async + await stopPlayback()
  - window.tvNavigation.onBack: detiene señal y vuelve al menú desde TV en vivo

free_iptv_app/www/css/app.css
  - Agregadas clases .grid, .grid-cols-2 (funcionamiento offline)
  - Agregada clase .shadow-neon (mapeo de color Neon)
  - Agregados estilos .live-signal-indicator (badge EN VIVO)

free_iptv_app/www/index.html
  - Agregado elemento #live-signal-indicator en el header TV

================================================================================
NOTA
================================================================================
Todas las modificaciones fueron validadas con pruebas unitarias en entorno
aislado (Node.js) antes de aplicarse a los archivos reales. 13/13 pruebas
pasaron (7 de Fase 1 + 6 de Fase 2).

================================================================================