# Topología: Red Corporativa de 15 Dispositivos (Arquitectura Jerárquica y Tráfico Legítimo)

Esta topología ampliada emula una organización completa estructurada con base en el **modelo jerárquico empresarial (Core, Distribución y Acceso)** con **15 dispositivos de red reales**: Routers, Switches gestionados, Servidores y Estaciones de Trabajo (PCs).

Todos los segmentos convergen a través del gateway L3 instrumentado con el sensor pasivo Zeek.

---

## 1. Arquitectura de los 15 Dispositivos

```
+-------------------------------------------------------------------------------------------------------------------------+
|                                    TOPOLOGÍA CORPORATIVA JERÁRQUICA (15 DISPOSITIVOS)                                   |
|                                                                                                                         |
|   [ SEGMENTO WAN: 185.15.2.0/24 ]                                                                                       |
|   +--------------------------+  +--------------------------+                                                            |
|   | 1. xdr-legit-router-isp  |  | 2. xdr-legit-partner-ext |                                                            |
|   | IP: 185.15.2.3           |  | IP: 185.15.2.2           |                                                            |
|   | (Router Borde WAN)       |  | (Cliente / Socio Ext)    |                                                            |
|   +--------------------------+  +--------------------------+                                                            |
|                 \                            /                                                                          |
|                  \                          / (185.15.2.1)                                                              |
|                   v                        v                                                                            |
|               +------------------------------------------------------------------------------------+                    |
|               |                             3. xdr-legit-router                                    |                    |
|               |  - Gateway L3 Central (ip_forward = 1, iptables FORWARD ACCEPT)                    |                    |
|               |  - Sensor Zeek en vivo (sniffing de flujos inter-segmento)                         |                    |
|               +------------------------------------------------------------------------------------+                    |
|                       / (172.16.0.1)                                         \ (10.20.30.1)                             |
|                      v                                                        v                                         |
|   [ SEGMENTO DMZ: 172.16.0.0/24 ]                          [ SEGMENTO LAN: 10.20.30.0/24 ]                              |
|   +------------------------------------+                   +------------------------------------+                       |
|   | 4. xdr-legit-sw-dmz                |                   | 8. xdr-legit-sw-core               |                       |
|   | IP: 172.16.0.2 (Switch DMZ Dist.)  |                   | IP: 10.20.30.2 (Switch Core LAN)   |                       |
|   +------------------------------------+                   +------------------------------------+                       |
|         |                 |          |                            |                  |       |                          |
|         v                 v          v                            v                  v       |                          |
|   +-------------+  +------------+  +-------------+       +---------------+  +---------------+|                          |
|   |5. web-intra |  |6. web-erp  |  |7. mail-corp |       |10. db-prod    |  |11. db-analyt. ||                          |
|   |172.16.0.10  |  |172.16.0.11 |  |172.16.0.20  |       |10.20.30.50    |  |10.20.30.51    ||                          |
|   +-------------+  +------------+  +-------------+       +---------------+  +---------------+|                          |
|                                                                                              |                          |
|                                                            +------------------------------------+                       |
|                                                            | 9. xdr-legit-sw-access             |<----------------------+                       |
|                                                            | IP: 10.20.30.3 (Switch Acceso PCs) |                       |
|                                                            +------------------------------------+                       |
|                                                                   |           |          |      |                       |
|                                                                   v           v          v      v                       |
|                                                            +-----------++-----------++-----------++-----------+         |
|                                                            |12.pc-vent ||13.pc-finan||14.pc-rrhh ||15.pc-ti   |         |
|                                                            |10.20.30.10| |10.20.30.10|10.20.30.10| |10.20.30.10|         |
|                                                            |1          | |3         | |4         | |5         |         |
|                                                            +-----------++-----------++-----------++-----------+         |
+-------------------------------------------------------------------------------------------------------------------------+
```

---

## 2. Catálogo Detallado de los 15 Dispositivos

