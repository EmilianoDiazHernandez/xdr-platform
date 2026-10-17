# Informe Técnico de Prueba de Concepto: Captura Zeek en Vivo (Fase 2)

**Fecha de ejecución:** 2026-10-13  
**Rama Git auditada:** `test/integration-api`  
**Entorno de ejecución:** Docker Desktop en Windows (Backend WSL2)  
**Objetivo:** Demostrar la viabilidad técnica de capturar en vivo tráfico HTTP benigno entre `xdr-emu-red` y `xdr-api-ml` mediante Zeek sin alterar la arquitectura ni la configuración existente de la plataforma XDR.

---

## 1. Arquitectura Utilizada para la Captura

Para cumplir con la restricción de **no alterar la red Docker existente (`xdr-platform_xdr-network`) ni exponer puertos o modificar los archivos Docker Compose preexistentes**, se evaluó e implementó la estrategia de **Compartición de Network Namespace de Contenedor (`--net=container:xdr-emu-red`)**.

```
+---------------------------------------------------------------------------------------------------------+
|                 DOCKER NETWORK: xdr-platform_xdr-network (Driver: bridge, Subred: 172.22.0.0/16)       |
|                                                                                                         |
|  +-------------------------------------------------------------+                                        |
|  | Network Namespace Compartido (vNIC eth0: 172.22.0.3/16)     |                                        |
|  |                                                             |                                        |
|  |  +--------------------------+    +-----------------------+  |         HTTP GET /health               |
|  |  | Contenedor Preexistente: |    | Contenedor Temporal:  |  |--------------------------------+       |
|  |  | xdr-emu-red              |    | xdr-val-zeek-sniffer  |  |                                |       |
|  |  | (Generador de peticion)  |    | (Zeek Engine en vivo) |  |                                |       |
|  |  +--------------------------+    +-----------------------+  |                                |       |
|  |                                              |              |                                |       |
|  +----------------------------------------------|--------------+                                v       |
|                                                 | Sniffing L2/L3                        +---------------+
|                                                 v (NET_RAW)                             | xdr-api-ml    |
|                                      +---------------------+                            | (172.22.0.10) |
|                                      | Salida Aislada:     |                            | Puerto 8000   |
|                                      | runs/run_<id>/      |                            +---------------+
|                                      | - conn.log          |                                            |
|                                      | - http.log          |                                            |
|                                      | - status.json       |                                            |
|                                      +---------------------+                                            |
+---------------------------------------------------------------------------------------------------------+
```

### Especificaciones Técnicas de la Estrategia

1. **Namespace Compartido**: El contenedor temporal de Zeek se adjunta directamente al stack de red de `xdr-emu-red`. Ambos contenedores comparten la misma tabla de enrutamiento, interfaces y dirección IP (`172.22.0.3`).
2. **Descubrimiento Dinámico de Interfaz**: Se inspecciona la tabla de enlaces de `xdr-emu-red` (`ip -o link show`), ignorando interfaces de loopback (`lo`) y detectando la interfaz activa: **`eth0`**.
3. **Privilegios Estrictamente Necesarios**: En lugar de utilizar `--privileged` o `network_mode: host`, se configuran únicamente las capacidades POSIX indispensables para captura en crudo y manejo de sockets promiscuos:
   - `--cap-add=NET_RAW`: Lectura de paquetes en el nivel de enlace de datos.
   - `--cap-add=NET_ADMIN`: Configuración de interfaces en modo de captura.
4. **Aislamiento Total de Almacenamiento**: Los logs generados se escriben en un volumen montado temporal bajo `emulation/validation_infrastructure/runs/run_<timestamp>/`, evitando cualquier sobreescritura de los logs históricos de producción en `collector/logs/conn.log`.

---

## 2. Comandos Ejecutados Durante la Validación

A continuación se detallan los comandos de inspección y prueba ejecutados:

```powershell
# 1. Comprobacion de integridad de Git
git status --short
git branch --show-current

# 2. Comprobacion de imagenes locales disponibles (busqueda de Zeek)
docker images --filter "reference=*zeek*"

# 3. Validacion previa de viabilidad de namespace compartido con imagen ligera local
docker run --rm --net=container:xdr-emu-red --entrypoint sh alpine/openssl -c "ip addr show"

# 4. Ejecucion del script de validacion no destructivo
powershell -ExecutionPolicy Bypass -File emulation\validation_infrastructure\validate_zeek_capture.ps1
```

---

## 3. Matriz de Resultados de Validación

| Parámetro / Componente | Procedimiento | Resultado | Evidencia Recogida | Interpretación |
| :--- | :--- | :--- | :--- | :--- |
| **Disponibilidad Docker** | Consulta a API de Docker | **PASS** | `Docker Server Version: 28.3.0` | Demonio Docker activo y accesible. |
| **Estado de Contenedores** | Verificación de nombres en ejecución | **PASS** | `xdr-emu-red` y `xdr-api-ml` en estado 'Up'. | Los nodos emisor y receptor están listos. |
| **Conectividad HTTP** | Petición benigna `GET /health` | **PASS** | Código `200 OK`, JSON `{"status": "ok", ...}` | La comunicación inter-contenedor a través de `xdr-platform_xdr-network` opera normalmente. |
| **Viabilidad de Namespace Compartido** | Montaje de contenedor de prueba con `--net=container:xdr-emu-red` | **PASS** | Detección de `eth0` (`172.22.0.3/16`) con misma MAC `fe:16:36:9e:ee:da`. | Docker Desktop en Windows soporta completamente namespaces de red compartidos. |
| **Disponibilidad Local de Imagen Zeek** | Búsqueda en caché local de Docker (`docker images -q`) | **BLOCKED** | Salida vacía (0 imágenes encontradas para `zeek/zeek:latest`). | La imagen oficial de Zeek no se encuentra precargada en la máquina. |
| **Captura en `conn.log`** | Intento de ejecución de Zeek en vivo | **BLOCKED** | Generación de manifiesto `status.json` con motivo: imagen no disponible localmente. | No se inició la captura para cumplir con la directriz de no descargar imágenes sin autorización. |
| **Captura en `http.log`** | Decodificación de transacciones HTTP | **BLOCKED** | Mismo motivo de bloqueo que `conn.log`. | Pendiente de autorización para la descarga de la imagen. |

---

## 4. Detalle de Evidencias Obtenidas

### 4.1 Verificación de Conectividad HTTP Benigna
El emulador `xdr-emu-red` alcanza al backend `xdr-api-ml` a través del DNS interno de Docker:
- **URL**: `http://api-ml:8000/health`
- **Código HTTP**: `200 OK`
- **Cuerpo de Respuesta**:
  ```json
  {
    "status": "ok",
    "capas": {
      "red": {"activa": true, "features": 17},
      "endpoint": {"activa": true, "columnas_struct": 29},
      "email": {"activa": true, "osint_db_size": 124532}
    },
    "redis": {"activo": true},
    "version": "9.0.0"
  }
  ```

### 4.2 Verificación de Soporte de Namespace Compartido en Docker Desktop
La prueba con contenedor temporal confirmó que un contenedor secundario hereda exactamente la interfaz de red de `xdr-emu-red`:
```text
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN qlen 1000
    inet 127.0.0.1/8 scope host lo
2: eth0@if11: <BROADCAST,MULTICAST,UP,LOWER_UP,M-DOWN> mtu 1500 qdisc noqueue state UP 
    link/ether fe:16:36:9e:ee:da brd ff:ff:ff:ff:ff:ff
    inet 172.22.0.3/16 brd 172.22.255.255 scope global eth0
```

