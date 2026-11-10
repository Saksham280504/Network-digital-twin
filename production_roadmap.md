# NDT — Production Roadmap & Implementation Plan

> A phase-by-phase plan to take the Network Digital Twin from its current working prototype to an industry-grade, production-deployed system.

---

## Current State Summary

| Layer | Status | Notes |
|-------|--------|-------|
| Backend (Express) | ✅ Functional | 7 API endpoints, in-memory state, Dijkstra PBR |
| Frontend (Next.js) | ✅ Functional | Canvas renderer, 4 sidebar components, 2 modes (view/build) |
| ML Engine (FastAPI) | ✅ Functional | XGBoost, 99.5% accuracy, live inference |
| Integration | ✅ Working | Backend → FastAPI via axios, tested live |
| **Uncommitted work** | 🔶 10 files, +1185 lines | Restore, Edge Editor, Network Builder, ML connection |
| Tests | ❌ None | No unit, integration, or e2e tests |
| Persistence | ❌ None | All state is in-memory, lost on restart |
| Containerization | ❌ None | Manual startup of 3 separate terminals |
| Deployment | ❌ None | Runs only on localhost |
| Security | ❌ None | No auth, no rate limiting, no input sanitization |
| Monitoring | ❌ None | Only console.log statements |

---

## Phase 0: Stabilize & Commit (Immediate)

> **Why**: We have ~1,200 lines of uncommitted code across 10 files. This is the highest-priority risk — one accidental `git checkout` wipes everything.

### 0.1 — Fix Known Dashboard Issues
Before committing, test and resolve the UI issues you mentioned. Common candidates:

