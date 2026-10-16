import sys
import os
import unittest
import json

# Agregar rutas de dispositivos al sys.path para pruebas unitarias directas
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE_DIR, "server-web"))
sys.path.insert(0, os.path.join(BASE_DIR, "server-mail"))
sys.path.insert(0, os.path.join(BASE_DIR, "workstation"))
sys.path.insert(0, os.path.join(BASE_DIR, "attacker"))
sys.path.insert(0, os.path.join(BASE_DIR, "server-db"))

class TestDeviceUnits(unittest.TestCase):

    def test_edr_hook_sysmon_generation(self):
        """Verifica que el hook EDR genere un evento válido para Sysmon EventID 1."""
        from edr_hook import emit_sysmon_process_create
        
        cmd = "powershell.exe -w hidden -enc JABzAD0ATmV3..."
        res = emit_sysmon_process_create(cmd)
        
        self.assertTrue(res["logged"])
        event = res["event"]
        self.assertEqual(event["EventID"], 1)
        self.assertEqual(event["host"], "SRV-DMZ-WEB")
        self.assertEqual(event["ip_local"], "172.16.0.10")
        self.assertEqual(event["cmd"], cmd)
        self.assertTrue(event["hashes"].startswith("SHA256="))
        self.assertTrue(event["idempotency_key"].startswith("sysmon-"))

    def test_email_feature_extractor(self):
        """Verifica que el extractor de email extraiga correctamente las 24 características requeridas."""
        from email_feature_extractor import extract_email_features
        
        sample_email = (
            b"From: phisher@fake-security.com\r\n"
            b"To: user@corp-mail.local\r\n"
            b"Subject: URGENT: Your bank account is locked!\r\n"
            b"Content-Type: text/html\r\n\r\n"
            b"<html><body>Please immediately verify your account here: "
            b"<a href='http://192.168.1.50/login.php'>Login</a> or "
            b"<a href='http://malicious-cdn.xyz/patch.exe'>Download Update</a>"
            b"</body></html>"
        )
        
        feats = extract_email_features(sample_email, host="CORP-MAIL-EXCHANGE", ip_local="172.16.0.20")
        
        self.assertEqual(feats["host"], "CORP-MAIL-EXCHANGE")
        self.assertEqual(feats["ip_local"], "172.16.0.20")
        self.assertGreaterEqual(len(feats["urls_extraidas"]), 2)
        self.assertEqual(feats["tiene_html"], 1)
        self.assertGreater(feats["score_phishing_keywords"], 0)
        self.assertGreater(feats["score_heuristico"], 0)
        self.assertGreater(feats["entropia_texto"], 0.0)
        self.assertEqual(feats["url_con_ip"], 1)
        self.assertEqual(feats["dominio_raro"], 1)

    def test_attacker_api_initialization(self):
        """Verifica que el archivo del atacante sea sintácticamente válido y tenga sus rutas."""
        import ast
        attacker_path = os.path.join(BASE_DIR, "attacker", "attack_controller.py")
        with open(attacker_path, "r", encoding="utf-8") as f:
            tree = ast.parse(f.read())
        self.assertIsNotNone(tree)
        
        try:
            from attack_controller import app
            routes = [route.path for route in app.routes]
            self.assertIn("/health", routes)
            self.assertIn("/attack/scan", routes)
            self.assertIn("/attack/flood", routes)
            self.assertIn("/attack/web-exploit", routes)
            self.assertIn("/attack/send-phishing", routes)
            self.assertIn("/attack/lateral-smb", routes)
        except ImportError:
            pass  # Dependencias como fastapi/uvicorn se ejecutan dentro del contenedor

    def test_workstation_edr_agent_initialization(self):
        """Verifica que el agente EDR de la workstation sea sintácticamente válido y tenga sus rutas."""
        import ast
        agent_path = os.path.join(BASE_DIR, "workstation", "edr_agent.py")
        with open(agent_path, "r", encoding="utf-8") as f:
            tree = ast.parse(f.read())
        self.assertIsNotNone(tree)
        
        try:
            from edr_agent import app
            routes = [route.path for route in app.routes]
            self.assertIn("/health", routes)
            self.assertIn("/trigger-payload", routes)
            self.assertIn("/traffic/generate-now", routes)
        except ImportError:
            pass

    def test_server_db_diagnostics_initialization(self):
        """Verifica que el listener de base de datos sea sintácticamente válido y tenga su API."""
        import ast
        listener_path = os.path.join(BASE_DIR, "server-db", "listener.py")
        with open(listener_path, "r", encoding="utf-8") as f:
            tree = ast.parse(f.read())
        self.assertIsNotNone(tree)
        
        try:
            from listener import api
            routes = [route.path for route in api.routes]
            self.assertIn("/health", routes)
            self.assertIn("/api/connections", routes)
        except ImportError:
            pass

if __name__ == "__main__":
    unittest.main()
