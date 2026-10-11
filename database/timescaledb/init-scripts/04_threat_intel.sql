-- Modificaciones para MITRE ATT&CK
ALTER TABLE reglas_deteccion ADD COLUMN IF NOT EXISTS mitre_technique_id VARCHAR(20) DEFAULT NULL;
ALTER TABLE reglas_deteccion ADD COLUMN IF NOT EXISTS mitre_tactic VARCHAR(100) DEFAULT NULL;

ALTER TABLE alertas_xdr ADD COLUMN IF NOT EXISTS mitre_technique_id VARCHAR(20) DEFAULT NULL;
ALTER TABLE alertas_xdr ADD COLUMN IF NOT EXISTS mitre_tactic VARCHAR(100) DEFAULT NULL;

-- Actualizar la vista para el frontend
DROP VIEW IF EXISTS vista_alertas_frontend;

CREATE VIEW vista_alertas_frontend AS
SELECT 
    a.id_alerta AS id,
    COALESCE(f.ip_origen, di.direccion_ip) AS ip_origen,
    a.time AS timestamp,
    s.nombre AS severidad,
    a.descripcion,
    a.mitre_technique_id,
    a.mitre_tactic
FROM alertas_xdr a
LEFT JOIN flujos_trafico f 
    ON a.id_flujo_relacionado = f.id_flujo AND a.time_flujo_relacionado = f.time
LEFT JOIN dispositivo_ips di 
    ON a.id_dispositivo_afectado = di.id_dispositivo AND di.activa = TRUE
JOIN cat_severidad s 
    ON a.id_severidad = s.id_severidad
ORDER BY a.time DESC;
