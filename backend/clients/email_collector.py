import imaplib
import time
import socket
import requests
import sys
import os

# Asegurarnos de que podemos importar extractor_eml desde backend/tests
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from tests.extractor_eml import parsear_correo_bytes

# ==========================================
# CONFIGURACIÓN
# ==========================================
# Configuración IMAP (Gmail por defecto)
IMAP_SERVER = "imap.gmail.com"
EMAIL_USER = os.getenv("EMAIL_USER", "tu_correo@gmail.com")
EMAIL_PASS = os.getenv("EMAIL_PASS", "tu_app_password_aqui") # Contraseña de aplicación, NO tu password real

# Configuración FastAPI (XDR Backend)
API_HOST = "172.31.32.1"
API_PORT = 8000
API_URL = f"http://{API_HOST}:{API_PORT}/api/v1/analyze-email"

HOST = socket.gethostname()

def obtener_ip_real():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect((API_HOST, API_PORT))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "172.31.32.144" # Fallback

IP_LOCAL = obtener_ip_real()

def procesar_nuevos_correos():
    """Conecta por IMAP, busca correos no leídos, los extrae y los envía al backend."""
    try:
        # 1. Conexión segura IMAP
        mail = imaplib.IMAP4_SSL(IMAP_SERVER)
        mail.login(EMAIL_USER, EMAIL_PASS)
        mail.select('inbox')

        # 2. Buscar correos No Leídos
        status, response = mail.search(None, '(UNSEEN)')
        
        if status != 'OK':
            print("[-] Error buscando correos nuevos.")
            mail.logout()
            return

        email_ids = response[0].split()
        
        if not email_ids:
            # Nada nuevo
            mail.logout()
            return

        print(f"[*] Se encontraron {len(email_ids)} correo(s) nuevo(s). Procesando...")

        for e_id in email_ids:
            # 3. Descargar correo crudo. 
            # Usar '(RFC822)' marca automáticamente el correo como LEÍDO en Gmail.
            status, msg_data = mail.fetch(e_id, '(RFC822)')
            if status != 'OK':
                print(f"[-] Error descargando el correo con ID {e_id}")
                continue

            # Extraer bytes
            for response_part in msg_data:
                if isinstance(response_part, tuple):
                    raw_email_bytes = response_part[1]
                    
                    # 4. Análisis Heurístico usando el motor
                    features = parsear_correo_bytes(raw_email_bytes)
                    
                    if features.get('error'):
                        print(f"[-] Error procesando el correo: {features['error']}")
                        continue
                    
                    # Preparar payload para API (El schema EmailLog en schemas.py)
                    payload = {
                        "host": HOST,
                        "ip_local": IP_LOCAL,
                        "texto_completo": features.get('texto_completo', ''),
                        "urls_extraidas": features.get('urls_extraidas', []),
                        "num_adjuntos": features.get('num_adjuntos', 0),
                        "tiene_adjunto_sospechoso": features.get('tiene_adjunto_sospechoso', 0),
                        "zip_con_exe": features.get('zip_con_exe', 0),
                        "num_links": features.get('num_links', 0),
                        "num_dominios_unicos": features.get('num_dominios_unicos', 0),
                        "dominio_raro": features.get('dominio_raro', 0),
                        "tiene_url_sospechosa": features.get('tiene_url_sospechosa', 0),
                        "url_con_ip": features.get('url_con_ip', 0),
                        "mismatch_link": features.get('mismatch_link', 0),
                        "tiene_url_acortada": features.get('tiene_url_acortada', 0),
                        "tiene_html": features.get('tiene_html', 0),
                        "html_oculto": features.get('html_oculto', 0),
                        "tiene_iframe": features.get('tiene_iframe', 0),
                        "tiene_script": features.get('tiene_script', 0),
                        "score_phishing_keywords": features.get('score_phishing_keywords', 0),
                        "reply_to_diferente": features.get('reply_to_diferente', 0),
                        "display_name_spoofing": features.get('display_name_spoofing', 0),
                        "spf_fail": features.get('spf_fail', 0),
                        "dkim_fail": features.get('dkim_fail', 0),
                        "entropia_texto": features.get('entropia_texto', 0.0),
                        "score_heuristico": features.get('score_heuristico', 0),
                        "url_larga": features.get('url_larga', 0),
                        "subdominios_altos": features.get('subdominios_altos', 0)
                    }

                    # 5. Enviar a FastAPI
                    try:
                        res = requests.post(API_URL, json=payload, timeout=5)
                        if res.status_code == 200:
                            resultado = res.json()
                            print(f"[+] Correo analizado. Acción recomendada: {resultado.get('accion')}")
                            print(f"    Prob. Phishing: {resultado.get('prob_phishing', 0.0)}")
                            print(f"    Prob. Spam: {resultado.get('prob_spam', 0.0)}")
                        else:
                            print(f"[-] Error enviando a API (HTTP {res.status_code}): {res.text}")
                    except requests.exceptions.RequestException as e:
                        print(f"[-] Fallo de conexión con FastAPI: {e}")

        mail.logout()

    except imaplib.IMAP4.error as e:
        print(f"[-] Error de autenticación IMAP (Revisa usuario/contraseña): {e}")
    except Exception as e:
        print(f"[-] Error inesperado en recolección IMAP: {e}")

if __name__ == "__main__":
    print(f"[*] Sensor Email XDR iniciado en {HOST} ({IP_LOCAL})")
    if EMAIL_USER == "tu_correo@gmail.com":
        print("[!] ADVERTENCIA: Configura tu correo y contraseña en las variables de entorno o en el código fuente.")
        print("    No uses tu contraseña real, usa una 'Contraseña de Aplicación' de Google.")
    
    print("[*] Iniciando monitoreo de bandeja de entrada...")
    
    # Ciclo de polling infinito (Revisa cada 10 segundos)
    while True:
        procesar_nuevos_correos()
        time.sleep(10)
