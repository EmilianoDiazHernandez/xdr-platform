from fastapi import APIRouter, HTTPException
from src.infrastructure.database import Database
from src.core.logger import logger

router = APIRouter()

@router.get("/alertas")
async def get_alertas():
    pool = Database.get_pool()
    if not pool:
        raise HTTPException(status_code=500, detail="Base de datos no conectada")
    try:
        async with pool.acquire() as conn:
            registros = await conn.fetch("SELECT id, ip_origen, timestamp, severidad, descripcion FROM vista_alertas_frontend LIMIT 50")
            return [dict(r) for r in registros]
    except Exception as e:
        logger.error(f"[DB_ERROR] Fallo al obtener alertas: {e}")
        raise HTTPException(status_code=500, detail="Error al obtener alertas de la DB")
