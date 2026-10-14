# Informe Técnico de Validación de Infraestructura Docker, Visibilidad de Zeek y Procedencia de Sysmon

**Fecha de ejecución:** 2026-10-13  
**Rama Git auditada:** `test/integration-api`  
**Estado de Git inicial:** `working tree clean` (sin modificaciones sin confirmar)  
**Alcance:** Inspección de solo lectura y validación benigna no destructiva de la plataforma XDR y el módulo `emulation/`.

---

## A. Resumen de Arquitectura Observada

Se auditó el estado real de la infraestructura en ejecución mediante comandos de inspección sobre el demonio de Docker, las redes virtuales, los procesos de Windows y los subsistemas WSL.

```
+---------------------------------------------------------------------------------------------------------+
|                               HOST WINDOWS (Hyper-V / vEthernet: 172.31.32.1)                          |
|                                                                                                         |
|  [start_sensors.bat / start_sensor2.bat]                                                                |
|  - Intenta invocar: py envio_sysmon2.py (ARCHIVO INEXISTENTE EN RAMA ACTUAL)                            |
|  - Intenta invocar: py email_collector.py (ARCHIVO INEXISTENTE EN RAMA ACTUAL)                          |
|  - Intenta invocar: wsl -d Ubuntu bash -c "./start_sensor.sh" (WSL Ubuntu DETENIDO / Zeek NO ACTIVO)    |
+---------------------------------------------------------------------------------------------------------+
                                                     |
                                                     | Aislamiento de Red L2/L3
                                                     v
+---------------------------------------------------------------------------------------------------------+
|                 DOCKER NETWORK: xdr-platform_xdr-network (Driver: bridge, Subred: 172.22.0.0/16)       |
|                                                                                                         |
|  +--------------------+  +--------------------+  +--------------------+  +---------------------------+  |
|  | xdr-emu-red        |  | xdr-emu-endpoint   |  | xdr-emu-email      |  | xdr-emu-dashboard         |  |
|  | IP: 172.22.0.3     |  | IP: 172.22.0.2     |  | IP: 172.22.0.4     |  | IP: 172.22.0.8            |  |
|  | Uvicorn :80        |  | Uvicorn :80        |  | Uvicorn :80        |  | Uvicorn :9000 (Host :9000)|  |
|  +--------------------+  +--------------------+  +--------------------+  +---------------------------+  |
|             \                      |                      /                            |                |
|              \                     |                     /                             |                |
|               v                    v                    v                              |                |
|  +--------------------------------------------------------------------+                |                |
|  | xdr-api-ml (IP: 172.22.0.10, Puerto: 8000 / Host :8000)            |                |                |
|  | - Endpoints: /api/v1/analyze-network, analyze-endpoint, etc.       |                |                |
|  | - Motor ML (RandomForest, NLP TF-IDF, Fusión Sensorial)            |                |                |
|  +--------------------------------------------------------------------+                |                |
|           |                                       |                                    |                |
|           v                                       v                                    v                |
|  +--------------------+              +---------------------------+       +---------------------------+  |
|  | xdr-redis          |              | xdr-db-timescale          |       | xdr-dashboard (Frontend)  |  |
|  | IP: 172.22.0.5     |              | IP: 172.22.0.6            |       | IP: 172.22.0.7            |  |
|  | Puerto: 6379       |              | Puerto: 5432              |       | Puerto: 3000 (Host :3000) |  |
|  +--------------------+              +---------------------------+       +---------------------------+  |
|                                                                                                         |
|  +---------------------------------------------------------------------------------------------------+  |
|  | xdr-sensor-red (IP: 172.22.0.12) [xdr-platform-sensor-network-collector]                          |  |
|  | - Proceso: python colector.py (Lee /logs/conn.log estático de mayo 2026)                          |  |
|  | - NOTA: ¡NO ES UN SENSOR ZEEK EN VIVO! Es un lector estático en bucle.                            |  |
|  +---------------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------------+
```

### Detalle de Componentes y Estado Real

1. **Red Docker (`xdr-platform_xdr-network`)**:
   - Subred: `172.22.0.0/16`, Gateway: `172.22.0.1`.
   - Driver: `bridge` administrado por Docker Desktop (WSL2 backend `docker-desktop`).
   - Todos los 11 contenedores del proyecto están conectados a esta misma red y disponen de resolución DNS interna (`127.0.0.11`).

