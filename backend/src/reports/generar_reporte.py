from datetime import datetime
from pathlib import Path
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML
from datos_sinteticos import generar_alertas
from metricas import calcular_metricas
from grafica import generar_grafica_barras_base64, generar_grafica_tiempo_base64

def generar_reporte_pdf(n_alertas: int = 100) -> str:
    print("Generando datos sintéticos...")
    df = generar_alertas(n_alertas)

    # Orden ascendente por id_alerta (1 → 100)
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
        titulo             = "Reporte de Alertas de Red",
        fecha              = datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
        metricas           = metricas,
        alertas            = df.to_dict("records"),
        grafica_tiempo_b64 = grafica_tiempo_b64,
        grafica_barras_b64 = grafica_barras_b64,
    )

    nombre = f"ALERTAS-{datetime.now().strftime('%Y%m%d-%H%M')}.pdf"
    ruta   = base_path / "output" / nombre
    ruta.parent.mkdir(exist_ok=True)

    print("Generando PDF...")
    HTML(string=html_str, base_url=str(templates_path)).write_pdf(str(ruta))
    print(f"✓ Reporte generado: {ruta}")
    return str(ruta)

if __name__ == "__main__":
    generar_reporte_pdf()