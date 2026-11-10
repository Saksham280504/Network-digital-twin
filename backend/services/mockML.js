/**
 * mockML.js — ML Engine Client & Multi-Model Orchestrator
 * =======================================================
 * Connects the Node.js Backend to the Python FastAPI Multi-Model ML Engine
 * (`http://127.0.0.1:8000` or `process.env.ML_BASE_URL`).
 *
 * Includes a resilient circuit-breaker fallback + background wake-up ping so if
 * the Python service is cold-starting on Render, the dashboard responds immediately
 * and then auto-refreshes with live FastAPI predictions the moment it wakes up.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const ML_BASE_URL = (process.env.ML_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const ML_PREDICT_URL = process.env.ML_ENGINE_URL || `${ML_BASE_URL}/predict-congestion`;
const ML_SPECS_URL = `${ML_BASE_URL}/models/specs`;
const ML_HEALTH_URL = `${ML_BASE_URL}/health`;

const BENCHMARK_PATHS = [
  path.join(__dirname, '..', 'data', 'model_benchmarks.json'),
  path.join(__dirname, '..', '..', 'ml-engine', 'models', 'model_benchmarks.json'),
];

let wakeupInFlight = false;

/**
 * Sends a non-blocking long-timeout GET /health request to wake up a sleeping
 * Render FastAPI container in the background.
 */
function triggerBackgroundWakeup() {
  if (wakeupInFlight) return;
  wakeupInFlight = true;
  axios
    .get(ML_HEALTH_URL, { timeout: 50000 })
    .then(() => {
      console.log('[ML Engine] FastAPI container is now awake and ready!');
    })
    .catch(() => {})
    .finally(() => {
      wakeupInFlight = false;
    });
}

/**
 * Calls FastAPI POST /predict-congestion with { edges, model_name }.
 * Falls back to local multi-model heuristic if FastAPI is still waking up,
 * while triggering a background wake-up request so the next poll gets real FastAPI data.
 */
async function predictCongestion(edges, modelName = 'mpnn') {
  if (!edges || edges.length === 0) {
    return {
      predictions: [],
      active_model: modelName,
      inference_latency_ms: 0,
      model_comparison_live: null,
      engine_mode: 'fastapi',
    };
  }

  try {
    const response = await axios.post(
      ML_PREDICT_URL,
      { edges, model_name: modelName },
      { timeout: 12000 }
    );
    return {
      predictions: response.data.predictions || [],
      active_model: response.data.active_model || modelName,
      inference_latency_ms: response.data.inference_latency_ms ?? 0.25,
      model_comparison_live: response.data.model_comparison_live || null,
      engine_mode: 'fastapi',
    };
  } catch (error) {
    console.warn(`[ML Engine] FastAPI waking up (${error.message}), serving instant fallback & waking container…`);
    triggerBackgroundWakeup();
    return fallbackMultiModelPredict(edges, modelName);
  }
}

/**
 * Fetches the 5-model benchmark specifications from FastAPI or local JSON artifact.
 */
async function getModelSpecs() {
  try {
    const response = await axios.get(ML_SPECS_URL, { timeout: 3000 });
    return response.data;
  } catch (_) {
    triggerBackgroundWakeup();
    for (const p of BENCHMARK_PATHS) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        return JSON.parse(raw);
      }
    }
    return null;
  }
}

/**
 * Resilient local fallback that emulates the 5 models' distinct inductive biases
 * (neighbor message passing for MPNN vs. local thresholds for tabular/linear models)
 * while the Python FastAPI process is waking up.
 */
