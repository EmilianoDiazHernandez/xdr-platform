from fastapi import FastAPI
import requests
import time

app = FastAPI()

@app.post("/trigger")
def trigger_attack():
    # Payload simulando un Escaneo SYN (Nmap) basado en ZeekLog
    payload = [{
        "ts": time.time(),
        "uid": f"sim-red-{int(time.time())}",
        "orig_ip": "185.15.2.2",  # IP Pública (Atacante Ruso ficticio)
        "resp_ip": "172.16.0.10", # IP de tu DMZ Web Server
        "orig_p": 4444,
        "resp_p": 80,
        "proto": "tcp",
        "service": "-",
        "conn_state": "S0", # SYN sin respuesta
        "history": "S",     # Solo vimos el SYN
        "duration": 0.0,
        "orig_bytes": 0.0,
        "resp_bytes": 0.0
    },
    {
        "ts": time.time() + 0.1,
        "uid": f"sim-red-{int(time.time())}-2",
        "orig_ip": "185.15.2.2",  # Mismo Atacante Ruso
        "resp_ip": "172.16.0.20", # IP de tu Servidor de Correo DMZ
        "orig_p": 4445,
        "resp_p": 25,             # Escaneando puerto SMTP
        "proto": "tcp",
        "service": "-",
        "conn_state": "S0",
        "history": "S",
        "duration": 0.0,
        "orig_bytes": 0.0,
        "resp_bytes": 0.0
    }]
    
    try:
        # Petición HTTP real al core XDR (api-ml)
        res = requests.post("http://api-ml:8000/api/v1/analyze-network", json=payload, timeout=5.0)
        return {"status": "Ataque enviado", "api_response": res.json()}
    except Exception as e:
        return {"status": "Error", "details": str(e)}

@app.post("/trigger-normal")
def trigger_normal():
    # Payload simulando navegación web HTTP legítima
    payload = [{
        "ts": time.time(),
        "uid": f"sim-norm-{int(time.time())}",
        "orig_ip": "10.20.30.45", # Ventas PC
        "resp_ip": "172.16.0.10", # DMZ Web Server
        "orig_p": 50555,
        "resp_p": 80,
        "proto": "tcp",
        "service": "http",
        "conn_state": "SF",       # Conexión establecida y terminada normalmente
        "history": "ShADadFf",    # Historial de 3-way handshake normal
        "duration": 0.5,
        "orig_bytes": 450.0,
        "resp_bytes": 15000.0
    }]
    
    try:
        res = requests.post("http://api-ml:8000/api/v1/analyze-network", json=payload, timeout=5.0)
        return {"status": "Tráfico normal enviado", "api_response": res.json()}
    except Exception as e:
        return {"status": "Error", "details": str(e)}
