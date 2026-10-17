"""
Script de validación benigna de conectividad HTTP inter-contenedor y visibilidad de Zeek.

Este script es estrictamente de solo lectura y no destructivo.
Realiza una única petición GET benigna al endpoint /health del servicio api-ml
a través de la red interna de Docker 'xdr-network'.
No dispara emulaciones, no ejecuta ataques ni modifica datos en la plataforma.
"""

import sys
import time
import json
import uuid

def main():
    test_id = f"val-infra-{int(time.time())}-{uuid.uuid4().hex[:6]}"
    target_url = f"http://api-ml:8000/health?test_id={test_id}"
    
    print(f"[*] Iniciando prueba controlada de comunicacion benigna...")
    print(f"[*] Destino: {target_url}")
    print(f"[*] Test ID: {test_id}")
    
    t0 = time.time()
    try:
        import requests
    except ImportError:
        print("[-] Error: 'requests' no esta instalado en este interprete.")
        sys.exit(1)
        
    try:
        response = requests.get(target_url, timeout=5.0)
        t1 = time.time()
        
        result = {
            "test_id": test_id,
            "target_url": target_url,
            "start_time": t0,
            "end_time": t1,
            "duration_s": round(t1 - t0, 4),
            "status_code": response.status_code,
            "response_body": response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
        }
        
        print("\n[+] Resultado de conectividad HTTP:")
        print(json.dumps(result, indent=2))
        
        if response.status_code == 200:
            print("\n[OK] Conectividad HTTP confirmada exitosamente.")
        else:
            print(f"\n[!] Codigo de respuesta inesperado: {response.status_code}")
            
    except requests.exceptions.RequestException as e:
        print(f"\n[-] Error conectando con el servicio destino: {e}")
        sys.exit(2)

if __name__ == "__main__":
    main()
