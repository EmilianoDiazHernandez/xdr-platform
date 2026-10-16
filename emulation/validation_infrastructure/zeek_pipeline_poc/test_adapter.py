#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
test_adapter.py - Suite de Pruebas Automatizadas para el Adaptador Zeek -> XDR
Plataforma XDR v9.0.0 | Fase 3: Validación Offline

Cubre:
1. Lectura e interpretación de encabezados y tipos Zeek (#fields, #types).
2. Distinción estricta entre valores numéricos, vacíos (empty) y no establecidos (-).
3. Rechazo de registros incompletos, malformados o con puertos inválidos.
4. Derivación matemática de métricas CICFlowMeter vs características observadas.
5. Validación contra el esquema XDR ZeekLog y las 17 características de ML.
6. Correlación L7 (conn.log + http.log) por UID.
7. Aislamiento offline (garantía de cero llamadas HTTP o cambios en BD).
8. Ejecución sobre la evidencia real (run_20261014_013045) verificando inmutabilidad.
"""

import os
import sys
import json
import shutil
import hashlib
import tempfile
import unittest
from pathlib import Path

# Agregar el directorio actual al path para importar el adaptador
CURRENT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CURRENT_DIR))

from zeek_event_adapter import ZeekTSVParser, ZeekEventAdapter, ZeekMetadata, ML_FEATURES_NUM, ML_FEATURES_CAT, ML_FEATURES_BIN


class TestZeekTSVParser(unittest.TestCase):
    """Pruebas unitarias para el parser TSV y manejo de tipos de Zeek."""

    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp(prefix="zeek_test_parser_"))

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_parse_metadata_and_headers(self):
        """Valida extracción de directivas #separator, #fields, #types y paths."""
        log_content = (
            "#separator \\x09\n"
            "#set_separator\t,\n"
            "#empty_field\t(empty)\n"
            "#unset_field\t-\n"
            "#path\tconn\n"
            "#fields\tts\tuid\tid.orig_h\tid.orig_p\tid.resp_h\tid.resp_p\tproto\tservice\tduration\n"
            "#types\ttime\tstring\taddr\tport\taddr\tport\tenum\tstring\tinterval\n"
            "1791963051.100\tC_TEST_01\t10.0.0.1\t12345\t10.0.0.2\t80\ttcp\thttp\t0.05\n"
        )
        sample_file = self.temp_dir / "sample_conn.log"
        sample_file.write_text(log_content, encoding="utf-8")

        meta, records, malformed = ZeekTSVParser.parse_file(sample_file)

        self.assertEqual(meta.separator, "\t")
        self.assertEqual(meta.unset_field, "-")
        self.assertEqual(meta.empty_field, "(empty)")
        self.assertEqual(len(meta.fields), 9)
        self.assertEqual(len(meta.types), 9)
        self.assertEqual(len(records), 1)
        self.assertEqual(len(malformed), 0)

        r = records[0]
        self.assertIsInstance(r["ts"], float)
        self.assertEqual(r["uid"], "C_TEST_01")
        self.assertEqual(r["id.orig_p"], 12345)
        self.assertEqual(r["id.resp_p"], 80)
        self.assertEqual(r["proto"], "tcp")
        self.assertEqual(r["duration"], 0.05)

    def test_type_preservation_and_unset_handling(self):
        """Verifica que '-' se interprete como None y '(empty)' como colección vacía."""
        log_content = (
            "#separator \\x09\n"
            "#unset_field\t-\n"
            "#empty_field\t(empty)\n"
            "#fields\tts\tuid\tid.orig_p\tservice\tduration\torig_bytes\ttags\n"
            "#types\ttime\tstring\tport\tstring\tinterval\tcount\tset[string]\n"
            "1791963051.200\tC_TEST_02\t8080\t-\t-\t0\t(empty)\n"
        )
        sample_file = self.temp_dir / "sample_unset.log"
        sample_file.write_text(log_content, encoding="utf-8")

        _, records, malformed = ZeekTSVParser.parse_file(sample_file)
        self.assertEqual(len(records), 1)
        self.assertEqual(len(malformed), 0)

        r = records[0]
        self.assertIsNone(r["service"], "El campo unset '-' debe retornar None")
        self.assertIsNone(r["duration"], "El campo unset '-' en float debe retornar None")
        self.assertEqual(r["orig_bytes"], 0, "El valor '0' numérico debe preservarse como int 0")
        self.assertEqual(r["tags"], [], "El campo '(empty)' en set debe retornar lista vacía")

    def test_malformed_record_rejection(self):
        """Verifica que registros con columnas truncadas o puertos inválidos sean rechazados."""
        log_content = (
            "#separator \\x09\n"
            "#fields\tts\tuid\tid.orig_p\tid.resp_p\n"
            "#types\ttime\tstring\tport\tport\n"
            "1791963051.300\tC_INCOMPLETE\t80\n"                     # Falta 1 columna
            "1791963051.400\tC_BAD_PORT\t80\t999999\n"               # Puerto fuera de rango TCP
            "NON_NUMERIC_TIME\tC_BAD_TIME\t80\t443\n"                # Timestamp inválido
        )
        sample_file = self.temp_dir / "sample_bad.log"
        sample_file.write_text(log_content, encoding="utf-8")

        _, records, malformed = ZeekTSVParser.parse_file(sample_file)
        self.assertEqual(len(records), 0, "Ningún registro malformado debe ser aceptado")
        self.assertEqual(len(malformed), 3, "Deben detectarse 3 errores léxicos/estructurales")


class TestZeekEventAdapterTransformation(unittest.TestCase):
    """Pruebas unitarias de transformación y adaptación hacia el contrato XDR."""

    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp(prefix="zeek_test_adapter_"))

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_cicflowmeter_derivation_vs_directly_observed(self):
        """Comprueba la derivación de las 14 features CICFlowMeter y su consistencia matemática."""
        conn_content = (
            "#separator \\x09\n"
            "#fields\tts\tuid\tid.orig_h\tid.orig_p\tid.resp_h\tid.resp_p\tproto\tservice\tduration\torig_bytes\tresp_bytes\tconn_state\tlocal_orig\tlocal_resp\tmissed_bytes\thistory\torig_pkts\torig_ip_bytes\tresp_pkts\tresp_ip_bytes\n"
            "#types\ttime\tstring\taddr\tport\taddr\tport\tenum\tstring\tinterval\tcount\tcount\tstring\tbool\tbool\tcount\tstring\tcount\tcount\tcount\tcount\n"
            "1791960000.0\tC_SYNTH_01\t192.168.1.10\t50000\t192.168.1.20\t80\ttcp\thttp\t2.0\t1000\t4000\tSF\tT\tT\t0\tShADadFf\t10\t1400\t20\t4800\n"
        )
        (self.temp_dir / "conn.log").write_text(conn_content, encoding="utf-8")

        adapter = ZeekEventAdapter(self.temp_dir)
        report = adapter.process()

        self.assertEqual(report["status"], "PASS")
        self.assertEqual(len(report["normalized_events"]), 1)

        ev = report["normalized_events"][0]
        # Validar características directamente observadas
        self.assertEqual(ev["orig_ip"], "192.168.1.10")
        self.assertEqual(ev["resp_ip"], "192.168.1.20")
        self.assertEqual(ev["orig_p"], 50000)
        self.assertEqual(ev["resp_p"], 80)
        self.assertEqual(ev["duration"], 2.0)
        self.assertEqual(ev["orig_bytes"], 1000.0)
        self.assertEqual(ev["resp_bytes"], 4000.0)

        # Validar características derivadas CICFlowMeter
        self.assertEqual(ev["Flow_Duration"], 2000000.0, "Flow_Duration debe ser 2s * 1e6 = 2,000,000 usec")
        self.assertEqual(ev["Flow_Bytes_s"], 2500.0, "(1000 + 4000) / 2.0 = 2500 bytes/s")
        self.assertEqual(ev["Flow_Packets_s"], 15.0, "(10 + 20) / 2.0 = 15 pkts/s")
        self.assertEqual(ev["Down_Up_Ratio"], 4.0, "4000 / 1000 = 4.0")
        self.assertEqual(ev["Fwd_Header_Length"], 400.0, "orig_ip_bytes (1400) - orig_bytes (1000) = 400")
        self.assertEqual(ev["Bwd_Header_Length"], 800.0, "resp_ip_bytes (4800) - resp_bytes (4000) = 800")
        self.assertEqual(ev["act_data_pkt_fwd"], 9.0, "max(0, 10 - 1) = 9")

    def test_xdr_contract_schema_compliance(self):
        """Verifica que todos los campos requeridos por el esquema ZeekLog y ML estén presentes."""
        conn_content = (
            "#separator \\x09\n"
            "#fields\tts\tuid\tid.orig_h\tid.orig_p\tid.resp_h\tid.resp_p\tproto\tservice\tduration\torig_bytes\tresp_bytes\tconn_state\tlocal_orig\tlocal_resp\tmissed_bytes\thistory\torig_pkts\torig_ip_bytes\tresp_pkts\tresp_ip_bytes\n"
            "#types\ttime\tstring\taddr\tport\taddr\tport\tenum\tstring\tinterval\tcount\tcount\tstring\tbool\tbool\tcount\tstring\tcount\tcount\tcount\tcount\n"
            "1791960000.0\tC_SCHEMA_OK\t10.0.0.1\t40000\t10.0.0.2\t443\ttcp\tssl\t0.1\t100\t200\tSF\tF\tF\t0\tShAdFf\t5\t300\t4\t360\n"
        )
        (self.temp_dir / "conn.log").write_text(conn_content, encoding="utf-8")

        adapter = ZeekEventAdapter(self.temp_dir)
        report = adapter.process()

        self.assertEqual(report["status"], "PASS")
        ev = report["normalized_events"][0]

        # Comprobar presencia de las 17 features del modelo de red
        for num_feat in ML_FEATURES_NUM:
            self.assertIn(num_feat, ev, f"Característica numérica {num_feat} ausente")
        for cat_feat in ML_FEATURES_CAT:
            self.assertIn(cat_feat, ev, f"Característica categórica {cat_feat} ausente")
        self.assertIn("local_orig", ev)
        self.assertIn("local_resp", ev)
        self.assertIn("history", ev)

        # Comprobar idempotency_key determinística
        self.assertTrue(len(ev["idempotency_key"]) == 64, "idempotency_key debe ser un hash SHA-256 de 64 caracteres")

    def test_http_log_correlation_by_uid(self):
        """Verifica la correlación cruzada de conn.log y http.log mediante uid."""
        conn_content = (
            "#separator \\x09\n"
            "#fields\tts\tuid\tid.orig_h\tid.orig_p\tid.resp_h\tid.resp_p\tproto\tservice\tduration\torig_bytes\tresp_bytes\tconn_state\tlocal_orig\tlocal_resp\tmissed_bytes\thistory\torig_pkts\torig_ip_bytes\tresp_pkts\tresp_ip_bytes\n"
            "#types\ttime\tstring\taddr\tport\taddr\tport\tenum\tstring\tinterval\tcount\tcount\tstring\tbool\tbool\tcount\tstring\tcount\tcount\tcount\tcount\n"
            "1791960000.0\tC_HTTP_CORR\t172.22.0.3\t33000\t172.22.0.10\t8000\ttcp\t-\t0.01\t50\t150\tSF\tT\tT\t0\tShADadFf\t5\t250\t4\t310\n"
        )
        http_content = (
            "#separator \\x09\n"
            "#fields\tts\tuid\tid.orig_h\tid.orig_p\tid.resp_h\tid.resp_p\ttrans_depth\tmethod\thost\turi\tstatus_code\tuser_agent\n"
            "#types\ttime\tstring\taddr\tport\taddr\tport\tcount\tstring\tstring\tstring\tcount\tstring\n"
            "1791960000.01\tC_HTTP_CORR\t172.22.0.3\t33000\t172.22.0.10\t8000\t1\tGET\tapi-ml:8000\t/health?test_id=unit-test-123\t200\tpytest-agent\n"
        )
        (self.temp_dir / "conn.log").write_text(conn_content, encoding="utf-8")
        (self.temp_dir / "http.log").write_text(http_content, encoding="utf-8")

        adapter = ZeekEventAdapter(self.temp_dir)
        report = adapter.process()

        self.assertEqual(report["status"], "PASS")
        ev = report["normalized_events"][0]

        # Comprobar que 'service' fue actualizado a 'http' gracias a http.log
        self.assertEqual(ev["service"], "http")
        self.assertIn("_l7_context", ev)
        self.assertEqual(ev["_l7_context"]["http_uri"], "/health?test_id=unit-test-123")
        self.assertEqual(ev["_l7_context"]["http_status_code"], 200)

    def test_offline_isolation_guarantee(self):
        """Verifica que la ejecución es 100% offline y no abre conexiones de socket externas."""
        import socket
        real_socket = socket.socket

        def blocked_socket(*args, **kwargs):
            raise RuntimeError("INTENTO DE CONEXIÓN DE RED EXTERNA DETECTADO: El adaptador debe ser 100% offline.")

        socket.socket = blocked_socket
        try:
            conn_content = (
                "#separator \\x09\n"
                "#fields\tts\tuid\tid.orig_h\tid.orig_p\tid.resp_h\tid.resp_p\tproto\tservice\tduration\torig_bytes\tresp_bytes\tconn_state\tlocal_orig\tlocal_resp\tmissed_bytes\thistory\torig_pkts\torig_ip_bytes\tresp_pkts\tresp_ip_bytes\n"
                "#types\ttime\tstring\taddr\tport\taddr\tport\tenum\tstring\tinterval\tcount\tcount\tstring\tbool\tbool\tcount\tstring\tcount\tcount\tcount\tcount\n"
                "1791960000.0\tC_OFFLINE_01\t10.0.0.1\t40000\t10.0.0.2\t80\ttcp\thttp\t0.01\t100\t200\tSF\tT\tT\t0\tShAdFf\t5\t300\t4\t360\n"
            )
            (self.temp_dir / "conn.log").write_text(conn_content, encoding="utf-8")

            adapter = ZeekEventAdapter(self.temp_dir)
            report = adapter.process()
            self.assertEqual(report["status"], "PASS")
        finally:
            socket.socket = real_socket


