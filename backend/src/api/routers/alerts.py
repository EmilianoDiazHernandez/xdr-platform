import uuid
from typing import List
from fastapi import APIRouter, HTTPException, Path
from src.infrastructure.database import Database
from src.core.logger import logger
from src.models.schemas import KillChainStepResponse

router = APIRouter()

@router.get("/alertas")
async def get_alertas():
    pool = Database.get_pool()
    if not pool:
        raise HTTPException(status_code=500, detail="Base de datos no conectada")
    try:
        async with pool.acquire() as conn:
            registros = await conn.fetch("""
                SELECT 
                    id, ip_origen, timestamp, severidad, descripcion, 
                    mitre_technique_id, mitre_tactic, mitre_software_id, vector_origen, id_evento_correlacionado
                FROM vista_alertas_frontend 
                LIMIT 50
            """)
            return [dict(r) for r in registros]
    except Exception as e:
        logger.error(f"[DB_ERROR] Fallo al obtener alertas: {e}")
        raise HTTPException(status_code=500, detail="Error al obtener alertas de la DB")

def _normalizar_vector(vec: str) -> str:
    v = str(vec).strip().lower()
    if "email" in v:
        return "Email"
    if "endpoint" in v or "edr" in v:
        return "Endpoint"
    return "Network"

@router.get("/eventos-correlacionados/{id_evento}/timeline", response_model=List[KillChainStepResponse])
async def get_kill_chain_timeline(id_evento: str = Path(..., description="UUID del evento correlacionado")):
    """
    Endpoint de solo lectura (SELECT) para la Trazabilidad Táctica (Cyber Kill Chain).
    Extrae cronológicamente las alertas asociadas a un evento correlacionado.
    """
    # 1. Validar formato UUID (422 si es inválido)
    try:
        valid_uuid = uuid.UUID(id_evento)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=422, detail="Identificador de evento correlacionado inválido: debe ser un UUID.")

    pool = Database.get_pool()
    if not pool:
        raise HTTPException(status_code=500, detail="Base de datos no conectada")

    try:
        async with pool.acquire() as conn:
            # 2. Verificar existencia del evento correlacionado en base de datos
            evento_row = await conn.fetchrow(
                "SELECT id_evento_correlacionado FROM eventos_correlacionados WHERE id_evento_correlacionado = $1", 
                valid_uuid
            )
            if not evento_row:
                raise HTTPException(status_code=404, detail=f"Evento correlacionado con ID '{id_evento}' no encontrado.")

            # 3. Consulta SQL estricta de solo lectura (SELECT) con orden cronológico garantizado
            query = """
                SELECT 
                    a.id_alerta,
                    a.time AS timestamp,
                    COALESCE(a.vector_origen, 
                        CASE 
                            WHEN a.tipo_ataque LIKE '%EMAIL%' OR a.descripcion LIKE '%Correo%' THEN 'Email'
                            WHEN a.tipo_ataque LIKE '%EDR%' OR a.descripcion LIKE '%Proceso%' THEN 'Endpoint'
                            ELSE 'Network'
                        END
                    ) AS vector,
                    s.nombre AS severidad,
                    a.mitre_tactic,
                    a.mitre_technique_id,
                    a.descripcion
                FROM alertas_xdr a
                JOIN cat_severidad s ON a.id_severidad = s.id_severidad
                WHERE a.id_evento_correlacionado = $1
                ORDER BY a.time ASC
            """
            rows = await conn.fetch(query, valid_uuid)

            # 4. Devolver arreglo de objetos validados por KillChainStepResponse
            return [
                KillChainStepResponse(
                    id_alerta=r["id_alerta"],
                    timestamp=r["timestamp"].isoformat() if hasattr(r["timestamp"], "isoformat") else str(r["timestamp"]),
                    vector=_normalizar_vector(r["vector"]),
                    severidad=r["severidad"],
                    mitre_tactic=r["mitre_tactic"],
                    mitre_technique_id=r["mitre_technique_id"],
                    descripcion=r["descripcion"]
                )
                for r in rows
            ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[TIMELINE_ERROR] Error obteniendo timeline para evento {id_evento}: {e}")
        raise HTTPException(status_code=500, detail="Error interno al obtener la línea de tiempo forense.")