2. **Contenedores Activos**:
   - `xdr-emu-dashboard` (`172.22.0.8`): Panel web C2 en puerto `9000:9000`.
   - `xdr-emu-red` (`172.22.0.3`): Simulador de red HTTP interno en puerto `80`.
   - `xdr-emu-endpoint` (`172.22.0.2`): Simulador de eventos Sysmon sintéticos en puerto `80`.
   - `xdr-emu-email` (`172.22.0.4`): Simulador de phishing en puerto `80`.
   - `xdr-api-ml` (`172.22.0.10`): API FastAPI principal (puerto `8000:8000`).
   - `xdr-api-reports` (`172.22.0.9`): Servicio de reportes (puerto `8001:8001`).
   - `xdr-api-topology` (`172.22.0.11`): API de topología y eventos (puerto `8002:8002`).
   - `xdr-dashboard` (`172.22.0.7`): Frontend interactivo (puerto `3000:3000`).
   - `xdr-redis` (`172.22.0.5`): Caché L1 y estado temporal (puerto `6379:6379`).
   - `xdr-db-timescale` (`172.22.0.6`): Base de datos PostgreSQL/TimescaleDB (puerto `5432:5432`).
   - `xdr-sensor-red` (`172.22.0.12`): Proceso `python colector.py` monitoreando `/logs/conn.log`.

3. **Sensor de Red Zeek**:
   - **En Docker**: No existe ningún contenedor ejecutando Zeek. El contenedor `xdr-sensor-red` únicamente ejecuta `colector.py`.
   - **En WSL**: Existe una instalación de Zeek en `/opt/zeek/bin/zeek` dentro de la distribución WSL `Ubuntu`. Sin embargo:
     - No se encuentra en ejecución (`ps aux` confirmó ausencia de procesos de Zeek).
     - El script de arranque `/home/spider/start_sensor.sh` lo configura para escuchar en la interfaz `eth0` de WSL Ubuntu (`172.31.32.144`).

4. **Colectores de Telemetría Sysmon**:
   - El script `backend/clients/envio_sysmon2.py` referenciado en `start_sensors.bat` y `start_sensor2.bat` **no existe físicamente en el repositorio** en la rama actual. Fue eliminado durante el merge `fed1e20`.
   - La única telemetría de endpoint que ingresa a la plataforma proviene de los payloads sintéticos construidos en `emulation/endpoint_sim/main.py` y `emulation/red_sim/main.py`.

---

## B. Resultados de Validación

