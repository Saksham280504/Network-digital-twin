'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useNetwork } from '../context/NetworkContext';

// ─── Constants ───────────────────────────────────────────────────
const PADDING  = 70;
const NODE_R   = 21;
const EDGE_HIT = 9;

const CONGESTION_COLORS = {
  'Uncongested':          '#22d3ee',
  'Balanced':             '#84cc16',
  'Moderately Congested': '#f97316',
  'Highly Congested':     '#ef4444',
  'Unknown':              '#475569',
};

const MODEL_SHORT_LABELS = {
  mpnn:                'Graph MPNN',
  xgboost:             'XGBoost',
  lightgbm:            'LightGBM',
  random_forest:       'Random Forest',
  logistic_regression: 'Logistic Reg.',
};

function toCanvas(node, w, h) {
  return {
    x: PADDING + node.x * (w - 2 * PADDING),
    y: PADDING + node.y * (h - 2 * PADDING),
  };
}

function fromCanvas(px, py, w, h) {
  return {
    x: Math.max(0, Math.min(1, (px - PADDING) / (w - 2 * PADDING))),
    y: Math.max(0, Math.min(1, (py - PADDING) / (h - 2 * PADDING))),
  };
}

function ptSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function drawBackground(ctx, w, h, isBuildMode) {
  ctx.fillStyle = '#030712';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = isBuildMode
    ? 'rgba(139, 92, 246, 0.06)'
    : 'rgba(56, 189, 248, 0.04)';
  ctx.lineWidth = 0.5;
  const GRID = 50;
  for (let x = 0; x < w; x += GRID) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += GRID) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
}

