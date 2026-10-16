#!/bin/bash
set -e

echo "[ROUTER-INIT] Configurando reglas de iptables para reenvio..."
iptables -P FORWARD ACCEPT 2>/dev/null || true

mkdir -p /zeek_logs
cd /zeek_logs

echo "[ROUTER-INIT] Interfaces activas en el router:"
ip -br addr show || true

# Detectar dinamicamente la interfaz conectada al segmento DMZ (172.16.0.1/24)
DMZ_IFACE=$(ip -o -4 addr show | grep '172.16.0.1' | awk '{print $2}')

if [ -z "$DMZ_IFACE" ]; then
    echo "[ROUTER-INIT] [AVISO] No se detecto interfaz DMZ especifica, utilizando eth0 por defecto."
    DMZ_IFACE="eth0"
fi

# Limpiar sufijos virtuales si los hubiera (ej. eth0@if246 -> eth0)
DMZ_IFACE=$(echo "$DMZ_IFACE" | cut -d'@' -f1)

echo "[ROUTER-INIT] Interfaz seleccionada para captura Zeek: $DMZ_IFACE"
echo "[ROUTER-INIT] Iniciando Zeek sniffer pasivo en interfaz '$DMZ_IFACE'..."
exec zeek -i "$DMZ_IFACE" /app/zeek_configs/local.zeek
