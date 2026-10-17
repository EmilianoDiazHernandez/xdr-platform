-- ==========================================
-- 08. CORRELACIÓN BATCH (CAMPAÑAS / SLOW AND LOW)
-- ==========================================

CREATE TABLE campanas_xdr (
    id_campana UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre_campana VARCHAR(255) NOT NULL,
    fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
    descripcion TEXT,
    estado VARCHAR(50) DEFAULT 'Activa' CHECK (estado IN ('Activa', 'Mitigada', 'Cerrada'))
);

ALTER TABLE eventos_correlacionados
ADD COLUMN id_campana UUID REFERENCES campanas_xdr(id_campana) ON DELETE SET NULL;

CREATE INDEX idx_eventos_corr_campana ON eventos_correlacionados(id_campana);
