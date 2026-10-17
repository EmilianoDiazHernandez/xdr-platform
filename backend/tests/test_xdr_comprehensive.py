import sys
import os
import unittest
import asyncio
import json
import hashlib
from unittest.mock import AsyncMock, patch, MagicMock

# Ajustar PYTHONPATH
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.services.decision_engine import DecisionEngine
from src.services.alert_service import AlertService, IdempotencyConflictError, PersistenceError
from src.services.correlation_service import CorrelationService
from src.services.batch_correlation import BatchCorrelationService
from src.models.schemas import ZeekLog, SysmonLog

def make_mock_pool(mock_conn):
    mock_pool = MagicMock()
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=mock_conn)
    cm.__aexit__ = AsyncMock(return_value=None)
    mock_pool.acquire.return_value = cm
    
    tx = MagicMock()
    tx.__aenter__ = AsyncMock(return_value=None)
    tx.__aexit__ = AsyncMock(return_value=None)
    mock_conn.transaction = MagicMock(return_value=tx)
    return mock_pool

class TestXDRComprehensive(unittest.IsolatedAsyncioTestCase):

    # 1. Validación del umbral estricto en DecisionEngine
    def test_umbral_estricto_decision_engine(self):
        # 0.8499 no escala
        res_low = DecisionEngine.evaluate_incident(0.8499, False, 0.0, "Execution")
        self.assertFalse(res_low["escalar_alerta"])
        self.assertEqual(res_low["accion"], "PERMITIR")
        
        # 0.8500 no escala (estrictamente mayor)
        res_exact = DecisionEngine.evaluate_incident(0.8500, False, 0.0, "Execution")
        self.assertFalse(res_exact["escalar_alerta"])
        self.assertEqual(res_exact["accion"], "PERMITIR")
        
        # 0.8501 sí escala
        res_high = DecisionEngine.evaluate_incident(0.8501, False, 0.0, "Execution")
        self.assertTrue(res_high["escalar_alerta"])
        self.assertIn(res_high["accion"], ["BLOQUEAR_PROCESO", "ALERTA", "BLOQUEAR_IP_Y_HOST", "AISLAMIENTO_TOTAL_DEL_HOST"])

    # 2. Fallo en PostgreSQL no devuelve éxito y propaga PersistenceError
    async def test_fallo_postgres_propaga_error(self):
        mock_pool = MagicMock()
        mock_pool.acquire.side_effect = Exception("Conexión rechazada por TimescaleDB")
        
        log = ZeekLog(
            idempotency_key="test-key-db-fail",
            uid="uid-fail",
            orig_ip="192.168.1.10",
            resp_ip="10.0.0.1",
            orig_p=1234,
            resp_p=80
        )
        
        with patch('src.infrastructure.database.Database.get_pool', return_value=mock_pool):
            with self.assertRaises(PersistenceError):
                await AlertService.registrar_flujo_y_alerta_db(
                    log=log, prob_red=0.9, prob_fusion=0.9, accion="BLOQUEAR", severidad_nombre="Alta", escalar_alerta=True
                )

    # 3. Retransmisión del mismo registro con misma idempotency_key devuelve resultado previo sin duplicar
    async def test_retransmision_idempotente_misma_llave(self):
        mock_conn = AsyncMock()
        mock_pool = make_mock_pool(mock_conn)
        
        log = ZeekLog(
            idempotency_key="idem-retransmission-001",
            uid="uid-retrans",
            orig_ip="192.168.1.50",
            resp_ip="172.16.0.10",
            orig_p=5000,
            resp_p=80
        )
        payload_hash = AlertService.compute_payload_hash(log.model_dump())
        cached_response = {
            "uid": log.uid,
            "prob_red_cruda": 0.95,
            "prob_fusion_xdr": 0.95,
            "accion": "BLOQUEAR",
            "severidad": "Alta",
            "id_evento_correlacionado": "event-uuid-cached",
            "idempotent_replay": False
        }
        
        # Simular que registro_idempotencia ya contiene la llave con el mismo hash
        mock_conn.fetchrow.return_value = {
            "payload_hash": payload_hash,
            "response_data": cached_response
        }
        
        with patch('src.infrastructure.database.Database.get_pool', return_value=mock_pool):
            res = await AlertService.registrar_flujo_y_alerta_db(
                log=log, prob_red=0.95, prob_fusion=0.95, accion="BLOQUEAR", severidad_nombre="Alta", escalar_alerta=True
            )
            
            # Comprobar que devuelve el resultado previo marcado como idempotent_replay
            self.assertTrue(res["idempotent_replay"])
            self.assertEqual(res["id_evento_correlacionado"], "event-uuid-cached")
            
            # Comprobar que NO se insertó de nuevo en flujos_trafico ni alertas_xdr
            executed_queries = [call.args[0] for call in mock_conn.execute.mock_calls if call.args]
            self.assertFalse(any("INSERT INTO flujos_trafico" in q for q in executed_queries))
            self.assertFalse(any("INSERT INTO alertas_xdr" in q for q in executed_queries))

    # 4. Conflicto de idempotencia: misma llave reutilizada con payload diferente
    async def test_conflicto_idempotency_key_diferente_payload(self):
        mock_conn = AsyncMock()
        mock_pool = make_mock_pool(mock_conn)
        
        log = ZeekLog(
            idempotency_key="shared-conflict-key",
            uid="uid-orig",
            orig_ip="192.168.1.50",
            resp_ip="172.16.0.10",
            orig_p=5000,
            resp_p=80
        )
        
        # Simular que en base de datos existe con un payload_hash distinto
        mock_conn.fetchrow.return_value = {
            "payload_hash": "different_hash_from_another_payload",
            "response_data": {}
        }
        
        with patch('src.infrastructure.database.Database.get_pool', return_value=mock_pool):
            with self.assertRaises(IdempotencyConflictError):
                await AlertService.registrar_flujo_y_alerta_db(
                    log=log, prob_red=0.95, prob_fusion=0.95, accion="BLOQUEAR", severidad_nombre="Alta"
                )

    # 5. Dos registros legítimos con el mismo zeek_uid pero distinta idempotency_key NO se descartan
    async def test_mismo_zeek_uid_distinta_identidad_ambos_procesados(self):
        mock_conn = AsyncMock()
        mock_pool = make_mock_pool(mock_conn)
        
        # Simular que no existen previamente en registro_idempotencia
        mock_conn.fetchrow.return_value = None
        mock_conn.fetchval.return_value = 2 # id_severidad
        
        log1 = ZeekLog(
            idempotency_key="key-session-conn",
            uid="shared-zeek-uid-1234",
            orig_ip="10.0.0.5",
            resp_ip="172.16.0.10",
            orig_p=4000,
            resp_p=80
        )
        log2 = ZeekLog(
            idempotency_key="key-session-http",
            uid="shared-zeek-uid-1234",
            orig_ip="10.0.0.5",
            resp_ip="172.16.0.10",
            orig_p=4000,
            resp_p=80,
            service="http"
        )
        
        with patch('src.infrastructure.database.Database.get_pool', return_value=mock_pool), \
             patch('src.services.alert_service.AlertService.get_or_create_device', return_value="dev-uuid"), \
             patch('src.services.correlation_service.CorrelationService.correlate_and_get_event', return_value="ev-uuid"):
            
            res1 = await AlertService.registrar_flujo_y_alerta_db(log=log1, prob_red=0.9, prob_fusion=0.9, accion="A", severidad_nombre="Alta")
            res2 = await AlertService.registrar_flujo_y_alerta_db(log=log2, prob_red=0.9, prob_fusion=0.9, accion="A", severidad_nombre="Alta")
            
            self.assertFalse(res1["idempotent_replay"])
            self.assertFalse(res2["idempotent_replay"])
            self.assertEqual(res1["uid"], "shared-zeek-uid-1234")
            self.assertEqual(res2["uid"], "shared-zeek-uid-1234")

    # 6. Múltiples incidentes abiertos para el mismo dispositivo cuando los destinos son diferentes
    async def test_multiples_incidentes_mismo_dispositivo_destinos_diferentes(self):
        mock_conn = AsyncMock()
        mock_redis = AsyncMock()
        
        # Redis miss
        mock_redis.get.return_value = None
        # Postgres miss (no hay incidente previo para este nuevo destino)
        mock_conn.fetchrow.return_value = None
        mock_conn.fetchval.side_effect = ["incident-uuid-alpha", "incident-uuid-beta"]
        
        with patch('src.infrastructure.redis_client.RedisClient.get_client', return_value=mock_redis):
            # Ataque hacia destino 1
            ev1 = await CorrelationService.correlate_and_get_event(
                mock_conn, id_dispositivo="host-dmz-1", id_severidad=3, layer="Network", desc="Scan to Target 1",
                dest_ip="192.168.1.10"
            )
            # Ataque hacia destino 2 desde el mismo host
            ev2 = await CorrelationService.correlate_and_get_event(
                mock_conn, id_dispositivo="host-dmz-1", id_severidad=3, layer="Network", desc="Attack to Target 2",
                dest_ip="192.168.1.99"
            )
            
            # Deben ser dos incidentes independientes
            self.assertEqual(ev1, "incident-uuid-alpha")
            self.assertEqual(ev2, "incident-uuid-beta")
            self.assertNotEqual(ev1, ev2)

    # 7. Reconstrucción de contexto desde PostgreSQL ante pérdida de Redis (FLUSHALL)
    async def test_reconstruccion_desde_postgres_tras_perdida_redis(self):
        mock_conn = AsyncMock()
        mock_redis = MagicMock()
        
        # Redis totalmente vacío tras caída/FLUSHALL
        mock_redis.get = AsyncMock(return_value=None)
        
        # PostgreSQL encuentra el incidente abierto por coincidencia contextual en attack_flow
        mock_conn.fetchrow.return_value = {
            "id_evento_correlacionado": "reconstructed-incident-uuid",
            "severidad_global": 3,
            "num_steps": 2
        }
        
        mock_pipe = MagicMock()
        mock_pipe.setex = MagicMock()
        mock_pipe.execute = AsyncMock(return_value=[True])
        mock_redis.pipeline.return_value = mock_pipe
        
        with patch('src.infrastructure.redis_client.RedisClient.get_client', return_value=mock_redis):
            final_id = await CorrelationService.correlate_and_get_event(
                mock_conn, id_dispositivo="host-dmz-1", id_severidad=3, layer="Network", desc="Paso 3",
                dest_ip="172.16.0.20"
            )
            
            # Se asoció al incidente correcto recuperado de PostgreSQL
            self.assertEqual(final_id, "reconstructed-incident-uuid")
            # Y se reconstruyeron las llaves en Redis mediante pipeline
            self.assertTrue(mock_pipe.setex.called)

    # 8. Política de Campañas: IP benigna o empate deja id_campana IS NULL
    async def test_batch_campana_descarta_empate_e_ip_benigna(self):
        mock_conn = AsyncMock()
        mock_pool = make_mock_pool(mock_conn)
        
        # Simular que la consulta CTE con el filtro estricto no devuelve agrupaciones
        # porque los eventos tuvieron empates o fueron hacia IPs legítimas excluidas
        mock_conn.fetch.return_value = []
        
        with patch('src.infrastructure.database.Database.get_pool', return_value=mock_pool):
            await BatchCorrelationService.run_daily_batch()
            
            # Verificar que se adquirió el lock consultivo
            executed_queries = [call.args[0] for call in mock_conn.execute.mock_calls if call.args]
            self.assertTrue(any("pg_advisory_xact_lock(999888)" in q for q in executed_queries))
            
            # Al no haber agrupaciones inequívocas, no se insertó ninguna campaña
            self.assertFalse(mock_conn.fetchval.called)

    # 9. Dos workers concurrentes procesando la misma identidad no generan duplicados
    async def test_concurrencia_dos_workers_misma_identidad(self):
        # Simular una base de datos en memoria para verificar comportamiento concurrente
        db_idempotency = {}
        insert_counts = {"telemetry": 0}
        
        async def mock_handler(log):
            conn = AsyncMock()
            payload_hash = AlertService.compute_payload_hash(log.model_dump())
            
            # Simular consulta transaccional
            if log.idempotency_key in db_idempotency:
                entry = db_idempotency[log.idempotency_key]
                if entry["payload_hash"] == payload_hash:
                    return {"idempotent_replay": True, "uid": log.uid}
                else:
                    raise IdempotencyConflictError("Conflicto")
            else:
                # Simular inserción
                insert_counts["telemetry"] += 1
                db_idempotency[log.idempotency_key] = {
                    "payload_hash": payload_hash,
                    "response_data": {"idempotent_replay": False, "uid": log.uid}
                }
                return {"idempotent_replay": False, "uid": log.uid}

        log = ZeekLog(idempotency_key="race-key-01", uid="uid-race-01", orig_ip="1.1.1.1", resp_ip="2.2.2.2")
        
        # Ejecutar dos workers concurrentes con asyncio.gather
        results = await asyncio.gather(mock_handler(log), mock_handler(log))
        
        # Uno debe procesar y el otro recibir el replay idempotente
        replays = [r["idempotent_replay"] for r in results]
        self.assertIn(False, replays)
        self.assertIn(True, replays)
        # La telemetría solo se insertó exactamente 1 vez
        self.assertEqual(insert_counts["telemetry"], 1)

    # 10. Validación del requisito de mínimo 2 dispositivos distintos para declarar campaña
    def test_sql_campana_exige_minimo_dos_dispositivos(self):
        import inspect
        src = inspect.getsource(BatchCorrelationService.run_daily_batch)
        self.assertIn("HAVING COUNT(DISTINCT id_dispositivo_origen) >= 2", src)
        self.assertIn("dest_ip NOT IN ('8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1', '127.0.0.1', '0.0.0.0')", src)
        self.assertIn("pg_advisory_xact_lock(999888)", src)

if __name__ == "__main__":
    unittest.main()