| Componente o Prueba | Procedimiento Realizado | Resultado | Evidencia Recogida | Interpretación | Acción Recomendada |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Integridad del Repositorio** | Auditoría con `git status` y `git log` | **PASS** | `working tree clean` en rama `test/integration-api`. No se modificó ningún archivo existente. | Repositorio limpio y preservado. | Mantener política de cambios aislados. |
| **Conectividad HTTP Inter-Contenedor** | Petición `GET /health?test_id=val-infra-20261013-001` desde `xdr-emu-red` (`172.22.0.3`) hacia `api-ml:8000` (`172.22.0.10`) | **PASS** | Código HTTP 200, duración 34.6 ms. Respuesta JSON con status `ok`. Registro en logs de `xdr-api-ml`: `INFO: 172.22.0.3:49310 - "GET /health?test_id=val-infra-20261013-001 HTTP/1.1" 200 OK`. | La conectividad de red interna de Docker entre los contenedores de emulación y el backend funciona a la perfección. | Ninguna requerida en la capa de transporte HTTP Docker. |
| **Visibilidad de Red (Zeek `conn.log`)** | Búsqueda del flujo de prueba en `./collector/logs/conn.log` y `/home/spider/conn.log` | **FAIL** | Ni `./collector/logs/conn.log` (última modificación: mayo 2026) ni `/home/spider/conn.log` (última modificación: 5 octubre 2026) registraron la conexión hacia el puerto 8000. | Zeek no tiene visibilidad sobre el tráfico que fluye dentro del bridge de Docker. | Desplegar un contenedor con Zeek conectado directamente a `xdr-network` o compartir namespace de red. |
| **Visibilidad HTTP (Zeek `http.log`)** | Búsqueda de la transacción GET en `/home/spider/http.log` y en `./collector/logs/` | **FAIL** | No existe `http.log` en `./collector/logs/`. El `http.log` de WSL Ubuntu no tiene entradas posteriores al 5 de octubre de 2026. | Zeek no analizó ni registró la petición HTTP benigna inter-contenedor. | Mismo problema estructural de captura que `conn.log`. |
| **Proceso Activo de Zeek** | Inspección de procesos en host, Docker y WSL | **FAIL** | Ningún contenedor corre `zeek`. En WSL `Ubuntu` y `Ubuntu-22.04` no hay proceso `zeek` en ejecución. | El sensor Zeek está completamente inactivo. | Configurar Zeek como servicio de Docker en `docker-compose.yml`. |
| **Colector de Red (`xdr-sensor-red`)** | Inspección de proceso y logs en contenedor `xdr-sensor-red` | **BLOCKED** | El contenedor ejecuta `python colector.py` leyendo un archivo estático. Sus logs muestran errores de conexión iniciales y bucle de espera sin nuevos eventos. | El colector espera que un agente externo escriba en `./collector/logs/conn.log`, pero nadie lo hace. | Conectar la salida de Zeek al volumen `./collector/logs/`. |
| **Procedencia de Telemetría Sysmon** | Análisis de código fuente (`endpoint_sim`, `red_sim`, `schemas.py`) e historial Git | **PASS** (Identificación) | El modelo `SysmonLog` carece de campos nativos (`ProcessGuid`, `ProcessId`, etc.). Los eventos en `endpoint_sim` y `red_sim` son JSONs estáticos generados en memoria. | La telemetría Sysmon en la infraestructura actual es **100% sintética**. | Para telemetría nativa, restaurar y desplegar el cliente Windows. |
| **Captura Nativa de Sysmon en Windows** | Inspección de procesos de Windows y scripts de `backend/clients/` | **NOT VERIFIED** | `backend/clients/envio_sysmon2.py` no existe en el disco. No hay sensor Windows transmitiendo eventos a `api-ml`. | No fue posible validar eventos nativos porque el colector nativo no está disponible en la rama actual. | Restaurar `envio_sysmon2.py` desde el historial Git y adaptarlo al esquema actual. |

---

## C. Visibilidad de Zeek

Se verificaron de manera independiente los tres niveles de comunicación:

1. **Conectividad HTTP:** **VERIFICADA (PASS)**.
   - Origen: Contenedor `xdr-emu-red` (`172.22.0.3`).
   - Destino: Contenedor `xdr-api-ml` (`172.22.0.10:8000`).
   - Petición: `GET /health?test_id=val-infra-20261013-001`.
   - Código HTTP: `200 OK`.
   - Registro en el servidor destino (`xdr-api-ml`):
     ```
     INFO: 172.22.0.3:49310 - "GET /health?test_id=val-infra-20261013-001 HTTP/1.1" 200 OK
     ```

2. **Registro en `conn.log`:** **NO VISIBLE (FAIL)**.
   - Ubicaciones inspeccionadas:
     a) `C:\Users\spide\Documents\IPN\TT\xdr_v2\xdr-platform\collector\logs\conn.log`: Archivo estático sin cambios desde el 9 de mayo de 2026.
     b) `/home/spider/conn.log` en WSL `Ubuntu`: Última modificación el 5 de octubre de 2026.
   - Resultado: Ningún registro de la conexión `172.22.0.3:49310` $\rightarrow$ `172.22.0.10:8000`.

3. **Registro en `http.log`:** **NO VISIBLE (FAIL)**.
   - Ubicaciones inspeccionadas:
     a) `collector/logs/`: No existe archivo `http.log`.
     b) `/home/spider/http.log` en WSL `Ubuntu`: Última modificación el 5 de octubre de 2026.
   - Resultado: No se generó ningún log HTTP para la transacción benigna.

### Diagnóstico de la Causa Raíz de Zeek

La falta de visibilidad no se debe a un error en el analizador de Zeek ni al cifrado (fue HTTP en texto plano), sino a una **incompatibilidad arquitectónica en los límites de red de la captura**:
- **Interfaz configurada**: En `/home/spider/start_sensor.sh`, Zeek está configurado como `zeek -C -i eth0`. La interfaz `eth0` de la máquina virtual WSL `Ubuntu` pertenece a la red virtual Hyper-V entre Windows y WSL (`172.31.32.x`).
- **Ubicación del tráfico**: El tráfico entre contenedores de emulación y el backend ocurre dentro del puente virtual Docker `xdr-platform_xdr-network` (subred `172.22.0.0/16`), administrado internamente por la máquina virtual de sistema de Docker Desktop (`docker-desktop`).
- **Conclusión técnica**: Los paquetes que viajan entre `xdr-emu-red` y `xdr-api-ml` jamás pasan por la interfaz de red `eth0` de WSL Ubuntu, haciendo físicamente imposible que una instancia de Zeek corriendo en WSL Ubuntu capture el tráfico de la red Docker sin una configuración de espejo de puertos (*port mirroring*), modo host o un contenedor Zeek dedicado con acceso a la red de Docker.

