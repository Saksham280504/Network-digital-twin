/**
 * API Client — NDT Frontend → Express Backend
 * Centralizes all HTTP calls. To change the backend URL,
 * set NEXT_PUBLIC_BACKEND_URL in frontend/.env.local
 */
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

/**
 * Fetch the current network topology and last known predictions.
 * Called once on dashboard load.
 */
export async function fetchNetwork() {
  const res = await fetch(`${BACKEND_URL}/api/network`);
  if (!res.ok) throw new Error(`GET /api/network failed: ${res.status}`);
  return res.json();
}

/**
 * Trigger ML congestion prediction + Dijkstra PBR re-calculation.
 * Returns the full updated network state including activePath.
 */
export async function analyzeNetwork() {
  const res = await fetch(`${BACKEND_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`POST /api/analyze failed: ${res.status}`);
  return res.json();
}

/**
 * Inject a fault (drop a node or edge) into the network.
 * @param {'node'|'edge'} type
 * @param {string} id
 */
export async function injectFault(type, id) {
  const res = await fetch(`${BACKEND_URL}/api/fault`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, id })
  });
  if (!res.ok) throw new Error(`POST /api/fault failed: ${res.status}`);
  return res.json();
}

/**
 * Reset the entire network to its original baseline topology.
 */
export async function resetNetwork() {
  const res = await fetch(`${BACKEND_URL}/api/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`POST /api/reset failed: ${res.status}`);
  return res.json();
}
