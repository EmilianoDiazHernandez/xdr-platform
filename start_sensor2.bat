@echo off
title Lanzador de Sensores XDR

:: 1. Comprobar y solicitar permisos de Administrador
NET SESSION >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Permisos de administrador confirmados.
) else (
    echo [!] Solicitando permisos de administrador...
    powershell -Command "Start-Process '%~dpnx0' -Verb RunAs"
    exit /b
)

echo ==================================================
echo       INICIANDO SENSORES LOCALES XDR
echo ==================================================
echo.

:: Nos movemos a la carpeta de los clientes de Windows
cd /d "%~dp0backend\clients"

echo [Configuracion de Email Collector]
set EMAIL_USER=pruebattxdr@gmail.com
set EMAIL_PASS=kdhgsxcjgybkdtkf
echo.

echo [*] Levantando entorno XDR en modo mosaico...

:: 2. Lanzamos Windows Terminal (Haciendo cd a la carpeta de los logs antes de ejecutar)
wt -d . powershell -NoExit -Command "Write-Host '--- SENSOR SYSMON ---' -ForegroundColor Green\; py envio_sysmon2.py" ; split-pane -V -d . cmd /k "color 0B & echo --- SENSOR EMAIL --- & py email_collector.py" ; split-pane -H -d . wsl -d Ubuntu bash -c "cd /home/spider/\; echo --- SENSOR ZEEK ---\; sudo ./start_sensor.sh\; exec bash"

echo.
echo [!] El dashboard XDR se ha abierto en Windows Terminal.