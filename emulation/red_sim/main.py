from fastapi import FastAPI
import requests
import time
import uuid

app = FastAPI()

def send_post_with_retry(url: str, payload: list, max_retries: int = 3, initial_delay: float = 0.5):
    """
    Envía peticiones HTTP reutilizando exactamente la misma identidad e idempotency_key
    en cada intento con retroceso exponencial para errores transitorios.
    """
    delay = initial_delay
    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            res = requests.post(url, json=payload, timeout=10.0)
            if res.status_code == 200:
                return res.json()
            elif res.status_code >= 500:
                last_error = f"HTTP {res.status_code}: {res.text}"
            else:
                raise RuntimeError(f"HTTP {res.status_code}: {res.text}")
        except requests.RequestException as e:
            last_error = str(e)
            
        if attempt < max_retries:
            time.sleep(delay)
            delay *= 2
            
    raise RuntimeError(f"Error tras {max_retries} intentos: {last_error}")

@app.post("/trigger")
def trigger_attack():
    payload = []
    base_time = time.time()
    batch_token = uuid.uuid4().hex[:6]
    
    for i in range(60):
        uid_val = f"sim-red-{int(base_time)}-{i}"
        payload.append({
            "idempotency_key": f"idem-{uid_val}-{batch_token}",
            "ts": base_time + (i * 0.01),
            "uid": uid_val,
            "orig_ip": "185.15.2.2",
            "resp_ip": "172.16.0.10",
            "orig_p": 4444 + i,
            "resp_p": 80,
            "proto": "tcp",
            "service": "-",
            "conn_state": "S0",
            "history": "S",
            "duration": 0.0,
            "orig_bytes": 0.0,
            "resp_bytes": 0.0
        })
    
    smtp_uid = f"sim-red-{int(time.time())}-smtp"
    payload.append({
        "idempotency_key": f"idem-{smtp_uid}-{batch_token}",
        "ts": time.time() + 1.0,
        "uid": smtp_uid,
        "orig_ip": "185.15.2.2",
        "resp_ip": "172.16.0.20",
        "orig_p": 4445,
        "resp_p": 25,
        "proto": "tcp",
        "service": "-",
        "conn_state": "S0",
        "history": "S",
        "duration": 0.0,
        "orig_bytes": 0.0,
        "resp_bytes": 0.0
    })
    
    try:
        res_data = send_post_with_retry("http://api-ml:8000/api/v1/analyze-network", payload)
        return {"status": "Ataque enviado", "api_response": res_data}
    except Exception as e:
        return {"status": "Error", "details": str(e)}

@app.post("/trigger-normal")
def trigger_normal():
    base_time = time.time()
    norm_uid = f"sim-norm-{int(base_time)}"
    payload = [{
        "idempotency_key": f"idem-{norm_uid}-{uuid.uuid4().hex[:6]}",
        "ts": base_time,
        "uid": norm_uid,
        "orig_ip": "10.20.30.45",
        "resp_ip": "172.16.0.10",
        "orig_p": 50555,
        "resp_p": 80,
        "proto": "tcp",
        "service": "http",
        "conn_state": "SF",
        "history": "ShADadFf",
        "duration": 0.5,
        "orig_bytes": 450.0,
        "resp_bytes": 15000.0
    }]
    
    try:
        res_data = send_post_with_retry("http://api-ml:8000/api/v1/analyze-network", payload)
        return {"status": "Tráfico normal enviado", "api_response": res_data}
    except Exception as e:
        return {"status": "Error", "details": str(e)}

@app.post("/trigger-lateral")
def trigger_lateral_movement():
    base_time = time.time()
    batch_token = uuid.uuid4().hex[:6]
    
    # 1. Paso 1: Network - Atacante comprometiendo DMZ
    payload_1 = []
    for i in range(5):
        uid_val = f"lat-step1-{int(base_time)}-{i}"
        payload_1.append({
            "idempotency_key": f"idem-{uid_val}-{batch_token}",
            "ts": base_time + (i * 0.01),
            "uid": uid_val,
            "orig_ip": "185.15.2.2",
            "resp_ip": "172.16.0.10",
            "orig_p": 4444 + i,
            "resp_p": 80,
            "proto": "tcp",
            "service": "-",
            "conn_state": "S0",
            "history": "S",
            "duration": 0.0,
            "orig_bytes": 0.0,
            "resp_bytes": 0.0
        })
        
    try:
        res1_data = send_post_with_retry("http://api-ml:8000/api/v1/analyze-network", payload_1)
    except Exception as e:
        return {"status": "Error en paso 1", "details": str(e)}

    time.sleep(2)
    
    # 2. Paso 2: Endpoint - Ejecución de malware en la DMZ
    ep_token = uuid.uuid4().hex[:6]
    payload_endpoint = [{
        "idempotency_key": f"idem-lat-step2-{int(base_time)}-{ep_token}",
        "host": "SRV-DMZ-WEB",
        "ip_local": "172.16.0.10",
        "EventID": 1,
        "proceso": "C:\\Windows\\System32\\cmd.exe",
        "proceso_padre": "C:\\Windows\\System32\\w3wp.exe",
        "cmd": "cmd.exe /c powershell.exe -w hidden -enc JABzAD0ATgBlAHcALQBPAGIAagBlAGMAdAAgAEkATwAuAE0AZQBtAG8AcgB5AFMAdAByAGUAYQBtACgAWwBDAG8AbgB2AGUAcgB0AF0AOgA6AEYAcgBvAG0AQgBhAHMAZQA2ADQAUwB0AHIAaQBuAGcAKAAiAEgA...",
        "hashes": "SHA256=1234567890abcdef"
    }]
    
    try:
        res_ep_data = send_post_with_retry("http://api-ml:8000/api/v1/analyze-endpoint", payload_endpoint)
    except Exception as e:
        return {"status": "Error en paso 2 (Endpoint)", "details": str(e)}

    time.sleep(2)

    # 3. Paso 3: Network - Movimiento Lateral hacia otro servidor (172.16.0.20)
    base_time_3 = time.time()
    payload_3 = []
    for i in range(5):
        uid_val = f"lat-step3-{int(base_time_3)}-{i}"
        payload_3.append({
            "idempotency_key": f"idem-{uid_val}-{batch_token}",
            "ts": base_time_3 + (i * 0.01),
            "uid": uid_val,
            "orig_ip": "172.16.0.10",
            "resp_ip": "172.16.0.20",
            "orig_p": 5555 + i,
            "resp_p": 445,
            "proto": "tcp",
            "service": "-",
            "conn_state": "S0",
            "history": "S",
            "duration": 0.0,
            "orig_bytes": 0.0,
            "resp_bytes": 0.0
        })

    try:
        res3_data = send_post_with_retry("http://api-ml:8000/api/v1/analyze-network", payload_3)
    except Exception as e:
        return {"status": "Error en paso 3", "details": str(e)}

    return {
        "status": "Escenario completo de Movimiento Lateral inyectado exitosamente.",
        "step_1": {
            "vector": "Network",
            "descripcion": "Atacante (185.15.2.2) ataca DMZ (172.16.0.10)",
            "api_response": res1_data
        },
        "step_2": {
            "vector": "Endpoint",
            "descripcion": "Ejecución de payload (w3wp.exe -> cmd.exe -> powershell) en DMZ (172.16.0.10)",
            "api_response": res_ep_data
        },
        "step_3": {
            "vector": "Network",
            "descripcion": "Pivot desde DMZ (172.16.0.10) hacia Servidor Interno (172.16.0.20) por SMB",
            "api_response": res3_data
        }
    }
