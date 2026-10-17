from typing import Optional, Dict

class DecisionEngine:
    @staticmethod
    def evaluate_incident(confidence_score: float, device_is_critical: bool, threat_intel_score: float, mitre_tactic: Optional[str]) -> Optional[Dict]:
        """
        Evalúa si un evento debe escalar a alerta y determina su severidad final.
        Separa la Confianza (ML) de la Severidad (Impacto).
        """
        # Regla estricta RN03: Solo escala a alerta si supera 0.85
        escalar_alerta = confidence_score > 0.85

        # Base de la táctica MITRE
        tactic_base = 1
        if mitre_tactic in ["Execution", "Initial Access", "Privilege Escalation"]:
            tactic_base = 2
        elif mitre_tactic in ["Command and Control", "Exfiltration", "Impact", "Lateral Movement"]:
            tactic_base = 3

        severity_level = tactic_base
        
        # +1 si el equipo es crítico
        if device_is_critical:
            severity_level += 1
            
        # +1 si el threat intel (OTX) es alto
        if threat_intel_score and threat_intel_score > 0.5:
            severity_level += 1

        # Topado a 4
        severity_level = min(4, severity_level)

        mapping = {1: "Baja", 2: "Media", 3: "Alta", 4: "Crítica"}
        actions = {
            1: "ALERTA", 
            2: "BLOQUEAR_PROCESO", 
            3: "BLOQUEAR_IP_Y_HOST", 
            4: "AISLAMIENTO_TOTAL_DEL_HOST"
        }

        return {
            "escalar_alerta": escalar_alerta,
            "severidad": mapping[severity_level],
            "accion": actions[severity_level] if escalar_alerta else "PERMITIR"
        }
