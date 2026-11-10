/**
 * graphGenerator.js
 * =================
 * Mathematical Graph Topology Generators for the Network Digital Twin (NDT).
 *
 * Implements Section IV-A, Section V, and Table I of the IEEE NDT paper:
 *   1. Barabási–Albert (BA) — Preferential attachment scale-free core hubs
 *   2. Erdős–Rényi (ER)     — Uniform random graph G(n, p)
 *   3. Watts–Strogatz (WS)  — Small-world ring lattice with stochastic rewiring
 *
 * Hardware Realism Constraint (Section IV-A):
 *   Every Provider (P) router v in V satisfies:  2 <= deg(v) <= 9
 *
 * MPLS WAN/LAN Hierarchy (Section V, Page 10):
 *   V_PE = max(2, floor(V_P / 5) + 1)
 *   V_CE = V_PE,  Switches S = V_CE,  IoT/Linux Hosts H = 3 * V_PE
 */

const MIN_DEGREE = 2;
const MAX_DEGREE = 9;

/**
 * Helper: deterministic-friendly pseudo-random or Math.random
 */
function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Checks if an undirected edge exists between u and v.
 */
function hasEdge(adj, u, v) {
  return adj[u].has(v);
}

function addUndirectedEdge(adj, u, v) {
  if (u === v) return false;
  if (adj[u].has(v)) return false;
  if (adj[u].size >= MAX_DEGREE || adj[v].size >= MAX_DEGREE) return false;
  adj[u].add(v);
  adj[v].add(u);
  return true;
}

/**
 * Repairs any graph to strictly enforce:
 *   1. Full connectivity (single connected component)
 *   2. Vertex degree bounds: 2 <= deg(v) <= 9 (for n >= 3)
 */
function enforceDegreeAndConnectivity(adj, n) {
  const maxAllowed = Math.min(MAX_DEGREE, n - 1);
  const minAllowed = Math.min(MIN_DEGREE, n - 1);

  // 1. Ensure connectivity via BFS components
  const getComponents = () => {
    const visited = new Set();
    const comps = [];
    for (let i = 0; i < n; i++) {
      if (!visited.has(i)) {
        const comp = [];
        const q = [i];
        visited.add(i);
        while (q.length > 0) {
          const curr = q.shift();
          comp.push(curr);
          for (const nb of adj[curr]) {
            if (!visited.has(nb)) {
              visited.add(nb);
              q.push(nb);
            }
          }
        }
        comps.push(comp);
      }
    }
    return comps;
  };

  let comps = getComponents();
  while (comps.length > 1) {
    const c1 = comps[0].find(u => adj[u].size < maxAllowed) ?? comps[0][0];
    const c2 = comps[1].find(v => adj[v].size < maxAllowed) ?? comps[1][0];
    adj[c1].add(c2);
    adj[c2].add(c1);
    comps = getComponents();
  }

  // 2. Enforce minimum degree >= 2
  for (let u = 0; u < n; u++) {
    let attempts = 0;
    while (adj[u].size < minAllowed && attempts < n * 3) {
      attempts++;
      // Pick candidate v with < maxAllowed degree
      const candidates = [];
      for (let v = 0; v < n; v++) {
        if (v !== u && !adj[u].has(v) && adj[v].size < maxAllowed) {
          candidates.push(v);
        }
      }
      if (candidates.length === 0) break;
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      addUndirectedEdge(adj, u, chosen);
    }
  }

  // 3. Enforce maximum degree <= 9
  for (let u = 0; u < n; u++) {
    while (adj[u].size > maxAllowed) {
      const neighbors = Array.from(adj[u]).filter(v => adj[v].size > minAllowed);
      if (neighbors.length === 0) break;
      const dropV = neighbors[Math.floor(Math.random() * neighbors.length)];
      adj[u].delete(dropV);
      adj[dropV].delete(u);
    }
  }
}

/**
 * 1. Barabási–Albert (BA) Scale-Free Generator
 */
