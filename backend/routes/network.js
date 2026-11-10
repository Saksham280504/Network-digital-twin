const express = require('express');
const router = express.Router();

const topologyBase = require('../data/topology.json');
const { predictCongestion, getModelSpecs } = require('../services/mockML');
const {
  dijkstra,
  computeOspfBaseline,
  computeSecondaryPath,
  computeVertexPBRSplits,
  computePaperAndIoTMetrics,
} = require('../services/dijkstra');
const { generateTopology } = require('../services/graphGenerator');

// ----------------------------------------------------------------
// In-memory network state
// ----------------------------------------------------------------
let networkState = JSON.parse(JSON.stringify(topologyBase));
let currentBaseline = JSON.parse(JSON.stringify(topologyBase));
let lastPredictions = [];
let activeModel = 'mpnn';
let currentTopologyMeta = {
  modelKey: 'default',
  modelName: 'Default 10-Router Telecom Backbone',
  pRouters: topologyBase.nodes.length,
  peRouters: 3,
  ceRouters: 3,
  switches: 3,
  iotHosts: 9,
  totalEdges: topologyBase.edges.length,
  minDegree: 2,
  maxDegree: 4,
  avgDegree: 3.0,
  degreeConstraintSatisfied: true,
  degreeConstraintFormula: '2 <= deg(v) <= 9',
};

let routeSource = topologyBase.nodes[0]?.id || 'R1';
let routeTarget = topologyBase.nodes[topologyBase.nodes.length - 1]?.id || 'R10';

const getNode = (id) => networkState.nodes.find(n => n.id === id);
const getEdge = (id) => networkState.edges.find(e => e.id === id);
const getBaseEdge = (id) => currentBaseline.edges.find(e => e.id === id);

/**
 * Helper: runs full analysis pipeline (5-model inference + PBR + OSPF + Paper metrics)
 */
async function executeFullAnalysis(sourceOverride, targetOverride, modelOverride, fileSizeBytes = 1404280) {
  if (sourceOverride) routeSource = sourceOverride;
  if (targetOverride) routeTarget = targetOverride;
  if (modelOverride) activeModel = modelOverride;

  const allIds = networkState.nodes.map(n => n.id);
  if (!allIds.includes(routeSource)) routeSource = allIds[0];
  if (!allIds.includes(routeTarget)) routeTarget = allIds[allIds.length - 1];

  const activeEdges = networkState.edges.filter(e => !e.dropped);

  const mlResult = await predictCongestion(activeEdges, activeModel);
  const predictions = mlResult.predictions || [];
  lastPredictions = predictions;
  activeModel = mlResult.active_model || activeModel;

  // 1. Primary Predictive NDT PBR path (for active ML model)
  const activePath = dijkstra(
    networkState.nodes,
    networkState.edges,
    predictions,
    routeSource,
    routeTarget
  );

  // 2. Conventional MPLS / OSPF Baseline path (blind to congestion)
  const ospfPath = computeOspfBaseline(
    networkState.nodes,
    networkState.edges,
    routeSource,
    routeTarget
  );

  // 3. Secondary uncongested path for Paper's 50%-capped multi-path redistribution
  const secondaryPath = computeSecondaryPath(
    networkState.nodes,
    networkState.edges,
    predictions,
    routeSource,
    routeTarget,
    activePath.edgePath
  );

  // 4. Compute what route EACH of the 5 ML models selects on this exact topology
  const modelRoutes = {};
  const modelKeys = ['mpnn', 'xgboost', 'lightgbm', 'random_forest', 'logistic_regression'];
  modelKeys.forEach(mKey => {
    const predsForModel = predictions.map(p => ({
      edge_id: p.edge_id,
      congestion_status: p.all_model_votes?.[mKey]?.congestion_status || p.congestion_status,
      probability: p.all_model_votes?.[mKey]?.probability ?? p.probability,
    }));
    const r = dijkstra(networkState.nodes, networkState.edges, predsForModel, routeSource, routeTarget);
    modelRoutes[mKey] = r;
  });

  // 5. Paper Section IV-F Vertex-level PBR split percentages (<= 50% cap)
  const vertexSplits = computeVertexPBRSplits(networkState.nodes, networkState.edges, predictions);

  // 6. Paper Section IV-C & VII Performance + IoT Energy metrics
  const benchmarkMetrics = computePaperAndIoTMetrics(
    networkState.nodes,
    networkState.edges,
    predictions,
    activePath,
    ospfPath,
    secondaryPath,
    fileSizeBytes
  );

  return {
    nodes: networkState.nodes,
    edges: networkState.edges,
    predictions,
    activeModel,
    inferenceLatencyMs: mlResult.inference_latency_ms,
    engineMode: mlResult.engine_mode,
    modelComparisonLive: mlResult.model_comparison_live,
    modelRoutes,
    activePath,
    ospfPath,
    secondaryPath,
    vertexSplits,
    benchmarkMetrics,
    topologySummary: currentTopologyMeta,
    routeSource,
    routeTarget,
  };
}

