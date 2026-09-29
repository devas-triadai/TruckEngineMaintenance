import React, { useRef, useEffect, useState } from 'react';
import { OrderTrackingMetrics, OrderBin } from '../types/telemetry';
import { Disc, Layers, AlertCircle, Info, Activity } from 'lucide-react';

interface OrderTrackingPanelProps {
  orderTracking?: OrderTrackingMetrics;
  rpm: number;
}

export const OrderTrackingPanel: React.FC<OrderTrackingPanelProps> = ({ orderTracking, rpm }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [hoveredOrder, setHoveredOrder] = useState<OrderBin | null>(null);

  const peaks = orderTracking?.radial_x_peaks || {
    amp_1x_g: 0.25,
    amp_2x_g: 0.12,
    amp_4x_g: 0.55,
    amp_bpfo_g: 0.04
  };

  const orderBins = orderTracking?.order_bins || [];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Canvas rendering of angular order spectrum
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = dimensions.width || canvas.clientWidth || 300;
    const height = dimensions.height || canvas.clientHeight || 256;
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    // Dark backdrop
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, width, height);

    const padL = 40;
    const padR = 20;
    const padT = 25;
    const padB = 30;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    // Grid lines for orders 1 to 16
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1;
    for (let o = 1; o <= 16; o += 1) {
      const px = padL + (o / 16.0) * plotW;
      ctx.beginPath();
      ctx.moveTo(px, padT);
      ctx.lineTo(px, padT + plotH);
      ctx.stroke();
    }

    for (let yDiv = 1; yDiv <= 4; yDiv++) {
      const py = padT + (yDiv / 4) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, py);
      ctx.lineTo(padL + plotW, py);
      ctx.stroke();
    }

    // Highlight key order regions (1X, 2X, 4X V8 Firing, BPFO 3.58X)
    const drawOrderZone = (order: number, widthOrders: number, color: string, label: string) => {
      const startX = padL + ((order - widthOrders / 2) / 16.0) * plotW;
      const zoneW = (widthOrders / 16.0) * plotW;
      ctx.fillStyle = color;
      ctx.fillRect(startX, padT, zoneW, plotH);
    };

    drawOrderZone(1.0, 0.4, 'rgba(56, 189, 248, 0.08)', '1X');
    drawOrderZone(2.0, 0.4, 'rgba(148, 163, 184, 0.06)', '2X');
    drawOrderZone(3.58, 0.35, 'rgba(239, 68, 68, 0.12)', 'BPFO');
    drawOrderZone(4.0, 0.5, 'rgba(16, 185, 129, 0.10)', '4X');

    // Draw Order Bar/Line Chart
    if (orderBins.length > 0) {
      const maxAmp = 1.6;

      ctx.beginPath();
      ctx.moveTo(padL, padT + plotH);

      for (let i = 0; i < orderBins.length; i++) {
        const bin = orderBins[i];
        const px = padL + (bin.order / 16.0) * plotW;
        const normY = Math.min(1.0, bin.amp / maxAmp);
        const py = padT + plotH - normY * plotH;
        ctx.lineTo(px, py);
      }

      ctx.lineTo(padL + plotW, padT + plotH);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
      grad.addColorStop(0, 'rgba(6, 182, 212, 0.30)');
      grad.addColorStop(1, 'rgba(6, 182, 212, 0.02)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Stroke curve
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < orderBins.length; i++) {
        const bin = orderBins[i];
        const px = padL + (bin.order / 16.0) * plotW;
        const normY = Math.min(1.0, bin.amp / maxAmp);
        const py = padT + plotH - normY * plotH;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Callout Pins for 1X, 2X, 3.58X (BPFO), 4X (Firing)
    const drawPin = (order: number, label: string, color: string, amp: number) => {
      const px = padL + (order / 16.0) * plotW;
      ctx.strokeStyle = color;
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px, padT);
      ctx.lineTo(px, padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = color;
      ctx.font = 'bold 9px "IBM Plex Mono", monospace';
      ctx.fillText(label, px + 3, padT + 12);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '8px "IBM Plex Mono", monospace';
      ctx.fillText(`${amp.toFixed(2)}g`, px + 3, padT + 22);
    };

    drawPin(1.0, '1X (SHAFT)', '#38bdf8', peaks.amp_1x_g);
    drawPin(2.0, '2X (ALIGN)', '#94a3b8', peaks.amp_2x_g);
    drawPin(3.58, 'BPFO (BEARING)', '#f43f5e', peaks.amp_bpfo_g);
    drawPin(4.0, '4X (V8 FIRING)', '#10b981', peaks.amp_4x_g);

    // Axes scale & Order Labels
    ctx.fillStyle = '#64748b';
    ctx.font = '9px "IBM Plex Mono", monospace';
    ctx.fillText('1.6g', 6, padT + 8);
    ctx.fillText('0.8g', 6, padT + plotH / 2 + 4);
    ctx.fillText('0.0g', 6, padT + plotH);

    for (let o = 0; o <= 16; o += 2) {
      const px = padL + (o / 16.0) * plotW;
      ctx.fillText(`${o}X`, px - 6, height - 12);
    }
  }, [orderBins, peaks, dimensions]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padL = 40;
    const padR = 20;
    const plotW = canvas.clientWidth - padL - padR;

    if (x < padL || x > padL + plotW) {
      setHoveredOrder(null);
      return;
    }

    const order = ((x - padL) / plotW) * 16.0;
    // Find closest bin
    let closest = orderBins[0];
    let minDist = Infinity;
    for (const b of orderBins) {
      const d = Math.abs(b.order - order);
      if (d < minDist) {
        minDist = d;
        closest = b;
      }
    }

    setHoveredOrder(closest || null);
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4 w-full max-w-full min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Disc className="w-4 h-4 text-cyan-400" />
            <span>Synchronous Order Tracking (Computed Order Tracking - COT)</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Resampled in angular domain θ(t) = ∫ 2π·f₀ dt · Isolates shaft harmonics independently of throttle transients
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span>Speed: </span>
          <span className="text-cyan-400 font-bold tabular-nums">{rpm.toFixed(0)} RPM</span>
          <span className="text-slate-600">·</span>
          <span>f₀ = {(rpm / 60.0).toFixed(1)} Hz</span>
        </div>
      </div>

      {/* Main Angular Order Canvas */}
      <div ref={containerRef} className="relative w-full h-64 rounded-lg overflow-hidden border border-slate-800 bg-[#050811] min-w-0">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredOrder(null)}
          className="w-full h-full block cursor-crosshair"
        />

        {/* Hover Crosshair Tooltip */}
        {hoveredOrder && (
          <div className="absolute top-3 right-3 bg-slate-950/90 border border-slate-700/80 px-3 py-1.5 rounded-lg text-xs font-mono shadow-lg pointer-events-none">
            <div className="text-cyan-400 font-bold">{hoveredOrder.order.toFixed(2)}X Order</div>
            <div className="text-slate-300">Amplitude: {hoveredOrder.amp.toFixed(3)} g</div>
          </div>
        )}
      </div>

      {/* 4 Distinct Harmonic Order Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
        {/* 1X Order: Shaft Unbalance */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="font-semibold text-sky-400">1X CRANKSHAFT ORDER</span>
            <span className="text-[10px] text-slate-500">1.0 × f₀</span>
          </div>
          <div className="my-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-100 tabular-nums">
              {peaks.amp_1x_g.toFixed(3)}
            </span>
            <span className="text-xs uppercase text-slate-400">g RMS</span>
          </div>
          <div className="text-[11px] text-slate-400 leading-tight">
            Crankshaft unbalance & eccentric rotating mass. Normal: &lt; 0.55g.
          </div>
        </div>

        {/* 2X Order: Second Harmonic */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="font-semibold text-slate-300">2X SECOND ORDER</span>
            <span className="text-[10px] text-slate-500">2.0 × f₀</span>
          </div>
          <div className="my-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-100 tabular-nums">
              {peaks.amp_2x_g.toFixed(3)}
            </span>
            <span className="text-xs uppercase text-slate-400">g RMS</span>
          </div>
          <div className="text-[11px] text-slate-400 leading-tight">
            Shaft misalignment & tunnel bulkhead structural asymmetry.
          </div>
        </div>

        {/* 4X Order: V8 Cylinder Firing Frequency */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="font-semibold text-emerald-400">4X V8 FIRING ORDER</span>
            <span className="text-[10px] text-slate-500">4.0 × f₀</span>
          </div>
          <div className="my-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-100 tabular-nums">
              {peaks.amp_4x_g.toFixed(3)}
            </span>
            <span className="text-xs uppercase text-slate-400">g RMS</span>
          </div>
          <div className="text-[11px] text-slate-400 leading-tight">
            Fundamental combustion gas load (4 cylinder firings per rev).
          </div>
        </div>

        {/* BPFO Order: Bearing Outer Race Flaw */}
        <div className={`bg-slate-950/80 border ${
          peaks.amp_bpfo_g > 0.20 ? 'border-rose-800/80 bg-rose-950/20' : 'border-slate-800'
        } rounded-xl p-3.5 flex flex-col justify-between transition-colors`}>
          <div className="flex items-center justify-between text-slate-400">
            <span className="font-semibold text-rose-400">BPFO ROLLER DEFECT</span>
            <span className="text-[10px] text-slate-500">3.58 × f₀</span>
          </div>
          <div className="my-2 flex items-baseline justify-between">
            <span className={`text-2xl font-bold tabular-nums ${
              peaks.amp_bpfo_g > 0.20 ? 'text-rose-400' : 'text-slate-100'
            }`}>
              {peaks.amp_bpfo_g.toFixed(3)}
            </span>
            <span className="text-xs uppercase text-slate-400">g RMS</span>
          </div>
          <div className="text-[11px] text-slate-400 leading-tight">
            {peaks.amp_bpfo_g > 0.20 ? '▲ Spall Shock Detected on Outer Race' : 'Tunnel roller bearing raceway nominal.'}
          </div>
        </div>
      </div>
    </div>
  );
};
