import pandas as pd
import numpy as np
import re
import math
import string
import base64
from collections import Counter, defaultdict
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

OFIMATICA_BINS = {'winword.exe', 'excel.exe', 'outlook.exe', 'powerpnt.exe'}
NAVEGADOR_BINS = {'chrome.exe', 'firefox.exe', 'msedge.exe', 'iexplore.exe'}
SHELL_BINS     = {'cmd.exe', 'powershell.exe', 'pwsh.exe', 'wscript.exe', 'cscript.exe'}

mapa_padres_recientes = defaultdict(dict)

def calcular_entropia(texto):
    if not texto: return 0.0
    probabilidades = [c / len(texto) for c in Counter(texto).values()]
    return -sum(p * math.log2(p) for p in probabilidades)

def ratio_especiales(texto):
    if not texto: return 0.0
    especiales = sum(1 for c in str(texto) if c in string.punctuation)
    return especiales / len(str(texto))

def decodificar_powershell_base64(cmd_str: str) -> str:
    """Extrae y decodifica cargas útiles Base64 en UTF-16LE / UTF-8 en memoria."""
    if not cmd_str or not isinstance(cmd_str, str):
        return ""
    
    patron_enc = re.search(r'(?:-enc|-encodedcommand|/enc)\s+([A-Za-z0-9+/=]{20,})', cmd_str, re.IGNORECASE)
    cand = patron_enc.group(1) if patron_enc else None
    
    if not cand:
        bloques = re.findall(r'[A-Za-z0-9+/]{32,}={0,2}', cmd_str)
        if bloques:
            cand = bloques[0]
            
    if cand:
        try:
            padding = len(cand) % 4
            if padding:
                cand += '=' * (4 - padding)
            b_decoded = base64.b64decode(cand)
            # PowerShell codifica comandos nativamente en UTF-16LE
            try:
                dec_utf16 = b_decoded.decode('utf-16le', errors='ignore')
                if any(k in dec_utf16.lower() for k in ['$', 'http', 'new-object', 'iex', 'download', 'invoke', 'bypass', 'hidden']):
                    return f" <DECODED_CMD> {dec_utf16.strip()} </DECODED_CMD>"
            except Exception:
                pass
            # Fallback a UTF-8
            dec_utf8 = b_decoded.decode('utf-8', errors='ignore')
            if any(k in dec_utf8.lower() for k in ['$', 'http', 'new-object', 'iex', 'download', 'invoke', 'bypass']):
                return f" <DECODED_CMD> {dec_utf8.strip()} </DECODED_CMD>"
        except Exception:
            pass
    return ""

def sanitizar_texto_endpoint(texto: str) -> str:
    """Normaliza rutas, usuarios e identificadores efímeros para evitar atajos espurios."""
    if not texto or not isinstance(texto, str):
        return ""
    
    s = texto
    # 1. Rutas de usuario: C:\Users\<Cualquiera>\ -> C:\Users\<USER>\
    s = re.sub(r'(?i)[a-zA-Z]:\\Users\\[^\s\\\'"]+', r'C:\\Users\\<USER>', s)
    s = re.sub(r'(?i)/home/[^\s/\'"]+', r'/home/<USER>', s)
    
    # 2. Archivos temporales y volcados de memoria
    s = re.sub(r'(?i)is-[a-z0-9_.-]+\.tmp', '<TMP_FILE>', s)
    s = re.sub(r'(?i)\\[^\\]*?~?[0-9a-f]{5,}[^\\]*?\.(tmp|log|dat)', r'\\<TMP_FILE>', s)
    s = re.sub(r'(?i)(?:dump_\d+|lsass)\.dmp', '<MEM_DUMP>', s)
    
    # 3. Direcciones IP externas
    s = re.sub(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', '<IP_ADDR>', s)
    
    # 4. Nombres de archivo de prueba genéricos de simuladores
    s = re.sub(r'(?i)\b(payload|factura_[a-z0-9_]+|malware|evil|sys_\d+)\.(exe|hta|dll|doc|docx|vbs|ps1)\b', r'<GENERIC_PAYLOAD>.\2', s)
    
    # 5. GUIDs y Hashes
    s = re.sub(r'\b[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\b', '<GUID>', s)
    s = re.sub(r'\b[0-9a-fA-F]{32,64}\b', '<HASH>', s)
    
    return s

def extraer_features_edr(log, historial_tuplas, models):
    config_edr = models['config']
    columnas_estructuradas = models['columnas_estructuradas']

    log_cmd_lower = log.cmd.lower() if log.cmd else ''
    proc_lower = log.proceso.lower() if log.proceso else ''
    padre_lower = log.proceso_padre.lower() if log.proceso_padre else ''

    proc_nombre = proc_lower.split('\\')[-1]
    padre_nombre = padre_lower.split('\\')[-1]
    historial_cmds = [h['cmd'] for h in historial_tuplas]

    # Reconstrucción del árbol genealógico (abuelo) por host
    host = getattr(log, 'host', 'unknown') or 'unknown'
    abuelo_lower = mapa_padres_recientes[host].get(padre_nombre, '')
    mapa_padres_recientes[host][proc_nombre] = padre_nombre
    if len(mapa_padres_recientes[host]) > 200:
        mapa_padres_recientes[host].clear()

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

    padre_es_ofi  = int(padre_nombre in OFIMATICA_BINS or bool(REGEX['ofimatica'].search(padre_lower)))
    padre_es_nav  = int(padre_nombre in NAVEGADOR_BINS or bool(REGEX['navegador'].search(padre_lower)))
    abuelo_es_ofi = int(abuelo_lower in OFIMATICA_BINS or bool(REGEX['ofimatica'].search(abuelo_lower)))
    abuelo_es_nav = int(abuelo_lower in NAVEGADOR_BINS or bool(REGEX['navegador'].search(abuelo_lower)))
    salto_ofi_shell = int((abuelo_es_ofi or padre_es_ofi) and (proc_nombre in SHELL_BINS or padre_nombre in SHELL_BINS))

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
        'padre_es_ofimática': padre_es_ofi,
        'padre_es_ofimatica': padre_es_ofi,
        'padre_es_ofimtica': padre_es_ofi,
        'padre_es_navegador': padre_es_nav,
        'abuelo_es_ofimática': abuelo_es_ofi,
        'abuelo_es_ofimatica': abuelo_es_ofi,
        'abuelo_es_ofimtica': abuelo_es_ofi,
        'abuelo_es_navegador': abuelo_es_nav,
        'salto_ofimatica_shell': salto_ofi_shell,
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
    
    # Preprocesamiento NLP con decodificación Base64 y sanitización de rutas/artefactos
    decodificado = decodificar_powershell_base64(log.cmd or '')
    raw_texto = f"{log.cmd or ''}{decodificado} {log.proceso or ''} {log.proceso_padre or ''}"
    texto_nlp = sanitizar_texto_endpoint(raw_texto)

    X_tfidf = models['vectorizer'].transform([texto_nlp])
    if models.get('scaler'):
        X_estructuradas = models['scaler'].transform(X_estructuradas)
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
