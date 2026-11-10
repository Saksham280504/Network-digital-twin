'use client';

import { useState } from 'react';
import { useNetwork } from '../context/NetworkContext';

const THRESHOLDS = [
  { min: 0.80, status: 'Highly Congested',     text: 'text-red-400',    dot: 'bg-red-500'    },
  { min: 0.55, status: 'Moderately Congested', text: 'text-orange-400', dot: 'bg-orange-500' },
  { min: 0.25, status: 'Balanced',             text: 'text-lime-400',   dot: 'bg-lime-500'   },
  { min: 0.00, status: 'Uncongested',          text: 'text-cyan-400',   dot: 'bg-cyan-500'   },
];

function classifyRatio(ratio) {
  const r = Math.max(0, Math.min(1, ratio));
  return THRESHOLDS.find(t => r >= t.min) || THRESHOLDS[3];
}

const STATUS_CFG = {
  'Highly Congested':     { text: 'text-red-300',    bg: 'bg-gradient-to-br from-red-950/55 to-slate-950/90',    border: 'border-red-800/60',    dot: 'bg-red-500 shadow-[0_0_8px_#ef4444]'    },
  'Moderately Congested': { text: 'text-orange-300', bg: 'bg-gradient-to-br from-orange-950/50 to-slate-950/90', border: 'border-orange-800/60', dot: 'bg-orange-500 shadow-[0_0_8px_#f97316]' },
  'Balanced':             { text: 'text-lime-300',   bg: 'bg-gradient-to-br from-lime-950/45 to-slate-950/90',   border: 'border-lime-800/60',   dot: 'bg-lime-400 shadow-[0_0_8px_#84cc16]'   },
  'Uncongested':          { text: 'text-cyan-300',   bg: 'bg-gradient-to-br from-cyan-950/45 to-slate-950/90',   border: 'border-cyan-800/60',   dot: 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]'   },
  'Unknown':              { text: 'text-slate-400',  bg: 'bg-slate-900/50',                                      border: 'border-slate-800',     dot: 'bg-slate-500'                           },
  'DROPPED':              { text: 'text-red-400',    bg: 'bg-red-950/25',                                        border: 'border-red-900/50',    dot: 'bg-red-700'                             },
};

const MODEL_LABELS = {
  mpnn:                'Graph MPNN',
  xgboost:             'XGBoost',
  lightgbm:            'LightGBM',
  random_forest:       'Rand. Forest',
  logistic_regression: 'Logistic Reg.',
};

