import asyncio
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from src.models.schemas import ZeekLog
from src.ml_engine.red_analyzer import analyze_network
from src.services.fusion_service import FusionService
from src.services.alert_service import AlertService
from src.core.logger import logger
from src.api.middlewares import limiter
from src.infrastructure.redis_client import RedisClient
from src.services.threat_intel import check_ip_reputation
import ipaddress

router = APIRouter()

from typing import List

# Helper to check if IP is external
def is_external(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
        return not ip.is_private and not ip.is_loopback
    except ValueError:
        return False

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

            # --- THREAT INTEL INTEGRATION ---
            otx_score = 0.0
            mitre_software_id = None
            ips_to_check = []
            if is_external(log.orig_ip): ips_to_check.append(log.orig_ip)
            if is_external(log.resp_ip): ips_to_check.append(log.resp_ip)
            
            if ips_to_check:
                from src.services.threat_intel import check_otx_ip
                from src.services.mitre_mapping import get_mitre_software
                otx_results = await asyncio.gather(*[check_otx_ip(ip) for ip in ips_to_check])
                scores = [r.get("threat_score", 0.0) for r in otx_results if isinstance(r, dict)]
                otx_score = max(scores) if scores else 0.0
                for r in otx_results:
                    if r.get("status") == "hit":
                        soft = get_mitre_software(otx_data=r)
                        if soft:
                            mitre_software_id = soft
                            break
                
            mitre_technique_id = None
            mitre_tactic = None
            
            if otx_score > 0.0:
                # Boost probability based on OTX score
                prob_fusion = min(1.0, prob_fusion + (otx_score * 0.4))
                
            from src.services.decision_engine import DecisionEngine
            
            # Map MITRE Technique if it's anomalous or has high score
            if prob_fusion >= 0.85 or otx_score > 0.0:
                from src.services.mitre_mapping import get_network_mitre_mapping
                mitre_technique_id, mitre_tactic = get_network_mitre_mapping(log.resp_p, log.proto)

            decision = DecisionEngine.evaluate_incident(prob_fusion, False, otx_score, mitre_tactic)
            
            accion = decision["accion"]
            severidad = decision["severidad"]
            escalar_alerta = decision["escalar_alerta"]
            # --------------------------------

            redis_ok = False
            if RedisClient.get_client() is not None:
                redis_ok = await AlertService.registrar_alerta_redis_red(log, prob_red)

            # Persistencia síncrona y duradera requerida antes de responder al cliente
            from src.services.alert_service import IdempotencyConflictError, PersistenceError
            try:
                persist_result = await AlertService.registrar_flujo_y_alerta_db(
                    log=log,
                    prob_red=prob_red,
                    prob_fusion=prob_fusion,
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
                logger.error(f"Fallo crítico de base de datos para log {log.uid}: {pe}")
                raise HTTPException(status_code=503, detail="Servicio de base de datos no disponible temporalmente. Ingesta no confirmada.")
            except Exception as e:
                logger.error(f"Error inesperado en persistencia para log {log.uid}: {e}")
                raise HTTPException(status_code=503, detail="Error crítico persistiendo telemetría en base de datos.")
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error en análisis de log {log.uid}: {e}")
            raise HTTPException(status_code=500, detail=f"Error analizando log {log.uid}")
        
    return {
        "origen": "CAPA_RED",
        "processed_count": len(results),
        "results": results
    }
