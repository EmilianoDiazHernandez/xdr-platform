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

from typing import List
from src.models.schemas import ZeekLog

# ... (rest of imports)

@router.post("/analyze-network")
@limiter.limit("5000/minute")
async def analizar_trafico(request: Request, logs: List[ZeekLog], bg_tasks: BackgroundTasks):
    results = []
    
    for log in logs:
        try:
            es_ataque_volumetrico, es_escaneo = await FusionService.evaluar_heuristica_red(log)

            if es_ataque_volumetrico or es_escaneo:
                prob_red = 0.99
            else:
                prob_red = await asyncio.to_thread(analyze_network, log)
                
            prob_fusion, accion, severidad = await FusionService.calcular_fusion_red(log, prob_red)

            redis_ok = False
            if RedisClient.get_client() is not None:
                redis_ok = await AlertService.registrar_alerta_redis_red(log, prob_red)

            results.append({
                "uid": log.uid,
                "prob_red_cruda": round(prob_red, 4),
                "prob_fusion_xdr": round(prob_fusion, 4),
                "accion": accion,
                "severidad": severidad
            })

            # Añadir a la cola de persistencia en segundo plano
            bg_tasks.add_task(
                AlertService.registrar_flujo_y_alerta_db,
                log=log,
                prob_red=prob_red,
                prob_fusion=prob_fusion,
                accion=accion,
                severidad_nombre=severidad
            )
        except Exception as e:
            logger.error(f"Error procesando log {log.uid}: {e}")
            continue
        
    return {
        "origen": "CAPA_RED",
        "processed_count": len(results),
        "results": results
    }
