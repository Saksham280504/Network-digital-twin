# API Contract: Network Digital Twin

This document defines the JSON data schemas used for communication between the Node.js backend (SDE) and the Python FastAPI ML engine (DA/DS).

## 1. Congestion Prediction Endpoint

- **Method:** `POST`
- **URL Path:** `/predict-congestion` (or similar endpoint on the ML engine)
- **Description:** The Node.js backend sends the current state of network edges (throughput, delay) to the ML engine to retrieve a congestion prediction for each edge.

### Request Payload (Node.js -> FastAPI)

The request should contain an array of edges with their real-time metrics.

```json
{
  "edges": [
    {
      "id": "edge_1_2",
      "source": "node_1",
      "target": "node_2",
      "throughput_mbps": 120.5,
      "delay_ms": 15.2
    },
    {
      "id": "edge_2_3",
      "source": "node_2",
      "target": "node_3",
      "throughput_mbps": 45.0,
      "delay_ms": 5.1
    }
  ]
}
```

**Field Types:**
- `id` (String): Unique identifier for the edge.
- `source` (String): ID of the source node.
- `target` (String): ID of the destination node.
- `throughput_mbps` (Float): Current throughput in Mbps.
- `delay_ms` (Float): Current delay in milliseconds.

### Response Payload (FastAPI -> Node.js)

The ML engine must respond with an array containing the predicted congestion status for each edge provided in the request.

```json
{
  "predictions": [
    {
      "edge_id": "edge_1_2",
      "congestion_status": "Highly Congested",
      "probability": 0.89
    },
    {
      "edge_id": "edge_2_3",
      "congestion_status": "Uncongested",
      "probability": 0.12
    }
  ]
}
```

**Field Types:**
- `edge_id` (String): Matches the `id` from the request.
- `congestion_status` (String): The predicted class. Valid values: `"Highly Congested"`, `"Moderately Congested"`, `"Balanced"`, `"Uncongested"`.
- `probability` (Float): Confidence score of the prediction (0.0 to 1.0).

---

## 2. Graph Topology Format (Static JSON)

To ensure the frontend UI and the ML model training use the exact same graph structures, the DA/DS will provide the initial graph topologies as static JSON files (e.g., `topology_er.json`, `topology_ba.json`).

```json
{
  "nodes": [
    { "id": "node_1", "label": "Router 1" },
    { "id": "node_2", "label": "Router 2" }
  ],
  "edges": [
    { "id": "edge_1_2", "source": "node_1", "target": "node_2" }
  ]
}
```
