# Arquitectura y Comunicación de Módulos - Plataforma XDR

Este documento describe la arquitectura técnica del proyecto y cómo interactúan los distintos módulos para lograr la recolección, análisis, almacenamiento y visualización de amenazas (XDR).

## Diagrama de Comunicación General

1. **Recolección:** `sensor-network-collector` → `api-ml`
2. **Análisis y Correlación:** `api-ml` ↔ `redis`
3. **Persistencia:** `api-ml` → `timescaledb`
4. **Reportes:** `api-reports` ↔ `timescaledb`
5. **Visualización:** `frontend` ↔ `api-ml` / `api-reports`

---

## 1. Recolector de Red (`sensor-network-collector`)
Es un script en Python diseñado para ejecutarse cerca de los sensores de red (como Zeek).
- **Entrada:** Escucha continuamente el archivo de logs `/logs/conn.log` generado por Zeek.
- **Procesamiento:** Transforma las líneas del log crudo en un diccionario estructurado y calcula características (features) necesarias para los modelos de Machine Learning (como duración de flujo, bytes enviados/recibidos, etc.).
- **Comunicación:** Agrupa los eventos en lotes (batches) de 50 por defecto y los envía mediante peticiones HTTP `POST` a la URL expuesta por el Motor de ML: `http://api-ml:8000/api/v1/analyze-network`.

## 2. Motor de Machine Learning (`api-ml`)
Es el núcleo analítico de la plataforma XDR, construido con FastAPI.
- **Entrada HTTP:** Recibe telemetría desde los colectores en sus endpoints de red (`/analyze-network`), endpoint y correo electrónico.
- **Análisis:** Utiliza modelos en memoria (`ModelLoader`) que se cargan durante el inicio del servidor (`lifespan`). Los flujos pasan por heurística rápida y luego por modelos de Machine Learning (Random Forest, Redes Neuronales) para detectar anomalías.
- **Servicio de Fusión:** Correlaciona eventos (ej. un ataque de red y una ejecución anómala en el endpoint) para calcular la severidad y la probabilidad general de ataque (FusionXDR).
- **Comunicación con Redis:** Conecta con el contenedor `redis` por el puerto 6379 para registrar y consultar alertas en tiempo real, lo que ayuda a correlacionar eventos recientes sin sobrecargar la base de datos relacional.
- **Persistencia Asíncrona:** A través de tareas en segundo plano (`BackgroundTasks`), envía los flujos de tráfico y alertas detectadas hacia `timescaledb`.

## 3. Base de Datos Principal (`timescaledb`)
Es un motor PostgreSQL con la extensión TimescaleDB, optimizado para series de tiempo.
- **Función:** Actúa como la fuente de la verdad para todo el histórico a largo plazo. Almacena identidades de dispositivos, mapeos de IPs, flujos de tráfico (`flujos_trafico`), eventos EDR (`eventos_endpoint`) y la unificación de alertas (`alertas_xdr`).
- **Interfaces:** Es consultada por `api-ml` (para guardar datos asíncronamente) y por `api-reports` (para leer datos y generar estadísticas).

## 4. Motor de Reportes (`api-reports`)
Microservicio independiente en FastAPI especializado en la generación de documentos PDF.
- **Acceso a Datos:** Conecta de forma directa a `timescaledb` mediante un pool de conexiones con `asyncpg` para recuperar las últimas alertas y eventos registrados en el sistema.
- **Procesamiento:** Procesa los datos extraídos utilizando librerías como Pandas y Matplotlib para calcular métricas de seguridad y generar gráficas.
- **Renderizado:** Integra la información y las gráficas base64 en plantillas HTML con Jinja2, las cuales finalmente se convierten a archivos PDF mediante WeasyPrint.
- **Exposición:** Provee el endpoint `/api/v1/reports/generate` para que otros clientes soliciten el documento final.

## 5. Dashboard Web (`frontend`)
Aplicación web moderna desarrollada en React con TypeScript y empaquetada con Vite (preparada para escritorio con Tauri).
- **Consumo de APIS:**
  - Realiza peticiones `GET` a `http://localhost:8000/api/v1/alertas` (Motor ML) para actualizar en vivo el panel de alertas de seguridad del dashboard.
  - Ejecuta peticiones `POST` a `http://localhost:8001/api/v1/reports/generate` (Motor de Reportes) para solicitar y descargar los reportes ejecutivos generados.
- **Presentación:** Muestra la topología, estadísticas críticas e historial de alertas, manteniéndose completamente desacoplado de la lógica interna gracias a la comunicación vía APIs REST estandarizadas.

## 6. Bases de Datos Futuras (`auth-db`, `neo4j`)
Actualmente en desarrollo o desactivadas en `docker-compose.yml` para ahorrar recursos. En una iteración futura:
- **`auth-db`:** Manejará de forma separada la autenticación y sesiones de los usuarios.
- **`neo4j`:** Modelará la topología de la red empresarial como un grafo, permitiendo análisis avanzados de movimientos laterales de atacantes (Kill Chain).
