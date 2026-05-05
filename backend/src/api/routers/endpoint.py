import asyncio
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from src.models.schemas import SysmonLog
from src.ml_engine.edr_analyzer import analyze_endpoint
from src.services.fusion_service import FusionService
from src.services.alert_service import AlertService
from src.core.logger import logger
from src.api.middlewares import limiter
from src.ml_engine.model_loader import ModelLoader

router = APIRouter()

@router.post("/analyze-endpoint")
@limiter.limit("500/minute")
async def analizar_proceso(request: Request, log: SysmonLog, bg_tasks: BackgroundTasks):
    config_edr = ModelLoader.get('edr').get('config', {})
    historial_actual = await AlertService.actualizar_historial_edr(log, config_edr)

    try:
        def inferencia_cpu():
            return analyze_endpoint(log, historial_actual)
        
        prob_edr, cadena_activa = await asyncio.to_thread(inferencia_cpu)
    except Exception as e:
        logger.error(f"Error inferencia EDR: {e}")
        return {"error": "inference_failed"}

    prob_fusion, accion, severidad = await FusionService.calcular_fusion_edr(log, prob_edr, cadena_activa)

    await AlertService.registrar_alerta_redis_edr(log, prob_edr, accion)

    bg_tasks.add_task(
        AlertService.registrar_alerta_db,
        ip_afectada=log.ip_local,
        severidad_nombre=severidad,
        tipo_capa="CAPA_ENDPOINT",
        accion=accion,
        descripcion=f"Proceso anómalo: {log.proceso}. CMD: {log.cmd}. Prob EDR: {prob_edr:.4f}. Fusión: {prob_fusion:.4f}."
    )

    return {
        "origen": "CAPA_ENDPOINT",
        "prob_edr_cruda": round(prob_edr, 4),
        "prob_fusion_xdr": round(prob_fusion, 4),
        "cadena_activa": cadena_activa,
        "accion": accion
    }
