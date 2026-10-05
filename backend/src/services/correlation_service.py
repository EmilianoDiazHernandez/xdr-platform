import uuid
import json
from datetime import datetime, timezone
from src.core.logger import logger
from src.infrastructure.redis_client import RedisClient
from src.models.schemas import AttackFlowStep

class CorrelationService:
    @staticmethod
    async def correlate_and_get_event(conn, id_dispositivo: str, id_severidad: int, layer: str, desc: str, ts_event=None, prob_fusion: float = 0.0):
        """
        Encuentra o crea un evento correlacionado para un dispositivo usando ventana deslizante de 4h apoyada en Redis.
        Combina la probabilidad de fusión de los diferentes modelos ML.
        """
        try:
            redis = RedisClient.get_client()
            redis_key = f"corr_event:{id_dispositivo}"
            
            # Determinar el timestamp del evento
            actual_ts = ts_event if ts_event else datetime.now(timezone.utc).isoformat()
            
            id_evento = None
            if redis:
                id_evento = await redis.get(redis_key)
            
            # Si existe en Redis, intentar actualizar (Hit)
            if id_evento:
                row = await conn.fetchrow("""
                    SELECT severidad_global, probabilidad_global, jsonb_array_length(attack_flow) as num_steps
                    FROM eventos_correlacionados
                    WHERE id_evento_correlacionado = $1 AND estado = 'Abierto'
                """, id_evento)
                
                if row:
                    step = AttackFlowStep(
                        step_order=row['num_steps'] + 1,
                        timestamp=str(actual_ts),
                        vector=layer,
                        anomaly_score=prob_fusion,
                        description=desc
                    )
                    
                    nueva_severidad = max(row['severidad_global'], id_severidad)
                    prob_actual = row['probabilidad_global'] if row['probabilidad_global'] is not None else 0.0
                    nueva_prob = 1.0 - ((1.0 - prob_actual) * (1.0 - prob_fusion))
                    
                    await conn.execute("""
                        UPDATE eventos_correlacionados
                        SET fecha_actualizacion = NOW(),
                            severidad_global = $1,
                            probabilidad_global = $2,
                            attack_flow = attack_flow || $3::jsonb
                        WHERE id_evento_correlacionado = $4
                    """, nueva_severidad, nueva_prob, step.model_dump_json(), id_evento)
                    
                    if redis:
                        await redis.expire(redis_key, 14400) # Reiniciar TTL 4 horas
                    
                    return id_evento
                else:
                    # El evento estaba en Redis pero cerrado o eliminado en BD
                    id_evento = None
            
            # Si no hay id_evento (Miss en Redis o estaba cerrado en BD), buscar en BD
            if not id_evento:
                row = await conn.fetchrow("""
                    SELECT id_evento_correlacionado, severidad_global, probabilidad_global, jsonb_array_length(attack_flow) as num_steps
                    FROM eventos_correlacionados
                    WHERE id_dispositivo_origen = $1 AND estado = 'Abierto'
                """, id_dispositivo)
                
                if row:
                    id_evento = str(row['id_evento_correlacionado'])
                    step = AttackFlowStep(
                        step_order=row['num_steps'] + 1,
                        timestamp=str(actual_ts),
                        vector=layer,
                        anomaly_score=prob_fusion,
                        description=desc
                    )
                    
                    nueva_severidad = max(row['severidad_global'], id_severidad)
                    prob_actual = row['probabilidad_global'] if row['probabilidad_global'] is not None else 0.0
                    nueva_prob = 1.0 - ((1.0 - prob_actual) * (1.0 - prob_fusion))
                    
                    await conn.execute("""
                        UPDATE eventos_correlacionados
                        SET fecha_actualizacion = NOW(),
                            severidad_global = $1,
                            probabilidad_global = $2,
                            attack_flow = attack_flow || $3::jsonb
                        WHERE id_evento_correlacionado = $4
                    """, nueva_severidad, nueva_prob, step.model_dump_json(), id_evento)
                    
                    if redis:
                        await redis.setex(redis_key, 14400, id_evento) # Set con TTL 4 horas
                    
                    return id_evento
                else:
                    # Crear nuevo evento correlacionado
                    step = AttackFlowStep(
                        step_order=1,
                        timestamp=str(actual_ts),
                        vector=layer,
                        anomaly_score=prob_fusion,
                        description=desc
                    )
                    
                    nuevo_id = await conn.fetchval("""
                        INSERT INTO eventos_correlacionados 
                        (id_dispositivo_origen, severidad_global, probabilidad_global, attack_flow)
                        VALUES ($1, $2, $3, jsonb_build_array($4::jsonb))
                        RETURNING id_evento_correlacionado
                    """, id_dispositivo, id_severidad, prob_fusion, step.model_dump_json())
                    
                    if redis:
                        await redis.setex(redis_key, 14400, str(nuevo_id)) # Set con TTL 4 horas
                        
                    return str(nuevo_id)
        except Exception as e:
            logger.error(f"[CORRELATION_ERROR] Error al correlacionar evento para disp {id_dispositivo}: {e}")
            return None