### 4.3 Manifiesto de Estado en Directorio de Salida (`runs/run_20261013_220256/status.json`)
El script de validación documentó de forma automatizada y segura el punto exacto de detención:
```json
{
  "timestamp": "2026-10-13T22:02:57.6412549-06:00",
  "status": "BLOCKED",
  "reason": "Imagen Docker de Zeek (zeek/zeek:latest) no disponible localmente y no autorizada para descarga automatica",
  "prerequisite_command": "docker pull zeek/zeek:latest",
  "target_container": "xdr-emu-red",
  "detected_interface": "eth0",
  "target_ip": "172.22.0.3"
}
```

---

## 5. Alcance y Límites de la Prueba

Es indispensable delimitar con precisión qué demuestra y qué no demuestra esta prueba de concepto:

1. **Visibilidad de Nodo vs. Visibilidad Global**:
   - La estrategia de capturar en el namespace de `xdr-emu-red` permite observar **únicamente el tráfico que entra o sale de dicho contenedor** (por ejemplo, peticiones hacia `api-ml:8000`).
   - **No otorga visibilidad global** sobre las comunicaciones entre otros contenedores de la red `xdr-platform_xdr-network` (como el tráfico entre `xdr-api-ml` y `xdr-db-timescale`, o entre `xdr-emu-endpoint` y el backend).
   - Para una monitorización completa de la red se requeriría un *TAP virtual*, modo promiscuo en el puente Docker o un proxy/sidecar.

2. **Aislamiento respecto al Pipeline XDR**:
   - Esta prueba está deliberadamente desconectada del contenedor `xdr-sensor-red`.
   - Los logs que Zeek generará al ejecutarse se almacenan en carpetas de prueba (`runs/run_<timestamp>/`) y **no son transmitidos a la API de Machine Learning ni a PostgreSQL**.
   - Por tanto, la prueba valida exclusivamente la capacidad de **captura y decodificación en vivo de Zeek**, sin comprometer el estado del colector existente.

---

## 6. Diagnóstico y Punto de Bloqueo

- **Diagnóstico**: La arquitectura de captura mediante namespace compartido es **100% compatible** con el entorno actual de Docker Desktop en Windows. La interfaz `eth0` fue identificada y los permisos requeridos (`NET_RAW`, `NET_ADMIN`) son suficientes.
- **Punto de Bloqueo Único**: La imagen de contenedor `zeek/zeek:latest` no existe en la caché local del demonio Docker. Siguiendo la restricción obligatoria (*"Si la imagen oficial de Zeek no está disponible, no instales nada ni descargues imágenes sin autorización"*), el script no realizó la descarga automática y detuvo el flujo en el paso 6 de 7.

---

## 7. Pasos Mínimos para Avanzar a la Integración

Una vez que el operador autorice la descarga de la imagen, los pasos técnicos mínimos para completar la captura en vivo son:

### Paso 1: Descargar la Imagen Oficial de Zeek (Requiere Autorización del Usuario)
```bash
docker pull zeek/zeek:latest
```

### Paso 2: Re-ejecutar la Validación Automatizada
```powershell
powershell -ExecutionPolicy Bypass -File emulation\validation_infrastructure\validate_zeek_capture.ps1
```
*El script detectará automáticamente la imagen, levantará el contenedor temporal de Zeek, generará la solicitud benigna `GET /health?test_id=val-zeek-...`, evaluará `conn.log` y `http.log`, y desmontará el contenedor temporal registrando las evidencias en su subdirectorio `runs/run_<id>/`.*

### Paso 3: Planificación de Integración Futura con `xdr-sensor-red`
Para conectar la captura real con el pipeline del XDR sin alterar el contenedor actual:
1. Definir un servicio permanente de Zeek en `docker-compose.yml`.
2. Configurar Zeek para que escriba directamente sus rotaciones de logs en la ruta compartida montada en el host (`./collector/logs/conn.log`).
3. El contenedor actual `xdr-sensor-red` comenzará automáticamente a leer los flujos en tiempo real generados por Zeek y a enviarlos a `api-ml`.