function generateBarabasiAlbert(n) {
  const adj = Array.from({ length: n }, () => new Set());
  const m0 = Math.min(3, n);
  const m = n <= 5 ? 2 : 2;

  // Initial connected triad
  for (let i = 0; i < m0; i++) {
    for (let j = i + 1; j < m0; j++) {
      addUndirectedEdge(adj, i, j);
    }
  }

  // Preferential attachment for remaining vertices
  for (let u = m0; u < n; u++) {
    let added = 0;
    let safety = 0;
    while (added < m && safety < 50) {
      safety++;
      // Calculate degree weights among existing nodes [0..u-1] with deg < MAX_DEGREE
      const eligible = [];
      let totalWeight = 0;
      for (let v = 0; v < u; v++) {
        if (!adj[u].has(v) && adj[v].size < MAX_DEGREE) {
          const w = adj[v].size + 1;
          eligible.push({ v, w });
          totalWeight += w;
        }
      }
      if (eligible.length === 0) break;
      let r = Math.random() * totalWeight;
      let picked = eligible[0].v;
      for (const item of eligible) {
        r -= item.w;
        if (r <= 0) {
          picked = item.v;
          break;
        }
      }
      if (addUndirectedEdge(adj, u, picked)) added++;
    }
  }

  enforceDegreeAndConnectivity(adj, n);
  return adj;
}

/**
 * 2. Erdős–Rényi (ER) Random Graph G(n, p) Generator
 */
function generateErdosRenyi(n) {
  const adj = Array.from({ length: n }, () => new Set());
  // Probability p tuned to match Table I edge density (~0.42 for n=10, ~0.28 for n=15)
  const p = n <= 5 ? 0.55 : n <= 10 ? 0.40 : 0.28;

  for (let u = 0; u < n; u++) {
    for (let v = u + 1; v < n; v++) {
      if (Math.random() < p) {
        addUndirectedEdge(adj, u, v);
      }
    }
  }

  enforceDegreeAndConnectivity(adj, n);
  return adj;
}

/**
 * 3. Watts–Strogatz (WS) Small-World Ring Lattice Generator
 */
function generateWattsStrogatz(n) {
  const adj = Array.from({ length: n }, () => new Set());
  const retryP = 0.25;

  // Step 1: Ring lattice connected to k=2 nearest neighbors (1 each side + 2nd neighbor on half)
  for (let u = 0; u < n; u++) {
    addUndirectedEdge(adj, u, (u + 1) % n);
    if (n >= 6 && u % 2 === 0) {
      addUndirectedEdge(adj, u, (u + 2) % n);
    }
  }

  // Step 2: Rewire edges with probability p while preserving degree bounds
  for (let u = 0; u < n; u++) {
    const nextV = (u + 1) % n;
    if (Math.random() < retryP && adj[u].size > MIN_DEGREE && adj[nextV].size > MIN_DEGREE) {
      const candidates = [];
      for (let w = 0; w < n; w++) {
        if (w !== u && !adj[u].has(w) && adj[w].size < MAX_DEGREE) {
          candidates.push(w);
        }
      }
      if (candidates.length > 0) {
        const newTarget = candidates[Math.floor(Math.random() * candidates.length)];
        adj[u].delete(nextV);
        adj[nextV].delete(u);
        addUndirectedEdge(adj, u, newTarget);
      }
    }
  }

  enforceDegreeAndConnectivity(adj, n);
  return adj;
}

/**
 * Computes aesthetically clean normalized 2D coordinates (x, y in [0.08, 0.92])
 * using Force-Directed Fruchterman-Reingold relaxation seeded on a multi-ring layout.
 */
