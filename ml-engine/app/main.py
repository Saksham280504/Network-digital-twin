"""
main.py
=======
FastAPI Multi-Model Microservice for the Predictive Network Digital Twin (NDT).

Endpoints
---------
  POST /predict-congestion   -> Multi-model inference + cross-model disagreement diagnostics
  GET  /models/specs         -> Full evaluation metrics, confusion matrices & feature importances
  GET  /health               -> Liveness & loaded-models probe
"""

import json
import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from typing import Dict, Any

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from app.schemas import (
    PredictRequest,
    PredictResponse,
    EdgePrediction,
    ModelVote,
    HealthResponse,
)
from app.mpnn_layer import build_feature_matrix_from_edges

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("ndt-ml-engine")

MODEL_KEYS = ["mpnn", "xgboost", "lightgbm", "random_forest", "logistic_regression"]
MODEL_DIR = os.path.join(_ROOT, "models")
ENCODER_PATH = os.environ.get("ML_ENCODER_PATH", os.path.join(MODEL_DIR, "label_encoder.joblib"))
BENCHMARK_PATH = os.path.join(MODEL_DIR, "model_benchmarks.json")

_state: Dict[str, Any] = {
    "models": {},
    "encoder": None,
    "benchmarks": {},
    "loaded": False,
}


def load_all_artifacts() -> None:
    """Loads all 5 trained model pipelines, the label encoder, and benchmark JSON."""
    if os.path.exists(ENCODER_PATH):
        _state["encoder"] = joblib.load(ENCODER_PATH)
        log.info(f"Loaded LabelEncoder -> {ENCODER_PATH}")

    loaded_models = {}
    for key in MODEL_KEYS:
        m_path = os.path.join(MODEL_DIR, f"{key}.joblib")
        if os.path.exists(m_path):
            loaded_models[key] = joblib.load(m_path)
            log.info(f"Loaded model [{key}] -> {m_path}")

    # Fallback if only legacy congestion_model.joblib exists
    legacy_path = os.path.join(MODEL_DIR, "congestion_model.joblib")
    if not loaded_models and os.path.exists(legacy_path):
        loaded_models["xgboost"] = joblib.load(legacy_path)
        loaded_models["mpnn"] = loaded_models["xgboost"]
        log.info(f"Loaded legacy model -> {legacy_path}")

    _state["models"] = loaded_models
    _state["loaded"] = len(loaded_models) > 0 and _state["encoder"] is not None

    if os.path.exists(BENCHMARK_PATH):
        with open(BENCHMARK_PATH, "r", encoding="utf-8") as f:
            _state["benchmarks"] = json.load(f)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("NDT Multi-Model ML Engine starting ...")
    try:
        load_all_artifacts()
    except Exception as exc:
        log.error(f"Error loading model artifacts: {exc}")
    yield
    log.info("NDT ML Engine shutting down ...")


