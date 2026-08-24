# Predictive Network Digital Twin (NDT) - Execution Plan

This document outlines the execution strategy for building the Interactive, Fault-Tolerant Network Digital Twin, inspired by the provided research paper on MPNN-based Congestion-Aware Predictive Traffic Routing. 

## User Review Required

> [!IMPORTANT]
> Please review this execution plan and the proposed Git collaboration workflow. Once you approve, we can begin executing **Phase 1**.

## Open Questions Resolved

1. **Graph Topologies:** The DA/DS will provide static adjacency matrices (JSON) for the initial UI. This ensures that the exact same graphs used for training the ML model are visualized in the frontend, providing a consistent ground truth.
2. **Telemetry Frequency:** Event-driven. There will be an initial API hit when the dashboard loads, and subsequent hits whenever the user performs a manual "what-if" analysis scenario.
3. **Hosting/Deployment:** Local execution via `docker-compose` initially, with an architecture that allows for easy cloud deployment later.

## Proposed Collaboration Model (Monorepo & Plugin Architecture)

To ensure the DA/DS and SDE roles can work independently without blocking each other, we will use a **Monorepo Strategy** with a **Plugin Architecture**.

### 1. Monorepo Structure
The repository will be divided into strictly isolated domains:
```text
network-digital-twin/
├── frontend/    # (SDE) Next.js, Tailwind CSS, Topology UI
├── backend/     # (SDE) Node.js, Express, Dijkstra PBR Engine
├── ml-engine/   # (DA/DS) Python, FastAPI, XGBoost/LightGBM, Data Generation
└── docker-compose.yml
```

### 2. Plugin Architecture via API Contracts
The SDE and DA/DS components will act as **plugins** to each other by adhering to a strict, pre-defined API contract. Neither side needs to know *how* the other is implemented, only *what* data is exchanged.
- **The Contract:** The SDE's backend acts as the data client, and the DA/DS's ML engine acts as the prediction service. 
- **Decoupling:** During Phase 2, the SDE will create a "Mock ML Service" inside Node.js that returns dummy congestion data. Simultaneously, the DA/DS will use tools like Postman to simulate the Node.js backend sending telemetry data to their FastAPI endpoint. They don't need each other's code to run to make progress.

### 3. Git Workflow (Together but Independent)
- **Branching Strategy:** Use prefix-based branching. 
  - SDE uses `sde/feature-name` (e.g., `sde/nextjs-setup`).
  - DA/DS uses `ds/feature-name` (e.g., `ds/xgboost-training`).
- **Committing and Pushing:** Both developers can commit and push to the same remote repository. Since they are working in entirely different root folders (`backend/` vs `ml-engine/`), merge conflicts will be inherently avoided.
- **Integration:** Use Pull Requests (PRs) to merge into the `main` branch. 

---

## Proposed Execution Phases

### Phase 1: Data & Setup (Foundation)
**Goal:** Initialize the environment and define the data structures.
*   **SDE:** 
    *   Initialize the Git Monorepo.
    *   Define the standard JSON schemas for the API contract (e.g., what the POST request payload and response will look like).
    *   Set up the basic Express backend shell.
*   **DA/DS:**
    *   Develop Python scripts to generate synthetic tabular network logs (throughput, delay, jitter).
    *   Align the generated data features with the JSON schema defined by the SDE.

### Phase 2: Parallel Development (Independent Work)
**Goal:** Build the core systems using mock data.
*   **SDE:**
    *   Build the Next.js interactive dashboard with rich aesthetics, dynamic animations, and network node visualization.
    *   Implement the Express backend telemetry loop.
    *   **Crucial:** Create a mock function in the backend that simulates the ML response so UI and routing development can proceed without the real ML model.
*   **DA/DS:**
    *   Clean and preprocess the synthetic CSV data.
    *   Train the multi-class classifier (XGBoost/LightGBM) to detect congestion levels based on the research paper's logic (e.g., Highly Congested, Moderately Congested, Uncongested).
    *   Wrap the trained model in a Python FastAPI microservice.

### Phase 3: Integration & Rerouting (Connecting the Plugins)
**Goal:** Replace mocks with actual API calls and implement the routing logic.
*   **SDE:**
    *   Remove the mock ML function. Point the Node.js HTTP `POST` requests to the live local FastAPI endpoint.
    *   Implement Dijkstra's algorithm (or similar Policy-Based Routing logic) in the backend to recalculate the shortest paths dynamically when the FastAPI service flags a link as congested.
*   **DA/DS:**
    *   Monitor the FastAPI logs to ensure the schema matches expectations.
    *   Tune model thresholds if the rerouting is too aggressive or too passive based on UI observations.

### Phase 4: Fault Injection & Polish (The "Wow" Factor)
**Goal:** Add the interactive "What-If" simulator and finalize for presentation.
*   **SDE:**
    *   Build the "What-If" control panel in the Next.js UI, allowing users to click a link/node and simulate a crash (drop).
    *   Ensure the backend handles these drops, sends updated states to the ML engine, and visually animates the rerouted traffic on the frontend.
*   **DA/DS:**
    *   Verify the ML model handles extreme edge cases gracefully (e.g., throughput suddenly dropping to 0).
    *   Generate evaluation metrics (accuracy, latency, throughput gains) for the presentation, mirroring the metrics in the research paper.
*   **Joint:**
    *   Write the `docker-compose.yml` to spin up all three services (`frontend`, `backend`, `ml-engine`) with a single command for easy, reproducible placement demonstrations.

## Verification Plan

### Automated Tests
- The FastAPI endpoints will have basic tests to ensure the schema is accepted and probabilities are returned in the correct format.
- The Node.js PBR engine will have unit tests for the Dijkstra shortest-path calculations to ensure traffic is actually rerouted away from high-cost (congested) edges.

### Manual Verification
- We will boot up the full stack using `docker-compose up`.
- We will manually trigger a "Fault Injection" via the Next.js UI and visually verify that the traffic flow animations adapt to the new paths calculated by the backend in response to the ML engine's predictions.
