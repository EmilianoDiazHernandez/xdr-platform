import asyncio
from src.infrastructure.database import Database
from src.core.logger import logger

class BatchCorrelationService:
    @staticmethod
    async def run_daily_batch():
        logger.info("[BATCH] Iniciando correlación Slow and Low (90 días)...")
        pool = Database.get_pool()
        if not pool:
            logger.error("[BATCH] No hay conexión a la base de datos. Abortando.")
            return
            
        try:
            async with pool.acquire() as conn:
                async with conn.transaction():
                    # Adquirir lock consultivo para serializar ejecuciones concurrentes del batch
                    await conn.execute("SELECT pg_advisory_xact_lock(999888)")
                    
                    # Agrupar eventos históricos huérfanos con política conservadora:
                    # - Mínimo 2 dispositivos distintos convergentes hacia el mismo destino (C2 coordinado)
                    # - Filtrado explícito de infraestructura legítima de DNS/Loopback
                    # - Señales MITRE validadas mediante JOIN a alertas_xdr
                    # - Descarte estricto de eventos ambiguos ante empates (conservan id_campana IS NULL)
                    query = """
                        WITH candidate_steps AS (
                            SELECT 
                                ec.id_evento_correlacionado,
                                ec.id_dispositivo_origen,
                                ec.severidad_global,
                                step.dest_ip
                            FROM eventos_correlacionados ec
                            CROSS JOIN LATERAL (
                                SELECT jsonb_array_elements(ec.attack_flow)->>'dest_ip' AS dest_ip
                            ) step
                            JOIN alertas_xdr a ON a.id_evento_correlacionado = ec.id_evento_correlacionado
                            WHERE ec.estado = 'Cerrado'
                              AND ec.id_campana IS NULL
                              AND ec.severidad_global >= 3
                              AND ec.fecha_actualizacion >= NOW() - INTERVAL '90 days'
                              AND step.dest_ip IS NOT NULL
                              AND step.dest_ip NOT IN ('8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1', '127.0.0.1', '0.0.0.0')
                              AND (
                                  a.mitre_tactic IN ('Command and Control', 'Exfiltration', 'Initial Access', 'Execution', 'Lateral Movement')
                                  OR a.tipo_ataque IN ('MALWARE', 'EDR_DETECTION')
                              )
                        ),
                        target_evidence AS (
                            SELECT 
                                dest_ip,
                                COUNT(DISTINCT id_dispositivo_origen) AS distinct_hosts,
                                COUNT(DISTINCT id_evento_correlacionado) AS distinct_events
                            FROM candidate_steps
                            GROUP BY dest_ip
                            HAVING COUNT(DISTINCT id_dispositivo_origen) >= 2
                        ),
                        event_target_ranking AS (
                            SELECT 
                                cs.id_evento_correlacionado,
                                cs.dest_ip,
                                te.distinct_hosts,
                                te.distinct_events,
                                DENSE_RANK() OVER (
                                    PARTITION BY cs.id_evento_correlacionado 
                                    ORDER BY te.distinct_hosts DESC, te.distinct_events DESC
                                ) AS rank_pos,
                                COUNT(*) OVER (
                                    PARTITION BY cs.id_evento_correlacionado, te.distinct_hosts, te.distinct_events
                                ) AS tie_count
                            FROM (
                                SELECT DISTINCT id_evento_correlacionado, dest_ip FROM candidate_steps
                            ) cs
                            JOIN target_evidence te ON cs.dest_ip = te.dest_ip
                        ),
                        unambiguous_events AS (
                            SELECT 
                                id_evento_correlacionado,
                                dest_ip AS assigned_c2
                            FROM event_target_ranking
                            WHERE rank_pos = 1 AND tie_count = 1
                        ),
                        c2_campaign_groups AS (
                            SELECT 
                                assigned_c2,
                                array_agg(id_evento_correlacionado) AS eventos
                            FROM unambiguous_events
                            GROUP BY assigned_c2
                            HAVING COUNT(id_evento_correlacionado) >= 2
                        )
                        SELECT assigned_c2 AS shared_c2, eventos FROM c2_campaign_groups;
                    """
                    agrupaciones = await conn.fetch(query)
                    
                    if not agrupaciones:
                        logger.info("[BATCH] No se encontraron patrones para Slow and Low.")
                        return

                    for row in agrupaciones:
                        c2_ip = row['shared_c2']
                        eventos = row['eventos']
                        
                        # Crear nueva campaña (solo para huérfanos)
                        id_campana = await conn.fetchval("""
                            INSERT INTO campanas_xdr (nombre_campana, descripcion)
                            VALUES ($1, $2) RETURNING id_campana
                        """, f"Campaña Persistente C2: {c2_ip}", f"Correlación batch detectada compartiendo C2 {c2_ip} en 90 días.")
                        logger.info(f"[BATCH] Creada campaña {id_campana} agrupando {len(eventos)} eventos hacia {c2_ip}.")
                        
                        await conn.execute("""
                            UPDATE eventos_correlacionados
                            SET id_campana = $1::uuid
                            WHERE id_evento_correlacionado = ANY($2::uuid[])
                              AND id_campana IS NULL
                        """, id_campana, eventos)
                        
        except Exception as e:
            logger.exception("[BATCH ERROR] Fallo en la correlación")

if __name__ == "__main__":
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    
    async def main():
        await Database.connect()
        await BatchCorrelationService.run_daily_batch()
        await Database.close()
        
    asyncio.run(main())
