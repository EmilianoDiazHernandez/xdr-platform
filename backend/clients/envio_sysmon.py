import win32evtlog
import xml.etree.ElementTree as ET
import requests
import socket
import time

# Configuración de tu FastAPI (El cerebro XDR)
API_HOST = "172.31.32.1" # IP de la máquina donde corre FastAPI
API_PORT = 8000
API_URL = f"http://{API_HOST}:{API_PORT}/api/v1/analyze-endpoint"

HOST = socket.gethostname()

# ==========================================
# 🔥 FIX ARQUITECTÓNICO: Obtener la IP real
# ==========================================
def obtener_ip_real():
    try:
        # Creamos un socket UDP (no envía nada, solo simula la ruta)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Nos "conectamos" a la API para ver qué interfaz elige Windows
        s.connect((API_HOST, API_PORT))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        # Plan de contingencia para tu TT: Hardcodea la IP de tu Windows víctima aquí
        return "172.31.32.144" 

IP_LOCAL = obtener_ip_real()

NS = {'ns': 'http://schemas.microsoft.com/win/2004/08/events/event'}

print(f"[*] Sensor Sysmon XDR iniciado en {HOST} ({IP_LOCAL})")
if IP_LOCAL == "127.0.0.1" or IP_LOCAL.startswith("169.254"):
    print("[!] ADVERTENCIA: La IP parece ser local o APIPA. La correlación XDR podría fallar.")

print("[*] Calibrando motor de lectura...")

last_record_id = 0

# 1. Obtener el ID del último evento para no procesar historial viejo
try:
    flags = win32evtlog.EvtQueryChannelPath | win32evtlog.EvtQueryReverseDirection
    query_handle = win32evtlog.EvtQuery('Microsoft-Windows-Sysmon/Operational', flags, "*[System[(EventID=1)]]")
    events = win32evtlog.EvtNext(query_handle, 1)
    if events:
        xml_content = win32evtlog.EvtRender(events[0], win32evtlog.EvtRenderEventXml)
        root = ET.fromstring(xml_content)
        record_id_element = root.find('.//ns:EventRecordID', NS)
        if record_id_element is not None:
            last_record_id = int(record_id_element.text)
except Exception as e:
    print(f"[-] Aviso al calibrar: {e}")

print("[*] ¡Motor listo! Esperando ejecución de nuevos procesos...")

# 2. Ciclo infinito de vigilancia (Polling)
while True:
    try:
        flags = win32evtlog.EvtQueryChannelPath | win32evtlog.EvtQueryReverseDirection
        query_handle = win32evtlog.EvtQuery('Microsoft-Windows-Sysmon/Operational', flags, "*[System[(EventID=1)]]")
        
        # Leemos los últimos 15 eventos
        events = win32evtlog.EvtNext(query_handle, 15)
        
        if events:
            # Los volteamos para procesarlos en orden cronológico correcto
            for event in reversed(events):
                xml_content = win32evtlog.EvtRender(event, win32evtlog.EvtRenderEventXml)
                root = ET.fromstring(xml_content)
                
                record_id_element = root.find('.//ns:EventRecordID', NS)
                record_id = int(record_id_element.text) if record_id_element is not None else 0
                
                # Si es un evento viejo, lo saltamos
                if record_id <= last_record_id:
                    continue
                    
                last_record_id = record_id

                # Extraer datos
                event_data = {}
                for data in root.findall('.//ns:Data', NS):
                    event_data[data.attrib.get('Name')] = data.text

                payload = {
                    "host": HOST,
                    "ip_local": IP_LOCAL,  # <- AHORA ESTA IP SÍ COINCIDE CON ZEEK
                    "EventID": 1,
                    "proceso": event_data.get('Image', ''),
                    "proceso_padre": event_data.get('ParentImage', ''),
                    "cmd": event_data.get('CommandLine', ''),
                    "hashes": event_data.get('Hashes', '')
                }

                if not payload["proceso"]: continue
                
                cmd_str = str(payload['cmd']).lower()
                proceso_lower = payload["proceso"].lower()
                
                # Exclusiones de tu máquina local
                exclusiones = [
                    "svchost.exe", "docker.exe", "code.exe", "git.exe",
                    "oh-my-posh.exe", "securityhealthhost.exe", "conhost.exe"
                ]

                if any(excluido in proceso_lower for excluido in exclusiones) or "envio_sysmon.py" in cmd_str:
                    continue

                try:
                    res = requests.post(API_URL, json=payload, timeout=3)
                    nombre_exe = payload['proceso'].split('\\')[-1]
                    
                    # Formato de consola SOC
                    resp_json = res.json()
                    prob_edr = resp_json.get('prob_edr_cruda', 0.0)
                    prob_fusion = resp_json.get('prob_fusion_xdr', 0.0)
                    accion = resp_json.get('accion', 'PERMITIR')
                    
                    print(f"\n[+] {nombre_exe} | IP: {IP_LOCAL}")
                    print(f"    Cmd: {payload['cmd']}")
                    print(f"    Respuesta EDR: {{'origen': 'CAPA_ENDPOINT', 'prob_edr_cruda': {prob_edr}, 'prob_fusion_xdr': {prob_fusion}, 'accion': '{accion}'}}")
                    
                except requests.exceptions.RequestException:
                    pass

    except Exception as e:
        print(f"[-] Error leyendo el log: {e}")
        time.sleep(2)
        
    time.sleep(0.5) # Pausa de 1 segundo entre lecturas