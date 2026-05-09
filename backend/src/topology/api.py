from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from src.infrastructure.database import Database

@asynccontextmanager
async def lifespan(app: FastAPI):
    await Database.connect()
    yield
    await Database.close()

app = FastAPI(title="XDR Topology Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/v1/topology")
async def get_topology():
    pool = Database.get_pool()
    if not pool:
        raise HTTPException(status_code=500, detail="Base de datos no conectada")
    
    try:
        async with pool.acquire() as conn:
            # 1. Obtener Nodos (Dispositivos)
            nodos_rows = await conn.fetch("""
                SELECT 
                    d.id_dispositivo::text as id,
                    di.direccion_ip::text as ip,
                    COALESCE(di.hostname, di.direccion_ip::text, 'unknown') as label,
                    c.nombre as type,
                    d.mac_address::text as mac,
                    d.es_critico as critical
                FROM dispositivos d
                LEFT JOIN dispositivo_ips di ON d.id_dispositivo = di.id_dispositivo AND di.activa = TRUE
                JOIN cat_tipos_dispositivo c ON d.id_tipo = c.id_tipo
            """)
            nodes = [dict(row) for row in nodos_rows]

            # 2. Obtener Enlaces (Flujos de Tráfico agregados)
            enlaces_rows = await conn.fetch("""
                SELECT 
                    id_origen::text as source,
                    id_destino::text as target,
                    COUNT(*) as weight,
                    MAX(time) as last_seen,
                    AVG(probabilidad_anomalia) as risk
                FROM flujos_trafico
                GROUP BY id_origen, id_destino
            """)
            edges = [dict(row) for row in enlaces_rows]

            return {
                "nodes": nodes,
                "edges": edges,
                "stats": {
                    "total_nodes": len(nodes),
                    "total_edges": len(edges)
                }
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health():
    return {"status": "ok", "service": "topology"}
