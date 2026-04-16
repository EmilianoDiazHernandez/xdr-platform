import numpy as np
import pandas as pd

# Mapeo de nombres del sensor hacia los nombres con los que se entrenó el modelo
FIELD_MAP = {
    'Flow_Duration':         'Flow Duration',
    'Flow_Bytes_s':          'Flow Bytes/s',
    'Flow_Packets_s':        'Flow Packets/s',
    'Subflow_Fwd_Bytes':     'Subflow Fwd Bytes',
    'Subflow_Bwd_Bytes':     'Subflow Bwd Bytes',
    'Subflow_Fwd_Packets':   'Subflow Fwd Packets',
    'act_data_pkt_fwd':      'act_data_pkt_fwd',
    'Fwd_Header_Length':     'Fwd Header Length',
    'Bwd_Header_Length':     'Bwd Header Length',
    'Fwd_Packet_Length_Max': 'Fwd Packet Length Max',
    'Bwd_Packet_Length_Max': 'Bwd Packet Length Max',
    'Bwd_Packet_Length_Min': 'Bwd Packet Length Min',
    'Down_Up_Ratio':         'Down/Up Ratio',
    'Average_Packet_Size':   'Average Packet Size',
}

def prepare_for_rf(log_dict, features_list, config):
    """Transforma el diccionario de entrada en un DataFrame listo para el Scaler y RF."""
    # 1. Mapeo de campos
    datos_cic = {FIELD_MAP[k]: v 
                 for k, v in log_dict.items() 
                 if k in FIELD_MAP}
    
    df = pd.DataFrame([datos_cic])[features_list]
    
    # 2. Aplicar log1p a las columnas configuradas durante el entrenamiento
    for col in config.get('columnas_log1p', []):
        if col in df.columns:
            df[col] = np.log1p(df[col].clip(lower=0))
            
    return df
