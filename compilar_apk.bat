@echo off
setlocal enabledelayedexpansion
title Compilador APK - Free-IPTV Pro

echo ================================================================
echo       COMPILANDO Y GENERANDO APK - FREE-IPTV PRO
echo ================================================================
echo.

powershell -ExecutionPolicy Bypass -File .\build_app.ps1

echo.
pause
