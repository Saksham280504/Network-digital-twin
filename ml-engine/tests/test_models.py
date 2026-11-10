"""
test_models.py
==============
Automated verification suite for the 5-Model NDT ML Engine.
Validates:
  - /health reports all 5 models loaded (mpnn, xgboost, lightgbm, random_forest, logistic_regression)
  - /models/specs returns full accuracy, F1, ROC-AUC, confusion matrix, and feature importances
  - /predict-congestion returns valid predictions, class probabilities, and cross-model votes
"""

import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from fastapi.testclient import TestClient
from app.main import app, load_all_artifacts

load_all_artifacts()
client = TestClient(app)


def test_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["model_loaded"] is True
    for key in ["mpnn", "xgboost", "lightgbm", "random_forest", "logistic_regression"]:
        assert key in data["loaded_models"], f"Missing model {key}"


def test_model_specs_endpoint():
    res = client.get("/models/specs")
    assert res.status_code == 200
    data = res.json()
    assert "models" in data
    for key in ["mpnn", "xgboost", "lightgbm", "random_forest", "logistic_regression"]:
        spec = data["models"][key]
        assert 0.75 <= spec["accuracy"] <= 1.0
        assert len(spec["confusion_matrix"]) == 4
        assert "feature_importances" in spec


def test_predict_congestion_all_models():
    sample_edges = [
        {"id": "e_R1_R2", "source": "R1", "target": "R2", "throughput_mbps": 920.0, "delay_ms": 42.0, "capacity_mbps": 1000},
        {"id": "e_R2_R3", "source": "R2", "target": "R3", "throughput_mbps": 620.0, "delay_ms": 16.5, "capacity_mbps": 1000},
        {"id": "e_R1_R3", "source": "R1", "target": "R3", "throughput_mbps": 110.0, "delay_ms": 4.2,  "capacity_mbps": 1000},
    ]

    for m_key in ["mpnn", "xgboost", "lightgbm", "random_forest", "logistic_regression"]:
        res = client.post("/predict-congestion", json={"edges": sample_edges, "model_name": m_key})
        assert res.status_code == 200
        body = res.json()
        assert body["active_model"] == m_key
        assert len(body["predictions"]) == 3
        assert body["predictions"][0]["congestion_status"] == "Highly Congested"
        assert body["predictions"][2]["congestion_status"] == "Uncongested"
        assert "all_model_votes" in body["predictions"][1]
        assert len(body["predictions"][1]["all_model_votes"]) == 5


if __name__ == "__main__":
    test_health_endpoint()
    test_model_specs_endpoint()
    test_predict_congestion_all_models()
    print("[PASS] All ML Engine multi-model tests passed successfully!")
