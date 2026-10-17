from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from src.core.lifespan import lifespan
from src.api.middlewares import limiter
from src.api.routers import network, endpoint, email, alerts
from src.ml_engine.model_loader import ModelLoader
from src.infrastructure.redis_client import RedisClient

app = FastAPI(title="XDR Platform", version="9.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(network.router, prefix="/api/v1", tags=["Network"])
app.include_router(endpoint.router, prefix="/api/v1", tags=["Endpoint"])
app.include_router(email.router, prefix="/api/v1", tags=["Email"])
app.include_router(alerts.router, prefix="/api/v1", tags=["Alerts"])

@app.get("/health")
async def health():
    redis_ok = RedisClient.get_client() is not None

    models_red = ModelLoader.get('red')
    models_edr = ModelLoader.get('edr')
    models_email = ModelLoader.get('email')

    total_features_red = len(models_red.get('config', {}).get('features_num', [])) + \
                         len(models_red.get('config', {}).get('features_cat', [])) + \
                         len(models_red.get('config', {}).get('features_bin', []))

    return {
        "status": "ok" if (models_red.get('model') and models_edr.get('model') and models_email.get('model')) else "degradado",
        "capas": {
            "red": {"activa": models_red.get('model') is not None, "features": total_features_red},
            "endpoint": {"activa": models_edr.get('model') is not None, "columnas_struct": len(models_edr.get('columnas_estructuradas', []))},
            "email": {"activa": models_email.get('model') is not None, "osint_db_size": len(models_email.get('intel', []))},
        },
        "redis": {"activo": redis_ok},
        "version": "9.0.0",
    }
