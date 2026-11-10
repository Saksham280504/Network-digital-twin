"""
mpnn_layer.py
=============
Graph Message-Passing Relational Feature Extractor & Live Topology Aggregator
for the Network Digital Twin (NDT) ML Engine.

Implements the 3-stage Message Passing formulation from Section IV-D of NDT.pdf:
  1. Message Generation:  m_ij = phi(h_i, h_j, e_ij)
  2. Message Aggregation: m_i  = sum_{j in N(i)} m_ij
  3. Vertex/Edge Update:  h'_i = psi(h_i, m_i)
"""

from typing import List, Dict, Any
import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin

# Canonical 10 base features expected by all pipelines
BASE_FEATURES = [
    "throughput_mbps",
    "capacity_mbps",
    "delay_ms",
    "utilization_ratio",
    "jitter_ms",
    "packet_loss_pct",
    "source_degree",
    "target_degree",
    "neighbor_mean_util",
    "neighbor_max_delay",
]


class FeatureSubsetSelector(BaseEstimator, TransformerMixin):
    """Selects a specific subset of feature column indices for a given model paradigm."""

    def __init__(self, indices: List[int]):
        self.indices = indices

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        X_arr = np.asarray(X, dtype=np.float64)
        return X_arr[:, self.indices]


class MPNNRelationalTransformer(BaseEstimator, TransformerMixin):
    """
    Implements the Message-Passing Neural Network (MPNN) relational feature
    transformation layer (Section IV-D of NDT.pdf) prior to neural classification:
      - Stage 1 (Message Generation phi): Computes non-linear edge-to-vertex
        queueing and backpressure messages.
      - Stage 2 (Message Aggregation sum): Aggregates 1-hop neighbor utilization
        and delay pressure scaled by vertex degree constraints (2 <= deg(v) <= 9).
      - Stage 3 (State Update psi): Concatenates local edge state with aggregated
        vertex-neighbor messages.
    """

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        X_arr = np.asarray(X, dtype=np.float64)
        tput = X_arr[:, 0]
        cap = np.maximum(X_arr[:, 1], 1.0)
        delay = X_arr[:, 2]
        util = X_arr[:, 3]
        jitter = X_arr[:, 4]
        loss = X_arr[:, 5]
        src_deg = X_arr[:, 6]
        dst_deg = X_arr[:, 7]
        nb_util = X_arr[:, 8]
        nb_delay = X_arr[:, 9]

        # Stage 1: Message Generation m_ij = phi(h_i, h_j, e_ij)
        cascade_msg = (util * nb_util) ** 1.3
        effective_load = np.clip(0.75 * util + 0.25 * nb_util, 0.01, 0.98)
        mm1_queue_msg = (effective_load ** 2.4) / (1.02 - effective_load)

        # Stage 2: Message Aggregation m_i = sum_{j in N(i)} m_ij
        degree_sum = src_deg + dst_deg
        hub_contention_msg = (degree_sum / 18.0) * (nb_util ** 1.5)
        delay_propagation_msg = np.minimum(1.0, delay / 55.0) * 0.6 + np.minimum(1.0, nb_delay / 60.0) * 0.4

        # Stage 3: Vertex/Edge State Update h'_i = psi(h_i, m_i)
        high_util_boost = np.maximum(0.0, (util - 0.75) * 0.55)
        qos_composite_msg = (
            0.64 * util
            + 0.12 * np.minimum(1.0, delay / 55.0)
            + 0.10 * nb_util
            + 0.05 * np.minimum(1.0, nb_delay / 60.0)
            + 0.05 * np.minimum(1.0, loss / 8.0)
            + 0.04 * np.minimum(1.0, jitter / 14.0)
            + 0.18 * cascade_msg
            + 0.12 * hub_contention_msg
            + high_util_boost
        )

        relational_features = np.column_stack([
            X_arr,
            cascade_msg,
            mm1_queue_msg,
            hub_contention_msg,
            delay_propagation_msg,
            qos_composite_msg,
        ])
        return relational_features


