import requests
import numpy as np
import time
import random

BASE_URL = "http://localhost:8000"

# ============================================================
# 1. GENERADORES DE MUESTRAS
# ============================================================
def generar_muestras_red(plantilla, n, variacion=0.3, variar_categoricas=False):
    """Para RED: valores continuos, puede dejar floats."""
    muestras = []
    for _ in range(n):
        m = plantilla.copy()
        for k, v in plantilla.items():
            if isinstance(v, (int, float)) and v > 0:
                factor = np.random.uniform(1 - variacion, 1 + variacion)
                m[k] = max(0, v * factor)
        if variar_categoricas and random.random() < 0.2:
            if 'conn_state' in m:
                m['conn_state'] = random.choice(['S0', 'S1', 'REJ', 'SF', 'SHR'])
            if 'history' in m:
                m['history'] = random.choice(['S', 'Sr', 'ShADTfr', 'Dd', 'R', 'A'])
        muestras.append(m)
    return muestras

def generar_muestras_email(plantilla, n, variacion=0.1):
    """Para EMAIL: redondea los enteros después de la variación."""
    muestras = []
    for _ in range(n):
        m = plantilla.copy()
        for k, v in plantilla.items():
            if isinstance(v, (int, float)) and v > 0:
                factor = np.random.uniform(1 - variacion, 1 + variacion)
                valor = v * factor
                if isinstance(v, int):
                    # Redondear al entero más cercano y asegurar que sea entero
                    m[k] = int(round(max(0, valor)))
                else:
                    m[k] = max(0, valor)
        muestras.append(m)
    return muestras

# ============================================================
# 2. PLANTILLAS DE TRAFICO RED (Zeek nativo)
# ============================================================
PLANTILLA_DDOS = {
    "duration": 0.001, "orig_bytes": 0, "resp_bytes": 0, "missed_bytes": 0,
    "orig_pkts": 5, "orig_ip_bytes": 200, "resp_pkts": 0, "resp_ip_bytes": 0,
    "proto": "tcp", "conn_state": "S0", "service": "-", "history": "S",
    "local_orig": "T", "local_resp": "F"
}

PLANTILLA_PORTSCAN = {
    "duration": 0.0001, "orig_bytes": 0, "resp_bytes": 0, "missed_bytes": 0,
    "orig_pkts": 1, "orig_ip_bytes": 40, "resp_pkts": 1, "resp_ip_bytes": 40,
    "proto": "tcp", "conn_state": "REJ", "service": "-", "history": "Sr",
    "local_orig": "T", "local_resp": "F"
}

PLANTILLA_NORMAL_RED = {
    "duration": 5.4, "orig_bytes": 1500, "resp_bytes": 3500, "missed_bytes": 0,
    "orig_pkts": 15, "orig_ip_bytes": 2100, "resp_pkts": 12, "resp_ip_bytes": 4500,
    "proto": "udp", "conn_state": "SF", "service": "dns", "history": "Dd",
    "local_orig": "T", "local_resp": "T"
}

# ============================================================
# 3. PLANTILLAS DE EMAIL
# ============================================================
PLANTILLA_PHISHING = {
    "texto_completo": "URGENT: Your account has been compromised. Click here to verify your identity immediately.",
    "urls_extraidas": ["http://secure-login-update-account.com/auth"],
    "num_adjuntos": 0, "tiene_adjunto_sospechoso": 0, "zip_con_exe": 0,
    "num_links": 1, "num_dominios_unicos": 1, "dominio_raro": 1,
    "tiene_url_sospechosa": 1, "url_con_ip": 0, "mismatch_link": 1,
    "tiene_url_acortada": 0, "tiene_html": 1, "html_oculto": 0,
    "tiene_iframe": 0, "tiene_script": 0, "score_phishing_keywords": 4,
    "reply_to_diferente": 1, "display_name_spoofing": 1,
    "spf_fail": 1, "dkim_fail": 1, "entropia_texto": 4.8,
    "score_heuristico": 85, "url_larga": 1, "subdominios_altos": 1
}

