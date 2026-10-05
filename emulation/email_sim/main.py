from fastapi import FastAPI
import requests

app = FastAPI()

@app.post("/trigger")
def trigger_phishing():
    # Payload simulando un correo extraído de la cola SMTP
    payload = {
        "host": "CORP-MAIL-EXCHANGE",
        "ip_local": "172.16.0.20", # IP de tu Servidor de Correo en la DMZ
        "texto_completo": "URGENT: Your bank account has been locked due to suspicious activity. Please verify your identity immediately by clicking here: http://secure-login-verify-account-update.com/login.php",
        "urls_extraidas": ["http://secure-login-verify-account-update.com/login.php", "http://malicious-cdn.net/payload.exe"],
        "num_adjuntos": 1,
        "tiene_adjunto_sospechoso": 1,
        "zip_con_exe": 1,
        "num_links": 2,
        "num_dominios_unicos": 2,
        "dominio_raro": 1,
        "tiene_url_sospechosa": 1,
        "url_con_ip": 0,
        "mismatch_link": 1,
        "tiene_url_acortada": 1,
        "tiene_html": 1,
        "html_oculto": 1,
        "tiene_iframe": 0,
        "tiene_script": 1,
        "score_phishing_keywords": 98,
        "reply_to_diferente": 1,
        "display_name_spoofing": 1,
        "spf_fail": 1,
        "dkim_fail": 1,
        "entropia_texto": 5.2,
        "score_heuristico": 85,
        "url_larga": 1,
        "subdominios_altos": 1
    }
    
    try:
        # Petición HTTP real al core XDR (api-ml)
        res = requests.post("http://api-ml:8000/api/v1/analyze-email", json=payload, timeout=5.0)
        return {"status": "Phishing enviado", "api_response": res.json()}
    except Exception as e:
        return {"status": "Error", "details": str(e)}
