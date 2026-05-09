import asyncio
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from src.models.schemas import SysmonLog
from src.ml_engine.edr_analyzer import analyze_endpoint
from src.services.fusion_service import FusionService
from src.services.alert_service import AlertService
from src.core.logger import logger
from src.api.middlewares import limiter
from src.ml_engine.model_loader import ModelLoader
from src.infrastructure.redis_client import RedisClient

router = APIRouter()

from typing import List

@router.post("/analyze-endpoint")
@limiter.limit("5000/minute")
async def analizar_proceso(request: Request, logs: List[SysmonLog], bg_tasks: BackgroundTasks):
    config_edr = ModelLoader.get('edr').get('config', {})
    results = []

    for log in logs:
        try:
            historial_actual = await AlertService.actualizar_historial_edr(log, config_edr)

            def inferencia_cpu():
                return analyze_endpoint(log, historial_actual)
            
            prob_edr, cadena_activa = await asyncio.to_thread(inferencia_cpu)
            prob_fusion, accion, severidad = await FusionService.calcular_fusion_edr(log, prob_edr, cadena_activa)

            if RedisClient.get_client() is not None:
                await AlertService.registrar_alerta_redis_edr(log, prob_edr, accion)

            results.append({
                "host": log.host,
                "proceso": log.proceso,
                "prob_edr_cruda": round(prob_edr, 4),
                "prob_fusion_xdr": round(prob_fusion, 4),
                "cadena_activa": cadena_activa,
                "accion": accion
            })

            bg_tasks.add_task(
                AlertService.registrar_evento_y_alerta_edr_db,
                log=log,
                prob_edr=prob_edr,
                prob_fusion=prob_fusion,
                cadena_activa=cadena_activa,
                accion=accion,
                severidad_nombre=severidad
            )
        except Exception as e:
            logger.error(f"Error procesando Sysmon log de {log.host}: {e}")
            continue

    return {
        "origen": "CAPA_ENDPOINT",
        "processed_count": len(results),
        "results": results
    }
