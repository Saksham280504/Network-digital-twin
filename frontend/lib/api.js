/**
 * API Client — NDT Frontend -> Express Backend
 * Centralizes all HTTP calls.
 */
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export async function fetchNetwork() {
  const res = await fetch(`${BACKEND_URL}/api/network`);
  if (!res.ok) throw new Error(`GET /api/network failed: ${res.status}`);
  return res.json();
}

export async function fetchModelSpecs() {
  const res = await fetch(`${BACKEND_URL}/api/models/specs`);
  if (!res.ok) throw new Error(`GET /api/models/specs failed: ${res.status}`);
  return res.json();
}

export async function analyzeNetwork(source, target, modelName) {
  const body = {};
  if (source) body.source = source;
  if (target) body.target = target;
  if (modelName) body.model_name = modelName;

  const res = await fetch(`${BACKEND_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST /api/analyze failed: ${res.status}`);
  return res.json();
}

export async function generatePaperTopology(model = 'ba', numNodes = 10, loadFactor = 0.68) {
  const res = await fetch(`${BACKEND_URL}/api/topology/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, numNodes, loadFactor })
  });
  if (!res.ok) throw new Error(`POST /api/topology/generate failed: ${res.status}`);
  return res.json();
}

export async function runStepwiseSimulation() {
  const res = await fetch(`${BACKEND_URL}/api/simulate/stepwise`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`POST /api/simulate/stepwise failed: ${res.status}`);
  return res.json();
}

export async function injectFault(type, id) {
  const res = await fetch(`${BACKEND_URL}/api/fault`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, id })
  });
  if (!res.ok) throw new Error(`POST /api/fault failed: ${res.status}`);
  return res.json();
}

export async function restoreItem(type, id) {
  const res = await fetch(`${BACKEND_URL}/api/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, id })
  });
  if (!res.ok) throw new Error(`POST /api/restore failed: ${res.status}`);
  return res.json();
}

export async function updateEdge(id, updates) {
  const res = await fetch(`${BACKEND_URL}/api/edge/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...updates })
  });
  if (!res.ok) throw new Error(`POST /api/edge/update failed: ${res.status}`);
  return res.json();
}

export async function loadCustomNetwork(topology) {
  const res = await fetch(`${BACKEND_URL}/api/network/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(topology)
  });
  if (!res.ok) throw new Error(`POST /api/network/load failed: ${res.status}`);
  return res.json();
}

export async function resetNetwork(resetToDefault = false) {
  const res = await fetch(`${BACKEND_URL}/api/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resetToDefault })
  });
  if (!res.ok) throw new Error(`POST /api/reset failed: ${res.status}`);
  return res.json();
}
