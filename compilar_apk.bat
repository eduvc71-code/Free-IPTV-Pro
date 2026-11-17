@echo off
setlocal
cd /d "%~dp0"
chcp 65001 > nul
title Compilador APK - Free-IPTV Pro

echo ================================================================
echo       COMPILANDO Y GENERANDO APK - FREE-IPTV PRO
echo ================================================================
echo.

cd free_iptv_app
call npx cap sync android
if %errorlevel% neq 0 (
    echo [!] Error en capacitor sync.
    cd /d "%~dp0"
    pause
    exit /b 1
)

cd android
call gradlew assembleDebug
if %errorlevel% neq 0 (
    echo [!] Error al compilar con Gradle.
    cd /d "%~dp0"
    pause
    exit /b 1
)

cd /d "%~dp0"
echo.
echo [OK] Compilacion completada con exito.
echo     APK: free_iptv_app\android\app\build\outputs\apk\debug\app-debug.apk
pause
endlocal
