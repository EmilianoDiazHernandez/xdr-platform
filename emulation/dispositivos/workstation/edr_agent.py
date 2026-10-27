import os
import time
import uuid
import json
import socket
import logging
import requests
from fastapi import FastAPI, HTTPException
from user_simulator import UserTrafficSimulator

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

DEVICE_HOSTNAME = os.getenv("DEVICE_HOSTNAME", "VENTAS-PC")
DEVICE_IP = os.getenv("DEVICE_IP", "10.20.30.45")
EDR_LOG_FILE = os.getenv("EDR_LOG_FILE", "/var/log/edr_events.json")
EDR_COLLECTOR_URL = os.getenv("EDR_COLLECTOR_URL", "")
TARGET_WEB_URL = os.getenv("TARGET_WEB_URL", "http://172.16.0.10/")

app = FastAPI(title="Workstation EDR Agent", version="1.0.0")
traffic_sim = UserTrafficSimulator(target_url=TARGET_WEB_URL, interval=30)

@app.on_event("startup")
def startup():
    if os.getenv("AUTO_TRAFFIC", "false").lower() == "true":
        traffic_sim.start()

@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": "workstation",
        "hostname": socket.gethostname(),
        "device_hostname": DEVICE_HOSTNAME,
        "device_ip": DEVICE_IP,
        "traffic_sim_active": traffic_sim.running
    }

@app.post("/trigger-payload")
def trigger_payload():
    """
    Simula la ejecución de un artefacto de malware en memoria (PowerShell Mimikatz).
    Genera un registro idéntico a Sysmon EventID 1.
    """
    event = {
        "idempotency_key": f"sysmon-ventas-{int(time.time())}-{uuid.uuid4().hex[:6]}",
        "host": DEVICE_HOSTNAME,
        "ip_local": DEVICE_IP,
        "EventID": 1,
        "proceso": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        "proceso_padre": "C:\\Windows\\System32\\cmd.exe",
        "cmd": "powershell.exe -nop -w hidden -enc JABzAD0ATmV3AC0ATwBiAGoAZQBjAHQAIABJAE8ALgBNAGUAbQBvAHIAeQBTAHQAcgBlAGEAbQAoAFsAQwBvAG4AdgBlAHIAdABdADoAOgBGAHIAbwBtAEIAYQBzAGUANgA0AFMAdAByAGkAbgBnACgAIg... (mimikatz)",
        "hashes": "SHA256=1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF"
    }

    # 1. Guardar localmente
    try:
        os.makedirs(os.path.dirname(EDR_LOG_FILE), exist_ok=True)
        with open(EDR_LOG_FILE, "a") as f:
            f.write(json.dumps(event) + "\n")
    except Exception as e:
        logging.error(f"Error escribiendo log local: {e}")

    # 2. Reenviar al colector si está configurado
    collector_res = None
    if EDR_COLLECTOR_URL:
        try:
            res = requests.post(EDR_COLLECTOR_URL, json=[event], timeout=5.0)
            collector_res = {"status_code": res.status_code, "body": res.text}
        except Exception as err:
            collector_res = {"error": str(err)}

    return {
        "status": "Payload Sysmon generado",
        "event": event,
        "collector_forward": collector_res
    }

@app.post("/traffic/generate-now")
def generate_traffic_now(target: str = None):
    """Genera una transacción benigna inmediata hacia el servidor web o target especificado."""
    url = target or traffic_sim.target_url
    try:
        t0 = time.time()
        res = requests.get(url, timeout=5.0)
        return {"status": "success", "target": url, "http_status": res.status_code, "duration_s": round(time.time() - t0, 3)}
    except Exception as e:
        return {"status": "error", "target": url, "error": str(e)}

@app.post("/traffic/send-to")
def send_to(target: str = "http://172.16.0.10/"):
    """Envía una petición HTTP benigna a un destino arbitrario de la red."""
    try:
        t0 = time.time()
        res = requests.get(target, timeout=5.0)
        return {"status": "success", "target": target, "http_status": res.status_code, "duration_s": round(time.time() - t0, 3)}
    except Exception as e:
        return {"status": "error", "target": target, "error": str(e)}

@app.post("/traffic/send-mail")
def send_mail(target_ip: str = "172.16.0.20", recipient: str = "direccion@corp.local"):
    """Transmite un correo corporativo legítimo (sin malware/phishing) vía SMTP."""
    import smtplib
    from email.mime.text import MIMEText
    msg = MIMEText("Estimado equipo,\nAdjunto el reporte semanal de actividades operativas.\nSaludos cordiales.")
    msg["Subject"] = "Reporte Semanal de Actividades"
    msg["From"] = f"{DEVICE_HOSTNAME.lower()}@corp.local"
    msg["To"] = recipient
    try:
        with smtplib.SMTP(target_ip, 25, timeout=5) as s:
            s.send_message(msg)
        return {"status": "success", "target": f"{target_ip}:25", "message": "Email corporativo legítimo transmitido."}
    except Exception as e:
        return {"status": "error", "target": f"{target_ip}:25", "error": str(e)}

@app.post("/traffic/start")
def start_traffic():
    traffic_sim.start()
    return {"status": "started", "interval": traffic_sim.interval}

@app.post("/traffic/stop")
def stop_traffic():
    traffic_sim.stop()
    return {"status": "stopped"}

@app.get("/api/logs")
def get_logs():
    events = []
    if os.path.exists(EDR_LOG_FILE):
        with open(EDR_LOG_FILE, "r") as f:
            for line in f:
                if line.strip():
                    events.append(json.loads(line.strip()))
    return {"total": len(events), "events": events}
