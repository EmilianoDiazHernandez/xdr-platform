from fastapi import FastAPI
import requests
import socket
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
def trigger_payload():
    # Payload simulando Sysmon EventID 1: Ejecución de PowerShell codificado (Fileless Malware)
    payload = [{
        "idempotency_key": f"sysmon-ventas-{int(time.time())}-{uuid.uuid4().hex[:6]}",
        "host": "VENTAS-PC",
        "ip_local": "10.20.30.45",
        "EventID": 1,
        "proceso": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        "proceso_padre": "C:\\Windows\\System32\\cmd.exe",
        "cmd": "powershell.exe -nop -w hidden -enc JABzAD0ATmV3AC0ATwBiAGoAZQBjAHQAIABJAE8ALgBNAGUAbQBvAHIAeQBTAHQAcgBlAGEAbQAoAFsAQwBvAG4AdgBlAHIAdABdADoAOgBGAHIAbwBtAEIAYQBzAGUANgA0AFMAdAByAGkAbgBnACgAIg... (mimikatz)",
        "hashes": "SHA256=1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF"
    }]
    
    try:
        res_data = send_post_with_retry("http://api-ml:8000/api/v1/analyze-endpoint", payload)
        return {"status": "Payload Sysmon enviado", "api_response": res_data}
    except Exception as e:
        return {"status": "Error", "details": str(e)}
