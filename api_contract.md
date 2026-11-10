# API Contract: Network Digital Twin (v2.0 — Multi-Model & Paper Extension)

This document defines the JSON data schemas used for communication between the Node.js backend (SDE) and the Python FastAPI ML engine (DA/DS).

## 1. Multi-Model Congestion Prediction Endpoint

- **Method:** `POST`
- **URL Path:** `/predict-congestion`
- **Description:** The Node.js backend sends the current state of network edges to the ML engine along with an optional `model_name` (`"mpnn"`, `"xgboost"`, `"lightgbm"`, `"random_forest"`, or `"logistic_regression"`). The ML engine dynamically constructs the live graph adjacency matrix, computes 1-hop neighbor aggregations (`neighbor_mean_util`, `neighbor_max_delay`, `source_degree`, `target_degree`), runs all 5 models to detect cross-model disagreements, and returns predictions for the active model plus per-edge voting across all 5 models.

### Request Payload (`Node.js -> FastAPI`)

```json
{
  "model_name": "mpnn",
  "edges": [
    {
      "id": "e_R1_R2",
      "source": "R1",
      "target": "R2",
      "throughput_mbps": 900.0,
      "delay_ms": 45.2,
      "capacity_mbps": 1000
    }
  ]
}
```

### Response Payload (`FastAPI -> Node.js`)

```json
{
  "active_model": "mpnn",
  "inference_latency_ms": 0.221,
  "predictions": [
    {
      "edge_id": "e_R1_R2",
      "congestion_status": "Highly Congested",
      "probability": 0.9912,
      "disagreement": false,
      "all_model_votes": {
        "mpnn":                { "congestion_status": "Highly Congested", "probability": 0.9912 },
        "xgboost":             { "congestion_status": "Highly Congested", "probability": 0.9854 },
        "lightgbm":            { "congestion_status": "Highly Congested", "probability": 0.9881 },
        "random_forest":       { "congestion_status": "Highly Congested", "probability": 0.9120 },
        "logistic_regression": { "congestion_status": "Highly Congested", "probability": 0.9640 }
      },
      "telemetry_enriched": {
        "edge_id": "e_R1_R2",
        "utilization_ratio": 0.9,
        "jitter_ms": 5.31,
        "packet_loss_pct": 4.82,
        "source_degree": 2,
        "target_degree": 3,
        "neighbor_mean_util": 0.64,
        "neighbor_max_delay": 24.5
      }
    }
  ],
  "model_comparison_live": {
    "active_model": "mpnn",
    "total_edges": 15,
    "disagreement_count": 2,
    "disagreement_edges": []
  }
}
```

---

## 2. Model Benchmark Specifications Endpoint

- **Method:** `GET`
- **URL Path:** `/models/specs`
- **Description:** Returns test accuracy, macro-F1, precision, recall, ROC-AUC, 3-fold cross-validation scores, single-batch inference latency ($\text{ms}$), serialized model size ($\text{KB}$), $4 \times 4$ confusion matrices, and permutation feature importances across all 5 trained models.
