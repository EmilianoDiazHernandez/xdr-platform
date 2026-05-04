-- ==========================================
-- 01. EXTENSIONES
-- ==========================================
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- ==========================================
-- 02. CATÁLOGOS (Normalización y Consistencia)
-- ==========================================
-- Estos catálogos armonizan los datos esperados por el ML, el Frontend y la DB.
CREATE TABLE cat_severidad (
    id_severidad INT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    -- Ej: 'Baja', 'Media', 'Alta' (Para Frontend)
    peso_numerico INT NOT NULL -- Ej: 1 a 5 (Para ML Backend)
);
CREATE TABLE cat_estados_alerta (
    id_estado INT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE -- 'nueva', 'en_revision', 'mitigada', 'falsa_alarma'
);
CREATE TABLE cat_tipos_dispositivo (
    id_tipo INT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE -- 'workstation', 'server', 'iot', 'router', 'unknown'
);
CREATE TABLE cat_metodos_descubrimiento (
    id_metodo INT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE -- 'activo', 'pasivo', 'agente'
);
-- ==========================================
-- 03. ENTIDADES PRINCIPALES (3NF Estricta)
-- ==========================================
-- Tabla central de Identidad Física (Hardware)
CREATE TABLE dispositivos (
    id_dispositivo UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mac_address MACADDR NOT NULL UNIQUE,
    id_tipo INT NOT NULL REFERENCES cat_tipos_dispositivo(id_tipo),
    id_metodo_descubrimiento INT NOT NULL REFERENCES cat_metodos_descubrimiento(id_metodo),
    fecha_descubrimiento TIMESTAMPTZ DEFAULT NOW(),
    es_critico BOOLEAN DEFAULT FALSE
);
-- Historial de asignación de IPs (Soluciona la pérdida de historial DHCP)
CREATE TABLE dispositivo_ips (
    id_asignacion BIGSERIAL PRIMARY KEY,
    id_dispositivo UUID NOT NULL REFERENCES dispositivos(id_dispositivo) ON DELETE CASCADE,
    direccion_ip INET NOT NULL,
    hostname VARCHAR(255),
    fecha_asignacion TIMESTAMPTZ DEFAULT NOW(),
    activa BOOLEAN DEFAULT TRUE,
    -- Garantiza que no haya duplicidad de historial para la misma IP en el mismo dispositivo
    CONSTRAINT unica_ip_activa_por_dispositivo UNIQUE (id_dispositivo, direccion_ip)
);
-- Catálogo de reglas estáticas
CREATE TABLE reglas_deteccion (
    id_regla UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre_regla VARCHAR(150) NOT NULL,
    condicion_sql TEXT NOT NULL,
    id_severidad INT NOT NULL REFERENCES cat_severidad(id_severidad),
    activa BOOLEAN DEFAULT TRUE
);
-- ==========================================
-- 04. TABLAS DE HECHOS (Series de Tiempo ACID)
-- ==========================================
CREATE TABLE flujos_trafico (
    time TIMESTAMPTZ NOT NULL,
    id_flujo UUID NOT NULL DEFAULT uuid_generate_v4(),
    zeek_uid VARCHAR(50) NOT NULL,
    -- Identidad en la Topología
    id_origen UUID NOT NULL REFERENCES dispositivos(id_dispositivo),
    id_destino UUID NOT NULL REFERENCES dispositivos(id_dispositivo),
    -- Inmutabilidad Forense (Fotografía exacta del momento)
    ip_origen INET NOT NULL,
    ip_destino INET NOT NULL,
    puerto_origen INT NOT NULL,
    puerto_destino INT NOT NULL,
    protocolo_transporte INT NOT NULL,
    -- Features ML (Random Forest)
    flow_duration FLOAT8 NOT NULL,
    flow_bytes_s FLOAT8 NOT NULL,
    flow_packets_s FLOAT8 NOT NULL,
    subflow_fwd_bytes FLOAT8 NOT NULL,
    subflow_bwd_bytes FLOAT8 NOT NULL,
    subflow_fwd_packets FLOAT8 NOT NULL,
    act_data_pkt_fwd FLOAT8 NOT NULL,
    fwd_header_length FLOAT8 NOT NULL,
    bwd_header_length FLOAT8 NOT NULL,
    fwd_packet_length_max FLOAT8 NOT NULL,
    bwd_packet_length_max FLOAT8 NOT NULL,
    bwd_packet_length_min FLOAT8 NOT NULL,
    down_up_ratio FLOAT8 NOT NULL,
    average_packet_size FLOAT8 NOT NULL,
    es_anomalia BOOLEAN DEFAULT FALSE,
    probabilidad_anomalia FLOAT4,
    -- Timescale requiere la columna de tiempo en la PK
    PRIMARY KEY (time, id_flujo)
);
SELECT create_hypertable('flujos_trafico', 'time');
CREATE TABLE alertas_xdr (
    time TIMESTAMPTZ NOT NULL,
    id_alerta BIGSERIAL NOT NULL,
    id_flujo_relacionado UUID,
    time_flujo_relacionado TIMESTAMPTZ,
    id_dispositivo_afectado UUID NOT NULL REFERENCES dispositivos(id_dispositivo),
    id_severidad INT NOT NULL REFERENCES cat_severidad(id_severidad),
    id_estado INT NOT NULL REFERENCES cat_estados_alerta(id_estado),
    id_regla UUID REFERENCES reglas_deteccion(id_regla),
    tipo_deteccion TEXT NOT NULL CHECK (
        tipo_deteccion IN ('Regla Estática', 'Machine Learning')
    ),
    tipo_ataque TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    fecha_actualizacion TIMESTAMPTZ DEFAULT NOW(),
    -- ¡Fíjate que aquí ya NO hay coma al final!
    PRIMARY KEY (time, id_alerta)
);
SELECT create_hypertable('alertas_xdr', 'time');
-- ==========================================
-- 05. VISTAS DE INTEGRACIÓN (FRONTEND)
-- ==========================================
-- Genera exactamente el JSON / Interfaz TS que consume el frontend
CREATE OR REPLACE VIEW vista_alertas_frontend AS
SELECT a.id_alerta AS id,
    COALESCE(
        host(f.ip_origen),
        host(di.direccion_ip),
        '0.0.0.0'
    ) AS ip_origen,
    to_char(a.time, 'YYYY-MM-DD HH24:MI:SS') AS timestamp,
    s.nombre AS severidad,
    a.descripcion
