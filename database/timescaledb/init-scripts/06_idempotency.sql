-- ==========================================
-- 06. REGISTRO DE IDEMPOTENCIA DE INGESTA
-- ==========================================

CREATE TABLE IF NOT EXISTS registro_idempotencia (
    idempotency_key VARCHAR(128) PRIMARY KEY,
    payload_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    response_data JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotencia_created ON registro_idempotencia(created_at);