class TestRealCaptureIntegration(unittest.TestCase):
    """Prueba sobre la evidencia real capturada en run_20261014_013045 con verificación de inmutabilidad."""

    @classmethod
    def setUpClass(cls):
        base_runs_dir = CURRENT_DIR.parent / "runs" / "run_20261014_013045"
        cls.real_run_dir = base_runs_dir
        if not cls.real_run_dir.exists():
            raise unittest.SkipTest(f"Directorio de captura real no encontrado: {base_runs_dir}")

    def _calc_sha256(self, file_path: Path) -> str:
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                h.update(chunk)
        return h.hexdigest()

    def test_real_capture_transformation_and_immutability(self):
        """Ejecuta el adaptador sobre run_20261014_013045 y confirma inmutabilidad de los logs originales."""
        conn_path = self.real_run_dir / "conn.log"
        http_path = self.real_run_dir / "http.log"

        # 1. Registrar hashes previos de los archivos originales
        hash_conn_before = self._calc_sha256(conn_path)
        hash_http_before = self._calc_sha256(http_path)

        # 2. Ejecutar el adaptador
        adapter = ZeekEventAdapter(self.real_run_dir)
        report = adapter.process()

        # 3. Comprobar resultados
        self.assertEqual(report["status"], "PASS")
        self.assertEqual(report["metrics"]["zeek_records_read"], 1)
        self.assertEqual(report["metrics"]["zeek_records_malformed"], 0)
        self.assertEqual(report["metrics"]["events_normalized"], 1)
        self.assertEqual(report["metrics"]["events_rejected"], 0)
        self.assertEqual(report["metrics"]["http_records_correlated"], 1)

        ev = report["normalized_events"][0]
        self.assertEqual(ev["uid"], "CUANUFn3c2F6XbfWf")
        self.assertEqual(ev["orig_ip"], "172.22.0.3")
        self.assertEqual(ev["resp_ip"], "172.22.0.10")
        self.assertEqual(ev["orig_p"], 33654)
        self.assertEqual(ev["resp_p"], 8000)
        self.assertEqual(ev["proto"], "tcp")
        self.assertEqual(ev["service"], "http")
        self.assertEqual(ev["conn_state"], "SF")

        # Comprobar enriquecimiento L7 con la URI real capturada
        self.assertIn("_l7_context", ev)
        self.assertEqual(ev["_l7_context"]["http_uri"], "/health?test_id=val-zeek-1791963046")
        self.assertEqual(ev["_l7_context"]["http_status_code"], 200)

        # Comprobar cumplimiento de las 17 características de ML
        ml = report["ml_model_compliance"]
        self.assertTrue(ml["compliant"])
        self.assertEqual(ml["features_num_present"], 8)
        self.assertEqual(ml["features_cat_present"], 3)
        self.assertEqual(ml["features_bin_computable"], 6)

        # 4. Verificar INMUTABILIDAD rigurosa (hashes idénticos)
        hash_conn_after = self._calc_sha256(conn_path)
        hash_http_after = self._calc_sha256(http_path)
        self.assertEqual(hash_conn_before, hash_conn_after, "conn.log original FUE ALTERADO por el adaptador!")
        self.assertEqual(hash_http_before, hash_http_after, "http.log original FUE ALTERADO por el adaptador!")


if __name__ == "__main__":
    unittest.main(verbosity=2)
