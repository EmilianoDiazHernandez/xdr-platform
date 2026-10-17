# Adaptador de Telemetría Zeek hacia el Contrato XDR (Fase 3 — Modo Offline)

Este directorio contiene la implementación, auditoría técnica y suite de pruebas del **Adaptador de Telemetría Zeek hacia el Contrato de Datos de la Plataforma XDR v9.0.0**.

El objetivo de esta fase es inspeccionar el contrato de datos real, determinar la compatibilidad campo por campo y construir un adaptador independiente, no destructivo y 100% offline, capaz de transformar capturas en vivo de Zeek en eventos compatibles con el endpoint de FastAPI (`POST /api/v1/analyze-network`) y el modelo Random Forest de la Capa de Red.

---

## 1. Estructura del Directorio

- **`CONTRACT_AUDIT.md`**: Informe técnico exhaustivo de la auditoría del pipeline de red XDR. Detalla el contrato de las 17 características de Machine Learning, el esquema Pydantic `ZeekLog`, las 14 métricas derivadas CICFlowMeter, las heurísticas en Redis, el mecanismo de idempotencia por SHA-256 y la matriz de mapeo completa.
- **`zeek_event_adapter.py`**: Adaptador principal CLI. Lee y analiza metadatos TSV nativos de Zeek (`#separator`, `#fields`, `#types`, `#unset_field`, `#empty_field`), preserva tipos, valida integridad de red, calcula características derivadas y genera un payload normalizado sin llamadas HTTP ni modificaciones en BD.
- **`test_adapter.py`**: Suite de pruebas automatizadas independientes basada en `unittest` de Python. Valida parsing de metadatos, manejo de valores `unset`/`empty`, rechazo de registros malformados, consistencia matemática de CICFlowMeter, correlación L7 con `http.log`, garantía de aislamiento de sockets de red y verificación de inmutabilidad estricta sobre la captura real de `run_20261014_013045`.
- **`dry_run_result.json`**: Reporte consolidado de la ejecución offline sobre la evidencia real (`run_20261014_013045`), demostrando 100% de compatibilidad con el contrato XDR.
- **`output/`**: Directorio donde se almacenan de forma aislada los eventos normalizados (`normalized_events.json`) y el reporte de ejecución (`adapter_report.json`).

---

## 2. Instrucciones de Reproducción y Ejecución

### A. Ejecutar la Suite de Pruebas Automatizadas
Para ejecutar las 8 pruebas unitarias y de integración sin dependencias externas:

```bash
python emulation/validation_infrastructure/zeek_pipeline_poc/test_adapter.py
```

*Resultado esperado:*
```text
test_real_capture_transformation_and_immutability ... ok
test_cicflowmeter_derivation_vs_directly_observed ... ok
test_http_log_correlation_by_uid ... ok
test_offline_isolation_guarantee ... ok
test_xdr_contract_schema_compliance ... ok
test_malformed_record_rejection ... ok
test_parse_metadata_and_headers ... ok
test_type_preservation_and_unset_handling ... ok
----------------------------------------------------------------------
Ran 8 tests in 0.080s

OK
```

### B. Ejecutar el Adaptador en Modo Dry-Run (Offline) sobre la Captura Real
Para transformar y validar cualquier captura archivada en `runs/`:

```bash
python emulation/validation_infrastructure/zeek_pipeline_poc/zeek_event_adapter.py \
    --run-dir emulation/validation_infrastructure/runs/run_20261014_013045 \
    --output-dir emulation/validation_infrastructure/zeek_pipeline_poc/output \
    --dry-run
```

*Salida esperada:*
```text
======================================================================
          REPORTE DE ADAPTACIÓN OFFLINE ZEEK -> XDR
======================================================================
Estado Global            : PASS
Registros Zeek leídos    : 1
Líneas malformadas       : 0
Eventos normalizados     : 1
Eventos rechazados       : 0
Registros HTTP correlac. : 1
----------------------------------------------------------------------
Compatibilidad con Modelo RED (17 Características):
 - Numéricas (8/8)       : 8/8
 - Categóricas (3/3)     : 3/3
 - Binarias (6/6)        : 6/6
 - Cumplimiento Total    : 100% COMPATIBLE
----------------------------------------------------------------------
Archivos generados:
 - Eventos normalizados  : .../output/normalized_events.json
 - Reporte consolidado   : .../output/adapter_report.json
======================================================================
```

---

## 3. Resumen de Compatibilidad Técnica

### Las 17 Características Requeridas por el Random Forest (IoT-23 OHE)
1. **8 Numéricas (Observadas directamente en `conn.log`):** `duration`, `orig_bytes`, `resp_bytes`, `missed_bytes`, `orig_pkts`, `orig_ip_bytes`, `resp_pkts`, `resp_ip_bytes`.
2. **3 Categóricas (Observadas directamente en `conn.log`):** `proto`, `conn_state`, `service`.
3. **6 Binarias (Calculadas determinísticamente de `conn.log`):** `local_orig` (1 if 'T' else 0), `local_resp` (1 if 'T' else 0), `hist_S`, `hist_R`, `hist_A`, `hist_F` (derivadas de la presencia de flags en `history`).

### Las 14 Métricas CICFlowMeter del Esquema `ZeekLog`
Son calculadas analíticamente por el adaptador siguiendo las mismas fórmulas algebraicas que [`collector/transformer.py`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/collector/transformer.py). Se persisten en la tabla `flujos_trafico` de TimescaleDB.

---

## 4. Hoja de Ruta para la Siguiente Fase (Ingesta Activa)

Una vez aprobada esta validación offline, los comandos y ajustes para la siguiente fase (Fase 4: Ingesta en Pipeline Vivo) consistirán en:
1. Configurar un colector vivo tipo streaming (tail / inotify) conectado al directorio de rotación de Zeek.
2. Enviar el lote generado mediante `POST http://api-ml:8000/api/v1/analyze-network`.
3. Verificar la respuesta `HTTP 200` y la inserción del flujo en TimescaleDB (`flujos_trafico`) y Redis (`rate_tcp`, `scan`).
