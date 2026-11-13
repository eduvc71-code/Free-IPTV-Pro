@echo off
setlocal enabledelayedexpansion
title Instalador Automatico de APK - Free-IPTV Pro

echo ================================================================
echo       INSTALADOR AUTOMATICO DE APK - FREE-IPTV PRO
echo ================================================================
echo.

:: 1. Buscar el APK mas reciente en la raiz o en build/outputs
set "APK_PATH="

if exist "Free-IPTV-Pro-v1.0.19.apk" (
    set "APK_PATH=Free-IPTV-Pro-v1.0.19.apk"
) else if exist "Free-IPTV-Pro.apk" (
    set "APK_PATH=Free-IPTV-Pro.apk"
) else if exist "free_iptv_app\android\app\build\outputs\apk\debug\app-debug.apk" (
    set "APK_PATH=free_iptv_app\android\app\build\outputs\apk\debug\app-debug.apk"
) else (
    for %%f in (Free-IPTV-Pro-v1.0.*.apk) do (
        set "APK_PATH=%%f"
    )
)

if "!APK_PATH!"=="" (
    echo [X] No se encontro ningun archivo APK valido en la raiz.
    echo     Ejecuta compilar_apk.bat o compilar_apk.ps1 primero.
    echo.
    pause
    exit /b 1
)

echo [1/3] APK detectado: !APK_PATH!

:: 2. Detectar ADB
set "ADB_CMD=adb"
%ADB_CMD% devices >nul 2>&1
if errorlevel 1 (
    if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" (
        set "ADB_CMD=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
    ) else if exist "C:\Android\Sdk\platform-tools\adb.exe" (
        set "ADB_CMD=C:\Android\Sdk\platform-tools\adb.exe"
    ) else (
        echo [X] No se pudo encontrar adb.exe. Asegurate de tener Android SDK instalado.
        echo.
        pause
        exit /b 1
    )
)

echo [2/3] Verificando dispositivo conectado...
%ADB_CMD% devices
for /f "tokens=2" %%i in ('%ADB_CMD% devices ^| findstr /r "\<device\>"') do (
    set "DEVICE_FOUND=1"
)

if not defined DEVICE_FOUND (
    echo [!] No se detecto ningun dispositivo Android conectado por USB.
    echo     Conecta tu celular con Depuracion USB activada.
    echo.
    pause
    exit /b 1
)

echo [3/3] Instalando la aplicacion en el dispositivo...
%ADB_CMD% install -r "!APK_PATH!"

if errorlevel 0 (
    echo.
    echo ================================================================
    echo  [EXITO] APLICACION INSTALADA Y ACTUALIZADA CORRECTAMENTE!
    echo ================================================================
    echo.
    echo Lanzando la aplicacion en el dispositivo...
    %ADB_CMD% shell am start -n com.freeiptv.app/.MainActivity
) else (
    echo.
    echo [X] Error al instalar el APK.
)

echo.
pause
