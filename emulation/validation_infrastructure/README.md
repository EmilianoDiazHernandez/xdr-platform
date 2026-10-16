# Herramientas de Validación de Infraestructura XDR

Este directorio contiene herramientas independientes, no destructivas y de solo lectura para auditar y verificar el estado de la infraestructura de Docker, la visibilidad del sensor de red Zeek y la procedencia de la telemetría Sysmon.

---

## Estructura del Directorio

- **`REPORT.md`**: Informe técnico de la **Fase 1 (Auditoría de Infraestructura y Procedencia de Sysmon)**. Contiene el inventario de contenedores, la verificación de conectividad y la demostración de la falta de visibilidad del sensor Zeek en el puente de Docker.
- **`REPORT_ZEEK_CAPTURE.md`**: Informe técnico de la **Fase 2 (Prueba de Concepto de Captura Zeek en Vivo)**. Documenta la arquitectura de namespace compartido (`--net=container:xdr-emu-red`), el análisis de capacidades mínimas (`NET_RAW`, `NET_ADMIN`), el estado de bloqueo por falta de imagen local y la hoja de ruta de integración.
- **`REPORT_REVISION.md`**: Informe de **Revisión y Control de Calidad del Script de Captura**. Detalla los 10 controles estrictos de medición incorporados en `validate_zeek_capture.ps1` (liveness de Zeek, parser TSV de `conn.log` y `http.log`, prevención de colisiones por GUID, correlación exacta de IPs y puertos, y captura forense de logs de error).
- **`validate_benign_http.py`**: Script auxiliar en Python que realiza una petición benigna de lectura (`GET /health`) inter-contenedor a través de la red interna de Docker (`xdr-network`) sin modificar la base de datos ni activar escenarios de ataque.
- **`validate_zeek_capture.ps1`**: Script automatizado en PowerShell para la prueba de concepto de captura en vivo con Zeek. Detecta dinámicamente interfaces de red, gestiona contenedores temporales de forma aislada, genera peticiones correlacionables y evalúa logs `conn.log` y `http.log` mediante parseo estricto de campos TSV.
- **`runs/`**: Directorio donde se archivan de forma aislada e incremental los resultados y logs de cada ejecución de prueba (`run_<timestamp>/`).

---

## Instrucciones de Reproducción y Ejecución Manual

### Fase 1: Prueba Benigna de Comunicación HTTP
Para comprobar la comunicación inter-contenedor básica entre el emulador y la API:
```bash
docker exec xdr-emu-red python -c "import time, requests, json; t0=time.time(); r=requests.get('http://api-ml:8000/health?test_id=repro-check-001', timeout=5); print(r.status_code, r.json())"
```

Verificar logs en el receptor (`xdr-api-ml`):
```bash
docker logs --tail 5 xdr-api-ml
```

### Fase 2: Validación de Captura Zeek en Vivo (Namespace Compartido con 10 Controles)

1. **Comprobar prerrequisitos en modo seguro (Solo Lectura)**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File emulation\validation_infrastructure\validate_zeek_capture.ps1
   ```
   *Si la imagen `zeek/zeek:latest` no está presente, el script generará `status.json` indicando el estado `BLOCKED` sin realizar ninguna descarga.*

2. **Descarga manual de la imagen oficial (Requiere Autorización del Operador)**:
   ```bash
   docker pull zeek/zeek:latest
   ```

3. **Ejecutar la captura en vivo automatizada**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File emulation\validation_infrastructure\validate_zeek_capture.ps1
   ```
   *El script:*
   - *Verificará que `xdr-emu-red` y `xdr-api-ml` están activos.*
   - *Detectará la interfaz (`eth0`), IP origen (`172.22.0.3`) e IP destino (`172.22.0.10`).*
   - *Generará un nombre único con GUID para el contenedor temporal.*
   - *Iniciará Zeek con namespace compartido `--net=container:xdr-emu-red` y capacidades mínimas (`NET_RAW`, `NET_ADMIN`).*
   - *Comprobará que el proceso Zeek siga corriendo y no haya muerto de inmediato.*
   - *Emitirá la solicitud `GET /health?test_id=val-zeek-...` y verificará el `200 OK`.*
   - *Parseará los logs TSV generados en `runs/run_<timestamp>/` correlacionando origen, destino, puerto 8000 y URI.*
   - *Detendrá y removerá de forma segura exclusivamente el contenedor temporal.*
   - *Generará `summary.json` con el veredicto final.*
