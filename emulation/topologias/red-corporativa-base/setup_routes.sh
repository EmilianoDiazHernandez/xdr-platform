#!/bin/bash
# =====================================================================
# Script de Enrutamiento Inter-Segmento XDR (Fase 2)
# =====================================================================

set -e

echo "[ROUTING] Configurando tablas de rutas en los contenedores..."

# 1. Atacante (WAN: 185.15.2.2) -> DMZ y LAN a traves de 185.15.2.1
docker exec xdr-emu-attacker ip route replace 172.16.0.0/24 via 185.15.2.1 2>/dev/null || true
docker exec xdr-emu-attacker ip route replace 10.20.30.0/24 via 185.15.2.1 2>/dev/null || true
echo "  [OK] Rutas de Atacante configuradas (via 185.15.2.1)"

# 2. Servidor Web (DMZ: 172.16.0.10) -> WAN y LAN a traves de 172.16.0.1
docker exec xdr-emu-web ip route replace 185.15.2.0/24 via 172.16.0.1 2>/dev/null || true
docker exec xdr-emu-web ip route replace 10.20.30.0/24 via 172.16.0.1 2>/dev/null || true
echo "  [OK] Rutas de Servidor Web configuradas (via 172.16.0.1)"

# 3. Servidor de Correo (DMZ: 172.16.0.20) -> WAN y LAN a traves de 172.16.0.1
docker exec xdr-emu-mail ip route replace 185.15.2.0/24 via 172.16.0.1 2>/dev/null || true
docker exec xdr-emu-mail ip route replace 10.20.30.0/24 via 172.16.0.1 2>/dev/null || true
echo "  [OK] Rutas de Servidor Mail configuradas (via 172.16.0.1)"

# 4. Workstation (LAN: 10.20.30.45) -> WAN y DMZ a traves de 10.20.30.1
docker exec xdr-emu-workstation ip route replace 185.15.2.0/24 via 10.20.30.1 2>/dev/null || true
docker exec xdr-emu-workstation ip route replace 172.16.0.0/24 via 10.20.30.1 2>/dev/null || true
echo "  [OK] Rutas de Workstation configuradas (via 10.20.30.1)"

# 5. Base de Datos (LAN: 10.20.30.50) -> WAN y DMZ a traves de 10.20.30.1
docker exec xdr-emu-db ip route replace 185.15.2.0/24 via 10.20.30.1 2>/dev/null || true
docker exec xdr-emu-db ip route replace 172.16.0.0/24 via 10.20.30.1 2>/dev/null || true
echo "  [OK] Rutas de Base de Datos configuradas (via 10.20.30.1)"

echo "[ROUTING] Enrutamiento inter-segmento establecido exitosamente."
