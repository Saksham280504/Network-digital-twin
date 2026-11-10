# Network Digital Twin — Complete Project Deep-Dive

> This document covers every detail of the project: what we built, how it works, the technologies & algorithms, the complete data pipeline, and what remains to be done.

---

## 1. What We Built — The Vision

An **Interactive, Fault-Tolerant Network Digital Twin (NDT)** — a system that replaces traditional reactive network routing protocols with a **predictive, ML-driven approach**. Instead of waiting for congestion to happen and then reacting, the system:

1. **Predicts** which network links are about to become congested using a trained Machine Learning model
2. **Reroutes** traffic proactively around bottlenecks using Policy-Based Routing (Dijkstra's algorithm)
3. Provides a **What-If analysis** module where operators can simulate network crashes and watch the system self-heal in real-time
4. Lets users **build custom network topologies** from scratch and analyze them

The project is split between two roles:

| Role | Responsibility | Folder |
|------|---------------|--------|
| **SDE** (Software Dev Engineer) | Full-stack engine: Express backend, Next.js dashboard, Dijkstra PBR, What-If controls | `backend/`, `frontend/` |
| **DA/DS** (Data Analyst/Scientist) | ML pipeline: synthetic data generation, XGBoost training, FastAPI inference server | `ml-engine/` |

---

## 2. Architecture — How the Three Services Connect

```
┌──────────────────────┐   HTTP (fetch)    ┌──────────────────────┐   HTTP (axios)    ┌──────────────────────┐
│                      │ ────────────────► │                      │ ────────────────► │                      │
│    FRONTEND          │                   │    BACKEND           │                   │    ML ENGINE         │
│    Next.js 16        │ ◄──────────────── │    Express 5         │ ◄──────────────── │    FastAPI           │
│    Port 3000         │  JSON response    │    Port 4000         │  predictions[]    │    Port 8000         │
│                      │                   │                      │                   │                      │
│  • HTML5 Canvas      │                   │  • In-memory graph   │                   │  • XGBoost model     │
│  • React Context     │                   │  • Dijkstra PBR      │                   │  • Pydantic schemas  │
│  • Tailwind v4       │                   │  • REST API routes   │                   │  • joblib artifacts  │
└──────────────────────┘                   └──────────────────────┘                   └──────────────────────┘
```

All three services run locally. The frontend never talks directly to the ML engine — the backend acts as the orchestrator.

---

## 3. Complete End-to-End Pipeline

Here is what happens when a user clicks **"Re-analyze"** on the dashboard:

### Step 1: Frontend → Backend
```
POST http://localhost:4000/api/analyze
Body: { "source": "R1", "target": "R10" }
```
The frontend sends the route source/target to the Express backend.

### Step 2: Backend filters active edges
```javascript
// routes/network.js:60
const activeEdges = networkState.edges.filter(e => !e.dropped);
```
The backend reads its in-memory graph state and filters out any edges the user has "dropped" (fault-injected). This produces an array of 10-15 edge objects, each with `id`, `source`, `target`, `throughput_mbps`, `capacity_mbps`, and `delay_ms`.

### Step 3: Backend → ML Engine
```javascript
// services/mockML.js:6
const response = await axios.post('http://127.0.0.1:8000/predict-congestion', { edges });
```
The backend sends the active edges to the Python FastAPI server via HTTP POST.

### Step 4: ML Engine builds feature matrix
```python
# app/main.py:154-162
for edge in request.edges:
    util = edge.throughput_mbps / edge.capacity_mbps
    rows.append([
        edge.throughput_mbps,
        edge.capacity_mbps,
        edge.delay_ms,
        util,   # derived feature: utilization_ratio
    ])
X = np.array(rows, dtype=np.float64)
```
The FastAPI server computes the **utilization_ratio** (a derived feature = throughput ÷ capacity) and assembles a NumPy feature matrix with 4 columns: `[throughput_mbps, capacity_mbps, delay_ms, utilization_ratio]`.

### Step 5: XGBoost inference
```python
# app/main.py:168-169
encoded_preds = pipeline.predict(X)       # class labels (0-3)
probabilities = pipeline.predict_proba(X)  # confidence matrix
```
The sklearn Pipeline runs two steps internally:
1. **StandardScaler** — normalizes the 4 features (z-score scaling)
2. **XGBClassifier** — multi-class softmax prediction into 4 classes

The model outputs integer-encoded class labels + a probability matrix.

### Step 6: Decode predictions → JSON
```python
# app/main.py:177
label = encoder.inverse_transform([encoded_preds[i]])[0]  # e.g. "Highly Congested"
```
The LabelEncoder maps integers back to human-readable strings. The response is:
```json
{
  "predictions": [
    { "edge_id": "e_R1_R2", "congestion_status": "Uncongested", "probability": 0.9987 },
    { "edge_id": "e_R3_R7", "congestion_status": "Highly Congested", "probability": 0.9995 }
  ]
}
```

### Step 7: Backend runs Dijkstra's PBR
```javascript
// services/dijkstra.js — Cost model:
//   Uncongested          → cost 1   (preferred)
//   Balanced             → cost 3   (acceptable)
//   Moderately Congested → cost 7   (avoided)
//   Highly Congested     → cost 20  (strongly avoided)
//   Dropped              → ∞        (excluded entirely)
```
The backend takes the ML predictions and converts them into **edge weights**. Then Dijkstra's algorithm finds the shortest (cheapest) path from source to target, effectively routing traffic **around** congested links.

The algorithm:
- Builds an **adjacency list** from the graph (undirected)
- Uses a **priority queue** (sorted array) to always expand the cheapest node
- Tracks `dist[]` (shortest distance) and `prev[]` (backpointer for path reconstruction)
- Reconstructs both the **node path** (`[R1, R2, R5, R9, R10]`) and the **edge path** (`[e_R1_R2, e_R2_R5, ...]`)
- Returns `totalCost = Infinity` if the network is partitioned (no path exists)

### Step 8: Backend → Frontend (response)
```json
{
  "nodes": [...],
  "edges": [...],
  "predictions": [...],
  "activePath": {
    "path": ["R1", "R2", "R5", "R9", "R10"],
    "edgePath": ["e_R1_R2", "e_R2_R5", "e_R5_R9", "e_R9_R10"],
    "totalCost": 8
  },
  "routeSource": "R1",
  "routeTarget": "R10"
}
```

### Step 9: Frontend renders
The `NetworkContext` updates all React state, which triggers re-render of:
- **NetworkCanvas**: Edges glow in congestion colors, active path edges are brighter, data packets animate along the active route
- **MetricsPanel**: Summary badges show counts per status, edge cards show per-link details
- **ControlPanel**: Buttons enable/disable based on selection

---

## 4. Technology Stack — Complete List

### Backend (`backend/`)

| Tech | Version | Purpose |
|------|---------|---------|
| **Node.js** | 18+ | Runtime |
| **Express** | 5.2.1 | REST API framework |
| **cors** | 2.8.6 | Cross-Origin Resource Sharing middleware |
| **axios** | 1.20.0 | HTTP client for ML engine communication |
| **nodemon** | 3.1.14 | Hot-reload dev server |

### Frontend (`frontend/`)

| Tech | Version | Purpose |
|------|---------|---------|
| **Next.js** | 16.3.4 | React framework (App Router, Turbopack) |
| **React** | 19.2.8 | UI library |
| **Tailwind CSS** | v4 | Utility-first CSS (CSS-based config, `@import "tailwindcss"`) |
| **HTML5 Canvas API** | — | Custom network visualization (not a charting library) |
| **Outfit** | Google Font | Typography |

### ML Engine (`ml-engine/`)

| Tech | Version | Purpose |
|------|---------|---------|
| **Python** | 3.13 | Runtime |
| **FastAPI** | 0.141.1 | Inference API microservice |
| **Uvicorn** | — | ASGI server (runs FastAPI) |
| **XGBoost** | 3.4.1 | Gradient-boosted tree classifier |
| **scikit-learn** | — | Pipeline (StandardScaler), LabelEncoder, metrics |
| **Pydantic** | v2 | Request/response validation (schemas.py) |
| **pandas** | — | Data loading and manipulation |
| **NumPy** | — | Feature matrix construction |
| **matplotlib** | — | Confusion matrix plot |
| **joblib** | — | Model serialization (.joblib files) |

---

## 5. Algorithms Used

### 5.1 Dijkstra's Shortest Path Algorithm
- **Where**: [dijkstra.js](file:///c:/Users/sanya/Developer/network-digital-twin/backend/services/dijkstra.js)
- **Purpose**: Policy-Based Routing (PBR) — finds the optimal path from source to destination
- **Twist**: Instead of using physical distance as edge weight, we use **ML-predicted congestion status** mapped to numeric costs (1, 3, 7, 20). This makes Dijkstra naturally avoid congested links
- **Complexity**: O((V + E) log V) — but our implementation uses sorted arrays instead of a binary heap (fine for ≤50 nodes)
- **Graph type**: Undirected (each edge is traversable in both directions)

### 5.2 XGBoost Multi-Class Classification
- **Where**: [train.py](file:///c:/Users/sanya/Developer/network-digital-twin/ml-engine/train.py)
- **Objective**: `multi:softprob` — outputs probability distribution over all 4 classes
- **Hyperparameters**: `n_estimators=300`, `max_depth=6`, `learning_rate=0.1`, `subsample=0.8`, `colsample_bytree=0.8`
- **Pipeline**: `StandardScaler → XGBClassifier`
- **Features (4)**: `throughput_mbps`, `capacity_mbps`, `delay_ms`, `utilization_ratio` (derived)
- **Classes (4)**: `Uncongested`, `Balanced`, `Moderately Congested`, `Highly Congested`
- **Training data**: 10,200 synthetic rows (balanced, ~2,550 per class)
- **Performance**: **99.51% test accuracy**, 5-fold CV: 99.57% ± 0.13%

### 5.3 Utilization-Ratio-Based Congestion Classification (Synthetic Data)
- **Where**: [generate_data.py](file:///c:/Users/sanya/Developer/network-digital-twin/ml-engine/data/generate_data.py)
- **Formula**: `utilization = throughput_mbps / capacity_mbps`
- **Thresholds**: `<0.40 → Uncongested`, `<0.65 → Balanced`, `<0.85 → Moderately Congested`, `≥0.85 → Highly Congested`
- **Delay model**: Nonlinear — base propagation delay + queuing delay that grows sharply above 65% utilization + Gaussian jitter
- **Noise injection**: ±1.5% Gaussian noise on utilization to prevent perfectly sharp decision boundaries

---

## 6. File-by-File Breakdown

### Backend (5 files, ~400 lines)

| File | Lines | Purpose |
|------|-------|---------|
| [server.js](file:///c:/Users/sanya/Developer/network-digital-twin/backend/server.js) | 45 | Entry point. Express app with CORS (ports 3000, 4000), JSON middleware, mounts `/api` routes, `/health` endpoint |
| [routes/network.js](file:///c:/Users/sanya/Developer/network-digital-twin/backend/routes/network.js) | 266 | **Core API**. 7 endpoints (see table below). Manages in-memory graph state with deep cloning. Handles fault cascading and conditional restore logic |
| [services/dijkstra.js](file:///c:/Users/sanya/Developer/network-digital-twin/backend/services/dijkstra.js) | 113 | Dijkstra's algorithm with congestion-weighted edges. Returns node path, edge path, and total cost |
| [services/mockML.js](file:///c:/Users/sanya/Developer/network-digital-twin/backend/services/mockML.js) | 15 | **Plugin point**. Currently an axios call to FastAPI at `localhost:8000`. Originally was a mock function; swapped to real ML in one edit |
| [data/topology.json](file:///c:/Users/sanya/Developer/network-digital-twin/backend/data/topology.json) | 32 | Default 10-node, 15-edge graph. Each node has `id`, `label`, `x`, `y` (normalized 0-1 coordinates). Each edge has `id`, `source`, `target`, `capacity_mbps`, `throughput_mbps`, `delay_ms` |

#### Backend API Endpoints (7 total)

| Method | Endpoint | Purpose | Status |
|--------|----------|---------|--------|
| `GET` | `/api/network` | Returns current topology + predictions + route endpoints | ✅ Committed |
| `POST` | `/api/analyze` | Runs ML → Dijkstra pipeline. Accepts optional `{source, target}` | ✅ Committed (modified, uncommitted) |
| `POST` | `/api/fault` | Drops a node/edge. Cascades: dropping a node drops all connected edges | ✅ Committed |
| `POST` | `/api/restore` | Restores a dropped node/edge. Smart cascade: only restores edges whose *both* endpoints are alive | 🔶 Uncommitted |
| `POST` | `/api/edge/update` | Updates throughput/capacity/delay for a specific edge | 🔶 Uncommitted |
| `POST` | `/api/network/load` | Replaces entire graph with custom topology (from Network Builder). Validates duplicates and dangling references | 🔶 Uncommitted |
| `POST` | `/api/reset` | Resets to current baseline (either default or last loaded custom topology) | ✅ Modified |
| `GET` | `/health` | Liveness probe | ✅ Committed |

---

### ML Engine (5 files, ~600 lines)

| File | Lines | Purpose |
|------|-------|---------|
| [app/main.py](file:///c:/Users/sanya/Developer/network-digital-twin/ml-engine/app/main.py) | 191 | FastAPI server. Loads model on startup via `lifespan`. Single `POST /predict-congestion` endpoint. Builds feature matrix, runs inference, maps labels back |
| [app/schemas.py](file:///c:/Users/sanya/Developer/network-digital-twin/ml-engine/app/schemas.py) | 83 | Pydantic v2 models: `EdgeInput`, `PredictRequest`, `EdgePrediction`, `PredictResponse`, `HealthResponse`. Includes validation constraints (`ge=0`, `gt=0`) and OpenAPI examples |
| [train.py](file:///c:/Users/sanya/Developer/network-digital-twin/ml-engine/train.py) | 186 | Training script. Loads CSV → LabelEncoder → train/test split (80/20, stratified) → StandardScaler+XGBoost pipeline → evaluation (accuracy, classification report, 5-fold CV) → saves `.joblib` artifacts |
| [data/generate_data.py](file:///c:/Users/sanya/Developer/network-digital-twin/ml-engine/data/generate_data.py) | 134 | Synthetic data generator. Matches the exact 15-edge topology. Generates ~10,200 balanced rows across 4 classes with realistic delay modeling and noise injection |
| [app/__init__.py](file:///c:/Users/sanya/Developer/network-digital-twin/ml-engine/app/__init__.py) | 2 | Python package marker |

#### Generated Artifacts (git-ignored)
- `data/network_telemetry.csv` — 10,200 training rows
- `models/congestion_model.joblib` — Trained sklearn Pipeline (StandardScaler + XGBClassifier)
- `models/label_encoder.joblib` — LabelEncoder mapping (0-3 ↔ class names)
- `models/confusion_matrix.png` — Evaluation visualization

---

### Frontend (9 files, ~1,400 lines)

| File | Lines | Purpose |
|------|-------|---------|
| [app/layout.js](file:///c:/Users/sanya/Developer/network-digital-twin/frontend/app/layout.js) | 25 | Root layout. Loads **Outfit** font from Google Fonts. Sets dark theme baseline (`bg-gray-950`) |
| [app/globals.css](file:///c:/Users/sanya/Developer/network-digital-twin/frontend/app/globals.css) | 30 | Global CSS. Tailwind v4 import (`@import "tailwindcss"`), scrollbar styling, overflow hidden |
| [app/page.js](file:///c:/Users/sanya/Developer/network-digital-twin/frontend/app/page.js) | 125 | **Main dashboard**. Header with live status indicators (loading spinner, dropped counts, node/edge counts). Mode toggle: sidebar shows MetricsPanel+ControlPanel in view mode, BuildPanel in build mode |
| [lib/api.js](file:///c:/Users/sanya/Developer/network-digital-twin/frontend/lib/api.js) | 107 | Centralized API client. 7 functions: `fetchNetwork`, `analyzeNetwork`, `injectFault`, `restoreItem`, `updateEdge`, `loadCustomNetwork`, `resetNetwork` |
| [context/NetworkContext.jsx](file:///c:/Users/sanya/Developer/network-digital-twin/frontend/context/NetworkContext.jsx) | 336 | **Global state manager** (React Context). 12 state variables, 16 action functions split into View Mode actions (loadNetwork, analyzeNetwork, injectFault, restoreItem, updateEdge, resetNetwork) and Build Mode actions (enterBuildMode, addNode, addEdge, deleteItem, moveNode, updateNodeLabel, finishBuild) |
| [components/NetworkCanvas.jsx](file:///c:/Users/sanya/Developer/network-digital-twin/frontend/components/NetworkCanvas.jsx) | ~415 | **Core visualization**. Pure HTML5 Canvas with `requestAnimationFrame` loop. Draws: grid background, edges (color-coded by congestion), nodes (with glow effects), data packets (animated dots), ghost edges (build mode), "+" cursor, SRC/DST badges. Handles: click (select/add node/connect), mousedown+mousemove (drag), mode branching |
| [components/MetricsPanel.jsx](file:///c:/Users/sanya/Developer/network-digital-twin/frontend/components/MetricsPanel.jsx) | ~270 | Right sidebar (view mode). Congestion summary badges, active route display, per-edge status cards. Contains **EdgeEditor** sub-component: inline sliders for throughput/capacity/delay with live utilization preview bar and congestion status preview (computed client-side using same ratio thresholds) |
| [components/ControlPanel.jsx](file:///c:/Users/sanya/Developer/network-digital-twin/frontend/components/ControlPanel.jsx) | 178 | Bottom panel (view mode). 6 buttons: Drop Link, Drop Node, Restore Link, Restore Node, Re-analyze, Reset All. Selection display with dropped/active indicator. Color legend |
| [components/BuildPanel.jsx](file:///c:/Users/sanya/Developer/network-digital-twin/frontend/components/BuildPanel.jsx) | ~210 | Right sidebar (build mode). Instructions, node/edge counter, label editor, edge property sliders, source/target pickers, delete buttons, "Finish & Analyze", "Load Default Topology" |

---

## 7. The Default Network Graph

The default topology has **10 routers** and **15 links**:

```
R1 ─── R2 ─── R3 ─── R7
│      │      │       │
R4 ─── R5 ─── R6 ──── R10
│      │              
R8 ─── R9 ─────────── R10
```

Capacities range from 500 to 1000 Mbps. Throughputs are pre-set to create a mix of congestion levels. Coordinates (`x`, `y`) are normalized 0-1 for canvas rendering.

---

## 8. Visual Design System

| Element | Style |
|---------|-------|
| **Background** | `#030712` (near-black) with subtle cyan grid lines |
| **Font** | Outfit (Google Fonts) |
| **Uncongested edges** | Cyan `#22d3ee` |
| **Balanced edges** | Lime `#84cc16` |
| **Moderately Congested** | Orange `#f97316` |
| **Highly Congested** | Red `#ef4444` with pulsing glow |
| **Active path edges** | Full opacity + stronger glow |
| **Non-path edges** | 40% opacity |
| **Selected items** | Yellow `#fde047` glow |
| **Dropped nodes** | Dark red circle + red ✕ |
| **Dropped edges** | Dashed grey line |
| **Data packets** | White glowing dots traveling along edges |
| **Build mode grid** | Violet `rgba(139, 92, 246, 0.06)` |
| **Build mode edges** | Violet `#8b5cf6` |
| **Build cursor** | "+" crosshair in violet |
| **Source node badge** | Cyan dashed ring + "SRC" label |
| **Destination badge** | Orange dashed ring + "DST" label |

---

## 9. What's Built vs. What's Pending

### ✅ Fully Built & Committed

| Feature | Commit |
|---------|--------|
| Express backend with CORS, routes, health check | `de8d5d2` |
| Default 10-node topology JSON | `de8d5d2` |
| Mock ML service (utilization-ratio classifier) | `de8d5d2` (later replaced) |
| Dijkstra PBR engine with congestion-weighted edges | `de8d5d2` |
| Fault injection (drop node/edge) with cascade | `de8d5d2` |
| Global reset | `de8d5d2` |
| Next.js dashboard with Tailwind v4 | `de8d5d2` |
| HTML5 Canvas renderer with animations | `de8d5d2` |
| MetricsPanel with status cards | `de8d5d2` |
| ControlPanel with What-If buttons | `de8d5d2` |
| NetworkContext state management | `de8d5d2` |
| API client library | `de8d5d2` |
| Synthetic data generator (10,200 rows) | `3319ade` (DA/DS) |
| XGBoost training pipeline (99.51% accuracy) | `3319ade` (DA/DS) |
| FastAPI inference server | `3319ade` (DA/DS) |
| Pydantic request/response schemas | `3319ade` (DA/DS) |
| Real ML engine integration (axios → FastAPI) | Local only |

### 🔶 Built But Uncommitted (local working tree)

| Feature | Files Changed |
|---------|--------------|
| **Granular Restore** — per-node/edge restore with smart cascade | `routes/network.js`, `api.js`, `NetworkContext.jsx`, `ControlPanel.jsx` |
| **Dynamic Edge Costs** — inline sliders for throughput/capacity/delay with live utilization preview | `routes/network.js`, `MetricsPanel.jsx` (EdgeEditor), `NetworkContext.jsx` |
| **Custom Network Builder** — blank canvas, click-to-add nodes, click-to-connect, drag-to-reposition, source/target pickers | `routes/network.js`, `NetworkCanvas.jsx`, `BuildPanel.jsx` (new), `page.js`, `NetworkContext.jsx` |
| **ML Engine connection** — replaced mock with real axios call to FastAPI | `services/mockML.js` |

### 🔲 Not Yet Built (Future Roadmap)

| Feature | Description |
|---------|-------------|
| Save/Load custom topologies | Export/import graph as JSON file |
| Docker Compose | Single `docker-compose up` for all 3 services |
| Cloud deployment | Deploy for live demo access |
| Real-time telemetry streaming | WebSocket-based live updates instead of manual re-analyze |
| Graph topology templates | Pre-built Erdős–Rényi, Barabási–Albert graphs |
| Max graph size limits | Performance cap at ~50 nodes |
| Unit/integration tests | Automated test suites for backend routes and ML predictions |

---

## 10. The Plugin Architecture

The single most important design decision: the **entire ML integration** is isolated to one 15-line file: [`mockML.js`](file:///c:/Users/sanya/Developer/network-digital-twin/backend/services/mockML.js).

```
Before:  mockML.js → local function (ratio-based classifier)
After:   mockML.js → axios.post('http://127.0.0.1:8000/predict-congestion')
```

No other SDE file changed. The API contract ([`api_contract.md`](file:///c:/Users/sanya/Developer/network-digital-twin/api_contract.md)) defines the exact JSON schema both sides must follow. This allowed the SDE and DA/DS to work **completely independently** and merge at the end.

---

## 11. Git History & Collaboration

```
1a6c904  Project created
edf14d5  chore: remove node_modules from git tracking
de8d5d2  feat: SDE Phase 2-4 — Next.js dashboard, Express PBR engine, Dijkstra routing
3319ade  feat(ml-engine): add synthetic data gen, XGBoost training & FastAPI service  ← DA/DS PR
dd04ee1  Merge pull request #1 from ds/xgboost-training
0c767b1  docs: add complete project walkthrough
```

- **Branching strategy**: `sde/*` branches for SDE work, `ds/*` branches for DA/DS work
- **Folder isolation**: SDE → `backend/` + `frontend/`, DA/DS → `ml-engine/` — zero merge conflicts
- **Uncommitted**: 10 files changed, +1,185 / -211 lines (Features 1-3 + ML integration)
