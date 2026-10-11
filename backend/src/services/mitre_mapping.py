from typing import Optional, Dict, Any

def get_network_mitre_mapping(port: int, proto: str):
    """
    Map Network protocol/port to a MITRE Sub-technique.
    Base technique is T1071 (Application Layer Protocol).
    """
    port_mapping = {
        80: ("T1071.001", "Command and Control - Web Protocols"),
        443: ("T1071.001", "Command and Control - Web Protocols"),
        8080: ("T1071.001", "Command and Control - Web Protocols"),
        53: ("T1071.004", "Command and Control - DNS"),
        21: ("T1071.002", "Command and Control - File Transfer Protocols"),
        22: ("T1071.002", "Command and Control - File Transfer Protocols"),
        25: ("T1071.003", "Command and Control - Mail Protocols"),
        587: ("T1071.003", "Command and Control - Mail Protocols"),
        445: ("T1570", "Lateral Movement - Lateral Tool Transfer"),
    }
    
    if port in port_mapping:
        return port_mapping[port][0], port_mapping[port][1]
    
    return "T1071", "Command and Control - Application Layer Protocol"

def get_edr_mitre_mapping(proceso: str, cmd: str):
    """
    Map EDR Process execution to a MITRE Sub-technique.
    Base technique is T1059 (Command and Scripting Interpreter).
    """
    if not proceso:
        return "T1059", "Execution - Command and Scripting Interpreter"
        
    proc_lower = proceso.lower()
    cmd_lower = cmd.lower() if cmd else ""
    
    if "powershell" in proc_lower or "pwsh" in proc_lower:
        return "T1059.001", "Execution - PowerShell"
    elif "cmd.exe" in proc_lower or "bat" in proc_lower:
        return "T1059.003", "Execution - Windows Command Shell"
    elif "wscript" in proc_lower or "cscript" in proc_lower or ".vbs" in cmd_lower:
        return "T1059.005", "Execution - Visual Basic"
    elif "python" in proc_lower:
        return "T1059.006", "Execution - Python"
    elif "sh" in proc_lower or "bash" in proc_lower:
        return "T1059.004", "Execution - Unix Shell"
    elif "wmic" in proc_lower:
        return "T1047", "Execution - Windows Management Instrumentation"
    else:
        return "T1059", "Execution - Command and Scripting Interpreter"

def get_email_mitre_mapping(num_maliciosas: int):
    """
    Map Email anomaly to a MITRE Sub-technique.
    Base technique is T1566 (Phishing).
    """
    if num_maliciosas > 0:
        return "T1566.002", "Initial Access - Spearphishing Link"
    return "T1566.001", "Initial Access - Spearphishing Attachment"

def get_mitre_software(file_hash: Optional[str] = None, process_name: Optional[str] = None, cmd: Optional[str] = None, otx_data: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """
    Identifica el identificador de software MITRE ATT&CK (Sxxxx) a partir de evidencias
    forenses de procesos, comandos o inteligencia de amenazas (OTX).
    Retorna None si no hay coincidencia fiable (sin invención arbitraria).
    """
    # Recolectar cadenas de búsqueda
    text_corpus = []
    if process_name:
        text_corpus.append(process_name.lower())
    if cmd:
        text_corpus.append(cmd.lower())
    if otx_data and isinstance(otx_data, dict):
        for ind in otx_data.get("indicators", []):
            if ind.get("name"):
                text_corpus.append(ind["name"].lower())
            for tag in ind.get("tags", []):
                text_corpus.append(str(tag).lower())
            for mw in ind.get("malware_families", []):
                text_corpus.append(str(mw).lower())

    joined_text = " ".join(text_corpus)
    
    # Mapeos MITRE ATT&CK Software reconocidos
    if "mimikatz" in joined_text or "sekurlsa" in joined_text:
        return "S0002"
    if "cobalt" in joined_text or "cobaltstrike" in joined_text or "beacon" in joined_text:
        return "S0154"
    if "psexec" in joined_text:
        return "S0029"
    if "bloodhound" in joined_text or "sharphound" in joined_text:
        return "S0521"
    if "rclone" in joined_text:
        return "S0638"
    if "empire" in joined_text:
        return "S0363"
        
    return None
