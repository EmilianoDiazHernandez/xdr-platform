# Pipeline de Ingesta Continua Zeek -> XDR (Fase 3)

Este componente actúa como puente desacoplado en tiempo real entre el sensor pasivo Zeek (que monitorea el tráfico de los contenedores) y el endpoint de Machine Learning de la plataforma XDR (`POST http://api-ml:8000/api/v1/analyze-network`).

---

## 1. Funcionamiento del Adaptador (`zeek_stream_adapter.py`)

1. **Lectura Incremental y Detección de Rotación:**
   - Realiza un seguimiento continuo (*tail*) sobre `conn.log` y `http.log` en el directorio de logs montado (`/zeek_logs`).
   - Mantiene un puntero de lectura (*offset*) persistente en `.stream_state.json`.
   - Si Zeek rota o comprime los logs (el tamaño del archivo disminuye), el adaptador detecta automáticamente el truncamiento y reinicia la lectura sin duplicar eventos ni bloquearse.
2. **Transformación al Contrato de Datos Formal:**
   - Extrae directamente las métricas observadas de red (`orig_bytes`, `resp_bytes`, `orig_pkts`, `duration`, etc.).
   - Calcula determinísticamente las **14 características CICFlowMeter** (`Flow_Duration`, `Flow_Bytes_s`, `Flow_Packets_s`, `Subflow_Fwd_Bytes`, `Down_Up_Ratio`, `Average_Packet_Size`, etc.).
   - Genera llaves canónicas de idempotencia SHA-256 (`uid:ts:orig_ip:orig_p:resp_ip:resp_p`) para evitar alertas duplicadas en TimescaleDB.
   - Enriquece las conexiones L4 con metadatos L7 de `http.log` cruzando por `uid`.
3. **Despacho por Lotes con Resiliencia:**
   - Agrupa los eventos en lotes (`BATCH_SIZE=20` por defecto) o por ventana de tiempo (`FLUSH_INTERVAL=1.0s`).
   - Envía peticiones HTTP `POST` a la plataforma XDR con reintentos exponenciales automáticos ante errores transitorios (HTTP 500/503).
   - Maneja códigos HTTP 409 (Conflictos de idempotencia) de forma no destructiva.

---

## 2. Ejecución de Pruebas Profundas

Para validar todos los aspectos críticos del pipeline sin dependencias externas:

```bash
python emulation/pipeline_ingesta/test_pipeline_deep.py
```

*Resultado esperado:*
```text
Ran 7 tests in 1.648s
OK
```

---

## 3. Modos de Ejecución

### Modo Standalone / Pruebas Offline:
```bash
python emulation/pipeline_ingesta/zeek_stream_adapter.py --log-dir ./zeek_logs --dry-run
```

### Modo Producción (Contenedor Docker):
Se despliega como servicio conectado al volumen de logs de `xdr-emu-router` y a la red `xdr-network` de la plataforma:
```bash
docker build -t xdr-pipeline-ingesta ./emulation/pipeline_ingesta
```
