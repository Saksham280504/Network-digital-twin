'use client';

import { useNetwork } from '../context/NetworkContext';

const STATUS_CFG = {
  'Highly Congested':     { text: 'text-red-400',    bg: 'bg-red-950/40',    border: 'border-red-900',    dot: 'bg-red-500'    },
  'Moderately Congested': { text: 'text-orange-400', bg: 'bg-orange-950/40', border: 'border-orange-900', dot: 'bg-orange-500' },
  'Balanced':             { text: 'text-lime-400',   bg: 'bg-lime-950/40',   border: 'border-lime-900',   dot: 'bg-lime-500'   },
  'Uncongested':          { text: 'text-cyan-400',   bg: 'bg-cyan-950/40',   border: 'border-cyan-900',   dot: 'bg-cyan-500'   },
  'Unknown':              { text: 'text-slate-400',  bg: 'bg-slate-900/40',  border: 'border-slate-800',  dot: 'bg-slate-500'  },
  'DROPPED':              { text: 'text-red-500',    bg: 'bg-red-950/20',    border: 'border-red-900/50', dot: 'bg-red-700'    },
};

function StatusDot({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.Unknown;
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${cfg.dot} flex-shrink-0`} />
  );
}

export default function MetricsPanel() {
  const { networkData, predictions, activePath, lastAnalyzed } = useNetwork();

  const getPred = (edgeId) => predictions.find(p => p.edge_id === edgeId);

  // Summary counts
  const counts = predictions.reduce((acc, p) => {
    acc[p.congestion_status] = (acc[p.congestion_status] || 0) + 1;
    return acc;
  }, {});

  const droppedEdges  = networkData.edges.filter(e => e.dropped).length;
  const droppedNodes  = networkData.nodes.filter(n => n.dropped).length;
  const noPath        = activePath.totalCost === Infinity;

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">

      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800/70 flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Network Metrics</span>
        {lastAnalyzed && (
          <span className="text-[10px] text-slate-600 font-mono">
            {lastAnalyzed.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Summary Badges */}
      {predictions.length > 0 && (
        <div className="px-4 pt-3 pb-2 flex-shrink-0">
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(STATUS_CFG)
              .filter(([key]) => counts[key])
              .map(([status]) => {
                const cfg = STATUS_CFG[status];
                return (
                  <div key={status} className={`p-2 rounded-lg border ${cfg.bg} ${cfg.border}`}>
                    <div className={`text-lg font-bold leading-none ${cfg.text}`}>{counts[status]}</div>
                    <div className="text-[10px] text-slate-500 mt-1 leading-tight">{status}</div>
                  </div>
                );
              })}
            {droppedEdges > 0 && (
              <div className="p-2 rounded-lg border bg-red-950/20 border-red-900/40">
                <div className="text-lg font-bold leading-none text-red-600">{droppedEdges}</div>
                <div className="text-[10px] text-slate-500 mt-1">Links Dropped</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active Route */}
      <div className="px-4 pt-2 pb-3 border-b border-slate-800/70 flex-shrink-0">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
          Active Route (R1 → R10)
        </div>
        {noPath ? (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <span>⚠</span>
            <span>No path — network partitioned</span>
          </div>
        ) : activePath.path?.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {activePath.path.map((nodeId, i) => (
              <span key={nodeId} className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 bg-cyan-950/60 border border-cyan-800/50 text-cyan-300 text-[10px] font-mono rounded">
                  {nodeId}
                </span>
                {i < activePath.path.length - 1 && (
                  <span className="text-slate-700 text-[10px]">›</span>
                )}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-slate-600">Run analysis to compute path</span>
        )}
        {activePath.totalCost > 0 && !noPath && (
          <div className="mt-1 text-[10px] text-slate-600">
            PBR cost: <span className="font-mono text-slate-500">{activePath.totalCost}</span>
          </div>
        )}
      </div>

      {/* Edge List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 pt-3 pb-1 sticky top-0 bg-gray-950 z-10">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
            Link Status ({networkData.edges.length} links)
          </span>
        </div>
        <div className="px-3 pb-4 space-y-1.5">
          {networkData.edges.map(edge => {
            const pred   = getPred(edge.id);
            const status = edge.dropped ? 'DROPPED' : (pred?.congestion_status || 'Unknown');
            const cfg    = STATUS_CFG[status] || STATUS_CFG.Unknown;
            const isInPath = activePath.edgePath?.includes(edge.id);

            return (
              <div
                key={edge.id}
                className={`p-2 rounded-lg border transition-all ${cfg.bg} ${cfg.border}
                  ${isInPath ? 'ring-1 ring-cyan-700/40' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-slate-300">
                    {edge.source} <span className="text-slate-600">→</span> {edge.target}
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <StatusDot status={status} />
                    <span className={`text-[10px] font-medium ${cfg.text}`}>{status}</span>
                  </div>
                </div>
                {!edge.dropped && (
                  <div className="flex gap-3 mt-1">
                    <span className="text-[10px] text-slate-600">
                      <span className="text-slate-500">{edge.throughput_mbps}</span> Mbps
                    </span>
                    <span className="text-[10px] text-slate-600">
                      <span className="text-slate-500">{edge.delay_ms}</span> ms
                    </span>
                    {pred && (
                      <span className="text-[10px] text-slate-600">
                        <span className="text-slate-500">{(pred.probability * 100).toFixed(0)}</span>% conf.
                      </span>
                    )}
                    {isInPath && (
                      <span className="text-[10px] text-cyan-600 ml-auto">● active path</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
