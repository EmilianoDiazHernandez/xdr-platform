from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

def identificar_sensor(request: Request) -> str:
    return request.headers.get("X-Sensor-ID", get_remote_address(request))

limiter = Limiter(key_func=identificar_sensor)
