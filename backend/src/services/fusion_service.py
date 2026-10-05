from src.infrastructure.redis_client import RedisClient
from src.ml_engine.model_loader import ModelLoader
from src.services.alert_service import AlertService

class FusionService:
    PESO_EDR = 0.45
    PESO_RED = 0.55

    @staticmethod
    async def evaluar_heuristica_red(log):
        client = RedisClient.get_client()
        es_ataque_volumetrico = log.orig_pkts > 10000 and log.conn_state in ['S0', 'REJ']
        es_escaneo = False

        if client:
            try:
                llave_scan = f"scan:{log.orig_ip}"
                await client.sadd(llave_scan, log.id_resp_p)
                await client.expire(llave_scan, 10)
                
                puertos_tocados = await client.scard(llave_scan)
                if puertos_tocados >= 5:
                    es_escaneo = True
                
                llave_rate = f"rate_tcp:{log.orig_ip}"
                intentos = await client.incr(llave_rate)
                
                if intentos == 1:
                    await client.expire(llave_rate, 2)
                
                if intentos > 50:
                    es_ataque_volumetrico = True
            except Exception:
                pass
        
        return es_ataque_volumetrico, es_escaneo

    @staticmethod
    async def calcular_fusion_red(log, prob_red):
        client = RedisClient.get_client()
        prob_edr = 0.0
        
        if client:
            try:
                host_asociado = await client.get(f"ip_host:{log.resp_ip}")
                if host_asociado:
                    val_edr = await client.get(f"edr:{host_asociado}:prob")
                    if val_edr:
                        prob_edr = float(val_edr)
            except Exception:
                pass

        red_ponderada = prob_red * FusionService.PESO_RED
        edr_ponderada = prob_edr * FusionService.PESO_EDR
        prob_fusion = red_ponderada + edr_ponderada
        
        config_red = ModelLoader.get('red')['config']
        alerta_cruzada = prob_fusion >= 0.65
        umbral_red = config_red.get('umbral', 0.480) 
        
        if alerta_cruzada:
            accion = "BLOQUEAR_IP_Y_HOST"
            severidad = "Alta"
        elif prob_red >= umbral_red:
            accion = "ALERTA"
            severidad = "Media"
        else:
            accion = "PERMITIR"
            severidad = "Baja"

        return prob_fusion, accion, severidad

    @staticmethod
    async def calcular_fusion_edr(log, prob_edr, cadena_activa):
        client = RedisClient.get_client()
        prob_red = 0.0
        
        if client:
            try:
                val_red = await client.get(f"red:{log.ip_local}:prob")
                if val_red:
                    prob_red = float(val_red)
            except Exception:
                pass

        if prob_red == 0.0:
            prob_fusion = (prob_edr * 0.75) + (0.05 * 0.25)
        else:
            red_ponderada = prob_red * FusionService.PESO_RED
            edr_ponderada = prob_edr * FusionService.PESO_EDR
            prob_fusion = red_ponderada + edr_ponderada
        
        if cadena_activa:
            prob_fusion = min(1.0, prob_fusion + 0.25) 

        config_edr = ModelLoader.get('edr')['config']
        opt_thr = config_edr.get('umbral', 0.55)
        
        if cadena_activa or prob_fusion >= 0.85 or prob_edr >= 0.95:
            accion = "AISLAMIENTO_TOTAL_DEL_HOST"
            severidad = "Alta"
        elif prob_fusion >= opt_thr or prob_edr >= 0.80:
            accion = "BLOQUEAR_PROCESO"
            severidad = "Media"
        elif prob_fusion >= 0.65 or prob_edr >= 0.70:
            accion = "ALERTA"
            severidad = "Baja"
        else:
            accion = "PERMITIR"
            severidad = "Baja"

        return prob_fusion, accion, severidad

    @staticmethod
    def evaluar_accion_email(prob_phish, prob_spam):
        config_email = ModelLoader.get('email')['config']
        umbrales = config_email.get('umbrales', {})
        
        accion = "PERMITIR"
        severidad = "Baja"
        
        if prob_phish >= umbrales.get('phishing_aislamiento', 0.85):
            accion = "AISLAMIENTO_Y_CUARENTENA_BUZON"
            severidad = "Alta"
        elif prob_phish >= umbrales.get('phishing_bloqueo', 0.70):
            accion = "ELIMINAR_CORREO_PHISHING"
            severidad = "Media"
        elif prob_spam >= umbrales.get('spam_bloqueo', 0.80):
            accion = "MOVER_A_SPAM"
            severidad = "Baja"
            
        return accion, severidad