PLANTILLA_NORMAL_EMAIL = {
    "texto_completo": "Hi team, attached is the sales report for this week. Please review it and let me know your thoughts. Best regards.",
    "urls_extraidas": [],
    "num_adjuntos": 0, "tiene_adjunto_sospechoso": 0, "zip_con_exe": 0,
    "num_links": 0, "num_dominios_unicos": 0, "dominio_raro": 0,
    "tiene_url_sospechosa": 0, "url_con_ip": 0, "mismatch_link": 0,
    "tiene_url_acortada": 0, 
    "tiene_html": 0,             # 🔥 FIX: El HAM de Enron era texto plano (0)
    "html_oculto": 0, "tiene_iframe": 0, "tiene_script": 0, 
    "score_phishing_keywords": 0, "reply_to_diferente": 0, 
    "display_name_spoofing": 0, "spf_fail": 0, "dkim_fail": 0, 
    "entropia_texto": 0.0,       # 🔥 FIX: Enron se hardcodeó en 0.0
    "score_heuristico": 0, "url_larga": 0, "subdominios_altos": 0
}
# ============================================================
# 3b. PLANTILLAS PARA ENDPOINT (EDR)
# ============================================================
PLANTILLA_MALICIOSO = {
    "host": "VICTIM-PC",
    "ip_local": "192.168.1.100",
    "EventID": 1,
    "proceso": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    "proceso_padre": "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE",
    "cmd": "powershell.exe -nop -w hidden -EncodedCommand JABzAD0ATgBlAHcA",
    "hashes": ""
}

PLANTILLA_BENIGNO = {
    "host": "WORKSTATION-01",
    "ip_local": "192.168.1.100",
    "EventID": 1,
    "proceso": "C:\\Windows\\System32\\notepad.exe",
    "proceso_padre": "C:\\Windows\\explorer.exe",
    "cmd": "notepad.exe C:\\Users\\user\\documento.txt",
    "hashes": ""
}

def generar_muestras_edr(plantilla, n, variacion_texto=False):
    """Genera muestras para EDR variando ligeramente los comandos y rutas."""
    muestras = []
    for i in range(n):
        m = plantilla.copy()
        if variacion_texto:
            # Variar el host y la IP para simular diferentes equipos
            m['host'] = f"{plantilla['host']}-{i}"
            m['ip_local'] = f"192.168.1.{100 + i}"
            # Si es malicioso, añadir variación al comando (sin romper la detección)
            if "powershell" in m['cmd']:
                m['cmd'] = m['cmd'].replace("-EncodedCommand", "-Enc")
            # Si es benigno, cambiar el nombre del archivo
            if "notepad" in m['cmd']:
                m['cmd'] = m['cmd'].replace("documento.txt", f"doc_{i}.txt")
        muestras.append(m)
    return muestras

# Generar lotes de muestras EDR (20 cada uno)
muestras_edr = {
    'Malicioso': generar_muestras_edr(PLANTILLA_MALICIOSO, 20, variacion_texto=True),
    'Benigno':   generar_muestras_edr(PLANTILLA_BENIGNO, 20, variacion_texto=True),
}

def enviar_edr(row_dict, ip=None, host=None):
    payload = row_dict.copy()
    if ip:
        payload['ip_local'] = ip
    if host:
        payload['host'] = host
    headers = {"X-Sensor-ID": f"sysmon-{payload['host']}"}
    try:
        r = requests.post(f"{BASE_URL}/api/v1/analyze-endpoint", json=payload, headers=headers, timeout=5)
        if r.status_code == 200:
            d = r.json()
            return d.get('accion','PERMITIR'), d.get('prob_edr_cruda',0.0), d.get('prob_fusion_xdr',0.0)
        elif r.status_code == 429:
            time.sleep(2)
    except Exception:
        pass
    return 'PERMITIR', 0.0, 0.0

def evaluar_edr(nombre, lista_muestras, debe_bloquear):
    print(f"\n  Evaluando ENDPOINT: {nombre}")
    aciertos, probs = 0, []
    for i, row in enumerate(lista_muestras):
        # Asignar IP y host dinámicos para evitar caché de Redis
        ip = f"10.10.{i%254}.{i%254}"
        host = f"{row['host']}-{i}"
        accion, prob_edr, _ = enviar_edr(row, ip, host)
        # Las acciones de bloqueo son: "BLOQUEAR_PROCESO" o "AISLAMIENTO_TOTAL_DEL_HOST"
        es_alerta = accion in ["BLOQUEAR_PROCESO", "AISLAMIENTO_TOTAL_DEL_HOST"]
        probs.append(prob_edr)
        if es_alerta == debe_bloquear:
            aciertos += 1
    estado = "BLOQUEADOS" if debe_bloquear else "PERMITIDOS"
    icono = "OK" if aciertos == len(lista_muestras) else ("~" if aciertos > len(lista_muestras)*0.8 else "X")
    promedio = np.mean(probs) if probs else 0.0
    print(f"    [{icono}] {aciertos}/{len(lista_muestras)} {estado}  prob_edr_promedio={promedio:.3f}")

