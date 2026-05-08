import requests
import logging

class MLClient:
    """Maneja exclusivamente la comunicación con el Backend de FastAPI."""
    def __init__(self, api_url):
        self.api_url = api_url

    def analyze_batch(self, batch_data):
        """Envía un lote de logs al backend XDR para procesamiento masivo."""
        payload = []
        for entry, features in batch_data:
            log_item = {
                "ts": float(entry.get("ts", 0.0)),
                "uid": entry.get("uid", "unknown"),
                "orig_ip": entry.get("id.orig_h"),
                "resp_ip": entry.get("id.resp_h"),
                "orig_p": int(entry.get("id.orig_p", 0)),
                "resp_p": int(entry.get("id.resp_p", 0)),
                "proto": entry.get("proto", "tcp"),
                "service": entry.get("service", "-"),
                "conn_state": entry.get("conn_state", "-"),
                "history": entry.get("history", "-"),
                "duration": float(entry.get("duration", 0.0) if entry.get("duration", "-") != "-" else 0.0),
                "orig_bytes": float(entry.get("orig_bytes", 0.0) if entry.get("orig_bytes", "-") != "-" else 0.0),
                "resp_bytes": float(entry.get("resp_bytes", 0.0) if entry.get("resp_bytes", "-") != "-" else 0.0),
                "orig_pkts": float(entry.get("orig_pkts", 0.0) if entry.get("orig_pkts", "-") != "-" else 0.0),
                "resp_pkts": float(entry.get("resp_pkts", 0.0) if entry.get("resp_pkts", "-") != "-" else 0.0),
                "orig_ip_bytes": float(entry.get("orig_ip_bytes", 0.0) if entry.get("orig_ip_bytes", "-") != "-" else 0.0),
                "resp_ip_bytes": float(entry.get("resp_ip_bytes", 0.0) if entry.get("resp_ip_bytes", "-") != "-" else 0.0),
                "local_orig": entry.get("local_orig", "F"),
                "local_resp": entry.get("local_resp", "F"),
                **features
            }
            payload.append(log_item)
            
        try:
            response = requests.post(self.api_url, json=payload, timeout=10.0)
            if response.status_code == 200:
                return response.json().get("results", [])
            else:
                logging.error(f"Batch API Error (HTTP {response.status_code}): {response.text}")
        except Exception as e:
            logging.error(f"API ML inaccesible durante batch en client_api.py: {e}")
        
        return []
