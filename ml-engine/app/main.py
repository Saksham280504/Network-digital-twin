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


def _load_models_once() -> bool:
    """Attempts to unpickle encoder and all 5 model pipelines. Returns True if all 5 succeed."""
    if os.path.exists(ENCODER_PATH):
        try:
            _state["encoder"] = joblib.load(ENCODER_PATH)
            log.info(f"Loaded LabelEncoder -> {ENCODER_PATH}")
        except Exception as exc:
            log.warning(f"Failed to unpickle LabelEncoder ({exc})")
            _state["encoder"] = None

    loaded_models = {}
    for key in MODEL_KEYS:
        m_path = os.path.join(MODEL_DIR, f"{key}.joblib")
        if os.path.exists(m_path):
            try:
                pipe = joblib.load(m_path)
                # Ensure single-threaded inference on constrained 0.1-CPU cloud containers
                if hasattr(pipe, "named_steps") and "clf" in pipe.named_steps:
                    clf = pipe.named_steps["clf"]
                    if hasattr(clf, "n_jobs"):
                        clf.n_jobs = 1
                loaded_models[key] = pipe
                log.info(f"Loaded model [{key}] -> {m_path}")
            except Exception as exc:
                log.warning(f"Version mismatch loading model [{key}]: {exc}")

    _state["models"] = loaded_models
    _state["loaded"] = len(loaded_models) == len(MODEL_KEYS) and _state["encoder"] is not None

    if os.path.exists(BENCHMARK_PATH):
        with open(BENCHMARK_PATH, "r", encoding="utf-8") as f:
            _state["benchmarks"] = json.load(f)

    return _state["loaded"]


def _rebuild_missing_models(missing_keys: list) -> None:
    """
    Rebuilds ONLY the specific model(s) that failed to unpickle due to a
    scikit-learn minor version change (e.g., HistGradientBoostingClassifier _loss).
    Runs in <0.4s on 0.1 CPU.
    """
    from sklearn.preprocessing import StandardScaler, LabelEncoder
    from sklearn.pipeline import Pipeline
    from sklearn.linear_model import LogisticRegression
    from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
    from sklearn.neural_network import MLPClassifier
    from xgboost import XGBClassifier
    from data.generate_data import generate_dataset
    from app.mpnn_layer import BASE_FEATURES, FeatureSubsetSelector, MPNNRelationalTransformer

    os.makedirs(MODEL_DIR, exist_ok=True)
    df = generate_dataset(n_samples=1800, seed=42)
    X = df[BASE_FEATURES].values.astype(np.float64)
    le = LabelEncoder()
    y = le.fit_transform(df["congestion_status"].values)
    n_classes = len(le.classes_)

    if _state["encoder"] is None:
        _state["encoder"] = le
        joblib.dump(le, ENCODER_PATH)

    builders = {
        "mpnn": lambda: Pipeline([
            ("mpnn_rel", MPNNRelationalTransformer()),
            ("scaler", StandardScaler()),
            ("clf", MLPClassifier(hidden_layer_sizes=(64, 32), max_iter=100, early_stopping=True, random_state=42)),
        ]),
        "xgboost": lambda: Pipeline([
            ("select", FeatureSubsetSelector([0, 1, 2, 3, 4, 5, 6, 7, 8])),
            ("scaler", StandardScaler()),
            ("clf", XGBClassifier(n_estimators=60, max_depth=4, learning_rate=0.08, eval_metric="mlogloss", objective="multi:softprob", num_class=n_classes, random_state=42, n_jobs=1)),
        ]),
        "lightgbm": lambda: Pipeline([
            ("select", FeatureSubsetSelector([0, 1, 2, 3, 4, 5, 8])),
            ("scaler", StandardScaler()),
            ("clf", HistGradientBoostingClassifier(max_iter=60, max_leaf_nodes=18, max_depth=4, learning_rate=0.06, random_state=42)),
        ]),
        "random_forest": lambda: Pipeline([
            ("select", FeatureSubsetSelector([0, 1, 2, 3, 4, 5, 6, 7])),
            ("scaler", StandardScaler()),
            ("clf", RandomForestClassifier(n_estimators=60, max_depth=5, min_samples_leaf=8, random_state=42, n_jobs=1)),
        ]),
        "logistic_regression": lambda: Pipeline([
            ("select", FeatureSubsetSelector([0, 1, 2, 4, 5])),
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(C=0.15, max_iter=250, random_state=42)),
        ]),
    }

    for k in missing_keys:
        if k in builders:
            pipe = builders[k]()
            pipe.fit(X, y)
            _state["models"][k] = pipe
            log.info(f"Rebuilt native cloud model [{k}] in-memory")

    _state["loaded"] = len(_state["models"]) > 0 and _state["encoder"] is not None


def load_all_artifacts() -> None:
    """Loads all 5 trained model pipelines; rebuilds only any model that had a version mismatch."""
    all_ok = _load_models_once()
    if not all_ok:
        missing = [k for k in MODEL_KEYS if k not in _state["models"]]
        log.info(f"Rebuilding {len(missing)} version-mismatched model(s): {missing} ...")
        _rebuild_missing_models(missing)


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


@app.api_route("/", methods=["GET", "HEAD"], tags=["Monitoring"])
async def root():
    return {
        "status": "ok",
        "service": "NDT Multi-Model ML Engine",
        "model_loaded": _state["loaded"],
        "loaded_models": list(_state["models"].keys()),
    }


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
