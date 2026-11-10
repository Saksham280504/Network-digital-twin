'use client';

import { useState } from 'react';
import { useNetwork } from '../context/NetworkContext';

export default function ControlPanel() {
  const {
    selectedItem, networkData, mode,
    analyzeNetwork, injectFault, restoreItem, resetNetwork, setSelectedItem
  } = useNetwork();
  const [busy, setBusy] = useState(false);

  const selectedEdge = selectedItem?.type === 'edge'
    ? networkData.edges.find(e => e.id === selectedItem.id) : null;
  const selectedNode = selectedItem?.type === 'node'
    ? networkData.nodes.find(n => n.id === selectedItem.id) : null;

  const canDropEdge    = selectedEdge && !selectedEdge.dropped;
  const canDropNode    = selectedNode && !selectedNode.dropped;
  const canRestoreEdge = selectedEdge?.dropped === true;
  const canRestoreNode = selectedNode?.dropped === true;

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  if (mode === 'build') return null;

  return (
    <div className="flex-shrink-0 border-t border-slate-800/80 bg-slate-950/90 px-5 py-4 space-y-3 shadow-[0_-10px_25px_-10px_rgba(0,0,0,0.6)]">

      {/* Section title */}
      <div className="flex items-center gap-2.5">
        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
          What-If Fault Controls
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-slate-800 to-transparent" />
      </div>

      {/* Selection Display */}
      <div className={`min-h-[42px] flex items-center px-3.5 py-2.5 rounded-xl border transition-all
        ${selectedItem
          ? 'bg-amber-950/25 border-amber-700/60 shadow-[0_0_15px_-5px_rgba(245,158,11,0.3)]'
          : 'bg-slate-900/60 border-slate-800/90'}`}
      >
        {selectedItem ? (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5">
              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-semibold text-slate-300 uppercase">
                {selectedItem.type}
              </span>
              <span className="text-xs font-mono font-bold text-amber-300">{selectedItem.id}</span>
              {(selectedEdge?.dropped || selectedNode?.dropped) && (
                <span className="text-[10px] text-red-300 bg-red-950/60 border border-red-800/60 px-2 py-0.5 rounded font-semibold">
                  DROPPED
                </span>
              )}
            </div>
            <button
              onClick={() => setSelectedItem(null)}
              className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-slate-800 cursor-pointer"
            >
              ✕
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            Click any router or link on the canvas to inspect or inject faults
          </p>
        )}
      </div>

      {/* Fault Injection — Drop */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          id="btn-drop-link"
          onClick={() => run(() => injectFault('edge', selectedEdge.id))}
          disabled={!canDropEdge || busy}
          className="ndt-nav-btn flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border
            bg-gradient-to-b from-red-950/50 to-red-950/80 border-red-800/70 text-red-300 text-xs font-semibold
            hover:border-red-500 disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
        >
          <span>⛓</span> Drop Link
        </button>
        <button
          id="btn-drop-node"
          onClick={() => run(() => injectFault('node', selectedNode.id))}
          disabled={!canDropNode || busy}
          className="ndt-nav-btn flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border
            bg-gradient-to-b from-red-950/50 to-red-950/80 border-red-800/70 text-red-300 text-xs font-semibold
            hover:border-red-500 disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
        >
          <span>📡</span> Drop Node
        </button>
      </div>

      {/* Fault Recovery — Restore */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          id="btn-restore-link"
          onClick={() => run(() => restoreItem('edge', selectedEdge.id))}
          disabled={!canRestoreEdge || busy}
          className="ndt-nav-btn flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border
            bg-gradient-to-b from-emerald-950/50 to-emerald-950/80 border-emerald-800/70 text-emerald-300 text-xs font-semibold
            hover:border-emerald-500 disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
        >
          <span>🔧</span> Restore Link
        </button>
        <button
          id="btn-restore-node"
          onClick={() => run(() => restoreItem('node', selectedNode.id))}
          disabled={!canRestoreNode || busy}
          className="ndt-nav-btn flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border
            bg-gradient-to-b from-emerald-950/50 to-emerald-950/80 border-emerald-800/70 text-emerald-300 text-xs font-semibold
            hover:border-emerald-500 disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
        >
          <span>🔧</span> Restore Node
        </button>
      </div>

      {/* Utility Buttons */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          id="btn-reanalyze"
          onClick={() => run(analyzeNetwork)}
          disabled={busy}
          className="ndt-nav-btn flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border
            bg-gradient-to-b from-cyan-900/50 to-cyan-950/80 border-cyan-700/70 text-cyan-200 text-xs font-semibold
            hover:border-cyan-400 disabled:opacity-40 cursor-pointer"
        >
          {busy
            ? <span className="inline-block w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            : '⟳'
          }
          Re-analyze
        </button>
        <button
          id="btn-reset"
          onClick={() => run(resetNetwork)}
          disabled={busy}
          className="ndt-nav-btn flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border
            bg-slate-900/90 border-slate-700/80 text-slate-200 text-xs font-semibold
            hover:border-slate-500 disabled:opacity-40 cursor-pointer"
        >
          ↺ Reset All
        </button>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2 border-t border-slate-800/70">
        {[
          { color: 'bg-cyan-400 shadow-[0_0_6px_#22d3ee]',   label: 'Uncongested'      },
          { color: 'bg-lime-400 shadow-[0_0_6px_#84cc16]',   label: 'Balanced'         },
          { color: 'bg-orange-400 shadow-[0_0_6px_#f97316]', label: 'Mod. Congested'   },
          { color: 'bg-red-500 shadow-[0_0_6px_#ef4444]',    label: 'Highly Congested' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
            <span className="text-[11px] text-slate-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
