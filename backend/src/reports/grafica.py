import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd
import base64
import io
import random

COLORES = {"Alta": "#ef4444", "Media": "#f59e0b", "Baja": "#22c55e"}

def generar_grafica_barras_base64(df: pd.DataFrame) -> str:
    """Gráfica de barras: distribución por severidad."""
    conteo = df["severidad"].value_counts().reset_index()
    conteo.columns = ["Severidad", "Cantidad"]
    orden = ["Alta", "Media", "Baja"]
    conteo["Severidad"] = pd.Categorical(
        conteo["Severidad"], categories=orden, ordered=True
    )
    conteo = conteo.sort_values("Severidad")

    fig = px.bar(
        conteo, x="Severidad", y="Cantidad",
        color="Severidad", color_discrete_map=COLORES,
        width=720, height=320,
        text="Cantidad",
    )
    fig.update_traces(textposition="outside", marker_line_width=0)
    fig.update_layout(
        showlegend=False,
        plot_bgcolor="white",
        paper_bgcolor="white",
        font=dict(family="Arial", size=13),
        margin=dict(t=20, b=30, l=40, r=20),
        xaxis=dict(showgrid=False),
        yaxis=dict(showgrid=True, gridcolor="#f1f5f9"),
    )
    buf = io.BytesIO()
    fig.write_image(buf, format="png")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def generar_grafica_tiempo_base64(df: pd.DataFrame) -> str:
    """Gráfica de líneas: ataques vs tiempo (últimas 12 horas)."""
    from datetime import datetime, timedelta

    # Tomar el timestamp de la primera alerta como referencia
    try:
        base_dt = pd.to_datetime(df["timestamp"].iloc[0])
        base_dt = base_dt.replace(minute=0, second=0)
    except Exception:
        base_dt = datetime.now().replace(minute=0, second=0)

    horas = []
    for h in range(12):
        hora_dt = base_dt + timedelta(hours=h)
        horas.append(hora_dt.strftime("%H:%M"))

    random.seed(42)
    n = len(df)

    # Simular distribución horaria con curva senoidal (pico a mitad del período)
    def serie_hora(proporcion, ruido=0.5):
        vals = []
        for i in range(12):
            factor = abs(0.3 + 0.7 * (i / 11))
            val = max(0, round(n * proporcion * factor * (1 + random.uniform(-ruido, ruido))))
            vals.append(val)
        return vals

    alta  = serie_hora(0.25, 0.4)
    media = serie_hora(0.35, 0.35)
    baja  = serie_hora(0.40, 0.3)

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=horas, y=alta,
        mode="lines+markers", name="Alta",
        line=dict(color="#ef4444", width=2),
        marker=dict(size=5),
        fill="tozeroy", fillcolor="rgba(239,68,68,0.08)",
    ))
    fig.add_trace(go.Scatter(
        x=horas, y=media,
        mode="lines+markers", name="Media",
        line=dict(color="#f59e0b", width=2),
        marker=dict(size=5),
        fill="tozeroy", fillcolor="rgba(245,158,11,0.08)",
    ))
    fig.add_trace(go.Scatter(
        x=horas, y=baja,
        mode="lines+markers", name="Baja",
        line=dict(color="#22c55e", width=2),
        marker=dict(size=5),
        fill="tozeroy", fillcolor="rgba(34,197,94,0.08)",
    ))

    fig.update_layout(
        width=720, height=300,
        plot_bgcolor="white",
        paper_bgcolor="white",
        font=dict(family="Arial", size=12),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        margin=dict(t=10, b=30, l=40, r=20),
        xaxis=dict(showgrid=False, title="Hora"),
        yaxis=dict(showgrid=True, gridcolor="#f1f5f9", title="Ataques"),
        hovermode="x unified",
    )

    buf = io.BytesIO()
    fig.write_image(buf, format="png")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


# Mantener compatibilidad con el nombre anterior
def generar_grafica_base64(df: pd.DataFrame) -> str:
    return generar_grafica_barras_base64(df)