import redis.asyncio as redis
from src.core.logger import logger
from src.core.config import REDIS_HOST, REDIS_PORT

class RedisClient:
    _client = None

    @classmethod
    async def connect(cls):
        if cls._client is None:
            try:
                cls._client = await redis.Redis(
                    host=REDIS_HOST, 
                    port=REDIS_PORT, 
                    db=0, 
                    decode_responses=True
                )
                await cls._client.ping()
                logger.info("[OK] Redis conectado exitosamente.")
            except Exception as e:
                logger.error(f"[!] Falla crítica Redis: {e}")

    @classmethod
    async def close(cls):
        if cls._client:
            await cls._client.close()
            logger.info("Redis connection closed.")

    @classmethod
    def get_client(cls):
        return cls._client
