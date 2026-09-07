import email
from email import policy
from bs4 import BeautifulSoup
from urllib.parse import urlparse
import re
import io
import zipfile
import logging
import math

logger = logging.getLogger("XDR_EMAIL_ETL")

# ==========================================
# CONSTANTES Y REGLAS HEURÍSTICAS
# ==========================================
TLDS_SOSPECHOSOS = ['.ru', '.tk', '.xyz', '.cn', '.top', '.pw', '.cc']
SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd']
PALABRAS_PHISHING = [
    'urgent', 'verify', 'password', 'login', 'invoice', 
    'account', 'suspend', 'click here', 'update', 'payment',
    'urgente', 'verificar', 'contraseña', 'login', 'factura', 
    'cuenta', 'suspender', 'clic aquí', 'actualizar', 'pago', 'acceso'
]
EXT_SOSPECHOSAS = ['.exe', '.vbs', '.js', '.bat', '.cmd', '.scr', '.iso', '.ps1']
MARCAS_TOP = ['paypal', 'google', 'microsoft', 'apple', 'amazon', 'bank']
MAX_ZIP_SIZE = 5 * 1024 * 1024  # 5MB Límite anti Zip-Bomb

# ==========================================
# FUNCIONES AUXILIARES AVANZADAS
# ==========================================
def entropia(texto):
    """Calcula la entropía de Shannon (Detecta ofuscación y Base64)"""
    if not texto: return 0
    prob = [texto.count(c)/len(texto) for c in set(texto)]
    return -sum(p * math.log2(p) for p in prob)

def es_ip(dominio):
    """Detecta si el dominio es una dirección IP directa"""
    return int(bool(re.match(r'^\d{1,3}(\.\d{1,3}){3}$', dominio)))

def dominio_parecido(dominio):
    """Fuzzy matching ligero para Typosquatting (ej. paypa1.com, micros0ft)"""
    dominio_base = dominio.split('.')[0] if '.' in dominio else dominio
    for marca in MARCAS_TOP:
        if marca in dominio_base:
            continue
        # Distancia simple (hasta 2 caracteres de diferencia)
        if len(dominio_base) >= len(marca):
            diferencias = sum(1 for a, b in zip(marca, dominio_base[:len(marca)]) if a != b)
            if diferencias <= 2 and diferencias > 0:
                return 1
    return 0

def es_url_sospechosa(url):
    url = url.lower()
    if '@' in url: return 1
    return 0

def contar_subdominios(dominio):
    return dominio.count('.') - 1

def extraer_dominio(texto):
    texto = texto.strip().lower()
    if not texto.startswith('http'): texto = 'http://' + texto
    try:
        return urlparse(texto).netloc.lower().strip()
    except Exception:
        return ""

def detectar_display_name_spoof(remitente):
    match = re.search(r'"?(.+?)"?\s*<(.+?)>', remitente)
    if match:
        nombre, correo = match.groups()
        dominio = correo.split('@')[-1].lower().strip()
        if any(marca in nombre.lower() for marca in MARCAS_TOP):
            if not any(marca in dominio for marca in MARCAS_TOP):
                return 1
    return 0

