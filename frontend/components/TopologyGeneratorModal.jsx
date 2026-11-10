'use client';

import { useState, useEffect } from 'react';
import { useNetwork } from '../context/NetworkContext';

const GRAPH_MODELS = [
  {
    key: 'ba',
    name: 'Barabási–Albert (BA)',
    subtitle: 'Scale-Free Preferential Attachment',
    badge: 'Best in Paper (-74.5% Delay)',
    desc: 'New routers connect preferentially to high-degree core hub routers. Produces short average path lengths and resilient core-hub backbones.',
  },
  {
    key: 'er',
    name: 'Erdős–Rényi (ER)',
    subtitle: 'Uniform Random Graph G(n, p)',
    badge: 'Max Path Diversity (-71.4% Cong.)',
    desc: 'Edges form with uniform independent probability p while enforcing 2 ≤ deg(v) ≤ 9. Generates the highest number of alternative routing paths.',
  },
  {
    key: 'ws',
    name: 'Watts–Strogatz (WS)',
    subtitle: 'Small-World Ring Lattice',
    badge: 'Local Clustering',
    desc: 'Starts with a structured ring lattice and stochastically rewires links with probability p, modeling regional metro rings with fewer redundant shortcuts.',
  },
];

const METRIC_TABS = [
  { key: 'delayMs',             label: 'End-to-End Delay (ms)',         unit: 'ms',    lowerBetter: true  },
  { key: 'congestionPct',       label: 'Path Congestion (%)',           unit: '%',     lowerBetter: true  },
  { key: 'transferRateMBps',    label: 'File Transfer Rate (MB/s)',     unit: 'MB/s',  lowerBetter: false },
  { key: 'computationalCostWe', label: 'Computational Cost (W_e)',      unit: 'W_e',   lowerBetter: true  },
  { key: 'energyJoulesPerGb',   label: 'IoT Energy Efficiency (J/Gb)', unit: 'J/Gb',  lowerBetter: true  },
];

/**
 * Pure SVG Multi-Line Chart for Stepwise Simulation (Paper Fig. 9, 11, 13, 15)
 */
