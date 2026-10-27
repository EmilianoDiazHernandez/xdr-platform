# =====================================================================
# Script de Enrutamiento Inter-Segmento (Topología 15 Dispositivos)
# =====================================================================

Write-Host "[ROUTING-15] Configurando tablas de rutas en los 15 dispositivos..." -ForegroundColor Cyan

docker exec xdr-legit-router sysctl -w net.ipv4.ip_forward=1 2>$null
docker exec xdr-legit-router-isp sysctl -w net.ipv4.ip_forward=1 2>$null

# WAN Nodes
$wanNodes = @("xdr-legit-router-isp", "xdr-legit-partner-ext")
foreach ($node in $wanNodes) {
    docker exec $node ip route replace 172.16.0.0/24 via 185.15.2.1 2>$null
    docker exec $node ip route replace 10.20.30.0/24 via 185.15.2.1 2>$null
    Write-Host "  [OK] Rutas WAN ($node) configuradas." -ForegroundColor Green
}

# DMZ Nodes
$dmzNodes = @("xdr-legit-sw-dmz", "xdr-legit-web-intranet", "xdr-legit-web-erp", "xdr-legit-mail")
foreach ($node in $dmzNodes) {
    docker exec $node ip route replace 185.15.2.0/24 via 172.16.0.1 2>$null
    docker exec $node ip route replace 10.20.30.0/24 via 172.16.0.1 2>$null
    Write-Host "  [OK] Rutas DMZ ($node) configuradas." -ForegroundColor Green
}

# LAN Infra
$lanInfra = @("xdr-legit-sw-core", "xdr-legit-sw-access", "xdr-legit-db-prod", "xdr-legit-db-analytics")
foreach ($node in $lanInfra) {
    docker exec $node ip route replace 185.15.2.0/24 via 10.20.30.1 2>$null
    docker exec $node ip route replace 172.16.0.0/24 via 10.20.30.1 2>$null
    Write-Host "  [OK] Rutas LAN Infra ($node) configuradas." -ForegroundColor Green
}

# LAN Workstations
$workstations = @("xdr-legit-pc-ventas", "xdr-legit-pc-finanzas", "xdr-legit-pc-rrhh", "xdr-legit-pc-ti")
foreach ($ws in $workstations) {
    docker exec $ws ip route replace 185.15.2.0/24 via 10.20.30.1 2>$null
    docker exec $ws ip route replace 172.16.0.0/24 via 10.20.30.1 2>$null
    Write-Host "  [OK] Rutas LAN Workstation ($ws) configuradas." -ForegroundColor Green
}

Write-Host "`n[ROUTING-15] Enrutamiento inter-segmento establecido exitosamente." -ForegroundColor Cyan
