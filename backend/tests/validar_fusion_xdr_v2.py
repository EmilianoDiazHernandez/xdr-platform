import requests
import time
import uuid

BASE_URL = "http://localhost:8000/api/v1"

def test_xdr_fusion():
    print("="*60)
    print("VALIDACIÓN DE FUSIÓN XDR (BATCH API)")
    print("="*60)

    # 1. Simular Evento de RED (IP Atacante: 10.0.0.50)
    # ---------------------------------------------------------
    print("\n[PASO 1] Enviando Evento de RED (DDoS)...")
    ip_atacante = "10.0.0.50"
    zeek_log = {
        "ts": time.time(),
        "uid": str(uuid.uuid4()),
        "orig_ip": ip_atacante,
        "resp_ip": "192.168.1.10",
        "orig_p": 45678,
        "resp_p": 80,
        "proto": "tcp",
        "conn_state": "S0",
        "history": "S",
        "orig_pkts": 5000,
        "orig_ip_bytes": 250000,
        "Flow_Duration": 1000.0,
        "Subflow_Fwd_Bytes": 200000.0,
        "Subflow_Fwd_Packets": 5000.0
    }

    try:
        # Enviamos como BATCH (lista)
        r_red = requests.post(f"{BASE_URL}/analyze-network", json=[zeek_log], timeout=10)
        res_red = r_red.json()["results"][0]
        print(f"  -> Prob RED: {res_red['prob_red_cruda']:.4f}")
        print(f"  -> Prob Fusión (Inicial): {res_red['prob_fusion_xdr']:.4f}")
        print(f"  -> Acción: {res_red['accion']}")
    except Exception as e:
        print(f"  [ERROR] Falló el paso de RED: {e}")
        return

    # 2. Simular Evento de ENDPOINT (Mismo Host/IP)
    # ---------------------------------------------------------
    print("\n[PASO 2] Enviando Evento de ENDPOINT (Powershell Malicioso) para el mismo Host...")
    sysmon_log = {
        "host": "DESKTOP-ATACANTE",
        "ip_local": ip_atacante,
        "EventID": 1,
        "proceso": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        "proceso_padre": "C:\\Windows\\explorer.exe",
        "cmd": "powershell.exe -nop -w hidden -EncodedCommand JABzAD0ATgBlAHcA",
        "hashes": "SHA256=..."
    }

    try:
        # Enviamos como BATCH (lista)
        r_edr = requests.post(f"{BASE_URL}/analyze-endpoint", json=[sysmon_log], timeout=10)
        res_edr = r_edr.json()["results"][0]
        print(f"  -> Prob EDR: {res_edr['prob_edr_cruda']:.4f}")
        print(f"  -> Prob Fusión (Cruzada): {res_edr['prob_fusion_xdr']:.4f}")
        print(f"  -> Acción: {res_edr['accion']}")
        
        # Validación de la lógica de Fusión
        if res_edr['prob_fusion_xdr'] > res_edr['prob_edr_cruda']:
            print("\n[RESULTADO] ¡EXITO! La Fusión XDR aumentó el score basado en la correlación de RED previa.")
        else:
            print("\n[RESULTADO] AVISO: El score de fusión no aumentó. Verifique la latencia de Redis o la lógica de pesos.")

    except Exception as e:
        print(f"  [ERROR] Falló el paso de EDR: {e}")

if __name__ == "__main__":
    # Verificar si el server está arriba
    try:
        requests.get("http://localhost:8000/health", timeout=2)
        test_xdr_fusion()
    except:
        print("ERROR: El servidor FastAPI no está corriendo en localhost:8000.")
        print("Inicie el backend antes de ejecutar esta validación.")
