import os
import time
import json
import logging
from transformer import extract_features
from client_api import MLClient
from repository import XDRRepository

# ==========================================
# CONFIGURACIÓN (Variables de Entorno)
# ==========================================
ZEEK_LOG_PATH = os.getenv("ZEEK_LOG_PATH", "conn.log")
API_URL = os.getenv("API_URL", "http://localhost:8000/api/v1/analyze")

DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "port":     os.getenv("DB_PORT", "5432"),
    "dbname":   os.getenv("DB_NAME", "postgres"),
    "user":     os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASS", "postgres")
}

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def parse_line(line, headers):
    """Convierte una línea de Zeek (TSV o JSON) a diccionario."""
    line = line.strip()
    if not line: return None
    
    if line.startswith('{'):
        try: return json.loads(line)
        except: return None
    elif headers:
        parts = line.split('\t')
        if len(parts) == len(headers):
            return dict(zip(headers, parts))
    return None

def main():
    logging.info(f"Iniciando Colector XDR Modular. Monitoreando: {ZEEK_LOG_PATH}")
    
    # Inicializar componentes
    client = MLClient(API_URL)
    repo = XDRRepository(DB_CONFIG)
    headers = []

    if not os.path.exists(ZEEK_LOG_PATH):
        open(ZEEK_LOG_PATH, 'w').close()

    with open(ZEEK_LOG_PATH, 'r') as f:
        while True:
            line = f.readline()
            if not line:
                time.sleep(0.5)
                continue

            if line.startswith('#'):
                if line.startswith('#fields'):
                    headers = line.split('\t')[1:]
                continue

            entry = parse_line(line, headers)
            if not entry: continue

            # 1. Transformación (transformer.py)
            features = extract_features(entry)
            if not features: continue

            # 2. Análisis (client_api.py)
            orig_ip = entry.get("id.orig_h")
            resp_ip = entry.get("id.resp_h")
            resp_p = int(entry.get("id.resp_p", 0))
            ml_result = client.analyze(orig_ip, resp_p, features)

            # 3. Persistencia (repository.py)
            proto_map = {'tcp': 6, 'udp': 17, 'icmp': 1}
            proto_num = proto_map.get(entry.get("proto", "tcp"), 0)
            
            repo.save_flow_and_alert(
                entry, features, ml_result, 
                orig_ip, resp_ip, int(entry.get("id.orig_p", 0)), resp_p, proto_num
            )
            
            status = "ANOMALÍA" if ml_result.get("es_anomalia") else "OK"
            logging.info(f"[{status}] {orig_ip} -> {resp_ip}:{resp_p} | Prob: {ml_result.get('detalles_rf', {}).get('probabilidad', 0):.4f}")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logging.info("Deteniendo Colector XDR...")