// ---------------------------------------------------------------
// GET /api/network
// ---------------------------------------------------------------
router.get('/network', (req, res) => {
  res.json({
    nodes: networkState.nodes,
    edges: networkState.edges,
    predictions: lastPredictions,
    activeModel,
    topologySummary: currentTopologyMeta,
    routeSource,
    routeTarget,
  });
});

// ---------------------------------------------------------------
// GET /api/models/specs
// Returns the 5-model evaluation benchmarks, confusion matrices,
// feature importances, and pros/cons.
// ---------------------------------------------------------------
router.get('/models/specs', async (req, res) => {
  try {
    const specs = await getModelSpecs();
    if (!specs) {
      return res.status(404).json({ error: 'Model specs not available yet' });
    }
    res.json(specs);
  } catch (err) {
    console.error('[/api/models/specs] Error:', err.message);
    res.status(500).json({ error: 'Failed to load model specs', message: err.message });
  }
});

// ---------------------------------------------------------------
// POST /api/analyze
// Body: { source?, target?, model_name?, file_size_bytes? }
// ---------------------------------------------------------------
router.post('/analyze', async (req, res) => {
  try {
    const { source, target, model_name, file_size_bytes } = req.body || {};
    const result = await executeFullAnalysis(source, target, model_name, file_size_bytes);
    res.json(result);
  } catch (err) {
    console.error('[/api/analyze] Error:', err.message);
    res.status(500).json({ error: 'Analysis pipeline failed', message: err.message });
  }
});

// ---------------------------------------------------------------
// POST /api/topology/generate
// Body: { model: 'ba' | 'er' | 'ws', numNodes: 5..20, loadFactor?: 0.2..1.1 }
// Generates a mathematical topology matching Section IV-A of NDT.pdf
// with degree constraint 2 <= deg(v) <= 9.
// ---------------------------------------------------------------
router.post('/topology/generate', async (req, res) => {
  try {
    const { model = 'ba', numNodes = 10, loadFactor = 0.68 } = req.body || {};
    const generated = generateTopology(model, numNodes, loadFactor);

    networkState = {
      nodes: JSON.parse(JSON.stringify(generated.nodes)),
      edges: JSON.parse(JSON.stringify(generated.edges)),
    };
    currentBaseline = JSON.parse(JSON.stringify(networkState));
    currentTopologyMeta = generated.topologySummary;
    routeSource = generated.source;
    routeTarget = generated.target;

    console.log(
      `[GENERATOR] Generated ${generated.topologySummary.modelName} (${generated.nodes.length} nodes, ${generated.edges.length} edges)`
    );

    const analysis = await executeFullAnalysis(routeSource, routeTarget, activeModel);
    res.json(analysis);
  } catch (err) {
    console.error('[/api/topology/generate] Error:', err.message);
    res.status(500).json({ error: 'Topology generation failed', message: err.message });
  }
});

