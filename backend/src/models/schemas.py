from pydantic import BaseModel, ConfigDict

class ZeekLog(BaseModel):
    # Metadatos de Zeek
    ts: float = 0.0
    uid: str = "unknown"
    
    # Identidad de Red (Campos originales de Zeek)
    orig_ip: str         # id.orig_h
    resp_ip: str         # id.resp_h
    orig_p: int = 0      # id.orig_p
    resp_p: int = 0      # id.resp_p
    proto: str = "tcp"
    service: str = "-"
    conn_state: str = "-"
    history: str = "-"
    
    # Métricas de Tráfico (Raw)
    duration: float = 0.0
    orig_bytes: float = 0.0
    resp_bytes: float = 0.0
    missed_bytes: float = 0.0
    orig_pkts: float = 0.0
    resp_pkts: float = 0.0
    orig_ip_bytes: float = 0.0
    resp_ip_bytes: float = 0.0
    local_orig: str = "F"
    local_resp: str = "F"

    # CICFlowMeter Features (Calculadas por el sensor o el backend)
    Flow_Duration: float = 0.0
    Flow_Bytes_s: float = 0.0
    Flow_Packets_s: float = 0.0
    Subflow_Fwd_Bytes: float = 0.0
    Subflow_Bwd_Bytes: float = 0.0
    Subflow_Fwd_Packets: float = 0.0
    act_data_pkt_fwd: float = 0.0
    Fwd_Header_Length: float = 0.0
    Bwd_Header_Length: float = 0.0
    Fwd_Packet_Length_Max: float = 0.0
    Bwd_Packet_Length_Max: float = 0.0
    Bwd_Packet_Length_Min: float = 0.0
    Down_Up_Ratio: float = 0.0
    Average_Packet_Size: float = 0.0

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

class SysmonLog(BaseModel):
    host: str
    ip_local: str
    EventID: int
    proceso: str
    proceso_padre: str
    cmd: str
    hashes: str = ""

class EmailLog(BaseModel):
    host: str
    ip_local: str
    texto_completo: str
    urls_extraidas: list[str] = []
    num_adjuntos: int = 0
    tiene_adjunto_sospechoso: int = 0
    zip_con_exe: int = 0
    num_links: int = 0
    num_dominios_unicos: int = 0
    dominio_raro: int = 0
    tiene_url_sospechosa: int = 0
    url_con_ip: int = 0
    mismatch_link: int = 0
    tiene_url_acortada: int = 0
    tiene_html: int = 0
    html_oculto: int = 0
    tiene_iframe: int = 0
    tiene_script: int = 0
    score_phishing_keywords: int = 0
    reply_to_diferente: int = 0
    display_name_spoofing: int = 0
    spf_fail: int = 0
    dkim_fail: int = 0
    entropia_texto: float = 0.0
    score_heuristico: int = 0
    url_larga: int = 0
    subdominios_altos: int = 0

class AttackFlowStep(BaseModel):
    step_order: int
    timestamp: str
    vector: str
    anomaly_score: float
    description: str
