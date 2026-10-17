import asyncio
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from src.models.schemas import EmailLog
from src.ml_engine.email_analyzer import analyze_email
from src.services.fusion_service import FusionService
from src.services.alert_service import AlertService
from src.services.threat_intel import check_otx_url, check_otx_domain
from src.services.mitre_mapping import get_email_mitre_mapping, get_mitre_software
from src.services.decision_engine import DecisionEngine
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

    # --- THREAT INTEL ENRICHMENT ---
    otx_score = 0.0
    mitre_software_id = None
    if log.urls_extraidas:
        try:
            urls_to_check = log.urls_extraidas[:5]
            otx_results = await asyncio.gather(*[check_otx_url(u) for u in urls_to_check])
            for r in otx_results:
                if isinstance(r, dict) and r.get("status") == "hit":
                    num_maliciosas += 1
                    otx_score = max(otx_score, r.get("threat_score", 0.0))
                    soft = get_mitre_software(otx_data=r)
                    if soft:
                        mitre_software_id = soft
        except Exception as e:
            logger.warning(f"[EMAIL] Error consultando OTX para URLs: {e}")

    # Ajustar probabilidad con OTX si hubo indicadores detectados
    if otx_score > 0.0:
        prob_phish = min(1.0, prob_phish + (otx_score * 0.3))

    prob_combined = max(prob_phish, prob_spam)
    mitre_technique_id, mitre_tactic = get_email_mitre_mapping(num_maliciosas)

    # Evaluar con DecisionEngine
    decision = DecisionEngine.evaluate_incident(prob_combined, False, otx_score, mitre_tactic)
    accion = decision["accion"]
    severidad = decision["severidad"]
    escalar_alerta = decision["escalar_alerta"]

    await AlertService.registrar_alerta_redis_email(log, prob_phish, prob_spam, accion)

    if escalar_alerta:
        bg_tasks.add_task(
            AlertService.registrar_alerta_db,
            ip_afectada=log.ip_local,
            severidad_nombre=severidad,
            tipo_capa="CAPA_EMAIL",
            accion=accion,
            descripcion=f"Correo anómalo detectado. Phishing: {prob_phish:.4f}, Spam: {prob_spam:.4f}, OSINT/OTX hits: {num_maliciosas}",
            mitre_technique_id=mitre_technique_id,
            mitre_tactic=mitre_tactic,
            mitre_software_id=mitre_software_id,
            prob_score=prob_combined
        )

    return {
        "origen": "CAPA_EMAIL",
        "prob_phishing": round(prob_phish, 4),
        "prob_spam": round(prob_spam, 4),
        "indicadores_osint": num_maliciosas,
        "accion": accion,
        "severidad": severidad,
        "mitre_technique_id": mitre_technique_id,
        "mitre_tactic": mitre_tactic,
        "mitre_software_id": mitre_software_id
    }
