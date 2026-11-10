@echo off
setlocal enabledelayedexpansion
title Generador de APK - Free-IPTV Pro Android
cls
echo =================================================================
echo        GENERADOR Y COMPILADOR DE APK - FREE-IPTV PRO
echo =================================================================
echo.

set "ROOT_DIR=%~dp0"
set "APP_DIR=%ROOT_DIR%free_iptv_app"
set "ANDROID_DIR=%APP_DIR%\android"
set "SDK_PATH=%LOCALAPPDATA%\Android\Sdk"

echo [*] Verificando entorno de Android SDK...
if not exist "%ANDROID_DIR%\local.properties" (
    echo sdk.dir=%SDK_PATH:\=\\% > "%ANDROID_DIR%\local.properties"
)

echo [*] Sincronizando recursos web con Capacitor...
cd /d "%APP_DIR%"
call npx.cmd cap copy
if errorlevel 1 (
    echo [!] Error al sincronizar recursos con Capacitor.
    pause
    exit /b 1
)

echo.
echo [*] Compilando APK con Gradle (assembleDebug)...
cd /d "%ANDROID_DIR%"
call gradlew.bat assembleDebug
if errorlevel 1 (
    echo [!] Error en la compilacion de Gradle.
    pause
    exit /b 1
)

echo.
echo [*] Firmando y alineando APK con uber-apk-signer...
cd /d "%ROOT_DIR%"
if exist "%ANDROID_DIR%\app\build\outputs\apk\debug\app-debug.apk" (
    java -jar uber-apk-signer.jar -a "%ANDROID_DIR%\app\build\outputs\apk\debug\app-debug.apk" -o . --allowResign
    if exist "app-debug-aligned-debugSigned.apk" (
        copy /y "app-debug-aligned-debugSigned.apk" "Free-IPTV-Pro.apk" > nul
        del /f /q "app-debug-aligned-debugSigned.apk" "app-debug-aligned-debugSigned.apk.idsig" > nul 2>&1
        echo.
        echo =================================================================
        echo  [OK] APK COMPILADA Y FIRMADA EXITOSAMENTE
        echo  Archivo generado: Free-IPTV-Pro.apk - Listo para instalar
        echo =================================================================
        echo.
    )
) else (
    echo [!] No se encontro el APK generado por Gradle.
)

pause