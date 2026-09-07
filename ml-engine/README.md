# ML Engine — NDT

This is the **DA/DS module** of the Predictive Network Digital Twin project.

It provides a **FastAPI microservice** that classifies each network link into one of four congestion levels using a trained **XGBoost** model.

---

## Folder Structure

```
ml-engine/
├── data/
│   ├── generate_data.py          Synthetic telemetry generator (10k rows)
│   └── network_telemetry.csv     Generated training data (git-ignored)
├── models/
│   ├── congestion_model.joblib   Trained XGBoost pipeline (git-ignored)
│   ├── label_encoder.joblib      LabelEncoder for class names (git-ignored)
│   └── confusion_matrix.png      Training evaluation plot
├── app/
│   ├── __init__.py
│   ├── main.py                   FastAPI server (POST /predict-congestion)
│   └── schemas.py                Pydantic request/response models
├── notebooks/
│   └── training.ipynb            EDA + training walkthrough
├── train.py                      Standalone training script
├── requirements.txt              Python dependencies
└── README.md                     This file
```

---

## Quick Start

### 1. Install Dependencies

```bash
cd ml-engine
pip install -r requirements.txt
```

### 2. Generate Training Data

```bash
python data/generate_data.py
# → data/network_telemetry.csv  (~10,200 rows)
```

### 3. Train the Model

```bash
python train.py
# Prints: accuracy, F1-score, confusion matrix
# Saves:  models/congestion_model.joblib
#         models/label_encoder.joblib
#         models/confusion_matrix.png
```

### 4. Start the FastAPI Server

```bash
uvicorn app.main:app --reload --port 8000
```

Open **http://localhost:8000/docs** for the interactive Swagger UI.

---

## API Contract

### `POST /predict-congestion`

**Request** (sent by Node.js backend at port 4000):

```json
{
  "edges": [
    {
      "id":              "e_R1_R2",
      "source":          "R1",
      "target":          "R2",
      "throughput_mbps": 900.0,
      "delay_ms":        45.2,
      "capacity_mbps":   1000
    }
  ]
}
```

**Response**:

```json
{
  "predictions": [
    {
      "edge_id":           "e_R1_R2",
      "congestion_status": "Highly Congested",
      "probability":       0.92
    }
  ]
}
```

### Congestion Classes

| Class | Utilisation Range | Edge Cost (Dijkstra) |
|---|---|---|
| Uncongested | < 40 % | 1 |
| Balanced | 40 – 65 % | 3 |
| Moderately Congested | 65 – 85 % | 7 |
| Highly Congested | > 85 % | 20 |

---

## Connecting to the SDE Backend

Once the server is running, the SDE team just needs to update **one file**:

`backend/services/mockML.js`:

```javascript
const axios = require('axios');
const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:8000/predict-congestion';

async function predictCongestion(edges) {
  const response = await axios.post(ML_ENGINE_URL, { edges });
  return response.data.predictions;
}

module.exports = { predictCongestion };
```

---

## Model Details

| Property | Value |
|---|---|
| Algorithm | XGBoost (multi:softprob) |
| Features | `throughput_mbps`, `capacity_mbps`, `delay_ms`, `utilization_ratio` |
| Classes | 4 (Uncongested, Balanced, Moderately Congested, Highly Congested) |
| Training Rows | ~10,200 |
| Pipeline | StandardScaler → XGBClassifier |
| Serialisation | joblib |

---

## Health Check

```bash
curl http://localhost:8000/health
# {"status":"ok","model_loaded":true,"version":"1.0.0"}
```
