import os
import time
import uuid
import hashlib
import json
import logging
import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

EDR_LOG_FILE = os.getenv("EDR_LOG_FILE", "/var/log/edr_events.json")
EDR_COLLECTOR_URL = os.getenv("EDR_COLLECTOR_URL", "")

def emit_sysmon_process_create(cmd_str: str, process_name: str = None, parent_process: str = None):
    """
    Genera y registra un evento equivalente a Sysmon EventID 1 (Process Create).
    """
    host = os.getenv("DEVICE_HOSTNAME", "SRV-DMZ-WEB")
    ip_local = os.getenv("DEVICE_IP", "172.16.0.10")
    
    proc = process_name or ("C:\\Windows\\System32\\cmd.exe" if "powershell" in cmd_str.lower() or "cmd" in cmd_str.lower() else "/bin/bash")
    parent = parent_process or ("C:\\Windows\\System32\\w3wp.exe" if "powershell" in cmd_str.lower() else "/usr/sbin/nginx")
    
    cmd_hash = hashlib.sha256(cmd_str.encode("utf-8")).hexdigest()
    
    event = {
        "idempotency_key": f"sysmon-{host.lower()}-{int(time.time())}-{uuid.uuid4().hex[:6]}",
        "host": host,
        "ip_local": ip_local,
        "EventID": 1,
        "proceso": proc,
        "proceso_padre": parent,
        "cmd": cmd_str,
        "hashes": f"SHA256={cmd_hash}"
    }
    
    # 1. Registro local inmutable en disco
    try:
        os.makedirs(os.path.dirname(EDR_LOG_FILE), exist_ok=True)
        with open(EDR_LOG_FILE, "a") as f:
            f.write(json.dumps(event) + "\n")
    except Exception as e:
        logging.error(f"Error escribiendo en log local EDR: {e}")

    # 2. Transmisión al colector si está configurado
    if EDR_COLLECTOR_URL:
        try:
            res = requests.post(EDR_COLLECTOR_URL, json=[event], timeout=5.0)
            logging.info(f"Telemetría EDR transmitida a {EDR_COLLECTOR_URL}: HTTP {res.status_code}")
            return {"logged": True, "event": event, "collector_status": res.status_code}
        except Exception as e:
            logging.warning(f"No se pudo contactar al colector EDR {EDR_COLLECTOR_URL}: {e}")
            return {"logged": True, "event": event, "collector_error": str(e)}

    return {"logged": True, "event": event}