function computeForceDirectedLayout(adj, n, modelType) {
  const coords = [];

  if (modelType === 'ws') {
    // Small-world ring lattice looks clearest on an elliptical ring with gentle jitter
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      coords.push({
        x: 0.5 + 0.38 * Math.cos(angle),
        y: 0.5 + 0.36 * Math.sin(angle),
      });
    }
    return coords;
  }

  // Initial left-to-right stratified placement so R1 is on the left (SRC) and RN is on the right (DST)
  for (let i = 0; i < n; i++) {
    const progress = n > 1 ? i / (n - 1) : 0.5;
    const angle = (2 * Math.PI * i) / n;
    coords.push({
      x: 0.10 + progress * 0.80,
      y: 0.50 + 0.32 * Math.sin(angle * 1.7 + (i % 3)),
    });
  }

  // Force-directed relaxation (60 iterations, keeping R1 anchored left and RN anchored right)
  const k = Math.sqrt(1.0 / Math.max(n, 2)) * 0.65;
  for (let iter = 0; iter < 60; iter++) {
    const disp = Array.from({ length: n }, () => ({ dx: 0, dy: 0 }));
    const temp = 0.08 * (1 - iter / 60);

    // Repulsive forces
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const vx = coords[i].x - coords[j].x;
        const vy = coords[i].y - coords[j].y;
        const dist = Math.max(0.03, Math.hypot(vx, vy));
        const force = (k * k) / dist;
        const fx = (vx / dist) * force;
        const fy = (vy / dist) * force;
        disp[i].dx += fx;
        disp[i].dy += fy;
        disp[j].dx -= fx;
        disp[j].dy -= fy;
      }
    }

    // Attractive spring forces
    for (let u = 0; u < n; u++) {
      for (const v of adj[u]) {
        if (u < v) {
          const vx = coords[u].x - coords[v].x;
          const vy = coords[u].y - coords[v].y;
          const dist = Math.max(0.03, Math.hypot(vx, vy));
          const force = (dist * dist) / k;
          const fx = (vx / dist) * force * 0.35;
          const fy = (vy / dist) * force * 0.35;
          disp[u].dx -= fx;
          disp[u].dy -= fy;
          disp[v].dx += fx;
          disp[v].dy += fy;
        }
      }
    }

    for (let i = 0; i < n; i++) {
      if (i === 0) {
        coords[i].x = 0.08;
        coords[i].y = 0.50;
        continue;
      }
      if (i === n - 1) {
        coords[i].x = 0.92;
        coords[i].y = 0.50;
        continue;
      }
      const dLen = Math.max(0.001, Math.hypot(disp[i].dx, disp[i].dy));
      coords[i].x += (disp[i].dx / dLen) * Math.min(dLen, temp);
      coords[i].y += (disp[i].dy / dLen) * Math.min(dLen, temp);
      coords[i].x = Math.max(0.14, Math.min(0.86, coords[i].x));
      coords[i].y = Math.max(0.10, Math.min(0.90, coords[i].y));
    }
  }

  return coords;
}

/**
 * Counts simple paths and average hop length between source (0) and target (n-1)
 * to replicate Table I of NDT.pdf.
 */
function computePathStats(adj, srcIdx, dstIdx, maxPaths = 6000) {
  let pathCount = 0;
  let totalHops = 0;
  const visited = new Uint8Array(adj.length);

  function dfs(curr, hops) {
    if (pathCount >= maxPaths) return;
    if (curr === dstIdx) {
      pathCount++;
      totalHops += hops;
      return;
    }
    visited[curr] = 1;
    for (const nb of adj[curr]) {
      if (!visited[nb]) {
        dfs(nb, hops + 1);
      }
    }
    visited[curr] = 0;
  }

  dfs(srcIdx, 0);
  const avgPathLength = pathCount > 0 ? +(totalHops / pathCount).toFixed(2) : 0;
  return { pathCount, avgPathLength };
}

/**
 * Main generator entry point.
 *
 * @param {string} modelType  - 'ba' | 'er' | 'ws'
 * @param {number} numNodes   - number of P routers (e.g., 5, 10, 15, 20)
 * @param {number} loadFactor - traffic load multiplier (0.2 to 1.2, default 0.65)
 */