# ============================================================
# 4. GENERAR LOTES DE MUESTRAS
# ============================================================
muestras_red = {
    'DDoS':     generar_muestras_red(PLANTILLA_DDOS, 20, variacion=0.3, variar_categoricas=True),
    'PortScan': generar_muestras_red(PLANTILLA_PORTSCAN, 20, variacion=0.3, variar_categoricas=True),
    'Normal':   generar_muestras_red(PLANTILLA_NORMAL_RED, 20, variacion=0.2, variar_categoricas=False),
}

muestras_email = {
    'Phishing': generar_muestras_email(PLANTILLA_PHISHING, 20, variacion=0.1),
    'Normal':   generar_muestras_email(PLANTILLA_NORMAL_EMAIL, 20, variacion=0.1),
}

# ============================================================
# 5. FUNCIONES DE ENVÍO
# ============================================================
def enviar_red(row_dict, ip, ruido=0.0):
    payload = row_dict.copy()
    payload['orig_ip'] = ip
    if ruido > 0:
        for k, v in payload.items():
            if isinstance(v, (int, float)) and v > 0:
                payload[k] = max(0.0, v + v * np.random.uniform(-ruido, ruido))

    headers = {"X-Sensor-ID": f"simulador-{ip}"}
    try:
        r = requests.post(f"{BASE_URL}/api/v1/analyze-network", json=payload, headers=headers, timeout=5)
        if r.status_code == 200:
            d = r.json()
            return d.get('accion','PERMITIR'), d.get('prob_red_cruda',0.0), d.get('prob_fusion_xdr',0.0)
        elif r.status_code == 429:
            time.sleep(2)
    except Exception:
        pass
    return 'PERMITIR', 0.0, 0.0

def enviar_email(row_dict, ip, host):
    payload = row_dict.copy()
    payload['ip_local'] = ip
    payload['host'] = host
    headers = {"X-Sensor-ID": f"mail-{host}"}
    try:
        r = requests.post(f"{BASE_URL}/api/v1/analyze-email", json=payload, headers=headers, timeout=5)
        if r.status_code == 200:
            d = r.json()
            return d.get('accion','PERMITIR'), d.get('prob_phishing',0.0), d.get('prob_fusion_xdr',0.0)
        else:
            print(f"Error {r.status_code}: {r.text}")
            return 'PERMITIR', 0.0, 0.0
    except Exception as e:
        print(f"Excepción: {e}")
        return 'PERMITIR', 0.0, 0.0

# ============================================================
# 6. EVALUACIÓN DE CAPAS
# ============================================================
def evaluar_red(nombre, lista_muestras, ip_base, debe_bloquear, ruido=0.0):
    tag = f" ({ruido*100:.0f}% ruido)" if ruido else ""
    print(f"\n  Evaluando RED: {nombre}{tag}")
    aciertos, probs = 0, []
    for i, row in enumerate(lista_muestras):
        ip = f"{ip_base}.{i+10}"
        accion, prob_red, _ = enviar_red(row, ip, ruido)
        es_alerta = accion in ["BLOQUEAR_IP_Y_HOST", "ALERTA"]
        probs.append(prob_red)
        if es_alerta == debe_bloquear:
            aciertos += 1
    estado = "BLOQUEADOS" if debe_bloquear else "PERMITIDOS"
    icono = "OK" if aciertos == len(lista_muestras) else ("~" if aciertos > len(lista_muestras)*0.8 else "X")
    promedio = np.mean(probs) if probs else 0.0
    print(f"    [{icono}] {aciertos}/{len(lista_muestras)} {estado}  prob_red_promedio={promedio:.3f}")

def evaluar_email(nombre, lista_muestras, ip_base, debe_bloquear):
    print(f"\n  Evaluando EMAIL: {nombre}")
    aciertos, probs = 0, []
    for i, row in enumerate(lista_muestras):
        ip = f"{ip_base}.{i+10}"
        host = f"USER-{i+10}"
        accion, prob_phish, _ = enviar_email(row, ip, host)
        es_alerta = accion != "PERMITIR"
        probs.append(prob_phish)
        if es_alerta == debe_bloquear:
            aciertos += 1
    estado = "BLOQUEADOS" if debe_bloquear else "PERMITIDOS"
    icono = "OK" if aciertos == len(lista_muestras) else ("~" if aciertos > len(lista_muestras)*0.8 else "X")
    promedio = np.mean(probs) if probs else 0.0
    print(f"    [{icono}] {aciertos}/{len(lista_muestras)} {estado}  prob_phish_promedio={promedio:.3f}")

