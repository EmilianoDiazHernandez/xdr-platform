-- ==========================================
-- INSERCION DE DATOS DE PRUEBA (Prototipo 1)
-- ==========================================

-- Insertar nodos de prueba
INSERT INTO NodosRed (direccion_mac, direccion_ip, hostname) VALUES
('00:1A:2B:3C:4D:5E', '192.168.1.10', 'Laptop-Emiliano'),
('00:1A:2B:3C:4D:5F', '192.168.1.11', 'Servidor-Web'),
('00:1A:2B:3C:4D:60', '192.168.1.1', 'Router-Principal')
ON CONFLICT (direccion_mac) DO NOTHING;

-- Insertar tráfico de red simulado (usando los IPs recién creados)
INSERT INTO TraficoNormalizado (time, id_nodo_origen, id_nodo_destino, protocolo, puerto_origen, puerto_destino, bytes_enviados)
SELECT 
    NOW() - (random() * (interval '1 hour')), -- Tiempo aleatorio en la última hora
    (SELECT id_nodo FROM NodosRed WHERE hostname = 'Laptop-Emiliano'),
    (SELECT id_nodo FROM NodosRed WHERE hostname = 'Servidor-Web'),
    'TCP', 
    54321, 
    443, 
    1500;
