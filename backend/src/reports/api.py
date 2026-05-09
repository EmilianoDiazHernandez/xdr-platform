from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from src.infrastructure.database import Database
from .generar_reporte import generar_reporte_pdf_async
import os

@asynccontextmanager
async def lifespan(app: FastAPI):
    await Database.connect()
    yield
    await Database.close()

app = FastAPI(title="XDR Report Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

@app.post("/api/v1/reports/generate")
async def generate_report(n_alertas: int = 100):
    try:
        pdf_bytes, filename = await generar_reporte_pdf_async(n_alertas)
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health():
    return {"status": "ok", "service": "reports"}
