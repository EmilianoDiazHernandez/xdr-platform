-- ==========================================
-- INSERCIÓN DE DATOS DE PRUEBA Y CATÁLOGOS
-- ==========================================

-- 1. POBLAR CATÁLOGOS (Requeridos por la aplicación)
INSERT INTO cat_severidad (id_severidad, nombre, peso_numerico) VALUES 
(1, 'Baja', 1),
(2, 'Media', 3),
(3, 'Alta', 4),
(4, 'Crítica', 5)
ON CONFLICT DO NOTHING;

INSERT INTO cat_estados_alerta (id_estado, nombre) VALUES 
(1, 'nueva'), 
(2, 'en_revision'), 
(3, 'mitigada'), 
(4, 'falsa_alarma')
ON CONFLICT DO NOTHING;

INSERT INTO cat_tipos_dispositivo (id_tipo, nombre) VALUES 
(1, 'unknown'), 
(2, 'workstation'), 
(3, 'server'), 
(4, 'iot'), 
(5, 'router')
ON CONFLICT DO NOTHING;

INSERT INTO cat_metodos_descubrimiento (id_metodo, nombre) VALUES 
(1, 'activo'), 
(2, 'pasivo'), 
(3, 'agente')
ON CONFLICT DO NOTHING;