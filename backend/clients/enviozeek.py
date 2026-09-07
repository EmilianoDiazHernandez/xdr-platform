import time
import requests

# Configuración
API_URL = "http://172.31.32.1:8000/api/v1/analyze-network"
LOG_PATH = "conn.log"

def follow(thefile):
    thefile.seek(0, 2) # Ir al final del archivo
    while True:
        line = thefile.readline()
        if not line:
            time.sleep(0.1)
            continue
        yield line

def a_flotante(val):
    return float(val) if val != '-' else 0.0

def a_entero(val):
    return int(val) if val != '-' else 0

print(f"[*] Escuchando logs en {LOG_PATH}...")

with open(LOG_PATH, "r") as f:
    for line in follow(f):
        if line.startswith("#"): continue # Ignorar encabezados

        fields = line.strip().split("\t")

        # Zeek tiene por defecto unas 21 columnas. Si tiene menos de 20, está incompleto.
        if len(fields) < 20:
            continue

        # Mapeo EXACTO basado en la estructura de conn.log y tu ZeekLog
        payload = {
            "orig_ip": fields[2],
            "orig_p": a_entero(fields[3]), # Agregado puerto de origen
            "resp_ip": fields[4],
            "resp_p": a_entero(fields[5]), # Corregido: en schemas.py se llama resp_p
            "proto": fields[6],
            "service": fields[7],
            "duration": a_flotante(fields[8]),
            "orig_bytes": a_flotante(fields[9]),
            "resp_bytes": a_flotante(fields[10]),
            "conn_state": fields[11],
            "local_orig": fields[12],
            "local_resp": fields[13],
            "missed_bytes": a_flotante(fields[14]),
            "history": fields[15],
            "orig_pkts": a_flotante(fields[16]),
            "orig_ip_bytes": a_flotante(fields[17]),
            "resp_pkts": a_flotante(fields[18]),
            "resp_ip_bytes": a_flotante(fields[19])
        }

        # Filtramos puertos ignorados usando el nombre correcto
        if payload['resp_p'] in [8000, 123]:
            continue

        try:
            # 1. FIX: Enviamos el payload como lista (Batch API)
            response = requests.post(API_URL, json=[payload], timeout=3)
            resp_json = response.json()

            # Validación de error 422 Unprocessable Entity
            if response.status_code != 200:
                print(f"[-] Error de formato (HTTP {response.status_code}): {resp_json}")
                continue

            # 2. FIX: Extraer del nuevo formato "results"
            if "results" in resp_json and len(resp_json["results"]) > 0:
                resultado = resp_json["results"][0]

                # Construimos el diccionario de salida
                salida_formateada = {
                    'origen': resp_json.get('origen', 'CAPA_RED'),
                    'prob_red_cruda': resultado.get('prob_red_cruda', 0.0),
                    'prob_fusion_xdr': resultado.get('prob_fusion_xdr', 0.0),
                    'Puerto': payload['resp_p'],
                    'accion': resultado.get('accion', 'Error')
                }
            else:
                # Si por alguna razón responde 200 pero sin array de results
                salida_formateada = {
                    'origen': 'CAPA_RED', 'prob_red_cruda': 0.0, 'prob_fusion_xdr': 0.0,
                    'Puerto': payload['resp_p'], 'accion': 'Error'
                }

            # Imprimimos la línea de diagnóstico
            print(f"Respuesta RED: {salida_formateada}")

        except Exception as e:
            print(f"Error enviando a API: {e}")