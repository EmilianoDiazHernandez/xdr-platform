import uuid
import time
import json
from src.infrastructure.database import Database
from src.infrastructure.redis_client import RedisClient
from src.core.logger import logger
from src.core.config import TTL_RED, TTL_EDR, TTL_EMAIL

class AlertService:
    @staticmethod
    async def registrar_alerta_db(ip_afectada: str, severidad_nombre: str, tipo_capa: str, accion: str, descripcion: str):
        pool = Database.get_pool()
        if not pool:
            return
        
        try:
            async with pool.acquire() as conn:
                dispositivo = await conn.fetchrow("""
                    SELECT d.id_dispositivo 
                    FROM dispositivos d
                    JOIN dispositivo_ips di ON d.id_dispositivo = di.id_dispositivo
                    WHERE di.direccion_ip = $1::inet AND di.activa = TRUE
                    LIMIT 1
                """, ip_afectada)
                
                id_dispositivo = dispositivo['id_dispositivo'] if dispositivo else uuid.UUID('00000000-0000-0000-0000-000000000000')

                severidad = await conn.fetchval("SELECT id_severidad FROM cat_severidad WHERE nombre = $1", severidad_nombre)
                id_severidad = severidad if severidad else 2

                await conn.execute("""
                    INSERT INTO alertas_xdr 
                    (time, id_dispositivo_afectado, id_severidad, id_estado, tipo_deteccion, tipo_ataque, descripcion)
                    VALUES (NOW(), $1, $2, 1, 'Machine Learning', $3, $4)
                """, id_dispositivo, id_severidad, tipo_capa, f"Acción tomada: {accion} | Detalles: {descripcion}")
                
        except Exception as e:
            logger.error(f"[DB_ERROR] Fallo al guardar alerta en DB: {e}")

    @staticmethod
    async def registrar_alerta_redis_red(log, prob_red):
        client = RedisClient.get_client()
        if not client: return False
        try:
            pipe = client.pipeline()
            pipe.setex(f"red:{log.resp_ip}:prob", TTL_RED, prob_red)
            alerta = json.dumps({"ts": time.time(), "prob": prob_red})
            pipe.lpush(f"alertas_red:{log.resp_ip}", alerta)
            pipe.expire(f"alertas_red:{log.resp_ip}", TTL_RED)
            await pipe.execute()
            return True
        except Exception:
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
        except Exception:
            pass

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
        except Exception:
            pass

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
        except Exception:
            return [{"cmd": proc_nombre}]
