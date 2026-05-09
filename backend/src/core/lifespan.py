from contextlib import asynccontextmanager
from fastapi import FastAPI
from src.core.logger import logger
from src.infrastructure.database import Database
from src.infrastructure.redis_client import RedisClient
from src.ml_engine.model_loader import ModelLoader

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("="*40 + " BOOTSTRAP XDR " + "="*40)
    
    await Database.connect()
    await RedisClient.connect()
    
    # Cargar modelos en un hilo separado para no bloquear el event loop principal
    import asyncio
    await asyncio.to_thread(ModelLoader.load_all)
    
    yield
    
    await RedisClient.close()
    await Database.close()
    logger.info("Apagando XDR Platform...")
