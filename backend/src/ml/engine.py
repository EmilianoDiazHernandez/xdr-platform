import joblib
import os
import numpy as np
import pandas as pd
from pathlib import Path
from scipy.stats import entropy as scipy_entropy

class XDREngine:
    """Motor de detección que encapsula los modelos Random Forest e Isolation Forest."""
    def __init__(self, model_dir):
        self.model_dir = Path(model_dir)
        self.rf_model = None
        self.rf_scaler = None
        self.rf_features = []
        self.rf_config = None
        
        self.if_model = None
        self.if_scaler = None
        self.if_features = []
        self.if_umbral = -1.0

    def load_models(self):
        """Carga todos los archivos .pkl del directorio de modelos."""
        # Carga RF
        self.rf_config = joblib.load(self.model_dir / 'rf_zeek_config.pkl')
        self.rf_model = joblib.load(self.model_dir / 'rf_zeek_model.pkl')
        self.rf_scaler = joblib.load(self.model_dir / 'rf_zeek_scaler.pkl')
        self.rf_features = joblib.load(self.model_dir / 'rf_zeek_features.pkl')
        
        # Carga IF (Opcional)
        try:
            self.if_model = joblib.load(self.model_dir / 'if_temporal_model.pkl')
            self.if_scaler = joblib.load(self.model_dir / 'if_temporal_scaler.pkl')
            self.if_umbral = float(joblib.load(self.model_dir / 'if_temporal_umbral.pkl'))
            self.if_features = joblib.load(self.model_dir / 'if_temporal_features.pkl')
        except FileNotFoundError:
            pass

    def predict_volumetric(self, df_preprocessed):
        """Ejecuta la inferencia del modelo Random Forest."""
        X = self.rf_scaler.transform(df_preprocessed)
        prob = float(self.rf_model.predict_proba(X)[0][1])
        umbral = self.rf_config.get('umbral_rf', 0.30)
        return prob, prob >= umbral

    def predict_behavioral(self, recent_flows):
        """Ejecuta la inferencia del modelo Isolation Forest basado en comportamiento temporal."""
        if self.if_model is None or len(recent_flows) < 5:
            return 0.0, False

        puertos_lista = [f['puerto'] for f in recent_flows]
        conteo_puertos = pd.Series(puertos_lista).value_counts()
        entropy_val = float(scipy_entropy(conteo_puertos.values + 1))

        feats_if = {
            'n_conexiones':         len(recent_flows),
            'n_puertos_distintos':  len(set(puertos_lista)),
            'bytes_promedio':       float(np.mean([f['bytes'] for f in recent_flows])),
            'duracion_promedio':    float(np.mean([f['duracion'] for f in recent_flows])),
            'ratio_fallidas':       sum(1 for f in recent_flows if f['resp_bytes'] == 0) / len(recent_flows),
            'entropy_puertos':      entropy_val,
        }

        df_if = pd.DataFrame([feats_if])[self.if_features]
        X_if = self.if_scaler.transform(df_if)
        score = float(self.if_model.score_samples(X_if)[0])
        return score, score < self.if_umbral
