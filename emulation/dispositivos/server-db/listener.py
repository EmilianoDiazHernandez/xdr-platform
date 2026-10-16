import os
import socket
import threading
import time
import logging
from collections import deque
import uvicorn
from fastapi import FastAPI

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

DEVICE_HOSTNAME = os.getenv("DEVICE_HOSTNAME", "SRV-DB-INTERNAL")
DEVICE_IP = os.getenv("DEVICE_IP", "10.20.30.50")

connection_log = deque(maxlen=100)

def handle_postgres_client(conn, addr):
    try:
        data = conn.recv(1024)
        connection_log.append({
            "service": "postgres",
            "port": 5432,
            "remote_ip": addr[0],
            "remote_port": addr[1],
            "timestamp": time.time(),
            "bytes_received": len(data)
        })
        logging.info(f"[POSTGRES :5432] Conexión de {addr[0]}:{addr[1]} ({len(data)} bytes)")
        # Responder con 'N' (SSL not supported) o mensaje dummy de PostgreSQL
        conn.sendall(b"N")
        time.sleep(0.1)
    except Exception as e:
        logging.debug(f"Postgres handler error: {e}")
    finally:
        try: conn.close()
        except: pass

def handle_smb_client(conn, addr):
    try:
        data = conn.recv(1024)
        connection_log.append({
            "service": "smb",
            "port": 445,
            "remote_ip": addr[0],
            "remote_port": addr[1],
            "timestamp": time.time(),
            "bytes_received": len(data)
        })
        logging.info(f"[SMB :445] Conexión de {addr[0]}:{addr[1]} ({len(data)} bytes)")
        # Respuesta dummy SMB
        smb_resp = b"\x00\x00\x00\x23\xff\x53\x4d\x42\x72\x00\x00\x00\x00\x18\x01\x48"
        conn.sendall(smb_resp)
        time.sleep(0.1)
    except Exception as e:
        logging.debug(f"SMB handler error: {e}")
    finally:
        try: conn.close()
        except: pass

def start_tcp_listener(port: int, handler_fn):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("0.0.0.0", port))
    s.listen(20)
    logging.info(f"Listener TCP activo en puerto {port}")
    while True:
        try:
            conn, addr = s.accept()
            t = threading.Thread(target=handler_fn, args=(conn, addr), daemon=True)
            t.start()
        except Exception as e:
            logging.error(f"Error aceptando conexión en puerto {port}: {e}")

api = FastAPI(title="Database Server Diagnostics")

@api.get("/health")
def health():
    return {
        "status": "ok",
        "device": "server-db",
        "hostname": socket.gethostname(),
        "device_hostname": DEVICE_HOSTNAME,
        "device_ip": DEVICE_IP,
        "listening_ports": [5432, 445]
    }

@api.get("/api/connections")
def get_connections():
    return {
        "total_recorded": len(connection_log),
        "recent_connections": list(connection_log)
    }

if __name__ == "__main__":
    t_pg = threading.Thread(target=start_tcp_listener, args=(5432, handle_postgres_client), daemon=True)
    t_smb = threading.Thread(target=start_tcp_listener, args=(445, handle_smb_client), daemon=True)
    t_pg.start()
    t_smb.start()
    
    # Iniciar API en 0.0.0.0:8050
    uvicorn.run(api, host="0.0.0.0", port=8050)
