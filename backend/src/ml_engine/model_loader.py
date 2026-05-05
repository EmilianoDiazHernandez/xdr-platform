import joblib
import os
import warnings
from src.core.logger import logger

warnings.filterwarnings("ignore", category=UserWarning, module="sklearn")

class ModelLoader:
    _models = {}

    @classmethod
    def load_all(cls):
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        models_dir = os.path.join(base_dir, 'models_data')

        # --- Capa RED ---
        try:
            ruta_red = os.path.join(models_dir, 'CAPA_RED')
            cls._models['red'] = {
                'config': joblib.load(f'{ruta_red}/xdr_red_config.pkl'),
                'model': joblib.load(f'{ruta_red}/xdr_red_model.pkl'),
                'scaler': joblib.load(f'{ruta_red}/xdr_red_scaler.pkl'),
                'encoder': joblib.load(f'{ruta_red}/xdr_red_encoder.pkl')
            }
            logger.info("[OK] Capa RED cargada.")
        except Exception as e:
            logger.error(f"Falla Capa RED: {e}")

        # --- Capa ENDPOINT ---
        try:
            ruta_edr = os.path.join(models_dir, 'CAPA_ENDPOINT')
            config_edr = joblib.load(f'{ruta_edr}/xdr_endpoint_config.pkl')
            edr_vectorizador = joblib.load(f'{ruta_edr}/xdr_endpoint_vectorizer.pkl')
            edr_cadenas = joblib.load(f'{ruta_edr}/xdr_endpoint_cadenas.pkl')
            config_edr['cadenas_sospechosas'] = edr_cadenas
            
            columnas_completas = config_edr.get('columnas_x', [])
            vocabulario_nlp = list(edr_vectorizador.get_feature_names_out())
            columnas_estructuradas = [c for c in columnas_completas if c not in vocabulario_nlp]

            cls._models['edr'] = {
                'config': config_edr,
                'model': joblib.load(f'{ruta_edr}/xdr_endpoint_model.pkl'),
                'vectorizer': edr_vectorizador,
                'cadenas': edr_cadenas,
                'columnas_estructuradas': columnas_estructuradas
            }
            logger.info("[OK] Capa ENDPOINT cargada.")
        except Exception as e:
            logger.error(f"Falla Capa ENDPOINT: {e}")

        # --- Capa EMAIL ---
        try:
            ruta_email = os.path.join(models_dir, 'CAPA_EMAIL')
            config_email = joblib.load(f'{ruta_email}/xdr_email_config.pkl')
            email_intel = joblib.load(f'{ruta_email}/xdr_email_intel.pkl')

            cls._models['email'] = {
                'config': config_email,
                'model': joblib.load(f'{ruta_email}/xdr_email_model.pkl'),
                'vectorizer': joblib.load(f'{ruta_email}/xdr_email_vectorizer.pkl'),
                'scaler': joblib.load(f'{ruta_email}/xdr_email_scaler.pkl'),
                'intel': email_intel,
                'columnas_estructuradas': config_email.get('columnas_estructuradas', [])
            }
            logger.info(f"[OK] Capa EMAIL cargada. OSINT: {len(email_intel)} URLs en lista negra")
        except Exception as e:
            logger.error(f"Falla Capa EMAIL: {e}")

    @classmethod
    def get(cls, layer_name):
        return cls._models.get(layer_name, {})
