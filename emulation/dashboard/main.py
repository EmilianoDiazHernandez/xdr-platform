import requests
import os
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

app = FastAPI(title="Lab Dashboard C2")

# Configurar el motor de plantillas (Jinja2)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    """Renderiza el Lab Dashboard."""
    return templates.TemplateResponse(request=request, name="index.html")

# ==========================================
# ENDPOINTS DE CONTROL (COMANDOS A SIMULADORES)
# ==========================================

@app.post("/api/attack/network")
def attack_network():
    """Contacta al contenedor 'emu-red' para lanzar el tráfico real."""
    try:
        # Petición HTTP interna en la red de Docker (puerto 80)
        res = requests.post("http://emu-red/trigger", timeout=5.0)
        return {"status": "success", "message": "Tráfico L3/L7 iniciado", "details": res.json()}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/attack/endpoint")
def attack_endpoint():
    """Contacta al contenedor 'emu-endpoint' para ejecutar payloads EDR."""
    try:
        res = requests.post("http://emu-endpoint/trigger", timeout=5.0)
        return {"status": "success", "message": "Telemetría Sysmon iniciada", "details": res.json()}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/attack/email")
def attack_email():
    try:
        res = requests.post("http://emu-email/trigger", timeout=5.0)
        return {"status": "success", "message": "Phishing iniciado", "details": res.json()}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/normal/network")
def normal_network():
    try:
        res = requests.post("http://emu-red/trigger-normal", timeout=5.0)
        return {"status": "success", "message": "Tráfico de red normal (Legítimo) inyectado", "details": res.json()}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/attack/lateral")
def attack_lateral():
    try:
        # Timeout aumentado a 30s debido a que el script de simulación duerme 5s y procesa
        res = requests.post("http://emu-red/trigger-lateral", timeout=30.0)
        return {"status": "success", "message": "Movimiento Lateral iniciado", "details": res.json()}
    except Exception as e:
        return {"status": "error", "message": str(e)}