function generateTopology(modelType = 'ba', numNodes = 10, loadFactor = 0.65) {
  const n = Math.max(4, Math.min(25, Number(numNodes) || 10));
  const cleanModel = ['ba', 'er', 'ws'].includes(modelType) ? modelType : 'ba';
  const load = Math.max(0.15, Math.min(1.25, Number(loadFactor) || 0.65));

  let adj;
  if (cleanModel === 'er') {
    adj = generateErdosRenyi(n);
  } else if (cleanModel === 'ws') {
    adj = generateWattsStrogatz(n);
  } else {
    adj = generateBarabasiAlbert(n);
  }

  const coords = computeForceDirectedLayout(adj, n, cleanModel);

  // Build nodes with degree & IoT/MPLS role metadata
  const nodes = [];
  const degrees = adj.map(s => s.size);

  for (let i = 0; i < n; i++) {
    const id = `R${i + 1}`;
    const deg = degrees[i];
    const isCoreHub = deg >= 4;
    const role = i === 0
      ? 'Ingress PE/P Router'
      : i === n - 1
      ? 'Egress PE/P Router'
      : isCoreHub
      ? 'Core P Hub Router'
      : 'Transit P Router';

    // Base router power in Watts (chassis idle + per-active-interface transceiver power)
    const basePowerWatts = +(45 + deg * 6.5).toFixed(1);

    nodes.push({
      id,
      label: isCoreHub ? `Hub ${id} (deg ${deg})` : `Router ${i + 1}`,
      x: +coords[i].x.toFixed(3),
      y: +coords[i].y.toFixed(3),
      degree: deg,
      maxInterfaces: MAX_DEGREE,
      role,
      base_power_watts: basePowerWatts,
    });
  }

  // Build edges with realistic telemetry
  const edges = [];
  for (let u = 0; u < n; u++) {
    const sortedNeighbors = Array.from(adj[u]).sort((a, b) => a - b);
    for (const v of sortedNeighbors) {
      if (u < v) {
        const srcId = `R${u + 1}`;
        const dstId = `R${v + 1}`;
        const degSum = degrees[u] + degrees[v];

        // Core hub links have higher capacity (1000 Mbps), edge/transit links 500-750 Mbps
        const capacity = degSum >= 8 ? 1000 : degSum >= 6 ? 750 : 500;

        // Create a realistic mix of congested bottlenecks, balanced, and uncongested links
        const bottleneckBias = ((u + v) % 4 === 1) ? 1.28 : ((u * v) % 3 === 0 ? 0.92 : 0.48);
        const util = Math.max(0.08, Math.min(0.98, load * bottleneckBias * randBetween(0.78, 1.15)));
        const throughput = Math.round(capacity * util);

        // Non-linear M/M/1 queueing delay
        const baseDelay = 2.0 + (1000 / capacity) * 2.5;
        const queueDelay = (Math.pow(util, 2.4) / (1.03 - util)) * 6.0;
        const delay = +(baseDelay + queueDelay + randBetween(0.2, 1.8)).toFixed(1);
        const jitter = +(0.3 + Math.pow(util, 1.8) * 5.5 + randBetween(0.1, 0.8)).toFixed(2);
        const packetLoss = util > 0.72
          ? +((util - 0.72) * 18.0 + randBetween(0.1, 0.9)).toFixed(2)
          : +(randBetween(0.0, 0.08)).toFixed(2);

        edges.push({
          id: `e_${srcId}_${dstId}`,
          source: srcId,
          target: dstId,
          capacity_mbps: capacity,
          throughput_mbps: throughput,
          delay_ms: delay,
          jitter_ms: jitter,
          packet_loss_pct: packetLoss,
        });
      }
    }
  }

  // Compute Paper Section V & Table I stats
  const { pathCount, avgPathLength } = computePathStats(adj, 0, n - 1);
  const peRouters = Math.max(2, Math.floor(n / 5) + 1);
  const ceRouters = peRouters;
  const switches = ceRouters;
  const iotHosts = 3 * peRouters;
  const minDeg = Math.min(...degrees);
  const maxDeg = Math.max(...degrees);
  const avgDeg = +(degrees.reduce((a, b) => a + b, 0) / n).toFixed(2);

  const modelNames = {
    ba: 'Barabási–Albert (Scale-Free Preferential Attachment)',
    er: 'Erdős–Rényi (Uniform Random G(n,p))',
    ws: 'Watts–Strogatz (Small-World Ring Lattice)',
  };

  const topologySummary = {
    modelKey: cleanModel,
    modelName: modelNames[cleanModel],
    pRouters: n,
    peRouters,
    ceRouters,
    switches,
    iotHosts,
    totalEdges: edges.length,
    simplePaths: pathCount,
    avgPathLength,
    minDegree: minDeg,
    maxDegree: maxDeg,
    avgDegree: avgDeg,
    degreeConstraintSatisfied: minDeg >= MIN_DEGREE && maxDeg <= MAX_DEGREE,
    degreeConstraintFormula: '2 <= deg(v) <= 9',
  };

  return {
    nodes,
    edges,
    source: 'R1',
    target: `R${n}`,
    topologySummary,
  };
}

module.exports = {
  generateTopology,
  MIN_DEGREE,
  MAX_DEGREE,
};