| Likely Issue | Root Cause | Fix Location |
|-------------|-----------|-------------|
| Canvas not redrawing after build mode | `packetsRef.current` not reinitialised when switching modes | [`NetworkCanvas.jsx`](file:///c:/Users/sanya/Developer/network-digital-twin/frontend/components/NetworkCanvas.jsx) — reset `packetsRef` in the `useEffect` that watches `mode` |
| MetricsPanel scroll broken in edge editor | EdgeEditor takes flex space but parent has `overflow-hidden` | [`MetricsPanel.jsx`](file:///c:/Users/sanya/Developer/network-digital-twin/frontend/components/MetricsPanel.jsx) — make EdgeEditor `flex-shrink-0` and ensure the edge list div gets `flex-1 overflow-y-auto` |
| "Reset All" after build mode loads wrong topology | `currentBaseline` on backend might point to default even after a custom load | [`routes/network.js`](file:///c:/Users/sanya/Developer/network-digital-twin/backend/routes/network.js) — verify `currentBaseline` is updated inside `POST /api/network/load` (it already is, but verify the reset path) |
| Edge editor sliders reset when re-analyze returns | `EdgeEditor` initialises from `edge.throughput_mbps` which gets overwritten by the analyze response | [`MetricsPanel.jsx`](file:///c:/Users/sanya/Developer/network-digital-twin/frontend/components/MetricsPanel.jsx) — track whether user has unsaved changes and skip reinit |

### 0.2 — Commit Everything

```bash
git add -A
git commit -m "feat: granular restore, dynamic edge costs, network builder, ML engine integration"
git push origin main
```

### 0.3 — ML Engine Fallback

**Problem**: Right now, if the Python ML engine is not running, the entire dashboard crashes on load because `POST /api/analyze` fails when `axios.post()` to FastAPI times out.

**Solution**: Add a graceful fallback in [`mockML.js`](file:///c:/Users/sanya/Developer/network-digital-twin/backend/services/mockML.js) that falls back to the original ratio-based classifier if the ML engine is unreachable:

```javascript
// services/mockML.js — with fallback
const axios = require('axios');
const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://127.0.0.1:8000/predict-congestion';

async function predictCongestion(edges) {
  try {
    const response = await axios.post(ML_ENGINE_URL, { edges }, { timeout: 3000 });
    return response.data.predictions;
  } catch (error) {
    console.warn('[ML Engine] Unreachable, falling back to ratio-based classifier');
    return fallbackPredict(edges);
  }
}

function fallbackPredict(edges) {
  return edges.map(edge => {
    const ratio = edge.throughput_mbps / edge.capacity_mbps;
    let status, probability;
    if (ratio >= 0.80) { status = 'Highly Congested'; probability = ratio; }
    else if (ratio >= 0.55) { status = 'Moderately Congested'; probability = ratio; }
    else if (ratio >= 0.25) { status = 'Balanced'; probability = 1 - ratio; }
    else { status = 'Uncongested'; probability = 1 - ratio; }
    return { edge_id: edge.id, congestion_status: status, probability: +probability.toFixed(3) };
  });
}
```

**Why this matters**: The dashboard should always work. If you're demoing and the Python process crashes, the system should degrade gracefully instead of showing a blank error screen.

> **Effort**: ~2 hours  
> **Files**: `mockML.js`, `ControlPanel.jsx` (dashboard issues), `MetricsPanel.jsx`, `NetworkCanvas.jsx`

---

## Phase 1: Testing & Reliability (~3-4 days)

> **Why**: Zero tests currently exist. For production, every API endpoint and every critical frontend interaction must have automated test coverage. This is the foundation for safe future development — without tests, every change risks silently breaking something.

### 1.1 — Backend Unit Tests

**Tool**: [Jest](https://jestjs.io/) (JavaScript test runner)

**What to test**:

| Test File | Tests | What It Validates |
|-----------|-------|-------------------|
| `tests/routes/network.test.js` | 15-20 tests | Every API endpoint: correct response shape, 400/404 error cases, fault cascade, restore cascade, edge update validation, network load validation (duplicate IDs, dangling edges), reset restores to correct baseline |
| `tests/services/dijkstra.test.js` | 8-10 tests | Shortest path on simple graph, avoids congested edges, handles network partition (returns `Infinity`), handles single-node graph, handles custom source/target |
| `tests/services/mockML.test.js` | 3-4 tests | Fallback mode returns correct schema, ML engine returns correct schema, timeout triggers fallback |

**How**:
```bash
cd backend
npm install --save-dev jest supertest
```

Use `supertest` to make HTTP requests to the Express app without starting a real server:
```javascript
const request = require('supertest');
const app = require('../server'); // export app from server.js

test('POST /api/fault drops a node and cascades', async () => {
  const res = await request(app).post('/api/fault').send({ type: 'node', id: 'R3' });
  expect(res.status).toBe(200);
  expect(res.body.nodes.find(n => n.id === 'R3').dropped).toBe(true);
  // Connected edges should also be dropped
  expect(res.body.edges.find(e => e.id === 'e_R2_R3').dropped).toBe(true);
  expect(res.body.edges.find(e => e.id === 'e_R3_R6').dropped).toBe(true);
  expect(res.body.edges.find(e => e.id === 'e_R3_R7').dropped).toBe(true);
});
```

> [!IMPORTANT]
> **server.js needs a small refactor**: Currently it calls `app.listen()` at the top level. For testing, we need to export `app` without starting the server. Wrap the listen call:
> ```javascript
> if (require.main === module) { app.listen(PORT, () => { ... }); }
> module.exports = app;
> ```

### 1.2 — ML Engine Unit Tests

**Tool**: [pytest](https://pytest.org/) + `httpx` (async HTTP client for FastAPI testing)

**What to test**:

| Test File | Tests | What It Validates |
|-----------|-------|-------------------|
| `tests/test_predict.py` | 6-8 tests | Correct response schema, all 4 congestion classes are reachable, probability is between 0-1, edge_id matches input, handles edge with `capacity_mbps=0` (division by zero), returns 503 when model not loaded, returns 422 on missing fields |
| `tests/test_generate.py` | 3-4 tests | Generated data has correct columns, balanced class distribution, utilization_ratio matches throughput/capacity |

**How**:
```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_predict_returns_correct_classes():
    payload = {"edges": [
        {"id": "e1", "source": "A", "target": "B", "throughput_mbps": 900, "delay_ms": 40, "capacity_mbps": 1000},
        {"id": "e2", "source": "C", "target": "D", "throughput_mbps": 50, "delay_ms": 2, "capacity_mbps": 1000},
    ]}
    res = client.post("/predict-congestion", json=payload)
    assert res.status_code == 200
    preds = res.json()["predictions"]
    assert preds[0]["congestion_status"] == "Highly Congested"
    assert preds[1]["congestion_status"] == "Uncongested"
```

### 1.3 — Frontend Component Testing (Optional but recommended)

**Tool**: [Vitest](https://vitest.dev/) + [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)

Focus on testing the **logic**, not the canvas rendering:
- `NetworkContext`: Test that `injectFault` correctly calls API and updates state
- `ControlPanel`: Test button enable/disable logic based on selection state
- `api.js`: Test that correct URLs and methods are called

> **Effort**: ~3-4 days total  
> **Files**: New `tests/` directories in `backend/` and `ml-engine/`  
> **Deliverable**: `npm test` passes in backend, `pytest` passes in ml-engine

---

## Phase 2: Persistence & State Management (~1 week)

> **Why**: Currently, ALL network state lives in JavaScript variables inside `routes/network.js`. If the Express server restarts (crashes, deployment, OS reboot), every fault injection, edge edit, and custom topology is lost. For production, state must survive restarts.

### 2.1 — Backend Persistence Layer

**Options analysis**:

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **SQLite** (via `better-sqlite3`) | Zero setup, single file, perfect for single-server | Not suited for horizontal scaling | ✅ **Best for our use case** |
| **PostgreSQL** | Industrial standard, scales well | Requires external service, overkill for graph state | For later (cloud deployment) |
| **Redis** | Blazing fast, built-in TTL | In-memory (needs persistence config), another service | For caching layer later |
| **JSON file** (`fs.writeFileSync`) | Simplest possible | No concurrency safety, slow for large state | ❌ Not production-ready |

**Implementation plan (SQLite)**:

Create a new file: `backend/services/db.js`

```
Tables:
├── topologies     (id, name, nodes_json, edges_json, created_at, is_default)
├── sessions       (id, topology_id, state_json, predictions_json, route_source, route_target, updated_at)
└── snapshots      (id, session_id, label, state_json, created_at)  ← for "save state" feature
```

**What changes**:
- `routes/network.js`: Replace raw `let networkState = ...` with `db.getSession()` / `db.saveSession()` calls
- On server start: load last session from DB (or create default)
- After every mutation (fault, restore, edge update, load): persist to DB
- `/api/reset` reads from `topologies` table instead of in-memory `currentBaseline`

### 2.2 — Save/Load Custom Topologies

**New endpoints**:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/topologies` | List all saved topologies (id, name, node count, edge count, created_at) |
| `POST` | `/api/topologies/save` | Save current topology with a name |
| `GET` | `/api/topologies/:id` | Load a specific saved topology |
| `DELETE` | `/api/topologies/:id` | Delete a saved topology |

**Frontend**: Add a "Save Topology" button in the ControlPanel and a topology picker dropdown in the header.

### 2.3 — State Snapshots (Undo/Redo)

**Why**: During What-If analysis, operators often want to compare scenarios. "What if R3 goes down?" → analyze → "What if R3 stays up but R6 goes down instead?" Currently they have to manually undo by restoring.

**Implementation**: 
- Store a stack of up to 20 snapshots in memory (backed by SQLite)
- Every mutation (fault, restore, edge update) pushes to the stack
- Add "Undo" / "Redo" buttons to the ControlPanel
- Keyboard shortcuts: `Ctrl+Z` / `Ctrl+Shift+Z`

> **Effort**: ~1 week  
> **Files**: New `backend/services/db.js`, modified `routes/network.js`, new UI elements  
> **Dependencies**: `npm install better-sqlite3`

---

## Phase 3: Real-Time Capabilities (~1 week)

> **Why**: Currently, the dashboard only updates when the user clicks "Re-analyze". In a real network operations center, telemetry arrives continuously. The dashboard should reflect changes in real-time without manual intervention.

### 3.1 — WebSocket Layer (Socket.IO)

**Architecture change**:
```
Currently:    Frontend ──[HTTP POST]──► Backend ──[HTTP POST]──► ML Engine
                       ◄──[HTTP Response]──

Proposed:     Frontend ◄══[WebSocket]══► Backend ──[HTTP POST]──► ML Engine
              (Socket.IO bi-directional)
```

**What this enables**:
1. **Server-push updates**: When one operator injects a fault, all connected dashboards update instantly
2. **Periodic auto-analysis**: Backend runs `analyzeNetwork()` every N seconds and pushes results
3. **Live packet animation sync**: All clients see the same packet positions

**Implementation**:

Install Socket.IO on both sides:
```bash
# Backend
cd backend && npm install socket.io

# Frontend
cd frontend && npm install socket.io-client
```

**Backend** (`server.js`):
```javascript
const { Server } = require('socket.io');
const httpServer = require('http').createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  console.log('[WS] Client connected:', socket.id);
  socket.on('disconnect', () => console.log('[WS] Client disconnected'));
});

// After every state mutation in routes, emit to all clients:
// io.emit('network:updated', { nodes, edges, predictions, activePath });
```

**Frontend** (`context/NetworkContext.jsx`):
```javascript
useEffect(() => {
  const socket = io('http://localhost:4000');
  socket.on('network:updated', (data) => applyAnalysis(data));
  return () => socket.disconnect();
}, []);
```

### 3.2 — Simulated Live Telemetry Stream

**Why**: To demonstrate real-time capabilities without a physical network, create a telemetry simulator that randomly fluctuates edge throughput values every few seconds.

**New file**: `backend/services/telemetrySimulator.js`

```javascript
// Every 5 seconds:
//   1. Randomly adjust throughput_mbps on 2-3 edges by ±10-20%
//   2. Run ML prediction
//   3. Run Dijkstra
//   4. Push update via WebSocket
```

**Dashboard toggle**: A "Live Mode" switch in the header. When enabled, the simulator runs. When disabled, manual analysis only.

### 3.3 — Multi-Client Sync

With WebSocket in place, multiple operators can view the same dashboard. One person's fault injection is instantly visible to all. This is critical for NOC (Network Operations Center) environments where multiple engineers monitor the same network.

> **Effort**: ~1 week  
> **Files**: Modified `server.js`, new `telemetrySimulator.js`, modified `NetworkContext.jsx`, new Socket.IO integration  
> **Dependencies**: `socket.io`, `socket.io-client`

---

## Phase 4: Production Hardening (~1 week)

> **Why**: The current codebase has zero security, zero validation beyond basic checks, and no error boundaries. Before deploying anywhere public, these gaps must be closed.

### 4.1 — Input Validation & Sanitization

**Backend** — add express-validator or Joi:

| Endpoint | Current Validation | Needed |
|----------|-------------------|--------|
| `POST /api/fault` | Checks `type` and `id` exist | Validate `type ∈ {'node', 'edge'}`, `id` is alphanumeric, max length 50 |
| `POST /api/edge/update` | Checks `id` exists | Validate numeric ranges: `throughput ≥ 0`, `capacity > 0`, `delay ≥ 0`. Reject NaN/Infinity |
| `POST /api/network/load` | Checks array lengths and duplicate IDs | Cap at 100 nodes, 500 edges. Validate coordinate ranges (0-1). Reject non-string IDs |
| `POST /api/analyze` | Validates source/target exist in graph | Rate-limit to 10 req/sec per client |

### 4.2 — Rate Limiting

```bash
npm install express-rate-limit
```

```javascript
const rateLimit = require('express-rate-limit');
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 60,              // 60 requests per minute per IP
  message: { error: 'Too many requests' }
}));
```

### 4.3 — Error Boundaries (Frontend)

Create a React error boundary component that catches rendering errors and shows a graceful fallback instead of a blank white screen:

```jsx
// components/ErrorBoundary.jsx
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) return <FallbackUI error={this.state.error} />;
    return this.props.children;
  }
}
```

Wrap `<Dashboard />` in `page.js` with this boundary.

### 4.4 — Environment Configuration

Currently, URLs are hardcoded. Create a proper config system:

**Backend** (`backend/.env`):
```env
PORT=4000
ML_ENGINE_URL=http://127.0.0.1:8000/predict-congestion
ML_TIMEOUT_MS=3000
NODE_ENV=production
```

**Frontend** (`frontend/.env.local`):
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=http://localhost:4000
```

