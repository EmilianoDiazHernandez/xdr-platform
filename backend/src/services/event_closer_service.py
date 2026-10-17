import asyncio
from src.core.logger import logger
from src.infrastructure.database import Database

class EventCloserService:
    @staticmethod
    async def run_closer_task(interval_seconds: int = 300): # 5 minutes default
        """
        Background task to close inactive general events in PostgreSQL.
        """
        logger.info(f"Iniciando tarea en segundo plano para cierre de eventos inactivos cada {interval_seconds}s.")
        while True:
            try:
                await asyncio.sleep(interval_seconds)
                
                conn = await Database.get_connection()
                if conn:
                    # Cerrar eventos con más de 4 horas de inactividad
                    result = await conn.execute("""
                        UPDATE eventos_correlacionados
                        SET estado = 'Cerrado', fecha_actualizacion = NOW()
                        WHERE estado = 'Abierto' AND fecha_actualizacion < NOW() - INTERVAL '4 hours'
                    """)
                    
                    # 'UPDATE N' is returned, we extract N
                    if result and result.startswith("UPDATE "):
                        num_closed = int(result.split(" ")[1])
                        if num_closed > 0:
                            logger.info(f"[CORRELATION_ENGINE] Cerrados {num_closed} eventos por inactividad (>4h).")
            except asyncio.CancelledError:
                logger.info("Tarea de cierre de eventos cancelada.")
                break
            except Exception as e:
                logger.error(f"[CORRELATION_ENGINE] Error en la tarea de cierre de eventos: {e}")
