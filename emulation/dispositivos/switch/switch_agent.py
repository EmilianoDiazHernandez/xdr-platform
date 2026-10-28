import os
import socket
import logging
import uvicorn
from fastapi import FastAPI

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

DEVICE_HOSTNAME = os.getenv("DEVICE_HOSTNAME", "SW-LAN-CORE")
DEVICE_IP = os.getenv("DEVICE_IP", "10.20.30.2")
SWITCH_ROLE = os.getenv("SWITCH_ROLE", "Core Distribution Switch")
VLAN_ID = os.getenv("VLAN_ID", "10")

app = FastAPI(title="Enterprise Managed Switch Agent", version="1.0.0")

@app.get("/")
def index():
    return {
        "device": "switch",
        "hostname": DEVICE_HOSTNAME,
        "ip": DEVICE_IP,
        "role": SWITCH_ROLE,
        "vlan": VLAN_ID,
        "status": "operational",
        "spanning_tree": "RSTP - Forwarding"
    }

@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": "switch",
        "hostname": socket.gethostname(),
        "device_hostname": DEVICE_HOSTNAME,
        "device_ip": DEVICE_IP,
        "ports_active": 24,
        "status_oper": "UP"
    }

@app.get("/api/ports")
def get_ports():
    return {
        "switch": DEVICE_HOSTNAME,
        "total_ports": 24,
        "ports": [
            {"port": f"Gi1/0/{i}", "status": "UP" if i <= 8 else "DOWN", "speed": "1Gbps", "vlan": VLAN_ID}
            for i in range(1, 25)
        ]
    }

@app.post("/traffic/probe")
def probe_target(target: str = "http://172.16.0.1/"):
    """Envía un paquete o sondeo HTTP hacia otro dispositivo o router."""
    import requests
    import time
    try:
        t0 = time.time()
        res = requests.get(target, timeout=4.0)
        return {
            "status": "success",
            "source": DEVICE_HOSTNAME,
            "source_ip": DEVICE_IP,
            "target": target,
            "http_status": res.status_code,
            "duration_s": round(time.time() - t0, 3)
        }
    except Exception as e:
        return {
            "status": "error",
            "source": DEVICE_HOSTNAME,
            "source_ip": DEVICE_IP,
            "target": target,
            "error": str(e)
        }


if __name__ == "__main__":
    port = int(os.getenv("PORT", "80"))
    uvicorn.run(app, host="0.0.0.0", port=port)