FROM alertas_xdr a
    LEFT JOIN flujos_trafico f ON a.id_flujo_relacionado = f.id_flujo
    AND a.time_flujo_relacionado = f.time
    LEFT JOIN dispositivo_ips di ON a.id_dispositivo_afectado = di.id_dispositivo
    AND di.activa = TRUE
    JOIN cat_severidad s ON a.id_severidad = s.id_severidad
ORDER BY a.time DESC;
-- ==========================================
-- 06. INICIALIZACIÓN DE CATÁLOGOS (Requisito para FastAPI)
-- ==========================================
-- Catálogo de Severidad
INSERT INTO cat_severidad (id_severidad, nombre, peso_numerico)
VALUES (1, 'Baja', 1),
    (2, 'Media', 3),
    (3, 'Alta', 5) ON CONFLICT DO NOTHING;
-- Catálogo de Estados de Alerta
INSERT INTO cat_estados_alerta (id_estado, nombre)
VALUES (1, 'nueva'),
    (2, 'en_revision'),
    (3, 'mitigada'),
    (4, 'falsa_alarma') ON CONFLICT DO NOTHING;
-- Tipos de Dispositivo
INSERT INTO cat_tipos_dispositivo (id_tipo, nombre)
VALUES (1, 'workstation'),
    (2, 'server'),
    (3, 'iot'),
    (4, 'router'),
    (5, 'unknown') ON CONFLICT DO NOTHING;
-- Métodos de descubrimiento
INSERT INTO cat_metodos_descubrimiento (id_metodo, nombre)
VALUES (1, 'activo'),
    (2, 'pasivo'),
    (3, 'agente') ON CONFLICT DO NOTHING;
-- Dispositivo "Desconocido" por defecto (Para evitar fallos de Foreign Key si no hay IP registrada)
INSERT INTO dispositivos (
        id_dispositivo,
        mac_address,
        id_tipo,
        id_metodo_descubrimiento
    )
VALUES (
        '00000000-0000-0000-0000-000000000000',
        '00:00:00:00:00:00',
        5,
        2
    ) ON CONFLICT DO NOTHING;