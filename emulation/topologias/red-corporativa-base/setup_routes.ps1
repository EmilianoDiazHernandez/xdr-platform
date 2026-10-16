# =====================================================================
# Script de Enrutamiento Inter-Segmento XDR (Fase 2 - PowerShell)
# =====================================================================

Write-Host "Configurando tablas de rutas en los contenedores..." -ForegroundColor Cyan

# 1. Atacante (WAN: 185.15.2.2) -> DMZ y LAN a traves de 185.15.2.1
docker exec xdr-emu-attacker ip route replace 172.16.0.0/24 via 185.15.2.1
docker exec xdr-emu-attacker ip route replace 10.20.30.0/24 via 185.15.2.1
Write-Host "  [OK] Rutas de Atacante configuradas (via 185.15.2.1)" -ForegroundColor Green

# 2. Servidor Web (DMZ: 172.16.0.10) -> WAN y LAN a traves de 172.16.0.1
docker exec xdr-emu-web ip route replace 185.15.2.0/24 via 172.16.0.1
docker exec xdr-emu-web ip route replace 10.20.30.0/24 via 172.16.0.1
Write-Host "  [OK] Rutas de Servidor Web configuradas (via 172.16.0.1)" -ForegroundColor Green

# 3. Servidor de Correo (DMZ: 172.16.0.20) -> WAN y LAN a traves de 172.16.0.1
docker exec xdr-emu-mail ip route replace 185.15.2.0/24 via 172.16.0.1
docker exec xdr-emu-mail ip route replace 10.20.30.0/24 via 172.16.0.1
Write-Host "  [OK] Rutas de Servidor Mail configuradas (via 172.16.0.1)" -ForegroundColor Green

# 4. Workstation (LAN: 10.20.30.45) -> WAN y DMZ a traves de 10.20.30.1
docker exec xdr-emu-workstation ip route replace 185.15.2.0/24 via 10.20.30.1
docker exec xdr-emu-workstation ip route replace 172.16.0.0/24 via 10.20.30.1
Write-Host "  [OK] Rutas de Workstation configuradas (via 10.20.30.1)" -ForegroundColor Green

# 5. Base de Datos (LAN: 10.20.30.50) -> WAN y DMZ a traves de 10.20.30.1
docker exec xdr-emu-db ip route replace 185.15.2.0/24 via 10.20.30.1
docker exec xdr-emu-db ip route replace 172.16.0.0/24 via 10.20.30.1
Write-Host "  [OK] Rutas de Base de Datos configuradas (via 10.20.30.1)" -ForegroundColor Green

Write-Host "Enrutamiento inter-segmento establecido exitosamente." -ForegroundColor Cyan
