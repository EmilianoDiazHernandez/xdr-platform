import os
from fastapi import FastAPI, HTTPException
from contextlib import asynccontextmanager
from pathlib import Path

# Importación de módulos internos (Arquitectura Modular)
from schemas import ZeekLog, AnalisisResponse
from preprocessor import prepare_for_rf
from state_manager import state_manager
from engine import XDREngine

# ==========================================
# INICIALIZACIÓN DE COMPONENTES
# ==========================================
BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "model"
engine = XDREngine(MODEL_DIR)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ciclo de vida: Carga de modelos al inicio."""
    print(f"[*] XDREngine: Cargando modelos desde {MODEL_DIR}...")
    try:
        engine.load_models()
        print(f"[+] Modelos cargados exitosamente.")
    except Exception as e:
        print(f"[!] Error crítico cargando motor ML: {e}")
    yield
    print("[*] Apagando XDR Backend...")

app = FastAPI(
    title="XDR Platform - API Modular de Detección",
    version="6.0.0",
    lifespan=lifespan
)

# ==========================================
# ENDPOINTS
# ==========================================

@app.post("/api/v1/analyze", response_model=AnalisisResponse)
def analizar_trafico(log: ZeekLog):
    if engine.rf_model is None:
        raise HTTPException(status_code=500, detail="Motor ML no inicializado.")

    try:
        # 1. Preprocesamiento
        log_dict = log.model_dump()
        df_rf = prepare_for_rf(log_dict, engine.rf_features, engine.rf_config)

        # 2. Análisis Volumétrico (Random Forest)
        prob_rf, es_volumetrico = engine.predict_volumetric(df_rf)

        # 3. Análisis de Comportamiento (Isolation Forest)
        state_manager.add_flow(log.orig_ip, {
            'bytes': log.Subflow_Fwd_Bytes,
            'duracion': log.Flow_Duration,
            'resp_bytes': log.Subflow_Bwd_Bytes,
            'puerto': log.resp_p
        })
        
        recent_flows = state_manager.get_recent_window(log.orig_ip)
        score_if, es_anomalia_temporal = engine.predict_behavioral(recent_flows)

        # 4. Decisión Final y Orquestación de Respuesta
        es_amenaza = es_volumetrico or es_anomalia_temporal
        
        if es_volumetrico and es_anomalia_temporal: tipo = "ATAQUE_COMPLEJO"
        elif es_volumetrico: tipo = "VOLUMETRICO"
        elif es_anomalia_temporal: tipo = "COMPORTAMIENTO"
        else: tipo = "NINGUNA"

        return {
            "status": "success",
            "analisis": {
                "es_anomalia": es_amenaza,
                "tipo_detectado": tipo,
                "detalles_rf": {"probabilidad": round(prob_rf, 4), "disparado": es_volumetrico},
                "detalles_if": {
                    "score_anomalia": round(score_if, 4), 
                    "disparado": es_anomalia_temporal,
                    "flujos_ventana": len(recent_flows),
                    "if_activo": engine.if_model is not None
                }
            },
            "accion_recomendada": "BLOQUEAR_IP" if es_amenaza else "PERMITIR"
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error en el pipeline de análisis: {str(e)}")

@app.get("/health")
def health_check():
    return {
        "status": "ok" if engine.rf_model else "degradado",
        "engine_active": engine.rf_model is not None,
        "dual_mode": engine.if_model is not None,
        "rf_features": len(engine.rf_features)
    }
