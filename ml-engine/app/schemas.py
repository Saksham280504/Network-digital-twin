"""
schemas.py
==========
Pydantic v2 request / response models for the FastAPI multi-model NDT ML Engine.
Fully backward-compatible with api_contract.md while adding multi-model voting,
graph-relational telemetry metadata, and live benchmark comparisons.
"""

from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field


class EdgeInput(BaseModel):
    """A single network edge with real-time telemetry and optional IoT/graph metrics."""
    id:                 str            = Field(..., examples=["e_R1_R2"])
    source:             str            = Field(..., examples=["R1"])
    target:             str            = Field(..., examples=["R2"])
    throughput_mbps:    float          = Field(..., ge=0, description="Current throughput in Mbps")
    delay_ms:           float          = Field(..., ge=0, description="End-to-end latency in ms")
    capacity_mbps:      float          = Field(..., gt=0, description="Link capacity in Mbps")
    jitter_ms:          Optional[float]= Field(default=None, ge=0, description="Inter-packet jitter in ms")
    packet_loss_pct:    Optional[float]= Field(default=None, ge=0, le=100, description="Packet loss percentage")
    source_degree:      Optional[int]  = Field(default=None, ge=1, le=20, description="Degree of source router")
    target_degree:      Optional[int]  = Field(default=None, ge=1, le=20, description="Degree of target router")
    neighbor_mean_util: Optional[float]= Field(default=None, ge=0, description="Mean utilization of 1-hop neighbor links")
    neighbor_max_delay: Optional[float]= Field(default=None, ge=0, description="Max delay of 1-hop neighbor links")


class PredictRequest(BaseModel):
    """Request body sent by the Node.js backend to POST /predict-congestion."""
    edges: List[EdgeInput] = Field(..., min_length=1)
    model_name: Optional[str] = Field(
        default="mpnn",
        description="Model key: mpnn | xgboost | lightgbm | random_forest | logistic_regression",
    )


class ModelVote(BaseModel):
    """Single model's prediction on a specific edge."""
    congestion_status: str
    probability: float


class EdgePrediction(BaseModel):
    """Prediction result for a single edge (includes multi-model comparison votes)."""
    edge_id:              str                    = Field(..., description="Matches the input edge id")
    congestion_status:    str                    = Field(..., description="Predicted congestion class")
    probability:          float                  = Field(..., ge=0, le=1, description="Model confidence")
    class_probabilities:  Optional[Dict[str, float]] = Field(default=None)
    all_model_votes:      Optional[Dict[str, ModelVote]] = Field(default=None)
    disagreement:         Optional[bool]         = Field(default=False, description="True if the 5 models disagree on this edge")
    telemetry_enriched:   Optional[Dict[str, Any]] = Field(default=None)


class PredictResponse(BaseModel):
    """Response returned to the Node.js backend."""
    predictions:           List[EdgePrediction]
    active_model:          Optional[str] = "mpnn"
    inference_latency_ms:  Optional[float] = 0.0
    model_comparison_live: Optional[Dict[str, Any]] = None


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    loaded_models: List[str] = []
    version: str
