from pydantic import BaseModel, ConfigDict

class ZeekLog(BaseModel):
    orig_ip: str
    resp_ip: str = "0.0.0.0"
    duration: float = 0.0
    orig_bytes: float = 0.0
    resp_bytes: float = 0.0
    missed_bytes: float = 0.0
    orig_pkts: float = 0.0
    orig_ip_bytes: float = 0.0
    resp_pkts: float = 0.0
    resp_ip_bytes: float = 0.0
    id_resp_p: int = 0
    proto: str = "-"
    conn_state: str = "-"
    service: str = "-"
    local_orig: str = "F"
    local_resp: str = "F"
    history: str = "-"
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
