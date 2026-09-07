'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useNetwork } from '../context/NetworkContext';

// ─── Constants ───────────────────────────────────────────────────
const PADDING    = 70;   // canvas padding in pixels
const NODE_R     = 20;   // node circle radius
const EDGE_HIT   = 8;    // click-detection threshold for edges (px)

const CONGESTION_COLORS = {
  'Uncongested':          '#22d3ee',
  'Balanced':             '#84cc16',
  'Moderately Congested': '#f97316',
  'Highly Congested':     '#ef4444',
  'Unknown':              '#475569',
};

// ─── Helper: scale normalized (0-1) node coords to canvas pixels ─
function toCanvas(node, w, h) {
  return {
    x: PADDING + node.x * (w - 2 * PADDING),
    y: PADDING + node.y * (h - 2 * PADDING),
  };
}

// ─── Helper: point-to-line-segment distance ───────────────────────
function ptSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ─── Draw: dark-grid background ──────────────────────────────────
function drawBackground(ctx, w, h) {
  ctx.fillStyle = '#030712';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
  ctx.lineWidth = 0.5;
  const GRID = 50;
  for (let x = 0; x < w; x += GRID) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += GRID) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
}

// ─── Draw: single edge ───────────────────────────────────────────
function drawEdge(ctx, edge, from, to, status, isInPath, isSelected, w, h) {
  const { x: x1, y: y1 } = toCanvas(from, w, h);
  const { x: x2, y: y2 } = toCanvas(to,   w, h);
  const color = CONGESTION_COLORS[status] || CONGESTION_COLORS.Unknown;

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
    ctx.lineWidth   = 3;
    ctx.shadowBlur  = 18;
    ctx.shadowColor = '#fde047';
  } else if (isInPath) {
    ctx.setLineDash([]);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 3;
    ctx.shadowBlur  = 22;
    ctx.shadowColor = color;
  } else {
    ctx.setLineDash([]);
    ctx.strokeStyle = color + '66';  // 40% opacity for non-path edges
    ctx.lineWidth   = 1.5;
    ctx.shadowBlur  = 6;
    ctx.shadowColor = color;
  }

  ctx.stroke();
  ctx.restore();
}

// ─── Draw: single data-packet ────────────────────────────────────
function drawPacket(ctx, from, to, progress, color, isInPath, w, h) {
  const { x: x1, y: y1 } = toCanvas(from, w, h);
  const { x: x2, y: y2 } = toCanvas(to,   w, h);
  const x    = x1 + (x2 - x1) * progress;
  const y    = y1 + (y2 - y1) * progress;
  const size = isInPath ? 5 : 3;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fillStyle   = '#ffffff';
  ctx.shadowBlur  = isInPath ? 16 : 8;
  ctx.shadowColor = color;
  ctx.fill();
  ctx.restore();
}

