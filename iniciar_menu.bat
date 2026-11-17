@echo off
setlocal
cd /d "%~dp0"
chcp 65001 > nul
title World IPTV Checker - Uso local
python main.py
if errorlevel 1 (
    echo.
    echo [!] Error al ejecutar Python. Verifica que Python este instalado y en el PATH.
    pause
    exit /b 1
)
pause
endlocal
