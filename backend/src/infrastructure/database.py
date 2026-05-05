import asyncpg
import asyncio
from src.core.logger import logger
from src.core.config import DB_DSN

class Database:
    _pool = None

    @classmethod
    async def connect(cls):
        if cls._pool is None:
            for intento in range(10):
                try:
                    logger.info(f"Intentando conectar a PostgreSQL (Intento {intento+1}/10)...")
                    cls._pool = await asyncpg.create_pool(
                        dsn=DB_DSN,
                        command_timeout=60,
                        min_size=1,
                        max_size=10,
                        ssl=False
                    )
                    async with cls._pool.acquire() as conn:
                        await conn.execute("SELECT 1")
                    logger.info("[OK] PostgreSQL (TimescaleDB) conectado exitosamente.")
                    break
                except Exception as e:
                    if intento < 9:
                        logger.warning(f"[!] Base de datos iniciando. Esperando 5s... ({str(e).strip()})")
                        await asyncio.sleep(5)
                    else:
                        logger.error(f"Error final de conexión: Excedido el tiempo de espera. {e}")

    @classmethod
    async def close(cls):
        if cls._pool:
            await cls._pool.close()
            logger.info("PostgreSQL connection closed.")

    @classmethod
    def get_pool(cls):
        return cls._pool