// ---------------------------------------------------------------
// POST /api/simulate/stepwise
// Replicates Section IV-B & VI of NDT.pdf:
//   F_n = F_{n-1} + Delta_F  (Delta_F = 140,428 bytes across 10 steps)
// Compares Static MPLS/OSPF vs. XGBoost PBR vs. Graph MPNN PBR
// as network traffic load scales up step-by-step.
// ---------------------------------------------------------------
router.post('/simulate/stepwise', async (req, res) => {
  try {
    const DELTA_F = 140428; // Exact byte increment from Page 6 of NDT.pdf
    const steps = 10;
    const baseEdges = networkState.edges.filter(e => !e.dropped);
    const series = [];

    for (let step = 1; step <= steps; step++) {
      const fileSizeBytes = step * DELTA_F;
      const loadMultiplier = 0.45 + (step / steps) * 0.75; // Escalates load from 52% to 120%

      // Scale edge throughputs & non-linear queuing delays for this traffic iteration
      const scaledEdges = baseEdges.map((e, idx) => {
        const cap = e.capacity_mbps || 1000;
        const baseTput = e.throughput_mbps || cap * 0.4;
        // Inject realistic hotspot pressure on core transit links as file size scales
        const hotspot = (idx % 3 === 0) ? 1.18 : 0.95;
        const tput = Math.min(cap * 0.99, Math.round(baseTput * loadMultiplier * hotspot));
        const util = tput / cap;
        const baseDelay = 2.0 + (1000 / cap) * 2.5;
        const qDelay = (Math.pow(util, 2.4) / Math.max(0.04, 1.03 - util)) * 5.5;
        return {
          ...e,
          throughput_mbps: tput,
          delay_ms: +(baseDelay + qDelay).toFixed(2),
        };
      });

      const mlRes = await predictCongestion(scaledEdges, 'mpnn');
      const predsMpnn = mlRes.predictions || [];
      const predsXgb = predsMpnn.map(p => ({
        edge_id: p.edge_id,
        congestion_status: p.all_model_votes?.xgboost?.congestion_status || p.congestion_status,
      }));
      const predsLr = predsMpnn.map(p => ({
        edge_id: p.edge_id,
        congestion_status: p.all_model_votes?.logistic_regression?.congestion_status || p.congestion_status,
      }));

      const pathMpnn = dijkstra(networkState.nodes, scaledEdges, predsMpnn, routeSource, routeTarget);
      const secMpnn  = computeSecondaryPath(networkState.nodes, scaledEdges, predsMpnn, routeSource, routeTarget, pathMpnn.edgePath);
      const pathXgb  = dijkstra(networkState.nodes, scaledEdges, predsXgb, routeSource, routeTarget);
      const pathLr   = dijkstra(networkState.nodes, scaledEdges, predsLr, routeSource, routeTarget);
      const pathOspf = computeOspfBaseline(networkState.nodes, scaledEdges, routeSource, routeTarget);

      const mMpnn = computePaperAndIoTMetrics(networkState.nodes, scaledEdges, predsMpnn, pathMpnn, pathOspf, secMpnn, fileSizeBytes);
      const mXgb  = computePaperAndIoTMetrics(networkState.nodes, scaledEdges, predsXgb, pathXgb, pathOspf, null, fileSizeBytes);
      const mLr   = computePaperAndIoTMetrics(networkState.nodes, scaledEdges, predsLr, pathLr, pathOspf, null, fileSizeBytes);

      series.push({
        step,
        fileSizeKB: +(fileSizeBytes / 1024).toFixed(1),
        fileSizeMB: +(fileSizeBytes / (1024 * 1024)).toFixed(2),
        loadMultiplier: +loadMultiplier.toFixed(2),
        mpnn: {
          delayMs: mMpnn?.ndtPbr?.delayMs ?? 0,
          congestionPct: mMpnn?.ndtPbr?.congestionPct ?? 0,
          computationalCostWe: mMpnn?.ndtPbr?.computationalCostWe ?? 0,
          transferRateMBps: mMpnn?.ndtPbr?.fileTransferRateMBps ?? 0,
          energyJoulesPerGb: mMpnn?.ndtPbr?.energyJoulesPerGb ?? 0,
          path: pathMpnn.path,
        },
        xgboost: {
          delayMs: mXgb?.ndtPbr?.delayMs ?? 0,
          congestionPct: mXgb?.ndtPbr?.congestionPct ?? 0,
          computationalCostWe: mXgb?.ndtPbr?.computationalCostWe ?? 0,
          transferRateMBps: mXgb?.ndtPbr?.fileTransferRateMBps ?? 0,
          energyJoulesPerGb: mXgb?.ndtPbr?.energyJoulesPerGb ?? 0,
          path: pathXgb.path,
        },
        logistic_regression: {
          delayMs: mLr?.ndtPbr?.delayMs ?? 0,
          congestionPct: mLr?.ndtPbr?.congestionPct ?? 0,
          computationalCostWe: mLr?.ndtPbr?.computationalCostWe ?? 0,
          transferRateMBps: mLr?.ndtPbr?.fileTransferRateMBps ?? 0,
          energyJoulesPerGb: mLr?.ndtPbr?.energyJoulesPerGb ?? 0,
          path: pathLr.path,
        },
        ospf: {
          delayMs: mMpnn?.mplsOspf?.delayMs ?? 0,
          congestionPct: mMpnn?.mplsOspf?.congestionPct ?? 0,
          computationalCostWe: mMpnn?.mplsOspf?.computationalCostWe ?? 0,
          transferRateMBps: mMpnn?.mplsOspf?.fileTransferRateMBps ?? 0,
          energyJoulesPerGb: mMpnn?.mplsOspf?.energyJoulesPerGb ?? 0,
          path: pathOspf.path,
        },
      });
    }

    res.json({
      deltaFBytes: DELTA_F,
      steps: series,
      topologySummary: currentTopologyMeta,
    });
  } catch (err) {
    console.error('[/api/simulate/stepwise] Error:', err.message);
    res.status(500).json({ error: 'Stepwise simulation failed', message: err.message });
  }
});