app = FastAPI(
    title="NDT Multi-Model ML Engine",
    description=(
        "Predictive Network Digital Twin — Multi-Model Congestion Classification & "
        "Graph Message-Passing Microservice (MPNN, XGBoost, LightGBM, Random Forest, Logistic Regression)."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse, tags=["Monitoring"])
async def health():
    return HealthResponse(
        status="ok",
        model_loaded=_state["loaded"],
        loaded_models=list(_state["models"].keys()),
        version="2.0.0",
    )


@app.get("/models/specs", tags=["Model Benchmarking"])
async def get_model_specs():
    """Returns comprehensive evaluation metrics, confusion matrices, and specs for all 5 models."""
    if not _state["benchmarks"] and os.path.exists(BENCHMARK_PATH):
        with open(BENCHMARK_PATH, "r", encoding="utf-8") as f:
            _state["benchmarks"] = json.load(f)
    if not _state["benchmarks"]:
        raise HTTPException(status_code=404, detail="Model benchmark specs not found. Run `python train.py` first.")
    return _state["benchmarks"]


@app.post(
    "/predict-congestion",
    response_model=PredictResponse,
    tags=["Inference"],
    summary="Predict congestion status across all 5 ML models and return active model predictions",
)
async def predict_congestion(request: PredictRequest) -> PredictResponse:
    if not _state["loaded"]:
        load_all_artifacts()
        if not _state["loaded"]:
            raise HTTPException(
                status_code=503,
                detail="Models not loaded. Please run `python train.py` from ml-engine/.",
            )

    encoder = _state["encoder"]
    models_dict: Dict[str, Any] = _state["models"]

    requested_model = (request.model_name or "mpnn").lower()
    if requested_model not in models_dict:
        requested_model = "mpnn" if "mpnn" in models_dict else next(iter(models_dict.keys()))

    # 1. Build 10-column feature matrix with live 1-hop graph neighborhood aggregation
    X, enriched_meta = build_feature_matrix_from_edges(request.edges)
    class_labels = list(encoder.inverse_transform(range(len(encoder.classes_))))

    # 2. Run all loaded models to capture live comparison & per-edge voting
    all_model_outputs: Dict[str, Dict[str, Any]] = {}
    for m_key, pipe in models_dict.items():
        t0 = time.perf_counter()
        preds_enc = pipe.predict(X)
        probs_mat = pipe.predict_proba(X)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        decoded = encoder.inverse_transform(preds_enc)
        max_probs = probs_mat.max(axis=1)

        counts = {
            "Uncongested": 0,
            "Balanced": 0,
            "Moderately Congested": 0,
            "Highly Congested": 0,
        }
        for lbl in decoded:
            counts[lbl] = counts.get(lbl, 0) + 1

        all_model_outputs[m_key] = {
            "labels": decoded,
            "max_probs": max_probs,
            "probs_mat": probs_mat,
            "latency_ms": round(float(elapsed_ms), 3),
            "mean_confidence": round(float(np.mean(max_probs)), 4),
            "counts": counts,
        }

    # 3. Assemble predictions for the requested active model + cross-model votes
    active_out = all_model_outputs[requested_model]
    predictions = []
    disagreement_edges = []

    for i, edge in enumerate(request.edges):
        votes: Dict[str, ModelVote] = {}
        unique_statuses = set()

        for m_key, m_out in all_model_outputs.items():
            lbl_m = str(m_out["labels"][i])
            prob_m = round(float(m_out["max_probs"][i]), 4)
            votes[m_key] = ModelVote(congestion_status=lbl_m, probability=prob_m)
            unique_statuses.add(lbl_m)

        has_disagreement = len(unique_statuses) > 1
        if has_disagreement:
            disagreement_edges.append({
                "edge_id": edge.id,
                "source": edge.source,
                "target": edge.target,
                "votes": {k: v.congestion_status for k, v in votes.items()},
            })

        prob_dist = {
            class_labels[c_idx]: round(float(active_out["probs_mat"][i, c_idx]), 4)
            for c_idx in range(len(class_labels))
        }

        predictions.append(
            EdgePrediction(
                edge_id=edge.id,
                congestion_status=str(active_out["labels"][i]),
                probability=round(float(active_out["max_probs"][i]), 4),
                class_probabilities=prob_dist,
                all_model_votes=votes,
                disagreement=has_disagreement,
                telemetry_enriched=enriched_meta[i],
            )
        )

    live_summary = {
        "active_model": requested_model,
        "total_edges": len(request.edges),
        "disagreement_count": len(disagreement_edges),
        "disagreement_edges": disagreement_edges,
        "per_model": {
            m_key: {
                "latency_ms": m_out["latency_ms"],
                "mean_confidence": m_out["mean_confidence"],
                "counts": m_out["counts"],
            }
            for m_key, m_out in all_model_outputs.items()
        },
    }

    return PredictResponse(
        predictions=predictions,
        active_model=requested_model,
        inference_latency_ms=active_out["latency_ms"],
        model_comparison_live=live_summary,
    )
