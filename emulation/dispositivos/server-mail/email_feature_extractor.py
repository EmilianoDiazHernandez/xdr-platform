import re
import math
import email
from email import policy
from urllib.parse import urlparse
import ipaddress

PHISHING_KEYWORDS = [
    "urgent", "urgente", "bank", "banco", "account", "cuenta", "locked", "bloqueada",
    "verify", "verificar", "password", "contraseña", "security", "seguridad",
    "update", "actualizar", "immediately", "inmediatamente", "suspended", "suspendida"
]

SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd"]

def calculate_shannon_entropy(text: str) -> float:
    if not text:
        return 0.0
    freq = {}
    for c in text:
        freq[c] = freq.get(c, 0) + 1
    entropy = 0.0
    length = len(text)
    for count in freq.values():
        p = count / length
        entropy -= p * math.log2(p)
    return round(entropy, 2)

def extract_email_features(raw_email_bytes: bytes, host: str = "CORP-MAIL-EXCHANGE", ip_local: str = "172.16.0.20") -> dict:
    """
    Parsea un mensaje MIME en crudo y extrae las 24 características requeridas
    por el modelo de Machine Learning y el esquema EmailLog del XDR.
    """
    msg = email.message_from_bytes(raw_email_bytes, policy=policy.default)
    
    # Extraer texto y HTML
    body_text = ""
    body_html = ""
    num_adjuntos = 0
    tiene_adjunto_sospechoso = 0
    zip_con_exe = 0
    
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            filename = part.get_filename()
            if filename:
                num_adjuntos += 1
                fn_lower = filename.lower()
                if any(fn_lower.endswith(ext) for ext in [".exe", ".scr", ".bat", ".ps1", ".vbs", ".zip"]):
                    tiene_adjunto_sospechoso = 1
                if fn_lower.endswith(".zip"):
                    zip_con_exe = 1
            elif content_type == "text/plain":
                try: body_text += part.get_payload(decode=True).decode(errors="ignore")
                except: pass
            elif content_type == "text/html":
                try: body_html += part.get_payload(decode=True).decode(errors="ignore")
                except: pass
    else:
        content_type = msg.get_content_type()
        try:
            payload_decoded = msg.get_payload(decode=True).decode(errors="ignore")
        except:
            payload_decoded = str(msg.get_payload())
            
        if content_type == "text/html":
            body_html = payload_decoded
        else:
            body_text = payload_decoded

    full_text = f"{msg.get('subject', '')} {body_text} {body_html}"
    
    # Detección de URLs
    url_pattern = r'https?://[^\s<>"]+|www\.[^\s<>"]+'
    urls = re.findall(url_pattern, full_text)
    
    domains = set()
    url_con_ip = 0
    url_larga = 0
    subdominios_altos = 0
    tiene_url_acortada = 0
    tiene_url_sospechosa = 0
    dominio_raro = 0
    
    for u in urls:
        parsed = urlparse(u if u.startswith("http") else "http://" + u)
        netloc = parsed.netloc.split(":")[0]
        domains.add(netloc)
        
        # Verificar si la URL usa IP directa
        try:
            ipaddress.ip_address(netloc)
            url_con_ip = 1
        except ValueError:
            pass
            
        if len(u) > 75:
            url_larga = 1
            
        parts = netloc.split(".")
        if len(parts) > 3:
            subdominios_altos = 1
            
        if any(shortener in netloc for shortener in SHORTENERS):
            tiene_url_acortada = 1
            
        if any(ext in netloc for ext in [".xyz", ".top", ".club", ".work", ".click"]):
            dominio_raro = 1
            tiene_url_sospechosa = 1

    # Características HTML
    tiene_html = 1 if body_html else 0
    html_oculto = 1 if "display:none" in body_html.lower() or "visibility:hidden" in body_html.lower() else 0
    tiene_iframe = 1 if "<iframe" in body_html.lower() else 0
    tiene_script = 1 if "<script" in body_html.lower() else 0
    
    # Score de palabras clave
    text_lower = full_text.lower()
    score_kw = sum(1 for kw in PHISHING_KEYWORDS if kw in text_lower)
    score_phishing_keywords = min(100, score_kw * 15)
    
    # Score heurístico consolidado
    score_heuristico = min(100, (score_phishing_keywords // 2) + (tiene_adjunto_sospechoso * 30) + (tiene_url_acortada * 20))
    
    entropy = calculate_shannon_entropy(full_text)
    
    return {
        "host": host,
        "ip_local": ip_local,
        "texto_completo": full_text[:1000],
        "urls_extraidas": list(urls),
        "num_adjuntos": num_adjuntos,
        "tiene_adjunto_sospechoso": tiene_adjunto_sospechoso,
        "zip_con_exe": zip_con_exe,
        "num_links": len(urls),
        "num_dominios_unicos": len(domains),
        "dominio_raro": dominio_raro,
        "tiene_url_sospechosa": tiene_url_sospechosa or (1 if len(urls) > 0 and score_kw > 2 else 0),
        "url_con_ip": url_con_ip,
        "mismatch_link": 0,
        "tiene_url_acortada": tiene_url_acortada,
        "tiene_html": tiene_html,
        "html_oculto": html_oculto,
        "tiene_iframe": tiene_iframe,
        "tiene_script": tiene_script,
        "score_phishing_keywords": score_phishing_keywords,
        "reply_to_diferente": 0,
        "display_name_spoofing": 0,
        "spf_fail": 0,
        "dkim_fail": 0,
        "entropia_texto": entropy,
        "score_heuristico": score_heuristico,
        "url_larga": url_larga,
        "subdominios_altos": subdominios_altos
    }
