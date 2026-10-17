import logging

def extract_features(entry):
    """Calcula las 14 features requeridas por el modelo Random Forest (CICFlowMeter Style)."""
    try:
        duration = float(entry.get('duration', 0.0) if entry.get('duration', '-') != '-' else 0.0)
        orig_bytes = float(entry.get('orig_bytes', 0) if entry.get('orig_bytes', '-') != '-' else 0)
        resp_bytes = float(entry.get('resp_bytes', 0) if entry.get('resp_bytes', '-') != '-' else 0)
        orig_pkts = float(entry.get('orig_pkts', 0) if entry.get('orig_pkts', '-') != '-' else 0)
        resp_pkts = float(entry.get('resp_pkts', 0) if entry.get('resp_pkts', '-') != '-' else 0)
        
        orig_ip_bytes = float(entry.get('orig_ip_bytes', 0) if entry.get('orig_ip_bytes', '-') != '-' else orig_bytes + (orig_pkts * 20))
        resp_ip_bytes = float(entry.get('resp_ip_bytes', 0) if entry.get('resp_ip_bytes', '-') != '-' else resp_bytes + (resp_pkts * 20))
        
        duration_usec = duration * 1e6 if duration > 0 else 1.0
        flow_bytes_s = ((orig_bytes + resp_bytes) / (duration_usec / 1e6)) if duration > 0 else 0.0
        flow_packets_s = ((orig_pkts + resp_pkts) / (duration_usec / 1e6)) if duration > 0 else 0.0
        down_up_ratio = (resp_bytes / orig_bytes) if orig_bytes > 0 else 0.0
        avg_pkt_size = ((orig_bytes + resp_bytes) / (orig_pkts + resp_pkts)) if (orig_pkts + resp_pkts) > 0 else 0.0

        fwd_header_len = orig_ip_bytes - orig_bytes
        bwd_header_len = resp_ip_bytes - resp_bytes

        return {
            "Flow_Duration": duration_usec,
            "Flow_Bytes_s": flow_bytes_s,
            "Flow_Packets_s": flow_packets_s,
            "Subflow_Fwd_Bytes": orig_bytes,
            "Subflow_Bwd_Bytes": resp_bytes,
            "Subflow_Fwd_Packets": orig_pkts,
            "act_data_pkt_fwd": max(0, orig_pkts - 1),
            "Fwd_Header_Length": fwd_header_len if fwd_header_len >= 0 else orig_pkts * 20,
            "Bwd_Header_Length": bwd_header_len if bwd_header_len >= 0 else resp_pkts * 20,
            "Fwd_Packet_Length_Max": (orig_bytes / orig_pkts) if orig_pkts > 0 else 0.0,
            "Bwd_Packet_Length_Max": (resp_bytes / resp_pkts) if resp_pkts > 0 else 0.0,
            "Bwd_Packet_Length_Min": 0.0,
            "Down_Up_Ratio": down_up_ratio,
            "Average_Packet_Size": avg_pkt_size
        }
    except Exception as e:
        logging.error(f"Error calculando features en transformer.py: {e}")
        return None
