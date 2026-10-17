import pandas as pd

def calcular_metricas(df: pd.DataFrame) -> dict:
    total      = len(df)
    criticas   = len(df[df["severidad"] == "Alta"])
    medias     = len(df[df["severidad"] == "Media"])
    bajas      = len(df[df["severidad"] == "Baja"])
    porcentaje = round((criticas / total * 100), 1) if total > 0 else 0
    return {
        "total_alertas":      total,
        "alertas_criticas":   criticas,
        "alertas_medias":     medias,
        "alertas_bajas":      bajas,
        "porcentaje_criticas": porcentaje,
    }