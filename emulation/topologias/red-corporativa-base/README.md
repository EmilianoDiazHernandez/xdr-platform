# Topología: Red Corporativa Base (Cyber Range XDR)

Esta topología representa una arquitectura corporativa clásica segmentada en tres zonas de seguridad conectadas a través de un gateway de enrutamiento Layer 3 con sensor pasivo Zeek.

---

## 1. Mapa de Direccionamiento y Segmentos de Red

```
+-------------------------------------------------------------------------------------------------+
|                                     TOPOLOGÍA CORPORATIVA BASE                                  |
|                                                                                                 |
|   [ net-wan (185.15.2.0/24) ]             [ net-dmz (172.16.0.0/24) ]                           |
|   +-----------------------+               +----------------------+  +-----------------------+   |
|   | xdr-emu-attacker      |               | xdr-emu-web          |  | xdr-emu-mail          |   |
|   | IP: 185.15.2.2        |               | IP: 172.16.0.10      |  | IP: 172.16.0.20       |   |
|   +-----------------------+               +----------------------+  +-----------------------+   |
|               \                                       /                         /               |
|                \ (185.15.2.1)           (172.16.0.1) /                         /                |
|                 v                                   v                         v                 |
|            +---------------------------------------------------------------------+              |
|            |                        xdr-emu-router                               |              |
|            |  - Gateway L3 (ip_forward = 1, iptables FORWARD ACCEPT)             |              |
|            |  - Sensor Zeek en vivo (sniffing en interfaces internas)            |              |
|            +---------------------------------------------------------------------+              |
|                                                     ^ (10.20.30.1)                              |
|                                                     |                                           |
|                                    [ net-lan (10.20.30.0/24) ]                                  |
|                                   +---------------------------+  +--------------------------+   |
|                                   | xdr-emu-workstation       |  | xdr-emu-db               |   |
|                                   | IP: 10.20.30.45           |  | IP: 10.20.30.50          |   |
|                                   +---------------------------+  +--------------------------+   |
+-------------------------------------------------------------------------------------------------+
```

| Dispositivo | Contenedor | Red Docker | IP Asignada | Gateway Asignado | Rol / Servicios |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Router Sensor** | `xdr-emu-router` | `net-wan`, `net-dmz`, `net-lan` | `185.15.2.1`, `172.16.0.1`, `10.20.30.1` | - | Gateway L3 + Zeek sniffer |
| **Atacante** | `xdr-emu-attacker` | `net-wan` | `185.15.2.2` | `185.15.2.1` | Nmap, Hping3, Scapy, API :5000 |
| **Servidor Web** | `xdr-emu-web` | `net-dmz` | `172.16.0.10` | `172.16.0.1` | HTTP :80, Hook EDR |
| **Servidor Correo**| `xdr-emu-mail` | `net-dmz` | `172.16.0.20` | `172.16.0.1` | SMTP :25, Extractor Email |
| **Workstation** | `xdr-emu-workstation` | `net-lan` | `10.20.30.45` | `10.20.30.1` | Agente Sysmon :5001, Sim. Tráfico |
| **Base de Datos** | `xdr-emu-db` | `net-lan` | `10.20.30.50` | `10.20.30.1` | Listener TCP :5432 y :445 |

---

## 2. Instrucciones de Uso

### A. Iniciar la Topología
```bash
docker compose -f emulation/topologias/red-corporativa-base/docker-compose.yml up -d
```

### B. Verificar Conectividad y Enrutamiento
En PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File emulation/topologias/red-corporativa-base/verify_topology.ps1
```

En Bash:
```bash
bash emulation/topologias/red-corporativa-base/setup_routes.sh
```

### C. Detener la Topología
```bash
docker compose -f emulation/topologias/red-corporativa-base/docker-compose.yml down
```
