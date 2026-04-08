from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from contextlib import asynccontextmanager
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from scipy.sparse import hstack, csr_matrix
import redis.asyncio as redis
import pandas as pd
import joblib
import numpy as np
import time
import re
import asyncio
import json
import logging
import math
import string
from collections import Counter
import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="sklearn")

# ==========================================
# 1. LOGGING Y RATE LIMITING
# ==========================================
logging.basicConfig(level=logging.INFO, format='%(asctime)s | %(levelname)-8s | %(message)s')
logger = logging.getLogger("XDR_CORE")

def identificar_sensor(request: Request) -> str:
    return request.headers.get("X-Sensor-ID", get_remote_address(request))

limiter = Limiter(key_func=identificar_sensor)

# ==========================================
# 2. PRE-COMPILACIÓN DE REGEX
# ==========================================
REGEX = {
    'encoded':  re.compile(r'encodedcommand|enc |/enc', re.IGNORECASE),
    'bypass':   re.compile(r'bypass|executionpolicy', re.IGNORECASE),
    'hidden':   re.compile(r'hidden|windowstyle h', re.IGNORECASE),
    'iex':      re.compile(r'iex|invoke-expression|invoke-webrequest', re.IGNORECASE),
    'download': re.compile(r'downloadstring|downloadfile|webclient', re.IGNORECASE),
    'vssadmin': re.compile(r'vssadmin|shadow', re.IGNORECASE),
    'base64':   re.compile(r'[a-zA-Z0-9+/]{20,}={0,2}'),
    'temp':     re.compile(r'temp|appdata|public', re.IGNORECASE),
    'ofimatica':re.compile(r'winword|excel|outlook|powerpnt', re.IGNORECASE),
    'navegador':re.compile(r'chrome|firefox|msedge|iexplore', re.IGNORECASE)
}

def calcular_entropia(texto):
    if not texto: return 0.0
    probabilidades = [c / len(texto) for c in Counter(texto).values()]
    return -sum(p * math.log2(p) for p in probabilidades)

def ratio_especiales(texto):
    if not texto: return 0.0
    especiales = sum(1 for c in str(texto) if c in string.punctuation)
    return especiales / len(str(texto))

# ==========================================
# ESTADO GLOBAL ML Y REDIS
# ==========================================
rf_modelo = None; rf_scaler = None; rf_encoder = None; config_red = None; rf_clipping = {}
features_num_red = []; features_cat_red = []; features_bin_red = []
edr_modelo = None; config_edr = None; edr_vectorizador = None; edr_cadenas = []
email_modelo = None; config_email = None; email_vectorizador = None; email_scaler = None; email_intel = set()
columnas_estructuradas = []
columnas_email = []
redis_client = None

TTL_RED = 300
TTL_EDR = 1800
TTL_EMAIL = 3600

