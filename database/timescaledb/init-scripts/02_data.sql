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

-- 2. POBLAR DATOS MOCK DE TOPOLOGÍA
-- Insertar Dispositivos (UUIDs fijos para mantener consistencia en la prueba)
INSERT INTO dispositivos (id_dispositivo, mac_address, id_tipo, id_metodo_descubrimiento, es_critico) VALUES 
('11111111-1111-1111-1111-111111111111', '00:1A:2B:3C:4D:5E', 2, 2, FALSE), -- Workstation
('22222222-2222-2222-2222-222222222222', '00:1A:2B:3C:4D:5F', 3, 1, TRUE),  -- Database Server
('33333333-3333-3333-3333-333333333333', '00:1A:2B:3C:4D:60', 5, 1, TRUE);   -- Router

-- Insertar IPs Históricas para esos dispositivos
INSERT INTO dispositivo_ips (id_dispositivo, direccion_ip, hostname, activa) VALUES
('11111111-1111-1111-1111-111111111111', '192.168.1.45', 'desktop-dev', TRUE),
('22222222-2222-2222-2222-222222222222', '192.168.1.100', 'db-prod', TRUE),
('33333333-3333-3333-3333-333333333333', '192.168.1.1', 'gateway', TRUE);

-- 3. POBLAR FLUJOS DE TRÁFICO (Mock)
INSERT INTO flujos_trafico (
    time, id_flujo, zeek_uid, id_origen, id_destino, ip_origen, ip_destino, puerto_origen, puerto_destino, protocolo_transporte,
    flow_duration, flow_bytes_s, flow_packets_s, subflow_fwd_bytes, subflow_bwd_bytes, subflow_fwd_packets, act_data_pkt_fwd,
    fwd_header_length, bwd_header_length, fwd_packet_length_max, bwd_packet_length_max, bwd_packet_length_min, down_up_ratio, average_packet_size,
    es_anomalia, probabilidad_anomalia
) VALUES 
(NOW() - INTERVAL '10 minutes', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'CWEs1Dummy001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '192.168.1.45', '192.168.1.100', 54321, 5432, 6,
 1000.0, 50.0, 10.0, 500.0, 500.0, 5.0, 4.0, 100.0, 100.0, 100.0, 100.0, 50.0, 1.0, 100.0, FALSE, 0.05),

(NOW() - INTERVAL '5 minutes', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'CWEs1Dummy002', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '192.168.1.45', '192.168.1.100', 54322, 5432, 6,
 1500000.0, 95000.0, 1500.0, 90000.0, 5000.0, 1400.0, 1300.0, 28000.0, 2000.0, 1500.0, 100.0, 0.0, 0.05, 1450.0, TRUE, 0.92);

-- 4. POBLAR ALERTAS (Replicando la estructura esperada por el Frontend)
INSERT INTO alertas_xdr (
    time, id_flujo_relacionado, time_flujo_relacionado, id_dispositivo_afectado, id_severidad, id_estado, tipo_deteccion, tipo_ataque, descripcion
) VALUES 
(NOW() - INTERVAL '5 minutes', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', NOW() - INTERVAL '5 minutes', '11111111-1111-1111-1111-111111111111', 3, 1, 'Machine Learning', 'VOLUMETRICO', 'Posible intrusión detectada en el segmento de red. Flujo anómalo detectado por ML.');