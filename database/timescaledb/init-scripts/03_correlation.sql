-- ==========================================
-- 07. CORRELACIÓN DE EVENTOS (ATTACK FLOW)
-- ==========================================

CREATE TABLE eventos_correlacionados (
    id_evento_correlacionado UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_dispositivo_origen UUID NOT NULL REFERENCES dispositivos(id_dispositivo),
    fecha_inicio TIMESTAMPTZ DEFAULT NOW(),
    fecha_actualizacion TIMESTAMPTZ DEFAULT NOW(),
    estado VARCHAR(50) DEFAULT 'Abierto' CHECK (estado IN ('Abierto', 'Cerrado')),
    severidad_global INT DEFAULT 1,
    probabilidad_global FLOAT DEFAULT 0.0,
    attack_flow JSONB DEFAULT '[]'::jsonb
);

-- Alterar alertas_xdr para vincularlas a un evento correlacionado
ALTER TABLE alertas_xdr
ADD COLUMN id_evento_correlacionado UUID REFERENCES eventos_correlacionados(id_evento_correlacionado) ON DELETE SET NULL;

-- Índice para búsquedas eficientes por dispositivo y estado
CREATE INDEX idx_eventos_corr_disp_estado ON eventos_correlacionados(id_dispositivo_origen, estado);
