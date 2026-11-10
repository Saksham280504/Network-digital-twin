'use client';

import { useState } from 'react';
import { useNetwork } from '../context/NetworkContext';

export default function BuildPanel() {
  const {
    networkData, selectedItem, pendingEdgeFrom,
    routeSource, routeTarget,
    deleteItem, updateNodeLabel, updateEdgeLocal,
    setRouteSource, setRouteTarget,
    finishBuild, exitBuildMode,
    loadDefaultTopology
  } = useNetwork();

  const [busy, setBusy] = useState(false);

  const selectedNode = selectedItem?.type === 'node'
    ? networkData.nodes.find(n => n.id === selectedItem.id) : null;
  const selectedEdge = selectedItem?.type === 'edge'
    ? networkData.edges.find(e => e.id === selectedItem.id) : null;

  const canFinish = networkData.nodes.length >= 2 && networkData.edges.length >= 1;

  const handleFinish = async () => {
    setBusy(true);
    try { await finishBuild(); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-violet-400 animate-pulse shadow-[0_0_8px_#a78bfa]" />
          <span className="text-xs font-bold text-violet-300 uppercase tracking-widest">Topology Build Mode</span>
        </div>
        <button
          onClick={exitBuildMode}
          className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          ✕ Cancel
        </button>
      </div>

      {/* Stats */}
      <div className="mx-4 mt-3.5 p-3.5 rounded-xl ndt-card grid grid-cols-3 gap-2 text-center flex-shrink-0">
        <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
          <div className="text-lg font-bold text-white leading-none">{networkData.nodes.length}</div>
          <div className="text-[10px] text-slate-400 mt-1">Routers</div>
        </div>
        <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
          <div className="text-lg font-bold text-white leading-none">{networkData.edges.length}</div>
          <div className="text-[10px] text-slate-400 mt-1">Links</div>
        </div>
        <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
          <div className="text-xs font-mono font-bold text-cyan-300 truncate">
            {routeSource ? `${routeSource} → ${routeTarget || '?'}` : 'Auto'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Route</div>
        </div>
      </div>

      {/* Instructions / Connection Hint */}
      <div className="mx-4 mt-3 p-3.5 rounded-xl ndt-card flex-shrink-0">
        {pendingEdgeFrom ? (
          <div className="p-3 rounded-lg bg-violet-950/40 border border-violet-700/60">
            <p className="text-xs text-violet-200 font-medium">
              Click another router to connect from <span className="font-mono font-bold text-violet-300">{pendingEdgeFrom}</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Click empty canvas space to cancel connection
            </p>
          </div>
        ) : (
          <div className="space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2.5">
              <span className="text-cyan-400">●</span> Click empty canvas to place a router
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-violet-400">●</span> Click two routers sequentially to connect them
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-amber-400">●</span> Drag any router to reposition it
            </div>
          </div>
        )}
      </div>

      {/* ── Selected Item Editor ── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3">
        {selectedNode && (
          <div className="p-4 rounded-xl ndt-card space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                Selected Router
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-700/60 text-xs font-mono text-amber-300 font-bold">
                {selectedNode.id}
              </span>
            </div>

            {/* Label editor */}
            <div className="space-y-1.5">
              <span className="text-[11px] text-slate-400">Router Label</span>
              <input
                type="text"
                value={selectedNode.label}
                onChange={(e) => updateNodeLabel(selectedNode.id, e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700
                  text-xs text-slate-200 font-mono outline-none
                  focus:border-cyan-500 transition-all"
              />
            </div>

            {/* Source / Target pickers */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => setRouteSource(selectedNode.id)}
                disabled={routeSource === selectedNode.id}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer transition-all
                  ${routeSource === selectedNode.id
                    ? 'bg-cyan-950/70 border-cyan-600 text-cyan-200'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-600'}`}
              >
                📤 {routeSource === selectedNode.id ? 'Source ✓' : 'Set Source'}
              </button>
              <button
                onClick={() => setRouteTarget(selectedNode.id)}
                disabled={routeTarget === selectedNode.id}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer transition-all
                  ${routeTarget === selectedNode.id
                    ? 'bg-orange-950/70 border-orange-600 text-orange-200'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-orange-600'}`}
              >
                📥 {routeTarget === selectedNode.id ? 'Dest ✓' : 'Set Dest'}
              </button>
            </div>

            {/* Delete node */}
            <button
              onClick={() => deleteItem('node', selectedNode.id)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border
                bg-red-950/40 border-red-800/60 text-red-300 text-xs font-semibold
                hover:bg-red-900/50 cursor-pointer transition-all"
            >
              🗑 Delete Router
            </button>
          </div>
        )}

        {selectedEdge && (
          <div className="p-4 rounded-xl ndt-card space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                Selected Link
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-700/60 text-xs font-mono text-amber-300 font-bold">
                {selectedEdge.id}
              </span>
            </div>

            <div className="text-xs text-slate-300 font-mono font-semibold">
              {selectedEdge.source} <span className="text-slate-500">→</span> {selectedEdge.target}
            </div>

            {/* Edge properties */}
            {[
              { label: 'Throughput (Mbps)', key: 'throughput_mbps', min: 0, max: 5000, step: 10 },
              { label: 'Capacity (Mbps)',   key: 'capacity_mbps',  min: 100, max: 10000, step: 100 },
              { label: 'Delay (ms)',        key: 'delay_ms',       min: 0.1, max: 100, step: 0.1 },
            ].map(({ label, key, min, max, step }) => (
              <div key={key} className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">{label}</span>
                  <span className="text-slate-200 font-mono font-semibold">{selectedEdge[key]}</span>
                </div>
                <input
                  type="range" min={min} max={max} step={step}
                  value={selectedEdge[key]}
                  onChange={(e) => updateEdgeLocal(selectedEdge.id, { [key]: Number(e.target.value) })}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                />
              </div>
            ))}

            {/* Delete edge */}
            <button
              onClick={() => deleteItem('edge', selectedEdge.id)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border
                bg-red-950/40 border-red-800/60 text-red-300 text-xs font-semibold
                hover:bg-red-900/50 cursor-pointer transition-all"
            >
              🗑 Delete Link
            </button>
          </div>
        )}

        {!selectedNode && !selectedEdge && networkData.nodes.length === 0 && (
          <div className="p-6 rounded-xl ndt-card flex flex-col items-center gap-3 text-center">
            <div className="text-3xl">🖱️</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Click anywhere on the canvas to place your first router node
            </p>
          </div>
        )}
      </div>

      {/* ── Bottom Actions ── */}
      <div className="flex-shrink-0 border-t border-slate-800/80 bg-slate-950/90 px-5 py-4 space-y-2.5">
        <button
          onClick={handleFinish}
          disabled={!canFinish || busy}
          className="ndt-nav-btn w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border
            bg-gradient-to-b from-violet-900/60 to-violet-950/80 border-violet-600/70 text-violet-200 text-xs font-bold
            hover:border-violet-400 disabled:opacity-30 cursor-pointer"
        >
          {busy
            ? <span className="w-3.5 h-3.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            : '✓'
          }
          Finish & Analyze Topology
        </button>
        <button
          onClick={loadDefaultTopology}
          className="ndt-nav-btn w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border
            bg-slate-900 border-slate-700/80 text-slate-300 text-xs font-semibold
            hover:border-slate-500 cursor-pointer"
        >
          ↺ Load Default 10-Node Topology
        </button>
      </div>
    </div>
  );
}
