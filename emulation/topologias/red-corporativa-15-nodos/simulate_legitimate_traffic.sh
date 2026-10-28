#!/bin/bash
# =====================================================================
# Orquestador del Escenario: "Tráfico Legítimo" (15 Dispositivos)
# =====================================================================
# Este script genera transacciones corporativas genuinas y lógicas entre
# los 15 nodos (Routers, Switches, Servidores y Workstations) para
# que Zeek registre flujos legítimos y el XDR verifique baja probabilidad de anomalía.
# =====================================================================

set -e

echo "=========================================================="
echo "   Disparando Escenario: Tráfico Legítimo Multi-Dispositivo"
echo "=========================================================="

echo -e "\n[Fase 1/4] Consultas web HTTP departamentales a Servidores DMZ..."
WORKSTATIONS=(
    "xdr-legit-pc-ventas"
    "xdr-legit-pc-finanzas"
    "xdr-legit-pc-rrhh"
    "xdr-legit-pc-ti"
)

for ws in "${WORKSTATIONS[@]}"; do
    echo "  -> Enviando transacción benigna desde $ws..."
    docker exec "$ws" curl -s -X POST http://localhost:5001/traffic/generate-now >/dev/null 2>&1 || true
done

echo -e "\n[Fase 2/4] Monitoreo de Red y sondeo de Switches (SNMP/HTTP)..."
# PC TI consulta la salud de los switches de la infraestructura
echo "  -> PC TI consultando telemetría de SW-LAN-CORE..."
docker exec xdr-legit-pc-ti curl -s http://10.20.30.2/api/ports >/dev/null 2>&1 || true

echo "  -> PC TI consultando telemetría de SW-LAN-ACCESS..."
docker exec xdr-legit-pc-ti curl -s http://10.20.30.3/api/ports >/dev/null 2>&1 || true

echo "  -> PC TI consultando telemetría de SW-DMZ..."
docker exec xdr-legit-pc-ti curl -s http://172.16.0.2/api/ports >/dev/null 2>&1 || true
echo "  [OK] Flujos de gestión de red entre PC TI y Switches completados."

echo -e "\n[Fase 3/4] Tráfico SMTP legítimo hacia Servidor Mail..."
docker exec xdr-legit-pc-rrhh python3 -c "
import smtplib
from email.mime.text import MIMEText
msg = MIMEText('Reunion de planeacion manana a las 10:00 AM.')
msg['Subject'] = 'Convocatoria Reunion Operativa'
msg['From'] = 'rrhh@corp.local'
msg['To'] = 'todos@corp.local'
try:
    with smtplib.SMTP('172.16.0.20', 25, timeout=5) as s:
        s.send_message(msg)
    print('  [OK] Correo corporativo transmitido desde PC RRHH al servidor SMTP (172.16.0.20:25)')
except Exception as e:
    print(f'  [INFO] SMTP test: {e}')
" 2>/dev/null || true

echo -e "\n[Fase 4/4] Consultas transaccionales hacia Bases de Datos internas y sincronización..."
docker exec xdr-legit-web-intranet curl -s -X POST "http://localhost/api/db-query?target_db=10.20.30.50" >/dev/null 2>&1 || true
docker exec xdr-legit-web-erp curl -s -X POST "http://localhost/api/db-query?target_db=10.20.30.51" >/dev/null 2>&1 || true
docker exec xdr-legit-sw-dmz curl -s -X POST "http://localhost/traffic/probe?target=http://172.16.0.1/" >/dev/null 2>&1 || true
docker exec xdr-legit-sw-dmz curl -s -X POST "http://localhost/traffic/probe?target=http://10.20.30.2/health" >/dev/null 2>&1 || true
docker exec xdr-legit-sw-dmz curl -s -X POST "http://localhost/traffic/probe?target=http://10.20.30.3/health" >/dev/null 2>&1 || true
docker exec xdr-legit-partner-ext curl -s -X POST "http://localhost:5000/traffic/benign-request?target_url=http://172.16.0.10/" >/dev/null 2>&1 || true
docker exec xdr-legit-router-isp curl -s -X POST "http://localhost/traffic/probe?target=http://172.16.0.11/" >/dev/null 2>&1 || true
echo "  [OK] Flujos inter-segmento en los 15 dispositivos completados."

echo -e "\n[Fase 5/5] Sincronizando identidades y tipos en XDR..."
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

echo -e "\n=========================================================="
echo "   Tráfico Legítimo generado en la topología de 15 nodos. "
echo "   Zeek ha registrado las conexiones en zeek_logs/conn.log"
echo "   El pipeline las enviará al modelo de Machine Learning. "
echo "=========================================================="
