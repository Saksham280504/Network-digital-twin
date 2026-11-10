'use client';

import { useEffect, useState } from 'react';
import { NetworkProvider, useNetwork } from '../context/NetworkContext';
import NetworkCanvas from '../components/NetworkCanvas';
import MetricsPanel from '../components/MetricsPanel';
import ControlPanel from '../components/ControlPanel';
import BuildPanel from '../components/BuildPanel';
import ModelComparisonModal from '../components/ModelComparisonModal';
import TopologyGeneratorModal from '../components/TopologyGeneratorModal';

const MODEL_OPTIONS = [
  { key: 'mpnn',                label: 'Graph MPNN',   acc: '96.0%' },
  { key: 'xgboost',             label: 'XGBoost',      acc: '96.5%' },
  { key: 'lightgbm',            label: 'LightGBM',     acc: '96.4%' },
  { key: 'random_forest',       label: 'Rand. Forest', acc: '93.3%' },
  { key: 'logistic_regression', label: 'Logistic Reg', acc: '93.1%' },
];

function Dashboard() {
  const {
    loadNetwork,
    analyzeNetwork,
    isLoading,
    networkData,
    error,
    mode,
    enterBuildMode,
    activeModel,
    switchModel,
    modelSpecs,
    inferenceLatencyMs,
    engineMode,
    modelComparisonLive,
    setActiveModal,
  } = useNetwork();
  const [ready, setReady] = useState(false);

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
  const disagreeCount = modelComparisonLive?.disagreement_count || 0;

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden select-none">

      {/* ── Top Navigation Bar ── */}
      <header className="ndt-navbar flex-shrink-0 flex items-center justify-between px-6 xl:px-8 py-2.5 z-20 gap-6">

        {/* Left: Only the Network Digital Twin Logo (Vertically Centered) */}
        <div className="flex items-center gap-3.5 flex-shrink-0">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-950/70 border border-cyan-500/40 shadow-[0_0_20px_-4px_rgba(34,211,238,0.5)] flex-shrink-0">
            <div className="w-2.5 h-2.5 bg-cyan-400 rounded-full shadow-[0_0_10px_#22d3ee]" />
            <div className="w-2.5 h-2.5 bg-cyan-400 rounded-full absolute animate-ping opacity-60" />
          </div>
          <h1 className="text-lg xl:text-xl font-bold tracking-tight leading-none whitespace-nowrap">
            <span className="bg-gradient-to-r from-cyan-300 via-sky-200 to-white bg-clip-text text-transparent">
              Network
            </span>
            <span className="text-white"> Digital Twin</span>
          </h1>
        </div>

        {/* Right: ML Engine Toggle Box + 4 Action Buttons Just Below It (Right-Aligned) */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">

          {/* Top Row: Live ML Model Selector Bar */}
          {mode === 'view' && (
            <div className="flex items-center gap-1 ndt-pill-track rounded-xl p-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2.5 whitespace-nowrap">
                ML Engine
              </span>
              {MODEL_OPTIONS.map(m => {
                const isAct = activeModel === m.key;
                const liveAcc = modelSpecs?.models?.[m.key]?.accuracy
                  ? `${(modelSpecs.models[m.key].accuracy * 100).toFixed(1)}%`
                  : m.acc;
                return (
                  <button
                    key={m.key}
                    onClick={() => switchModel(m.key)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                      isAct
                        ? 'ndt-active-pill text-cyan-200 font-semibold'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'
                    }`}
                  >
                    <span>{m.label}</span>
                    <span className={`text-[10px] font-mono ${isAct ? 'text-cyan-300' : 'text-slate-500'}`}>
                      ({liveAcc})
                    </span>
                  </button>
                );
              })}
              {engineMode === 'fallback' ? (
                <div
                  title="Serving instant fallback while FastAPI ML container wakes up; UI will auto-update with live FastAPI predictions."
                  className="flex items-center gap-1.5 pl-2.5 pr-2 py-1 text-[10px] font-mono text-cyan-300 border-l border-slate-800 ml-0.5 whitespace-nowrap animate-pulse"
                >
                  <span className="w-2 h-2 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <span>Waking FastAPI…</span>
                </div>
              ) : inferenceLatencyMs !== null ? (
                <div className="flex items-center gap-1 pl-2.5 pr-2 py-1 text-[11px] font-mono text-amber-300 border-l border-slate-800 ml-0.5 whitespace-nowrap">
                  <span className="text-amber-400">⚡</span>
                  <span>{Number(inferenceLatencyMs).toFixed(1)} ms</span>
                </div>
              ) : null}
            </div>
          )}

          {/* Bottom Row: 4 Action Buttons Right-Aligned Just Below ML Engine Box */}
          <div className="flex items-center justify-end gap-2.5 text-xs">
            {mode === 'view' && (
              <>
                <button
                  onClick={() => setActiveModal('models')}
                  className="ndt-nav-btn px-3.5 py-1.5 bg-gradient-to-b from-cyan-900/50 to-cyan-950/70 border border-cyan-600/60 text-cyan-200 text-xs font-semibold rounded-xl hover:border-cyan-400 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <span>🧠 Model Arena</span>
                  {disagreeCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-amber-300 font-mono text-[10px] font-bold">
                      {disagreeCount} Δ
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveModal('generator')}
                  className="ndt-nav-btn px-3.5 py-1.5 bg-gradient-to-b from-emerald-900/45 to-emerald-950/70 border border-emerald-600/50 text-emerald-200 text-xs font-semibold rounded-xl hover:border-emerald-400 whitespace-nowrap cursor-pointer"
                >
                  🌐 Topologies
                </button>

                <button
                  onClick={() => setActiveModal('simulator')}
                  className="ndt-nav-btn px-3.5 py-1.5 bg-gradient-to-b from-amber-900/45 to-amber-950/70 border border-amber-600/50 text-amber-200 text-xs font-semibold rounded-xl hover:border-amber-400 whitespace-nowrap cursor-pointer"
                >
                  📈 Stress-Test (ΔF)
                </button>

                <button
                  onClick={enterBuildMode}
                  className="ndt-nav-btn px-3.5 py-1.5 bg-gradient-to-b from-violet-900/50 to-violet-950/75 border border-violet-600/60 text-violet-200 text-xs font-semibold rounded-xl hover:border-violet-400 whitespace-nowrap cursor-pointer"
                >
                  + Build
                </button>
              </>
            )}

            {isLoading && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-950/50 border border-cyan-800/50 text-cyan-300 text-[11px] whitespace-nowrap">
                <span className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span>Syncing</span>
              </span>
            )}
            {error && (
              <span className="px-2.5 py-1 rounded-lg bg-red-950/60 border border-red-800/60 text-red-300 text-[11px] whitespace-nowrap">
                ⚠ {error}
              </span>
            )}
            {(droppedNodes > 0 || droppedEdges > 0) && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-950/50 border border-red-800/60 text-red-300 text-[11px] font-mono whitespace-nowrap">
                <span>⚠</span>
                {droppedNodes > 0 && <span>{droppedNodes}N</span>}
                {droppedEdges > 0 && <span>{droppedEdges}E down</span>}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Canvas area */}
        <div className="relative flex-1 min-w-0">
          {!ready && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950 gap-4">
              <div className="w-11 h-11 border-2 border-cyan-700 border-t-cyan-400 rounded-full animate-spin" />
              <p className="text-slate-400 text-sm font-medium">Initializing Multi-Model Network Digital Twin…</p>
            </div>
          )}
          <NetworkCanvas />
        </div>

        {/* Right Sidebar */}
        <aside className="ndt-sidebar w-[360px] xl:w-[410px] flex flex-col border-l border-slate-800/80 overflow-hidden z-10">
          {mode === 'build' ? (
            <BuildPanel />
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-hidden">
                <MetricsPanel />
              </div>
              <ControlPanel />
            </>
          )}
        </aside>
      </div>

      {/* Modals */}
      <ModelComparisonModal />
      <TopologyGeneratorModal />
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
