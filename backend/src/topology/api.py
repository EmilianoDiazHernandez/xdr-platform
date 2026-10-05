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
@app.get("/api/v1/topology/events")
async def get_events():
    pool = Database.get_pool()
    if not pool:
        raise HTTPException(status_code=500, detail="Base de datos no conectada")
    
    try:
        async with pool.acquire() as conn:
            eventos_rows = await conn.fetch("""
                SELECT 
                    id_evento_correlacionado::text as id,
                    id_dispositivo_origen::text as target_node,
                    fecha_inicio::text as start_time,
                    fecha_actualizacion::text as last_update,
                    estado as status,
                    severidad_global as severity,
                    probabilidad_global as probability,
                    attack_flow
                FROM eventos_correlacionados
                WHERE estado = 'Abierto'
                ORDER BY fecha_actualizacion DESC
            """)
            
            import json
            events = []
            for row in eventos_rows:
                event_dict = dict(row)
                if isinstance(event_dict['attack_flow'], str):
                    event_dict['attack_flow'] = json.loads(event_dict['attack_flow'])
                events.append(event_dict)
            
            return events
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@app.get("/api/v1/topology/node_alerts/{device_id}")
async def get_node_alerts(device_id: str):
    pool = Database.get_pool()
    if not pool:
        raise HTTPException(status_code=500, detail="Base de datos no conectada")
    try:
        async with pool.acquire() as conn:
            alertas = await conn.fetch("""
                SELECT id_alerta::text, time::text, id_severidad, tipo_deteccion, tipo_ataque, descripcion 
                FROM alertas_xdr 
                WHERE id_dispositivo_afectado = $1::uuid 
                ORDER BY time DESC LIMIT 20
            """, device_id)
            return [dict(a) for a in alertas]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
