@echo off
title Lanzador de Sensores XDR
echo ==================================================
echo       INICIANDO SENSORES LOCALES XDR
echo ==================================================
echo.

:: Nos movemos a la carpeta de los clientes
cd /d "%~dp0backend\clients"

:: Pedimos las credenciales para el recolector de email
echo [Configuracion de Email Collector]
set EMAIL_USER=pruebattxdr@gmail.com
set EMAIL_PASS=kdhgsxcjgybkdtkf
echo.

:: Levantamos Sysmon en una nueva ventana
echo [*] Levantando email_sysmon2.py...
start "Sensor XDR - Red" cmd /k "color 0a & echo --- SENSOR RED --- & py envio_sysmon2.py"
:: Levantamos Email Collector en otra nueva ventana
echo [*] Levantando email_collector.py...
start "Sensor XDR - Email (IMAP)" cmd /k "color 0B && echo --- SENSOR EMAIL --- && py email_collector.py"

echo.
echo [!] Los sensores se estan ejecutando en ventanas separadas.
echo [!] Puedes cerrar esta ventana.
pause
