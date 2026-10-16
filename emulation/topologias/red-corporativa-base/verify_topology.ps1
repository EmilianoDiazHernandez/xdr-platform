# =====================================================================
# Script de Verificación de Conectividad de Topología XDR (Fase 2)
# =====================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   XDR Platform: Verificacion de Topologia y Enrutamiento " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Comprobar que los contenedores esten corriendo
$containers = @("xdr-emu-router", "xdr-emu-attacker", "xdr-emu-web", "xdr-emu-mail", "xdr-emu-workstation", "xdr-emu-db")
Write-Host "`n[1/5] Verificando estado de los contenedores..." -ForegroundColor Yellow
$missing = @()
foreach ($c in $containers) {
    $status = docker inspect -f '{{.State.Running}}' $c 2>$null
    if ($status -eq "true") {
        Write-Host "  [OK] Contenedor $c esta ACTIVO" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] Contenedor $c NO esta en ejecucion" -ForegroundColor Red
        $missing += $c
    }
}

if ($missing.Count -gt 0) {
    Write-Host "`n[ERROR] Hay contenedores inactivos. Ejecute: docker compose -f emulation/topologias/red-corporativa-base/docker-compose.yml up -d" -ForegroundColor Red
    exit 1
}

# 2. Prueba WAN -> DMZ (Atacante a Servidor Web)
Write-Host "`n[2/5] Probando conectividad WAN -> DMZ (Atacante a Web Server)..." -ForegroundColor Yellow
$pingRes = docker exec xdr-emu-attacker ping -c 2 -W 2 172.16.0.10 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] Ping WAN (185.15.2.2) -> DMZ (172.16.0.10) exitoso" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Ping WAN -> DMZ fallido. Detalle: $pingRes" -ForegroundColor Red
}

$httpRes = docker exec xdr-emu-attacker curl -s -o /dev/null -w "%{http_code}" http://172.16.0.10/ 2>&1
if ($httpRes -eq "200") {
    Write-Host "  [OK] HTTP GET de Atacante a DMZ Web Server respondio 200 OK" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] HTTP GET respondio codigo: $httpRes" -ForegroundColor Red
}

# 3. Prueba LAN -> DMZ (Workstation a Servidor Web)
Write-Host "`n[3/5] Probando conectividad LAN -> DMZ (Workstation a Web Server)..." -ForegroundColor Yellow
$lanHttpRes = docker exec xdr-emu-workstation curl -s -o /dev/null -w "%{http_code}" http://172.16.0.10/ 2>&1
if ($lanHttpRes -eq "200") {
    Write-Host "  [OK] HTTP GET de Workstation (10.20.30.45) -> DMZ Web Server respondio 200 OK" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] HTTP LAN -> DMZ respondio: $lanHttpRes" -ForegroundColor Red
}

# 4. Prueba LAN -> LAN (Workstation a Base de Datos)
Write-Host "`n[4/5] Probando conectividad interna LAN -> LAN (Workstation a DB)..." -ForegroundColor Yellow
$dbPingRes = docker exec xdr-emu-workstation ping -c 2 -W 2 10.20.30.50 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] Conectividad interna LAN (10.20.30.45 -> 10.20.30.50) exitosa" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Conectividad LAN interna fallida: $dbPingRes" -ForegroundColor Red
}

# 5. Verificación del Sensor Zeek en el Router
Write-Host "`n[5/5] Verificando proceso y capacidades del Router/Sensor..." -ForegroundColor Yellow
$zeekProc = docker exec xdr-emu-router ps aux 2>&1
if ($zeekProc -match "zeek") {
    Write-Host "  [OK] Proceso Zeek sniffer activo en xdr-emu-router" -ForegroundColor Green
} else {
    Write-Host "  [AVISO] Proceso Zeek no encontrado en ps aux. Detalle: $zeekProc" -ForegroundColor Yellow
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "   Verificacion de Topologia Fase 2 Finalizada            " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
