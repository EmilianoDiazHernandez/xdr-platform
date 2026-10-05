from fastapi import FastAPI
import requests
import socket

app = FastAPI()

@app.post("/trigger")
def trigger_payload():
    # Payload simulando Sysmon EventID 1: Ejecución de PowerShell codificado (Fileless Malware)
    payload = {
        "host": "VENTAS-PC",
        "ip_local": "10.20.30.45", # IP de tu Red LAN (Víctima)
        "EventID": 1,
        "proceso": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        "proceso_padre": "C:\\Windows\\System32\\cmd.exe",
        "cmd": "powershell.exe -nop -w hidden -enc JABzAD0ATmV3AC0ATwBiAGoAZQBjAHQAIABJAE8ALgBNAGUAbQBvAHIAeQBTAHQAcgBlAGEAbQAoAFsAQwBvAG4AdgBlAHIAdABdADoAOgBGAHIAbwBtAEIAYQBzAGUANgA0AFMAdAByAGkAbgBnACgAIg... (mimikatz)",
        "hashes": "SHA256=1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF"
    }
    
    try:
        # Petición HTTP real al core XDR (api-ml)
        res = requests.post("http://api-ml:8000/api/v1/analyze-endpoint", json=payload, timeout=5.0)
        return {"status": "Payload Sysmon enviado", "api_response": res.json()}
    except Exception as e:
        return {"status": "Error", "details": str(e)}
