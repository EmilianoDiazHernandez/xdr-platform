import asyncio
from datetime import datetime
from pathlib import Path
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML
from src.infrastructure.database import Database
from .metricas import calcular_metricas
from .grafica import generar_grafica_barras_base64, generar_grafica_tiempo_base64
import pandas as pd
import io

async def obtener_datos_reales(n_alertas: int = 100):
    pool = Database.get_pool()
    if not pool:
        # Fallback si no hay pool (pero en Docker debería estar)
        return pd.DataFrame()
        
    async with pool.acquire() as conn:
        registros = await conn.fetch("SELECT id, ip_origen, timestamp, severidad, descripcion FROM vista_alertas_frontend LIMIT $1", n_alertas)
        df = pd.DataFrame([dict(r) for r in registros])
        if not df.empty:
            df['timestamp'] = pd.to_datetime(df['timestamp'])
            df['id_alerta'] = df['id']
        return df

async def generar_reporte_pdf_async(n_alertas: int = 100) -> str:
    df = await obtener_datos_reales(n_alertas)
    
    if df.empty:
        raise Exception("No hay alertas en la base de datos para generar el reporte.")

    # Orden ascendente por id_alerta
    df = df.sort_values("id_alerta").reset_index(drop=True)

    print("Calculando métricas...")
    metricas = calcular_metricas(df)

    print("Generando gráfica de ataques vs tiempo...")
    grafica_tiempo_b64 = generar_grafica_tiempo_base64(df)

    print("Generando gráfica de distribución por severidad...")
    grafica_barras_b64 = generar_grafica_barras_base64(df)

    print("Renderizando plantilla...")
    base_path = Path(__file__).resolve().parent
    templates_path = base_path / "templates"
    
    env = Environment(loader=FileSystemLoader(str(templates_path)))
    template = env.get_template("reporte_alertas.html")
    html_str = template.render(
        titulo             = "Reporte XDR Fusion - Incidencias de Red y Endpoint",
        fecha              = datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
        metricas           = metricas,
        alertas            = df.to_dict("records"),
        grafica_tiempo_b64 = grafica_tiempo_b64,
        grafica_barras_b64 = grafica_barras_b64,
    )

    print("Generando PDF...")
    pdf_bytes = HTML(string=html_str, base_url=str(templates_path)).write_pdf()
    
    nombre = f"XDR-REPORT-{datetime.now().strftime('%Y%m%d-%H%M')}.pdf"
    return pdf_bytes, nombre

def generar_reporte_pdf(n_alertas: int = 100) -> str:
    return asyncio.run(generar_reporte_pdf_async(n_alertas))

if __name__ == "__main__":
    generar_reporte_pdf()