Install `dotenv` in backend:
```bash
npm install dotenv
```

### 4.5 — Logging

Replace all `console.log` with a structured logger:

```bash
npm install winston
```

```javascript
// backend/services/logger.js
const winston = require('winston');
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ]
});
```

Every API call gets a structured log entry: `{ timestamp, method, endpoint, clientIP, responseTime, statusCode }`.

### 4.6 — Performance: Dijkstra Priority Queue

**Current issue**: The Dijkstra implementation uses `pq.sort()` on every iteration — O(n log n) per step, making the overall complexity O(V × E × log(E)) instead of O((V+E) × log V).

**Fix**: Replace the sorted array with a **binary min-heap**:

```javascript
// services/MinHeap.js — standard binary heap
class MinHeap {
  constructor() { this.data = []; }
  push(item) { ... }  // O(log n)
  pop()      { ... }  // O(log n)
  get size() { return this.data.length; }
}
```

This is fine for 10-50 nodes but becomes critical if the Network Builder allows 100+ node graphs.

> **Effort**: ~1 week  
> **Files**: New `logger.js`, `MinHeap.js`, `.env` files, `ErrorBoundary.jsx`, modified `server.js`, `routes/network.js`  
> **Dependencies**: `winston`, `dotenv`, `express-rate-limit`, `express-validator`

