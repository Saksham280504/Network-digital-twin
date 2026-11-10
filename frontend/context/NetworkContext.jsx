'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import * as api from '../lib/api';

const NetworkContext = createContext(null);

export function NetworkProvider({ children }) {
  // ─── Core Network & Routing State ────────────────────────────
  const [networkData, setNetworkData] = useState({ nodes: [], edges: [] });
  const [predictions, setPredictions] = useState([]);
  const [activePath, setActivePath] = useState({ path: [], edgePath: [], totalCost: 0 });
  const [ospfPath, setOspfPath] = useState({ path: [], edgePath: [], totalCost: 0 });
  const [secondaryPath, setSecondaryPath] = useState({ path: [], edgePath: [], totalCost: 0 });
  const [vertexSplits, setVertexSplits] = useState({});
  const [benchmarkMetrics, setBenchmarkMetrics] = useState(null);
  const [topologySummary, setTopologySummary] = useState(null);

  // ─── Multi-Model State ───────────────────────────────────────
  const [activeModel, setActiveModel] = useState('mpnn');
  const [inferenceLatencyMs, setInferenceLatencyMs] = useState(null);
  const [engineMode, setEngineMode] = useState('fastapi');
  const [modelComparisonLive, setModelComparisonLive] = useState(null);
  const [modelRoutes, setModelRoutes] = useState({});
  const [modelSpecs, setModelSpecs] = useState(null);

  // ─── UI & Visualization Controls ─────────────────────────────
  const [selectedItem, setSelectedItem] = useState(null); // { type, id }
  const [routingOverlay, setRoutingOverlay] = useState('both'); // 'pbr' | 'both' | 'multipath'
  const [highlightDisagreement, setHighlightDisagreement] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'models' | 'generator' | 'simulator' | null
  const [stepwiseData, setStepwiseData] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [lastAnalyzed, setLastAnalyzed] = useState(null);
  const [error, setError] = useState(null);

  // ─── Route Endpoints ─────────────────────────────────────────
  const [routeSource, setRouteSource] = useState(null);
  const [routeTarget, setRouteTarget] = useState(null);

  // ─── Build Mode State ────────────────────────────────────────
  const [mode, setMode] = useState('view'); // 'view' | 'build'
  const [pendingEdgeFrom, setPendingEdgeFrom] = useState(null);
  const nodeCounterRef = useRef(1);

  /** Helper: apply analyze response to all state. */
  const applyAnalysis = useCallback((data) => {
    if (!data) return;
    setNetworkData({ nodes: data.nodes || [], edges: data.edges || [] });
    setPredictions(data.predictions || []);
    setActivePath(data.activePath || { path: [], edgePath: [], totalCost: 0 });
    setOspfPath(data.ospfPath || { path: [], edgePath: [], totalCost: 0 });
    setSecondaryPath(data.secondaryPath || { path: [], edgePath: [], totalCost: 0 });
    setVertexSplits(data.vertexSplits || {});
    setBenchmarkMetrics(data.benchmarkMetrics || null);
    if (data.topologySummary) setTopologySummary(data.topologySummary);
    if (data.activeModel) setActiveModel(data.activeModel);
    if (data.inferenceLatencyMs !== undefined) setInferenceLatencyMs(data.inferenceLatencyMs);
    if (data.engineMode) setEngineMode(data.engineMode);
    if (data.modelComparisonLive) setModelComparisonLive(data.modelComparisonLive);
    if (data.modelRoutes) setModelRoutes(data.modelRoutes);
    if (data.routeSource) setRouteSource(data.routeSource);
    if (data.routeTarget) setRouteTarget(data.routeTarget);
    setLastAnalyzed(new Date());
  }, []);

  /** Load bare topology + model specs from backend. */
  const loadNetwork = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [netData, specsData] = await Promise.all([
        api.fetchNetwork(),
        api.fetchModelSpecs().catch(() => null),
      ]);
      setNetworkData({ nodes: netData.nodes, edges: netData.edges });
      if (netData.predictions?.length) setPredictions(netData.predictions);
      if (netData.topologySummary) setTopologySummary(netData.topologySummary);
      if (netData.routeSource) setRouteSource(netData.routeSource);
      if (netData.routeTarget) setRouteTarget(netData.routeTarget);
      if (specsData) setModelSpecs(specsData);
    } catch (err) {
      setError(err.message);
      console.error('[NetworkContext] loadNetwork:', err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** Trigger ML prediction + Dijkstra rerouting. */
  const analyzeNetwork = useCallback(async (source, target, modelOverride) => {
    setError(null);
    const chosenModel = modelOverride || activeModel;
    try {
      const data = await api.analyzeNetwork(
        source || routeSource,
        target || routeTarget,
        chosenModel
      );
      applyAnalysis(data);
    } catch (err) {
      setError(err.message);
    }
  }, [routeSource, routeTarget, activeModel, applyAnalysis]);

  /** Switch active ML model and immediately re-analyze. */
  const switchModel = useCallback(async (newModelKey) => {
    setActiveModel(newModelKey);
    await analyzeNetwork(routeSource, routeTarget, newModelKey);
  }, [routeSource, routeTarget, analyzeNetwork]);

  /**
   * Auto-sync when FastAPI wakes up from cold-start sleep:
   * If initial analysis used the instant fallback while FastAPI was waking up,
   * poll every 4s and automatically update the UI + timestamp the moment FastAPI is live.
   */
  useEffect(() => {
    if (engineMode !== 'fallback' || mode !== 'view') return;

    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const [data, specsData] = await Promise.all([
          api.analyzeNetwork(routeSource, routeTarget, activeModel),
          api.fetchModelSpecs().catch(() => null),
        ]);
        if (cancelled) return;
        if (specsData) setModelSpecs(specsData);
        if (data?.engineMode === 'fastapi') {
          applyAnalysis(data);
        }
      } catch (_) {
        // Ignore transient network errors while container finishes booting
      }
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [engineMode, mode, routeSource, routeTarget, activeModel, applyAnalysis]);

  /** Generate mathematical topology (BA, ER, WS) with 2 <= deg(v) <= 9. */
  const generateTopology = useCallback(async (model = 'ba', numNodes = 10, loadFactor = 0.68) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.generatePaperTopology(model, numNodes, loadFactor);
      setMode('view');
      setSelectedItem(null);
      setPendingEdgeFrom(null);
      applyAnalysis(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [applyAnalysis]);

  /** Run Paper Section IV-B Stepwise Traffic Escalation Simulation. */
  const triggerStepwiseSimulation = useCallback(async () => {
    setIsSimulating(true);
    setError(null);
    try {
      const data = await api.runStepwiseSimulation();
      setStepwiseData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSimulating(false);
    }
  }, []);

  /** Inject a fault (drop node/edge), then auto-analyze. */
  const injectFault = useCallback(async (type, id) => {
    setError(null);
    try {
      await api.injectFault(type, id);
      const data = await api.analyzeNetwork(routeSource, routeTarget, activeModel);
      applyAnalysis(data);
    } catch (err) {
      setError(err.message);
    }
  }, [routeSource, routeTarget, activeModel, applyAnalysis]);

  /** Restore a dropped node/edge, then auto-analyze. */
  const restoreItem = useCallback(async (type, id) => {
    setError(null);
    try {
      await api.restoreItem(type, id);
      const data = await api.analyzeNetwork(routeSource, routeTarget, activeModel);
      applyAnalysis(data);
    } catch (err) {
      setError(err.message);
    }
  }, [routeSource, routeTarget, activeModel, applyAnalysis]);

  /** Update edge telemetry, then auto-analyze. */
  const updateEdge = useCallback(async (id, updates) => {
    setError(null);
    try {
      await api.updateEdge(id, updates);
      const data = await api.analyzeNetwork(routeSource, routeTarget, activeModel);
      applyAnalysis(data);
    } catch (err) {
      setError(err.message);
    }
  }, [routeSource, routeTarget, activeModel, applyAnalysis]);

  /** Reset network to baseline and re-analyze. */
  const resetNetwork = useCallback(async (resetToDefault = false) => {
    setError(null);
    try {
      const resetRes = await api.resetNetwork(resetToDefault);
      const src = resetRes.routeSource || routeSource;
      const tgt = resetRes.routeTarget || routeTarget;
      const data = await api.analyzeNetwork(src, tgt, activeModel);
      applyAnalysis(data);
      setSelectedItem(null);
    } catch (err) {
      setError(err.message);
    }
  }, [routeSource, routeTarget, activeModel, applyAnalysis]);

  // ═══════════════════════════════════════════════════════════════
  // BUILD MODE ACTIONS
  // ═══════════════════════════════════════════════════════════════

  const enterBuildMode = useCallback(() => {
    setMode('build');
    setNetworkData({ nodes: [], edges: [] });
    setPredictions([]);
    setActivePath({ path: [], edgePath: [], totalCost: 0 });
    setOspfPath({ path: [], edgePath: [], totalCost: 0 });
    setSecondaryPath({ path: [], edgePath: [], totalCost: 0 });
    setSelectedItem(null);
    setPendingEdgeFrom(null);
    setRouteSource(null);
    setRouteTarget(null);
    nodeCounterRef.current = 1;
  }, []);

  const exitBuildMode = useCallback(() => {
    setMode('view');
    setPendingEdgeFrom(null);
    setSelectedItem(null);
  }, []);

  const addNode = useCallback((x, y) => {
    const id = `N${nodeCounterRef.current}`;
    const label = `Router ${nodeCounterRef.current}`;
    nodeCounterRef.current++;
    const newNode = { id, label, x, y };

    setNetworkData(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));
    setSelectedItem({ type: 'node', id });

    setRouteSource(prev => prev || id);
    if (nodeCounterRef.current === 3) {
      setRouteTarget(id);
    }
  }, []);

  const addEdge = useCallback((sourceId, targetId) => {
    const id = `e_${sourceId}_${targetId}`;
    const newEdge = {
      id,
      source: sourceId,
      target: targetId,
      capacity_mbps: 1000,
      throughput_mbps: 250,
      delay_ms: 5.0
    };

    setNetworkData(prev => {
      const exists = prev.edges.some(
        e => (e.source === sourceId && e.target === targetId) ||
             (e.source === targetId && e.target === sourceId)
      );
      if (exists) return prev;
      return { ...prev, edges: [...prev.edges, newEdge] };
    });

    setPendingEdgeFrom(null);
    setSelectedItem({ type: 'edge', id });
  }, []);

  const deleteItem = useCallback((type, id) => {
    setNetworkData(prev => {
      if (type === 'node') {
        return {
          nodes: prev.nodes.filter(n => n.id !== id),
          edges: prev.edges.filter(e => e.source !== id && e.target !== id)
        };
      } else {
        return {
          ...prev,
          edges: prev.edges.filter(e => e.id !== id)
        };
      }
    });
    setSelectedItem(null);
    if (pendingEdgeFrom === id) setPendingEdgeFrom(null);
    if (routeSource === id) setRouteSource(null);
    if (routeTarget === id) setRouteTarget(null);
  }, [pendingEdgeFrom, routeSource, routeTarget]);

  const updateEdgeLocal = useCallback((id, updates) => {
    setNetworkData(prev => ({
      ...prev,
      edges: prev.edges.map(e =>
        e.id === id ? { ...e, ...updates } : e
      )
    }));
  }, []);

  const moveNode = useCallback((id, x, y) => {
    setNetworkData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n =>
        n.id === id ? { ...n, x, y } : n
      )
    }));
  }, []);

  const updateNodeLabel = useCallback((id, label) => {
    setNetworkData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n =>
        n.id === id ? { ...n, label } : n
      )
    }));
  }, []);

  const finishBuild = useCallback(async () => {
    setError(null);
    try {
      const src = routeSource || networkData.nodes[0]?.id;
      const tgt = routeTarget || networkData.nodes[networkData.nodes.length - 1]?.id;

      await api.loadCustomNetwork({
        nodes: networkData.nodes,
        edges: networkData.edges,
        source: src,
        target: tgt
      });

      setMode('view');
      setPendingEdgeFrom(null);

      const data = await api.analyzeNetwork(src, tgt, activeModel);
      applyAnalysis(data);
      setSelectedItem(null);
    } catch (err) {
      setError(err.message);
    }
  }, [networkData, routeSource, routeTarget, activeModel, applyAnalysis]);

  const loadDefaultTopology = useCallback(async () => {
    setMode('view');
    setPendingEdgeFrom(null);
    setSelectedItem(null);
    await resetNetwork(true);
  }, [resetNetwork]);

  return (
    <NetworkContext.Provider value={{
      // Core State
      networkData,
      predictions,
      activePath,
      ospfPath,
      secondaryPath,
      vertexSplits,
      benchmarkMetrics,
      topologySummary,

      // Multi-Model State
      activeModel,
      inferenceLatencyMs,
      engineMode,
      modelComparisonLive,
      modelRoutes,
      modelSpecs,

      // UI & Canvas Overlays
      selectedItem,
      routingOverlay,
      setRoutingOverlay,
      highlightDisagreement,
      setHighlightDisagreement,
      activeModal,
      setActiveModal,
      stepwiseData,
      isSimulating,

      isLoading,
      lastAnalyzed,
      error,
      mode,
      pendingEdgeFrom,
      routeSource,
      routeTarget,

      // Actions
      loadNetwork,
      analyzeNetwork,
      switchModel,
      generateTopology,
      triggerStepwiseSimulation,
      injectFault,
      restoreItem,
      updateEdge,
      resetNetwork,
      setSelectedItem,

      // Build Mode Actions
      enterBuildMode,
      exitBuildMode,
      addNode,
      addEdge,
      deleteItem,
      updateEdgeLocal,
      moveNode,
      updateNodeLabel,
      finishBuild,
      loadDefaultTopology,
      setPendingEdgeFrom,
      setRouteSource,
      setRouteTarget,
    }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error('useNetwork must be used inside <NetworkProvider>');
  return ctx;
}