| # | Dispositivo | Nombre de Contenedor | Tipo | IP Asignada | Gateway | Rol en la Red |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Router ISP** | `xdr-legit-router-isp` | Router | `185.15.2.3` | `185.15.2.1` | Router de borde WAN del proveedor ISP. |
| **2** | **Partner Externo** | `xdr-legit-partner-ext` | Terminal | `185.15.2.2` | `185.15.2.1` | Socio/Cliente comercial externo con tráfico web. |
| **3** | **Router Core Gateway** | `xdr-legit-router` | Router | `185.15.2.1`<br>`172.16.0.1`<br>`10.20.30.1` | - | Gateway L3 central con motor de captura Zeek. |
| **4** | **Switch DMZ** | `xdr-legit-sw-dmz` | Switch | `172.16.0.2` | `172.16.0.1` | Switch de distribución para los servidores DMZ. |
| **5** | **Servidor Intranet**| `xdr-legit-web-intranet` | Server Web | `172.16.0.10` | `172.16.0.1` | Portal corporativo interno HTTP :80. |
| **6** | **Servidor ERP** | `xdr-legit-web-erp` | Server Web | `172.16.0.11` | `172.16.0.1` | Sistema de gestión de operaciones HTTP :80. |
| **7** | **Servidor Correo** | `xdr-legit-mail` | Server Mail | `172.16.0.20` | `172.16.0.1` | Servidor SMTP :25 para intercambio de correo. |
| **8** | **Switch Core LAN** | `xdr-legit-sw-core` | Switch | `10.20.30.2` | `10.20.30.1` | Switch backbone central de la red interna. |
| **9** | **Switch Acceso LAN**| `xdr-legit-sw-access` | Switch | `10.20.30.3` | `10.20.30.1` | Switch de acceso departamental para las PCs. |
| **10**| **DB Producción** | `xdr-legit-db-prod` | Database | `10.20.30.50` | `10.20.30.1` | Base de datos principal (:5432, :445, :8050). |
| **11**| **DB Analytics** | `xdr-legit-db-analytics` | Database | `10.20.30.51` | `10.20.30.1` | Base de datos Data Warehouse / BI (:5432). |
| **12**| **PC Ventas** | `xdr-legit-pc-ventas` | PC / Workstation | `10.20.30.101` | `10.20.30.1` | Estación de trabajo con auto-tráfico hacia ERP. |
| **13**| **PC Finanzas** | `xdr-legit-pc-finanzas` | PC / Workstation | `10.20.30.103` | `10.20.30.1` | Estación de trabajo con auto-tráfico hacia ERP y DB. |
| **14**| **PC RRHH** | `xdr-legit-pc-rrhh` | PC / Workstation | `10.20.30.104` | `10.20.30.1` | Estación con auto-tráfico hacia Intranet y SMTP. |
| **15**| **PC TI / Admin** | `xdr-legit-pc-ti` | PC / Workstation | `10.20.30.105` | `10.20.30.1` | Estación de administración y monitoreo de red. |

---

## 3. Guía de Ejecución en Linux

### A. Iniciar la Topología de 15 Dispositivos
Desde la raíz del proyecto:
```bash
docker compose -f emulation/topologias/red-corporativa-15-nodos/docker-compose.yml up --build -d
```

### B. Configurar las Rutas Inter-Segmento
```bash
bash emulation/topologias/red-corporativa-15-nodos/setup_routes.sh
```

### C. Verificar Conectividad
```bash
bash emulation/topologias/red-corporativa-15-nodos/verify_topology.sh
```

### D. Disparar el Escenario "Tráfico Legítimo"
```bash
bash emulation/topologias/red-corporativa-15-nodos/simulate_legitimate_traffic.sh
```

### E. Detener la Topología
```bash
docker compose -f emulation/topologias/red-corporativa-15-nodos/docker-compose.yml down
```
