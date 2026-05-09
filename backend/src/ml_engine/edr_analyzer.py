import pandas as pd
import numpy as np
import re
import math
import string
from collections import Counter
from scipy.sparse import hstack, csr_matrix
from src.ml_engine.model_loader import ModelLoader

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

def extraer_features_edr(log, historial_tuplas, models):
    config_edr = models['config']
    columnas_estructuradas = models['columnas_estructuradas']

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

def analyze_endpoint(log, historial_actual):
    models = ModelLoader.get('edr')
    if not models.get('model'):
        raise Exception("Modelo EDR no cargado.")

    X_estructuradas, cadena_activa = extraer_features_edr(log, historial_actual, models)
    texto_nlp = f"{log.cmd or ''} {log.proceso or ''} {log.proceso_padre or ''}"

    X_tfidf = models['vectorizer'].transform([texto_nlp])
    X_final = hstack([X_tfidf, csr_matrix(X_estructuradas, dtype=np.float64)])
    prob_edr = float(models['model'].predict_proba(X_final)[0][1])

    # Reducción heurística
    rutas_seguras = [
        "postgresql", "Zoom ", "googleupdater", "hp one agent", "rg", 
        "system32\\svchost.exe", "microsoft vs code"
    ]
    texto_evaluado = f"{log.cmd or ''} {log.proceso or ''}".lower()
    es_software_seguro = any(ruta in texto_evaluado for ruta in rutas_seguras)

    if es_software_seguro and not cadena_activa:
       if prob_edr < 0.85:
            prob_edr = 0.15

    return prob_edr, cadena_activa
