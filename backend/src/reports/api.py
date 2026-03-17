from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from .generar_reporte import generar_reporte_pdf
import os

app = FastAPI(title="XDR Report Service")

@app.post("/api/v1/reports/generate")
async def generate_report(n_alertas: int = 100):
    try:
        pdf_path = generar_reporte_pdf(n_alertas)
        if os.path.exists(pdf_path):
            return FileResponse(
                path=pdf_path, 
                filename=os.path.basename(pdf_path),
                media_type='application/pdf'
            )
        raise HTTPException(status_code=500, detail="Error al localizar el archivo PDF generado")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health():
    return {"status": "ok", "service": "reports"}
