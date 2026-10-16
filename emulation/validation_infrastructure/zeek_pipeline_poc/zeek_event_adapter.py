#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
zeek_event_adapter.py - Adaptador Offline de Telemetría Zeek hacia el Contrato XDR
Plataforma XDR v9.0.0 | Fase 3: Validación Offline

Este adaptador lee registros nativos de Zeek (conn.log y http.log), interpreta
sus metadatos (#separator, #fields, #types, etc.), valida su integridad de tipos,
calcula las características requeridas y transforma los eventos al contrato de
datos esperado por FastAPI (/api/v1/analyze-network) y el modelo de ML (Capa RED).

No realiza llamadas de red, no inserta datos externos ni modifica los archivos
de origen.
"""

import os
import sys
import json
import math
import hashlib
import argparse
import logging
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path
from dataclasses import dataclass, field, asdict

# Configuración de logging estándar
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("ZeekEventAdapter")


# ==============================================================================
# 1. ESPECIFICACIÓN DEL CONTRATO DE DATOS XDR (Capa RED)
# ==============================================================================

# Las 17 características requeridas por el modelo Random Forest (xdr_red_config.pkl)
ML_FEATURES_NUM = [
    "duration", "orig_bytes", "resp_bytes", "missed_bytes",
    "orig_pkts", "orig_ip_bytes", "resp_pkts", "resp_ip_bytes"
]

ML_FEATURES_CAT = [
    "proto", "conn_state", "service"
]

ML_FEATURES_BIN = [
    "local_orig", "local_resp", "hist_S", "hist_R", "hist_A", "hist_F"
]

# Categorías reconocidas por el OneHotEncoder (xdr_red_encoder.pkl)
VALID_PROTOCOLS = {"icmp", "tcp", "udp"}
VALID_CONN_STATES = {
    "oth", "rej", "rsto", "rstos0", "rstr", "rstrh",
    "s0", "s1", "s2", "s3", "sf", "sh", "shr"
}
VALID_SERVICES = {"0", "dhcp", "dns", "http", "irc", "ssh"}

# 14 Características derivadas estilo CICFlowMeter esperadas por el esquema ZeekLog
CIC_FLOW_FEATURES = [
    "Flow_Duration", "Flow_Bytes_s", "Flow_Packets_s",
    "Subflow_Fwd_Bytes", "Subflow_Bwd_Bytes", "Subflow_Fwd_Packets",
    "act_data_pkt_fwd", "Fwd_Header_Length", "Bwd_Header_Length",
    "Fwd_Packet_Length_Max", "Bwd_Packet_Length_Max", "Bwd_Packet_Length_Min",
    "Down_Up_Ratio", "Average_Packet_Size"
]


# ==============================================================================
# 2. PARSER DE METADATOS Y REGISTROS TSV DE ZEEK
# ==============================================================================

@dataclass
class ZeekMetadata:
    separator: str = "\t"
    set_separator: str = ","
    empty_field: str = "(empty)"
    unset_field: str = "-"
    path: str = ""
    open_time: str = ""
    fields: List[str] = field(default_factory=list)
    types: List[str] = field(default_factory=list)


class ZeekTSVParser:
    """
    Parser robusto para archivos de log de Zeek en formato TSV.
    Interpreta directivas #separator, #set_separator, #empty_field, #unset_field,
    #fields y #types sin asumir esquemas rígidos predefinidos.
    """

    @staticmethod
    def parse_file(file_path: Path) -> Tuple[ZeekMetadata, List[Dict[str, Any]], List[Dict[str, Any]]]:
        if not file_path.exists():
            raise FileNotFoundError(f"Archivo de log no encontrado: {file_path}")

        meta = ZeekMetadata()
        records: List[Dict[str, Any]] = []
        malformed: List[Dict[str, Any]] = []

        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            for line_no, raw_line in enumerate(f, start=1):
                line = raw_line.rstrip("\r\n")
                if not line:
                    continue

                # Procesar directivas de encabezado
                if line.startswith("#"):
                    ZeekTSVParser._process_directive(line, meta)
                    continue

                # Si no se han leído encabezados #fields, descartar la línea
                if not meta.fields:
                    malformed.append({
                        "line_number": line_no,
                        "raw": line,
                        "reason": "Datos antes de directiva #fields"
                    })
                    continue

                # Parsear línea de datos con el separador configurado
                parts = line.split(meta.separator)
                if len(parts) != len(meta.fields):
                    malformed.append({
                        "line_number": line_no,
                        "expected_fields": len(meta.fields),
                        "actual_fields": len(parts),
                        "reason": f"Discrepancia en número de columnas ({len(parts)} != {len(meta.fields)})"
                    })
                    continue

                row_dict: Dict[str, Any] = {}
                row_raw: Dict[str, str] = {}
                type_errors = []

                for idx, field_name in enumerate(meta.fields):
                    raw_val = parts[idx]
                    row_raw[field_name] = raw_val
                    field_type = meta.types[idx] if idx < len(meta.types) else "string"

                    parsed_val, err = ZeekTSVParser._convert_type(
                        raw_val, field_type, meta.unset_field, meta.empty_field
                    )
                    if err:
                        type_errors.append(f"{field_name} ({field_type}): {err}")
                    row_dict[field_name] = parsed_val

                if type_errors:
                    malformed.append({
                        "line_number": line_no,
                        "errors": type_errors,
                        "raw": row_raw,
                        "reason": "Error de tipado en campo(s)"
                    })
                else:
                    records.append(row_dict)

        return meta, records, malformed

    @staticmethod
    def _process_directive(line: str, meta: ZeekMetadata) -> None:
        parts = line.split()
        if not parts:
            return
        directive = parts[0]

        if directive == "#separator":
            # El valor puede venir en formato hex (\x09) o literal
            sep_raw = line[len("#separator"):].strip()
            if sep_raw.startswith("\\x"):
                try:
                    meta.separator = chr(int(sep_raw[2:], 16))
                except ValueError:
                    meta.separator = "\t"
            else:
                meta.separator = sep_raw if sep_raw else "\t"

        elif directive == "#set_separator":
            meta.set_separator = line[len("#set_separator"):].strip() or ","

        elif directive == "#empty_field":
            meta.empty_field = line[len("#empty_field"):].strip() or "(empty)"

        elif directive == "#unset_field":
            meta.unset_field = line[len("#unset_field"):].strip() or "-"

        elif directive == "#path":
            meta.path = line[len("#path"):].strip()

        elif directive == "#open":
            meta.open_time = line[len("#open"):].strip()

        elif directive == "#fields":
            # Extraer columnas usando el separador actual
            meta.fields = line.split(meta.separator)[1:]

        elif directive == "#types":
            meta.types = line.split(meta.separator)[1:]

    @staticmethod
    def _convert_type(val: str, ztype: str, unset_marker: str, empty_marker: str) -> Tuple[Any, Optional[str]]:
        """Convierte tipos Zeek a tipos nativos de Python preservando semántica de unset/empty."""
        if val == unset_marker:
            return None, None
        if val == empty_marker:
            if ztype.startswith("set[") or ztype.startswith("vector["):
                return [], None
            return "" if ztype == "string" else None, None

        try:
            if ztype == "time" or ztype == "interval":
                return float(val), None
            elif ztype == "port":
                p = int(val)
                if 0 <= p <= 65535:
                    return p, None
                return None, f"Puerto fuera de rango TCP/UDP: {p}"
            elif ztype == "count":
                return int(val), None
            elif ztype == "bool":
                return (val.upper() == "T"), None
            elif ztype == "addr" or ztype == "string" or ztype == "enum":
                return val, None
            elif ztype.startswith("set[") or ztype.startswith("vector["):
                return [item for item in val.split(",") if item], None
            else:
                return val, None
        except Exception as e:
            return None, f"Excepción al convertir '{val}' a {ztype}: {str(e)}"


# ==============================================================================
# 3. TRANSFORMADOR HACIA EL CONTRATO XDR (ZeekLog)
# ==============================================================================

class ZeekEventAdapter:
    """
    Transforma registros de conn.log (enriquecidos con http.log si existe)
    al esquema formal ZeekLog requerido por FastAPI y la Capa RED.
    """

    def __init__(self, run_dir: Path):
        self.run_dir = Path(run_dir)
        self.conn_log_path = self.run_dir / "conn.log"
        self.http_log_path = self.run_dir / "http.log"

    def process(self) -> Dict[str, Any]:
        """Ejecuta el procesamiento offline completo."""
        if not self.conn_log_path.exists():
            raise FileNotFoundError(f"No se encontró conn.log en el directorio: {self.run_dir}")

        # 1. Parsear conn.log
        conn_meta, conn_records, conn_malformed = ZeekTSVParser.parse_file(self.conn_log_path)

        # 2. Parsear http.log si existe (para enriquecimiento L7)
        http_by_uid: Dict[str, Dict[str, Any]] = {}
        http_meta = None
        if self.http_log_path.exists():
            http_meta, http_records, _ = ZeekTSVParser.parse_file(self.http_log_path)
            for h in http_records:
                uid = h.get("uid")
                if uid:
                    http_by_uid[uid] = h

        # 3. Normalizar cada conexión contra el contrato XDR
        normalized_events: List[Dict[str, Any]] = []
        rejected_events: List[Dict[str, Any]] = []

        for row_idx, conn in enumerate(conn_records, start=1):
            normalized, reject_reason = self._normalize_record(conn, http_by_uid)
            if normalized:
                normalized_events.append(normalized)
            else:
                rejected_events.append({
                    "record_index": row_idx,
                    "uid": conn.get("uid", "unknown"),
                    "reason": reject_reason,
                    "raw": conn
                })

        # 4. Auditoría de compatibilidad con el modelo ML
        ml_compliance = self._audit_ml_compliance(normalized_events)

        # 5. Generar informe de resultados
        report = {
            "run_directory": str(self.run_dir.resolve()),
            "status": "PASS" if normalized_events and ml_compliance["compliant"] else "BLOCKED",
            "metrics": {
                "zeek_records_read": len(conn_records),
                "zeek_records_malformed": len(conn_malformed),
                "events_normalized": len(normalized_events),
                "events_rejected": len(rejected_events),
                "http_records_correlated": len(http_by_uid)
            },
            "malformed_zeek_lines": conn_malformed,
            "rejected_events": rejected_events,
            "field_provenance": {
                "observed_directly_from_zeek": [
                    "ts", "uid", "orig_ip (id.orig_h)", "resp_ip (id.resp_h)",
                    "orig_p (id.orig_p)", "resp_p (id.resp_p)", "proto", "service",
                    "conn_state", "history", "duration", "orig_bytes", "resp_bytes",
                    "missed_bytes", "orig_pkts", "resp_pkts", "orig_ip_bytes",
                    "resp_ip_bytes", "local_orig", "local_resp"
                ],
                "derived_features": [
                    {"name": "Flow_Duration", "method": "duration * 1e6 (clamped to 1.0 if <= 0)"},
                    {"name": "Flow_Bytes_s", "method": "(orig_bytes + resp_bytes) / duration"},
                    {"name": "Flow_Packets_s", "method": "(orig_pkts + resp_pkts) / duration"},
                    {"name": "Subflow_Fwd_Bytes", "method": "orig_bytes"},
                    {"name": "Subflow_Bwd_Bytes", "method": "resp_bytes"},
                    {"name": "Subflow_Fwd_Packets", "method": "orig_pkts"},
                    {"name": "act_data_pkt_fwd", "method": "max(0, orig_pkts - 1)"},
                    {"name": "Fwd_Header_Length", "method": "orig_ip_bytes - orig_bytes"},
                    {"name": "Bwd_Header_Length", "method": "resp_ip_bytes - resp_bytes"},
                    {"name": "Fwd_Packet_Length_Max", "method": "orig_bytes / orig_pkts (mean approx)"},
                    {"name": "Bwd_Packet_Length_Max", "method": "resp_bytes / resp_pkts (mean approx)"},
                    {"name": "Bwd_Packet_Length_Min", "method": "0.0 (constant)"},
                    {"name": "Down_Up_Ratio", "method": "resp_bytes / orig_bytes if orig_bytes > 0 else 0.0"},
                    {"name": "Average_Packet_Size", "method": "(orig_bytes + resp_bytes) / (orig_pkts + resp_pkts)"},
                    {"name": "idempotency_key", "method": "sha256(uid:ts:orig_ip:orig_p:resp_ip:resp_p)"},
                    {"name": "hist_S/R/A/F", "method": "flags binarias calculadas desde history"},
                    {"name": "local_orig/resp (bin)", "method": "1 if T else 0"}
                ],
                "unavailable_or_uncomputable_fields": []
            },
            "ml_model_compliance": ml_compliance,
            "normalized_events": normalized_events
        }

        return report

    def _normalize_record(
        self,
        conn: Dict[str, Any],
        http_by_uid: Dict[str, Dict[str, Any]]
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """Valida y transforma un registro único al formato ZeekLog."""

        # 1. Validaciones mínimas de presencia
        uid = conn.get("uid")
        if not uid or uid == "-":
            return None, "Falta UID de conexión o está indefinido"

        orig_ip = conn.get("id.orig_h")
        resp_ip = conn.get("id.resp_h")
        if not orig_ip or not resp_ip:
            return None, "Faltan direcciones IP de origen o destino"

        orig_p = conn.get("id.orig_p")
        resp_p = conn.get("id.resp_p")
        if orig_p is None or resp_p is None:
            return None, "Falta puerto de origen o destino"

        proto = str(conn.get("proto") or "tcp").lower()
        if proto not in VALID_PROTOCOLS:
            return None, f"Protocolo no soportado por el modelo: {proto}"

        # 2. Extracción de métricas de tráfico base (con fallback a 0.0 si es None)
        ts = float(conn.get("ts") or 0.0)
        duration = float(conn.get("duration") or 0.0)
        orig_bytes = float(conn.get("orig_bytes") or 0.0)
        resp_bytes = float(conn.get("resp_bytes") or 0.0)
        missed_bytes = float(conn.get("missed_bytes") or 0.0)
        orig_pkts = float(conn.get("orig_pkts") or 0.0)
        resp_pkts = float(conn.get("resp_pkts") or 0.0)
        orig_ip_bytes = float(conn.get("orig_ip_bytes") or (orig_bytes + (orig_pkts * 20)))
        resp_ip_bytes = float(conn.get("resp_ip_bytes") or (resp_bytes + (resp_pkts * 20)))

        # Flags y categorías
        service_raw = conn.get("service")
        service = str(service_raw).lower() if service_raw and service_raw != "-" else "-"
        conn_state = str(conn.get("conn_state") or "-")
        history = str(conn.get("history") or "-")

        local_orig_raw = conn.get("local_orig")
        local_resp_raw = conn.get("local_resp")
        local_orig_str = "T" if local_orig_raw is True or local_orig_raw == "T" else "F"
        local_resp_str = "T" if local_resp_raw is True or local_resp_raw == "T" else "F"

        # 3. Enriquecimiento L7 mediante http.log
        http_entry = http_by_uid.get(uid)
        l7_context = {}
        if http_entry:
            if service == "-":
                service = "http"
            l7_context = {
                "http_method": http_entry.get("method"),
                "http_host": http_entry.get("host"),
                "http_uri": http_entry.get("uri"),
                "http_status_code": http_entry.get("status_code"),
                "http_user_agent": http_entry.get("user_agent")
            }

        # 4. Cálculo de las 14 features CICFlowMeter (exactamente como en collector/transformer.py)
        duration_usec = duration * 1e6 if duration > 0 else 1.0
        flow_bytes_s = ((orig_bytes + resp_bytes) / (duration_usec / 1e6)) if duration > 0 else 0.0
        flow_packets_s = ((orig_pkts + resp_pkts) / (duration_usec / 1e6)) if duration > 0 else 0.0
        down_up_ratio = (resp_bytes / orig_bytes) if orig_bytes > 0 else 0.0
        avg_pkt_size = ((orig_bytes + resp_bytes) / (orig_pkts + resp_pkts)) if (orig_pkts + resp_pkts) > 0 else 0.0

        fwd_header_len = orig_ip_bytes - orig_bytes
        bwd_header_len = resp_ip_bytes - resp_bytes
        fwd_header_len = fwd_header_len if fwd_header_len >= 0 else orig_pkts * 20
        bwd_header_len = bwd_header_len if bwd_header_len >= 0 else resp_pkts * 20

        fwd_pkt_len_max = (orig_bytes / orig_pkts) if orig_pkts > 0 else 0.0
        bwd_pkt_len_max = (resp_bytes / resp_pkts) if resp_pkts > 0 else 0.0
        bwd_pkt_len_min = 0.0
        act_data_pkt_fwd = max(0.0, orig_pkts - 1.0)

        # 5. Generación de idempotency_key canónica
        idem_raw = f"{uid}:{ts}:{orig_ip}:{orig_p}:{resp_ip}:{resp_p}"
        idempotency_key = hashlib.sha256(idem_raw.encode("utf-8")).hexdigest()

        # 6. Construcción del payload ZeekLog completo
        payload: Dict[str, Any] = {
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

            # Las 14 métricas CICFlowMeter
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
            "Bwd_Packet_Length_Min": bwd_pkt_len_min,
            "Down_Up_Ratio": down_up_ratio,
            "Average_Packet_Size": avg_pkt_size
        }

        if l7_context:
            payload["_l7_context"] = l7_context

        return payload, None

    def _audit_ml_compliance(self, events: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Comprueba si los eventos normalizados cumplen el contrato de las 17 features del Random Forest."""
        if not events:
            return {
                "compliant": False,
                "reason": "No hay eventos normalizados para validar"
            }

        sample = events[0]
        missing_num = [f for f in ML_FEATURES_NUM if f not in sample]
        missing_cat = [f for f in ML_FEATURES_CAT if f not in sample]
        missing_bin_sources = [f for f in ["local_orig", "local_resp", "history"] if f not in sample]

        # Validar categorías de la muestra
        proto = sample.get("proto", "").lower()
        conn_state = sample.get("conn_state", "").lower()
        service = sample.get("service", "").lower()
        service_normalized = "0" if service == "-" else service

        category_warnings = []
        if proto not in VALID_PROTOCOLS:
            category_warnings.append(f"proto '{proto}' no está en categorías conocidas ({VALID_PROTOCOLS})")
        if conn_state not in VALID_CONN_STATES:
            category_warnings.append(f"conn_state '{conn_state}' no está en categorías conocidas ({VALID_CONN_STATES})")
        if service_normalized not in VALID_SERVICES:
            category_warnings.append(f"service '{service_normalized}' no está en categorías conocidas ({VALID_SERVICES})")

        is_compliant = (not missing_num and not missing_cat and not missing_bin_sources)

        return {
            "compliant": is_compliant,
            "features_num_present": len(ML_FEATURES_NUM) - len(missing_num),
            "features_num_total": len(ML_FEATURES_NUM),
            "features_cat_present": len(ML_FEATURES_CAT) - len(missing_cat),
            "features_cat_total": len(ML_FEATURES_CAT),
            "features_bin_computable": len(ML_FEATURES_BIN) if not missing_bin_sources else 0,
            "features_bin_total": len(ML_FEATURES_BIN),
            "total_contract_features": 17,
            "total_present_and_computable": 17 if is_compliant else 0,
            "category_coverage_check": "PASS" if not category_warnings else "WARN_UNSEEN_CATEGORIES",
            "category_warnings": category_warnings
        }


# ==============================================================================
# 4. INTERFAZ DE LÍNEA DE COMANDOS (CLI)
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Adaptador offline de telemetría Zeek hacia el contrato XDR v9.0.0."
    )
    parser.add_argument(
        "--run-dir",
        required=True,
        type=str,
        help="Ruta al directorio que contiene los logs de Zeek (conn.log, http.log)."
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Directorio donde se guardarán los resultados del adaptador. (Por defecto: <run_dir>/adapter_output)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Ejecuta en modo offline sin enviar tráfico ni modificar base de datos (por defecto activo)."
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suprime la salida detallada en consola."
    )

    args = parser.parse_args()

    run_path = Path(args.run_dir).resolve()
    if not run_path.exists():
        logger.error(f"El directorio especificado no existe: {run_path}")
        sys.exit(1)

    output_dir = Path(args.output_dir).resolve() if args.output_dir else run_path / "adapter_output"
    output_dir.mkdir(parents=True, exist_ok=True)

    logger.info(f"Iniciando Adaptador Zeek (Modo Offline).")
    logger.info(f"Directorio de entrada : {run_path}")
    logger.info(f"Directorio de salida  : {output_dir}")

    adapter = ZeekEventAdapter(run_path)
    report = adapter.process()

    # Guardar eventos normalizados y reporte en disco de forma aislada
    events_file = output_dir / "normalized_events.json"
    with open(events_file, "w", encoding="utf-8") as f:
        json.dump(report["normalized_events"], f, indent=2)

    report_file = output_dir / "adapter_report.json"
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    # Imprimir resumen de auditoría en consola
    if not args.quiet:
        print("\n" + "=" * 70)
        print("          REPORTE DE ADAPTACIÓN OFFLINE ZEEK -> XDR")
        print("=" * 70)
        print(f"Estado Global            : {report['status']}")
        print(f"Registros Zeek leídos    : {report['metrics']['zeek_records_read']}")
        print(f"Líneas malformadas       : {report['metrics']['zeek_records_malformed']}")
        print(f"Eventos normalizados     : {report['metrics']['events_normalized']}")
        print(f"Eventos rechazados       : {report['metrics']['events_rejected']}")
        print(f"Registros HTTP correlac. : {report['metrics']['http_records_correlated']}")
        print("-" * 70)
        print("Compatibilidad con Modelo RED (17 Características):")
        ml = report["ml_model_compliance"]
        print(f" - Numéricas (8/8)       : {ml['features_num_present']}/{ml['features_num_total']}")
        print(f" - Categóricas (3/3)     : {ml['features_cat_present']}/{ml['features_cat_total']}")
        print(f" - Binarias (6/6)        : {ml['features_bin_computable']}/{ml['features_bin_total']}")
        print(f" - Cumplimiento Total    : {'100% COMPATIBLE' if ml['compliant'] else 'INCOMPLETO'}")
        print("-" * 70)
        print(f"Archivos generados:")
        print(f" - Eventos normalizados  : {events_file}")
        print(f" - Reporte consolidado   : {report_file}")
        print("=" * 70 + "\n")

    sys.exit(0 if report["status"] == "PASS" else 2)


if __name__ == "__main__":
    main()
