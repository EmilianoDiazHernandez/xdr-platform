import os
import json
import socket
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from edr_hook import emit_sysmon_process_create, EDR_LOG_FILE

app = FastAPI(title="DMZ Web Portal", version="1.0.0")

class ExecRequest(BaseModel):
    cmd: str

@app.get("/", response_class=HTMLResponse)
def index():
    return """
    <!DOCTYPE html>
    <html>
    <head><title>Corporate DMZ Portal</title></head>
    <body style="font-family: Arial; padding: 40px; background: #f4f6f9;">
        <h1>Corporate DMZ Application Server</h1>
        <p>Status: <strong>Online</strong></p>
        <p>Host: SRV-DMZ-WEB (172.16.0.10)</p>
        <hr>
        <p>Protected internal services portal. Authorized access only.</p>
    </body>
    </html>
    """

@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": "server-web",
        "hostname": socket.gethostname(),
        "host_id": os.getenv("DEVICE_HOSTNAME", "SRV-DMZ-WEB"),
        "ip": os.getenv("DEVICE_IP", "172.16.0.10")
    }

@app.post("/api/vulnerable-exec")
def vulnerable_exec(req: ExecRequest):
    """
    Ruta que simula ejecución remota de comandos (RCE).
    Dispara la detección EDR local emulando Sysmon EventID 1.
    """
    cmd = req.cmd.strip()
    if not cmd:
        raise HTTPException(status_code=400, detail="Comando vacío")
        
    hook_result = emit_sysmon_process_create(cmd)
    
    return {
        "status": "executed",
        "output": f"Simulated output for command: {cmd}",
        "edr_telemetry": hook_result
    }

@app.post("/api/db-query")
def db_query(target_db: str = "10.20.30.50"):
    """Simula una consulta transaccional backend hacia las Bases de Datos de la LAN."""
    import requests
    try:
        res = requests.get(f"http://{target_db}:8050/health", timeout=4.0)
        return {"status": "success", "db": target_db, "http_status": res.status_code}
    except Exception as e:
        return {"status": "error", "db": target_db, "error": str(e)}

@app.get("/api/edr-logs")
def get_edr_logs():
    """Retorna los eventos Sysmon generados localmente para auditoría."""
    events = []
    if os.path.exists(EDR_LOG_FILE):
        try:
            with open(EDR_LOG_FILE, "r") as f:
                for line in f:
                    if line.strip():
                        events.append(json.loads(line.strip()))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    return {"total": len(events), "events": events}
