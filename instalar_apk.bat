@echo off
setlocal enabledelayedexpansion
title Instalador Automatico de APK - Free-IPTV Pro

echo ================================================================
echo       INSTALADOR AUTOMATICO DE APK - FREE-IPTV PRO
echo ================================================================
echo.

set "APK_PATH="

if exist "free_iptv_app\android\app\build\outputs\apk\debug\app-debug.apk" (
    set "APK_PATH=free_iptv_app\android\app\build\outputs\apk\debug\app-debug.apk"
) else if exist "Free-IPTV-Pro-v1.0.23.apk" (
    set "APK_PATH=Free-IPTV-Pro-v1.0.23.apk"
) else if exist "Free-IPTV-Pro.apk" (
    set "APK_PATH=Free-IPTV-Pro.apk"
)

if "!APK_PATH!"=="" (
    echo [X] No se encontro el APK generado. Ejecuta compilar_apk.bat primero.
    echo.
    pause
    exit /b 1
)

echo [1/3] Usando APK generado en: !APK_PATH!

:: Detectar ADB
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

echo [3/3] Instalando el nuevo APK en el dispositivo...
%ADB_CMD% install -r "!APK_PATH!"

if errorlevel 0 (
    echo.
    echo ================================================================
    echo  [EXITO] NUEVO APK INSTALADO Y ACTUALIZADO CORRECTAMENTE!
    echo ================================================================
    echo.
    echo Lanzando la aplicacion...
    %ADB_CMD% shell am start -n com.freeiptv.app/.MainActivity
) else (
    echo.
    echo [X] Error al instalar el APK.
)

echo.
pause
