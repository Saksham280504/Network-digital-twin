'use client';

import { useState } from 'react';
import { useNetwork } from '../context/NetworkContext';

const MODEL_ORDER = ['mpnn', 'lightgbm', 'xgboost', 'logistic_regression', 'random_forest'];

const STATUS_BADGE = {
  'Highly Congested':     'bg-red-950/60 text-red-400 border-red-800/60',
  'Moderately Congested': 'bg-orange-950/60 text-orange-400 border-orange-800/60',
  'Balanced':             'bg-lime-950/60 text-lime-400 border-lime-800/60',
  'Uncongested':          'bg-cyan-950/60 text-cyan-400 border-cyan-800/60',
};

export default function ModelComparisonModal() {
  const {
    activeModal,
    setActiveModal,
    modelSpecs,
    activeModel,
    switchModel,
    predictions,
    modelComparisonLive,
    modelRoutes,
    routeSource,
    routeTarget,
  } = useNetwork();

  const [tab, setTab] = useState('leaderboard'); // 'leaderboard' | 'diagnostics' | 'live_votes'
  const [inspectModel, setInspectModel] = useState(activeModel || 'mpnn');

  if (activeModal !== 'models') return null;

  const modelsMap = modelSpecs?.models || {};
  const inspectedSpec = modelsMap[inspectModel] || modelsMap.mpnn;
  const classOrder = modelSpecs?.class_order || [
    'Uncongested',
    'Balanced',
    'Moderately Congested',
    'Highly Congested',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-6xl max-h-[90vh] flex flex-col rounded-2xl bg-gray-950 border border-slate-800 shadow-2xl overflow-hidden">

        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-shrink-0 bg-slate-900/40">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <h2 className="text-base font-bold text-white tracking-tight">
                Multi-Model ML Benchmark & Disagreement Arena
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-cyan-950/70 border border-cyan-800/60 text-cyan-300">
                5 Distinct Architectures
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Comparing Graph Message-Passing (MPNN) against Gradient Boosted Trees (XGBoost, LightGBM), Bagging (Random Forest), and Linear Softmax on 12,000 telemetry records
            </p>
          </div>
          <button
            onClick={() => setActiveModal(null)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-xs font-medium"
          >
            ✕ Close
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 border-b border-slate-800/80 flex gap-2 flex-shrink-0 bg-gray-950">
          {[
            { id: 'leaderboard', label: '1. Model Specs & Leaderboard' },
            { id: 'diagnostics', label: '2. Confusion Matrix & Feature Importance' },
            { id: 'live_votes',  label: `3. Live Network Voting & Disagreements (${modelComparisonLive?.disagreement_count || 0})` },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all ${
                tab === t.id
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-950/25'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ── TAB 1: LEADERBOARD ── */}
          {tab === 'leaderboard' && (
            <div className="space-y-5">
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/80 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider">
                      <th className="py-3 px-4">Model Architecture</th>
                      <th className="py-3 px-3">Paradigm</th>
                      <th className="py-3 px-3 text-right">Test Accuracy</th>
                      <th className="py-3 px-3 text-right">Macro F1</th>
                      <th className="py-3 px-3 text-right">ROC-AUC</th>
                      <th className="py-3 px-3 text-right">3-Fold CV</th>
                      <th className="py-3 px-3 text-right">Latency (15 edges)</th>
                      <th className="py-3 px-3 text-right">Size</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {MODEL_ORDER.map(key => {
                      const spec = modelsMap[key];
                      if (!spec) return null;
                      const isCurrent = activeModel === key;
                      return (
                        <tr
                          key={key}
                          className={`transition-colors ${
                            isCurrent ? 'bg-cyan-950/20' : 'hover:bg-slate-900/40'
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white">{spec.name}</span>
                              {key === 'mpnn' && (
                                <span className="px-1.5 py-0.5 text-[9px] rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                                  Paper Best
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              Complexity: {spec.complexity}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-slate-400 text-[11px]">{spec.family}</td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-cyan-400">
                            {(spec.accuracy * 100).toFixed(2)}%
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-200">
                            {(spec.f1_macro * 100).toFixed(2)}%
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-300">
                            {spec.roc_auc.toFixed(4)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-400 text-[11px]">
                            {(spec.cv_mean * 100).toFixed(1)}% ± {(spec.cv_std * 100).toFixed(1)}%
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-amber-300">
                            {spec.inference_latency_ms} ms
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-400">
                            {spec.model_size_kb} KB
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => switchModel(key)}
                              disabled={isCurrent}
                              className={`px-3 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                                isCurrent
                                  ? 'bg-cyan-950/60 border-cyan-700 text-cyan-300 cursor-default'
                                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-600 hover:text-cyan-300'
                              }`}
                            >
                              {isCurrent ? '✓ Active' : 'Use Model'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Architectural Comparison Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-cyan-400">Why Graph MPNN Wins on Accuracy (95.46%)</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Unlike isolated edge classifiers, <span className="text-slate-200">MPNN</span> executes a 3-stage Message Passing transformation
                    (<span className="font-mono text-cyan-300">m_ij = φ(h_i, h_j, e_ij)</span>) that combines local link utilization with 1-hop neighbor backpressure and router vertex degree constraints (<span className="font-mono">2 ≤ deg(v) ≤ 9</span>).
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-amber-400">Why Tree Ensembles Differ (XGBoost vs. LightGBM vs. RF)</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    <span className="text-slate-200">XGBoost</span> (depth-wise) and <span className="text-slate-200">LightGBM</span> (leaf-wise 255-bin histograms) capture sharp non-linear M/M/1 queueing delay knees (~95.0%), whereas <span className="text-slate-200">Random Forest</span> uses local features without neighbor passing (92.46%).
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-emerald-400">Latency vs. Accuracy Trade-Off for IoT Edge</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    <span className="text-slate-200">Logistic Regression</span> achieves the fastest sub-millisecond inference (<span className="font-mono text-emerald-300">0.145 ms</span>, <span className="font-mono">1.7 KB</span> size) ideal for ultra-constrained IoT microcontrollers, while <span className="text-slate-200">Graph MPNN</span> (<span className="font-mono">0.221 ms</span>) delivers the best control-plane intelligence.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 2: CONFUSION MATRIX & FEATURE IMPORTANCE ── */}
          {tab === 'diagnostics' && inspectedSpec && (
            <div className="space-y-5">
              {/* Model Picker Pills */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 mr-2">Inspect Model:</span>
                {MODEL_ORDER.map(k => {
                  const s = modelsMap[k];
                  if (!s) return null;
                  return (
                    <button
                      key={k}
                      onClick={() => setInspectModel(k)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        inspectModel === k
                          ? 'bg-cyan-950/70 border-cyan-600 text-cyan-300'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {s.short_name} ({(s.accuracy * 100).toFixed(1)}%)
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 4x4 Confusion Matrix */}
                <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Confusion Matrix — {inspectedSpec.name}
                    </h3>
                    <span className="text-[11px] font-mono text-slate-400">
                      Test Split: {modelSpecs?.test_rows || 2400} edges
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-center text-xs border-collapse">
                      <thead>
                        <tr>
                          <th className="p-2 text-[10px] text-slate-500 text-left">True \ Pred</th>
                          {classOrder.map(c => (
                            <th key={c} className="p-2 text-[10px] text-slate-400 font-semibold">
                              {c.replace('Moderately ', 'Mod. ')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {inspectedSpec.confusion_matrix.map((row, rIdx) => {
                          const rowSum = row.reduce((a, b) => a + b, 0) || 1;
                          return (
                            <tr key={classOrder[rIdx]} className="border-t border-slate-800/60">
                              <td className="p-2 text-[11px] text-left font-medium text-slate-300">
                                {classOrder[rIdx]}
                              </td>
                              {row.map((val, cIdx) => {
                                const isDiag = rIdx === cIdx;
                                const ratio = val / rowSum;
                                return (
                                  <td
                                    key={cIdx}
                                    className={`p-2.5 font-mono text-xs rounded ${
                                      isDiag
                                        ? 'bg-cyan-950/70 text-cyan-300 font-bold border border-cyan-800/40'
                                        : val > 0
                                        ? 'bg-rose-950/30 text-rose-300'
                                        : 'text-slate-600'
                                    }`}
                                  >
                                    <div>{val}</div>
                                    <div className="text-[9px] opacity-75">{(ratio * 100).toFixed(1)}%</div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Per-class Precision / Recall / F1 */}
                  <div className="pt-2 border-t border-slate-800/70 grid grid-cols-4 gap-2">
                    {classOrder.map(c => {
                      const cls = inspectedSpec.per_class?.[c];
                      if (!cls) return null;
                      return (
                        <div key={c} className="p-2 rounded-lg bg-gray-950/70 border border-slate-800/80">
                          <div className="text-[10px] font-semibold text-slate-300 truncate">{c}</div>
                          <div className="text-xs font-mono text-cyan-400 mt-1">F1: {(cls.f1 * 100).toFixed(1)}%</div>
                          <div className="text-[10px] font-mono text-slate-500">
                            P:{(cls.precision * 100).toFixed(0)}% R:{(cls.recall * 100).toFixed(0)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Permutation Feature Importance & Model Profile */}
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-3">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Feature Importance Profile ({inspectedSpec.short_name})
                    </h3>
                    <div className="space-y-2">
                      {Object.entries(inspectedSpec.feature_importances || {})
                        .sort((a, b) => b[1] - a[1])
                        .map(([feat, imp]) => {
                          const pct = Math.round(imp * 100);
                          return (
                            <div key={feat} className="space-y-1">
                              <div className="flex justify-between text-[11px]">
                                <span className="font-mono text-slate-300">{feat}</span>
                                <span className="font-mono text-cyan-400">{(imp * 100).toFixed(1)}%</span>
                              </div>
                              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-cyan-500 to-violet-500 rounded-full"
                                  style={{ width: `${Math.min(100, pct * 1.8)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-2.5 text-xs">
                    <div className="font-bold text-white">{inspectedSpec.name} — Architecture Notes</div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{inspectedSpec.description}</p>
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <div className="text-[10px] font-semibold text-emerald-400 uppercase">Strengths</div>
                        <ul className="mt-1 space-y-1 text-[11px] text-slate-300">
                          {inspectedSpec.strengths?.map((s, i) => (
                            <li key={i}>• {s}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-amber-400 uppercase">Limitations</div>
                        <ul className="mt-1 space-y-1 text-[11px] text-slate-400">
                          {inspectedSpec.limitations?.map((l, i) => (
                            <li key={i}>• {l}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 3: LIVE NETWORK VOTING & DISAGREEMENT MATRIX ── */}
          {tab === 'live_votes' && (
            <div className="space-y-5">
              {/* Route Decisions Per Model on Current Network */}
              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Live Routing Decisions Across All 5 Models ({routeSource} → {routeTarget})
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Click any model to activate its route on the canvas
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
                  {MODEL_ORDER.map(mKey => {
                    const r = modelRoutes?.[mKey];
                    const liveStat = modelComparisonLive?.per_model?.[mKey];
                    const isAct = activeModel === mKey;
                    return (
                      <div
                        key={mKey}
                        onClick={() => switchModel(mKey)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          isAct
                            ? 'bg-cyan-950/30 border-cyan-600'
                            : 'bg-gray-950/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">
                            {modelsMap[mKey]?.short_name || mKey}
                          </span>
                          {liveStat && (
                            <span className="text-[10px] font-mono text-amber-400">
                              {liveStat.latency_ms} ms
                            </span>
                          )}
                        </div>
                        <div className="mt-2 text-[11px] font-mono text-cyan-300 truncate">
                          {r?.path?.length ? r.path.join(' → ') : 'Partitioned'}
                        </div>
                        <div className="mt-1 flex justify-between text-[10px] text-slate-500 font-mono">
                          <span>PBR Cost: {r?.totalCost ?? '∞'}</span>
                          <span>Conf: {liveStat ? `${(liveStat.mean_confidence * 100).toFixed(0)}%` : '-'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Per-Edge Cross-Model Voting Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/80 text-slate-400 border-b border-slate-800 text-[10px] uppercase tracking-wider">
                      <th className="py-2.5 px-3">Edge</th>
                      <th className="py-2.5 px-3">Local Util / Delay</th>
                      <th className="py-2.5 px-3">1-Hop Neighbor Util</th>
                      {MODEL_ORDER.map(k => (
                        <th key={k} className="py-2.5 px-3">
                          {modelsMap[k]?.short_name || k}
                        </th>
                      ))}
                      <th className="py-2.5 px-3 text-center">Consensus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {predictions.map(pred => {
                      const meta = pred.telemetry_enriched || {};
                      return (
                        <tr
                          key={pred.edge_id}
                          className={pred.disagreement ? 'bg-amber-950/15' : 'hover:bg-slate-900/30'}
                        >
                          <td className="py-2.5 px-3 font-mono font-semibold text-white">
                            {pred.edge_id}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300">
                            {meta.utilization_ratio !== undefined
                              ? `${(meta.utilization_ratio * 100).toFixed(0)}%`
                              : '-'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                            {meta.neighbor_mean_util !== undefined
                              ? `${(meta.neighbor_mean_util * 100).toFixed(0)}% (deg ${meta.source_degree}+${meta.target_degree})`
                              : '-'}
                          </td>
                          {MODEL_ORDER.map(mKey => {
                            const v = pred.all_model_votes?.[mKey];
                            const st = v?.congestion_status || pred.congestion_status;
                            const badgeCls = STATUS_BADGE[st] || 'bg-slate-900 text-slate-400';
                            return (
                              <td key={mKey} className="py-2.5 px-3">
                                <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-medium ${badgeCls}`}>
                                  {st.replace('Moderately ', 'Mod. ')}
                                </span>
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-3 text-center">
                            {pred.disagreement ? (
                              <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-700/70 text-amber-300 text-[10px] font-semibold">
                                Δ Split Vote
                              </span>
                            ) : (
                              <span className="text-[10px] text-emerald-400 font-mono">✓ Unanimous</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