// ─── Draw: single node ───────────────────────────────────────────
function drawNode(ctx, node, isInPath, isSelected, w, h) {
  const { x, y } = toCanvas(node, w, h);

  ctx.save();

  if (node.dropped) {
    // Dropped: dark circle + red X
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
  } else {
    // Active node
    ctx.shadowBlur  = isSelected ? 36 : (isInPath ? 26 : 12);
    ctx.shadowColor = isSelected ? '#fde047' : (isInPath ? '#22d3ee' : '#0284c7');

    ctx.beginPath();
    ctx.arc(x, y, NODE_R, 0, Math.PI * 2);
    ctx.fillStyle   = isSelected ? '#1c1a05' : (isInPath ? '#0c2a3e' : '#0a1628');
    ctx.strokeStyle = isSelected ? '#fde047' : (isInPath ? '#22d3ee' : '#0369a1');
    ctx.lineWidth   = (isSelected || isInPath) ? 2.5 : 1.5;
    ctx.fill();
    ctx.stroke();

    // Node ID text
    ctx.shadowBlur    = 0;
    ctx.fillStyle     = isInPath ? '#e0f2fe' : '#94a3b8';
    ctx.font          = `bold 11px 'Outfit', sans-serif`;
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.fillText(node.id, x, y);
  }

  // Label below node
  ctx.shadowBlur   = 0;
  ctx.fillStyle    = '#334155';
  ctx.font         = `9px 'Outfit', sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(node.label, x, y + NODE_R + 6);

  ctx.restore();
}

// ─── Component ───────────────────────────────────────────────────
export default function NetworkCanvas() {
  const canvasRef   = useRef(null);
  const animRef     = useRef(null);
  const packetsRef  = useRef([]);       // mutable animation state
  const stateRef    = useRef({});       // latest React state for animation closure

  const { networkData, predictions, activePath, selectedItem, setSelectedItem } = useNetwork();

  // Keep stateRef in sync without restarting animation loop
  useEffect(() => {
    stateRef.current = { networkData, predictions, activePath, selectedItem };
  }, [networkData, predictions, activePath, selectedItem]);

  // (Re-)initialize packets when the edge list changes
  useEffect(() => {
    if (networkData.edges.length > 0) {
      packetsRef.current = networkData.edges.map(edge => ({
        edgeId:   edge.id,
        progress: Math.random(),
        speed:    0.0015 + Math.random() * 0.002,
      }));
    }
  }, [networkData.edges]);

  // Click handler: node takes priority over edge
  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top)  * scaleY;
    const { networkData } = stateRef.current;
    const w = canvas.width, h = canvas.height;

    // 1. Check nodes
    for (const node of networkData.nodes) {
      const { x, y } = toCanvas(node, w, h);
      if (Math.hypot(px - x, py - y) < NODE_R + 6) {
        setSelectedItem({ type: 'node', id: node.id });
        return;
      }
    }
    // 2. Check edges
    for (const edge of networkData.edges) {
      if (edge.dropped) continue;
      const from = networkData.nodes.find(n => n.id === edge.source);
      const to   = networkData.nodes.find(n => n.id === edge.target);
      if (!from || !to) continue;
      const { x: x1, y: y1 } = toCanvas(from, w, h);
      const { x: x2, y: y2 } = toCanvas(to,   w, h);
      if (ptSegDist(px, py, x1, y1, x2, y2) < EDGE_HIT) {
        setSelectedItem({ type: 'edge', id: edge.id });
        return;
      }
    }
    setSelectedItem(null);
  }, [setSelectedItem]);

  // Main animation loop — starts once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Resize canvas to fill its CSS container
    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const animate = () => {
      const { networkData, predictions, activePath, selectedItem } = stateRef.current;
      const w = canvas.width, h = canvas.height;

      ctx.clearRect(0, 0, w, h);
      drawBackground(ctx, w, h);

      if (!networkData.nodes.length) {
        animRef.current = requestAnimationFrame(animate);
        return;
      }

      // ── Edges ──
      networkData.edges.forEach(edge => {
        const from = networkData.nodes.find(n => n.id === edge.source);
        const to   = networkData.nodes.find(n => n.id === edge.target);
        if (!from || !to) return;
        const pred     = predictions.find(p => p.edge_id === edge.id);
        const status   = pred ? pred.congestion_status : 'Unknown';
        const isInPath = activePath.edgePath?.includes(edge.id);
        const isSel    = selectedItem?.type === 'edge' && selectedItem?.id === edge.id;
        drawEdge(ctx, edge, from, to, status, isInPath, isSel, w, h);
      });

      // ── Packets ──
      packetsRef.current.forEach(pkt => {
        const edge = networkData.edges.find(e => e.id === pkt.edgeId);
        if (!edge || edge.dropped) return;
        const from = networkData.nodes.find(n => n.id === edge.source);
        const to   = networkData.nodes.find(n => n.id === edge.target);
        if (!from || !to) return;
        const pred     = predictions.find(p => p.edge_id === edge.id);
        const status   = pred ? pred.congestion_status : 'Unknown';
        const color    = CONGESTION_COLORS[status] || CONGESTION_COLORS.Unknown;
        const isInPath = activePath.edgePath?.includes(edge.id);
        drawPacket(ctx, from, to, pkt.progress, color, isInPath, w, h);
        pkt.progress = (pkt.progress + pkt.speed) % 1; // mutate ref — no re-render
      });

      // ── Nodes ──
      networkData.nodes.forEach(node => {
        const isInPath = activePath.path?.includes(node.id);
        const isSel    = selectedItem?.type === 'node' && selectedItem?.id === node.id;
        drawNode(ctx, node, isInPath, isSel, w, h);
      });

      animRef.current = requestAnimationFrame(animate);
    };

    animate();
    canvas.addEventListener('click', handleClick);

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
      canvas.removeEventListener('click', handleClick);
    };
  }, [handleClick]); // only runs once on mount; stateRef keeps state fresh

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-crosshair"
      style={{ display: 'block' }}
    />
  );
}
