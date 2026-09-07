'use client';

import { useState } from 'react';
import { useNetwork } from '../context/NetworkContext';

export default function ControlPanel() {
  const {
    selectedItem, networkData,
    analyzeNetwork, injectFault, resetNetwork, setSelectedItem
  } = useNetwork();
  const [busy, setBusy] = useState(false);

  const selectedEdge = selectedItem?.type === 'edge'
    ? networkData.edges.find(e => e.id === selectedItem.id) : null;
  const selectedNode = selectedItem?.type === 'node'
    ? networkData.nodes.find(n => n.id === selectedItem.id) : null;

  const canDropEdge = selectedEdge && !selectedEdge.dropped;
  const canDropNode = selectedNode && !selectedNode.dropped;

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  return (
    <div className="flex-shrink-0 border-t border-slate-800/70 bg-gray-950 px-4 py-4 space-y-3">

      {/* Section title */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
          What-If Controls
        </span>
        <div className="flex-1 h-px bg-slate-800/60" />
      </div>

      {/* Selection Display */}
      <div className={`min-h-[38px] flex items-center px-3 py-2 rounded-lg border transition-all
        ${selectedItem
          ? 'bg-amber-950/20 border-amber-900/50'
          : 'bg-slate-900/40 border-slate-800'}`}
      >
        {selectedItem ? (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 uppercase">
                {selectedItem.type}
              </span>
              <span className="text-xs font-mono text-amber-400">{selectedItem.id}</span>
              {(selectedEdge?.dropped || selectedNode?.dropped) && (
                <span className="text-[10px] text-red-500 bg-red-950/40 border border-red-900/40 px-1.5 py-0.5 rounded">
                  DROPPED
                </span>
              )}
            </div>
            <button
              onClick={() => setSelectedItem(null)}
              className="text-slate-600 hover:text-slate-300 text-sm ml-2 leading-none"
            >✕</button>
          </div>
        ) : (
          <p className="text-[11px] text-slate-600">
            Click a node or link on the canvas to select it
          </p>
        )}
      </div>

      {/* Fault Injection Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          id="btn-drop-link"
          onClick={() => run(() => injectFault('edge', selectedEdge.id))}
          disabled={!canDropEdge || busy}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border
            bg-red-950/30 border-red-900/60 text-red-400 text-xs font-medium
            hover:bg-red-900/50 hover:border-red-700
            disabled:opacity-25 disabled:cursor-not-allowed
            transition-all duration-150"
        >
          <span>⛓</span> Drop Link
        </button>
        <button
          id="btn-drop-node"
          onClick={() => run(() => injectFault('node', selectedNode.id))}
          disabled={!canDropNode || busy}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border
            bg-red-950/30 border-red-900/60 text-red-400 text-xs font-medium
            hover:bg-red-900/50 hover:border-red-700
            disabled:opacity-25 disabled:cursor-not-allowed
            transition-all duration-150"
        >
          <span>📡</span> Drop Node
        </button>
      </div>

      {/* Utility Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          id="btn-reanalyze"
          onClick={() => run(analyzeNetwork)}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border
            bg-cyan-950/30 border-cyan-900/60 text-cyan-400 text-xs font-medium
            hover:bg-cyan-900/40 hover:border-cyan-700
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-150"
        >
          {busy
            ? <span className="inline-block w-3 h-3 border border-cyan-500 border-t-transparent rounded-full animate-spin" />
            : '⟳'
          }
          Re-analyze
        </button>
        <button
          id="btn-reset"
          onClick={() => run(resetNetwork)}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border
            bg-slate-800/60 border-slate-700 text-slate-300 text-xs font-medium
            hover:bg-slate-700/60 hover:border-slate-600
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-150"
        >
          ↺ Reset Network
        </button>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
        {[
          { color: 'bg-cyan-400',   label: 'Uncongested'          },
          { color: 'bg-lime-400',   label: 'Balanced'             },
          { color: 'bg-orange-400', label: 'Mod. Congested'       },
          { color: 'bg-red-500',    label: 'Highly Congested'     },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
            <span className="text-[10px] text-slate-600">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
