from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict
from contextlib import asynccontextmanager
from scipy.stats import entropy as scipy_entropy  # FIX 4
import pandas as pd
import joblib
import numpy as np
from collections import defaultdict, deque
import time

# ==========================================
# ESTADO GLOBAL
# ==========================================
rf_modelo     = None
rf_scaler     = None
config        = None
features_zeek = []
if_modelo     = None
if_scaler     = None
if_features   = []
if_umbral     = -1.0
ventanas_ip   = defaultdict(lambda: deque(maxlen=200))

# ==========================================
# FIX 1+2 — UN SOLO app, UN SOLO mecanismo de startup
# Eliminar el @app.on_event("startup") y el primer app = FastAPI()
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    global rf_modelo, rf_scaler, config, features_zeek
    global if_modelo, if_scaler, if_features, if_umbral

    print("Cargando arquitectura XDR Dual...")
    try:
        config        = joblib.load('rf_zeek_config.pkl')
        rf_modelo     = joblib.load('rf_zeek_model.pkl')
        rf_scaler     = joblib.load('rf_zeek_scaler.pkl')
        features_zeek = joblib.load('rf_zeek_features.pkl')
        print(f"RF cargado — {len(features_zeek)} features | "
              f"umbral={config.get('umbral_rf', 0.30)}")
    except Exception as e:
        print(f"ERROR CRITICO cargando RF: {e}")
        raise

    try:
        if_modelo   = joblib.load('if_temporal_model.pkl')
        if_scaler   = joblib.load('if_temporal_scaler.pkl')
        if_umbral   = float(joblib.load('if_temporal_umbral.pkl'))
        if_features = joblib.load('if_temporal_features.pkl')
        print("IF temporal cargado — Bot/SSH activo")
    except FileNotFoundError:
        print("AVISO: IF temporal no encontrado — solo RF volumétrico activo")

    yield   # FastAPI corre aquí

    print("Apagando XDR...")


# FIX 1: UNA sola instancia de app con lifespan
app = FastAPI(
    title="XDR Platform - Detección ML Dual",
    description="RF Volumétrico + IF Temporal",
    version="5.1.0",
    lifespan=lifespan
)

# ==========================================
# SCHEMA — 14 features del modelo + campos de contexto
# Nota: Fwd_Packet_Length_Min, PSH/ACK/URG NO están en features_zeek
# Se reciben pero el modelo no las usa — considera eliminarlas
# del schema para evitar confusión
# ==========================================
class ZeekLog(BaseModel):
    orig_ip:  str
    resp_p:   int

    # Las 14 features que el modelo usa
    Flow_Duration:          float
    Flow_Bytes_s:           float
    Flow_Packets_s:         float
    Subflow_Fwd_Bytes:      float
    Subflow_Bwd_Bytes:      float
    Subflow_Fwd_Packets:    float
    act_data_pkt_fwd:       float
    Fwd_Header_Length:      float
    Bwd_Header_Length:      float
    Fwd_Packet_Length_Max:  float
    Bwd_Packet_Length_Max:  float
    Bwd_Packet_Length_Min:  float
    Down_Up_Ratio:          float
    Average_Packet_Size:    float

    model_config = ConfigDict(populate_by_name=True)


FIELD_MAP = {
    'Flow_Duration':         'Flow Duration',
    'Flow_Bytes_s':          'Flow Bytes/s',
    'Flow_Packets_s':        'Flow Packets/s',
    'Subflow_Fwd_Bytes':     'Subflow Fwd Bytes',
    'Subflow_Bwd_Bytes':     'Subflow Bwd Bytes',
    'Subflow_Fwd_Packets':   'Subflow Fwd Packets',
    'act_data_pkt_fwd':      'act_data_pkt_fwd',
    'Fwd_Header_Length':     'Fwd Header Length',
    'Bwd_Header_Length':     'Bwd Header Length',
    'Fwd_Packet_Length_Max': 'Fwd Packet Length Max',
    'Bwd_Packet_Length_Max': 'Bwd Packet Length Max',
    'Bwd_Packet_Length_Min': 'Bwd Packet Length Min',
    'Down_Up_Ratio':         'Down/Up Ratio',
    'Average_Packet_Size':   'Average Packet Size',
}

