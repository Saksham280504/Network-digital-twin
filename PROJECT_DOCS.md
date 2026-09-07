# Predictive Network Digital Twin (NDT)

An Interactive, Fault-Tolerant Network Digital Twin that uses Machine Learning to predict network congestion from tabular telemetry data and dynamically reroutes traffic using Policy-Based Routing (Dijkstra's algorithm).

> **Research Paper:** Based on MPNN-based Congestion-Aware Predictive Traffic Routing. See `NDT.pdf` in the repo root.

---

## Table of Contents

1. [How the System Works](#how-the-system-works)
2. [Architecture Diagram](#architecture-diagram)
3. [Tech Stack](#tech-stack)
4. [Repository Structure](#repository-structure)
5. [SDE — What Was Built](#sde--what-was-built)
6. [DA/DS — What Needs to Be Built](#dads--what-needs-to-be-built)
7. [API Contract](#api-contract)
8. [Plugin Architecture — How DA/DS Plugs Into SDE](#plugin-architecture--how-dads-plugs-into-sde)
9. [How to Run the Project](#how-to-run-the-project)
10. [Git Collaboration Workflow](#git-collaboration-workflow)
11. [Future Roadmap](#future-roadmap)

---

## How the System Works

The system follows a three-stage pipeline that repeats every time the user interacts with the dashboard:

```
┌──────────────┐     POST /api/analyze     ┌──────────────┐     POST /predict     ┌──────────────┐
│              │ ─────────────────────────► │              │ ──────────────────── ► │              │
│   Frontend   │                            │   Backend    │                        │  ML Engine   │
│  (Next.js)   │ ◄───────────────────────── │  (Express)   │ ◄──────────────────── │  (FastAPI)   │
│              │   Updated topology +       │              │   Congestion           │              │
│              │   active route + colors    │              │   predictions          │              │
└──────────────┘                            └──────────────┘                        └──────────────┘
                                                   │
                                            Dijkstra's PBR
                                            (recalculates
                                             optimal path)
```

**Step-by-step flow:**

1. **Dashboard loads** → Frontend calls `GET /api/network` to fetch the graph topology (10 routers, 15 links)
2. **Analysis triggered** → Frontend calls `POST /api/analyze`
3. **Backend collects telemetry** → Gathers `throughput_mbps`, `delay_ms`, `capacity_mbps` for all active (non-dropped) edges
4. **ML Engine predicts** → Backend sends the telemetry to the ML engine (currently a mock, later the real FastAPI service). The ML engine classifies each edge as: `Highly Congested`, `Moderately Congested`, `Balanced`, or `Uncongested`
5. **Dijkstra reroutes** → Backend uses the congestion predictions as edge weights and runs Dijkstra's shortest-path algorithm from R1 → R10, finding the optimal route that avoids congested links
6. **Frontend updates** → The canvas animates the network: edges glow in congestion colors, data packets travel along the active path, and the sidebar shows live metrics
7. **What-If analysis** → The user can click a node or link, drop it (simulate a crash), and watch the system re-predict and reroute in real-time

---

## Architecture Diagram

```
network-digital-twin/
│
├── frontend/          ← SDE (Next.js + Tailwind CSS)
│   ├── app/
│   │   ├── page.js           Main dashboard page
│   │   ├── layout.js         Root layout (Outfit font, dark theme)
│   │   └── globals.css       Global styles + Tailwind
│   ├── components/
│   │   ├── NetworkCanvas.jsx  HTML5 canvas: animated nodes, edges, packets
│   │   ├── MetricsPanel.jsx   Right sidebar: edge status cards, active route
│   │   └── ControlPanel.jsx   What-If controls: drop/restore, re-analyze
│   ├── context/
│   │   └── NetworkContext.jsx  Shared state (topology, predictions, path)
│   └── lib/
│       └── api.js             API client (all backend HTTP calls)
│
├── backend/           ← SDE (Node.js + Express)
│   ├── server.js              Entry point, CORS, route mounting
│   ├── routes/
│   │   └── network.js         REST API endpoints
│   ├── services/
│   │   ├── dijkstra.js        Dijkstra's PBR engine (congestion = edge weight)
│   │   └── mockML.js          ★ PLUGIN POINT — mock ML predictions
│   └── data/
│       └── topology.json      Default 10-node, 15-edge network graph
│
├── ml-engine/         ← DA/DS (Python + FastAPI)
│   └── (to be built)
│
├── api_contract.md    ← Shared schema definition (SDE ↔ DA/DS)
└── implementation_plan.md
```

---

## Tech Stack

| Layer       | Technology               | Owner  |
|-------------|--------------------------|--------|
| Frontend    | Next.js 16, Tailwind v4, HTML5 Canvas | SDE |
| Backend     | Node.js, Express 5       | SDE    |
| ML Engine   | Python, FastAPI, XGBoost/LightGBM | DA/DS |
| Routing     | Dijkstra's Algorithm     | SDE    |
| State       | React Context API        | SDE    |
| Dev Tools   | nodemon (hot reload)     | SDE    |

---

## SDE — What Was Built

### Backend (Express Server — Port 4000)

| Component | File | Description |
|-----------|------|-------------|
| **Entry Point** | `backend/server.js` | Express app with CORS, JSON middleware, route mounting |
| **API Routes** | `backend/routes/network.js` | 4 endpoints (see table below) |
| **Dijkstra PBR** | `backend/services/dijkstra.js` | Shortest-path algorithm using congestion as weights |
| **Mock ML** | `backend/services/mockML.js` | Simulates ML predictions using utilization ratio |
| **Topology** | `backend/data/topology.json` | Default 10-router, 15-link network graph |

#### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/network` | Returns current topology + last predictions |
| `POST` | `/api/analyze` | Runs ML prediction → Dijkstra rerouting → returns updated state |
| `POST` | `/api/fault` | Drops a node or edge (simulates crash). Body: `{ type, id }` |
| `POST` | `/api/reset` | Restores entire network to baseline topology |
| `GET` | `/health` | Health check |

#### Dijkstra Cost Model

The PBR engine assigns costs to edges based on congestion status, then finds the cheapest path:

| Congestion Status | Edge Cost | Effect |
|-------------------|-----------|--------|
| Uncongested | 1 | Preferred |
| Balanced | 3 | Acceptable |
| Moderately Congested | 7 | Avoided |
| Highly Congested | 20 | Strongly avoided |
| Dropped | ∞ | Excluded entirely |

### Frontend (Next.js Dashboard — Port 3000)

| Component | File | Description |
|-----------|------|-------------|
| **Dashboard** | `app/page.js` | Main layout: header + canvas + sidebar |
| **Canvas** | `components/NetworkCanvas.jsx` | Animated HTML5 canvas with glowing nodes, color-coded edges, data packet animation, click-to-select |
| **Metrics** | `components/MetricsPanel.jsx` | Sidebar: congestion summary badges, active route display, per-edge status cards |
| **Controls** | `components/ControlPanel.jsx` | What-If panel: drop link/node, re-analyze, reset |
| **State** | `context/NetworkContext.jsx` | React Context managing all shared state and API calls |
| **API Client** | `lib/api.js` | Centralized fetch wrapper for all backend endpoints |

#### Visual Design

- **Theme:** Deep space dark mode (`#030712` background)
- **Font:** Outfit (Google Fonts)
- **Edge colors by congestion:**
  - 🟢 Uncongested → Cyan (`#22d3ee`)
  - 🟡 Balanced → Lime (`#84cc16`)
  - 🟠 Moderately Congested → Orange (`#f97316`)
  - 🔴 Highly Congested → Red (`#ef4444`) with pulsing glow
- **Active path:** Brighter edges + stronger glow
- **Data packets:** Small white glowing dots traveling along active edges
- **Dropped items:** Dashed grey lines, red ✕ on nodes

---

## DA/DS — What Needs to Be Built

All DA/DS work goes inside the `ml-engine/` folder. The SDE side is already complete and working with a mock ML service.

### Task 1: Synthetic Data Generation

Create Python scripts to generate tabular network telemetry logs matching the topology:

| Column | Type | Description |
|--------|------|-------------|
| `edge_id` | string | e.g., `e_R1_R2` |
| `source` | string | Source node ID |
| `target` | string | Target node ID |
| `throughput_mbps` | float | Current throughput |
| `capacity_mbps` | float | Link capacity |
| `delay_ms` | float | Latency |
| `congestion_status` | string | Label: `Highly Congested`, `Moderately Congested`, `Balanced`, `Uncongested` |

Generate thousands of rows across varying network conditions for training.

### Task 2: Model Training

- Clean and preprocess the synthetic CSV data
- Train a multi-class classifier (XGBoost or LightGBM) to predict `congestion_status` from `throughput_mbps`, `capacity_mbps`, and `delay_ms`
- Evaluate using accuracy, precision, recall, F1-score, confusion matrix
- Save the trained model as a `.pkl` or `.joblib` file

### Task 3: FastAPI Microservice

Build a Python FastAPI server (default port `8000`) that:

1. Loads the trained model on startup
2. Exposes a `POST /predict-congestion` endpoint
3. Accepts the request schema below
4. Returns predictions in the response schema below

#### Request (what the Node.js backend will send):
```json
{
  "edges": [
    {
      "id": "e_R1_R2",
      "source": "R1",
      "target": "R2",
      "throughput_mbps": 120.5,
      "delay_ms": 15.2,
      "capacity_mbps": 1000
    }
  ]
}
```

#### Response (what FastAPI must return):
```json
{
  "predictions": [
    {
      "edge_id": "e_R1_R2",
      "congestion_status": "Highly Congested",
      "probability": 0.89
    }
  ]
}
```

### Suggested `ml-engine/` Structure

```
ml-engine/
├── data/
│   └── generate_data.py       Synthetic data generation script
├── models/
│   └── congestion_model.pkl   Trained model file
├── app/
│   └── main.py                FastAPI server
├── notebooks/
│   └── training.ipynb         Model training notebook
├── requirements.txt           Python dependencies
└── README.md
```

---

## Plugin Architecture — How DA/DS Plugs Into SDE

The entire SDE system is designed so the DA/DS ML engine plugs in by changing **exactly one file**: `backend/services/mockML.js`.

### Current State (Mock)

```
Backend → mockML.js (local function, uses throughput/capacity ratio)
```

### After DA/DS Integration

```
Backend → mockML.js (HTTP call to FastAPI at localhost:8000)
```

### The Exact Change Required

In `backend/services/mockML.js`, replace the mock function with:

```javascript
const axios = require('axios');
const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:8000/predict-congestion';

async function predictCongestion(edges) {
  const response = await axios.post(ML_ENGINE_URL, { edges });
  return response.data.predictions;
}

module.exports = { predictCongestion };
```

Then install axios:
```bash
cd backend && npm install axios
```

**That's it.** No other SDE file needs to change. The frontend, Dijkstra engine, and all API routes remain untouched.

---

## How to Run the Project

### Prerequisites
- **Node.js** v18+ (for backend and frontend)
- **Python** 3.9+ (for ML engine, when ready)

### Running the SDE Side (works standalone)

Open **two terminals**:

```bash
# Terminal 1 — Backend (port 4000, with hot-reload)
cd backend
npm install
npm run dev

# Terminal 2 — Frontend (port 3000)
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

### Running with ML Engine (after DA/DS completes)

Open **three terminals**:

```bash
# Terminal 1 — ML Engine (port 8000)
cd ml-engine
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Terminal 2 — Backend (port 4000)
cd backend
npm run dev

# Terminal 3 — Frontend (port 3000)
cd frontend
npm run dev
```

---

## Git Collaboration Workflow

Both SDE and DA/DS work on the **same repository** but in **different folders**, so merge conflicts are inherently avoided.

### Initial Setup (DA/DS)

```bash
git clone https://github.com/Saksham280504/Network-digital-twin.git
cd Network-digital-twin
```

### Branching Strategy

| Role | Branch prefix | Example |
|------|---------------|---------|
| SDE | `sde/` | `sde/restore-feature` |
| DA/DS | `ds/` | `ds/xgboost-training` |

### Daily Workflow

```bash
# 1. Create a feature branch
git checkout -b sde/my-feature    # or ds/my-feature

# 2. Work, then stage and commit
git add backend/ frontend/        # SDE stages these folders
git add ml-engine/                # DA/DS stages this folder
git commit -m "feat: describe what you did"

# 3. Push your branch
git push -u origin sde/my-feature

# 4. On GitHub: Create a Pull Request → Merge into main

# 5. After the other person merges, pull their changes
git checkout main
git pull origin main
git checkout <your-branch>
git merge main
```

### Rules
- **Never commit directly to `main`** — always use a feature branch + PR
- **SDE only touches:** `frontend/`, `backend/`, root config files
- **DA/DS only touches:** `ml-engine/`
- **Shared:** `api_contract.md` (discuss changes before editing)

---

## Future Roadmap

These features are planned and have detailed technical designs ready:

| Feature | Description | Status |
|---------|-------------|--------|
| **Granular Restore** | Restore individual dropped nodes/links instead of resetting the whole network | Planned |
| **Dynamic Edge Costs** | Edit throughput/capacity/delay per edge from the sidebar with live congestion preview | Planned |
| **Custom Network Builder** | Draw your own network topology from scratch on a blank canvas | Planned |
| **Docker Compose** | Single `docker-compose up` to spin up all 3 services | Planned |
| **Cloud Deployment** | Deploy for live demo access | Future |
