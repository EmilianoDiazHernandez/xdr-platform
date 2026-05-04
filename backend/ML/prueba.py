import time
import requests
import subprocess
import json

# Configuración
API_URL = "http://172.31.32.1:8000/api/v1/analyze-network"
LOG_PATH = "conn.log"

def follow(thefile):
    thefile.seek(0,2) # Ir al final del archivo
    while True:
        line = thefile.readline()
        if not line:
            time.sleep(0.1)
            continue
        yield line

print(f"[*] Escuchando logs en {LOG_PATH}...")

with open(LOG_PATH, "r") as f:
    for line in follow(f):
        if line.startswith("#"): continue # Ignorar encabezados

        fields = line.strip().split("\t")
        if len(fields) < 10: continue

        # Mapeo básico al modelo ZeekLog de tu FastAPI
        # Nota: Los índices dependen de la versión de Zeek, ajusta según sea necesario
        payload = {
            "orig_ip": fields[2],
            "duration": float(fields[8]) if fields[8] != "-" else 0.0,
            "orig_bytes": float(fields[9]) if fields[9] != "-" else 0.0,
            "resp_bytes": float(fields[10]) if fields[10] != "-" else 0.0,
            "proto": fields[6],
            "history": fields[16] if len(fields) > 16 else "-"
        }

        try:
            response = requests.post(API_URL, json=payload)
            print(f"[+] Trafico de {payload['origin_ip']} enviado. Respuesta XDR: {response.json()}")
        except Exception as e:
            print(f"Error enviando a API: {e}")