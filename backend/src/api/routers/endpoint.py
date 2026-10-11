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
            prob_fusion, _, _ = await FusionService.calcular_fusion_edr(log, prob_edr, cadena_activa)
            
            # --- THREAT INTEL & MITRE MAPPING ---
            from src.services.threat_intel import check_otx_hash
            from src.services.mitre_mapping import get_edr_mitre_mapping, get_mitre_software
            from src.services.decision_engine import DecisionEngine
            
            otx_score = 0.0
            otx_res = None
            if log.hashes:
                # Si viene formato "MD5=...,SHA256=...", extraer el hash
                raw_hash = log.hashes
                if "=" in raw_hash:
                    for part in raw_hash.split(","):
                        if "=" in part:
                            raw_hash = part.split("=")[-1].strip()
                            break
                otx_res = await check_otx_hash(raw_hash)
                otx_score = otx_res.get("threat_score", 0.0)
                if otx_score > 0.0:
                    prob_fusion = min(1.0, prob_fusion + (otx_score * 0.4))

            mitre_software_id = get_mitre_software(
                file_hash=log.hashes, 
                process_name=log.proceso, 
                cmd=log.cmd, 
                otx_data=otx_res
            )
            
            mitre_technique_id = None
            mitre_tactic = None
            
            if prob_fusion >= 0.85 or otx_score > 0.0 or mitre_software_id:
                mitre_technique_id, mitre_tactic = get_edr_mitre_mapping(log.proceso, log.cmd)
                
            decision = DecisionEngine.evaluate_incident(prob_fusion, False, otx_score, mitre_tactic or "Execution")
            
            accion = decision["accion"]
            severidad = decision["severidad"]
            escalar_alerta = decision["escalar_alerta"]
            
            if RedisClient.get_client() is not None:
                await AlertService.registrar_alerta_redis_edr(log, prob_edr, accion)

            # Persistencia síncrona y duradera requerida antes de responder al cliente
            from src.services.alert_service import IdempotencyConflictError, PersistenceError
            try:
                persist_result = await AlertService.registrar_evento_y_alerta_edr_db(
                    log=log,
                    prob_edr=prob_edr,
                    prob_fusion=prob_fusion,
                    cadena_activa=cadena_activa,
                    accion=accion,
                    severidad_nombre=severidad,
                    mitre_technique_id=mitre_technique_id,
                    mitre_tactic=mitre_tactic,
                    escalar_alerta=escalar_alerta,
                    mitre_software_id=mitre_software_id
                )
                results.append(persist_result)
            except IdempotencyConflictError as ce:
                raise HTTPException(status_code=409, detail=str(ce))
            except PersistenceError as pe:
                logger.error(f"Fallo crítico de base de datos para Sysmon host {log.host}: {pe}")
                raise HTTPException(status_code=503, detail="Servicio de base de datos no disponible temporalmente. Ingesta no confirmada.")
            except Exception as e:
                logger.error(f"Error inesperado en persistencia para host {log.host}: {e}")
                raise HTTPException(status_code=503, detail="Error crítico persistiendo evento EDR en base de datos.")
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error procesando Sysmon log de {log.host}: {e}")
            raise HTTPException(status_code=500, detail=f"Error analizando log de endpoint {log.host}")

    return {
        "origen": "CAPA_ENDPOINT",
        "processed_count": len(results),
        "results": results
    }
