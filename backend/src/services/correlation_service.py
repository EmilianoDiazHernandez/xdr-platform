import uuid
import json
from datetime import datetime, timezone
from src.core.logger import logger
from src.infrastructure.redis_client import RedisClient
from src.models.schemas import AttackFlowStep

class CorrelationService:
    @staticmethod
    async def correlate_and_get_event(
        conn, 
        id_dispositivo: str, 
        id_severidad: int, 
        layer: str, 
        desc: str, 
        ts_event=None, 
        prob_fusion: float = 0.0, 
        dest_ip: str = None, 
        file_hash: str = None,
        mitre_technique_id: str = None,
        mitre_tactic: str = None,
        mitre_software_id: str = None
    ) -> str:
        """
        Encuentra o crea un evento correlacionado contextualmente para un dispositivo.
        PostgreSQL es la fuente autoritativa. Redis actúa como caché de contexto activo.
        Permite múltiples incidentes abiertos por dispositivo cuando los vectores o destinos son distintos.
        """
        redis = RedisClient.get_client()
        actual_ts = ts_event if ts_event else datetime.now(timezone.utc).isoformat()
        
        id_evento = None
        
        # 1. Búsqueda contextual en Redis (Caché L1)
        if redis:
            try:
                if layer == "Network":
                    if dest_ip:
                        id_evento = await redis.get(f"corr_incident:{id_dispositivo}:{dest_ip}")
                    if not id_evento:
                        id_evento = await redis.get(f"corr_incident:{id_dispositivo}")
                elif layer == "Endpoint":
                    id_evento = await redis.get(f"corr_incident_ep:{id_dispositivo}")
                    if not id_evento and dest_ip:
                        id_evento = await redis.get(f"corr_inbound:{dest_ip}")
                    if not id_evento and file_hash:
                        id_evento = await redis.get(f"corr_incident_hash:{id_dispositivo}:{file_hash}")
                elif layer == "Email":
                    id_evento = await redis.get(f"corr_incident_email:{id_dispositivo}")
                    if not id_evento:
                        id_evento = await redis.get(f"corr_incident:{id_dispositivo}")
            except Exception as e:
                logger.warning(f"[CORRELATION] Error consultando Redis, recurriendo a PostgreSQL: {e}")
                id_evento = None
        
        # 2. Si hay candidato en Redis, verificar en PostgreSQL que siga Abierto
        row = None
        if id_evento:
            row = await conn.fetchrow("""
                SELECT id_evento_correlacionado, severidad_global, jsonb_array_length(attack_flow) as num_steps
                FROM eventos_correlacionados
                WHERE id_evento_correlacionado = $1 AND estado = 'Abierto'
            """, id_evento)
            if not row:
                id_evento = None
        
        # 3. Fallback en PostgreSQL si no hubo hit en Redis o el candidato estaba cerrado
        if not id_evento:
            if layer == "Network" and dest_ip:
                # Buscar incidente abierto para este dispositivo que ya esté interactuando con este destino
                row = await conn.fetchrow("""
                    SELECT id_evento_correlacionado, severidad_global, jsonb_array_length(attack_flow) as num_steps
                    FROM eventos_correlacionados
                    WHERE id_dispositivo_origen = $1 
                      AND estado = 'Abierto'
                      AND fecha_actualizacion >= NOW() - INTERVAL '4 hours'
                      AND attack_flow @> $2::jsonb
                    ORDER BY fecha_actualizacion DESC
                    LIMIT 1
                """, id_dispositivo, json.dumps([{"dest_ip": dest_ip}]))
            elif layer == "Endpoint":
                # Buscar incidente endpoint activo para este host o compromiso inbound lateral
                query_conds = ["(id_dispositivo_origen = $1)"]
                args = [id_dispositivo]
                
                if dest_ip:
                    args.append(json.dumps([{"dest_ip": dest_ip}]))
                    query_conds.append(f"attack_flow @> ${len(args)}::jsonb")
                if file_hash:
                    args.append(json.dumps([{"file_hash": file_hash}]))
                    query_conds.append(f"attack_flow @> ${len(args)}::jsonb")
                    
                where_clause = " OR ".join(query_conds)
                row = await conn.fetchrow(f"""
                    SELECT id_evento_correlacionado, severidad_global, jsonb_array_length(attack_flow) as num_steps
                    FROM eventos_correlacionados
                    WHERE ({where_clause})
                      AND estado = 'Abierto'
                      AND fecha_actualizacion >= NOW() - INTERVAL '4 hours'
                    ORDER BY fecha_actualizacion DESC
                    LIMIT 1
                """, *args)
            elif layer == "Email":
                # Buscar incidente abierto para este dispositivo afectado por correo anómalo
                row = await conn.fetchrow("""
                    SELECT id_evento_correlacionado, severidad_global, jsonb_array_length(attack_flow) as num_steps
                    FROM eventos_correlacionados
                    WHERE id_dispositivo_origen = $1
                      AND estado = 'Abierto'
                      AND fecha_actualizacion >= NOW() - INTERVAL '4 hours'
                    ORDER BY fecha_actualizacion DESC
                    LIMIT 1
                """, id_dispositivo)
            else:
                row = None
        
        # 4. Actualización en PostgreSQL si existe incidente compatible, o Creación si es nuevo
        if row:
            final_id = str(row['id_evento_correlacionado'])
            step = AttackFlowStep(
                step_order=row['num_steps'] + 1,
                timestamp=str(actual_ts),
                vector=layer,
                anomaly_score=prob_fusion,
                description=desc,
                dest_ip=dest_ip,
                file_hash=file_hash,
                mitre_technique_id=mitre_technique_id,
                mitre_tactic=mitre_tactic,
                mitre_software_id=mitre_software_id
            )
            nueva_severidad = max(row['severidad_global'], id_severidad)
            
            await conn.execute("""
                UPDATE eventos_correlacionados
                SET fecha_actualizacion = NOW(),
                    severidad_global = $1,
                    probabilidad_global = 1.0 - ((1.0 - COALESCE(probabilidad_global, 0.0)) * (1.0 - $2::float)),
                    attack_flow = attack_flow || $3::jsonb
                WHERE id_evento_correlacionado = $4
            """, nueva_severidad, prob_fusion, step.model_dump_json(), final_id)
        else:
            # Crear NUEVO incidente abierto independiente (no forzar fusiones arbitrarias)
            step = AttackFlowStep(
                step_order=1,
                timestamp=str(actual_ts),
                vector=layer,
                anomaly_score=prob_fusion,
                description=desc,
                dest_ip=dest_ip,
                file_hash=file_hash,
                mitre_technique_id=mitre_technique_id,
                mitre_tactic=mitre_tactic,
                mitre_software_id=mitre_software_id
            )
            nuevo_uuid = await conn.fetchval("""
                INSERT INTO eventos_correlacionados 
                (id_dispositivo_origen, severidad_global, probabilidad_global, attack_flow)
                VALUES ($1, $2, $3, jsonb_build_array($4::jsonb))
                RETURNING id_evento_correlacionado
            """, id_dispositivo, id_severidad, prob_fusion, step.model_dump_json())
            final_id = str(nuevo_uuid)

        # 5. Actualizar claves de contexto en Redis únicamente tras confirmar en PostgreSQL
        if redis:
            try:
                pipe = redis.pipeline()
                if layer == "Network":
                    if dest_ip:
                        pipe.setex(f"corr_incident:{id_dispositivo}:{dest_ip}", 14400, final_id)
                        pipe.setex(f"corr_inbound:{dest_ip}", 14400, final_id)
                    else:
                        pipe.setex(f"corr_incident:{id_dispositivo}", 14400, final_id)
                elif layer == "Endpoint":
                    pipe.setex(f"corr_incident_ep:{id_dispositivo}", 14400, final_id)
                    if dest_ip:
                        pipe.setex(f"corr_incident:{id_dispositivo}:{dest_ip}", 14400, final_id)
                    if file_hash:
                        pipe.setex(f"corr_incident_hash:{id_dispositivo}:{file_hash}", 14400, final_id)
                elif layer == "Email":
                    pipe.setex(f"corr_incident_email:{id_dispositivo}", 14400, final_id)
                    pipe.setex(f"corr_incident:{id_dispositivo}", 14400, final_id)
                await pipe.execute()
            except Exception as e:
                logger.warning(f"[CORRELATION] Error actualizando contexto en Redis: {e}")
                
        return final_id
