@echo off
setlocal
cd /d "%~dp0"
chcp 65001 > nul
title Instalador Automatico de APK - Free-IPTV Pro

echo ================================================================
echo       INSTALADOR AUTOMATICO DE APK - FREE-IPTV PRO
echo ================================================================
echo.

set "APK_PATH="
if exist "free_iptv_app\android\app\build\outputs\apk\debug\app-debug.apk" (
    set "APK_PATH=free_iptv_app\android\app\build\outputs\apk\debug\app-debug.apk"
) else if exist "Free-IPTV-Pro.apk" (
    set "APK_PATH=Free-IPTV-Pro.apk"
) else if exist "app-debug.apk" (
    set "APK_PATH=app-debug.apk"
)

if "%APK_PATH%"=="" (
    echo [!] No se encontro ningun APK debug en las rutas esperadas.
    echo     Ejecuta compilar_apk.bat primero.
    echo.
    pause
    exit /b 1
)

echo [OK] APK encontrado: %APK_PATH%
echo [*] Verificando dispositivo conectado via ADB...

set "ADB=adb"
if defined ANDROID_HOME (
    if exist "%ANDROID_HOME%\platform-tools\adb.exe" (
        set "ADB=%ANDROID_HOME%\platform-tools\adb.exe"
    )
)

"%ADB%" devices
if %errorlevel% neq 0 (
    echo [!] No se pudo ejecutar adb. Instala el SDK de Android o define ANDROID_HOME.
    echo.
    pause
    exit /b 1
)

"%ADB%" install -r "%APK_PATH%"
if %errorlevel% neq 0 (
    echo.
    echo [!] Error al instalar el APK en el dispositivo.
    echo     Comprueba que el dispositivo este autorizado (dialogo USB debugging).
    echo.
    pause
    exit /b 1
)

echo.
echo [OK] APK instalado con exito.
pause
endlocal
