import pandas as pd
import numpy as np
import re
from scipy.sparse import hstack, csr_matrix
from src.ml_engine.model_loader import ModelLoader

def limpiar_fuga_datos(texto):
    t = str(texto).lower()
    t = re.sub(r'x-[a-z\-]+:.*', '', t)
    t = re.sub(r'forwarded by.*', '', t)
    t = re.sub(r'enron', 'empresa', t)
    t = re.sub(r'houston', 'ciudad', t)
    return t

def analyze_email(log):
    models = ModelLoader.get('email')
    if not models.get('model'):
        raise Exception("Modelo EMAIL no cargado.")

    email_intel = models['intel']
    columnas_email = models['columnas_estructuradas']

    urls_norm = [re.sub(r'^https?://', '', u.lower().strip()).rstrip('/') for u in log.urls_extraidas]
    num_maliciosas = sum(1 for u in urls_norm if u in email_intel)

    feat_dict = log.model_dump(exclude={'host', 'ip_local', 'texto_completo', 'urls_extraidas'})
    feat_dict['num_urls_maliciosas'] = num_maliciosas
    feat_dict['en_lista_negra'] = 1 if num_maliciosas > 0 else 0

    df_struct = pd.DataFrame([feat_dict])
    for col in columnas_email:
        if col not in df_struct.columns:
            df_struct[col] = 0
    X_struct = df_struct[columnas_email].values.astype(np.float64)

    texto_limpio = limpiar_fuga_datos(log.texto_completo)

    X_struct_scaled = models['scaler'].transform(X_struct)
    X_tfidf = models['vectorizer'].transform([texto_limpio]).astype(np.float32)
    X_final = hstack([X_tfidf, csr_matrix(X_struct_scaled)])
    probs = models['model'].predict_proba(X_final)[0]

    config_email = models['config']
    idx_phish = config_email.get('idx_phishing', 2)
    idx_spam = config_email.get('idx_spam', 1)
    prob_phish = float(probs[idx_phish]) if len(probs) > idx_phish else 0.0
    prob_spam = float(probs[idx_spam]) if len(probs) > idx_spam else 0.0

    return prob_phish, prob_spam, num_maliciosas
