import asyncio
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from src.models.schemas import ZeekLog
from src.ml_engine.red_analyzer import analyze_network
from src.services.fusion_service import FusionService
from src.services.alert_service import AlertService
from src.core.logger import logger
from src.api.middlewares import limiter
from src.infrastructure.redis_client import RedisClient

router = APIRouter()

@router.post("/analyze-network")
@limiter.limit("5000/minute")
async def analizar_trafico(request: Request, log: ZeekLog, bg_tasks: BackgroundTasks):
    try:
        es_ataque_volumetrico, es_escaneo = await FusionService.evaluar_heuristica_red(log)

        if es_ataque_volumetrico or es_escaneo:
            prob_red = 0.99
        else:
            prob_red = await asyncio.to_thread(analyze_network, log)
            
    except Exception as e:
        logger.error(f"Error inferencia RED: {e}")
        raise HTTPException(status_code=500, detail=f"inference_failed: {e}")

    prob_fusion, accion, severidad = await FusionService.calcular_fusion_red(log, prob_red)

    redis_ok = False
    if RedisClient.get_client() is not None:
        redis_ok = await AlertService.registrar_alerta_redis_red(log, prob_red)

    bg_tasks.add_task(
        AlertService.registrar_alerta_db,
        ip_afectada=log.resp_ip,
        severidad_nombre=severidad,
        tipo_capa="CAPA_RED",
        accion=accion,
        descripcion=f"Anomalía detectada. Prob RED: {prob_red:.4f}. Fusión: {prob_fusion:.4f}."
    )
        
    return {
        "origen": "CAPA_RED",
        "prob_red_cruda": round(prob_red, 4),
        "prob_fusion_xdr": round(prob_fusion, 4),
        "redis_activo": redis_ok,
        "accion": accion,
    }
