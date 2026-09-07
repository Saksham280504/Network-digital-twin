"""
schemas.py
==========
Pydantic v2 request / response models for the FastAPI predict-congestion endpoint.
These EXACTLY match the API contract defined in api_contract.md.
"""

from pydantic import BaseModel, Field
from typing   import List


# ── Request ───────────────────────────────────────────────────────────────────

class EdgeInput(BaseModel):
    """A single network edge with real-time telemetry metrics."""
    id:             str   = Field(..., examples=["e_R1_R2"])
    source:         str   = Field(..., examples=["R1"])
    target:         str   = Field(..., examples=["R2"])
    throughput_mbps: float = Field(..., ge=0,   description="Current throughput in Mbps")
    delay_ms:        float = Field(..., ge=0,   description="End-to-end latency in ms")
    capacity_mbps:   float = Field(..., gt=0,   description="Link capacity in Mbps")


class PredictRequest(BaseModel):
    """Request body sent by the Node.js backend to POST /predict-congestion."""
    edges: List[EdgeInput] = Field(..., min_length=1)

    model_config = {
        "json_schema_extra": {
            "example": {
                "edges": [
                    {
                        "id":             "e_R1_R2",
                        "source":         "R1",
                        "target":         "R2",
                        "throughput_mbps": 900.0,
                        "delay_ms":        45.2,
                        "capacity_mbps":   1000,
                    }
                ]
            }
        }
    }


# ── Response ──────────────────────────────────────────────────────────────────

class EdgePrediction(BaseModel):
    """Prediction result for a single edge."""
    edge_id:          str   = Field(..., description="Matches the input edge id")
    congestion_status: str  = Field(
        ...,
        description="One of: Uncongested | Balanced | Moderately Congested | Highly Congested"
    )
    probability: float = Field(..., ge=0, le=1, description="Model confidence for the predicted class")


class PredictResponse(BaseModel):
    """Response returned to the Node.js backend."""
    predictions: List[EdgePrediction]

    model_config = {
        "json_schema_extra": {
            "example": {
                "predictions": [
                    {
                        "edge_id":           "e_R1_R2",
                        "congestion_status": "Highly Congested",
                        "probability":       0.92,
                    }
                ]
            }
        }
    }


# ── Health ────────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    version: str