# ============================================================
# 7. PRUEBA DE CORRELACIÓN (SOLO RED + ENDPOINT)
# ============================================================
def prueba_correlacion():
    print("\n" + "="*55)
    print("PRUEBA DE CORRELACIÓN: RED + ENDPOINT (sin EMAIL)")
    print("="*55)
    
    sufijo = int(time.time() % 1000)

    # ---------------------------------------------------------
    # ESCENARIO 1: DDoS detectado en RED y proceso malicioso en EDR
    # ---------------------------------------------------------
    print("Escenario 1: DDoS (RED) + Proceso Malicioso (EDR) [0% Ruido]")
    IP_ATACANTE = f"10.99.{sufijo % 255}.1"
    HOST = f"VICTIM-{sufijo}"

    muestra_ddos = generar_muestras_red(PLANTILLA_DDOS, 1, variacion=0.2)[0]
    muestra_ddos['orig_ip'] = IP_ATACANTE
    accion_red, prob_red, fusion_red = enviar_red(muestra_ddos, IP_ATACANTE, ruido=0.0)
    print(f"  [RED]    IP={IP_ATACANTE} prob_red={prob_red:.4f} fusion={fusion_red:.4f} accion={accion_red}")

    payload_edr = {
        "host": HOST, "ip_local": IP_ATACANTE, "EventID": 1,
        "proceso": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        "proceso_padre": "C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE",
        "cmd": "powershell.exe -nop -w hidden -EncodedCommand JABzAD0ATgBlAHcA", "hashes": ""
    }
    try:
        r = requests.post(f"{BASE_URL}/api/v1/analyze-endpoint", json=payload_edr, headers={"X-Sensor-ID": f"sysmon-{HOST}"})
        if r.status_code == 200:
            d = r.json()
            prob_edr = d.get('prob_edr_cruda', 0.0); fusion_edr = d.get('prob_fusion_xdr', 0.0)
            print(f"  [EDR]    Host={HOST} prob_edr={prob_edr:.4f} fusion={fusion_edr:.4f} accion={d.get('accion')}")
            if fusion_edr > prob_red and fusion_edr > prob_edr:
                print("  [OK] Fusión RED+EDR aumentó la probabilidad correctamente.\n")
    except Exception as e: print(f"  [EDR]    Error: {e}")

    # ---------------------------------------------------------
    # ESCENARIO 2: Tráfico Normal (RED) + Proceso Malicioso (EDR)
    # ---------------------------------------------------------
    print("Escenario 2: Tráfico Normal (RED) + Proceso Malicioso (EDR)")
    IP_ESC2 = f"10.88.{sufijo % 255}.2"
    HOST_ESC2 = f"VICTIM-ESC2-{sufijo}"

    accion_red_esc2, prob_red_esc2, fusion_red_esc2 = enviar_red(muestras_red['Normal'][0], IP_ESC2, ruido=0.0)
    print(f"  [RED]    IP={IP_ESC2} prob_red={prob_red_esc2:.4f} fusion={fusion_red_esc2:.4f} accion={accion_red_esc2}")

    payload_edr_esc2 = payload_edr.copy()
    payload_edr_esc2.update({"host": HOST_ESC2, "ip_local": IP_ESC2})
    try:
        r = requests.post(f"{BASE_URL}/api/v1/analyze-endpoint", json=payload_edr_esc2, headers={"X-Sensor-ID": f"sysmon-{HOST_ESC2}"})
        if r.status_code == 200:
            d = r.json()
            print(f"  [EDR]    Host={HOST_ESC2} prob_edr={d.get('prob_edr_cruda', 0.0):.4f} fusion={d.get('prob_fusion_xdr', 0.0):.4f} accion={d.get('accion')}")
            print("  [OK] El XDR evaluó la amenaza basándose mayormente en el EDR (Red silenciosa).\n")
    except Exception as e: print(f"  [EDR]    Error: {e}")

    # ---------------------------------------------------------
    # ESCENARIO 3: DDoS (RED) + Proceso Malicioso (EDR) [20% Ruido]
    # ---------------------------------------------------------
    print("Escenario 3: DDoS en RED (20% Ruido) + Proceso Malicioso (EDR)")
    IP_ESC3 = f"10.77.{sufijo % 255}.3"
    HOST_ESC3 = f"VICTIM-ESC3-{sufijo}"

    muestra_ddos_esc3 = generar_muestras_red(PLANTILLA_DDOS, 1, variacion=0.2)[0]
    muestra_ddos_esc3['orig_ip'] = IP_ESC3
    # 🔥 APLICANDO 20% DE RUIDO A LA RED
    accion_red_esc3, prob_red_esc3, fusion_red_esc3 = enviar_red(muestra_ddos_esc3, IP_ESC3, ruido=0.20)
    print(f"  [RED]    IP={IP_ESC3} prob_red={prob_red_esc3:.4f} fusion={fusion_red_esc3:.4f} accion={accion_red_esc3}")

    payload_edr_esc3 = payload_edr.copy()
    payload_edr_esc3.update({"host": HOST_ESC3, "ip_local": IP_ESC3})
    try:
        r = requests.post(f"{BASE_URL}/api/v1/analyze-endpoint", json=payload_edr_esc3, headers={"X-Sensor-ID": f"sysmon-{HOST_ESC3}"})
        if r.status_code == 200:
            d = r.json()
            prob_edr_esc3 = d.get('prob_edr_cruda', 0.0); fusion_edr_esc3 = d.get('prob_fusion_xdr', 0.0)
            print(f"  [EDR]    Host={HOST_ESC3} prob_edr={prob_edr_esc3:.4f} fusion={fusion_edr_esc3:.4f} accion={d.get('accion')}")
            if fusion_edr_esc3 > prob_red_esc3 and fusion_edr_esc3 > prob_edr_esc3:
                print("  [OK] Fusión RED+EDR resistió la distorsión del 20% en la red.\n")
            else:
                print("  [REVISAR] La fusión falló con el ruido del 20%.\n")
    except Exception as e: print(f"  [EDR]    Error: {e}")

    # ---------------------------------------------------------
    # CONTRAPRUEBA (NEGATIVA)
    # ---------------------------------------------------------
    print("Contraprueba: Tráfico normal sin EDR → sin alerta")
    IP_LIMPIA = f"192.168.{sufijo % 255}.99"
    accion_red_limpia, prob_red_limpia, fusion_red_limpia = enviar_red(muestras_red['Normal'][0], IP_LIMPIA, ruido=0.0)
    print(f"  [RED]    IP={IP_LIMPIA} prob_red={prob_red_limpia:.4f} fusion={fusion_red_limpia:.4f} accion={accion_red_limpia}")
    if accion_red_limpia == "PERMITIR":
        print("  [OK] Tráfico normal no genera alerta.\n")

