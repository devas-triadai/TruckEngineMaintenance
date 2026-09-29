import React, { useRef, useEffect, useState } from 'react';
import { FftPoint, DspFeatures } from '../types/telemetry';
import { BarChart3, Layers, Crosshair } from 'lucide-react';

interface OrderSpectrumCanvasProps {
  fftX: FftPoint[];
  fftY: FftPoint[];
  dsp: DspFeatures | null;
  rpm: number;
}

export const OrderSpectrumCanvas: React.FC<OrderSpectrumCanvasProps> = ({ fftX, fftY, dsp, rpm }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [scaleMode, setScaleMode] = useState<'linear' | 'db'>('linear');
  const [selectedChannel, setSelectedChannel] = useState<'x' | 'y' | 'both'>('x');
  const [hoverInfo, setHoverInfo] = useState<{ freq: number; amp: number; order: string } | null>(null);

  const f0 = Math.max(1.0, rpm / 60.0);
  const f4 = 4.0 * f0;
  const bpfo = 3.58 * f0;

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

    // Dark background
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, width, height);

    // Padding for axes
    const padL = 40;
    const padR = 20;
    const padT = 25;
    const padB = 30;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    // Grid lines
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1;
    for (let f = 500; f <= 5500; f += 500) {
      const px = padL + (f / 6000.0) * plotW;
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

    // High-Frequency Bearing Resonance Zone Highlight (2000 - 4500 Hz)
    const hfStart = padL + (2000.0 / 6000.0) * plotW;
    const hfEnd = padL + (4500.0 / 6000.0) * plotW;
    ctx.fillStyle = 'rgba(239, 68, 68, 0.04)';
    ctx.fillRect(hfStart, padT, hfEnd - hfStart, plotH);
    ctx.fillStyle = '#475569';
    ctx.font = '9px "IBM Plex Mono", monospace';
    ctx.fillText('BEARING RESONANCE ZONE (2.0 - 4.5 kHz)', hfStart + 6, padT + 12);

    const renderCurve = (data: FftPoint[], strokeStyle: string, fillGradient: CanvasGradient | string) => {
      if (!data || data.length === 0) return;
      const n = data.length;

      ctx.beginPath();
      ctx.moveTo(padL, padT + plotH);

      for (let i = 0; i < n; i++) {
        const pt = data[i];
        const px = padL + (pt.freq / 6000.0) * plotW;
        let normY = 0;
        if (scaleMode === 'linear') {
          normY = Math.min(1.0, pt.amp / 1.8);
        } else {
          // dB range -60 dB to 0 dB
          normY = Math.max(0.0, Math.min(1.0, (pt.db + 60) / 60.0));
        }
        const py = padT + plotH - normY * plotH;
        ctx.lineTo(px, py);
      }

      ctx.lineTo(padL + plotW, padT + plotH);
      ctx.closePath();

      ctx.fillStyle = fillGradient;
      ctx.fill();

      // Stroke line
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const pt = data[i];
        const px = padL + (pt.freq / 6000.0) * plotW;
        let normY = 0;
        if (scaleMode === 'linear') {
          normY = Math.min(1.0, pt.amp / 1.8);
        } else {
          normY = Math.max(0.0, Math.min(1.0, (pt.db + 60) / 60.0));
        }
        const py = padT + plotH - normY * plotH;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };

    // Render channels
    if (selectedChannel === 'x' || selectedChannel === 'both') {
      const gradX = ctx.createLinearGradient(0, padT, 0, padT + plotH);
      gradX.addColorStop(0, 'rgba(6, 182, 212, 0.25)');
      gradX.addColorStop(1, 'rgba(6, 182, 212, 0.01)');
      renderCurve(fftX, '#06b6d4', gradX);
    }

    if (selectedChannel === 'y' || selectedChannel === 'both') {
      const gradY = ctx.createLinearGradient(0, padT, 0, padT + plotH);
      gradY.addColorStop(0, 'rgba(251, 191, 36, 0.20)');
      gradY.addColorStop(1, 'rgba(251, 191, 36, 0.01)');
      renderCurve(fftY, '#fbbf24', gradY);
    }

    // DRAW ORDER TRACKING ANNOTATIONS (1X, 2X, 4X V8 Firing, BPFO)
    const drawOrderMarker = (freq: number, label: string, color: string, sublabel: string) => {
      if (freq > 6000) return;
      const px = padL + (freq / 6000.0) * plotW;

      ctx.strokeStyle = color;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px, padT);
      ctx.lineTo(px, padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label pin
      ctx.fillStyle = color;
      ctx.font = 'bold 9px "IBM Plex Mono", monospace';
      ctx.fillText(label, px + 3, padT + 12);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '8px "IBM Plex Mono", monospace';
      ctx.fillText(`${freq.toFixed(1)}Hz`, px + 3, padT + 22);
    };

    drawOrderMarker(f0, '1X (SHAFT)', '#38bdf8', 'f0');
    drawOrderMarker(2 * f0, '2X (ASYM)', '#94a3b8', '2*f0');
    drawOrderMarker(f4, '4X (V8 FIRING)', '#10b981', '4*f0');
    drawOrderMarker(bpfo, 'BPFO (BEARING)', '#f43f5e', '3.58*f0');

    // Axes scale typography
    ctx.fillStyle = '#64748b';
    ctx.font = '9px "IBM Plex Mono", monospace';
    ctx.fillText(scaleMode === 'linear' ? '1.8g' : '0dB', 6, padT + 8);
    ctx.fillText(scaleMode === 'linear' ? '0.9g' : '-30dB', 6, padT + plotH / 2 + 4);
    ctx.fillText(scaleMode === 'linear' ? '0.0g' : '-60dB', 6, padT + plotH);

    for (let f = 0; f <= 6000; f += 1000) {
      const px = padL + (f / 6000.0) * plotW;
      ctx.fillText(`${f}Hz`, px - 12, height - 12);
    }
  }, [fftX, fftY, scaleMode, selectedChannel, rpm, dimensions]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padL = 40;
    const padR = 20;
    const plotW = canvas.clientWidth - padL - padR;

    if (x < padL || x > padL + plotW) {
      setHoverInfo(null);
      return;
    }

    const freq = ((x - padL) / plotW) * 6000;
    const orderNum = freq / f0;

    // Find nearest bin
    const data = selectedChannel === 'y' ? fftY : fftX;
    let closestAmp = 0;
    for (const pt of data) {
      if (Math.abs(pt.freq - freq) < 25) {
        closestAmp = pt.amp;
        break;
      }
    }

    let orderTag = `${orderNum.toFixed(2)}X Order`;
    if (Math.abs(orderNum - 1.0) < 0.1) orderTag = '1X Fundamental Shaft';
    else if (Math.abs(orderNum - 4.0) < 0.15) orderTag = '4X V8 Firing Order';
    else if (Math.abs(orderNum - 3.58) < 0.15) orderTag = 'BPFO Roller Defect';

    setHoverInfo({
      freq: Math.round(freq),
      amp: closestAmp,
      order: orderTag
    });
  };

  const handleMouseLeave = () => setHoverInfo(null);

  const specX = dsp?.radial_x.spectral;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col w-full max-w-full min-w-0 overflow-hidden">
      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <span>Rotational Order Spectrum & FFT Analysis</span>
          </h3>
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span>0 – 6,000 Hz</span>
            <span aria-hidden="true">·</span>
            <span>Welch PSD</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {/* Channel Selector */}
          <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 font-mono">
            <button
              onClick={() => setSelectedChannel('x')}
              className={`px-2.5 py-1 rounded transition-colors ${
                selectedChannel === 'x' ? 'bg-slate-800 text-cyan-300 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Rad-X
            </button>
            <button
              onClick={() => setSelectedChannel('y')}
              className={`px-2.5 py-1 rounded transition-colors ${
                selectedChannel === 'y' ? 'bg-slate-800 text-amber-300 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Rad-Y
            </button>
            <button
              onClick={() => setSelectedChannel('both')}
              className={`px-2.5 py-1 rounded transition-colors ${
                selectedChannel === 'both' ? 'bg-slate-800 text-slate-200 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Both
            </button>
          </div>

          {/* Scale mode: Linear vs dB */}
          <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 font-mono">
            <button
              onClick={() => setScaleMode('linear')}
              className={`px-2 py-1 rounded transition-colors ${
                scaleMode === 'linear' ? 'bg-slate-800 text-cyan-300 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Linear (g)
            </button>
            <button
              onClick={() => setScaleMode('db')}
              className={`px-2 py-1 rounded transition-colors ${
                scaleMode === 'db' ? 'bg-slate-800 text-cyan-300 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Log (dB)
            </button>
          </div>
        </div>
      </div>

      {/* Spectrum Canvas */}
      <div ref={containerRef} className="relative w-full h-64 rounded-lg overflow-hidden border border-slate-800 bg-[#050811] min-w-0">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="w-full h-full block cursor-crosshair"
        />

        {/* Hover Crosshair Tooltip */}
        {hoverInfo && (
          <div className="absolute top-3 right-3 bg-slate-950/90 border border-slate-700/80 px-3 py-1.5 rounded-lg text-xs font-mono shadow-lg pointer-events-none">
            <div className="text-cyan-400 font-bold">{hoverInfo.freq} Hz ({hoverInfo.order})</div>
            <div className="text-slate-300">Spectral Peak: {hoverInfo.amp.toFixed(3)} g</div>
          </div>
        )}
      </div>

      {/* Rotational Order Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 mt-3 text-xs font-mono">
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2">
          <div className="text-[11px] text-sky-400 font-semibold">1X SHAFT ORDER</div>
          <div className="text-sm font-bold text-slate-200 tabular-nums mt-0.5">
            {specX?.energy_1x ?? 0.0} g
          </div>
          <div className="text-[10px] text-slate-500">f0: {f0.toFixed(1)} Hz</div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2">
          <div className="text-[11px] text-emerald-400 font-semibold">4X V8 FIRING ORDER</div>
          <div className="text-sm font-bold text-slate-200 tabular-nums mt-0.5">
            {specX?.energy_4x ?? 0.0} g
          </div>
          <div className="text-[10px] text-slate-500">4*f0: {f4.toFixed(1)} Hz</div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2">
          <div className="text-[11px] text-rose-400 font-semibold">BEARING HF BAND</div>
          <div className={`text-sm font-bold tabular-nums mt-0.5 ${
            (specX?.energy_hf_bearing ?? 0) > 0.25 ? 'text-rose-400' : 'text-slate-200'
          }`}>
            {specX?.energy_hf_bearing ?? 0.0} g
          </div>
          <div className="text-[10px] text-slate-500">2.0 – 6.0 kHz</div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2">
          <div className="text-[11px] text-slate-400">DOMINANT PEAK</div>
          <div className="text-sm font-bold text-slate-200 tabular-nums mt-0.5">
            {specX?.dominant_freq_hz ?? 0.0} Hz
          </div>
          <div className="text-[10px] text-slate-500">Amp: {specX?.dominant_amp_g ?? 0.0} g</div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2">
          <div className="text-[11px] text-slate-400">BPFO DEFECT FREQ</div>
          <div className="text-sm font-bold text-slate-200 tabular-nums mt-0.5">
            {bpfo.toFixed(1)} Hz
          </div>
          <div className="text-[10px] text-slate-500">Outer Race Spall</div>
        </div>
      </div>
    </div>
  );
};
