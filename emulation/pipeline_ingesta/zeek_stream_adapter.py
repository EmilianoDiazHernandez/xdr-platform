#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
zeek_stream_adapter.py - Adaptador de Telemetría Zeek en Streaming Continuo hacia la Plataforma XDR
Plataforma XDR v9.0.0 | Fase 3: Pipeline de Ingesta en Vivo

Monitorea en tiempo real la rotación y escrituras de conn.log (y opcionalmente http.log),
transforma los flujos al contrato de datos formal ZeekLog (17 features ML + 14 CICFlowMeter)
y los despacha en lotes (batch) hacia FastAPI (POST /api/v1/analyze-network).
"""

import os
import sys
import time
import json
import math
import hashlib
import logging
import argparse
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path
import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [ZeekStreamAdapter] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("ZeekStreamAdapter")

# Constantes del modelo de Machine Learning
VALID_PROTOCOLS = {"icmp", "tcp", "udp"}

class ZeekStreamParser:
    """
    Parser incremental orientado a streaming de archivos de log de Zeek en formato TSV.
    Mantiene estado de metadatos (#fields, #types, #separator) a través de lecturas continuas.
    """
    def __init__(self):
        self.separator = "\t"
        self.set_separator = ","
        self.empty_field = "(empty)"
        self.unset_field = "-"
        self.fields: List[str] = []
        self.types: List[str] = []

    def process_directive(self, line: str):
        parts = line.split()
        if not parts:
            return
        directive = parts[0]
        if directive == "#separator":
            sep_raw = line[len("#separator"):].strip()
            if sep_raw.startswith("\\x"):
                try: self.separator = chr(int(sep_raw[2:], 16))
                except ValueError: self.separator = "\t"
            else:
                self.separator = sep_raw if sep_raw else "\t"
        elif directive == "#set_separator":
            self.set_separator = line[len("#set_separator"):].strip() or ","
        elif directive == "#empty_field":
            self.empty_field = line[len("#empty_field"):].strip() or "(empty)"
        elif directive == "#unset_field":
            self.unset_field = line[len("#unset_field"):].strip() or "-"
        elif directive == "#fields":
            self.fields = line.split(self.separator)[1:]
        elif directive == "#types":
            self.types = line.split(self.separator)[1:]

    def parse_line(self, line: str) -> Optional[Dict[str, Any]]:
        line = line.rstrip("\r\n")
        if not line:
            return None
        if line.startswith("#"):
            self.process_directive(line)
            return None
        if not self.fields:
            return None

        parts = line.split(self.separator)
        if len(parts) != len(self.fields):
            return None

        row: Dict[str, Any] = {}
        for idx, field_name in enumerate(self.fields):
            raw_val = parts[idx]
            ztype = self.types[idx] if idx < len(self.types) else "string"
            val = self._convert_value(raw_val, ztype)
            row[field_name] = val
        return row

    def _convert_value(self, val: str, ztype: str) -> Any:
        if val == self.unset_field or val == self.empty_field:
            return None
        try:
            if ztype in ("time", "interval"):
                return float(val)
            elif ztype in ("port", "count"):
                return int(val)
            elif ztype == "bool":
                return val.upper() == "T"
            return val
        except Exception:
            return val


class ZeekLiveTransformer:
    """
    Transforma registros crudos de Zeek en eventos compatibles con el esquema ZeekLog del XDR.
    """
    @staticmethod
    def is_ignorable_ip(ip: str) -> bool:
        if not ip:
            return True
        ip_clean = str(ip).lower().strip()
        # Multicast IPv6 (ff00::/8) o Link-Local IPv6 (fe80::/10)
        if ip_clean.startswith("ff") or ip_clean.startswith("fe80:"):
            return True
        # Multicast IPv4 (224.0.0.0/4) o Broadcast
        if ip_clean.startswith("224.") or ip_clean.startswith("239.") or ip_clean == "255.255.255.255":
            return True
        # Loopback
        if ip_clean.startswith("127.") or ip_clean == "::1":
            return True
        return False

    @staticmethod
    def transform(conn: Dict[str, Any], http_ctx: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        uid = conn.get("uid")
        orig_ip = conn.get("id.orig_h")
        resp_ip = conn.get("id.resp_h")
        orig_p = conn.get("id.orig_p")
        resp_p = conn.get("id.resp_p")

        if not uid or not orig_ip or not resp_ip or orig_p is None or resp_p is None:
            return None

        # Filtrar tráfico de control no corporativo (multicast/link-local)
        if ZeekLiveTransformer.is_ignorable_ip(orig_ip) or ZeekLiveTransformer.is_ignorable_ip(resp_ip):
            return None

        proto = str(conn.get("proto") or "tcp").lower()
        if proto not in VALID_PROTOCOLS:
            proto = "tcp"

        ts = float(conn.get("ts") or time.time())
        duration = float(conn.get("duration") or 0.0)
        orig_bytes = float(conn.get("orig_bytes") or 0.0)
        resp_bytes = float(conn.get("resp_bytes") or 0.0)
        missed_bytes = float(conn.get("missed_bytes") or 0.0)
        orig_pkts = float(conn.get("orig_pkts") or 0.0)
        resp_pkts = float(conn.get("resp_pkts") or 0.0)
        orig_ip_bytes = float(conn.get("orig_ip_bytes") or (orig_bytes + (orig_pkts * 20)))
        resp_ip_bytes = float(conn.get("resp_ip_bytes") or (resp_bytes + (resp_pkts * 20)))

        service_raw = conn.get("service")
        service = str(service_raw).lower() if service_raw and service_raw != "-" else "-"
        conn_state = str(conn.get("conn_state") or "-")
        history = str(conn.get("history") or "-")

        local_orig_str = "T" if conn.get("local_orig") is True else "F"
        local_resp_str = "T" if conn.get("local_resp") is True else "F"

        if http_ctx and service == "-":
            service = "http"

        # Métricas CICFlowMeter
        duration_usec = duration * 1e6 if duration > 0 else 1.0
        flow_bytes_s = ((orig_bytes + resp_bytes) / (duration_usec / 1e6)) if duration > 0 else 0.0
        flow_packets_s = ((orig_pkts + resp_pkts) / (duration_usec / 1e6)) if duration > 0 else 0.0
        down_up_ratio = (resp_bytes / orig_bytes) if orig_bytes > 0 else 0.0
        avg_pkt_size = ((orig_bytes + resp_bytes) / (orig_pkts + resp_pkts)) if (orig_pkts + resp_pkts) > 0 else 0.0

        fwd_header_len = max(0.0, orig_ip_bytes - orig_bytes)
        bwd_header_len = max(0.0, resp_ip_bytes - resp_bytes)
        fwd_pkt_len_max = (orig_bytes / orig_pkts) if orig_pkts > 0 else 0.0
        bwd_pkt_len_max = (resp_bytes / resp_pkts) if resp_pkts > 0 else 0.0
        act_data_pkt_fwd = max(0.0, orig_pkts - 1.0)

        # Idempotencia canónica
        idem_raw = f"{uid}:{ts}:{orig_ip}:{orig_p}:{resp_ip}:{resp_p}"
        idempotency_key = hashlib.sha256(idem_raw.encode("utf-8")).hexdigest()

        return {
            "idempotency_key": idempotency_key,
            "ts": ts,
            "uid": uid,
            "orig_ip": str(orig_ip),
            "resp_ip": str(resp_ip),
            "orig_p": int(orig_p),
            "resp_p": int(resp_p),
            "proto": proto,
            "service": service,
            "conn_state": conn_state,
            "history": history,
            "duration": duration,
            "orig_bytes": orig_bytes,
            "resp_bytes": resp_bytes,
            "missed_bytes": missed_bytes,
            "orig_pkts": orig_pkts,
            "resp_pkts": resp_pkts,
            "orig_ip_bytes": orig_ip_bytes,
            "resp_ip_bytes": resp_ip_bytes,
            "local_orig": local_orig_str,
            "local_resp": local_resp_str,

            "Flow_Duration": duration_usec,
            "Flow_Bytes_s": flow_bytes_s,
            "Flow_Packets_s": flow_packets_s,
            "Subflow_Fwd_Bytes": orig_bytes,
            "Subflow_Bwd_Bytes": resp_bytes,
            "Subflow_Fwd_Packets": orig_pkts,
            "act_data_pkt_fwd": act_data_pkt_fwd,
            "Fwd_Header_Length": fwd_header_len,
            "Bwd_Header_Length": bwd_header_len,
            "Fwd_Packet_Length_Max": fwd_pkt_len_max,
            "Bwd_Packet_Length_Max": bwd_pkt_len_max,
            "Bwd_Packet_Length_Min": 0.0,
            "Down_Up_Ratio": down_up_ratio,
            "Average_Packet_Size": avg_pkt_size
        }


class ZeekStreamAdapter:
    """
    Controlador de streaming continuo de logs de Zeek a la API XDR.
    """
    def __init__(
        self,
        log_dir: str,
        api_url: str = "http://api-ml:8000/api/v1/analyze-network",
        batch_size: int = 20,
        flush_interval: float = 1.0,
        state_file: Optional[str] = None,
        dry_run: bool = False
    ):
        self.log_dir = Path(log_dir)
        self.conn_path = self.log_dir / "conn.log"
        self.http_path = self.log_dir / "http.log"
        self.api_url = api_url
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self.state_file = state_file or str(self.log_dir / ".stream_state.json")
        self.dry_run = dry_run
        
        self.parser = ZeekStreamParser()
        self.http_parser = ZeekStreamParser()
        self.http_cache: Dict[str, Dict[str, Any]] = {}
        self.batch: List[Dict[str, Any]] = []
        self.last_flush = time.time()
        self.last_offset = 0
        self.processed_count = 0
        self.load_state()

    def load_state(self):
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, "r") as f:
                    data = json.load(f)
                    self.last_offset = data.get("offset", 0)
                    self.processed_count = data.get("processed_count", 0)
                logger.info(f"Estado restaurado: offset={self.last_offset}, procesados={self.processed_count}")
            except Exception as e:
                logger.warning(f"No se pudo cargar archivo de estado: {e}")

    def save_state(self):
        try:
            with open(self.state_file, "w") as f:
                json.dump({"offset": self.last_offset, "processed_count": self.processed_count}, f)
        except Exception as e:
            logger.debug(f"Error guardando estado: {e}")

    def sync_http_logs(self):
        """Lee registros nuevos de http.log para enriquecer conexiones activas."""
        if not self.http_path.exists():
            return
        try:
            with open(self.http_path, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    entry = self.http_parser.parse_line(line)
                    if entry and entry.get("uid"):
                        self.http_cache[entry["uid"]] = entry
        except Exception as e:
            logger.debug(f"Error sincronizando http.log: {e}")

    def flush_batch(self) -> bool:
        if not self.batch:
            return True

        if self.dry_run:
            logger.info(f"[DRY-RUN] Despachando lote de {len(self.batch)} eventos normalizados.")
            self.processed_count += len(self.batch)
            self.batch.clear()
            self.last_flush = time.time()
            self.save_state()
            return True

        # Despacho real con reintentos exponenciales
        max_retries = 3
        delay = 0.5
        for attempt in range(1, max_retries + 1):
            try:
                res = requests.post(self.api_url, json=self.batch, timeout=10.0)
                if res.status_code == 200:
                    logger.info(f"[INGEST-OK] {len(self.batch)} flujos enviados exitosamente a {self.api_url}")
                    self.processed_count += len(self.batch)
                    self.batch.clear()
                    self.last_flush = time.time()
                    self.save_state()
                    return True
                elif res.status_code == 409:
                    logger.warning(f"[INGEST-CONFLICT] Conflicto de idempotencia en lote: {res.text}")
                    self.batch.clear()
                    self.last_flush = time.time()
                    self.save_state()
                    return True
                else:
                    logger.warning(f"[RETRY {attempt}/{max_retries}] API error HTTP {res.status_code}: {res.text}")
            except Exception as err:
                logger.warning(f"[RETRY {attempt}/{max_retries}] Error de conexión con {self.api_url}: {err}")

            time.sleep(delay)
            delay *= 2

        logger.error(f"[INGEST-FAIL] No se pudo despachar el lote de {len(self.batch)} tras {max_retries} intentos.")
        return False

    def _bootstrap_headers(self, f):
        """Lee directivas de encabezado (#fields, #types, #separator) desde el inicio del archivo si no están cargadas."""
        orig_pos = f.tell()
        f.seek(0)
        while True:
            line = f.readline()
            if not line:
                break
            line_str = line.rstrip("\r\n")
            if line_str.startswith("#"):
                self.parser.process_directive(line_str)
            else:
                break
        f.seek(orig_pos)

    def process_available_lines(self):
        if not self.conn_path.exists():
            return

        file_size = os.path.getsize(self.conn_path)
        if file_size < self.last_offset:
            logger.info("Detectada rotación o truncamiento de conn.log. Reiniciando lectura desde inicio.")
            self.last_offset = 0
            self.parser = ZeekStreamParser()

        self.sync_http_logs()

        with open(self.conn_path, "r", encoding="utf-8", errors="replace") as f:
            if not self.parser.fields:
                self._bootstrap_headers(f)

            f.seek(self.last_offset)
            while True:
                line = f.readline()
                if not line:
                    break

                raw_conn = self.parser.parse_line(line)
                if raw_conn:
                    uid = raw_conn.get("uid")
                    http_ctx = self.http_cache.get(uid) if uid else None
                    event = ZeekLiveTransformer.transform(raw_conn, http_ctx)
                    if event:
                        self.batch.append(event)
                        if len(self.batch) >= self.batch_size:
                            self.flush_batch()

            self.last_offset = f.tell()

        if self.batch and (time.time() - self.last_flush) >= self.flush_interval:
            self.flush_batch()

    def run_loop(self, poll_interval: float = 0.5):
        logger.info(f"Iniciando monitoreo de Zeek en {self.conn_path} -> {self.api_url}")
        while True:
            try:
                self.process_available_lines()
                time.sleep(poll_interval)
            except KeyboardInterrupt:
                logger.info("Deteniendo adaptador por señal de usuario...")
                self.flush_batch()
                break
            except Exception as e:
                logger.error(f"Error inesperado en loop de streaming: {e}")
                time.sleep(1.0)


def main():
    parser = argparse.ArgumentParser(description="Zeek Live Streaming Adapter to XDR Platform")
    parser.add_argument("--log-dir", default=os.getenv("ZEEK_LOG_PATH", "/zeek_logs"), help="Directorio de logs de Zeek")
    parser.add_argument("--api-url", default=os.getenv("API_URL", "http://api-ml:8000/api/v1/analyze-network"), help="Endpoint XDR")
    parser.add_argument("--batch-size", type=int, default=int(os.getenv("BATCH_SIZE", "20")), help="Tamaño de lote")
    parser.add_argument("--flush-interval", type=float, default=float(os.getenv("FLUSH_INTERVAL", "1.0")), help="Intervalo de flush")
    parser.add_argument("--dry-run", action="store_true", help="Modo offline de prueba sin envíos HTTP")
    parser.add_argument("--once", action="store_true", help="Procesa el archivo actual una sola vez y sale")
    args = parser.parse_args()

    adapter = ZeekStreamAdapter(
        log_dir=args.log_dir,
        api_url=args.api_url,
        batch_size=args.batch_size,
        flush_interval=args.flush_interval,
        dry_run=args.dry_run
    )

    if args.once:
        adapter.process_available_lines()
        adapter.flush_batch()
        logger.info(f"Finalizado modo --once. Eventos procesados: {adapter.processed_count}")
    else:
        adapter.run_loop()

if __name__ == "__main__":
    main()