// ---------------------------------------------------------------
// POST /api/fault
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
// POST /api/restore
// ---------------------------------------------------------------
router.post('/restore', (req, res) => {
  const { type, id } = req.body;

  if (!type || !id) {
    return res.status(400).json({ error: 'Missing required fields: type, id' });
  }

  if (type === 'edge') {
    const edge = getEdge(id);
    if (!edge) return res.status(404).json({ error: `Edge '${id}' not found` });
    const srcNode = getNode(edge.source);
    const tgtNode = getNode(edge.target);
    if (srcNode?.dropped || tgtNode?.dropped) {
      return res.status(400).json({
        error: `Cannot restore edge '${id}': endpoint node is still dropped`
      });
    }
    const baseEdge = getBaseEdge(id);
    edge.dropped = false;
    edge.throughput_mbps = baseEdge ? baseEdge.throughput_mbps : edge.capacity_mbps * 0.2;
    console.log(`[RESTORE] Edge restored: ${id}`);

  } else if (type === 'node') {
    const node = getNode(id);
    if (!node) return res.status(404).json({ error: `Node '${id}' not found` });
    node.dropped = false;
    networkState.edges.forEach(e => {
      if (e.source === id || e.target === id) {
        const otherEnd = e.source === id ? e.target : e.source;
        const otherNode = getNode(otherEnd);
        if (otherNode && !otherNode.dropped) {
          const baseEdge = getBaseEdge(e.id);
          e.dropped = false;
          e.throughput_mbps = baseEdge ? baseEdge.throughput_mbps : e.capacity_mbps * 0.2;
        }
      }
    });
    console.log(`[RESTORE] Node restored: ${id} (cascaded to eligible edges)`);

  } else {
    return res.status(400).json({ error: `Unknown type '${type}'. Must be 'node' or 'edge'.` });
  }

  res.json({ success: true, nodes: networkState.nodes, edges: networkState.edges });
});

// ---------------------------------------------------------------
// POST /api/edge/update
// ---------------------------------------------------------------
router.post('/edge/update', (req, res) => {
  const { id, throughput_mbps, capacity_mbps, delay_ms, jitter_ms, packet_loss_pct } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Missing required field: id' });
  }

  const edge = getEdge(id);
  if (!edge) return res.status(404).json({ error: `Edge '${id}' not found` });
  if (edge.dropped) return res.status(400).json({ error: `Edge '${id}' is dropped. Restore it first.` });

  if (throughput_mbps !== undefined) edge.throughput_mbps = Number(throughput_mbps);
  if (capacity_mbps  !== undefined) edge.capacity_mbps  = Number(capacity_mbps);
  if (delay_ms       !== undefined) edge.delay_ms       = Number(delay_ms);
  if (jitter_ms      !== undefined) edge.jitter_ms      = Number(jitter_ms);
  if (packet_loss_pct !== undefined) edge.packet_loss_pct = Number(packet_loss_pct);

  console.log(`[EDGE UPDATE] ${id}: throughput=${edge.throughput_mbps}, capacity=${edge.capacity_mbps}, delay=${edge.delay_ms}`);
  res.json({ success: true, edge });
});

