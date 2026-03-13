-- Habilitar la extensión de TimescaleDB (Debe hacerse primero)
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ==========================================
-- TABLAS RELACIONALES (POSTGRESQL PURO)
-- ==========================================

-- Tabla de Nodos descubiertos en la red
CREATE TABLE NodosRed (
    id_nodo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    direccion_mac MACADDR NOT NULL UNIQUE,
    direccion_ip INET NOT NULL,
    hostname VARCHAR(255),
    fecha_descubrimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Catálogo de Reglas de Detección Estáticas
CREATE TABLE ReglasDeteccion (
    id_regla UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_regla VARCHAR(150) NOT NULL,
    condicion_sql TEXT NOT NULL,
    nivel_severidad INT CHECK (nivel_severidad BETWEEN 1 AND 5)
);

-- ==========================================
-- TABLAS DE SERIES DE TIEMPO (TIMESCALEDB)
-- ==========================================

-- Tabla de hechos: Tráfico de red normalizado
CREATE TABLE TraficoNormalizado (
    time TIMESTAMPTZ NOT NULL, -- Columna obligatoria para Timescale
    id_nodo_origen UUID REFERENCES NodosRed(id_nodo),
    id_nodo_destino UUID REFERENCES NodosRed(id_nodo),
    protocolo VARCHAR(10),
    puerto_origen INT,
    puerto_destino INT,
    bytes_enviados BIGINT,
    payload_hash VARCHAR(64)
);

-- Convertir la tabla normal a una Hypertable particionada por 'time'
-- Se particiona en fragmentos (chunks) de 1 día por defecto
SELECT create_hypertable('TraficoNormalizado', 'time');

-- Tabla de hechos: Alertas generadas por el sistema XDR
CREATE TABLE AlertasXDR (
    time TIMESTAMPTZ NOT NULL,
    id_alerta UUID DEFAULT gen_random_uuid(),
    id_nodo_afectado UUID REFERENCES NodosRed(id_nodo),
    tipo_deteccion VARCHAR(50) CHECK (tipo_deteccion IN ('Regla Estática', 'Machine Learning')),
    descripcion TEXT,
    estado VARCHAR(20) DEFAULT 'Activa'
);

-- Convertir tabla de alertas a Hypertable
SELECT create_hypertable('AlertasXDR', 'time');