# ==========================================
# ENDPOINT PRINCIPAL
# ==========================================
@app.post("/api/v1/analyze")
def analizar_trafico(log: ZeekLog):
    if rf_modelo is None:
        raise HTTPException(status_code=500, detail="Modelo RF no cargado.")

    try:
        # === FASE 1: RF Volumétrico ===
        # FIX 5: model_dump() en vez de dict()
        datos_raw = log.model_dump()
        datos_cic = {FIELD_MAP[k]: v
                     for k, v in datos_raw.items()
                     if k in FIELD_MAP}

        df = pd.DataFrame([datos_cic])[features_zeek]

        for col in config.get('columnas_log1p', []):
            if col in df.columns:
                df[col] = np.log1p(df[col].clip(lower=0)) 

        X_rf       = rf_scaler.transform(df)
        umbral_rf  = config.get('umbral_rf', 0.30)
        prob_rf    = float(rf_modelo.predict_proba(X_rf)[0][1])
        es_volumetrico = prob_rf >= umbral_rf

        # === FASE 2: IF Temporal ===
        ahora      = time.time()
        ip         = log.orig_ip
        es_anomalia_temporal = False
        score_if   = 0.0

        ventanas_ip[ip].append({
            'ts':      ahora,
            'bytes':   log.Subflow_Fwd_Bytes,
            'duracion':log.Flow_Duration,
            'resp_bytes': log.Subflow_Bwd_Bytes,
            'puerto':  log.resp_p,
        })

        if if_modelo is not None:
            flujos = [f for f in ventanas_ip[ip] if ahora - f['ts'] <= 60]

            if len(flujos) >= 5:
                puertos_lista = [f['puerto'] for f in flujos]
                conteo_puertos = pd.Series(puertos_lista).value_counts()

                # FIX 4: calcular entropy real, no 0.0
                entropy_real = float(
                    scipy_entropy(conteo_puertos.values + 1)
                )

                feats_if = {
                    'n_conexiones':         len(flujos),
                    'n_puertos_distintos':  len(set(puertos_lista)),
                    'bytes_promedio':       float(np.mean([f['bytes']
                                            for f in flujos])),
                    'duracion_promedio':    float(np.mean([f['duracion']
                                            for f in flujos])),
                    'ratio_fallidas':       sum(1 for f in flujos
                                            if f['resp_bytes'] == 0)
                                            / len(flujos),
                    'entropy_puertos':      entropy_real,
                }

                df_if    = pd.DataFrame([feats_if])[if_features]
                X_if     = if_scaler.transform(df_if)
                score_if = float(if_modelo.score_samples(X_if)[0])
                es_anomalia_temporal = score_if < if_umbral

        # === FASE 3: Decisión final ===
        es_amenaza = es_volumetrico or es_anomalia_temporal

        if es_volumetrico and es_anomalia_temporal:
            tipo = "ATAQUE_COMPLEJO"
        elif es_volumetrico:
            tipo = "VOLUMETRICO"
        elif es_anomalia_temporal:
            tipo = "COMPORTAMIENTO"
        else:
            tipo = "NINGUNA"

        return {
            "status":  "success",
            "analisis": {
                "es_anomalia":    es_amenaza,
                "tipo_detectado": tipo,
                "detalles_rf": {
                    "probabilidad": round(prob_rf, 4),
                    "disparado":    es_volumetrico,
                },
                "detalles_if": {
                    "score_anomalia":  round(score_if, 4),
                    "disparado":       es_anomalia_temporal,
                    "flujos_ventana":  len(ventanas_ip[ip]),
                    "if_activo":       if_modelo is not None,
                },
            },
            "accion_recomendada": "BLOQUEAR_IP" if es_amenaza else "PERMITIR",
        }

    except Exception as e:
        raise HTTPException(status_code=400,
                            detail=f"Error procesando flujo: {str(e)}")


# ==========================================
# FIX 3: healthcheck usa rf_modelo, no 'modelo'
# ==========================================
@app.get("/health")
def health_check():
    return {
        "status":         "ok" if rf_modelo is not None else "degradado",
        "rf_cargado":     rf_modelo is not None,
        "if_cargado":     if_modelo is not None,
        "modo":           "DUAL" if if_modelo else "RF_SOLO",
        "n_features_rf":  len(features_zeek),
        "umbral_rf":      config.get('umbral_rf') if config else None,
        "version":        config.get('version')   if config else None,
    }

# Agrega esto temporalmente en main.py, después del endpoint /health

@app.post("/api/v1/debug")
def debug_trafico(log: ZeekLog):
    """Endpoint temporal para diagnosticar qué ve el modelo dentro de la API."""
    datos_raw = log.model_dump()
    datos_cic = {FIELD_MAP.get(k, k): v
                 for k, v in datos_raw.items()
                 if k in FIELD_MAP}

    # ¿Qué features están disponibles después del mapeo?
    features_en_payload = list(datos_cic.keys())
    features_faltantes  = [f for f in features_zeek if f not in datos_cic]

    # Construir DataFrame
    df = pd.DataFrame([datos_cic])

    # ¿Qué columnas tiene el df antes de seleccionar features_zeek?
    cols_antes = list(df.columns)

    # Seleccionar solo features_zeek
    try:
        df = df[features_zeek]
    except KeyError as e:
        return {"error": f"KeyError al seleccionar features: {e}"}

    # Aplicar log1p
    cols_log = config.get('columnas_log1p', [])
    for col in cols_log:
        if col in df.columns:
            df[col] = np.log1p(df[col].clip(lower=0))
    # Escalar
    X_scaled = rf_scaler.transform(df)

    # Predecir
    prob = float(rf_modelo.predict_proba(X_scaled)[0][1])

    return {
        "prob_rf":              prob,
        "features_zeek_config": features_zeek,
        "features_en_payload":  features_en_payload,
        "features_faltantes":   features_faltantes,
        "cols_antes_seleccion": cols_antes,
        "cols_log1p":           cols_log,
        "valores_post_log1p":   df.iloc[0].to_dict(),
        "X_scaled_primeras_5":  X_scaled[0][:5].tolist(),
        "X_test_s_primeras_5":  "ver abajo",
    }