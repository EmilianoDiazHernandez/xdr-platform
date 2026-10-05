from contextlib import asynccontextmanager
from fastapi import FastAPI
from src.core.logger import logger
from src.infrastructure.database import Database
from src.infrastructure.redis_client import RedisClient
from src.ml_engine.model_loader import ModelLoader
from src.services.event_closer_service import EventCloserService

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("="*40 + " BOOTSTRAP XDR " + "="*40)
    
    await Database.connect()
    await RedisClient.connect()
    
    # Cargar modelos en un hilo separado para no bloquear el event loop principal
    import asyncio
    await asyncio.to_thread(ModelLoader.load_all)
    
    # Start background task to close inactive correlation events
    closer_task = asyncio.create_task(EventCloserService.run_closer_task())
    
    yield
    
    # Cancel the background task
    closer_task.cancel()
    
    await RedisClient.close()
    await Database.close()
    logger.info("Apagando XDR Platform...")