---

## Phase 5: Containerization & CI/CD (~3-4 days)

> **Why**: Currently, running the project requires opening 3 terminals, running 3 different commands, and having Node.js + Python + pip all installed. Docker reduces this to a single `docker-compose up`. CI/CD ensures every push is tested automatically.

### 5.1 — Dockerfiles

**Backend Dockerfile** (`backend/Dockerfile`):
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 4000
CMD ["node", "server.js"]
```

**ML Engine Dockerfile** (`ml-engine/Dockerfile`):
```dockerfile
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Train model during build if not present
RUN python train.py || true
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Frontend Dockerfile** (`frontend/Dockerfile`):
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["npm", "start"]
```

### 5.2 — Docker Compose

**`docker-compose.yml`** (project root):
```yaml
version: '3.8'
services:
  ml-engine:
    build: ./ml-engine
    ports: ["8000:8000"]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 10s
      retries: 3

  backend:
    build: ./backend
    ports: ["4000:4000"]
    environment:
      ML_ENGINE_URL: http://ml-engine:8000/predict-congestion
    depends_on:
      ml-engine:
        condition: service_healthy

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    environment:
      NEXT_PUBLIC_BACKEND_URL: http://backend:4000
    depends_on: [backend]
```

One command to run everything:
```bash
docker-compose up --build
```

### 5.3 — GitHub Actions CI Pipeline

**`.github/workflows/ci.yml`**:
```yaml
name: CI
on: [push, pull_request]
jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd backend && npm ci && npm test

  ml-engine-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.13' }
      - run: cd ml-engine && pip install -r requirements.txt && pytest

  frontend-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd frontend && npm ci && npm run build
