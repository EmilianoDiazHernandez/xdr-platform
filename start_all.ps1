# ==========================================================
# start_all.ps1 - Orquestador Global XDR + Cyber Range
# ==========================================================
param(
    [switch]$Clean = $false
)
$ErrorActionPreference = "Stop"

# Asegurar que siempre corra desde el directorio raíz de xdr-platform
Set-Location $PSScriptRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Iniciando Plataforma XDR y Cyber Range Completo        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Iniciar Plataforma XDR (Backend, Frontend, TimescaleDB, Redis)
Write-Host "`n[1/3] Levantando Plataforma XDR (SOC / Backend / Frontend)..." -ForegroundColor Yellow
docker compose up -d --build

Write-Host "Esperando inicializacion de la API XDR (http://localhost:8000/health)..." -ForegroundColor Gray
$retries = 30
$ready = $false
for ($i = 1; $i -le $retries; $i++) {
    try {
        $res = Invoke-RestMethod -Uri "http://localhost:8000/health" -TimeoutSec 2 -ErrorAction Stop
        if ($res.status -eq "ok") {
            $ready = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 2
    }
}

if ($ready) {
    Write-Host "  [OK] Plataforma XDR lista y saludable." -ForegroundColor Green
} else {
    Write-Host "  [AVISO] La API aun esta iniciando, continuando con el despliegue..." -ForegroundColor Yellow
}

if ($Clean) {
    Write-Host "`n[FLAG -Clean detectado] Purgando base de datos y cache para arranque limpio..." -ForegroundColor Cyan
    & "$PSScriptRoot\reset_db.ps1"
}

# 2. Iniciar Red Corporativa Emulada y Pipeline de Ingesta
Write-Host "`n[2/3] Levantando Cyber Range (Red Corporativa Emulada + Zeek)..." -ForegroundColor Yellow
docker compose -f .\emulation\topologias\red-corporativa-base\docker-compose.yml up -d

# 3. Resumen de Acceso
Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "   SISTEMA COMPLETAMENTE OPERATIVO EN VIVO                 " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Consola del Analista SOC (Frontend):  http://localhost:3000" -ForegroundColor White
Write-Host "  Consola de Ataques C2 (Emulacion):   http://localhost:9000" -ForegroundColor White
Write-Host "  Documentacion OpenAPI XDR:          http://localhost:8000/docs" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green
