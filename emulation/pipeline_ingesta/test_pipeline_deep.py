#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
test_pipeline_deep.py - Suite de Pruebas Profundas para el Pipeline de Ingesta Zeek en Vivo
Plataforma XDR v9.0.0 | Fase 3: Pruebas Rigurosas

Evalua:
1. Parseo estricto TSV y metadatos dinámicos.
2. Exactitud matemática de las 14 métricas CICFlowMeter y 17 features ML.
3. Correlación L7 en memoria por UID.
4. Lectura incremental en streaming y persistencia de offset.
5. Resiliencia ante rotación y truncamiento de archivos de log.
6. Transmisión HTTP real y validación de contrato ZeekLog contra servidor mock.
7. Mecanismos de reintento ante fallos transitorios (HTTP 503).
"""

import os
import sys
import json
import time
import shutil
import tempfile
import unittest
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# Cargar el adaptador bajo prueba
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))
from zeek_stream_adapter import ZeekStreamParser, ZeekLiveTransformer, ZeekStreamAdapter

SAMPLE_ZEEK_HEADER = (
    "#separator \\x09\n"
    "#set_separator\t,\n"
    "#empty_field\t(empty)\n"
    "#unset_field\t-\n"
    "#path\tconn\n"
    "#fields\tts\tuid\tid.orig_h\tid.orig_p\tid.resp_h\tid.resp_p\tproto\tservice\tduration\torig_bytes\tresp_bytes\tconn_state\tlocal_orig\tlocal_resp\tmissed_bytes\thistory\torig_pkts\torig_ip_bytes\tresp_pkts\tresp_ip_bytes\n"
    "#types\ttime\tstring\taddr\tport\taddr\tport\tenum\tstring\tinterval\tcount\tcount\tstring\tbool\tbool\tcount\tstring\tcount\tcount\tcount\tcount\n"
)

SAMPLE_CONN_LINE_1 = "1728955845.100\tC1234567890\t185.15.2.2\t4444\t172.16.0.10\t80\ttcp\thttp\t0.500\t500\t15000\tSF\tF\tT\t0\tShADadFf\t10\t700\t15\t15300\n"
SAMPLE_CONN_LINE_2 = "1728955846.200\tC9876543210\t10.20.30.45\t50555\t172.16.0.20\t25\ttcp\t-\t0.000\t0\t0\tS0\tT\tT\t0\tS\t1\t40\t0\t0\n"

class MockXDRHandler(BaseHTTPRequestHandler):
    received_payloads = []
    fail_first = False
    attempts = 0

    def do_POST(self):
        MockXDRHandler.attempts += 1
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len).decode("utf-8")
        
        if MockXDRHandler.fail_first and MockXDRHandler.attempts == 1:
            self.send_response(503)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error": "temporarily unavailable"}')
            return

        try:
            data = json.loads(body)
            MockXDRHandler.received_payloads.append(data)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status": "ok", "ingested": true}')
        except Exception as e:
            self.send_response(400)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # Silenciar logs del servidor de pruebas


class TestPipelineDeep(unittest.TestCase):

    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="xdr_pipeline_test_")
        self.log_dir = Path(self.test_dir)
        self.conn_path = self.log_dir / "conn.log"
        self.http_path = self.log_dir / "http.log"

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_01_parser_tsv_strict_metadata(self):
        """Verifica la correcta interpretación de metadatos Zeek TSV dinámicos."""
        parser = ZeekStreamParser()
        for line in SAMPLE_ZEEK_HEADER.strip().split("\n"):
            parser.process_directive(line)

        self.assertEqual(parser.separator, "\t")
        self.assertEqual(len(parser.fields), 20)
        self.assertEqual(len(parser.types), 20)

        # Parsear línea 1
        row = parser.parse_line(SAMPLE_CONN_LINE_1)
        self.assertIsNotNone(row)
        self.assertEqual(row["uid"], "C1234567890")
        self.assertEqual(row["id.orig_h"], "185.15.2.2")
        self.assertEqual(row["id.resp_h"], "172.16.0.10")
        self.assertEqual(row["id.orig_p"], 4444)
        self.assertEqual(row["id.resp_p"], 80)
        self.assertEqual(row["duration"], 0.5)
        self.assertEqual(row["orig_bytes"], 500)
        self.assertEqual(row["resp_bytes"], 15000)
        self.assertFalse(row["local_orig"])  # 'F' -> False
        self.assertTrue(row["local_resp"])   # 'T' -> True

    def test_02_mathematical_cicflowmeter_features(self):
        """Verifica la precisión matemática de las 14 métricas derivadas CICFlowMeter."""
        parser = ZeekStreamParser()
        for line in SAMPLE_ZEEK_HEADER.strip().split("\n"):
            parser.process_directive(line)

        row = parser.parse_line(SAMPLE_CONN_LINE_1)
        transformed = ZeekLiveTransformer.transform(row)

        self.assertIsNotNone(transformed)
        # Flow_Duration en microsegundos (0.5s = 500000 usec)
        self.assertEqual(transformed["Flow_Duration"], 500000.0)
        # Flow_Bytes_s: (500 + 15000) / 0.5 = 31000.0
        self.assertAlmostEqual(transformed["Flow_Bytes_s"], 31000.0, places=2)
        # Flow_Packets_s: (10 + 15) / 0.5 = 50.0
        self.assertAlmostEqual(transformed["Flow_Packets_s"], 50.0, places=2)
        # Down_Up_Ratio: 15000 / 500 = 30.0
        self.assertAlmostEqual(transformed["Down_Up_Ratio"], 30.0, places=2)
        # act_data_pkt_fwd: orig_pkts - 1 = 10 - 1 = 9.0
        self.assertEqual(transformed["act_data_pkt_fwd"], 9.0)
        # Average_Packet_Size: (500 + 15000) / (10 + 15) = 15500 / 25 = 620.0
        self.assertAlmostEqual(transformed["Average_Packet_Size"], 620.0, places=2)
        # Idempotency Key es un hash SHA-256 no vacío
        self.assertEqual(len(transformed["idempotency_key"]), 64)

    def test_03_http_correlation_enrichment(self):
        """Verifica que el adaptador enriquezca el servicio a 'http' si hay correlación L7."""
        parser = ZeekStreamParser()
        for line in SAMPLE_ZEEK_HEADER.strip().split("\n"):
            parser.process_directive(line)

        row = parser.parse_line(SAMPLE_CONN_LINE_2)  # service es '-'
        self.assertEqual(row["service"], None)

        http_ctx = {"method": "GET", "uri": "/api/v1/health", "status_code": 200}
        transformed = ZeekLiveTransformer.transform(row, http_ctx)

        self.assertEqual(transformed["service"], "http")

    def test_04_streaming_incremental_reads(self):
        """Verifica que lecturas subsiguientes solo procesen registros añadidos de forma incremental."""
        with open(self.conn_path, "w", encoding="utf-8") as f:
            f.write(SAMPLE_ZEEK_HEADER)
            f.write(SAMPLE_CONN_LINE_1)

        adapter = ZeekStreamAdapter(
            log_dir=str(self.log_dir),
            batch_size=10,
            flush_interval=0.1,
            dry_run=True
        )

        adapter.process_available_lines()
        adapter.flush_batch()
        self.assertEqual(adapter.processed_count, 1)

        offset_after_first = adapter.last_offset
        self.assertGreater(offset_after_first, 0)

        # Añadir segunda línea
        with open(self.conn_path, "a", encoding="utf-8") as f:
            f.write(SAMPLE_CONN_LINE_2)

        adapter.process_available_lines()
        adapter.flush_batch()
        self.assertEqual(adapter.processed_count, 2)
        self.assertGreater(adapter.last_offset, offset_after_first)

    def test_05_rotation_and_truncation_detection(self):
        """Verifica que el adaptador detecte cuando conn.log se trunca o rota."""
        with open(self.conn_path, "w", encoding="utf-8") as f:
            f.write(SAMPLE_ZEEK_HEADER)
            f.write(SAMPLE_CONN_LINE_1)
            f.write(SAMPLE_CONN_LINE_2)

        adapter = ZeekStreamAdapter(log_dir=str(self.log_dir), dry_run=True)
        adapter.process_available_lines()
        adapter.flush_batch()
        self.assertEqual(adapter.processed_count, 2)
        old_offset = adapter.last_offset

        # Simular truncamiento / rotación de archivo
        with open(self.conn_path, "w", encoding="utf-8") as f:
            f.write(SAMPLE_ZEEK_HEADER)
            f.write(SAMPLE_CONN_LINE_1)

        self.assertLess(os.path.getsize(self.conn_path), old_offset)

        # Debe detectar que el tamaño se redujo y reiniciar offset
        adapter.process_available_lines()
        adapter.flush_batch()
        self.assertEqual(adapter.processed_count, 3)

    def test_06_http_server_ingestion_and_schema_validation(self):
        """Verifica la ingesta HTTP en vivo y el cumplimiento del esquema ZeekLog completo."""
        MockXDRHandler.received_payloads.clear()
        MockXDRHandler.fail_first = False
        MockXDRHandler.attempts = 0

        # Iniciar servidor mock en puerto dinámico
        server = HTTPServer(("127.0.0.1", 0), MockXDRHandler)
        port = server.server_port
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()

        with open(self.conn_path, "w", encoding="utf-8") as f:
            f.write(SAMPLE_ZEEK_HEADER)
            f.write(SAMPLE_CONN_LINE_1)

        api_url = f"http://127.0.0.1:{port}/api/v1/analyze-network"
        adapter = ZeekStreamAdapter(
            log_dir=str(self.log_dir),
            api_url=api_url,
            batch_size=1,
            flush_interval=0.1,
            dry_run=False
        )

        adapter.process_available_lines()
        server.shutdown()

        self.assertEqual(len(MockXDRHandler.received_payloads), 1)
        batch = MockXDRHandler.received_payloads[0]
        self.assertEqual(len(batch), 1)
        event = batch[0]

        # Verificar campos esenciales de ZeekLog
        required_fields = [
            "idempotency_key", "ts", "uid", "orig_ip", "resp_ip", "orig_p", "resp_p",
            "proto", "service", "conn_state", "history", "duration", "orig_bytes", "resp_bytes",
            "missed_bytes", "orig_pkts", "resp_pkts", "orig_ip_bytes", "resp_ip_bytes",
            "local_orig", "local_resp", "Flow_Duration", "Flow_Bytes_s", "Flow_Packets_s",
            "Subflow_Fwd_Bytes", "Subflow_Bwd_Bytes", "Subflow_Fwd_Packets", "act_data_pkt_fwd",
            "Fwd_Header_Length", "Bwd_Header_Length", "Fwd_Packet_Length_Max", "Bwd_Packet_Length_Max",
            "Bwd_Packet_Length_Min", "Down_Up_Ratio", "Average_Packet_Size"
        ]

        for field in required_fields:
            self.assertIn(field, event, f"Campo faltante en payload: {field}")
            self.assertIsNotNone(event[field], f"Campo nulo en payload: {field}")

    def test_07_resilient_retry_on_server_error(self):
        """Verifica que el adaptador reintente automáticamente si el servidor responde 503."""
        MockXDRHandler.received_payloads.clear()
        MockXDRHandler.fail_first = True
        MockXDRHandler.attempts = 0

        server = HTTPServer(("127.0.0.1", 0), MockXDRHandler)
        port = server.server_port
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()

        with open(self.conn_path, "w", encoding="utf-8") as f:
            f.write(SAMPLE_ZEEK_HEADER)
            f.write(SAMPLE_CONN_LINE_1)

        api_url = f"http://127.0.0.1:{port}/api/v1/analyze-network"
        adapter = ZeekStreamAdapter(
            log_dir=str(self.log_dir),
            api_url=api_url,
            batch_size=1,
            flush_interval=0.1,
            dry_run=False
        )

        adapter.process_available_lines()
        server.shutdown()

        # Debe haber realizado 2 intentos (el 1ro falló con 503, el 2do pasó con 200)
        self.assertEqual(MockXDRHandler.attempts, 2)
        self.assertEqual(len(MockXDRHandler.received_payloads), 1)

    def test_08_resume_from_saved_state_with_bootstrap(self):
        """Verifica que una nueva instancia del adaptador con estado guardado (>0) lea encabezados y procese nuevos eventos."""
        with open(self.conn_path, "w", encoding="utf-8") as f:
            f.write(SAMPLE_ZEEK_HEADER)
            f.write(SAMPLE_CONN_LINE_1)

        # Instancia 1: procesa línea 1 y guarda estado
        adapter1 = ZeekStreamAdapter(log_dir=str(self.log_dir), dry_run=True)
        adapter1.process_available_lines()
        adapter1.flush_batch()
        self.assertEqual(adapter1.processed_count, 1)
        saved_offset = adapter1.last_offset

        # Añadimos línea 2
        with open(self.conn_path, "a", encoding="utf-8") as f:
            f.write(SAMPLE_CONN_LINE_2)

        # Instancia 2: arranca de cero pero lee state_file existente
        adapter2 = ZeekStreamAdapter(log_dir=str(self.log_dir), dry_run=True)
        self.assertEqual(adapter2.last_offset, saved_offset)
        self.assertEqual(adapter2.parser.fields, [])  # Inicialmente vacío

        adapter2.process_available_lines()
        adapter2.flush_batch()

        # Debe haber hecho bootstrap de headers y procesado la línea 2
        self.assertGreater(len(adapter2.parser.fields), 0)
        self.assertEqual(adapter2.processed_count, 2)


if __name__ == "__main__":
    unittest.main()
