import sys
import os
import unittest

# Añadir el path de backend para importar src
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.services.decision_engine import DecisionEngine

class TestDecisionEngine(unittest.TestCase):
    def test_umbral_estricto_inferior(self):
        result = DecisionEngine.evaluate_incident(0.8499, False, 0.0, "Execution")
        self.assertFalse(result["escalar_alerta"])
        # La acción para un evento no escalado debe ser PERMITIR según el código base
        self.assertEqual(result["accion"], "PERMITIR")

    def test_umbral_estricto_exacto(self):
        result = DecisionEngine.evaluate_incident(0.8500, False, 0.0, "Execution")
        self.assertFalse(result["escalar_alerta"])
        self.assertEqual(result["accion"], "PERMITIR")

    def test_umbral_estricto_superior(self):
        result = DecisionEngine.evaluate_incident(0.8501, False, 0.0, "Execution")
        self.assertTrue(result["escalar_alerta"])
        # La acción para un evento escalado con severidad 2 es BLOQUEAR_PROCESO
        self.assertEqual(result["accion"], "BLOQUEAR_PROCESO")
        self.assertEqual(result["severidad"], "Media")

if __name__ == "__main__":
    unittest.main()