function drawEdge(
  ctx,
  edge,
  from,
  to,
  status,
  isInPath,
  isInOspf,
  isInSecondary,
  isSelected,
  hasDisagreement,
  highlightDisagreement,
  routingOverlay,
  w,
  h
) {
  const { x: x1, y: y1 } = toCanvas(from, w, h);
  const { x: x2, y: y2 } = toCanvas(to,   w, h);
  const color = CONGESTION_COLORS[status] || CONGESTION_COLORS.Unknown;

  // Draw OSPF baseline offset line when 'both' overlay is active and OSPF uses this edge
  if (!edge.dropped && routingOverlay === 'both' && isInOspf && !isInPath) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.85)'; // rose-500 dashed OSPF baseline
    ctx.lineWidth   = 3.5;
    ctx.shadowBlur  = 14;
    ctx.shadowColor = '#f43f5e';
    ctx.stroke();
    ctx.restore();
  }

  // Draw secondary multi-path 50% split overlay
  if (!edge.dropped && routingOverlay === 'multipath' && isInSecondary && !isInPath) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#a855f7'; // purple-500 secondary split path
    ctx.lineWidth   = 2.8;
    ctx.shadowBlur  = 16;
    ctx.shadowColor = '#a855f7';
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);

  if (edge.dropped) {
    ctx.setLineDash([4, 9]);
    ctx.strokeStyle = 'rgba(100,116,139,0.25)';
    ctx.lineWidth   = 1;
    ctx.shadowBlur  = 0;
  } else if (isSelected) {
    ctx.setLineDash([]);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth   = 3.5;
    ctx.shadowBlur  = 20;
    ctx.shadowColor = '#fde047';
  } else if (highlightDisagreement && hasDisagreement) {
    ctx.setLineDash([]);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth   = 3.2;
    ctx.shadowBlur  = 22;
    ctx.shadowColor = '#f59e0b';
  } else if (isInPath) {
    ctx.setLineDash([]);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 3.2;
    ctx.shadowBlur  = 22;
    ctx.shadowColor = color;
  } else {
    ctx.setLineDash([]);
    ctx.strokeStyle = color + '66';
    ctx.lineWidth   = 1.5;
    ctx.shadowBlur  = 6;
    ctx.shadowColor = color;
  }

  ctx.stroke();
  ctx.restore();

  // Midpoint badge for Model Disagreement or OSPF divergence
  if (!edge.dropped && ((highlightDisagreement && hasDisagreement) || (hasDisagreement && isSelected))) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    ctx.save();
    ctx.fillStyle = '#451a03';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mx, my, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fcd34d';
    ctx.font = `bold 8px 'Outfit', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Δ', mx, my);
    ctx.restore();
  }
}

function drawBuildEdge(ctx, from, to, isSelected, w, h) {
  const { x: x1, y: y1 } = toCanvas(from, w, h);
  const { x: x2, y: y2 } = toCanvas(to,   w, h);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.setLineDash([]);
  ctx.strokeStyle = isSelected ? '#fde047' : 'rgba(139, 92, 246, 0.5)';
  ctx.lineWidth   = isSelected ? 3 : 1.5;
  ctx.shadowBlur  = isSelected ? 18 : 8;
  ctx.shadowColor = isSelected ? '#fde047' : '#8b5cf6';
  ctx.stroke();
  ctx.restore();
}

function drawGhostEdge(ctx, fromNode, mouseX, mouseY, w, h) {
  const { x, y } = toCanvas(fromNode, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(mouseX, mouseY);
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)';
  ctx.lineWidth   = 1.5;
  ctx.shadowBlur  = 10;
  ctx.shadowColor = '#8b5cf6';
  ctx.stroke();
  ctx.restore();
}

function drawPacket(ctx, from, to, progress, color, isInPath, isSecondary, w, h) {
  const { x: x1, y: y1 } = toCanvas(from, w, h);
  const { x: x2, y: y2 } = toCanvas(to,   w, h);
  const x    = x1 + (x2 - x1) * progress;
  const y    = y1 + (y2 - y1) * progress;
  const size = isInPath ? 5 : isSecondary ? 4 : 2.8;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fillStyle   = isSecondary ? '#e9d5ff' : '#ffffff';
  ctx.shadowBlur  = isInPath ? 16 : isSecondary ? 12 : 7;
  ctx.shadowColor = isSecondary ? '#a855f7' : color;
  ctx.fill();
  ctx.restore();
}

function drawNode(ctx, node, isInPath, isSelected, isPending, isSource, isTarget, isBuildMode, vertexSplit, w, h) {
  const { x, y } = toCanvas(node, w, h);

  ctx.save();

  if (node.dropped) {
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, y, NODE_R, 0, Math.PI * 2);
    ctx.fillStyle   = '#1c0a09';
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth   = 2;
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 8); ctx.lineTo(x + 8, y + 8);
    ctx.moveTo(x + 8, y - 8); ctx.lineTo(x - 8, y + 8);
    ctx.stroke();
  } else if (isPending) {
    ctx.shadowBlur  = 36;
    ctx.shadowColor = '#8b5cf6';
    ctx.beginPath();
    ctx.arc(x, y, NODE_R, 0, Math.PI * 2);
    ctx.fillStyle   = '#1e1036';
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth   = 3;
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, y, NODE_R + 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.3)';
    ctx.lineWidth   = 1;
    ctx.stroke();
  } else {
    let fillColor, strokeColor, shadow;
    if (isSelected) {
      fillColor = '#1c1a05'; strokeColor = '#fde047'; shadow = '#fde047';
    } else if (isBuildMode) {
      fillColor = '#120d24'; strokeColor = '#6d28d9'; shadow = '#8b5cf6';
    } else if (isInPath) {
      fillColor = '#0c2a3e'; strokeColor = '#22d3ee'; shadow = '#22d3ee';
    } else {
      fillColor = '#0a1628'; strokeColor = '#0369a1'; shadow = '#0284c7';
    }

    ctx.shadowBlur  = isSelected ? 36 : (isInPath ? 26 : 12);
    ctx.shadowColor = shadow;
    ctx.beginPath();
    ctx.arc(x, y, NODE_R, 0, Math.PI * 2);
    ctx.fillStyle   = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth   = (isSelected || isInPath) ? 2.5 : 1.5;
    ctx.fill();
    ctx.stroke();

    if (isSource || isTarget) {
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(x, y, NODE_R + 5, 0, Math.PI * 2);
      ctx.strokeStyle = isSource ? '#22d3ee' : '#f97316';
      ctx.lineWidth   = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.shadowBlur   = 0;
    ctx.fillStyle    = isInPath ? '#e0f2fe' : '#94a3b8';
    ctx.font         = `bold 11px 'Outfit', sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.id, x, y);
  }

  // Label below
  ctx.shadowBlur   = 0;
  ctx.fillStyle    = '#475569';
  ctx.font         = `9px 'Outfit', sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(node.label, x, y + NODE_R + 6);

  // Vertex PBR Split pill if rerouting is active at this router
  if (!isBuildMode && !node.dropped && vertexSplit?.rerouteFeasible && vertexSplit.reroutePercentage > 0) {
    ctx.fillStyle = 'rgba(16, 185, 129, 0.85)';
    ctx.font = `bold 8px 'Outfit', sans-serif`;
    ctx.fillText(`PBR ${vertexSplit.reroutePercentage}%`, x, y + NODE_R + 17);
  }

  if (isSource) {
    ctx.fillStyle = '#22d3ee';
    ctx.font = `bold 8px 'Outfit', sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.fillText('SRC', x, y - NODE_R - 5);
  } else if (isTarget) {
    ctx.fillStyle = '#f97316';
    ctx.font = `bold 8px 'Outfit', sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.fillText('DST', x, y - NODE_R - 5);
  }

  ctx.restore();
}

function drawBuildCursor(ctx, mx, my) {
  ctx.save();
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mx - 8, my); ctx.lineTo(mx + 8, my);
  ctx.moveTo(mx, my - 8); ctx.lineTo(mx, my + 8);
  ctx.stroke();
  ctx.restore();
}

export default function NetworkCanvas() {
  const canvasRef  = useRef(null);
  const animRef    = useRef(null);
  const packetsRef = useRef([]);
  const stateRef   = useRef({});
  const mouseRef   = useRef({ x: 0, y: 0 });
  const dragRef    = useRef(null);

  const {
    networkData,
    predictions,
    activePath,
    ospfPath,
    secondaryPath,
    vertexSplits,
    selectedItem,
    routingOverlay,
    setRoutingOverlay,
    highlightDisagreement,
    setHighlightDisagreement,
    activeModel,
    modelComparisonLive,
    benchmarkMetrics,
    topologySummary,
    mode,
    pendingEdgeFrom,
    routeSource,
    routeTarget,
    setSelectedItem,
    addNode,
    addEdge,
    moveNode,
    setPendingEdgeFrom,
  } = useNetwork();

  useEffect(() => {
    stateRef.current = {
      networkData,
      predictions,
      activePath,
      ospfPath,
      secondaryPath,
      vertexSplits,
      selectedItem,
      routingOverlay,
      highlightDisagreement,
      mode,
      pendingEdgeFrom,
      routeSource,
      routeTarget,
    };
  }, [
    networkData,
    predictions,
    activePath,
    ospfPath,
    secondaryPath,
    vertexSplits,
    selectedItem,
    routingOverlay,
    highlightDisagreement,
    mode,
    pendingEdgeFrom,
    routeSource,
    routeTarget,
  ]);

  useEffect(() => {
    if (networkData.edges.length > 0 && mode === 'view') {
      packetsRef.current = networkData.edges.map(edge => ({
        edgeId:   edge.id,
        progress: Math.random(),
        speed:    0.0018 + Math.random() * 0.002,
      }));
    } else {
      packetsRef.current = [];
    }
  }, [networkData.edges, mode]);

  const getCanvasPos = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      px: (e.clientX - rect.left) * scaleX,
      py: (e.clientY - rect.top)  * scaleY,
    };
  }, []);

  const findNodeAt = useCallback((px, py, nodes, w, h) => {
    for (const node of nodes) {
      const { x, y } = toCanvas(node, w, h);
      if (Math.hypot(px - x, py - y) < NODE_R + 6) return node;
    }
    return null;
  }, []);

  const findEdgeAt = useCallback((px, py, nodes, edges, w, h) => {
    for (const edge of edges) {
      if (edge.dropped) continue;
      const from = nodes.find(n => n.id === edge.source);
      const to   = nodes.find(n => n.id === edge.target);
      if (!from || !to) continue;
      const { x: x1, y: y1 } = toCanvas(from, w, h);
      const { x: x2, y: y2 } = toCanvas(to,   w, h);
      if (ptSegDist(px, py, x1, y1, x2, y2) < EDGE_HIT) return edge;
    }
    return null;
  }, []);

  const handleClick = useCallback((e) => {
    if (dragRef.current?.didDrag) {
      dragRef.current = null;
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const { px, py } = getCanvasPos(e);
    const { networkData, mode, pendingEdgeFrom } = stateRef.current;
    const w = canvas.width, h = canvas.height;

    if (mode === 'build') {
      const node = findNodeAt(px, py, networkData.nodes, w, h);
      if (node) {
        if (pendingEdgeFrom) {
          if (pendingEdgeFrom !== node.id) {
            addEdge(pendingEdgeFrom, node.id);
          } else {
            setPendingEdgeFrom(null);
          }
        } else {
          setPendingEdgeFrom(node.id);
          setSelectedItem({ type: 'node', id: node.id });
        }
      } else {
        const edge = findEdgeAt(px, py, networkData.nodes, networkData.edges, w, h);
        if (edge) {
          setPendingEdgeFrom(null);
          setSelectedItem({ type: 'edge', id: edge.id });
        } else {
          if (pendingEdgeFrom) {
            setPendingEdgeFrom(null);
          } else {
            const { x, y } = fromCanvas(px, py, w, h);
            addNode(x, y);
          }
        }
      }
    } else {
      const node = findNodeAt(px, py, networkData.nodes, w, h);
      if (node) { setSelectedItem({ type: 'node', id: node.id }); return; }

      const edge = findEdgeAt(px, py, networkData.nodes, networkData.edges, w, h);
      if (edge) { setSelectedItem({ type: 'edge', id: edge.id }); return; }

      setSelectedItem(null);
    }
  }, [getCanvasPos, findNodeAt, findEdgeAt, setSelectedItem, addNode, addEdge, setPendingEdgeFrom]);

  const handleMouseDown = useCallback((e) => {
    if (stateRef.current.mode !== 'build') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { px, py } = getCanvasPos(e);
    const { networkData } = stateRef.current;
    const w = canvas.width, h = canvas.height;
    const node = findNodeAt(px, py, networkData.nodes, w, h);
    if (node) {
      const { x, y } = toCanvas(node, w, h);
      dragRef.current = {
        nodeId: node.id,
        offsetX: px - x,
        offsetY: py - y,
        didDrag: false
      };
    }
  }, [getCanvasPos, findNodeAt]);

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { px, py } = getCanvasPos(e);
    mouseRef.current = { x: px, y: py };

    if (dragRef.current && stateRef.current.mode === 'build') {
      const w = canvas.width, h = canvas.height;
      const newPx = px - dragRef.current.offsetX;
      const newPy = py - dragRef.current.offsetY;
      const { x, y } = fromCanvas(newPx, newPy, w, h);
      moveNode(dragRef.current.nodeId, x, y);
      dragRef.current.didDrag = true;
    }
  }, [getCanvasPos, moveNode]);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current && !dragRef.current.didDrag) {
      dragRef.current = null;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const animate = () => {
      const state = stateRef.current;
      const {
        networkData,
        predictions,
        activePath,
        ospfPath,
        secondaryPath,
        vertexSplits,
        selectedItem,
        routingOverlay,
        highlightDisagreement,
        mode,
        pendingEdgeFrom,
        routeSource,
        routeTarget,
      } = state;
      const w = canvas.width, h = canvas.height;
      const isBuildMode = mode === 'build';

      ctx.clearRect(0, 0, w, h);
      drawBackground(ctx, w, h, isBuildMode);

      if (!networkData.nodes.length) {
        if (isBuildMode) {
          drawBuildCursor(ctx, mouseRef.current.x, mouseRef.current.y);
        }
        animRef.current = requestAnimationFrame(animate);
        return;
      }

      // ── Edges ──
      networkData.edges.forEach(edge => {
        const from = networkData.nodes.find(n => n.id === edge.source);
        const to   = networkData.nodes.find(n => n.id === edge.target);
        if (!from || !to) return;
        const isSel = selectedItem?.type === 'edge' && selectedItem?.id === edge.id;

        if (isBuildMode) {
          drawBuildEdge(ctx, from, to, isSel, w, h);
        } else {
          const pred          = predictions.find(p => p.edge_id === edge.id);
          const status        = pred ? pred.congestion_status : 'Unknown';
          const isInPath      = activePath?.edgePath?.includes(edge.id);
          const isInOspf      = ospfPath?.edgePath?.includes(edge.id);
          const isInSecondary = secondaryPath?.edgePath?.includes(edge.id);
          const hasDisagree   = pred?.disagreement === true;

          drawEdge(
            ctx,
            edge,
            from,
            to,
            status,
            isInPath,
            isInOspf,
            isInSecondary,
            isSel,
            hasDisagree,
            highlightDisagreement,
            routingOverlay,
            w,
            h
          );
        }
      });

      // ── Ghost edge in build mode ──
      if (isBuildMode && pendingEdgeFrom) {
        const fromNode = networkData.nodes.find(n => n.id === pendingEdgeFrom);
        if (fromNode) {
          drawGhostEdge(ctx, fromNode, mouseRef.current.x, mouseRef.current.y, w, h);
        }
      }

      // ── Packets (view mode only) ──
      if (!isBuildMode) {
        packetsRef.current.forEach(pkt => {
          const edge = networkData.edges.find(e => e.id === pkt.edgeId);
          if (!edge || edge.dropped) return;
          const from = networkData.nodes.find(n => n.id === edge.source);
          const to   = networkData.nodes.find(n => n.id === edge.target);
          if (!from || !to) return;
          const pred          = predictions.find(p => p.edge_id === edge.id);
          const status        = pred ? pred.congestion_status : 'Unknown';
          const color         = CONGESTION_COLORS[status] || CONGESTION_COLORS.Unknown;
          const isInPath      = activePath?.edgePath?.includes(edge.id);
          const isInSecondary = routingOverlay === 'multipath' && secondaryPath?.edgePath?.includes(edge.id);

          drawPacket(ctx, from, to, pkt.progress, color, isInPath, isInSecondary, w, h);
          pkt.progress = (pkt.progress + pkt.speed) % 1;
        });
      }

      // ── Nodes ──
      networkData.nodes.forEach(node => {
        const isInPath  = activePath?.path?.includes(node.id);
        const isSel     = selectedItem?.type === 'node' && selectedItem?.id === node.id;
        const isPending = pendingEdgeFrom === node.id;
        const isSource  = routeSource === node.id;
        const isTarget  = routeTarget === node.id;
        const vSplit    = vertexSplits?.[node.id];
        drawNode(ctx, node, isInPath, isSel, isPending, isSource, isTarget, isBuildMode, vSplit, w, h);
      });

      if (isBuildMode && !dragRef.current) {
        drawBuildCursor(ctx, mouseRef.current.x, mouseRef.current.y);
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animate();
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleClick, handleMouseDown, handleMouseMove, handleMouseUp]);

  const isBuild = mode === 'build';
  const disagreeCount = modelComparisonLive?.disagreement_count || 0;
  const routesDiffer = benchmarkMetrics?.improvements?.routesDiffer;

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className={`w-full h-full ${isBuild ? 'cursor-cell' : 'cursor-crosshair'}`}
        style={{ display: 'block' }}
      />

      {/* Top-Left Topology & Degree Constraint Badge */}
      {!isBuild && topologySummary && (
        <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2.5 pointer-events-none">
          <div className="px-4 py-2 rounded-xl ndt-card backdrop-blur-md text-xs flex items-center gap-3 shadow-xl">
            <span className="font-bold text-cyan-300">{topologySummary.modelName}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-300 font-mono">
              deg(v) ∈ [{topologySummary.minDegree}, {topologySummary.maxDegree}]
            </span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                topologySummary.degreeConstraintSatisfied
                  ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-700/60'
                  : 'bg-amber-950/70 text-amber-300 border border-amber-700/60'
              }`}
            >
              {topologySummary.degreeConstraintSatisfied ? '✓ 2 ≤ deg ≤ 9' : 'Custom deg'}
            </span>
            <span className="hidden lg:inline text-slate-400 font-mono text-[11px]">
              PE:{topologySummary.peRouters} CE:{topologySummary.ceRouters} IoT-Hosts:{topologySummary.iotHosts}
            </span>
          </div>
        </div>
      )}

      {/* Bottom-Left Interactive Routing Overlay Controls */}
      {!isBuild && (
        <div className="absolute bottom-4 left-14 z-10 flex flex-wrap items-center gap-2.5">
          <div className="flex items-center p-1.5 gap-1 rounded-xl ndt-pill-track backdrop-blur-md shadow-xl text-xs">
            <button
              onClick={() => setRoutingOverlay('both')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                routingOverlay === 'both'
                  ? 'ndt-active-pill text-cyan-200'
                  : 'text-slate-400 hover:text-slate-100 border border-transparent'
              }`}
            >
              PBR vs. OSPF {routesDiffer && <span className="ml-1 text-rose-400">●</span>}
            </button>
            <button
              onClick={() => setRoutingOverlay('multipath')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                routingOverlay === 'multipath'
                  ? 'bg-purple-950/80 text-purple-200 border border-purple-600/70 shadow-sm'
                  : 'text-slate-400 hover:text-slate-100 border border-transparent'
              }`}
            >
              50% Multi-Path Split
            </button>
            <button
              onClick={() => setRoutingOverlay('pbr')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                routingOverlay === 'pbr'
                  ? 'bg-slate-800 border border-slate-600 text-white'
                  : 'text-slate-400 hover:text-slate-100 border border-transparent'
              }`}
            >
              PBR Only
            </button>
          </div>

          <button
            onClick={() => setHighlightDisagreement(!highlightDisagreement)}
            className={`px-3.5 py-2 rounded-xl border text-xs font-semibold backdrop-blur-md shadow-xl transition-all flex items-center gap-2 cursor-pointer ${
              highlightDisagreement
                ? 'bg-amber-950/85 border-amber-600 text-amber-200'
                : 'ndt-card text-slate-300 hover:text-amber-300'
            }`}
          >
            <span>Δ Model Disagreements</span>
            <span className="px-2 py-0.5 rounded-md bg-amber-900/60 border border-amber-700/60 text-amber-300 font-mono text-[10px] font-bold">
              {disagreeCount}
            </span>
          </button>

          {/* Visual Legend for Overlays */}
          {routingOverlay === 'both' && (
            <div className="hidden xl:flex items-center gap-3.5 px-3.5 py-2 rounded-xl ndt-card backdrop-blur-md text-[11px] text-slate-300">
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-0.5 bg-cyan-400 inline-block shadow-[0_0_6px_#22d3ee]" />
                {MODEL_SHORT_LABELS[activeModel] || 'NDT'} PBR
              </span>
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-0.5 border-b-2 border-dashed border-rose-500 inline-block" />
                Static MPLS/OSPF
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
