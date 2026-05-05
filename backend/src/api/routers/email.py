import asyncio
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from src.models.schemas import EmailLog
from src.ml_engine.email_analyzer import analyze_email
from src.services.fusion_service import FusionService
from src.services.alert_service import AlertService
from src.core.logger import logger
from src.api.middlewares import limiter

router = APIRouter()

@router.post("/analyze-email")
@limiter.limit("200/minute")
async def analizar_correo(request: Request, log: EmailLog, bg_tasks: BackgroundTasks):
    try:
        def inferencia_email():
            return analyze_email(log)

        prob_phish, prob_spam, num_maliciosas = await asyncio.to_thread(inferencia_email)
        logger.info(f"[EMAIL] phish={prob_phish:.4f} spam={prob_spam:.4f} host={log.host}")
    except Exception as e:
        logger.error(f"Error inferencia EMAIL: {e}")
        raise HTTPException(status_code=500, detail=f"inference_failed: {str(e)}")

    accion, severidad = FusionService.evaluar_accion_email(prob_phish, prob_spam)

    await AlertService.registrar_alerta_redis_email(log, prob_phish, prob_spam, accion)

    bg_tasks.add_task(
        AlertService.registrar_alerta_db,
        ip_afectada=log.ip_local,
        severidad_nombre=severidad,
        tipo_capa="CAPA_EMAIL",
        accion=accion,
        descripcion=f"Correo anómalo. Phishing: {prob_phish:.4f}, Spam: {prob_spam:.4f}, URLs Maliciosas OSINT: {num_maliciosas}"
    )

    return {
        "origen": "CAPA_EMAIL",
        "prob_phishing": round(prob_phish, 4),
        "prob_spam": round(prob_spam, 4),
        "indicadores_osint": num_maliciosas,
        "accion": accion
    }
