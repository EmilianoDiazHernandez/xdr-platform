#!/bin/bash
# =====================================================================
# Script de Verificación de Conectividad (Topología 15 Dispositivos)
# =====================================================================

set -e

echo "=========================================================="
echo "   Verificación de Topología: 15 Dispositivos XDR         "
echo "=========================================================="

CONTAINERS=(
    "xdr-legit-router"
    "xdr-legit-router-isp"
    "xdr-legit-partner-ext"
    "xdr-legit-sw-dmz"
    "xdr-legit-web-intranet"
    "xdr-legit-web-erp"
    "xdr-legit-mail"
    "xdr-legit-sw-core"
    "xdr-legit-sw-access"
    "xdr-legit-db-prod"
    "xdr-legit-db-analytics"
    "xdr-legit-pc-ventas"
    "xdr-legit-pc-finanzas"
    "xdr-legit-pc-rrhh"
    "xdr-legit-pc-ti"
)

# 1. Comprobar que los 15 contenedores estén corriendo
echo -e "\n[1/5] Verificando estado de los 15 dispositivos..."
MISSING=0
for c in "${CONTAINERS[@]}"; do
    STATUS=$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null || echo "false")
    if [ "$STATUS" == "true" ]; then
        echo "  [OK] Dispositivo $c está ACTIVO"
    else
        echo "  [FAIL] Dispositivo $c NO está en ejecución"
        MISSING=$((MISSING + 1))
    fi
done

if [ "$MISSING" -gt 0 ]; then
    echo -e "\n[ERROR] Hay $MISSING dispositivos inactivos. Ejecuta: docker compose -f emulation/topologias/red-corporativa-15-nodos/docker-compose.yml up -d"
    exit 1
fi

# 2. Prueba WAN -> DMZ
echo -e "\n[2/5] Probando conectividad WAN -> DMZ (Partner Externo a Intranet)..."
if docker exec xdr-legit-partner-ext ping -c 2 -W 2 172.16.0.10 >/dev/null 2>&1; then
    echo "  [OK] Ping WAN (185.15.2.2) -> DMZ (172.16.0.10) exitoso"
else
    echo "  [FAIL] Ping WAN -> DMZ fallido"
fi

HTTP_CODE=$(docker exec xdr-legit-partner-ext curl -s -o /dev/null -w "%{http_code}" http://172.16.0.10/ 2>/dev/null || echo "000")
if [ "$HTTP_CODE" == "200" ]; then
    echo "  [OK] HTTP GET de Partner Externo a Intranet respondió 200 OK"
else
    echo "  [FAIL] HTTP GET respondió código: $HTTP_CODE"
fi

# 3. Pruebas de Switches Gestionados (Health y Puertos)
echo -e "\n[3/5] Verificando estado operativo de los Switches..."
SWITCHES=("xdr-legit-sw-dmz:172.16.0.2:DMZ" "xdr-legit-sw-core:10.20.30.2:Core" "xdr-legit-sw-access:10.20.30.3:Access")
for sw_info in "${SWITCHES[@]}"; do
    IFS=":" read -r sw_name sw_ip sw_label <<< "$sw_info"
    SW_CODE=$(docker exec "$sw_name" curl -s -o /dev/null -w "%{http_code}" "http://localhost:80/health" 2>/dev/null || echo "000")
    if [ "$SW_CODE" == "200" ]; then
        echo "  [OK] Switch $sw_label ($sw_ip) operativo y respondiendo HTTP 200"
    else
        echo "  [FAIL] Switch $sw_label respondió código: $SW_CODE"
    fi
done

# 4. Pruebas LAN -> DMZ (Workstations a los portales web respectivos)
echo -e "\n[4/5] Probando conectividad LAN -> DMZ desde estaciones departamentales..."
LAN_TESTS=(
    "xdr-legit-pc-ventas:http://172.16.0.11/:ERP"
    "xdr-legit-pc-finanzas:http://172.16.0.11/:ERP"
    "xdr-legit-pc-rrhh:http://172.16.0.10/:Intranet"
    "xdr-legit-pc-ti:http://172.16.0.10/:Intranet"
)

for test_item in "${LAN_TESTS[@]}"; do
    IFS=":" read -r ws url target_name <<< "$test_item"
    CODE=$(docker exec "$ws" curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    if [ "$CODE" == "200" ]; then
        echo "  [OK] $ws -> $target_name ($url) respondió 200 OK"
    else
        echo "  [FAIL] $ws -> $target_name respondió: $CODE"
    fi
done

# 5. Verificación del Sensor Zeek en el Router
echo -e "\n[5/5] Verificando proceso Zeek sniffer en el Router..."
if docker exec xdr-legit-router ps aux 2>&1 | grep -q "zeek"; then
    echo "  [OK] Proceso Zeek sniffer activo y capturando en xdr-legit-router"
else
    echo "  [AVISO] Proceso Zeek no encontrado en ps aux del router"
fi

echo -e "\n=========================================================="
echo "   Verificación de Topología de 15 Nodos Finalizada       "
echo "=========================================================="
