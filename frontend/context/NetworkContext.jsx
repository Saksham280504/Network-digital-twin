'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import * as api from '../lib/api';

const NetworkContext = createContext(null);

/**
 * Global state for the Network Digital Twin dashboard.
 * Provides network topology, ML predictions, the active routing path,
 * and all action handlers to child components.
 */
export function NetworkProvider({ children }) {
  const [networkData, setNetworkData] = useState({ nodes: [], edges: [] });
  const [predictions, setPredictions] = useState([]);
  const [activePath, setActivePath] = useState({ path: [], edgePath: [], totalCost: 0 });
  const [selectedItem, setSelectedItem] = useState(null); // { type, id }
  const [isLoading, setIsLoading] = useState(false);
  const [lastAnalyzed, setLastAnalyzed] = useState(null);
  const [error, setError] = useState(null);

  /** Load bare topology from backend (no predictions yet). */
  const loadNetwork = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.fetchNetwork();
      setNetworkData({ nodes: data.nodes, edges: data.edges });
      if (data.predictions?.length) setPredictions(data.predictions);
    } catch (err) {
      setError(err.message);
      console.error('[NetworkContext] loadNetwork:', err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** Trigger ML prediction + Dijkstra rerouting, then update all state. */
  const analyzeNetwork = useCallback(async () => {
    setError(null);
    try {
      const data = await api.analyzeNetwork();
      setNetworkData({ nodes: data.nodes, edges: data.edges });
      setPredictions(data.predictions || []);
      setActivePath(data.activePath || { path: [], edgePath: [], totalCost: 0 });
      setLastAnalyzed(new Date());
    } catch (err) {
      setError(err.message);
      console.error('[NetworkContext] analyzeNetwork:', err.message);
    }
  }, []);

  /** Inject a fault (drop node/edge), then auto-analyze to show rerouting. */
  const injectFault = useCallback(async (type, id) => {
    setError(null);
    try {
      await api.injectFault(type, id);
      // Auto-analyze: let the PBR engine find the new best path
      const data = await api.analyzeNetwork();
      setNetworkData({ nodes: data.nodes, edges: data.edges });
      setPredictions(data.predictions || []);
      setActivePath(data.activePath || { path: [], edgePath: [], totalCost: 0 });
      setLastAnalyzed(new Date());
      setSelectedItem(null);
    } catch (err) {
      setError(err.message);
      console.error('[NetworkContext] injectFault:', err.message);
    }
  }, []);

  /** Reset network to baseline and re-analyze. */
  const resetNetwork = useCallback(async () => {
    setError(null);
    try {
      await api.resetNetwork();
      const data = await api.analyzeNetwork();
      setNetworkData({ nodes: data.nodes, edges: data.edges });
      setPredictions(data.predictions || []);
      setActivePath(data.activePath || { path: [], edgePath: [], totalCost: 0 });
      setLastAnalyzed(new Date());
      setSelectedItem(null);
    } catch (err) {
      setError(err.message);
      console.error('[NetworkContext] resetNetwork:', err.message);
    }
  }, []);

  return (
    <NetworkContext.Provider value={{
      networkData,
      predictions,
      activePath,
      selectedItem,
      isLoading,
      lastAnalyzed,
      error,
      loadNetwork,
      analyzeNetwork,
      injectFault,
      resetNetwork,
      setSelectedItem,
    }}>
      {children}
    </NetworkContext.Provider>
  );
}

/** Hook to consume network context in any child component. */
export function useNetwork() {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error('useNetwork must be used inside <NetworkProvider>');
  return ctx;
}
