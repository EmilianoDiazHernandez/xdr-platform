import requests
import logging

class MLClient:
    """Maneja exclusivamente la comunicación con el Backend de FastAPI."""
    def __init__(self, api_url):
        self.api_url = api_url

    def analyze(self, orig_ip, resp_p, features):
        """Envía las features al modelo y maneja errores de red."""
        payload = {
            "orig_ip": orig_ip,
            "resp_p": resp_p,
            **features
        }
        try:
            response = requests.post(self.api_url, json=payload, timeout=2.0)
            if response.status_code == 200:
                return response.json().get("analisis", {})
            else:
                logging.error(f"API Error (HTTP {response.status_code}): {response.text}")
        except Exception as e:
            logging.error(f"API ML inaccesible o timeout en client_api.py: {e}")
        
        # Fallback seguro en caso de error de red
        return {
            "es_anomalia": False,
            "tipo_detectado": "ERROR_CONEXION",
            "detalles_rf": {"probabilidad": 0.0}
        }
