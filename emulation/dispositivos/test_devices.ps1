# =====================================================================
# Script de Verificación y Compilación Unitaria de Dispositivos XDR (Fase 1)
# =====================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   XDR Platform: Prueba de Aislamiento de Dispositivos    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Pruebas Unitarias de Lógica y Esquemas en Python
Write-Host "`n[PASO 1] Ejecutando pruebas unitarias de lógica y esquemas de telemetría..." -ForegroundColor Yellow
python emulation/dispositivos/test_device_units.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Las pruebas unitarias de Python fallaron." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Todas las pruebas unitarias de Python pasaron con exito." -ForegroundColor Green

# 2. Verificación de Conectividad con Docker
Write-Host "`n[PASO 2] Verificando estado del demonio de Docker..." -ForegroundColor Yellow
docker info > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[AVISO] Docker Desktop no se encuentra en ejecucion o el demonio no responde." -ForegroundColor Yellow
    Write-Host "Inicie Docker Desktop para compilar y probar los contenedores en vivo." -ForegroundColor DarkGray
    exit 0
}

# 3. Compilación de Cada Dispositivo en Aislamiento
$devices = @(
    @{ Name = "xdr-device-base"; Path = "emulation/dispositivos/base" },
    @{ Name = "xdr-device-attacker"; Path = "emulation/dispositivos/attacker" },
    @{ Name = "xdr-device-web"; Path = "emulation/dispositivos/server-web" },
    @{ Name = "xdr-device-mail"; Path = "emulation/dispositivos/server-mail" },
    @{ Name = "xdr-device-workstation"; Path = "emulation/dispositivos/workstation" },
    @{ Name = "xdr-device-db"; Path = "emulation/dispositivos/server-db" }
)

Write-Host "`n[PASO 3] Compilando imagenes de contenedores de dispositivos..." -ForegroundColor Yellow
foreach ($dev in $devices) {
    Write-Host "Compilando $($dev.Name) desde $($dev.Path)..." -NoNewline
    docker build -t $dev.Name $dev.Path > $null 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " [OK]" -ForegroundColor Green
    } else {
        Write-Host " [ERROR]" -ForegroundColor Red
        Write-Host "Detalle del error en $($dev.Name):"
        docker build -t $dev.Name $dev.Path
        exit 1
    }
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "  Fase 1 Completada con Exito: Dispositivos Verificados   " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
