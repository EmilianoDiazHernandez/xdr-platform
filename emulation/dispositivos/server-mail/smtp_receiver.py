import os
import json
import logging
import threading
import uvicorn
from fastapi import FastAPI
from aiosmtpd.controller import Controller
from email_feature_extractor import extract_email_features
import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

DEVICE_HOSTNAME = os.getenv("DEVICE_HOSTNAME", "CORP-MAIL-EXCHANGE")
DEVICE_IP = os.getenv("DEVICE_IP", "172.16.0.20")
EMAIL_LOG_FILE = os.getenv("EMAIL_LOG_FILE", "/var/log/email_events.json")
API_URL = os.getenv("API_URL", "")

last_received_email = None

class MailHandler:
    async def handle_DATA(self, server, session, envelope):
        global last_received_email
        logging.info(f"Mensaje recibido de {envelope.mail_from} para {envelope.rcpt_tos}")
        
        try:
            features = extract_email_features(envelope.content, host=DEVICE_HOSTNAME, ip_local=DEVICE_IP)
            last_received_email = features
            
            # Registrar localmente
            os.makedirs(os.path.dirname(EMAIL_LOG_FILE), exist_ok=True)
            with open(EMAIL_LOG_FILE, "a") as f:
                f.write(json.dumps(features) + "\n")
                
            logging.info(f"Email procesado. Score heuristico: {features.get('score_heuristico')}")
            
            # Reenviar al XDR si la URL está definida
            if API_URL:
                try:
                    res = requests.post(API_URL, json=features, timeout=5.0)
                    logging.info(f"Email transmitido a {API_URL}: HTTP {res.status_code}")
                except Exception as err:
                    logging.warning(f"Error reenviando al colector {API_URL}: {err}")
                    
        except Exception as e:
            logging.error(f"Error procesando email recibido: {e}")
            
        return '250 Message accepted for delivery'

# API auxiliar para diagnóstico y unit testing en puerto 8025
api = FastAPI(title="Mail Server Diagnostic API")

@api.get("/health")
def health():
    return {
        "status": "ok",
        "device": "server-mail",
        "host": DEVICE_HOSTNAME,
        "ip": DEVICE_IP
    }

@api.get("/api/last-email")
def get_last_email():
    return last_received_email or {"status": "no_emails_received"}

def start_smtp():
    handler = MailHandler()
    controller = Controller(handler, hostname="0.0.0.0", port=25)
    controller.start()
    logging.info("Servidor SMTP activo en 0.0.0.0:25")

if __name__ == "__main__":
    start_smtp()
    # Iniciar API de diagnóstico en 0.0.0.0:8025
    uvicorn.run(api, host="0.0.0.0", port=8025)