```

> **Effort**: ~3-4 days  
> **Files**: 3 new Dockerfiles, `docker-compose.yml`, `.github/workflows/ci.yml`  
> **Dependencies**: Docker Desktop installed locally

---

## Phase 6: Cloud Deployment (~3-5 days)

> **Why**: To make the project accessible for demos, presentations, and real-world use without requiring local setup.

### 6.1 — Deployment Platform Options

| Platform | Cost | Difficulty | Best For |
|----------|------|-----------|----------|
| **Railway** | Free tier → $5/mo | Easy | Quick deployment, 3 services in 1 dashboard |
| **Render** | Free tier | Easy | Free HTTPS, auto-deploy from GitHub |
| **AWS (ECS + Fargate)** | ~$15-30/mo | Complex | Production-grade, scalable |
| **Vercel + Railway** | Free frontend | Medium | Vercel for Next.js (optimized), Railway for backend + ML |

**Recommended**: **Vercel (frontend) + Railway (backend + ML engine)**
- Vercel is purpose-built for Next.js — zero-config deployment, edge CDN, automatic HTTPS
- Railway supports Docker, so backend and ML engine deploy directly from their Dockerfiles
- Total cost: $0-$10/month for demo usage

### 6.2 — Deployment Steps

1. **Frontend on Vercel**:
   - Connect GitHub repo → Vercel auto-detects Next.js
   - Set `NEXT_PUBLIC_BACKEND_URL` to the Railway backend URL
   - Every push to `main` auto-deploys

2. **Backend + ML Engine on Railway**:
   - Create 2 services from the same repo (different root directories)
   - Set env vars: `ML_ENGINE_URL`, `PORT`, `NODE_ENV=production`
   - Railway provides HTTPS URLs automatically

3. **DNS**: Point a custom domain (e.g., `ndt.yourdomain.com`) to Vercel

### 6.3 — Production Environment Variables

| Variable | Dev Value | Production Value |
|----------|-----------|-----------------|
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:4000` | `https://ndt-backend.up.railway.app` |
| `ML_ENGINE_URL` | `http://127.0.0.1:8000/...` | `http://ml-engine.railway.internal:8000/...` |
| `NODE_ENV` | `development` | `production` |
| `PORT` | `4000` | Railway assigns automatically |

### 6.4 — HTTPS & CORS for Production

Update CORS in `server.js`:
```javascript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
```

> **Effort**: ~3-5 days  
> **Files**: Modified `server.js` (CORS), env vars, Vercel/Railway configs  
> **Cost**: $0-$10/month

---

## Phase 7: Advanced Features (~2-3 weeks, post-deployment)

> **Why**: These features differentiate NDT from a simple demo into a production-grade network operations tool. Implement after the core deployment is stable.

### 7.1 — Authentication & Multi-Tenancy