def build_feature_matrix_from_edges(edges: List[Any]) -> Any:
    """
    Constructs the 10-column feature matrix dynamically from a list of live network edges.
    Automatically builds the graph adjacency map (V, E) to compute 1-hop neighbor
    utilization, max neighbor delay, and vertex degrees (2 <= deg(v) <= 9) for any
    custom or generated topology!
    """
    n = len(edges)
    if n == 0:
        return np.empty((0, len(BASE_FEATURES)), dtype=np.float64), []

    # 1. Compute per-edge utilization and build vertex adjacency list
    utils = []
    delays = []
    vertex_incident: Dict[str, List[int]] = {}

    for idx, e in enumerate(edges):
        cap = max(float(e.capacity_mbps), 1.0)
        tput = max(float(e.throughput_mbps), 0.0)
        u_ratio = min(1.5, tput / cap)
        d_ms = max(float(e.delay_ms), 0.1)
        utils.append(u_ratio)
        delays.append(d_ms)

        vertex_incident.setdefault(e.source, []).append(idx)
        vertex_incident.setdefault(e.target, []).append(idx)

    rows = []
    enriched_meta = []

    for idx, e in enumerate(edges):
        cap = max(float(e.capacity_mbps), 1.0)
        tput = max(float(e.throughput_mbps), 0.0)
        util = utils[idx]
        delay_ms = delays[idx]

        # Vertex degrees (clamped to [2, 9] hardware interface bounds when used by model)
        raw_src_deg = len(vertex_incident.get(e.source, [idx]))
        raw_dst_deg = len(vertex_incident.get(e.target, [idx]))
        src_deg = int(np.clip(getattr(e, "source_degree", None) or raw_src_deg, 2, 9))
        dst_deg = int(np.clip(getattr(e, "target_degree", None) or raw_dst_deg, 2, 9))

        # 1-hop adjacent edges sharing either source or target router (excluding self)
        adj_indices = set(vertex_incident.get(e.source, [])) | set(vertex_incident.get(e.target, []))
        adj_indices.discard(idx)

        if getattr(e, "neighbor_mean_util", None) is not None:
            nb_mean_util = float(e.neighbor_mean_util)
        elif adj_indices:
            nb_mean_util = float(np.mean([utils[j] for j in adj_indices]))
        else:
            nb_mean_util = util

        if getattr(e, "neighbor_max_delay", None) is not None:
            nb_max_delay = float(e.neighbor_max_delay)
        elif adj_indices:
            nb_max_delay = float(np.max([delays[j] for j in adj_indices]))
        else:
            nb_max_delay = delay_ms

        # Derive realistic jitter and packet loss if not explicitly supplied by edge telemetry
        if getattr(e, "jitter_ms", None) is not None:
            jitter_ms = float(e.jitter_ms)
        else:
            jitter_ms = float(max(0.05, min(delay_ms * 0.65, 0.3 + (util ** 1.8) * 6.0 + (nb_mean_util ** 2.0) * 4.5)))

        if getattr(e, "packet_loss_pct", None) is not None:
            packet_loss_pct = float(e.packet_loss_pct)
        else:
            pressure = 0.70 * util + 0.20 * nb_mean_util + 0.10 * ((src_deg + dst_deg) / 16.0)
            if pressure < 0.52:
                packet_loss_pct = 0.02
            elif pressure < 0.75:
                packet_loss_pct = (pressure - 0.52) * 5.5
            else:
                packet_loss_pct = 1.26 + ((pressure - 0.75) ** 1.5) * 28.0
            packet_loss_pct = float(np.clip(packet_loss_pct, 0.0, 25.0))

        row = [
            tput,
            cap,
            delay_ms,
            util,
            jitter_ms,
            packet_loss_pct,
            float(src_deg),
            float(dst_deg),
            nb_mean_util,
            nb_max_delay,
        ]
        rows.append(row)
        enriched_meta.append({
            "edge_id": e.id,
            "utilization_ratio": round(util, 4),
            "jitter_ms": round(jitter_ms, 2),
            "packet_loss_pct": round(packet_loss_pct, 2),
            "source_degree": src_deg,
            "target_degree": dst_deg,
            "neighbor_mean_util": round(nb_mean_util, 4),
            "neighbor_max_delay": round(nb_max_delay, 2),
        })

    return np.array(rows, dtype=np.float64), enriched_meta
