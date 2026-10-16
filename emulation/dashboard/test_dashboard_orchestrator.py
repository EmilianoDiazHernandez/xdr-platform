#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
test_dashboard_orchestrator.py - Pruebas Unitarias del Orquestador C2
Plataforma XDR v9.0.0 | Fase 4: Pruebas de Automatización y Control
"""

import os
import sys
import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

# Mock graceful de FastAPI si no está instalado en el host local
try:
    import fastapi
except ImportError:
    mock_fa = MagicMock()
    mock_fa.FastAPI = lambda *args, **kwargs: mock_fa
    mock_fa.post = lambda *args, **kwargs: (lambda f: f)
    mock_fa.get = lambda *args, **kwargs: (lambda f: f)
    sys.modules["fastapi"] = mock_fa
    sys.modules["fastapi.responses"] = mock_fa.responses
    sys.modules["fastapi.templating"] = mock_fa.templating

class TestDashboardOrchestrator(unittest.TestCase):

    def setUp(self):
        import main
        self.main_module = main

    @patch("requests.post")
    def test_01_normal_traffic_orchestration(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"status": "success", "http_status": 200, "duration_s": 0.042}
        mock_post.return_value = mock_resp

        res = self.main_module.normal_network()
        self.assertEqual(res["status"], "success")
        self.assertIn("VENTAS-PC", res["message"])
        mock_post.assert_called_once()
        called_url = mock_post.call_args[0][0]
        self.assertTrue(called_url.endswith("/traffic/generate-now"))

    @patch("requests.post")
    def test_02_network_attack_orchestration(self, mock_post):
        mock_scan_resp = MagicMock()
        mock_scan_resp.json.return_value = {"status": "success", "target": "172.16.0.10"}
        mock_flood_resp = MagicMock()
        mock_flood_resp.json.return_value = {"status": "success", "packets_sent": 40}
        
        mock_post.side_effect = [mock_scan_resp, mock_flood_resp]

        res = self.main_module.attack_network()
        self.assertEqual(res["status"], "success")
        self.assertEqual(mock_post.call_count, 2)
        urls = [call[0][0] for call in mock_post.call_args_list]
        self.assertTrue(any(u.endswith("/attack/scan") for u in urls))
        self.assertTrue(any(u.endswith("/attack/flood") for u in urls))

    @patch("requests.post")
    def test_03_endpoint_attack_orchestration(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "status": "Payload Sysmon generado",
            "event": {"EventID": 1, "host": "VENTAS-PC"}
        }
        mock_post.return_value = mock_resp

        res = self.main_module.attack_endpoint()
        self.assertEqual(res["status"], "success")
        mock_post.assert_called_once()
        called_url = mock_post.call_args[0][0]
        self.assertTrue(called_url.endswith("/trigger-payload"))

    @patch("requests.post")
    def test_04_email_attack_orchestration(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"status": "success", "type": "smtp_phishing"}
        mock_post.return_value = mock_resp

        res = self.main_module.attack_email()
        self.assertEqual(res["status"], "success")
        mock_post.assert_called_once()
        called_url = mock_post.call_args[0][0]
        self.assertTrue(called_url.endswith("/attack/send-phishing"))

    @patch("requests.post")
    @patch("time.sleep", return_value=None)
    def test_05_lateral_movement_orchestration(self, mock_sleep, mock_post):
        mock_exploit_resp = MagicMock()
        mock_exploit_resp.json.return_value = {"status": "success", "type": "web_exploit"}
        mock_smb_resp = MagicMock()
        mock_smb_resp.json.return_value = {"status": "success", "type": "lateral_smb"}
        
        mock_post.side_effect = [mock_exploit_resp, mock_smb_resp]

        res = self.main_module.attack_lateral()
        self.assertEqual(res["status"], "success")
        self.assertEqual(mock_post.call_count, 2)
        urls = [call[0][0] for call in mock_post.call_args_list]
        self.assertTrue(any(u.endswith("/attack/web-exploit") for u in urls))
        self.assertTrue(any(u.endswith("/attack/lateral-smb") for u in urls))

if __name__ == "__main__":
    unittest.main()
