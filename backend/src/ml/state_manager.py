from collections import defaultdict, deque
import time

class TemporalStateManager:
    """Gestiona la memoria temporal de flujos por IP para el modelo de anomalías (IF)."""
    def __init__(self, window_size=200):
        self.ventanas_ip = defaultdict(lambda: deque(maxlen=window_size))

    def add_flow(self, ip, flow_data):
        """Añade un flujo a la ventana de la IP con el timestamp actual."""
        flow_data['ts'] = time.time()
        self.ventanas_ip[ip].append(flow_data)

    def get_recent_window(self, ip, seconds=60):
        """Retorna los flujos de la última ventana de tiempo configurada."""
        ahora = time.time()
        return [f for f in self.ventanas_ip[ip] if ahora - f['ts'] <= seconds]

# Instancia global para ser usada por el orquestador
state_manager = TemporalStateManager()
