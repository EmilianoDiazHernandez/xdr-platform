# Análisis de Errores - Proyecto XDR

Durante el análisis del proyecto y la comunicación entre los servicios de Docker Compose, se han identificado los siguientes errores:

## 1. Mala configuración de volúmenes en `sensor-network-collector`
**Archivo:** `docker-compose.yml`
**Problema:** En el servicio `sensor-network-collector`, el volumen está configurado como `- ./logs:/logs`. Sin embargo, la carpeta `logs` no existe en la raíz del proyecto (la ruta real es `collector/logs`).
**Consecuencia:** Docker crea una carpeta vacía y el script de Python crea un archivo `conn.log` vacío dentro del contenedor. El recolector se queda escuchando un archivo sin datos y nunca envía tráfico a la API de ML, impidiendo la comunicación inicial.
**Solución propuesta:** Cambiar el volumen a `- ./collector/logs:/logs`.

## 2. Inicialización faltante de la Base de Datos en `api-reports`
**Archivo:** `backend/src/reports/api.py`
**Problema:** La aplicación FastAPI (`app = FastAPI(title="XDR Report Service")`) no tiene configurado ningún evento de inicio (`lifespan`) ni llama a `Database.connect()`. 
**Consecuencia:** Cuando se intenta generar un reporte llamando a `/api/v1/reports/generate`, el método `Database.get_pool()` devuelve `None`. Esto provoca que se devuelva un DataFrame vacío y se lance la excepción *"No hay alertas en la base de datos para generar el reporte."*, fallando siempre la generación del reporte.
**Solución propuesta:** Importar el `lifespan` desde `src.core.lifespan` y agregarlo a la instancia de FastAPI, o bien llamar a `Database.connect()` explícitamente al inicio de `api-reports`.

## 3. Falta de dependencia en docker-compose para api-reports
**Archivo:** `docker-compose.yml`
**Problema:** El servicio `api-reports` necesita conectarse a la base de datos `timescaledb` para generar los reportes, pero no tiene configurado un bloque `depends_on`.
**Consecuencia:** En un entorno limpio, `api-reports` podría intentar arrancar (y conectarse a la DB si se corrige el error 2) antes de que `timescaledb` esté listo, provocando fallos en el inicio del contenedor.
**Solución propuesta:** Añadir `depends_on:\n      - timescaledb` al servicio `api-reports` en el `docker-compose.yml`.

## 4. Archivo de Base de Datos temporal (Neo4j y Auth)
**Archivo:** `docker-compose.yml`
**Problema:** Existen dos contenedores (`auth-db` y `neo4j`) que se están construyendo e inicializando, pero el código fuente actual (en `api-ml` y `api-reports`) no parece tener integración o dependencias activas con ellos para los flujos principales (el frontend está usando endpoints estáticos/abiertos y no hay mención de `auth-db` en las URL de conexión del backend).
**Consecuencia:** Consumo innecesario de recursos. Aunque no impide directamente la comunicación de los módulos clave, agrega complejidad a la red y a los logs.
**Solución propuesta:** Comentar estos servicios temporalmente mientras se estabilizan los módulos críticos o agregar la configuración de entorno en el backend si se supone que se debían usar.