# ==========================================
# LIFESPAN
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client
    global config_red, rf_modelo, rf_scaler, rf_encoder, features_num_red, features_cat_red, features_bin_red, rf_clipping
    global edr_modelo, config_edr, edr_vectorizador, edr_cadenas, columnas_estructuradas
    global email_modelo, config_email, email_vectorizador, email_scaler, email_intel, columnas_email

    logger.info("="*40 + " BOOTSTRAP XDR " + "="*40)

    # Redis
    try:
        redis_client = await redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
        await redis_client.ping()
        logger.info("[OK] Redis conectado exitosamente.")
    except Exception as e:
        logger.error(f"[!] Falla crítica Redis: {e}")

    # Capa RED
    try:
        ruta_red = r'C:\Users\spide\OneDrive\Documentos\IPN\TT\EMPAQUETADOS\CAPA_RED'
        config_red = joblib.load(f'{ruta_red}/xdr_red_config.pkl')
        rf_modelo = joblib.load(f'{ruta_red}/xdr_red_model.pkl')
        rf_scaler = joblib.load(f'{ruta_red}/xdr_red_scaler.pkl')
        rf_encoder = joblib.load(f'{ruta_red}/xdr_red_encoder.pkl')
        features_num_red = config_red.get('features_num', [])
        features_cat_red = config_red.get('features_cat', [])
        features_bin_red = config_red.get('features_bin', [])
        rf_clipping = config_red.get('clipping_limits', {})
        logger.info("[OK] Capa RED cargada (Zeek Nativo).")
    except Exception as e:
        logger.error(f"Falla Capa RED: {e}")

    # Capa ENDPOINT
    try:
        ruta_edr = r'C:\Users\spide\OneDrive\Documentos\IPN\TT\EMPAQUETADOS\CAPA_ENDPOINT'
        config_edr = joblib.load(f'{ruta_edr}/xdr_endpoint_config.pkl')
        edr_modelo = joblib.load(f'{ruta_edr}/xdr_endpoint_model.pkl')
        edr_vectorizador = joblib.load(f'{ruta_edr}/xdr_endpoint_vectorizer.pkl')
        edr_cadenas = joblib.load(f'{ruta_edr}/xdr_endpoint_cadenas.pkl')
        config_edr['cadenas_sospechosas'] = edr_cadenas
        columnas_completas = config_edr.get('columnas_x', [])
        vocabulario_nlp = list(edr_vectorizador.get_feature_names_out())
        columnas_estructuradas = [c for c in columnas_completas if c not in vocabulario_nlp]
        logger.info("[OK] Capa ENDPOINT cargada.")
    except Exception as e:
        logger.error(f"Falla Capa ENDPOINT: {e}")

    # Capa EMAIL (corregida con más logs)
    try:
        ruta_email = r'C:\Users\spide\OneDrive\Documentos\IPN\TT\EMPAQUETADOS\CAPA_EMAIL'
        config_email = joblib.load(f'{ruta_email}/xdr_email_config.pkl')
        email_modelo = joblib.load(f'{ruta_email}/xdr_email_model.pkl')
        email_vectorizador = joblib.load(f'{ruta_email}/xdr_email_vectorizer.pkl')
        email_scaler = joblib.load(f'{ruta_email}/xdr_email_scaler.pkl')
        email_intel = joblib.load(f'{ruta_email}/xdr_email_intel.pkl')
        columnas_email = config_email.get('columnas_estructuradas', [])
        logger.info(f"[OK] Capa EMAIL cargada. Columnas estructuradas: {len(columnas_email)}")
        logger.info(f"  - OSINT: {len(email_intel)} URLs en lista negra")
    except Exception as e:
        logger.error(f"Falla Capa EMAIL: {e}")

    yield
    if redis_client:
        await redis_client.close()
    logger.info("Apagando XDR Platform...")