function fallbackMultiModelPredict(edges, requestedModel = 'mpnn') {
  const modelKeys = ['mpnn', 'xgboost', 'lightgbm', 'random_forest', 'logistic_regression'];
  const activeKey = modelKeys.includes(requestedModel) ? requestedModel : 'mpnn';

  // Compute adjacency & neighbor utilization
  const adjMap = {};
  const utils = edges.map(e => (e.throughput_mbps || 0) / Math.max(1, e.capacity_mbps || 1000));
  edges.forEach((e, idx) => {
    (adjMap[e.source] = adjMap[e.source] || []).push(idx);
    (adjMap[e.target] = adjMap[e.target] || []).push(idx);
  });

  const classifyByScore = (s) => {
    if (s >= 0.78) return { status: 'Highly Congested', prob: Math.min(0.99, 0.72 + (s - 0.78) * 1.1) };
    if (s >= 0.58) return { status: 'Moderately Congested', prob: Math.min(0.96, 0.68 + Math.abs(s - 0.68) * 1.2) };
    if (s >= 0.36) return { status: 'Balanced', prob: Math.min(0.95, 0.70 + Math.abs(s - 0.47) * 1.1) };
    return { status: 'Uncongested', prob: Math.min(0.99, 0.78 + (0.36 - s) * 0.6) };
  };

  const perModelCounts = {};
  modelKeys.forEach(k => {
    perModelCounts[k] = {
      latency_ms: k === 'logistic_regression' ? 0.14 : k === 'mpnn' ? 0.24 : k === 'xgboost' ? 1.05 : k === 'lightgbm' ? 3.2 : 18.4,
      mean_confidence: 0.91,
      counts: { 'Uncongested': 0, 'Balanced': 0, 'Moderately Congested': 0, 'Highly Congested': 0 },
    };
  });

  const disagreementEdges = [];
  const predictions = edges.map((edge, idx) => {
    const util = utils[idx];
    const normDelay = Math.min(1.0, (edge.delay_ms || 5) / 55.0);
    const nbIndices = new Set([...(adjMap[edge.source] || []), ...(adjMap[edge.target] || [])]);
    nbIndices.delete(idx);
    const nbMeanUtil = nbIndices.size > 0
      ? Array.from(nbIndices).reduce((sum, j) => sum + utils[j], 0) / nbIndices.size
      : util;

    // Different model scoring functions reflecting their mathematical properties
    const scores = {
      mpnn: 0.50 * util + 0.18 * normDelay + 0.22 * nbMeanUtil + 0.18 * Math.pow(util * nbMeanUtil, 1.3),
      xgboost: 0.58 * util + 0.20 * normDelay + 0.15 * nbMeanUtil + 0.07 * (util > 0.65 ? 0.12 : 0),
      lightgbm: 0.60 * util + 0.18 * normDelay + 0.14 * nbMeanUtil + 0.05,
      random_forest: 0.72 * util + 0.22 * normDelay + 0.04,
      logistic_regression: 0.80 * util + 0.15 * normDelay,
    };

    const votes = {};
    const statuses = new Set();
    modelKeys.forEach(k => {
      const res = classifyByScore(scores[k]);
      votes[k] = { congestion_status: res.status, probability: +res.prob.toFixed(4) };
      statuses.add(res.status);
      perModelCounts[k].counts[res.status]++;
    });

    const hasDisagreement = statuses.size > 1;
    if (hasDisagreement) {
      disagreementEdges.push({
        edge_id: edge.id,
        source: edge.source,
        target: edge.target,
        votes: Object.fromEntries(Object.entries(votes).map(([k, v]) => [k, v.congestion_status])),
      });
    }

    const activeVote = votes[activeKey];
    return {
      edge_id: edge.id,
      congestion_status: activeVote.congestion_status,
      probability: activeVote.probability,
      all_model_votes: votes,
      disagreement: hasDisagreement,
      telemetry_enriched: {
        edge_id: edge.id,
        utilization_ratio: +util.toFixed(4),
        neighbor_mean_util: +nbMeanUtil.toFixed(4),
        source_degree: (adjMap[edge.source] || []).length,
        target_degree: (adjMap[edge.target] || []).length,
      },
    };
  });

  return {
    predictions,
    active_model: activeKey,
    inference_latency_ms: perModelCounts[activeKey].latency_ms,
    model_comparison_live: {
      active_model: activeKey,
      total_edges: edges.length,
      disagreement_count: disagreementEdges.length,
      disagreement_edges: disagreementEdges,
      per_model: perModelCounts,
    },
    engine_mode: 'fallback',
  };
}

module.exports = {
  predictCongestion,
  getModelSpecs,
  triggerBackgroundWakeup,
};
