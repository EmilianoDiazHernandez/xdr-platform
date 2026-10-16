# Auditoría Técnica del Contrato de Datos XDR y Telemetría Zeek

**Fase:** Fase 3 — Adaptador de telemetría Zeek hacia el contrato XDR (Modo Offline)  
**Fecha:** 2026-10-14  
**Rama:** `test/integration-api`  
**Entorno:** Plataforma XDR v9.0.0 (FastAPI, scikit-learn, TimescaleDB, Redis, Zeek 9.0.0)

---

## 1. Resumen Ejecutivo

Esta auditoría inspecciona el código fuente real de la plataforma XDR para determinar la compatibilidad entre los registros en vivo generados por el sensor Zeek (demostrados en [`runs/run_20261014_013045/`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/emulation/validation_infrastructure/runs/run_20261014_013045/)) y el contrato de ingesta de la Capa de Red.

### Hallazgos Principales:
1. **Endpoint Oficial de Ingesta:** FastAPI expone `POST /api/v1/analyze-network` en [`backend/src/api/routers/network.py`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/backend/src/api/routers/network.py#L25-L38), validado estrictamente mediante `List[ZeekLog]`.
2. **El Modelo de Detección (Random Forest):** Entrenado con el dataset Aposemat IoT-23 (`XDR_capa_red_v3.0_IoT23_OHE`), configurado en [`backend/models_data/CAPA_RED/xdr_red_config.pkl`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/backend/models_data/CAPA_RED/xdr_red_config.pkl). **Requiere exactamente 17 características de entrada**.
3. **Compatibilidad Directa de las 17 Características:** Las 17 características requeridas por el Random Forest provienen **100% de campos nativos de `conn.log`** de Zeek. No requieren reconstrucción de flujos por ventanas temporales ni sniffing de paquetes en bruto (pcap).
4. **Métricas CICFlowMeter (14 campos):** El esquema [`ZeekLog`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/backend/src/models/schemas.py#L6-L53) incluye 14 métricas de estilo CICFlowMeter (`Flow_Duration`, `Flow_Bytes_s`, etc.). Estas métricas **no entran al Random Forest**, sino que se persisten en la tabla `flujos_trafico` de TimescaleDB y son calculadas de forma sintética/aproximada por [`collector/transformer.py`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/collector/transformer.py).
5. **Correlación L7 (`http.log`):** Zeek correlaciona los protocolos L4 y L7 mediante el identificador único `uid`. `http.log` enriquece el registro con método, URI, host, user-agent y código de estado HTTP, confirmando el campo `service="http"`.

---

## 2. Componentes del Pipeline Auditados

| Componente | Archivo / Función | Rol en la Plataforma |
| :--- | :--- | :--- |
| **Punto de Entrada API** | [`backend/src/main.py`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/backend/src/main.py#L25) | Registra el router de red bajo el prefijo `/api/v1`. |
| **Router de Red** | [`backend/src/api/routers/network.py#analizar_trafico`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/backend/src/api/routers/network.py#L25-L38) | Endpoint `POST /analyze-network` que recibe `List[ZeekLog]`, evalúa heurísticas y despacha la inferencia. |
| **Modelo Pydantic** | [`backend/src/models/schemas.py#ZeekLog`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/backend/src/models/schemas.py#L6-L53) | Valida tipado, valores por defecto e idempotencia de cada evento de red recibido. |
| **Inferencia ML** | [`backend/src/ml_engine/red_analyzer.py#analyze_network`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/backend/src/ml_engine/red_analyzer.py#L21-L71) | Extrae las 17 características, aplica `RobustScaler`, `OneHotEncoder`, flags binarias y predice con `RandomForestClassifier`. |
| **Configuración ML** | [`backend/models_data/CAPA_RED/xdr_red_config.pkl`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/backend/models_data/CAPA_RED/xdr_red_config.pkl) | Metadatos del modelo: umbral (`0.4696`), listas `features_num`, `features_cat`, `features_bin` y límites de clipping. |
| **Colector de Producción** | [`collector/colector.py`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/collector/colector.py) / [`collector/client_api.py`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/collector/client_api.py) | Demonio batch que lee `conn.log` en modo polling y envía lotes de hasta 50 eventos a FastAPI. |
| **Transformador de Features** | [`collector/transformer.py#extract_features`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/collector/transformer.py#L3-L42) | Función que computa las 14 aproximaciones CICFlowMeter a partir de una línea de `conn.log`. |
| **Motor de Fusión Sensorial** | [`backend/src/services/fusion_service.py`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/backend/src/services/fusion_service.py#L9-L71) | Heurísticas en Redis (escaneo de puertos, ataques volumétricos) y unión probabilística EDR + Red. |
| **Persistencia e Idempotencia** | [`backend/src/services/alert_service.py`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/backend/src/services/alert_service.py#L20-L140) | Comprobación de `idempotency_key` con hash SHA-256 canónico, inserción en `flujos_trafico` y escalado de alertas. |

---

## 3. Las 17 Características Reales del Modelo Random Forest

El archivo de configuración [`xdr_red_config.pkl`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/backend/models_data/CAPA_RED/xdr_red_config.pkl) define exactamente tres familias de características que conforman las **17 variables de entrada**:

### A. 8 Variables Numéricas (`features_num`)
Se normalizan mediante `np.log1p(df[col].clip(lower=0))` y se transforman con [`RobustScaler`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/backend/models_data/CAPA_RED/xdr_red_scaler.pkl):

| # | Característica | Tipo | Campo Nativo Zeek | Límites Clipping (Config) | Significado Semántico |
| :-: | :--- | :--- | :--- | :--- | :--- |
| **1** | `duration` | float (s) | `duration` | `[0.0, 3.108575]` | Duración de la conexión reportada por Zeek en segundos. |
| **2** | `orig_bytes` | float | `orig_bytes` | `[0.0, 56.0]` | Bytes de carga útil transmitidos por el originador. |
| **3** | `resp_bytes` | float | `resp_bytes` | `[0.0, 57.0]` | Bytes de carga útil respondidos por el destino. |
| **4** | `missed_bytes` | float | `missed_bytes` | `[0.0, 0.0]` | Bytes perdidos en el análisis (huecos en números de secuencia TCP). |
| **5** | `orig_pkts` | float | `orig_pkts` | `[0.0, 5.0]` | Número de paquetes transmitidos por el originador. |
| **6** | `orig_ip_bytes` | float | `orig_ip_bytes` | `[0.0, 286.0]` | Total de bytes a nivel IP (incluye cabeceras) enviados por el originador. |
| **7** | `resp_pkts` | float | `resp_pkts` | `[0.0, 5.0]` | Número de paquetes respondidos por el destino. |
| **8** | `resp_ip_bytes` | float | `resp_ip_bytes` | `[0.0, 347.0]` | Total de bytes a nivel IP transmitidos por el destino. |

### B. 3 Variables Categóricas (`features_cat`)
Se codifican mediante [`OneHotEncoder`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/backend/models_data/CAPA_RED/xdr_red_encoder.pkl) produciendo **22 columnas binarias**:

| # | Característica | Tipo | Campo Nativo Zeek | Categorías Reconocidas por el Encoder | Columnas OHE |
| :-: | :--- | :--- | :--- | :--- | :-: |
| **9** | `proto` | string | `proto` | `icmp`, `tcp`, `udp` | 3 |
| **10** | `conn_state` | string | `conn_state` | `oth`, `rej`, `rsto`, `rstos0`, `rstr`, `rstrh`, `s0`, `s1`, `s2`, `s3`, `sf`, `sh`, `shr` | 13 |
| **11** | `service` | string | `service` | `0` (reemplazo de `-`), `dhcp`, `dns`, `http`, `irc`, `ssh` | 6 |

*Total columnas codificadas:* $3 + 13 + 6 = 22$.

### C. 6 Variables Binarias (`features_bin`)
Se computan en tiempo de ejecución a partir de los campos `local_orig`, `local_resp` e `history` de Zeek:

| # | Característica | Tipo | Origen en Zeek | Regla de Derivación |
| :-: | :--- | :--- | :--- | :--- |
| **12** | `local_orig` | int {0, 1} | `local_orig` | `1 if local_orig.upper() == 'T' else 0` |
| **13** | `local_resp` | int {0, 1} | `local_resp` | `1 if local_resp.upper() == 'T' else 0` |
| **14** | `hist_S` | int {0, 1} | `history` | `1 if 's' in history.lower() else 0` (SYN transmitido) |
| **15** | `hist_R` | int {0, 1} | `history` | `1 if 'r' in history.lower() else 0` (RST transmitido) |
| **16** | `hist_A` | int {0, 1} | `history` | `1 if 'a' in history.lower() else 0` (ACK transmitido) |
| **17** | `hist_F` | int {0, 1} | `history` | `1 if 'f' in history.lower() else 0` (FIN transmitido) |

### D. Composición del Vector Final de Entrada
En [`red_analyzer.py#L67`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/backend/src/ml_engine/red_analyzer.py#L67):
$$\mathbf{X}_{\text{final}} = \big[\, \mathbf{X}_{\text{num\_scaled}}\,(8) \;\mathbin{\Vert}\; \mathbf{X}_{\text{cat\_encoded}}\,(22) \;\mathbin{\Vert}\; \mathbf{bin\_data}\,(6) \,\big] \in \mathbb{R}^{1 \times 36}$$
El vector resultante de **36 dimensiones** alimenta directamente a `rf_modelo.predict_proba(X_final)`.

---

## 4. El Esquema Pydantic `ZeekLog` (Payload de FastAPI)

El modelo en [`src/models/schemas.py`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/backend/src/models/schemas.py#L6-L53) requiere un objeto JSON estructurado en 4 grupos funcionales:

```python
class ZeekLog(BaseModel):
    # 1. Identidad e Idempotencia
    idempotency_key: Optional[str] = None
    ts: float = 0.0
    uid: str = "unknown"
    
    # 2. 5-Tupla e Identidad de Red (Directos de Zeek)
    orig_ip: str         # id.orig_h
    resp_ip: str         # id.resp_h
    orig_p: int = 0      # id.orig_p
    resp_p: int = 0      # id.resp_p
    proto: str = "tcp"
    service: str = "-"
    conn_state: str = "-"
    history: str = "-"
    
    # 3. Métricas de Tráfico Base (Directos de Zeek)
    duration: float = 0.0
    orig_bytes: float = 0.0
    resp_bytes: float = 0.0
    missed_bytes: float = 0.0
    orig_pkts: float = 0.0
    resp_pkts: float = 0.0
    orig_ip_bytes: float = 0.0
    resp_ip_bytes: float = 0.0
    local_orig: str = "F"
    local_resp: str = "F"

    # 4. Métricas CICFlowMeter (Derivadas por transformador)
    Flow_Duration: float = 0.0
    Flow_Bytes_s: float = 0.0
    Flow_Packets_s: float = 0.0
    Subflow_Fwd_Bytes: float = 0.0
    Subflow_Bwd_Bytes: float = 0.0
    Subflow_Fwd_Packets: float = 0.0
    act_data_pkt_fwd: float = 0.0
    Fwd_Header_Length: float = 0.0
    Bwd_Header_Length: float = 0.0
    Fwd_Packet_Length_Max: float = 0.0
    Bwd_Packet_Length_Max: float = 0.0
    Bwd_Packet_Length_Min: float = 0.0
    Down_Up_Ratio: float = 0.0
    Average_Packet_Size: float = 0.0
```

---

## 5. Auditoría de las 14 Métricas Derivadas CICFlowMeter

En [`collector/transformer.py`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/collector/transformer.py), las 14 métricas no provienen de un analizador pcap externo, sino que son **aproximaciones analíticas calculadas a partir del resumen de conexión**:

| Métrica | Fórmula de Cálculo en `transformer.py` | Limitación Matemática / Observación |
| :--- | :--- | :--- |
| `Flow_Duration` | $\text{duration} \times 10^6$ si $\text{duration} > 0$ else $1.0$ | Microsegundos aproximados (Zeek mide en segundos float). |
| `Flow_Bytes_s` | $\frac{\text{orig\_bytes} + \text{resp\_bytes}}{\text{Flow\_Duration} / 10^6}$ | Tasa global de transferencia en bytes/segundo. |
| `Flow_Packets_s` | $\frac{\text{orig\_pkts} + \text{resp\_pkts}}{\text{Flow\_Duration} / 10^6}$ | Tasa de paquetes por segundo. |
| `Subflow_Fwd_Bytes` | $\text{orig\_bytes}$ | Equivalencia directa al volumen originador. |
| `Subflow_Bwd_Bytes` | $\text{resp\_bytes}$ | Equivalencia directa al volumen respondedor. |
| `Subflow_Fwd_Packets` | $\text{orig\_pkts}$ | Equivalencia directa a paquetes originador. |
| `act_data_pkt_fwd` | $\max(0, \text{orig\_pkts} - 1)$ | Asume que 1 paquete es SYN o control sin payload. |
| `Fwd_Header_Length` | $\text{orig\_ip\_bytes} - \text{orig\_bytes}$ (o $\text{orig\_pkts} \times 20$) | Deducción de longitud de cabeceras de transporte e IP. |
| `Bwd_Header_Length` | $\text{resp\_ip\_bytes} - \text{resp\_bytes}$ (o $\text{resp\_pkts} \times 20$) | Deducción de cabeceras responder. |
| `Fwd_Packet_Length_Max` | $\frac{\text{orig\_bytes}}{\text{orig\_pkts}}$ si $\text{orig\_pkts} > 0$ else $0.0$ | **Aproximación:** es el tamaño medio del payload, no el máximo real (Zeek `conn.log` no registra máximos individuales). |
| `Bwd_Packet_Length_Max` | $\frac{\text{resp\_bytes}}{\text{resp\_pkts}}$ si $\text{resp\_pkts} > 0$ else $0.0$ | **Aproximación:** es el tamaño medio responder. |
| `Bwd_Packet_Length_Min` | $0.0$ | Constante fija por defecto. |
| `Down_Up_Ratio` | $\frac{\text{resp\_bytes}}{\text{orig\_bytes}}$ si $\text{orig\_bytes} > 0$ else $0.0$ | Ratio de descarga frente a subida. |
| `Average_Packet_Size` | $\frac{\text{orig\_bytes} + \text{resp\_bytes}}{\text{orig\_pkts} + \text{resp\_pkts}}$ | Tamaño medio del payload de paquetes combinados. |

---

## 6. Mecanismos de Idempotencia y Correlación

### Idempotencia
1. **Identificador:** Campo opcional `idempotency_key` en el payload.
2. **Validación:** [`AlertService.compute_payload_hash`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/backend/src/services/alert_service.py#L21-L25) calcula el hash canónico SHA-256 de todo el diccionario excluyendo `idempotency_key`.
3. **Comportamiento:**
   - Si la llave existe con el mismo hash: reenvío idempotente sin re-procesar ni re-insertar (`idempotent_replay: true`, HTTP 200).
   - Si la llave existe con hash distinto: conflicto de idempotencia ([`IdempotencyConflictError`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/backend/src/services/alert_service.py#L11-L13), HTTP 409).

### Correlación y Fusión
1. **Redis Cache:**
   - `scan:<orig_ip>`: Conjunto expirante a 10s para detectar escaneos ($\ge 5$ puertos tocados).
   - `rate_tcp:<orig_ip>`: Contador a 2s para detectar ráfagas volumétricas ($> 50$ conexiones).
   - `ip_host:<resp_ip>` y `edr:<host>:prob`: Enlace cruzado con eventos de Sysmon del host objetivo.
2. **Fusión:**
   $$\text{prob\_fusion} = \text{prob\_red} + \text{prob\_edr} - (\text{prob\_red} \times \text{prob\_edr})$$
3. **Persistencia:**
   - Todo flujo evaluado se guarda en la tabla relacional `flujos_trafico`.
   - Si $\text{prob\_fusion} \ge 0.65$ o $\text{prob\_red} \ge \text{umbral}$, se escala a la tabla `alertas_xdr` con técnica MITRE asignada según puerto/protocolo.

---

## 7. Mapeo Exhaustivo: Registro Zeek Real vs Contrato XDR

A continuación se muestra el mapeo concreto utilizando la evidencia real capturada en [`run_20261014_013045`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/emulation/validation_infrastructure/runs/run_20261014_013045/conn.log):

| Campo Zeek Nativo (`conn.log`) | Valor Real en Captura | Tipo Zeek | Destino en `ZeekLog` (FastAPI) | Destino en ML (17 Features) | Estatus de Compatibilidad |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ts` | `1791963051.779273` | time | `ts: float` | Metadato temporal | **COMPATIBLE DIRECTO** |
| `uid` | `CUANUFn3c2F6XbfWf` | string | `uid: str` | Metadato identificador | **COMPATIBLE DIRECTO** |
| `id.orig_h` | `172.22.0.3` | addr | `orig_ip: str` | Red / Correlación | **COMPATIBLE (Renombrado)** |
| `id.resp_h` | `172.22.0.10` | addr | `resp_ip: str` | Red / Correlación | **COMPATIBLE (Renombrado)** |
| `id.orig_p` | `33654` | port | `orig_p: int` | Red / 5-tupla | **COMPATIBLE (Renombrado)** |
| `id.resp_p` | `8000` | port | `resp_p: int` | MITRE / Heurísticas | **COMPATIBLE (Renombrado)** |
| `proto` | `tcp` | enum | `proto: str` | Feature Categórica #9 (`proto`) | **COMPATIBLE DIRECTO** |
| `service` | `http` | string | `service: str` | Feature Categórica #11 (`service`) | **COMPATIBLE DIRECTO** |
| `duration` | `0.003708` | interval | `duration: float` | Feature Numérica #1 (`duration`) | **COMPATIBLE DIRECTO** |
| `orig_bytes` | `176` | count | `orig_bytes: float` | Feature Numérica #2 (`orig_bytes`) | **COMPATIBLE DIRECTO** |
| `resp_bytes` | `338` | count | `resp_bytes: float` | Feature Numérica #3 (`resp_bytes`) | **COMPATIBLE DIRECTO** |
| `conn_state` | `SF` | string | `conn_state: str` | Feature Categórica #10 (`conn_state`) | **COMPATIBLE DIRECTO** |
| `local_orig` | `T` | bool | `local_orig: str` | Feature Binaria #12 (`local_orig`) | **COMPATIBLE DIRECTO** |
| `local_resp` | `T` | bool | `local_resp: str` | Feature Binaria #13 (`local_resp`) | **COMPATIBLE DIRECTO** |
| `missed_bytes` | `0` | count | `missed_bytes: float` | Feature Numérica #4 (`missed_bytes`) | **COMPATIBLE DIRECTO** |
| `history` | `ShADadFf` | string | `history: str` | Features Binarias #14-17 (S, R, A, F) | **COMPATIBLE DIRECTO** |
| `orig_pkts` | `7` | count | `orig_pkts: float` | Feature Numérica #5 (`orig_pkts`) | **COMPATIBLE DIRECTO** |
| `orig_ip_bytes` | `548` | count | `orig_ip_bytes: float` | Feature Numérica #6 (`orig_ip_bytes`) | **COMPATIBLE DIRECTO** |
| `resp_pkts` | `5` | count | `resp_pkts: float` | Feature Numérica #7 (`resp_pkts`) | **COMPATIBLE DIRECTO** |
| `resp_ip_bytes` | `606` | count | `resp_ip_bytes: float` | Feature Numérica #8 (`resp_ip_bytes`) | **COMPATIBLE DIRECTO** |
| `tunnel_parents` | `-` | set[string] | *(No requerido)* | *(No requerido)* | Ignorado limpiamente |
| `ip_proto` | `6` | count | *(No requerido)* | *(No requerido)* | Ignorado limpiamente |
| *(Derivado)* | `3708.0` | float | `Flow_Duration` | DB `flujos_trafico` | **DERIVADO CALCULADO** |
| *(Derivado)* | `138619.2` | float | `Flow_Bytes_s` | DB `flujos_trafico` | **DERIVADO CALCULADO** |
| *(Derivado)* | `3236.2` | float | `Flow_Packets_s` | DB `flujos_trafico` | **DERIVADO CALCULADO** |
| *(Derivado)* | `176.0` | float | `Subflow_Fwd_Bytes` | DB `flujos_trafico` | **DERIVADO CALCULADO** |
| *(Derivado)* | `338.0` | float | `Subflow_Bwd_Bytes` | DB `flujos_trafico` | **DERIVADO CALCULADO** |
| *(Derivado)* | `7.0` | float | `Subflow_Fwd_Packets`| DB `flujos_trafico` | **DERIVADO CALCULADO** |
| *(Derivado)* | `6.0` | float | `act_data_pkt_fwd` | DB `flujos_trafico` | **DERIVADO CALCULADO** |
| *(Derivado)* | `372.0` | float | `Fwd_Header_Length`| DB `flujos_trafico` | **DERIVADO CALCULADO** |
| *(Derivado)* | `268.0` | float | `Bwd_Header_Length`| DB `flujos_trafico` | **DERIVADO CALCULADO** |
| *(Derivado)* | `25.14` | float | `Fwd_Packet_Length_Max` | DB `flujos_trafico` | **DERIVADO APROXIMADO** |
| *(Derivado)* | `67.6` | float | `Bwd_Packet_Length_Max` | DB `flujos_trafico` | **DERIVADO APROXIMADO** |
| *(Derivado)* | `0.0` | float | `Bwd_Packet_Length_Min` | DB `flujos_trafico` | **DERIVADO CONSTANTE** |
| *(Derivado)* | `1.92` | float | `Down_Up_Ratio` | DB `flujos_trafico` | **DERIVADO CALCULADO** |
| *(Derivado)* | `42.83` | float | `Average_Packet_Size` | DB `flujos_trafico` | **DERIVADO CALCULADO** |
| *(Enriquecimiento L7)* | `/health?test_id=...` | string | `http_meta.uri` | Auditoría L7 | **CORRELACIONADO POR UID** |

---

## 8. Conclusión de la Auditoría

1. **Viabilidad del Adaptador:** Es **100% viable** transformar directamente los eventos capturados por Zeek hacia el contrato `ZeekLog` requerido por FastAPI y el modelo de Red.
2. **Independencia de Ventanas Temporales:** Las 17 características de entrada para la detección de malware/anomalías con Random Forest se derivan de forma cerrada y determinista para cada conexión individual a partir de `conn.log`.
3. **No Invención de Datos:** Ningún campo numérico de los 17 del modelo necesita ser inventado con valores arbitrarios; todos corresponden a métricas de red reales observadas por Zeek en la interfaz `eth0`.
4. **Idempotencia Determinística:** Puede generarse una `idempotency_key` determinística basada en el `uid` de Zeek o en el hash SHA-256 de la tupla `(uid, ts, orig_ip, orig_p, resp_ip, resp_p)`, garantizando tolerancia a fallos y reintentos sin duplicidad.
