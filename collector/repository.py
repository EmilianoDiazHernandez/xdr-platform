import psycopg2
import hashlib
import uuid
import logging

class XDRRepository:
    """Maneja exclusivamente las operaciones ACID en TimescaleDB."""
    def __init__(self, db_config):
        self.db_config = db_config
        self.conn = None
        self.cur = None
        self.connect()

    def connect(self):
        try:
            self.conn = psycopg2.connect(**self.db_config)
            self.cur = self.conn.cursor()
            logging.info("Conexión a TimescaleDB establecida en repository.py")
        except Exception as e:
            logging.error(f"Error conectando a la DB: {e}")

    def get_or_create_device(self, ip):
        """Implementa descubrimiento pasivo y gestión de identidad 3NF."""
        try:
            self.cur.execute("SELECT id_dispositivo FROM dispositivo_ips WHERE direccion_ip = %s AND activa = TRUE", (ip,))
            row = self.cur.fetchone()
            if row: return row[0]
            
            # Generar MAC dummy determinística
            hash_ip = hashlib.md5(ip.encode()).hexdigest()
            mac = f"02:{hash_ip[0:2]}:{hash_ip[2:4]}:{hash_ip[4:6]}:{hash_ip[6:8]}:{hash_ip[8:10]}"
            
            self.cur.execute(
                "INSERT INTO dispositivos (mac_address, id_tipo, id_metodo_descubrimiento) VALUES (%s, 1, 2) ON CONFLICT (mac_address) DO NOTHING",
                (mac,)
            )
            self.cur.execute("SELECT id_dispositivo FROM dispositivos WHERE mac_address = %s", (mac,))
            dev_id = self.cur.fetchone()[0]
            
            self.cur.execute(
                "INSERT INTO dispositivo_ips (id_dispositivo, direccion_ip, activa) VALUES (%s, %s, TRUE) ON CONFLICT DO NOTHING",
                (dev_id, ip)
            )
            return dev_id
        except Exception as e:
            logging.error(f"Error en get_or_create_device: {e}")
            self.conn.rollback()
            return None

    def save_flow_and_alert(self, entry, features, ml_result, orig_ip, resp_ip, orig_p, resp_p, proto_num):
        """Guarda el flujo y la alerta en una sola transacción ACID."""
        try:
            id_origen = self.get_or_create_device(orig_ip)
            id_destino = self.get_or_create_device(resp_ip)
            flujo_id = str(uuid.uuid4())
            ts = float(entry['ts'])
            zeek_uid = entry.get('uid', 'unknown')
            
            es_anomalia = ml_result.get("es_anomalia", False)
            probabilidad = ml_result.get("detalles_rf", {}).get("probabilidad", 0.0)
            tipo_ataque = ml_result.get("tipo_detectado", "NINGUNA")

            # 1. Insertar Flujo
            self.cur.execute(
                """
                INSERT INTO flujos_trafico (
                    id_flujo, time, zeek_uid, id_origen, id_destino, ip_origen, ip_destino, 
                    puerto_origen, puerto_destino, protocolo_transporte,
                    flow_duration, flow_bytes_s, flow_packets_s, subflow_fwd_bytes,
                    subflow_bwd_bytes, subflow_fwd_packets, act_data_pkt_fwd,
                    fwd_header_length, bwd_header_length, fwd_packet_length_max,
                    bwd_packet_length_max, bwd_packet_length_min, down_up_ratio,
                    average_packet_size, es_anomalia, probabilidad_anomalia
                ) VALUES (
                    %s, to_timestamp(%s), %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                """,
                (
                    flujo_id, ts, zeek_uid, id_origen, id_destino, orig_ip, resp_ip, orig_p, resp_p, proto_num,
                    features["Flow_Duration"], features["Flow_Bytes_s"], features["Flow_Packets_s"], features["Subflow_Fwd_Bytes"],
                    features["Subflow_Bwd_Bytes"], features["Subflow_Fwd_Packets"], features["act_data_pkt_fwd"],
                    features["Fwd_Header_Length"], features["Bwd_Header_Length"], features["Fwd_Packet_Length_Max"],
                    features["Bwd_Packet_Length_Max"], features["Bwd_Packet_Length_Min"], features["Down_Up_Ratio"],
                    features["Average_Packet_Size"], es_anomalia, probabilidad
                )
            )
            
            # 2. Insertar Alerta si aplica
            if es_anomalia:
                self.cur.execute(
                    """
                    INSERT INTO alertas_xdr (
                        time, id_flujo_relacionado, time_flujo_relacionado, id_dispositivo_afectado, 
                        id_severidad, id_estado, tipo_deteccion, tipo_ataque, descripcion
                    ) VALUES (to_timestamp(%s), %s, to_timestamp(%s), %s, 3, 1, 'Machine Learning', %s, %s)
                    """,
                    (ts, flujo_id, ts, id_origen, tipo_ataque, f"Anomalía detectada por ML: {tipo_ataque}")
                )
            
            self.conn.commit()
            return True
        except Exception as e:
            logging.error(f"Error persistiendo datos en repository.py: {e}")
            self.conn.rollback()
            return False
