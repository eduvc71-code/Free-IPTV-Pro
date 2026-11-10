@echo off
title World IPTV Checker - Edicion America y Xtream Codes
chcp 65001 > nul
cls
python main.py
if errorlevel 1 (
    echo.
    echo Ocurrio un error al ejecutar Python. Verifica que Python este instalado en tu sistema.
    pause
)