---

## D. Procedencia de la Telemetría Sysmon

La investigación exhaustiva del código fuente y los esquemas confirma que la telemetría Sysmon en la plataforma actual tiene una **naturaleza mixta a nivel de diseño conceptual**, pero es **100% SINTÉTICA en su funcionamiento operativo actual**.

### 1. Evidencia en los Modelos de Datos (`SysmonLog` en `src/models/schemas.py`)
El modelo Pydantic aceptado por la API `/api/v1/analyze-endpoint` está definido como:
```python
class SysmonLog(BaseModel):
    idempotency_key: Optional[str] = None
    host: str
    ip_local: str
    EventID: int
    proceso: str
    proceso_padre: str
    cmd: str
    hashes: str = ""
```
- **Campos nativos de Sysmon ausentes**:
  - `ProcessGuid` / `ProcessGUID` (Identificador global único del proceso generado por Sysmon).
  - `ProcessId` (PID del proceso).
  - `ParentProcessGuid`.
  - `ParentProcessId` (PPID).
  - `User` (Cuenta de usuario de ejecución).
  - `UtcTime` (Timestamp original generado por el kernel de Windows).
  - `CurrentDirectory`, `IntegrityLevel`, etc.
- El modelo actual representa una abstracción simplificada que no almacena ni requiere la estructura completa de un evento Sysmon nativo.

### 2. Evidencia en los Generadores de Emulación
- En `emulation/endpoint_sim/main.py`:
  El endpoint `/trigger` construye un objeto en memoria con valores estáticos:
  - `host`: `"VENTAS-PC"`
  - `ip_local`: `"10.20.30.45"`
  - `EventID`: `1`
  - `proceso`: `"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"`
  - `proceso_padre`: `"C:\\Windows\\System32\\cmd.exe"`
  - `cmd`: `"powershell.exe -nop -w hidden -enc JABzAD... (mimikatz)"`
  - `hashes`: `"SHA256=1234567890ABCDEF..."`
- En `emulation/red_sim/main.py` (Movimiento Lateral - Paso 2):
  El script construye un objeto idéntico simulando `w3wp.exe` engendrando `cmd.exe` en `SRV-DMZ-WEB` (`172.16.0.10`).
- Ambos eventos son **100% sintéticos**, generados por código Python dentro de los contenedores Docker sin interacción con el sistema operativo Windows ni con el controlador de Sysmon (`SysmonDrv`).

### 3. Evidencia del Colector Nativo Histórico
- En el historial de commits (`commit 3def650`), existió el archivo `backend/clients/envio_sysmon2.py`.
- Dicho archivo utilizaba `win32evtlog.EvtQuery('Microsoft-Windows-Sysmon/Operational', ...)` para leer eventos reales de Sysmon desde el registro de eventos de Windows y mapeaba `event_data.get('Image')` a `proceso` y `event_data.get('CommandLine')` a `cmd`.
- No obstante, `envio_sysmon2.py` filtraba exclusivamente procesos que contuvieran `"winword.exe"` y actualmente **está eliminado de la rama `test/integration-api`**.
- Los scripts `start_sensors.bat` y `start_sensor2.bat` fallan al intentar ejecutarlo.
- **Dictamen:** La validación de eventos nativos queda clasificada como **NO VERIFICADA (NOT VERIFIED)** por falta del componente en el árbol de trabajo actual.

---

## E. Limitaciones Detectadas