function StepwiseChart({ steps, metricKey, unit }) {
  if (!steps || steps.length === 0) return null;

  const W = 680;
  const H = 230;
  const PAD_L = 52;
  const PAD_R = 24;
  const PAD_T = 22;
  const PAD_B = 36;

  const seriesCfg = [
    { id: 'mpnn',                label: 'Graph MPNN PBR',      color: '#22d3ee', dashed: false },
    { id: 'xgboost',             label: 'XGBoost PBR',         color: '#a855f7', dashed: false },
    { id: 'logistic_regression', label: 'Logistic Reg. PBR',   color: '#eab308', dashed: true  },
    { id: 'ospf',                label: 'Static MPLS (OSPF)',  color: '#f43f5e', dashed: true  },
  ];

  const allVals = [];
  steps.forEach(s => {
    seriesCfg.forEach(sc => {
      const v = s[sc.id]?.[metricKey];
      if (typeof v === 'number') allVals.push(v);
    });
  });

  const minV = Math.min(0, ...allVals);
  const maxV = Math.max(...allVals, minV + 1) * 1.08;

  const toX = (idx) => PAD_L + (idx / Math.max(1, steps.length - 1)) * (W - PAD_L - PAD_R);
  const toY = (val) => PAD_T + (1 - (val - minV) / (maxV - minV)) * (H - PAD_T - PAD_B);

  return (
    <div className="p-4 rounded-xl bg-gray-950 border border-slate-800 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-white">
          Stepwise File Escalation: F_n = F_(n-1) + ΔF (ΔF = 140.4 KB)
        </span>
        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          {seriesCfg.map(sc => (
            <span key={sc.id} className="flex items-center gap-1.5 text-slate-300">
              <span
                className="w-3 h-0.5 inline-block"
                style={{
                  backgroundColor: sc.color,
                  borderBottom: sc.dashed ? `2px dashed ${sc.color}` : 'none',
                }}
              />
              {sc.label}
            </span>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-56 overflow-visible">
        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => {
          const val = minV + t * (maxV - minV);
          const y = toY(val);
          return (
            <g key={t}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#1e293b" strokeWidth="1" />
              <text x={PAD_L - 8} y={y + 3} textAnchor="end" fill="#64748b" fontSize="9" fontFamily="monospace">
                {val.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {steps.map((s, idx) => {
          const x = toX(idx);
          return (
            <text
              key={s.step}
              x={x}
              y={H - 10}
              textAnchor="middle"
              fill="#64748b"
              fontSize="9"
              fontFamily="monospace"
            >
              {s.fileSizeMB}MB
            </text>
          );
        })}

        {/* Lines & points */}
        {seriesCfg.map(sc => {
          const pts = steps.map((s, idx) => `${toX(idx)},${toY(s[sc.id]?.[metricKey] || 0)}`).join(' ');
          return (
            <g key={sc.id}>
              <polyline
                fill="none"
                stroke={sc.color}
                strokeWidth={sc.id === 'mpnn' ? '2.6' : '2'}
                strokeDasharray={sc.dashed ? '5,4' : undefined}
                points={pts}
              />
              {steps.map((s, idx) => {
                const val = s[sc.id]?.[metricKey] || 0;
                return (
                  <circle
                    key={idx}
                    cx={toX(idx)}
                    cy={toY(val)}
                    r={sc.id === 'mpnn' ? 3.5 : 2.5}
                    fill={sc.color}
                  >
                    <title>{`${sc.label} (Step ${s.step}: ${s.fileSizeMB} MB): ${val} ${unit}`}</title>
                  </circle>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function TopologyGeneratorModal() {
  const {
    activeModal,
    setActiveModal,
    generateTopology,
    topologySummary,
    triggerStepwiseSimulation,
    stepwiseData,
    isSimulating,
    isLoading,
    loadDefaultTopology,
  } = useNetwork();

  const [selectedGraphModel, setSelectedGraphModel] = useState('ba');
  const [numNodes, setNumNodes] = useState(10);
  const [loadFactor, setLoadFactor] = useState(0.68);
  const [simMetric, setSimMetric] = useState('delayMs');

  // Auto-run stepwise simulation when opening the simulator modal for the first time
  useEffect(() => {
    if (activeModal === 'simulator' && !stepwiseData && !isSimulating) {
      triggerStepwiseSimulation();
    }
  }, [activeModal, stepwiseData, isSimulating, triggerStepwiseSimulation]);

  if (activeModal !== 'generator' && activeModal !== 'simulator') return null;

  const handleGenerate = async () => {
    await generateTopology(selectedGraphModel, numNodes, loadFactor);
    setActiveModal(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl bg-gray-950 border border-slate-800 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/40 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveModal('generator')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeModal === 'generator'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🌐 Paper Graph Generators (ER / BA / WS)
            </button>
            <button
              onClick={() => setActiveModal('simulator')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeModal === 'simulator'
                  ? 'bg-violet-950 text-violet-300 border border-violet-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📈 Stepwise Traffic Escalation Simulator (ΔF)
            </button>
          </div>
          <button
            onClick={() => setActiveModal(null)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-xs font-medium"
          >
            ✕ Close
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ── MODE A: GRAPH GENERATOR ── */}
          {activeModal === 'generator' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Algorithmic Telecom & IoT Topology Generator (Section IV-A of NDT.pdf)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Generates mathematically constrained topologies enforcing router physical interface limits
                  (<span className="font-mono text-cyan-300">2 ≤ deg(v) ≤ 9</span>) and MPLS WAN/LAN hierarchy
                  (<span className="font-mono text-slate-300">V_PE = max(2, ⌊V_P/5⌋ + 1)</span>).
                </p>
              </div>

              {/* 3 Graph Model Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {GRAPH_MODELS.map(gm => {
                  const isSel = selectedGraphModel === gm.key;
                  return (
                    <div
                      key={gm.key}
                      onClick={() => setSelectedGraphModel(gm.key)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all space-y-2 ${
                        isSel
                          ? 'bg-cyan-950/25 border-cyan-500 shadow-lg shadow-cyan-950/30'
                          : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">{gm.name}</span>
                        <span className="px-2 py-0.5 text-[9px] font-mono rounded bg-slate-800 text-cyan-300">
                          {gm.badge}
                        </span>
                      </div>
                      <div className="text-[11px] font-medium text-cyan-400">{gm.subtitle}</div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{gm.desc}</p>
                    </div>
                  );
                })}
              </div>

              {/* Router Scale & Traffic Load Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-xl bg-slate-900/40 border border-slate-800">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-semibold">Provider (P) Core Routers</span>
                    <span className="font-mono text-cyan-400 font-bold">{numNodes} Routers</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[5, 10, 15, 20].map(n => (
                      <button
                        key={n}
                        onClick={() => setNumNodes(n)}
                        className={`py-2 rounded-lg text-xs font-mono font-semibold border transition-all ${
                          numNodes === n
                            ? 'bg-cyan-950 border-cyan-600 text-cyan-300'
                            : 'bg-gray-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {n} P-Routers
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Paper Table I evaluates 5, 10, and 15 P-router topologies; 20 routers tests large-scale B5G/IoT mesh scaling.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-semibold">Initial Traffic Load Multiplier</span>
                    <span className="font-mono text-amber-400 font-bold">{Math.round(loadFactor * 100)}% Load</span>
                  </div>
                  <input
                    type="range"
                    min="0.25"
                    max="1.05"
                    step="0.05"
                    value={loadFactor}
                    onChange={(e) => setLoadFactor(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>25% (Light IoT)</span>
                    <span>65% (Mixed Load)</span>
                    <span>105% (Heavy Stress)</span>
                  </div>
                </div>
              </div>

              {/* Current Topology Structural Summary vs Paper Table I */}
              {topologySummary && (
                <div className="p-4 rounded-xl bg-slate-900/30 border border-slate-800 space-y-3">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Active Network Structural Telemetry (Paper Table I & Section V)
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-center">
                    {[
                      { label: 'P Core Routers', val: topologySummary.pRouters },
                      { label: 'PE Edge Routers', val: topologySummary.peRouters },
                      { label: 'CE Routers', val: topologySummary.ceRouters },
                      { label: 'IoT/LAN Hosts', val: topologySummary.iotHosts },
                      { label: 'Active Links', val: topologySummary.totalEdges },
                      { label: 'Simple Paths', val: topologySummary.simplePaths ?? '-' },
                      { label: 'Avg Hop Length', val: topologySummary.avgPathLength ?? '-' },
                    ].map(item => (
                      <div key={item.label} className="p-2.5 rounded-lg bg-gray-950 border border-slate-800/80">
                        <div className="text-sm font-bold font-mono text-cyan-400">{item.val}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{item.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={async () => {
                    await loadDefaultTopology();
                    setActiveModal(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium"
                >
                  ↺ Restore Default 10-Node Topology
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={isLoading}
                  className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all"
                >
                  {isLoading ? 'Generating…' : `⚡ Generate ${selectedGraphModel.toUpperCase()} (${numNodes} Routers) & Analyze`}
                </button>
              </div>
            </div>
          )}

          {/* ── MODE B: STEPWISE TRAFFIC ESCALATION SIMULATOR ── */}
          {activeModal === 'simulator' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Dynamic File-Transfer Escalation Benchmark (Section IV-B & VII of NDT.pdf)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Simulates 10 progressive traffic iterations (<span className="font-mono text-cyan-300">F_n = F_(n-1) + 140,428 bytes</span>) comparing
                    Graph MPNN PBR, XGBoost PBR, Logistic Regression PBR, and Static MPLS (OSPF).
                  </p>
                </div>
                <button
                  onClick={triggerStepwiseSimulation}
                  disabled={isSimulating}
                  className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all"
                >
                  {isSimulating ? 'Running 10-Step Simulation…' : '⟳ Re-Run Stress-Test on Current Topology'}
                </button>
              </div>

              {/* Metric Picker Pills */}
              <div className="flex flex-wrap gap-2">
                {METRIC_TABS.map(m => (
                  <button
                    key={m.key}
                    onClick={() => setSimMetric(m.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      simMetric === m.key
                        ? 'bg-violet-950/80 border-violet-600 text-violet-300'
                        : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* SVG Line Chart */}
              {stepwiseData?.steps ? (
                <>
                  <StepwiseChart
                    steps={stepwiseData.steps}
                    metricKey={simMetric}
                    unit={METRIC_TABS.find(m => m.key === simMetric)?.unit || ''}
                  />

                  {/* Step-by-Step Comparison Table */}
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900/80 text-slate-400 border-b border-slate-800 text-[10px] uppercase">
                          <th className="py-2.5 px-3">Step</th>
                          <th className="py-2.5 px-3">File Size (F_n)</th>
                          <th className="py-2.5 px-3 text-right text-cyan-400">Graph MPNN PBR</th>
                          <th className="py-2.5 px-3 text-right text-purple-400">XGBoost PBR</th>
                          <th className="py-2.5 px-3 text-right text-amber-400">Logistic Reg. PBR</th>
                          <th className="py-2.5 px-3 text-right text-rose-400">Static MPLS (OSPF)</th>
                          <th className="py-2.5 px-3 text-right text-emerald-400">MPNN Gain vs. OSPF</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                        {stepwiseData.steps.map(s => {
                          const mInfo = METRIC_TABS.find(m => m.key === simMetric);
                          const vMpnn = s.mpnn?.[simMetric] ?? 0;
                          const vXgb  = s.xgboost?.[simMetric] ?? 0;
                          const vLr   = s.logistic_regression?.[simMetric] ?? 0;
                          const vOspf = s.ospf?.[simMetric] ?? 0;
                          const gainPct = vOspf > 0
                            ? mInfo?.lowerBetter
                              ? (((vOspf - vMpnn) / vOspf) * 100).toFixed(1)
                              : (((vMpnn - vOspf) / vOspf) * 100).toFixed(1)
                            : '0.0';
                          return (
                            <tr key={s.step} className="hover:bg-slate-900/40">
                              <td className="py-2 px-3 text-slate-400">#{s.step}</td>
                              <td className="py-2 px-3 text-white">{s.fileSizeMB} MB ({s.fileSizeKB} KB)</td>
                              <td className="py-2 px-3 text-right text-cyan-300 font-bold">{vMpnn} {mInfo?.unit}</td>
                              <td className="py-2 px-3 text-right text-purple-300">{vXgb} {mInfo?.unit}</td>
                              <td className="py-2 px-3 text-right text-amber-300">{vLr} {mInfo?.unit}</td>
                              <td className="py-2 px-3 text-right text-rose-300">{vOspf} {mInfo?.unit}</td>
                              <td className="py-2 px-3 text-right text-emerald-400 font-bold">
                                {Number(gainPct) >= 0 ? `+${gainPct}%` : `${gainPct}%`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-slate-500 text-sm">
                  Running stepwise traffic simulation…
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

