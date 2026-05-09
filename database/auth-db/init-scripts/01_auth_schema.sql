-- EXTENSIONES
-- Requerido para la generación de UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- TABLA DE USUARIOS
-- Almacena la información de identidad y rol para el control de acceso.
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, -- Almacenado como texto para hashing en backend
    role VARCHAR(50) NOT NULL CHECK (role IN ('security_analyst', 'sys_admin', 'auditor')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLA DE LOGS DE AUDITORÍA
-- Registra acciones críticas y su impacto en el sistema.
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_description TEXT NOT NULL,
    impact_level VARCHAR(10) NOT NULL CHECK (impact_level IN ('low', 'medium', 'high')),
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- EJEMPLOS DE INSERCIÓN
-- ==========================================

-- Insertando usuarios de ejemplo con diferentes roles
-- Nota: En un entorno real, password_hash contendría el hash real
INSERT INTO users (username, password_hash, role) VALUES 
('analista_01', '$2b$12$ExAmPlEHaShFoRAnAlYsT01vErYSeCuRe', 'security_analyst'),
('admin_sistema', '$2b$12$ExAmPlEHaShFoRAdMiN01vErYSeCuRe', 'sys_admin'),
('auditor_externo', '$2b$12$ExAmPlEHaShFoRAuDiToR01vErYSeCuRe', 'auditor');

-- Ejemplo de un log de auditoría
INSERT INTO audit_logs (user_id, action_description, impact_level)
SELECT id, 'Actualización de política de red en firewall perimetral', 'high'
FROM users WHERE username = 'admin_sistema';
