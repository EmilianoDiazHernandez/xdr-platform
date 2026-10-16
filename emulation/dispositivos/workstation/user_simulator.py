import os
import time
import threading
import logging
import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

class UserTrafficSimulator:
    def __init__(self, target_url: str = "http://172.16.0.10/", interval: int = 20):
        self.target_url = target_url
        self.interval = interval
        self.running = False
        self.thread = None

    def start(self):
        if not self.running:
            self.running = True
            self.thread = threading.Thread(target=self._loop, daemon=True)
            self.thread.start()
            logging.info(f"Simulador de tráfico benigno iniciado hacia {self.target_url}")

    def stop(self):
        self.running = False
        logging.info("Simulador de tráfico benigno detenido.")

    def send_one_request(self) -> dict:
        try:
            t0 = time.time()
            res = requests.get(self.target_url, timeout=5.0)
            duration = round(time.time() - t0, 3)
            logging.info(f"Petición benigna a {self.target_url}: HTTP {res.status_code} ({duration}s)")
            return {"status": "success", "http_status": res.status_code, "duration_s": duration}
        except Exception as e:
            logging.warning(f"Error en petición benigna a {self.target_url}: {e}")
            return {"status": "error", "error": str(e)}

    def _loop(self):
        while self.running:
            self.send_one_request()
            time.sleep(self.interval)