**Why**: In production, different teams manage different network segments. Each team should only see their own topologies.

**Implementation**:
- Add JWT-based authentication (login/register)
- Use `next-auth` on the frontend
- Each user gets their own saved topologies, sessions, and history
- Admin role can manage all topologies

### 7.2 — Analytics Dashboard

**Why**: Operators need historical trends, not just point-in-time snapshots.

**New page**: `/analytics` with:
- **Congestion heatmap over time**: Which edges are consistently congested?
- **Route stability chart**: How often does the optimal path change?
- **Prediction accuracy tracking**: Log ML predictions vs. actual outcomes (when real telemetry is available)
- **Fault injection history**: Timeline of all What-If scenarios that were run

**Charting library**: [Recharts](https://recharts.org/) or [Chart.js](https://www.chartjs.org/)

### 7.3 — Graph Topology Templates

**Why**: Not everyone wants to build from scratch. Provide pre-built realistic topologies.

| Template | Description | Nodes | Edges |
|----------|-------------|-------|-------|
| **Small Office** | Star topology, 1 core switch + 5 edge routers | 6 | 5 |
| **Enterprise Campus** | Hierarchical: core → distribution → access layers | 15 | 22 |
| **ISP Backbone** | Ring + mesh hybrid, continental scale | 25 | 40 |
| **Data Center Fabric** | Leaf-spine Clos topology | 20 | 32 |
| **Erdős–Rényi Random** | Randomly connected graph | User-defined | Random |

Store these as JSON files in `backend/data/templates/`. Add a "Templates" dropdown in Build Mode.

### 7.4 — Export & Reporting

| Export | Format | Use Case |
|--------|--------|----------|
| Network state | JSON | Save/share/import topologies |
| Analysis report | PDF | Management reporting |
| Canvas screenshot | PNG | Presentations |
| Prediction log | CSV | Data analysis |

### 7.5 — Model Retraining Pipeline

**Why**: The synthetic data trains a near-perfect model (99.5%), but real-world telemetry is noisy. When real data becomes available, the model should be retrained.

**Pipeline**:
1. Operator uploads a CSV of real telemetry data via a new `/api/upload-telemetry` endpoint
2. Backend stores the CSV
3. A scheduled job (cron or manual trigger) retrains the model
4. FastAPI hot-reloads the new `.joblib` file
5. Dashboard shows "Model version: v2, retrained on 50,000 real samples"

### 7.6 — K Shortest Paths

**Why**: Currently Dijkstra returns only the single best path. In real networks, operators want to see the top 3-5 alternative routes.

**Algorithm**: Replace single Dijkstra with **Yen's K-Shortest Paths** algorithm:
- Input: source, target, K (number of paths to return)
- Output: `[{ path, edgePath, totalCost }, { path, edgePath, totalCost }, ...]`
- Frontend shows all K paths on the canvas with decreasing brightness
- Sidebar shows a "Path Selector" dropdown to switch between them

> **Effort**: ~2-3 weeks total for all 7.x items  
> **Priority order**: 7.3 (templates) → 7.4 (export) → 7.6 (K paths) → 7.1 (auth) → 7.2 (analytics) → 7.5 (retrain)

---

## Timeline Summary

```
Phase 0: Stabilize & Commit        ─────── 2 hours
Phase 1: Testing & Reliability     ─────────────── 3-4 days
Phase 2: Persistence               ──────────────────── 1 week
Phase 3: Real-Time (WebSocket)     ──────────────────── 1 week
Phase 4: Production Hardening      ──────────────────── 1 week
Phase 5: Containerization & CI/CD  ─────────────── 3-4 days
Phase 6: Cloud Deployment          ─────────────── 3-5 days
Phase 7: Advanced Features         ──────────────────────────── 2-3 weeks
                                   ────────────────────────────────────────
                                   Total: ~6-8 weeks for full production readiness
```

---

## Technology Additions Summary

| Phase | New Dependencies |
|-------|-----------------|
| 0 | None |
| 1 | `jest`, `supertest` (backend); `pytest` (ML) |
| 2 | `better-sqlite3` (backend) |
| 3 | `socket.io` (backend), `socket.io-client` (frontend) |
| 4 | `winston`, `dotenv`, `express-rate-limit`, `express-validator` (backend) |
| 5 | Docker, GitHub Actions |
| 6 | Vercel (frontend), Railway (backend + ML) |
| 7 | `next-auth`, `recharts`, `jspdf` (frontend) |
