import uuid
import time
import json
import hashlib
from src.infrastructure.database import Database
from src.infrastructure.redis_client import RedisClient
from src.core.logger import logger
from src.core.config import TTL_RED, TTL_EDR, TTL_EMAIL
from src.services.correlation_service import CorrelationService

class IdempotencyConflictError(Exception):
    """Se genera cuando la misma idempotency_key se usa con un payload diferente."""
    pass

class PersistenceError(Exception):
    """Se genera ante un fallo crítico en la base de datos durante la persistencia."""
    pass

class AlertService:
    @staticmethod
    def compute_payload_hash(data: dict) -> str:
        """Calcula el hash SHA-256 canónico del payload omitiendo la llave de idempotencia."""
        clean = {k: v for k, v in data.items() if k != "idempotency_key"}
        raw = json.dumps(clean, sort_keys=True, default=str)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    @staticmethod
    async def get_or_create_device(conn, ip: str):
        """Descubrimiento pasivo de dispositivos asíncrono."""
        # Buscar IP activa
        row = await conn.fetchrow("SELECT id_dispositivo FROM dispositivo_ips WHERE direccion_ip = $1::inet AND activa = TRUE", ip)
        if row: return row['id_dispositivo']
        
        # Generar MAC dummy determinística (Fallback GNS3/Lab)
        import hashlib
        hash_ip = hashlib.md5(ip.encode()).hexdigest()
        mac = f"02:{hash_ip[0:2]}:{hash_ip[2:4]}:{hash_ip[4:6]}:{hash_ip[6:8]}:{hash_ip[8:10]}"
        
        # Insertar dispositivo
        await conn.execute(
            "INSERT INTO dispositivos (mac_address, id_tipo, id_metodo_descubrimiento) VALUES ($1, 1, 2) ON CONFLICT (mac_address) DO NOTHING",
            mac
        )
        dev_id = await conn.fetchval("SELECT id_dispositivo FROM dispositivos WHERE mac_address = $1", mac)
        
        # Asociar IP
        await conn.execute(
            "INSERT INTO dispositivo_ips (id_dispositivo, direccion_ip, activa) VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING",
            dev_id, ip
        )
        return dev_id

    @staticmethod
    async def registrar_flujo_y_alerta_db(log: 'ZeekLog', prob_red: float, prob_fusion: float, accion: str, severidad_nombre: str, mitre_technique_id: str = None, mitre_tactic: str = None, escalar_alerta: bool = False, mitre_software_id: str = None) -> dict:
        pool = Database.get_pool()
        if not pool:
            raise PersistenceError("Pool de base de datos no inicializado")
        
        payload_hash = AlertService.compute_payload_hash(log.model_dump())
        
        try:
            async with pool.acquire() as conn:
                async with conn.transaction():
                    # 1. Comprobar Idempotencia si se proporciona llave
                    if log.idempotency_key:
                        row_idem = await conn.fetchrow(
                            "SELECT payload_hash, response_data FROM registro_idempotencia WHERE idempotency_key = $1",
                            log.idempotency_key
                        )
                        if row_idem:
                            if row_idem['payload_hash'] == payload_hash:
                                resp = row_idem['response_data']
                                if isinstance(resp, str):
                                    resp = json.loads(resp)
                                resp["idempotent_replay"] = True
                                return resp
                            else:
                                raise IdempotencyConflictError(f"Idempotency key '{log.idempotency_key}' ya fue utilizada con un payload incompatible")

                    # 2. Identidad y resolución de dispositivos
                    id_origen = await AlertService.get_or_create_device(conn, log.orig_ip)
                    id_destino = await AlertService.get_or_create_device(conn, log.resp_ip)
                    flujo_id = uuid.uuid4()
                    ts = log.ts if log.ts > 0 else time.time()
                    
                    es_anomalia = prob_fusion >= 0.65
                    tipo_ataque = "MALWARE" if prob_red > 0.8 else "ANOMALIA" if es_anomalia else "NINGUNA"

                    # 3. Insertar Flujo de Red
                    proto_map = {'tcp': 6, 'udp': 17, 'icmp': 1}
                    proto_num = proto_map.get(log.proto.lower(), 0)

                    await conn.execute(
                        """
                        INSERT INTO flujos_trafico (
                            id_flujo, time, zeek_uid, id_origen, id_destino, ip_origen, ip_destino, 
                            puerto_origen, puerto_destino, protocolo_transporte,
                            flow_duration, flow_bytes_s, flow_packets_s, subflow_fwd_bytes,
                            subflow_bwd_bytes, subflow_fwd_packets, act_data_pkt_fwd,
                            fwd_header_length, bwd_header_length, fwd_packet_length_max,
                            bwd_packet_length_max, bwd_packet_length_min, down_up_ratio,
                            average_packet_size, es_anomalia, probabilidad_anomalia
                        ) VALUES ($1, to_timestamp($2), $3, $4, $5, $6, $7, $8, $9, $10, 
                                  $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
                        """,
                        flujo_id, ts, log.uid, id_origen, id_destino, log.orig_ip, log.resp_ip, log.orig_p, log.resp_p, proto_num,
                        log.Flow_Duration, log.Flow_Bytes_s, log.Flow_Packets_s, log.Subflow_Fwd_Bytes,
                        log.Subflow_Bwd_Bytes, log.Subflow_Fwd_Packets, log.act_data_pkt_fwd,
                        log.Fwd_Header_Length, log.Bwd_Header_Length, log.Fwd_Packet_Length_Max,
                        log.Bwd_Packet_Length_Max, log.Bwd_Packet_Length_Min, log.Down_Up_Ratio,
                        log.Average_Packet_Size, es_anomalia, prob_red
                    )

                    # 4. Insertar Alerta si aplica
                    id_evento = None
                    if escalar_alerta:
                        severidad = await conn.fetchval("SELECT id_severidad FROM cat_severidad WHERE nombre = $1", severidad_nombre)
                        id_severidad = severidad if severidad else 2
                        
                        id_evento = await CorrelationService.correlate_and_get_event(
                            conn, id_origen, id_severidad, "Network", f"Anomalía en tráfico hacia {log.resp_ip}", ts, prob_fusion, dest_ip=log.resp_ip,
                            mitre_technique_id=mitre_technique_id, mitre_tactic=mitre_tactic, mitre_software_id=mitre_software_id
                        )
                        
                        await conn.execute(
                            """
                            INSERT INTO alertas_xdr 
                            (time, id_flujo_relacionado, time_flujo_relacionado, id_dispositivo_afectado, 
                             id_severidad, id_estado, tipo_deteccion, tipo_ataque, descripcion, id_evento_correlacionado,
                             mitre_technique_id, mitre_tactic, vector_origen, mitre_software_id)
                            VALUES (to_timestamp($1), $2, to_timestamp($3), $4, $5, 1, 'Machine Learning', $6, $7, $8, $9, $10, 'Red', $11)
                            """,
                            ts, flujo_id, ts, id_origen, id_severidad, tipo_ataque, 
                            f"Anomalía detectada. Prob RED: {prob_red:.4f}. Fusión: {prob_fusion:.4f}. Acción: {accion}",
                            id_evento, mitre_technique_id, mitre_tactic, mitre_software_id
                        )
                        
                    response_payload = {
                        "uid": log.uid,
                        "prob_red_cruda": round(prob_red, 4),
                        "prob_fusion_xdr": round(prob_fusion, 4),
                        "accion": accion,
                        "severidad": severidad_nombre,
                        "id_evento_correlacionado": id_evento,
                        "idempotent_replay": False
                    }
                    
                    if log.idempotency_key:
                        await conn.execute(
                            """
                            INSERT INTO registro_idempotencia (idempotency_key, payload_hash, response_data)
                            VALUES ($1, $2, $3::jsonb)
                            """,
                            log.idempotency_key, payload_hash, json.dumps(response_payload)
                        )
                        
                    return response_payload
        except IdempotencyConflictError:
            raise
        except Exception as e:
            logger.exception("Fallo persistiendo registro de red en base de datos")
            raise PersistenceError(f"Error crítico en base de datos: {e}") from e

    @staticmethod
    async def registrar_evento_y_alerta_edr_db(log: 'SysmonLog', prob_edr: float, prob_fusion: float, cadena_activa: bool, accion: str, severidad_nombre: str, mitre_technique_id: str = None, mitre_tactic: str = None, escalar_alerta: bool = False, mitre_software_id: str = None) -> dict:
        pool = Database.get_pool()
        if not pool:
            raise PersistenceError("Pool de base de datos no inicializado")
            
        payload_hash = AlertService.compute_payload_hash(log.model_dump())
        
        try:
            async with pool.acquire() as conn:
                async with conn.transaction():
                    # 1. Comprobar Idempotencia si se proporciona llave
                    if log.idempotency_key:
                        row_idem = await conn.fetchrow(
                            "SELECT payload_hash, response_data FROM registro_idempotencia WHERE idempotency_key = $1",
                            log.idempotency_key
                        )
                        if row_idem:
                            if row_idem['payload_hash'] == payload_hash:
                                resp = row_idem['response_data']
                                if isinstance(resp, str):
                                    resp = json.loads(resp)
                                resp["idempotent_replay"] = True
                                return resp
                            else:
                                raise IdempotencyConflictError(f"Idempotency key '{log.idempotency_key}' ya fue utilizada con un payload incompatible")

                    # 2. Identidad
                    id_dispositivo = await AlertService.get_or_create_device(conn, log.ip_local)
                    evento_id = uuid.uuid4()
                    ts = time.time()
                    
                    es_anomalia = prob_fusion >= 0.65
                    tipo_ataque = "EDR_DETECTION" if es_anomalia else "NINGUNA"

                    # 3. Insertar Evento de Telemetría
                    await conn.execute(
                        """
                        INSERT INTO eventos_endpoint (
                            time, id_evento, id_dispositivo, event_id, host_name, 
                            proceso, proceso_padre, comando, hashes, 
                            probabilidad_anomalia, es_anomalia, cadena_sospechosa_detectada
                        ) VALUES (to_timestamp($1), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                        """,
                        ts, evento_id, id_dispositivo, log.EventID, log.host,
                        log.proceso, log.proceso_padre, log.cmd, log.hashes,
                        prob_edr, es_anomalia, cadena_activa
                    )

                    # 4. Insertar Alerta si aplica
                    id_evento = None
                    if escalar_alerta:
                        severidad = await conn.fetchval("SELECT id_severidad FROM cat_severidad WHERE nombre = $1", severidad_nombre)
                        id_severidad = severidad if severidad else 2
                        
                        id_evento = await CorrelationService.correlate_and_get_event(
                            conn, id_dispositivo, id_severidad, "Endpoint", f"Ejecución anómala: {log.proceso}", ts, prob_fusion, dest_ip=log.ip_local, file_hash=log.hashes,
                            mitre_technique_id=mitre_technique_id, mitre_tactic=mitre_tactic, mitre_software_id=mitre_software_id
                        )

                        await conn.execute(
                            """
                            INSERT INTO alertas_xdr 
                            (time, id_dispositivo_afectado, id_severidad, id_estado, tipo_deteccion, tipo_ataque, descripcion, id_evento_correlacionado, mitre_technique_id, mitre_tactic, vector_origen, mitre_software_id)
                            VALUES (to_timestamp($1), $2, $3, 1, 'Machine Learning', $4, $5, $6, $7, $8, 'Endpoint', $9)
                            """,
                            ts, id_dispositivo, id_severidad, tipo_ataque, 
                            f"Proceso anómalo: {log.proceso}. CMD: {log.cmd}. Prob EDR: {prob_edr:.4f}. Fusión: {prob_fusion:.4f}. Acción: {accion}",
                            id_evento, mitre_technique_id, mitre_tactic, mitre_software_id
                        )
                        
                    response_payload = {
                        "host": log.host,
                        "proceso": log.proceso,
                        "prob_edr_cruda": round(prob_edr, 4),
                        "prob_fusion_xdr": round(prob_fusion, 4),
                        "cadena_activa": cadena_activa,
                        "accion": accion,
                        "severidad": severidad_nombre,
                        "id_evento_correlacionado": id_evento,
                        "idempotent_replay": False
                    }
                    
                    if log.idempotency_key:
                        await conn.execute(
                            """
                            INSERT INTO registro_idempotencia (idempotency_key, payload_hash, response_data)
                            VALUES ($1, $2, $3::jsonb)
                            """,
                            log.idempotency_key, payload_hash, json.dumps(response_payload)
                        )
                        
                    return response_payload
        except IdempotencyConflictError:
            raise
        except Exception as e:
            logger.exception("Fallo persistiendo evento de endpoint en base de datos")
            raise PersistenceError(f"Error crítico en base de datos: {e}") from e

    @staticmethod
    async def registrar_alerta_db(ip_afectada: str, severidad_nombre: str, tipo_capa: str, accion: str, descripcion: str, mitre_technique_id: str = None, mitre_tactic: str = None, mitre_software_id: str = None, prob_score: float = 0.9):
        pool = Database.get_pool()
        if not pool:
            return
        
        try:
            async with pool.acquire() as conn:
                id_dispositivo = await AlertService.get_or_create_device(conn, ip_afectada)

                severidad = await conn.fetchval("SELECT id_severidad FROM cat_severidad WHERE nombre = $1", severidad_nombre)
                id_severidad = severidad if severidad else 2

                id_evento = await CorrelationService.correlate_and_get_event(
                    conn, id_dispositivo, id_severidad, "Email", descripcion, time.time(), prob_score,
                    mitre_technique_id=mitre_technique_id, mitre_tactic=mitre_tactic, mitre_software_id=mitre_software_id
                )

                await conn.execute("""
                    INSERT INTO alertas_xdr 
                    (time, id_dispositivo_afectado, id_severidad, id_estado, tipo_deteccion, tipo_ataque, descripcion, id_evento_correlacionado, mitre_technique_id, mitre_tactic, vector_origen, mitre_software_id)
                    VALUES (NOW(), $1, $2, 1, 'Machine Learning', $3, $4, $5, $6, $7, 'Email', $8)
                """, id_dispositivo, id_severidad, tipo_capa, f"Acción tomada: {accion} | Detalles: {descripcion}", id_evento, mitre_technique_id, mitre_tactic, mitre_software_id)
                
        except Exception as e:
            logger.exception("Fallo persistiendo alerta XDR de email")

    @staticmethod
    async def registrar_alerta_redis_red(log, prob_red):
        client = RedisClient.get_client()
        if not client: return False
        try:
            pipe = client.pipeline()
            # Guardamos la probabilidad para la IP de ORIGEN (el atacante/host monitoreado)
            pipe.setex(f"red:{log.orig_ip}:prob", TTL_RED, prob_red)
            alerta = json.dumps({"ts": time.time(), "prob": prob_red})
            pipe.lpush(f"alertas_red:{log.orig_ip}", alerta)
            pipe.expire(f"alertas_red:{log.orig_ip}", TTL_RED)
            await pipe.execute()
            return True
        except Exception as e:
            logger.error(f"Fallo persistiendo alerta de red en Redis: {e}")
            return False

    @staticmethod
    async def registrar_alerta_redis_edr(log, prob_edr, accion):
        client = RedisClient.get_client()
        if not client: return
        try:
            await client.setex(f"edr:{log.host}:prob", TTL_EDR, prob_edr)
            if accion != "PERMITIR":
                alerta = json.dumps({"ts": time.time(), "prob": prob_edr, "accion": accion})
                await client.lpush(f"alertas_edr:{log.host}", alerta)
                await client.expire(f"alertas_edr:{log.host}", TTL_EDR)
        except Exception as e:
            logger.error(f"Fallo persistiendo alerta en Redis: {e}")

    @staticmethod
    async def registrar_alerta_redis_email(log, prob_phish, prob_spam, accion):
        client = RedisClient.get_client()
        if not client: return
        try:
            await client.setex(f"email:{log.host}:prob", TTL_EMAIL, prob_phish)
            if accion != "PERMITIR":
                alerta = json.dumps({"ts": time.time(), "phish": prob_phish, "spam": prob_spam, "accion": accion})
                await client.lpush(f"alertas_email:{log.host}", alerta)
                await client.expire(f"alertas_email:{log.host}", TTL_EMAIL)
        except Exception as e:
            logger.error(f"Fallo persistiendo alerta en Redis: {e}")

    @staticmethod
    async def actualizar_historial_edr(log, config_edr):
        client = RedisClient.get_client()
        proc_nombre = log.proceso.split('\\')[-1].lower() if log.proceso else ''
        hist_key = f"hist:{log.host}"

        if not client:
            return [{"cmd": proc_nombre}]

        try:
            nuevo_evento = json.dumps({"cmd": proc_nombre})
            pipe = client.pipeline()
            pipe.lpush(hist_key, nuevo_evento)
            pipe.ltrim(hist_key, 0, config_edr.get('ventana_historial', 10) - 1)
            pipe.expire(hist_key, TTL_EDR)
            pipe.setex(f"ip_host:{log.ip_local}", TTL_EDR, log.host)
            await pipe.execute()
            raw_hist = await client.lrange(hist_key, 0, -1)
            return [json.loads(x) for x in raw_hist][::-1]
        except Exception as e:
            logger.error(f"Fallo actualizando historial EDR en Redis: {e}")
            return [{"cmd": proc_nombre}]