function StatusDot({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.Unknown;
  return <span className={`inline-block w-2 h-2 rounded-full ${cfg.dot} flex-shrink-0`} />;
}

// ═══════════════════════════════════════════════════════════════
// Vertex PBR Inspector (Paper Section IV-F, Page 9)
// ═══════════════════════════════════════════════════════════════
function VertexInspector({ node, split, routeSource, routeTarget, onSetEndpoint }) {
  if (!node) return null;

  return (
    <div className="mx-4 mt-3 p-4 rounded-xl ndt-card space-y-3 flex-shrink-0">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">
          Router PBR Inspector (Sec. IV-F)
        </span>
        <span className="px-2 py-0.5 rounded-md bg-amber-950/60 border border-amber-700/60 text-xs font-mono text-amber-300 font-bold">
          {node.id}
        </span>
      </div>

      {split && (
        <>
          <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
            <div className="p-2 rounded-lg bg-cyan-950/40 border border-cyan-800/50">
              <div className="font-mono font-bold text-sm text-cyan-300">{split.Eu}</div>
              <div className="text-slate-400 mt-0.5">E_u</div>
            </div>
            <div className="p-2 rounded-lg bg-lime-950/40 border border-lime-800/50">
              <div className="font-mono font-bold text-sm text-lime-300">{split.Eb}</div>
              <div className="text-slate-400 mt-0.5">E_b</div>
            </div>
            <div className="p-2 rounded-lg bg-orange-950/40 border border-orange-800/50">
              <div className="font-mono font-bold text-sm text-orange-300">{split.Em}</div>
              <div className="text-slate-400 mt-0.5">E_m</div>
            </div>
            <div className="p-2 rounded-lg bg-red-950/40 border border-red-800/50">
              <div className="font-mono font-bold text-sm text-red-300">{split.Eh}</div>
              <div className="text-slate-400 mt-0.5">E_h</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-1.5 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-400">Degree Constraint (2 ≤ deg ≤ 9):</span>
              <span className={split.degreeConstraintOk ? 'text-emerald-400 font-mono font-semibold' : 'text-amber-400 font-mono font-semibold'}>
                deg({node.id}) = {split.Etotal} {split.degreeConstraintOk ? '✓' : '⚠'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Traffic Rerouting Split (≤50% cap):</span>
              <span className="font-mono font-bold text-cyan-300">{split.reroutePercentage}%</span>
            </div>
            <div className="text-slate-400 text-[10px] leading-relaxed pt-1 border-t border-slate-800/70">
              {split.reason}
            </div>
          </div>
        </>
      )}

      {/* Set Route Source / Destination buttons in View Mode */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => onSetEndpoint(node.id, routeTarget)}
          disabled={routeSource === node.id || node.dropped}
          className={`px-3 py-2 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
            routeSource === node.id
              ? 'bg-cyan-950/70 border-cyan-600 text-cyan-200'
              : 'bg-slate-900/80 border-slate-700/80 text-slate-300 hover:border-cyan-600 hover:text-cyan-300'
          }`}
        >
          {routeSource === node.id ? '✓ Source (SRC)' : 'Set as Source'}
        </button>
        <button
          onClick={() => onSetEndpoint(routeSource, node.id)}
          disabled={routeTarget === node.id || node.dropped}
          className={`px-3 py-2 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
            routeTarget === node.id
              ? 'bg-orange-950/70 border-orange-600 text-orange-200'
              : 'bg-slate-900/80 border-slate-700/80 text-slate-300 hover:border-orange-600 hover:text-orange-300'
          }`}
        >
          {routeTarget === node.id ? '✓ Destination (DST)' : 'Set as Dest'}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Edge Editor — inline sliders + 5-Model Live Vote Breakdown
// ═══════════════════════════════════════════════════════════════
function EdgeEditor({ edge, prediction }) {
  const { updateEdge, activeModel, switchModel } = useNetwork();
  const [throughput, setThroughput] = useState(edge.throughput_mbps);
  const [capacity, setCapacity]     = useState(edge.capacity_mbps);
  const [delay, setDelay]           = useState(edge.delay_ms);
  const [applying, setApplying]     = useState(false);

  const edgeId = edge.id;
  const [trackedProps, setTrackedProps] = useState(
    `${edge.id}:${edge.throughput_mbps}:${edge.capacity_mbps}:${edge.delay_ms}`
  );
  const currentKey = `${edge.id}:${edge.throughput_mbps}:${edge.capacity_mbps}:${edge.delay_ms}`;
  if (currentKey !== trackedProps) {
    setTrackedProps(currentKey);
    setThroughput(edge.throughput_mbps);
    setCapacity(edge.capacity_mbps);
    setDelay(edge.delay_ms);
  }

  const ratio = capacity > 0 ? throughput / capacity : 0;
  const preview = classifyRatio(ratio);
  const pct = Math.round(ratio * 100);

  const hasChanges =
    throughput !== edge.throughput_mbps ||
    capacity !== edge.capacity_mbps ||
    delay !== edge.delay_ms;

  const handleApply = async () => {
    setApplying(true);
    try {
      await updateEdge(edgeId, {
        throughput_mbps: throughput,
        capacity_mbps: capacity,
        delay_ms: delay,
      });
    } finally {
      setApplying(false);
    }
  };

  const votes = prediction?.all_model_votes;

  return (
    <div className="mx-4 mt-3 p-4 rounded-xl ndt-card space-y-3 flex-shrink-0">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">
          Edit Link & Model Votes
        </span>
        <span className="px-2 py-0.5 rounded-md bg-amber-950/60 border border-amber-700/60 text-[11px] font-mono text-amber-300 font-bold">
          {edgeId}
        </span>
      </div>

      {/* Throughput slider */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-slate-400">Throughput</span>
          <span className="text-slate-200 font-mono font-semibold">{throughput} Mbps</span>
        </div>
        <input
          type="range" min="0" max={capacity * 1.15 || 2000} step="10"
          value={throughput}
          onChange={(e) => setThroughput(Number(e.target.value))}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
        />
      </div>

      {/* Capacity & Delay sliders in 2 columns */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-400">Capacity</span>
            <span className="text-slate-200 font-mono font-semibold">{capacity}M</span>
          </div>
          <input
            type="range" min="100" max="2000" step="50"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-400">Delay</span>
            <span className="text-slate-200 font-mono font-semibold">{delay} ms</span>
          </div>
          <input
            type="range" min="0.5" max="80" step="0.5"
            value={delay}
            onChange={(e) => setDelay(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
        </div>
      </div>

      {/* Utilization bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-slate-400">Local Utilization ({pct}%)</span>
          <span className={`font-semibold ${preview.text}`}>{preview.status}</span>
        </div>
        <div className="h-2 bg-slate-800/90 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{
              width: `${Math.min(100, pct)}%`,
              backgroundColor: pct >= 80 ? '#ef4444' : pct >= 55 ? '#f97316' : pct >= 25 ? '#84cc16' : '#22d3ee'
            }}
          />
        </div>
      </div>

      <button
        onClick={handleApply}
        disabled={!hasChanges || applying}
        className="w-full flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border
          bg-cyan-950/60 border-cyan-700/70 text-cyan-200 text-xs font-semibold
          hover:bg-cyan-900/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
      >
        {applying ? 'Applying…' : '⟳ Apply & Re-Run 5 Models'}
      </button>

      {/* 5-Model Votes on this specific edge */}
      {votes && (
        <div className="pt-2.5 border-t border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400 font-bold">
            <span>Model Predictions on {edgeId}</span>
            {prediction.disagreement && (
              <span className="text-amber-300 font-mono">Δ Models Disagree</span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {Object.entries(MODEL_LABELS).map(([mKey, mLabel]) => {
              const v = votes[mKey];
              if (!v) return null;
              const cfg = STATUS_CFG[v.congestion_status] || STATUS_CFG.Unknown;
              const isAct = activeModel === mKey;
              return (
                <div
                  key={mKey}
                  onClick={() => switchModel(mKey)}
                  className={`px-3 py-1.5 rounded-lg flex items-center justify-between text-[11px] cursor-pointer border transition-all ${
                    isAct
                      ? 'bg-cyan-950/40 border-cyan-600/70 shadow-sm'
                      : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <span className={`font-medium ${isAct ? 'text-cyan-200 font-bold' : 'text-slate-300'}`}>
                    {mLabel}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`${cfg.text} font-semibold`}>
                      {v.congestion_status.replace('Moderately ', 'Mod. ')}
                    </span>
                    <span className="font-mono text-slate-400 text-[10px]">
                      {(v.probability * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main MetricsPanel
// ═══════════════════════════════════════════════════════════════
export default function MetricsPanel() {
  const {
    networkData,
    predictions,
    activePath,
    ospfPath,
    secondaryPath,
    vertexSplits,
    benchmarkMetrics,
    lastAnalyzed,
    selectedItem,
    setSelectedItem,
    routeSource,
    routeTarget,
    analyzeNetwork,
  } = useNetwork();

  const getPred = (edgeId) => predictions.find(p => p.edge_id === edgeId);

  const selectedEdge = selectedItem?.type === 'edge'
    ? networkData.edges.find(e => e.id === selectedItem.id) : null;
  const selectedNode = selectedItem?.type === 'node'
    ? networkData.nodes.find(n => n.id === selectedItem.id) : null;

  const counts = predictions.reduce((acc, p) => {
    acc[p.congestion_status] = (acc[p.congestion_status] || 0) + 1;
    return acc;
  }, {});

  const noPath = activePath.totalCost === Infinity;
  const imp = benchmarkMetrics?.improvements;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Sidebar Section Header */}
      <div className="px-5 py-3.5 border-b border-slate-800/80 bg-slate-900/35 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            NDT Telemetry & PBR Metrics
          </span>
        </div>
        {lastAnalyzed && (
          <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] text-slate-400 font-mono">
            {lastAnalyzed.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0 pb-4">

        {/* Selected Node Inspector (Paper Section IV-F) */}
        {selectedNode && (
          <VertexInspector
            node={selectedNode}
            split={vertexSplits?.[selectedNode.id]}
            routeSource={routeSource}
            routeTarget={routeTarget}
            onSetEndpoint={(src, tgt) => analyzeNetwork(src, tgt)}
          />
        )}

        {/* Selected Edge Editor + 5-Model Vote Breakdown */}
        {selectedEdge && !selectedEdge.dropped && (
          <EdgeEditor edge={selectedEdge} prediction={getPred(selectedEdge.id)} />
        )}

        {/* Paper Benchmark KPI Card: Predictive NDT PBR vs Static MPLS/OSPF */}
        {benchmarkMetrics && imp && (
          <div className="mx-4 mt-3.5 p-3.5 rounded-xl ndt-card space-y-2.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-bold text-slate-300 uppercase tracking-wider">
                NDT PBR vs. Static MPLS (OSPF)
              </span>
              <span className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/50 font-mono text-[10px] text-cyan-300">
                W_e: {benchmarkMetrics.ndtPbr.computationalCostWe} vs {benchmarkMetrics.mplsOspf.computationalCostWe}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800/90">
                <div className="text-xs font-bold font-mono text-emerald-400">
                  {imp.delayReductionPct >= 0 ? `-${imp.delayReductionPct}%` : `+${Math.abs(imp.delayReductionPct)}%`}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">Delay</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800/90">
                <div className="text-xs font-bold font-mono text-cyan-400">
                  {imp.congestionReductionPct >= 0 ? `-${imp.congestionReductionPct}%` : `+${Math.abs(imp.congestionReductionPct)}%`}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">Congestion</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800/90">
                <div className="text-xs font-bold font-mono text-violet-400">
                  +{Math.max(0, imp.fileTransferRateGainPct)}%
                </div>
                <div className="text-[10px] text-slate-400 mt-1">Transfer Rate</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800/90">
                <div className="text-xs font-bold font-mono text-amber-400">
                  {benchmarkMetrics.ndtPbr.energyJoulesPerGb}J
                </div>
                <div className="text-[10px] text-slate-400 mt-1">IoT Energy/Gb</div>
              </div>
            </div>
          </div>
        )}

        {/* 4-Class Summary Badges */}
        {predictions.length > 0 && (
          <div className="mx-4 mt-3 grid grid-cols-4 gap-2 text-center">
            {['Uncongested', 'Balanced', 'Moderately Congested', 'Highly Congested'].map(status => {
              const cfg = STATUS_CFG[status];
              return (
                <div key={status} className={`p-2.5 rounded-xl border ${cfg.bg} ${cfg.border} shadow-sm`}>
                  <div className={`text-base font-bold leading-none ${cfg.text}`}>{counts[status] || 0}</div>
                  <div className="text-[10px] text-slate-300/90 mt-1.5 truncate font-medium">
                    {status.replace('Moderately ', 'Mod. ').replace('Highly ', 'High ')}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Active PBR Route vs OSPF Baseline Card */}
        <div className="mx-4 mt-3 p-3.5 rounded-xl ndt-card space-y-3">
          <div>
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-2">
              <span>NDT Predictive PBR ({routeSource || '?'} → {routeTarget || '?'})</span>
              {!noPath && (
                <span className="px-2 py-0.5 rounded bg-cyan-950/70 border border-cyan-800/60 font-mono text-cyan-300">
                  {benchmarkMetrics?.ndtPbr?.delayMs ?? activePath.totalCost} ms
                </span>
              )}
            </div>
            {noPath ? (
              <div className="flex items-center gap-2 text-xs text-red-400 py-1">
                <span>⚠</span>
                <span>No path — network partitioned</span>
              </div>
            ) : activePath.path?.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {activePath.path.map((nodeId, i) => (
                  <span key={nodeId} className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 bg-cyan-950/70 border border-cyan-700/60 text-cyan-200 text-[11px] font-mono font-semibold rounded-md">
                      {nodeId}
                    </span>
                    {i < activePath.path.length - 1 && (
                      <span className="text-slate-600 text-xs">›</span>
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-slate-500">Run analysis to compute path</span>
            )}
          </div>

          {/* Static OSPF Route comparison */}
          {ospfPath?.path?.length > 0 && (
            <div className="pt-2.5 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
                <span className="font-medium">Static MPLS/OSPF Route:</span>
                <span className="px-2 py-0.5 rounded bg-rose-950/50 border border-rose-800/50 font-mono text-rose-300">
                  {benchmarkMetrics?.mplsOspf?.delayMs ?? ospfPath.totalCost} ms
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {ospfPath.path.map((nodeId, i) => (
                  <span key={nodeId} className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 bg-rose-950/40 border border-rose-800/50 text-rose-200 text-[11px] font-mono rounded-md">
                      {nodeId}
                    </span>
                    {i < ospfPath.path.length - 1 && (
                      <span className="text-slate-600 text-xs">›</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Secondary 50%-Split Path */}
          {secondaryPath?.path?.length > 0 && JSON.stringify(secondaryPath.path) !== JSON.stringify(activePath.path) && (
            <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
              <span className="font-medium">50% Split Backup:</span>
              <span className="font-mono text-purple-300 font-semibold">{secondaryPath.path.join(' › ')}</span>
            </div>
          )}
        </div>

        {/* Edge List Section */}
        <div className="mt-4 px-4">
          <div className="flex items-center justify-between mb-2.5 px-1">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              Link Status ({networkData.edges.length} links)
            </span>
            <span className="text-[10px] text-slate-500">Click any link to inspect</span>
          </div>
          <div className="space-y-2">
            {networkData.edges.map(edge => {
              const pred     = getPred(edge.id);
              const status   = edge.dropped ? 'DROPPED' : (pred?.congestion_status || 'Unknown');
              const cfg      = STATUS_CFG[status] || STATUS_CFG.Unknown;
              const isInPath = activePath.edgePath?.includes(edge.id);
              const isSelected = selectedItem?.type === 'edge' && selectedItem?.id === edge.id;

              return (
                <div
                  key={edge.id}
                  onClick={() => setSelectedItem({ type: 'edge', id: edge.id })}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${cfg.bg} ${cfg.border}
                    ${isSelected
                      ? 'ring-2 ring-amber-400 shadow-[0_0_16px_-3px_rgba(251,191,36,0.35)]'
                      : isInPath
                      ? 'ring-1 ring-cyan-400/60 shadow-[0_0_14px_-4px_rgba(34,211,238,0.3)]'
                      : 'hover:border-slate-600'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-white font-bold">
                        {edge.source} <span className="text-slate-500">→</span> {edge.target}
                      </span>
                      {pred?.disagreement && !edge.dropped && (
                        <span
                          title="The 5 ML models disagree on this link"
                          className="px-1.5 py-0.5 rounded-md bg-amber-950/90 border border-amber-600/70 text-amber-300 text-[10px] font-mono font-bold"
                        >
                          Δ Split
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StatusDot status={status} />
                      <span className={`text-[11px] font-semibold ${cfg.text}`}>{status}</span>
                    </div>
                  </div>
                  {!edge.dropped && (
                    <div className="flex items-center gap-3 mt-2 pt-1.5 border-t border-white/5 text-[11px] text-slate-400 font-mono">
                      <span>{edge.throughput_mbps}/{edge.capacity_mbps} Mbps</span>
                      <span>•</span>
                      <span>{edge.delay_ms} ms</span>
                      {pred && (
                        <>
                          <span>•</span>
                          <span>{(pred.probability * 100).toFixed(0)}% conf</span>
                        </>
                      )}
                      {isInPath && (
                        <span className="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-700/60 text-cyan-300 text-[10px] ml-auto font-sans font-semibold">
                          ● PBR Active
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