app = FastAPI(title="XDR Platform", version="9.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ==========================================
# MODELOS PYDANTIC
# ==========================================
class ZeekLog(BaseModel):
    orig_ip: str
    duration: float = 0.0
    orig_bytes: float = 0.0
    resp_bytes: float = 0.0
    missed_bytes: float = 0.0
    orig_pkts: float = 0.0
    orig_ip_bytes: float = 0.0
    resp_pkts: float = 0.0
    resp_ip_bytes: float = 0.0
    proto: str = "-"
    conn_state: str = "-"
    service: str = "-"
    local_orig: str = "F"
    local_resp: str = "F"
    history: str = "-"
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

class SysmonLog(BaseModel):
    host: str; ip_local: str; EventID: int
    proceso: str; proceso_padre: str; cmd: str
    hashes: str = ""

class EmailLog(BaseModel):
    host: str; ip_local: str; texto_completo: str
    urls_extraidas: list[str] = []
    num_adjuntos: int = 0; tiene_adjunto_sospechoso: int = 0; zip_con_exe: int = 0
    num_links: int = 0; num_dominios_unicos: int = 0; dominio_raro: int = 0
    tiene_url_sospechosa: int = 0; url_con_ip: int = 0; mismatch_link: int = 0
    tiene_url_acortada: int = 0; tiene_html: int = 0; html_oculto: int = 0
    tiene_iframe: int = 0; tiene_script: int = 0; score_phishing_keywords: int = 0
    reply_to_diferente: int = 0; display_name_spoofing: int = 0
    spf_fail: int = 0; dkim_fail: int = 0; entropia_texto: float = 0.0
    score_heuristico: int = 0; url_larga: int = 0; subdominios_altos: int = 0

# ==========================================
# ENDPOINT RED
# ==========================================
@app.post("/api/v1/analyze-network")
@limiter.limit("500/minute")
async def analizar_trafico(request: Request, log: ZeekLog):
    if rf_modelo is None:
        raise HTTPException(status_code=500, detail="Modelo RED no cargado.")

    try:
        hist = log.history.lower() if log.history else ""
        hist_S = 1 if 's' in hist else 0
        hist_R = 1 if 'r' in hist else 0
        hist_A = 1 if 'a' in hist else 0
        hist_F = 1 if 'f' in hist else 0

        loc_orig = 1 if log.local_orig.upper() == 'T' else 0
        loc_resp = 1 if log.local_resp.upper() == 'T' else 0
        bin_data = np.array([[loc_orig, loc_resp, hist_S, hist_R, hist_A, hist_F]], dtype=np.float64)

        num_dict = log.model_dump(include=set(features_num_red))
        df_num = pd.DataFrame([num_dict])[features_num_red]
        for col in features_num_red:
            if col in rf_clipping:
                lims = rf_clipping[col]
                df_num[col] = df_num[col].clip(lower=lims['lower'], upper=lims['upper'])
            df_num[col] = np.log1p(df_num[col].clip(lower=0))
        X_num_scaled = rf_scaler.transform(df_num)

        cat_dict = log.model_dump(include=set(features_cat_red))
        for k, v in cat_dict.items():
            cat_dict[k] = str(v).strip().lower()
        df_cat = pd.DataFrame([cat_dict])[features_cat_red]
        X_cat_encoded = rf_encoder.transform(df_cat)

        X_final = np.hstack((X_num_scaled, X_cat_encoded, bin_data))
        probs = await asyncio.to_thread(rf_modelo.predict_proba, X_final)
        prob_red = float(probs[0][1])
    except Exception as e:
        logger.error(f"Error inferencia RED: {e}")
        raise HTTPException(status_code=500, detail=f"inference_failed: {e}")

    prob_edr = 0.0
    host_asociado = "sin_contexto"
    redis_ok = redis_client is not None

    if redis_ok:
        try:
            pipe = redis_client.pipeline()
            pipe.setex(f"red:{log.orig_ip}:prob", TTL_RED, prob_red)
            alerta = json.dumps({"ts": time.time(), "prob": prob_red})
            pipe.lpush(f"alertas_red:{log.orig_ip}", alerta)
            pipe.expire(f"alertas_red:{log.orig_ip}", TTL_RED)
            await pipe.execute()
            host_asociado = await redis_client.get(f"ip_host:{log.orig_ip}")
            if host_asociado:
                val_edr = await redis_client.get(f"edr:{host_asociado}:prob")
                if val_edr:
                    prob_edr = float(val_edr)
        except Exception:
            redis_ok = False

    PESO_EDR = 1.0
    PESO_RED = 1.0
    red_ponderada = prob_red * PESO_RED
    edr_ponderada = prob_edr * PESO_EDR
    prob_fusion = 1 - ((1 - red_ponderada) * (1 - edr_ponderada))
    alerta_cruzada = prob_fusion >= 0.70
    umbral_red = config_red.get('umbral', 0.55)
    accion = "BLOQUEAR_IP_Y_HOST" if alerta_cruzada else "ALERTA" if prob_red >= umbral_red else "PERMITIR"

    return {
        "origen": "CAPA_RED",
        "prob_red_cruda": round(prob_red, 4),
        "prob_fusion_xdr": round(prob_fusion, 4),
        "redis_activo": redis_ok,
        "accion": accion,
    }

# ==========================================
# ENDPOINT ENDPOINT (EDR)
# ==========================================
def extraer_features_edr(log: SysmonLog, historial_tuplas: list):
    log_cmd_lower = log.cmd.lower() if log.cmd else ''
    proc_lower = log.proceso.lower() if log.proceso else ''
    padre_lower = log.proceso_padre.lower() if log.proceso_padre else ''

    proc_nombre = proc_lower.split('\\')[-1]
    historial_cmds = [h['cmd'] for h in historial_tuplas]

    n_cadenas = 0
    cadena_str = ''
    for cadena in config_edr.get('cadenas_sospechosas', []):
        for i in range(len(historial_cmds) - len(cadena) + 1):
            if all(c in s for c, s in zip(cadena, historial_cmds[i:i+len(cadena)])):
                n_cadenas += 1
                cadena_str = '→'.join(cadena)
                break

    es_pwsh = int('powershell' in proc_lower)
    t_enc = int(bool(REGEX['encoded'].search(log_cmd_lower)))

    # Mapeo de cadenas
    cadena_map = {'→'.join(cad): i+1 for i, cad in enumerate(config_edr.get('cadenas_sospechosas', []))}
    cadena_tipo_id = cadena_map.get(cadena_str, 0)

    feats_dict = {
        'len_cmd': len(log.cmd) if log.cmd else 0,
        'len_proceso': len(log.proceso) if log.proceso else 0,
        'n_espacios_cmd': log_cmd_lower.count(' '),
        'n_barras_cmd': log_cmd_lower.count('\\'),
        'tiene_encoded': t_enc,
        'tiene_bypass': int(bool(REGEX['bypass'].search(log_cmd_lower))),
        'tiene_hidden': int(bool(REGEX['hidden'].search(log_cmd_lower))),
        'tiene_iex': int(bool(REGEX['iex'].search(log_cmd_lower))),
        'tiene_download': int(bool(REGEX['download'].search(log_cmd_lower))),
        'tiene_vssadmin': int(bool(REGEX['vssadmin'].search(log_cmd_lower))),
        'tiene_base64': int(bool(REGEX['base64'].search(log.cmd if log.cmd else ''))),
        'es_powershell': es_pwsh,
        'es_rundll32': int('rundll32' in proc_lower),
        'es_wscript': int('wscript' in proc_lower or 'cscript' in proc_lower),
        'es_mshta': int('mshta' in proc_lower),
        'ruta_temp': int(bool(REGEX['temp'].search(proc_lower))),
        'EventID': log.EventID,
        'ratio_cmd_proceso': (len(log.cmd) if log.cmd else 0) / ((len(log.proceso) if log.proceso else 0) + 1),
        'ps_encoded_combo': es_pwsh * t_enc,
        'entropia_cmd': calcular_entropia(log.cmd),
        'ratio_especiales': ratio_especiales(log.cmd),
        'ratio_mayusculas': sum(1 for c in str(log.cmd) if c.isupper()) / (len(str(log.cmd)) + 1e-9) if log.cmd else 0.0,
        'n_cadenas_activas': n_cadenas,
        'profundidad_hist': len(historial_cmds),
        'padre_es_ofimática': int(bool(REGEX['ofimatica'].search(padre_lower))),
        'padre_es_navegador': int(bool(REGEX['navegador'].search(padre_lower))),
        'proc_en_historial': int(proc_nombre in historial_cmds[:-1] if len(historial_cmds) > 0 else 0),
        'cadena_known': int(cadena_str != ''),
        'cadena_tipo_id': cadena_tipo_id
    }

    df_estructurado = pd.DataFrame([feats_dict])
    for col in columnas_estructuradas:
        if col not in df_estructurado.columns:
            df_estructurado[col] = 0
    return df_estructurado[columnas_estructuradas].values, bool(cadena_str)

@app.post("/api/v1/analyze-endpoint")
@limiter.limit("500/minute")
async def analizar_proceso(request: Request, log: SysmonLog):
    if edr_modelo is None or redis_client is None:
        raise HTTPException(status_code=500, detail="Modelo o DB offline")

    proc_nombre = log.proceso.split('\\')[-1].lower() if log.proceso else ''
    hist_key = f"hist:{log.host}"

    try:
        nuevo_evento = json.dumps({"cmd": proc_nombre})
        pipe = redis_client.pipeline()
        pipe.lpush(hist_key, nuevo_evento)
        pipe.ltrim(hist_key, 0, config_edr.get('ventana_historial', 10) - 1)
        pipe.expire(hist_key, TTL_EDR)
        pipe.setex(f"ip_host:{log.ip_local}", TTL_EDR, log.host)
        await pipe.execute()
        raw_hist = await redis_client.lrange(hist_key, 0, -1)
        historial_actual = [json.loads(x) for x in raw_hist][::-1]
    except Exception:
        historial_actual = [{"cmd": proc_nombre}]

    try:
        X_estructuradas, cadena_activa = extraer_features_edr(log, historial_actual)
        texto_nlp = f"{log.cmd or ''} {log.proceso or ''} {log.proceso_padre or ''}"

        def inferencia_cpu():
            X_tfidf = edr_vectorizador.transform([texto_nlp])
            X_final = hstack([X_tfidf, csr_matrix(X_estructuradas, dtype=np.float64)])
            return float(edr_modelo.predict_proba(X_final)[0][1])

        prob_edr = await asyncio.to_thread(inferencia_cpu)
    except Exception as e:
        logger.error(f"Error inferencia EDR: {e}")
        return {"error": "inference_failed"}

    prob_red = 0.0
    try:
        await redis_client.setex(f"edr:{log.host}:prob", TTL_EDR, prob_edr)
        val_red = await redis_client.get(f"red:{log.ip_local}:prob")
        if val_red:
            prob_red = float(val_red)
    except Exception:
        pass

    PESO_EDR = 1.0
    PESO_RED = 1.0
    red_ponderada = prob_red * PESO_RED
    edr_ponderada = prob_edr * PESO_EDR
    prob_fusion = 1 - ((1 - red_ponderada) * (1 - edr_ponderada))
    if cadena_activa:
        prob_fusion = min(1.0, prob_fusion + 0.25)

    opt_thr = config_edr.get('umbral', 0.5)
    if cadena_activa or prob_fusion >= 0.80:
        accion = "AISLAMIENTO_TOTAL_DEL_HOST"
    elif prob_edr >= opt_thr:
        accion = "BLOQUEAR_PROCESO"
    else:
        accion = "PERMITIR"

    if redis_client and accion != "PERMITIR":
        try:
            alerta = json.dumps({"ts": time.time(), "prob": prob_edr, "accion": accion})
            await redis_client.lpush(f"alertas_edr:{log.host}", alerta)
            await redis_client.expire(f"alertas_edr:{log.host}", TTL_EDR)
        except Exception:
            pass

    return {
        "origen": "CAPA_ENDPOINT",
        "prob_edr_cruda": round(prob_edr, 4),
        "prob_fusion_xdr": round(prob_fusion, 4),
        "cadena_activa": cadena_activa,
        "accion": accion
    }

# ==========================================
# ENDPOINT EMAIL (INDEPENDIENTE)
# ==========================================

@app.post("/api/v1/analyze-email")
@limiter.limit("200/minute")
async def analizar_email(request: Request, log: EmailLog):
    if email_modelo is None:
        raise HTTPException(status_code=500, detail="Modelo EMAIL no cargado.")

    # OSINT
    urls_norm = [re.sub(r'^https?://', '', u.lower().strip()).rstrip('/') for u in log.urls_extraidas]
    num_maliciosas = sum(1 for u in urls_norm if u in email_intel)

    # Construir features estructuradas
    feat_dict = log.model_dump(exclude={'host', 'ip_local', 'texto_completo', 'urls_extraidas'})
    feat_dict['num_urls_maliciosas'] = num_maliciosas
    feat_dict['en_lista_negra'] = 1 if num_maliciosas > 0 else 0

    df_struct = pd.DataFrame([feat_dict])
    for col in columnas_email:
        if col not in df_struct.columns:
            df_struct[col] = 0
    X_struct = df_struct[columnas_email].values.astype(np.float64)

    try:
        # 🔥 FIX: Misma limpieza anti-fuga que en el entrenamiento
        def limpiar_fuga_datos(texto):
            t = str(texto).lower()
            t = re.sub(r'x-[a-z\-]+:.*', '', t)
            t = re.sub(r'forwarded by.*', '', t)
            t = re.sub(r'enron', 'empresa', t)
            t = re.sub(r'houston', 'ciudad', t)
            return t
            
        texto_limpio = limpiar_fuga_datos(log.texto_completo)

        def inferencia_email():
            X_struct_scaled = email_scaler.transform(X_struct)
            X_tfidf = email_vectorizador.transform([texto_limpio]).astype(np.float32) # <- Usamos el texto_limpio
            X_final = hstack([X_tfidf, csr_matrix(X_struct_scaled)])
            probs = email_modelo.predict_proba(X_final)[0]

            idx_phish = config_email.get('idx_phishing', 2)
            idx_spam = config_email.get('idx_spam', 1)
            p_phish = float(probs[idx_phish]) if len(probs) > idx_phish else 0.0
            p_spam = float(probs[idx_spam]) if len(probs) > idx_spam else 0.0
            return p_phish, p_spam

        prob_phish, prob_spam = await asyncio.to_thread(inferencia_email)
        logger.info(f"[EMAIL] phish={prob_phish:.4f} spam={prob_spam:.4f} host={log.host}")
    except Exception as e:
        logger.error(f"Error inferencia EMAIL: {e}")
        raise HTTPException(status_code=500, detail=f"inference_failed: {str(e)}")

    # Decisiones basadas exclusivamente en el correo
    # Decisiones basadas exclusivamente en el correo (Es independiente)
    umbrales = config_email.get('umbrales', {})
    accion = "PERMITIR"
    if prob_phish >= umbrales.get('phishing_aislamiento', 0.85):
        accion = "AISLAMIENTO_Y_CUARENTENA_BUZON"
    elif prob_phish >= umbrales.get('phishing_bloqueo', 0.70):
        accion = "ELIMINAR_CORREO_PHISHING"
    elif prob_spam >= umbrales.get('spam_bloqueo', 0.80):
        accion = "MOVER_A_SPAM"

    # 🔥 FIX: SÍ debemos guardar en Redis para que EDR y RED eleven sus escudos
    if redis_client:
        try:
            await redis_client.setex(f"email:{log.host}:prob", TTL_EMAIL, prob_phish)
            if accion != "PERMITIR":
                alerta = json.dumps({"ts": time.time(), "phish": prob_phish, "spam": prob_spam, "accion": accion})
                await redis_client.lpush(f"alertas_email:{log.host}", alerta)
                await redis_client.expire(f"alertas_email:{log.host}", TTL_EMAIL)
        except Exception: pass

    return {
        "origen": "CAPA_EMAIL",
        "prob_phishing": round(prob_phish, 4),
        "prob_spam": round(prob_spam, 4),
        "indicadores_osint": num_maliciosas,
        "accion": accion
    }

# ==========================================
# HEALTH CHECK
# ==========================================
@app.get("/health")
async def health():
    redis_ok = False
    if redis_client:
        try:
            await redis_client.ping()
            redis_ok = True
        except Exception:
            pass
    total_features_red = len(features_num_red) + len(features_cat_red) + len(features_bin_red)
    return {
        "status": "ok" if (rf_modelo and edr_modelo and email_modelo) else "degradado",
        "capas": {
            "red": {"activa": rf_modelo is not None, "features": total_features_red},
            "endpoint": {"activa": edr_modelo is not None, "columnas_struct": len(columnas_estructuradas)},
            "email": {"activa": email_modelo is not None, "osint_db_size": len(email_intel)},
        },
        "redis": {"activo": redis_ok},
        "version": "9.0.0",
    }