# ============================================================
# 8. EJECUCIÓN PRINCIPAL
# ============================================================
if __name__ == "__main__":
    print("="*55)
    print("VALIDACIÓN XDR MULTI-CAPA (NATIVO ZEEK)")
    print("="*55)

    try:
        h = requests.get(f"{BASE_URL}/health", timeout=3).json()
    except Exception:
        print("\nERROR: No se pudo conectar a la API. ¿Está uvicorn corriendo?")
        exit(1)

    print(f"\nEstado del sistema:")
    print(f"  Capa RED:      {'OK' if h['capas']['red']['activa'] else 'OFF'}")
    print(f"  Capa ENDPOINT: {'OK' if h['capas']['endpoint']['activa'] else 'OFF'}")
    print(f"  Capa EMAIL:    {'OK' if h['capas']['email']['activa'] else 'OFF'}")
    print(f"  Redis:         {'OK' if h['redis']['activo'] else 'OFF — correlación desactivada'}")

    if not h['capas']['red']['activa'] or not h['capas']['email']['activa']:
        print("\nERROR: Faltan capas esenciales. Revisa los logs de FastAPI.")
        exit(1)

    print("\n--- RONDA 1: CAPA RED (0% ruido) ---")
    evaluar_red("DDoS Volumétrico", muestras_red['DDoS'], "10.0.1", True, 0.0)
    evaluar_red("Escaneo de Puertos", muestras_red['PortScan'], "10.0.2", True, 0.0)
    evaluar_red("Tráfico Normal", muestras_red['Normal'], "192.168.1", False, 0.0)

    print("\n--- RONDA 2: CAPA RED (10% ruido) ---")
    evaluar_red("DDoS Volumétrico", muestras_red['DDoS'], "10.0.3", True, 0.10)
    evaluar_red("Tráfico Normal", muestras_red['Normal'], "192.168.2", False, 0.10)

    print("\n--- RONDA 3: CAPA EMAIL ---")
    evaluar_email("Campañas Phishing", muestras_email['Phishing'], "10.1.1", True)
    evaluar_email("Correos Legítimos", muestras_email['Normal'], "192.168.3", False)

    print("\n--- RONDA 4: CAPA ENDPOINT (EDR) ---")
    evaluar_edr("Procesos Maliciosos", muestras_edr['Malicioso'], True)
    evaluar_edr("Procesos Benignos", muestras_edr['Benigno'], False)

    # Prueba de correlación (solo RED+EDR)
    prueba_correlacion()

    print("\n=== DIAGNÓSTICO COMPLETADO ===")