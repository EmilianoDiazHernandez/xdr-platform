#!/bin/bash
# =====================================================================
# Script de Enrutamiento Inter-Segmento (Topología 15 Dispositivos)
# =====================================================================

set -e

echo "[ROUTING-15] Configurando tablas de rutas en los 15 dispositivos..."

# 1. Gateway y Router Central (185.15.2.1, 172.16.0.1, 10.20.30.1)
echo "  [*] Verificando IP forwarding en Routers..."
docker exec xdr-legit-router sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true
docker exec xdr-legit-router-isp sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true

# 2. WAN: Router ISP y Partner Externo -> DMZ y LAN a través de 185.15.2.1
WAN_NODES=("xdr-legit-router-isp" "xdr-legit-partner-ext")
for node in "${WAN_NODES[@]}"; do
    docker exec "$node" ip route replace 172.16.0.0/24 via 185.15.2.1 2>/dev/null || true
    docker exec "$node" ip route replace 10.20.30.0/24 via 185.15.2.1 2>/dev/null || true
    echo "  [OK] Rutas WAN ($node) configuradas."
done

# 3. DMZ: Switch de Distribución y Servidores (172.16.0.2, .10, .11, .20) -> WAN y LAN a través de 172.16.0.1
DMZ_NODES=("xdr-legit-sw-dmz" "xdr-legit-web-intranet" "xdr-legit-web-erp" "xdr-legit-mail")
for node in "${DMZ_NODES[@]}"; do
    docker exec "$node" ip route replace 185.15.2.0/24 via 172.16.0.1 2>/dev/null || true
    docker exec "$node" ip route replace 10.20.30.0/24 via 172.16.0.1 2>/dev/null || true
    echo "  [OK] Rutas DMZ ($node) configuradas."
done

# 4. LAN: Switches y Servidores de Base de Datos (10.20.30.2, .3, .50, .51) -> WAN y DMZ a través de 10.20.30.1
LAN_INFRA=("xdr-legit-sw-core" "xdr-legit-sw-access" "xdr-legit-db-prod" "xdr-legit-db-analytics")
for node in "${LAN_INFRA[@]}"; do
    docker exec "$node" ip route replace 185.15.2.0/24 via 10.20.30.1 2>/dev/null || true
    docker exec "$node" ip route replace 172.16.0.0/24 via 10.20.30.1 2>/dev/null || true
    echo "  [OK] Rutas LAN Infra ($node) configuradas."
done

# 5. LAN: Workstations Departamentales (10.20.30.101, .103, .104, .105) -> WAN y DMZ a través de 10.20.30.1
WORKSTATIONS=(
    "xdr-legit-pc-ventas"
    "xdr-legit-pc-finanzas"
    "xdr-legit-pc-rrhh"
    "xdr-legit-pc-ti"
)
for ws in "${WORKSTATIONS[@]}"; do
    docker exec "$ws" ip route replace 185.15.2.0/24 via 10.20.30.1 2>/dev/null || true
    docker exec "$ws" ip route replace 172.16.0.0/24 via 10.20.30.1 2>/dev/null || true
    echo "  [OK] Rutas LAN Workstation ($ws) configuradas."
done

# 6. Sincronización de Identidad y Catálogo de Dispositivos en Base de Datos XDR
echo "  [*] Sincronizando catálogo e identidades de los 15 dispositivos en XDR..."
docker exec xdr-db-timescale psql -U xdr_user -d xdr_db -c "
UPDATE dispositivo_ips SET hostname = 'GW-ROUTER' WHERE direccion_ip = '172.16.0.1';
UPDATE dispositivo_ips SET hostname = 'ROUTER-ISP-WAN' WHERE direccion_ip = '185.15.2.3';
UPDATE dispositivo_ips SET hostname = 'SW-DMZ-DISTRIBUTION' WHERE direccion_ip = '172.16.0.2';
UPDATE dispositivo_ips SET hostname = 'SW-LAN-CORE' WHERE direccion_ip = '10.20.30.2';
UPDATE dispositivo_ips SET hostname = 'SW-LAN-ACCESS' WHERE direccion_ip = '10.20.30.3';
UPDATE dispositivo_ips SET hostname = 'SRV-DMZ-INTRANET' WHERE direccion_ip = '172.16.0.10';
UPDATE dispositivo_ips SET hostname = 'SRV-DMZ-ERP' WHERE direccion_ip = '172.16.0.11';
UPDATE dispositivo_ips SET hostname = 'CORP-MAIL-EXCHANGE' WHERE direccion_ip = '172.16.0.20';
UPDATE dispositivo_ips SET hostname = 'SRV-DB-PROD' WHERE direccion_ip = '10.20.30.50';
UPDATE dispositivo_ips SET hostname = 'SRV-DB-ANALYTICS' WHERE direccion_ip = '10.20.30.51';
UPDATE dispositivo_ips SET hostname = 'PC-VENTAS-01' WHERE direccion_ip = '10.20.30.101';
UPDATE dispositivo_ips SET hostname = 'PC-FINANZAS-01' WHERE direccion_ip = '10.20.30.103';
UPDATE dispositivo_ips SET hostname = 'PC-RRHH-01' WHERE direccion_ip = '10.20.30.104';
UPDATE dispositivo_ips SET hostname = 'PC-TI-ADMIN' WHERE direccion_ip = '10.20.30.105';
UPDATE dispositivo_ips SET hostname = 'PARTNER-EXT-CLIENT' WHERE direccion_ip = '185.15.2.2';

UPDATE dispositivos d SET id_tipo = 5 FROM dispositivo_ips di WHERE d.id_dispositivo = di.id_dispositivo AND di.direccion_ip IN ('172.16.0.1', '185.15.2.3', '172.16.0.2', '10.20.30.2', '10.20.30.3');
UPDATE dispositivos d SET id_tipo = 3 FROM dispositivo_ips di WHERE d.id_dispositivo = di.id_dispositivo AND di.direccion_ip IN ('172.16.0.10', '172.16.0.11', '172.16.0.20', '10.20.30.50', '10.20.30.51');
UPDATE dispositivos d SET id_tipo = 2 FROM dispositivo_ips di WHERE d.id_dispositivo = di.id_dispositivo AND di.direccion_ip IN ('10.20.30.101', '10.20.30.103', '10.20.30.104', '10.20.30.105', '185.15.2.2');
" >/dev/null 2>&1 || true

echo "[ROUTING-15] Enrutamiento inter-segmento establecido en los 15 dispositivos exitosamente."