1. **Errores Confirmados**:
   - **Inexistencia de sensor Zeek en vivo**: No hay ningún proceso de Zeek capturando tráfico en la red Docker ni en el host. El contenedor `xdr-sensor-red` solo lee en bucle un archivo de log estático de mayo de 2026.
   - **Desconexión entre WSL y Docker Network**: La configuración histórica de Zeek apunta a `eth0` de WSL Ubuntu, la cual no tiene visibilidad sobre los paquetes transmitidos en la subred de Docker `172.22.0.0/16`.
   - **Scripts de clientes ausentes en la rama actual**: `start_sensors.bat` y `start_sensor2.bat` intentan invocar `backend/clients/envio_sysmon2.py` y `email_collector.py`, pero ninguno de los dos archivos existe en `backend/clients/` (fueron omitidos en el merge `fed1e20`).

2. **Riesgos Potenciales**:
   - **Falsa sensación de monitoreo**: Si el operador observa que el contenedor `xdr-sensor-red` está en estado "Up", podría asumir erróneamente que el tráfico de la red Docker está siendo analizado por Zeek en tiempo real, cuando en realidad el colector está ocioso esperando líneas en un archivo estático.
   - **Simulación desconectada de la red real**: El módulo de emulación inyecta telemetría HTTP directamente en la API de Machine Learning (`/api/v1/analyze-*`). Por lo tanto, las emulaciones funcionan y el mapa de topología se actualiza **sin importar si Zeek o Sysmon están activos o no**.

3. **Verificaciones Bloqueadas**:
   - La captura y análisis de eventos nativos de Windows mediante Sysmon no pudo verificarse en vivo debido a la ausencia del colector en el código actual.

---

## F. Próximos Pasos (Modificaciones Mínimas Recomendadas)

*Nota: Siguiendo las directrices del proyecto, ninguna de estas propuestas ha sido implementada durante esta tarea.*

1. **Para la Visibilidad de Zeek sobre Contenedores Docker**:
   - **Opción A (Recomendada en Docker puro)**: Agregar un servicio `zeek` en `docker-compose.yml` que compile o use una imagen de Zeek (ej. `zeek/zeek:latest`), configurado con `network_mode: "service:api-ml"` o conectándose a `xdr-network` con capacidades `NET_ADMIN` / `NET_RAW` para capturar el tráfico del puente.
   - **Opción B (Integración con colector existente)**: Configurar Zeek para que escriba sus rotaciones de logs en `./collector/logs/conn.log`, permitiendo que `xdr-sensor-red` procese los flujos reales.

2. **Para la Restauración de la Telemetría Nativa de Sysmon**:
   - Recuperar `envio_sysmon2.py` desde el commit `3def650` (`git checkout 3def650 -- backend/clients/envio_sysmon2.py`) y colocarlo en `backend/clients/`.
   - Generalizar el filtro de procesos (remover la restricción exclusiva a `winword.exe`) y ajustar el endpoint de destino a `http://localhost:8000/api/v1/analyze-endpoint`.

3. **Para Enriquecer el Esquema EDR**:
   - Incorporar gradualmente en `SysmonLog` campos estándar de telemetría como `ProcessGuid`, `ProcessId` y `ParentProcessGuid` para habilitar análisis de árbol de procesos más robustos en el backend.

---

## G. Reproducción de las Pruebas

Los siguientes comandos permiten reproducir de manera idéntica y no destructiva todas las pruebas documentadas en este informe:

### 1. Verificación del Estado de Git
```powershell
git status --short
git branch --show-current
```

### 2. Inspección de Contenedores y Redes Docker
```powershell
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker network inspect xdr-platform_xdr-network
```

### 3. Prueba Benigna de Comunicación HTTP Inter-Contenedor
```powershell
docker exec xdr-emu-red python -c "import time, requests, json; t0=time.time(); r=requests.get('http://api-ml:8000/health?test_id=val-infra-20261013-001', timeout=5.0); t1=time.time(); print(json.dumps({'time': t1-t0, 'code': r.status_code, 'body': r.json()}))"
```

### 4. Verificación del Log en el Servidor Destino
```powershell
docker logs --tail 5 xdr-api-ml
```

### 5. Verificación de Logs de Zeek en Colector y WSL
```powershell
# En el host (volumen del colector)
Get-Item collector\logs\* | Select-Object Name, Length, LastWriteTime

# En WSL Ubuntu
wsl -d Ubuntu bash -c "ls -la /home/spider/*.log ; tail -n 5 /home/spider/conn.log"
```

### 6. Verificación de Procesos de Zeek
```powershell
wsl -d Ubuntu bash -c "ps aux | grep -i zeek"
docker exec xdr-sensor-red ps aux 2>$null || docker top xdr-sensor-red
```
