# Predictive Network Digital Twin (NDT) — Multi-Model & IoT Extension

An Interactive, Fault-Tolerant **Network Digital Twin (NDT)** that extends the IEEE research paper *"Network Digital Twin for Congestion-Aware Predictive Traffic Routing using Graph MPNNs"* ([`NDT.pdf`](file:///c:/Users/sanya/Developer/network-digital-twin/NDT.pdf)) with a **5-Model Machine Learning Benchmark Suite**, **Constrained Graph Generators ($2 \le \deg(v) \le 9$)**, **Static MPLS/OSPF vs. Predictive PBR Routing Comparison**, **50%-Capped Vertex Traffic Splitting**, and **IoT/B5G Energy Efficiency Analytics**.

---

## 1. Architecture Overview

```
┌─────────────────────────┐    REST API (JSON)    ┌─────────────────────────┐    HTTP (axios)     ┌─────────────────────────┐
│        FRONTEND         │ ────────────────────► │         BACKEND         │ ──────────────────► │        ML ENGINE        │
│    Next.js 16 (3000)    │                       │    Express 5 (4000)     │                     │     FastAPI (8000)      │
│                         │ ◄──────────────────── │                         │ ◄────────────────── │                         │
│ • Dual-Route Canvas     │   Topology, Routes,   │ • Min-Heap Dijkstra PBR │   5-Model Votes,    │ • Graph MPNN (96.0%)    │
│ • 5-Model Arena Modal   │   5-Model Votes,      │ • Static MPLS/OSPF      │   Probabilities,    │ • XGBoost (96.5%)       │
│ • ER / BA / WS Builder  │   Paper & IoT KPIs    │ • 50% Vertex PBR Split  │   Disagreements &   │ • LightGBM (96.4%)      │
│ • Stepwise ΔF Simulator │                       │ • ER / BA / WS Engine   │   Live Latency (ms) │ • Random Forest (93.3%) │
│ • Vertex PBR Inspector  │                       │ • W_e & IoT Energy Calc │                     │ • Logistic Reg. (93.1%) │
└─────────────────────────┘                       └─────────────────────────┘                     └─────────────────────────┘
```

---

## 2. How We Extended the Research Paper (`NDT.pdf`)

| Research Paper Component | Paper Formulation (`NDT.pdf`) | Our Implementation & Novel Extension |
| :--- | :--- | :--- |
| **Graph Topology Models** (Section IV-A & Table I) | **Barabási–Albert (BA)**, **Erdős–Rényi (ER)**, and **Watts–Strogatz (WS)** across $5, 10, 15$ $P$-routers with hardware interface bounds $2 \le \deg(v) \le 9$. | Live interactive generator ([`graphGenerator.js`](file:///c:/Users/sanya/Developer/network-digital-twin/backend/services/graphGenerator.js)) for $5, 10, 15, 20$ routers with automatic force-directed layout, degree-constraint verification, and MPLS WAN/LAN hierarchy ($V_{PE} = \max(2, \lfloor V_P/5 \rfloor + 1)$). |
| **Message Passing & Multi-Model ML** (Section IV-D) | Uses a single MPNN ($m_{ij} = \phi(h_i, h_j, e_{ij}) \to m_i = \sum_{j \in N(i)} m_{ij} \to h'_i = \psi(h_i, m_i)$) to classify edges into 4 congestion states. | Built a **5-Model Zoo** ([`train.py`](file:///c:/Users/sanya/Developer/network-digital-twin/ml-engine/train.py), [`mpnn_layer.py`](file:///c:/Users/sanya/Developer/network-digital-twin/ml-engine/app/mpnn_layer.py)) comparing **Graph MPNN**, **XGBoost**, **LightGBM**, **Random Forest**, and **Logistic Regression** across Accuracy, Macro-F1, ROC-AUC, Confusion Matrices, Inference Latency ($\text{ms}$), and **Live Edge Disagreement Maps**. |
| **Computational Cost & QoS** (Section IV-C, Page 7) | $W_e = 0.5 \cdot \hat{D}_e + 0.5 \cdot \hat{C}_e$, $\text{Total Cost} = \sum_{e \in E} W_e$. | Computes exact $W_e$ cost plus **IoT Router Energy Efficiency ($\text{Joules/Gbit}$)**, **Jitter ($\text{ms}$)**, and **Packet Loss (%)** in [`dijkstra.js`](file:///c:/Users/sanya/Developer/network-digital-twin/backend/services/dijkstra.js). |
| **Vertex-Level PBR Split** (Section IV-F, Page 9) | Reroutes traffic when $E_u + E_b \ge 1$ and $E_m + E_h \ge 1$ with a $50\%$ redistribution cap to prevent secondary congestion. | Live **Router PBR Inspector** in [`MetricsPanel.jsx`](file:///c:/Users/sanya/Developer/network-digital-twin/frontend/components/MetricsPanel.jsx) showing $E_u, E_b, E_m, E_h$, weights $W_m, W_h$, and the exact $\le 50\%$ split percentage for every clicked router. |
| **Stepwise Traffic Escalation** (Section IV-B & VII) | $F_n = F_{n-1} + \Delta F$ ($\Delta F = 140,428\text{ bytes}$) comparing MPNN-PBR vs. MPLS (OSPF). | Interactive **10-Step Traffic Stress-Test Simulator** ([`TopologyGeneratorModal.jsx`](file:///c:/Users/sanya/Developer/network-digital-twin/frontend/components/TopologyGeneratorModal.jsx)) plotting live SVG charts of Delay, Congestion, File Transfer Rate, $W_e$ Cost, and IoT Energy for **MPNN vs. XGBoost vs. Logistic Regression vs. Static OSPF**. |

---

## 3. Multi-Model Benchmark Specifications (12,000 Telemetry Records)

| Model Key | Architecture | Paradigm | Test Accuracy | Macro F1 | ROC-AUC | Live Latency (15 edges) | Model Size | Key Behaviour |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `xgboost` | **XGBoost Classifier** | Depth-wise GBDT | **96.46%** | **96.05%** | 0.9975 | ~1.08 ms | 889.0 KB | Captures sharp non-linear utilization + delay thresholds |
| `lightgbm` | **LightGBM (HistGBDT)** | Leaf-wise 255-bin Histogram GBDT | **96.38%** | **96.00%** | 0.9974 | ~6.20 ms | 609.0 KB | Fast training & compact histogram binning |
| `mpnn` | **Graph MPNN (Paper)** | 2-Hop Message Passing + 3-Layer MLP | **96.04%** | **95.63%** | **0.9978** | **~0.23 ms** | 302.8 KB | Best ROC-AUC; proactively detects 1-hop neighbor backpressure |
| `random_forest` | **Random Forest** | Parallel Bagging Ensemble (140 trees) | **93.29%** | **92.55%** | 0.9936 | ~28.97 ms | 816.1 KB | Local link + degree features only; misses neighbor cascades |
| `logistic_regression` | **Logistic Regression** | Multinomial Softmax Linear Baseline | **93.12%** | **92.34%** | 0.9939 | **~0.14 ms** | **1.7 KB** | Fastest sub-ms inference & tiny footprint for IoT microcontrollers |

---

## 4. API Endpoints Reference

### Backend (`http://localhost:4000`)

| Method | Endpoint | Description |
| :---: | :--- | :--- |
| `GET` | `/api/network` | Returns current topology, predictions, active model, and structural summary |
| `POST` | `/api/analyze` | Runs 5-model ML inference + Min-Heap Dijkstra PBR + OSPF baseline + 50% secondary split + Paper KPIs |
| `GET` | `/api/models/specs` | Returns full training & test evaluation specs, confusion matrices, and feature importances for all 5 models |
| `POST` | `/api/topology/generate` | Generates `ba`, `er`, or `ws` topology ($5, 10, 15, 20$ routers) with $2 \le \deg(v) \le 9$ |
| `POST` | `/api/simulate/stepwise` | Runs 10-step traffic load escalation ($F_n = F_{n-1} + 140,428\text{ B}$) comparing MPNN, XGBoost, LR, and OSPF |
| `POST` | `/api/fault` | Injects node/edge crash with automatic edge cascade |
| `POST` | `/api/restore` | Restores dropped node/edge with smart endpoint liveliness check |
| `POST` | `/api/edge/update` | Updates link throughput, capacity, delay, jitter, or packet loss |
| `POST` | `/api/network/load` | Loads a custom user-drawn topology from Build Mode |
| `POST` | `/api/reset` | Resets network to baseline or default 10-node topology |

---

## 5. How to Run the Application

### Option A: Three Local Terminals

```bash
# 1. Start the Multi-Model FastAPI ML Engine (Port 8000)
cd ml-engine
python train.py   # Only needed once to generate models & benchmarks
uvicorn app.main:app --reload --port 8000

# 2. Start the Node.js Express PBR Backend (Port 4000)
cd backend
npm run dev

# 3. Start the Next.js Interactive Dashboard (Port 3000)
cd frontend
npm run dev
```

### Option B: Docker Compose (Single Command)

```bash
docker-compose up --build
```

### Running Automated Verification Suites

```bash
# Verify all 5 ML models & FastAPI endpoints
python ml-engine/tests/test_models.py

# Verify Graph Generators (2 <= deg <= 9), Min-Heap Dijkstra, OSPF, and Paper Equations
node backend/tests/verify_engine.js
```
