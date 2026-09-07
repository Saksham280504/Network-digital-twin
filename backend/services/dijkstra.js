/**
 * Policy-Based Routing (PBR) Engine — Dijkstra's Algorithm
 * ==========================================================
 * Computes the optimal (lowest-cost) path between two nodes in the network.
 * Edge cost is determined by the ML-predicted congestion status, making the
 * algorithm automatically avoid congested links and reroute traffic.
 *
 * Cost model (higher = worse, avoid this edge):
 *   Uncongested         →  1
 *   Balanced            →  3
 *   Moderately Congested → 7
 *   Highly Congested    → 20
 *   Dropped             → Infinity (excluded from graph)
 */

const CONGESTION_WEIGHTS = {
  'Uncongested':          1,
  'Balanced':             3,
  'Moderately Congested': 7,
  'Highly Congested':    20
};

/**
 * Runs Dijkstra's shortest-path algorithm on the network graph.
 *
 * @param {Array} nodes      - all node objects { id, ... }
 * @param {Array} edges      - all edge objects { id, source, target, dropped, ... }
 * @param {Array} predictions - ML predictions [{ edge_id, congestion_status }]
 * @param {string} sourceId  - starting node ID
 * @param {string} targetId  - destination node ID
 * @returns {{ path: string[], edgePath: string[], totalCost: number }}
 */
function dijkstra(nodes, edges, predictions, sourceId, targetId) {
  // --- Build adjacency list with PBR costs ---
  const adj = {};
  nodes.forEach(n => { adj[n.id] = []; });

  edges.forEach(edge => {
    // Skip dropped edges — they are physically unavailable
    if (edge.dropped) return;

    const prediction = predictions.find(p => p.edge_id === edge.id);
    const status = prediction ? prediction.congestion_status : 'Uncongested';
    const cost = CONGESTION_WEIGHTS[status] ?? 1;

    // Undirected graph: add both directions
    adj[edge.source].push({ neighbor: edge.target, cost, edgeId: edge.id });
    adj[edge.target].push({ neighbor: edge.source, cost, edgeId: edge.id });
  });

  // --- Initialize distances ---
  const dist = {};
  const prev = {};  // prev[nodeId] = { fromNode, edgeId }

  nodes.forEach(n => {
    dist[n.id] = Infinity;
    prev[n.id] = null;
  });
  dist[sourceId] = 0;

  const visited = new Set();
  // Priority queue: [cost, nodeId]
  const pq = [[0, sourceId]];

  // --- Main Dijkstra loop ---
  while (pq.length > 0) {
    // Sort ascending by cost (simple PQ for correctness; fine for 10-node graph)
    pq.sort((a, b) => a[0] - b[0]);
    const [currentCost, u] = pq.shift();

    if (visited.has(u)) continue;
    visited.add(u);

    if (u === targetId) break;

    for (const { neighbor: v, cost, edgeId } of (adj[u] || [])) {
      if (visited.has(v)) continue;

      const newCost = currentCost + cost;
      if (newCost < dist[v]) {
        dist[v] = newCost;
        prev[v] = { fromNode: u, edgeId };
        pq.push([newCost, v]);
      }
    }
  }

  // --- Reconstruct path ---
  if (dist[targetId] === Infinity) {
    // No path exists (network partitioned)
    return { path: [], edgePath: [], totalCost: Infinity };
  }

  const nodePath = [];
  const edgePath = [];
  let cursor = targetId;

  while (cursor && prev[cursor]) {
    edgePath.unshift(prev[cursor].edgeId);
    nodePath.unshift(cursor);
    cursor = prev[cursor].fromNode;
  }
  nodePath.unshift(sourceId);

  return {
    path:       nodePath,
    edgePath:   edgePath,
    totalCost:  dist[targetId]
  };
}

module.exports = { dijkstra, CONGESTION_WEIGHTS };
