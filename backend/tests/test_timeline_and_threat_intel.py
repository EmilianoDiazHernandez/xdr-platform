import unittest
import asyncio
import uuid
import json
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timezone

from src.services.threat_intel import check_otx_ip, check_otx_hash, check_otx_domain, check_otx_url, check_ip_reputation
from src.services.mitre_mapping import get_mitre_software
from src.services.correlation_service import CorrelationService
from src.services.alert_service import AlertService
from src.models.schemas import ZeekLog, SysmonLog, EmailLog


class TestThreatIntelAndTimeline(unittest.IsolatedAsyncioTestCase):

    async def test_otx_ip_reputation_emulated_hit(self):
        """Verifica que la IP conocida de prueba retorne status hit y score 1.0."""
        res = await check_otx_ip("185.15.2.2")
        self.assertEqual(res["status"], "hit")
        self.assertEqual(res["threat_score"], 1.0)
        self.assertGreater(res["pulse_count"], 0)
        self.assertTrue(len(res["indicators"]) > 0)

    async def test_otx_hash_reputation_eicar(self):
        """Verifica que el hash conocido de prueba de EICAR retorne hit."""
        eicar_md5 = "44d88612fea8a8f36de82e1278abb02f"
        res = await check_otx_hash(eicar_md5)
        self.assertEqual(res["status"], "hit")
        self.assertEqual(res["threat_score"], 1.0)
        self.assertTrue(len(res["indicators"]) > 0)

    async def test_otx_caching_in_redis(self):
        """Verifica que si la clave existe en Redis, se retorne de caché sin llamada HTTP."""
        mock_redis = AsyncMock()
        cached_payload = json.dumps({
            "status": "hit",
            "pulse_count": 3,
            "threat_score": 0.6,
            "indicators": [{"name": "Cached Threat"}]
        })
        mock_redis.get.return_value = cached_payload

        with patch("src.services.threat_intel.RedisClient.get_client", return_value=mock_redis):
            res = await check_otx_ip("198.51.100.42")
            self.assertEqual(res["status"], "hit")
            self.assertEqual(res["threat_score"], 0.6)
            mock_redis.get.assert_called_once_with("threat_intel_ip:198.51.100.42")

    async def test_otx_graceful_degradation_when_unavailable(self):
        """Verifica que fallos de red o timeouts retornen 'unavailable' sin crashear."""
        mock_redis = AsyncMock()
        mock_redis.get.return_value = None

        with patch("src.services.threat_intel.RedisClient.get_client", return_value=mock_redis):
            with patch("httpx.AsyncClient.get", side_effect=Exception("Connection refused")):
                res = await check_otx_domain("suspicious-malware-domain.xyz")
                self.assertEqual(res["status"], "unavailable")
                self.assertEqual(res["threat_score"], 0.0)
                self.assertEqual(res["pulse_count"], 0)

    def test_mitre_software_mapping(self):
        """Verifica la resolución precisa de MITRE Software ID sin invenciones."""
        # Mimikatz -> S0002
        self.assertEqual(get_mitre_software(process_name="mimikatz.exe"), "S0002")
        self.assertEqual(get_mitre_software(cmd="sekurlsa::logonpasswords"), "S0002")

        # Cobalt Strike -> S0154
        self.assertEqual(get_mitre_software(process_name="beacon.exe"), "S0154")
        self.assertEqual(get_mitre_software(otx_data={"indicators": [{"name": "Cobalt Strike C2", "tags": []}]}), "S0154")

        # PsExec -> S0029
        self.assertEqual(get_mitre_software(process_name="psexec.exe"), "S0029")

        # Desconocido -> None (no inventa)
        self.assertIsNone(get_mitre_software(process_name="notepad.exe", cmd="notepad.exe doc.txt"))

    async def test_timeline_endpoint_validation_uuid(self):
        """Verifica validación 422 para UUID inválido y 404 para inexistente."""
        from fastapi.testclient import TestClient
        from src.main import app

        client = TestClient(app)

        # UUID con formato inválido -> 422
        resp_invalid = client.get("/api/v1/eventos-correlacionados/not-a-valid-uuid/timeline")
        self.assertEqual(resp_invalid.status_code, 422)

        # UUID válido pero que no existe en DB -> 404
        non_existent_uuid = str(uuid.uuid4())
        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = None

        class MockAcquire:
            async def __aenter__(self):
                return mock_conn
            async def __aexit__(self, exc_type, exc, tb):
                pass

        mock_pool.acquire.return_value = MockAcquire()

        with patch("src.api.routers.alerts.Database.get_pool", return_value=mock_pool):
            resp_404 = client.get(f"/api/v1/eventos-correlacionados/{non_existent_uuid}/timeline")
            self.assertEqual(resp_404.status_code, 404)

    async def test_timeline_endpoint_chronological_ordering_and_tie_breaking(self):
        """Verifica que el timeline retorne eventos multi-vector ordenados cronológicamente con desempate estable."""
        from fastapi.testclient import TestClient
        from src.main import app

        incident_id = uuid.uuid4()
        device_id = uuid.uuid4()

        evento_row = {
            "id_evento_correlacionado": str(incident_id),
            "id_dispositivo_origen": str(device_id),
            "fecha_inicio": "2026-10-11T10:00:00Z",
            "fecha_actualizacion": "2026-10-11T10:05:00Z",
            "estado": "Abierto",
            "severidad_global": 3,
            "probabilidad_global": 0.95,
            "id_campana": None,
            "attack_flow": []
        }

        # Tres alertas de diferentes vectores con timestamps cronológicos
        alertas_rows = [
            {
                "id_alerta": 101,
                "timestamp": "2026-10-11T10:00:00Z",
                "tipo_deteccion": "Machine Learning",
                "tipo_ataque": "CAPA_EMAIL",
                "descripcion": "Phishing spearphishing detectado con link malicioso",
                "mitre_technique_id": "T1566.002",
                "mitre_tactic": "Initial Access",
                "mitre_software_id": None,
                "vector": "Email",
                "severidad": "Alta",
                "ip_origen": "192.168.1.50",
                "ip_destino": None
            },
            {
                "id_alerta": 102,
                "timestamp": "2026-10-11T10:02:00Z",
                "tipo_deteccion": "Machine Learning",
                "tipo_ataque": "EDR_DETECTION",
                "descripcion": "Ejecución de mimikatz.exe para volcado de credenciales",
                "mitre_technique_id": "T1059.001",
                "mitre_tactic": "Execution",
                "mitre_software_id": "S0002",
                "vector": "Endpoint",
                "severidad": "Crítica",
                "ip_origen": "192.168.1.50",
                "ip_destino": None
            },
            {
                "id_alerta": 103,
                "timestamp": "2026-10-11T10:04:00Z",
                "tipo_deteccion": "Machine Learning",
                "tipo_ataque": "MALWARE",
                "descripcion": "Tráfico C2 saliente anómalo hacia 185.15.2.2 en puerto 443",
                "mitre_technique_id": "T1071.001",
                "mitre_tactic": "Command and Control",
                "mitre_software_id": "S0154",
                "vector": "Red",
                "severidad": "Alta",
                "ip_origen": "192.168.1.50",
                "ip_destino": "185.15.2.2"
            }
        ]

        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = {"id_evento_correlacionado": str(incident_id)}
        mock_conn.fetch.return_value = alertas_rows

        class MockAcquire:
            async def __aenter__(self):
                return mock_conn
            async def __aexit__(self, exc_type, exc, tb):
                pass

        mock_pool.acquire.return_value = MockAcquire()

        with patch("src.api.routers.alerts.Database.get_pool", return_value=mock_pool):
            client = TestClient(app)
            response = client.get(f"/api/v1/eventos-correlacionados/{incident_id}/timeline")
            
            self.assertEqual(response.status_code, 200)
            data = response.json()
            
            # Verificar formato de arreglo de KillChainStepResponse
            self.assertIsInstance(data, list)
            self.assertEqual(len(data), 3)
            
            # Verificar orden cronológico y campos
            self.assertEqual(data[0]["vector"], "Email")
            self.assertEqual(data[0]["mitre_technique_id"], "T1566.002")
            self.assertEqual(data[0]["mitre_tactic"], "Initial Access")
            self.assertEqual(data[0]["severidad"], "Alta")

            self.assertEqual(data[1]["vector"], "Endpoint")
            self.assertEqual(data[1]["mitre_technique_id"], "T1059.001")
            self.assertEqual(data[1]["mitre_tactic"], "Execution")
            self.assertEqual(data[1]["severidad"], "Crítica")

            self.assertEqual(data[2]["vector"], "Network")
            self.assertEqual(data[2]["mitre_technique_id"], "T1071.001")
            self.assertEqual(data[2]["mitre_tactic"], "Command and Control")
            self.assertEqual(data[2]["severidad"], "Alta")


if __name__ == "__main__":
    unittest.main()
