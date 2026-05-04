import pandas as pd
import random
from datetime import datetime, timedelta

def generar_alertas(n: int = 100) -> pd.DataFrame:
    severidades  = ["Alta", "Media", "Baja"]
    pesos        = [0.25, 0.35, 0.40]
    descripciones = {
        "Alta":  "Posible intrusión detectada en el segmento de red",
        "Media": "Comportamiento anómalo identificado en el host",
        "Baja":  "Actividad inusual de bajo riesgo detectada",
    }
    base_time = datetime.now().replace(hour=0, minute=0, second=0)
    registros = []
    for i in range(1, n + 1):
        sev = random.choices(severidades, weights=pesos)[0]
        base_time += timedelta(minutes=random.randint(1, 15))
        registros.append({
            "id_alerta":   i,
            "ip_origen":   f"192.168.1.{random.randint(1, 254)}",
            "timestamp":   base_time.strftime("%Y-%m-%d %H:%M:%S"),
            "severidad":   sev,
            "descripcion": descripciones[sev],
        })
    return pd.DataFrame(registros)