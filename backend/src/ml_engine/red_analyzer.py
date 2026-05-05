import numpy as np
import pandas as pd
from src.ml_engine.model_loader import ModelLoader

def get_port_range(port):
    if port in [80, 443, 8080, 8443]:
        return 'web'
    elif port in [53, 5353]:
        return 'dns'
    elif port in [22, 23, 3389]:
        return 'remote'
    elif port in [25, 587, 993, 465]:
        return 'mail'
    elif 1 <= port <= 1024:
        return 'privileged'
    elif 1025 <= port <= 49151:
        return 'registered'
    else:
        return 'dynamic'

def analyze_network(log):
    models = ModelLoader.get('red')
    if not models.get('model'):
        raise Exception("Modelo RED no cargado.")

    rf_scaler = models['scaler']
    rf_encoder = models['encoder']
    rf_modelo = models['model']
    config_red = models['config']
    
    features_num_red = config_red.get('features_num', [])
    features_cat_red = config_red.get('features_cat', [])

    # 1. Variables Binarias
    hist = log.history.lower() if log.history else ""
    hist_S = 1 if 's' in hist else 0
    hist_R = 1 if 'r' in hist else 0
    hist_A = 1 if 'a' in hist else 0
    hist_F = 1 if 'f' in hist else 0

    loc_orig = 1 if log.local_orig.upper() == 'T' else 0
    loc_resp = 1 if log.local_resp.upper() == 'T' else 0
    bin_data = np.array([[loc_orig, loc_resp, hist_S, hist_R, hist_A, hist_F]], dtype=np.float64)

    # 2. Variables Numéricas
    num_dict = log.model_dump(include=set(features_num_red))
    df_num = pd.DataFrame([num_dict])[features_num_red]
    for col in features_num_red:
        df_num[col] = np.log1p(df_num[col].clip(lower=0))
    X_num_scaled = rf_scaler.transform(df_num)

    # 3. Variables Categóricas
    cat_cols_to_extract = set(features_cat_red) - {'port_range'}
    cat_dict = log.model_dump(include=cat_cols_to_extract)
    
    for k, v in cat_dict.items():
        val = str(v).strip().lower()
        cat_dict[k] = "0" if val == "-" else val

    puerto_destino = getattr(log, 'id_resp_p', 0) 
    cat_dict['port_range'] = get_port_range(int(puerto_destino))

    df_cat = pd.DataFrame([cat_dict])[features_cat_red]
    X_cat_encoded = rf_encoder.transform(df_cat)

    # 4. Fusión y Predicción
    X_final = np.hstack((X_num_scaled, X_cat_encoded, bin_data))
    probs = rf_modelo.predict_proba(X_final)
    prob_red = float(probs[0][1])

    return prob_red