# ==========================================
# MOTOR PRINCIPAL DE EXTRACCIÓN
# ==========================================
def parsear_correo_bytes(contenido_bytes):
    # FIX: Inicialización segura en 0. 
    features = {
        'num_adjuntos': 0, 'tiene_adjunto_sospechoso': 0, 'zip_con_exe': 0,
        'num_links': 0, 'num_dominios_unicos': 0, 'dominio_raro': 0,
        'tiene_url_sospechosa': 0, 'url_con_ip': 0, 'mismatch_link': 0, 
        'tiene_url_acortada': 0, 'tiene_html': 0, 'html_oculto': 0, 
        'tiene_iframe': 0, 'tiene_script': 0, 'score_phishing_keywords': 0, 
        'reply_to_diferente': 0, 'display_name_spoofing': 0, 
        'spf_fail': 0, 'dkim_fail': 0, 'entropia_texto': 0.0,
        'score_heuristico': 0, 'texto_completo': '', 'error': None,
        'url_larga': 0, 'subdominios_altos': 0,
        'urls_extraidas': [] 
    }

    try:
        msg = email.message_from_bytes(contenido_bytes, policy=policy.default)

        # 1. ANÁLISIS DE HEADERS CRÍTICOS
        remitente = str(msg.get('From', '')).strip()
        features['display_name_spoofing'] = detectar_display_name_spoof(remitente)
        
        reply_to = str(msg.get('Reply-To', '')).strip()
        if reply_to and reply_to != remitente:
            features['reply_to_diferente'] = 1

        features['spf_fail'] = int('fail' in str(msg.get('Received-SPF', '')).lower())
        features['dkim_fail'] = int('fail' in str(msg.get('Authentication-Results', '')).lower())

        cuerpo_html, cuerpo_texto = "", ""
        dominios = set()

        # 2. RECORRIDO DE PARTES MIME
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition", ""))
            filename = str(part.get_filename() or "").lower()

            # --- ANÁLISIS DE ADJUNTOS ---
            if "attachment" in content_disposition or filename:
                features['num_adjuntos'] += 1
                if any(filename.endswith(ext) for ext in EXT_SOSPECHOSAS):
                    features['tiene_adjunto_sospechoso'] = 1
                
                # Inspección segura de ZIPs (Anti Zip-Bomb)
                if filename.endswith('.zip'):
                    payload = part.get_payload(decode=True)
                    if payload and len(payload) < MAX_ZIP_SIZE:
                        try:
                            with zipfile.ZipFile(io.BytesIO(payload)) as z:
                                for zinfo in z.infolist()[:100]:
                                    if any(zinfo.filename.lower().endswith(ext) for ext in EXT_SOSPECHOSAS):
                                        features['zip_con_exe'] = 1
                                        break
                        except Exception: pass
                continue

            # --- EXTRACCIÓN DE TEXTO ---
            try:
                payload = part.get_payload(decode=True)
                if not payload: continue
                texto_decodificado = payload.decode(part.get_content_charset() or 'utf-8', errors='replace')

                if content_type == 'text/plain':
                    cuerpo_texto += texto_decodificado + " "
                elif content_type == 'text/html':
                    features['tiene_html'] = 1
                    cuerpo_html += texto_decodificado + " "
            except Exception: continue

        # 3. ANÁLISIS ESTRUCTURAL HTML Y URLs
        if features['tiene_html']:
            cuerpo_html_lower = cuerpo_html.lower()
            if 'display:none' in cuerpo_html_lower or 'visibility:hidden' in cuerpo_html_lower or 'font-size:0' in cuerpo_html_lower:
                features['html_oculto'] = 1

            try:
                soup = BeautifulSoup(cuerpo_html, 'lxml')
                if soup.find('iframe'): features['tiene_iframe'] = 1
                if soup.find('script'): features['tiene_script'] = 1

                links = soup.find_all('a', href=True)
                features['num_links'] = len(links)
                
                for a in links:
                    href = a['href'].lower().strip()
                    
                    features['urls_extraidas'].append(href)
                    
                    if len(href) > 75: features['url_larga'] = 1

                    if href.startswith("javascript:"):
                        features['tiene_url_sospechosa'] = 1
                        continue
                    visible_text = a.get_text(strip=True).lower()
                    
                    if any(s in href for s in SHORTENERS): features['tiene_url_acortada'] = 1
                    if es_url_sospechosa(href): features['tiene_url_sospechosa'] = 1

                    dom_visible = extraer_dominio(visible_text)
                    dom_href = extraer_dominio(href)
                    
                    if dom_href and contar_subdominios(dom_href) >= 3:
                        features['subdominios_altos'] = 1

                    if dom_visible and '.' in dom_visible and dom_visible != dom_href:
                        features['mismatch_link'] = 1
                    
                    if dom_href: 
                        dominios.add(dom_href)
                        if es_ip(dom_href): features['url_con_ip'] = 1
                        if dominio_parecido(dom_href): features['tiene_url_sospechosa'] = 1
                        if any(dom_href.endswith(tld) for tld in TLDS_SOSPECHOSOS):
                            features['dominio_raro'] = 1
                
                features['num_dominios_unicos'] = len(dominios)
                features['texto_completo'] = (cuerpo_texto + " " + soup.get_text(separator=' '))
            except Exception as e:
                logger.warning(f"Error parseando HTML: {e}")
                features['texto_completo'] = cuerpo_texto
        else:
            # Correos de texto plano también pueden tener URLs
            urls_texto = re.findall(r'(https?://[^\s>\"\']+)', cuerpo_texto)
            features['urls_extraidas'].extend(urls_texto)
            features['texto_completo'] = cuerpo_texto

        # 4. LIMPIEZA FINAL, ENTROPÍA Y SCORE
        texto_final = re.sub(r'\s+', ' ', features['texto_completo']).strip().lower()
        asunto = str(msg.get('Subject', '')).strip().lower()
        texto_final = asunto + " " + texto_final

        features['texto_completo'] = texto_final
        features['entropia_texto'] = entropia(texto_final)
        features['score_phishing_keywords'] = sum(texto_final.count(p) for p in PALABRAS_PHISHING)

        # 5. SCORE HEURÍSTICO GLOBAL
        features['score_heuristico'] = (
            2*features['tiene_url_sospechosa'] + 
            2*features['mismatch_link'] +
            2*features['dominio_raro'] + 
            2*features['tiene_adjunto_sospechoso'] +
            2*features['zip_con_exe'] + 
            2*features['reply_to_diferente'] +
            2*features['display_name_spoofing'] + 
            2*features['spf_fail'] +
            2*features['dkim_fail'] + 
            2*features['html_oculto'] +
            2*features['url_con_ip']
        )

    except Exception as e:
        features['error'] = f"Falla en parseo: {str(e)}"
        logger.error(features['error'])

    return features

def parsear_correo(ruta_archivo):
    try:
        with open(ruta_archivo, 'rb') as f:
            contenido_bytes = f.read()
        return parsear_correo_bytes(contenido_bytes)
    except Exception as e:
        logger.error(f"Error leyendo archivo {ruta_archivo}: {e}")
        return {'error': str(e)}


if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 2:
        print("Uso: python extractor_eml.py <ruta_al_archivo.eml>")
        sys.exit(1)

    ruta_eml = sys.argv[1]
    print(f"Analizando: {ruta_eml} ...")
    
    resultados = parsear_correo(ruta_eml)
    
    print("\nResultados de la extracción:")
    print(json.dumps(resultados, indent=4, ensure_ascii=False))