"""
generate_data.py
================
Synthetic network telemetry generator for the NDT ml-engine.

Matches the exact 15-edge topology from backend/data/topology.json (R1–R10).
Generates ~10,000 labelled rows of tabular telemetry data for model training.

Usage:
    python data/generate_data.py
Output:
    data/network_telemetry.csv
"""

import numpy as np
import pandas as pd
import os
import random

# ──────────────────────────────────────────────────────────────────────────────
# Topology: 15 edges matching backend/data/topology.json
# ──────────────────────────────────────────────────────────────────────────────
EDGES = [
    {"id": "e_R1_R2",  "source": "R1",  "target": "R2",  "capacity_mbps": 1000},
    {"id": "e_R1_R4",  "source": "R1",  "target": "R4",  "capacity_mbps": 500},
    {"id": "e_R2_R3",  "source": "R2",  "target": "R3",  "capacity_mbps": 1000},
    {"id": "e_R2_R5",  "source": "R2",  "target": "R5",  "capacity_mbps": 750},
    {"id": "e_R3_R6",  "source": "R3",  "target": "R6",  "capacity_mbps": 1000},
    {"id": "e_R3_R7",  "source": "R3",  "target": "R7",  "capacity_mbps": 500},
    {"id": "e_R4_R5",  "source": "R4",  "target": "R5",  "capacity_mbps": 500},
    {"id": "e_R4_R8",  "source": "R4",  "target": "R8",  "capacity_mbps": 250},
    {"id": "e_R5_R6",  "source": "R5",  "target": "R6",  "capacity_mbps": 750},
    {"id": "e_R5_R9",  "source": "R5",  "target": "R9",  "capacity_mbps": 500},
    {"id": "e_R6_R7",  "source": "R6",  "target": "R7",  "capacity_mbps": 1000},
    {"id": "e_R6_R10", "source": "R6",  "target": "R10", "capacity_mbps": 750},
    {"id": "e_R7_R10", "source": "R7",  "target": "R10", "capacity_mbps": 1000},
    {"id": "e_R8_R9",  "source": "R8",  "target": "R9",  "capacity_mbps": 250},
    {"id": "e_R9_R10", "source": "R9",  "target": "R10", "capacity_mbps": 500},
]

# ──────────────────────────────────────────────────────────────────────────────
# Labelling thresholds (utilisation = throughput / capacity)
# ──────────────────────────────────────────────────────────────────────────────
def label_congestion(util: float) -> str:
    if util < 0.40:
        return "Uncongested"
    elif util < 0.65:
        return "Balanced"
    elif util < 0.85:
        return "Moderately Congested"
    else:
        return "Highly Congested"


# ──────────────────────────────────────────────────────────────────────────────
# Delay model: delay increases nonlinearly with utilisation
#   base_delay  + congestion_penalty + jitter
# ──────────────────────────────────────────────────────────────────────────────
def simulate_delay(util: float, capacity_mbps: float) -> float:
    # Base propagation delay (lower for high-capacity backbone links)
    base = 2.0 + (1000 / capacity_mbps) * 3.0          # 2–14 ms
    # Queuing delay grows sharply above 65 % utilisation
    if util < 0.65:
        queuing = util * 5.0
    elif util < 0.85:
        queuing = 3.25 + (util - 0.65) * 40.0          # 3.25–11.25 ms
    else:
        queuing = 11.25 + (util - 0.85) * 120.0        # 11.25–29.25 ms
    jitter = np.random.normal(0, 0.5)
    return max(0.5, base + queuing + jitter)


# ──────────────────────────────────────────────────────────────────────────────
# Sampling strategy: generate balanced class distribution
#   ~25 % of rows per congestion class before adding inter-class transitions
# ──────────────────────────────────────────────────────────────────────────────
CLASS_UTIL_RANGES = {
    "Uncongested":          (0.00, 0.40),
    "Balanced":             (0.40, 0.65),
    "Moderately Congested": (0.65, 0.85),
    "Highly Congested":     (0.85, 1.00),
}

ROWS_PER_CLASS_PER_EDGE = 170   # 15 edges × 4 classes × 170 ≈ 10 200 rows

np.random.seed(42)
random.seed(42)

records = []

for edge in EDGES:
    for label, (util_lo, util_hi) in CLASS_UTIL_RANGES.items():
        for _ in range(ROWS_PER_CLASS_PER_EDGE):
            # Sample utilisation uniformly inside the class band
            util = np.random.uniform(util_lo, util_hi)

            # Add tiny Gaussian noise so the decision boundary isn't perfectly sharp
            util_noisy = np.clip(util + np.random.normal(0, 0.015), 0.0, 1.0)

            throughput = util_noisy * edge["capacity_mbps"]
            delay      = simulate_delay(util_noisy, edge["capacity_mbps"])

            # Re-derive label from the noisy utilisation so it stays consistent
            derived_label = label_congestion(util_noisy)

            records.append({
                "edge_id":          edge["id"],
                "source":           edge["source"],
                "target":           edge["target"],
                "throughput_mbps":  round(throughput, 4),
                "capacity_mbps":    edge["capacity_mbps"],
                "delay_ms":         round(delay, 4),
                "utilization_ratio":round(util_noisy, 6),
                "congestion_status": derived_label,
            })

df = pd.DataFrame(records)

# Shuffle to avoid any ordering bias during training
df = df.sample(frac=1, random_state=42).reset_index(drop=True)

# ──────────────────────────────────────────────────────────────────────────────
# Save
# ──────────────────────────────────────────────────────────────────────────────
out_dir  = os.path.dirname(__file__)
out_path = os.path.join(out_dir, "network_telemetry.csv")
df.to_csv(out_path, index=False)

print(f"✅  Generated {len(df):,} rows → {out_path}")
print("\nClass distribution:")
print(df["congestion_status"].value_counts())
print("\nFeature statistics:")
print(df[["throughput_mbps", "capacity_mbps", "delay_ms", "utilization_ratio"]].describe().round(2))
