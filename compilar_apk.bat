@echo off
setlocal enabledelayedexpansion
title Compilador APK - Free-IPTV Pro

echo ================================================================
echo       COMPILANDO Y GENERANDO APK - FREE-IPTV PRO
echo ================================================================
echo.

powershell -ExecutionPolicy Bypass -File .\build_app.ps1

if exist "Free-IPTV-Pro-v1.0.20.apk" (
    echo.
    echo [OK] APK generado y sincronizado correctamente como Free-IPTV-Pro-v1.0.20.apk y Free-IPTV-Pro.apk
) else (
    echo.
    echo [!] Aviso: No se encontro el APK en la ruta esperada.
)

echo.
pause