// ---------------------------------------------------------------
// POST /api/network/load
// ---------------------------------------------------------------
router.post('/network/load', (req, res) => {
  const { nodes, edges, source, target } = req.body;

  if (!nodes || !Array.isArray(nodes) || nodes.length < 2) {
    return res.status(400).json({ error: 'Must provide at least 2 nodes' });
  }
  if (!edges || !Array.isArray(edges)) {
    return res.status(400).json({ error: 'Must provide an edges array' });
  }

  const nodeIds = new Set();
  for (const n of nodes) {
    if (nodeIds.has(n.id)) {
      return res.status(400).json({ error: `Duplicate node ID: '${n.id}'` });
    }
    nodeIds.add(n.id);
  }

  for (const e of edges) {
    if (!nodeIds.has(e.source)) {
      return res.status(400).json({ error: `Edge '${e.id}' references non-existent source '${e.source}'` });
    }
    if (!nodeIds.has(e.target)) {
      return res.status(400).json({ error: `Edge '${e.id}' references non-existent target '${e.target}'` });
    }
  }

  networkState = { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) };
  currentBaseline = JSON.parse(JSON.stringify(networkState));
  lastPredictions = [];

  // Compute degree stats for custom topology
  const degMap = {};
  nodes.forEach(n => { degMap[n.id] = 0; });
  edges.forEach(e => {
    degMap[e.source] = (degMap[e.source] || 0) + 1;
    degMap[e.target] = (degMap[e.target] || 0) + 1;
  });
  const degs = Object.values(degMap);
  const minD = degs.length ? Math.min(...degs) : 0;
  const maxD = degs.length ? Math.max(...degs) : 0;
  const avgD = degs.length ? +(degs.reduce((a, b) => a + b, 0) / degs.length).toFixed(2) : 0;
  const peCount = Math.max(2, Math.floor(nodes.length / 5) + 1);

  currentTopologyMeta = {
    modelKey: 'custom',
    modelName: 'Custom User-Built Topology',
    pRouters: nodes.length,
    peRouters: peCount,
    ceRouters: peCount,
    switches: peCount,
    iotHosts: peCount * 3,
    totalEdges: edges.length,
    minDegree: minD,
    maxDegree: maxD,
    avgDegree: avgD,
    degreeConstraintSatisfied: minD >= 2 && maxD <= 9,
    degreeConstraintFormula: '2 <= deg(v) <= 9',
  };

  routeSource = source || nodes[0].id;
  routeTarget = target || nodes[nodes.length - 1].id;

  console.log(`[LOAD] Custom topology loaded: ${nodes.length} nodes, ${edges.length} edges`);
  res.json({
    success: true,
    nodes: networkState.nodes,
    edges: networkState.edges,
    topologySummary: currentTopologyMeta,
    routeSource,
    routeTarget,
  });
});

// ---------------------------------------------------------------
// POST /api/reset
// ---------------------------------------------------------------
router.post('/reset', (req, res) => {
  const { resetToDefault } = req.body || {};
  if (resetToDefault) {
    currentBaseline = JSON.parse(JSON.stringify(topologyBase));
    currentTopologyMeta = {
      modelKey: 'default',
      modelName: 'Default 10-Router Telecom Backbone',
      pRouters: topologyBase.nodes.length,
      peRouters: 3,
      ceRouters: 3,
      switches: 3,
      iotHosts: 9,
      totalEdges: topologyBase.edges.length,
      minDegree: 2,
      maxDegree: 4,
      avgDegree: 3.0,
      degreeConstraintSatisfied: true,
      degreeConstraintFormula: '2 <= deg(v) <= 9',
    };
    routeSource = topologyBase.nodes[0].id;
    routeTarget = topologyBase.nodes[topologyBase.nodes.length - 1].id;
  }
  networkState = JSON.parse(JSON.stringify(currentBaseline));
  lastPredictions = [];
  console.log('[RESET] Network state restored to baseline topology.');
  res.json({
    success: true,
    nodes: networkState.nodes,
    edges: networkState.edges,
    topologySummary: currentTopologyMeta,
    routeSource,
    routeTarget,
  });
});

module.exports = router;
