import os
import time
import json
import logging
from transformer import extract_features
from client_api import MLClient

# ==========================================
# CONFIGURACIÓN (Variables de Entorno)
# ==========================================
ZEEK_LOG_PATH = os.getenv("ZEEK_LOG_PATH", "conn.log")
API_URL = os.getenv("API_URL", "http://localhost:8000/api/v1/analyze-network")
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "50"))

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
    logging.info(f"Iniciando Colector XDR Batch. Monitoreando: {ZEEK_LOG_PATH} | Batch Size: {BATCH_SIZE}")
    
    # Inicializar componentes
    client = MLClient(API_URL)
    headers = []
    batch = []

    if not os.path.exists(ZEEK_LOG_PATH):
        open(ZEEK_LOG_PATH, 'w').close()

    with open(ZEEK_LOG_PATH, 'r') as f:
        while True:
            line = f.readline()
            
            # Si no hay línea, procesar batch pendiente y esperar
            if not line:
                if batch:
                    client.analyze_batch(batch)
                    logging.info(f"[BATCH_FLUSH] Procesados {len(batch)} logs pendientes.")
                    batch = []
                time.sleep(0.1)
                continue

            if line.startswith('#'):
                if line.startswith('#fields'):
                    headers = line.split('\t')[1:]
                continue

            entry = parse_line(line, headers)
            if not entry: continue

            features = extract_features(entry)
            if not features: continue

            # Acumular en el batch
            batch.append((entry, features))

            # Si el batch está lleno, enviar
            if len(batch) >= BATCH_SIZE:
                results = client.analyze_batch(batch)
                anomalies = sum(1 for r in results if r.get("accion") != "PERMITIR")
                logging.info(f"[BATCH_SEND] Enviados {len(batch)} logs | Anomalías detectadas: {anomalies}")
                batch = []

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logging.info("Deteniendo Colector XDR...")
