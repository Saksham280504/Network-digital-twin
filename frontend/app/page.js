'use client';

import { useEffect, useState } from 'react';
import { NetworkProvider, useNetwork } from '../context/NetworkContext';
import NetworkCanvas from '../components/NetworkCanvas';
import MetricsPanel from '../components/MetricsPanel';
import ControlPanel from '../components/ControlPanel';

function Dashboard() {
  const { loadNetwork, analyzeNetwork, isLoading, networkData, error, lastAnalyzed } = useNetwork();
  const [ready, setReady] = useState(false);

  // On mount: load topology then run first analysis
  useEffect(() => {
    (async () => {
      await loadNetwork();
      await analyzeNetwork();
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const droppedNodes = networkData.nodes.filter(n => n.dropped).length;
  const droppedEdges = networkData.edges.filter(e => e.dropped).length;

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden select-none">

      {/* ── Header ── */}
      <header className="flex-shrink-0 flex items-center justify-between px-6 h-14
        border-b border-slate-800/80 bg-gray-950/95 backdrop-blur-sm z-20">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-2.5 h-2.5 bg-cyan-400 rounded-full" />
            <div className="w-2.5 h-2.5 bg-cyan-400 rounded-full absolute top-0 left-0 animate-ping opacity-50" />
          </div>
          <h1 className="text-sm font-semibold tracking-tight">
            <span className="text-cyan-400">Network</span>
            <span className="text-white"> Digital Twin</span>
          </h1>
          <span className="hidden sm:inline text-xs text-slate-700 font-mono">
            Predictive PBR Engine
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-500">
          {isLoading && (
            <span className="flex items-center gap-1.5 text-cyan-600">
              <span className="w-3 h-3 border border-cyan-600 border-t-transparent rounded-full animate-spin" />
              Loading…
            </span>
          )}
          {error && (
            <span className="text-red-500 text-[11px]">⚠ Backend unreachable</span>
          )}
          {(droppedNodes > 0 || droppedEdges > 0) && (
            <span className="flex items-center gap-1 text-red-500">
              <span>⚠</span>
              {droppedNodes > 0 && <span>{droppedNodes} node{droppedNodes > 1 ? 's' : ''} down</span>}
              {droppedEdges > 0 && <span>{droppedEdges} link{droppedEdges > 1 ? 's' : ''} down</span>}
            </span>
          )}
          <div className="hidden md:flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
              {networkData.nodes.length} Nodes
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
              {networkData.edges.length} Links
            </span>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Canvas area */}
        <div className="relative flex-1 min-w-0">
          {/* Loading overlay */}
          {!ready && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-950 gap-4">
              <div className="w-10 h-10 border-2 border-cyan-700 border-t-cyan-400 rounded-full animate-spin" />
              <p className="text-slate-500 text-sm">Initializing network topology…</p>
            </div>
          )}
          <NetworkCanvas />
        </div>

        {/* Sidebar */}
        <aside className="w-80 xl:w-96 flex flex-col border-l border-slate-800/70 bg-gray-950 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden">
            <MetricsPanel />
          </div>
          <ControlPanel />
        </aside>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <NetworkProvider>
      <Dashboard />
    </NetworkProvider>
  );
}
