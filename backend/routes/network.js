const express = require('express');
const router = express.Router();

const topologyBase = require('../data/topology.json');
const { predictCongestion } = require('../services/mockML');
const { dijkstra } = require('../services/dijkstra');

// ----------------------------------------------------------------
// In-memory network state
// Deep-cloned from topology so we can mutate it (fault injection)
// ----------------------------------------------------------------
let networkState = JSON.parse(JSON.stringify(topologyBase));
let lastPredictions = [];

// Helpers
const getNode = (id) => networkState.nodes.find(n => n.id === id);
const getEdge = (id) => networkState.edges.find(e => e.id === id);

// ---------------------------------------------------------------
// GET /api/network
// Returns the current topology and last known predictions.
// Called once on dashboard load.
// ---------------------------------------------------------------
router.get('/network', (req, res) => {
  res.json({
    nodes:       networkState.nodes,
    edges:       networkState.edges,
    predictions: lastPredictions
  });
});

// ---------------------------------------------------------------
// POST /api/analyze
// Triggers the ML prediction pipeline and re-runs Dijkstra's PBR.
// Returns the full updated state including the optimal active path.
//
// PLUGIN POINT: mockML.js handles the prediction internally.
// When the DA/DS ML engine is ready, only mockML.js needs to change.
// ---------------------------------------------------------------
router.post('/analyze', async (req, res) => {
  try {
    // Only send active (non-dropped) edges to the predictor
    const activeEdges = networkState.edges.filter(e => !e.dropped);

    const predictions = await predictCongestion(activeEdges);
    lastPredictions = predictions;

    // Run Dijkstra from R1 → R10 (primary traffic flow for demo)
    const { path, edgePath, totalCost } = dijkstra(
      networkState.nodes,
      networkState.edges,
      predictions,
      'R1',
      'R10'
    );

    res.json({
      nodes:       networkState.nodes,
      edges:       networkState.edges,
      predictions,
      activePath:  { path, edgePath, totalCost }
    });
  } catch (err) {
    console.error('[/api/analyze] Error:', err.message);
    res.status(500).json({ error: 'Analysis pipeline failed', message: err.message });
  }
});

// ---------------------------------------------------------------
// POST /api/fault
// Body: { type: 'node' | 'edge', id: string }
// Marks a node or edge as dropped (simulates a crash).
// If a node is dropped, all its connected edges are also dropped.
// ---------------------------------------------------------------
router.post('/fault', (req, res) => {
  const { type, id } = req.body;

  if (!type || !id) {
    return res.status(400).json({ error: 'Missing required fields: type, id' });
  }

  if (type === 'edge') {
    const edge = getEdge(id);
    if (!edge) return res.status(404).json({ error: `Edge '${id}' not found` });
    edge.dropped = true;
    edge.throughput_mbps = 0;
    console.log(`[FAULT] Edge dropped: ${id}`);
  } else if (type === 'node') {
    const node = getNode(id);
    if (!node) return res.status(404).json({ error: `Node '${id}' not found` });
    node.dropped = true;
    // Cascade: drop all connected edges
    networkState.edges.forEach(e => {
      if (e.source === id || e.target === id) {
        e.dropped = true;
        e.throughput_mbps = 0;
      }
    });
    console.log(`[FAULT] Node dropped: ${id} (cascaded to connected edges)`);
  } else {
    return res.status(400).json({ error: `Unknown type '${type}'. Must be 'node' or 'edge'.` });
  }

  res.json({ success: true, nodes: networkState.nodes, edges: networkState.edges });
});

// ---------------------------------------------------------------
// POST /api/reset
// Restores the entire network to its original topology state.
// ---------------------------------------------------------------
router.post('/reset', (req, res) => {
  networkState = JSON.parse(JSON.stringify(topologyBase));
  lastPredictions = [];
  console.log('[RESET] Network state restored to baseline topology.');
  res.json({ success: true, nodes: networkState.nodes, edges: networkState.edges });
});

module.exports = router;
