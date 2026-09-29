import React, { useRef, useEffect, useState } from 'react';
import { WaveformPoint, DspFeatures } from '../types/telemetry';
import { Sliders, Maximize2, Pause, Play, Eye } from 'lucide-react';

interface OscilloscopeCanvasProps {
  waveform: WaveformPoint[];
  dsp: DspFeatures | null;
  activeFault: string;
}

export const OscilloscopeCanvas: React.FC<OscilloscopeCanvasProps> = ({ waveform, dsp, activeFault }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<'dual' | 'orbit'>('dual');
  const [timebase, setTimebase] = useState<number>(50); // ms
  const [scaleG, setScaleG] = useState<number>(5); // +/- g
  const [showX, setShowX] = useState<boolean>(true);
  const [showY, setShowY] = useState<boolean>(true);
  const [isFrozen, setIsFrozen] = useState<boolean>(false);
  const frozenWaveform = useRef<WaveformPoint[]>([]);

  useEffect(() => {
    if (!isFrozen && waveform.length > 0) {
      frozenWaveform.current = waveform;
    }
  }, [waveform, isFrozen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high-DPI crisp rendering
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    // Dark oscilloscope background
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, width, height);

    // Draw reticle / grid
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#111827';
    const numDivX = 10;
    const numDivY = 8;

    for (let i = 1; i < numDivX; i++) {
      const x = (width / numDivX) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let j = 1; j < numDivY; j++) {
      const y = (height / numDivY) * j;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Center axes (subtle phosphor line)
    ctx.strokeStyle = '#1e293b';
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();
    ctx.setLineDash([]);

    const data = isFrozen ? frozenWaveform.current : waveform;
    if (!data || data.length === 0) return;

    const centerY = height / 2;
    const centerX = width / 2;
    const scaleFactor = (height / 2) / scaleG;

    if (mode === 'dual') {
      // 1. DUAL WAVEFORM OSCILLOSCOPE (Time vs Amplitude)
      const n = data.length;
      const stepX = width / (n - 1);

      // Channel X (Radial-X: Phosphor Cyan)
      if (showX) {
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1.8;
        ctx.shadowColor = 'rgba(6, 182, 212, 0.4)';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const px = i * stepX;
          const py = centerY - data[i].x * scaleFactor;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Channel Y (Radial-Y: Telemetry Amber)
      if (showY) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.8;
        ctx.shadowColor = 'rgba(251, 191, 36, 0.4)';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const px = i * stepX;
          const py = centerY - data[i].y * scaleFactor;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // Draw baseline trigger / scale legend
      ctx.fillStyle = '#64748b';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.fillText(`+${scaleG.toFixed(1)}g`, 8, 16);
      ctx.fillText(`0.0g`, 8, centerY - 4);
      ctx.fillText(`-${scaleG.toFixed(1)}g`, 8, height - 8);
      ctx.fillText(`0 ms`, 40, height - 8);
      ctx.fillText(`${timebase} ms window (25.6 kS/s)`, width - 160, height - 8);
    } else {
      // 2. LISSAJOUS ORBIT MODE (Radial-X vs Radial-Y)
      // Visualizes shaft journal precession inside the tunnel roller bearing seat
      const n = data.length;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.6;
      ctx.shadowColor = 'rgba(56, 189, 248, 0.4)';
      ctx.shadowBlur = 5;

      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const px = centerX + data[i].x * scaleFactor;
        const py = centerY - data[i].y * scaleFactor;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw orbit clearance boundary circle
      ctx.strokeStyle = '#334155';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(centerX, centerY, 3.5 * scaleFactor, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#64748b';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.fillText('RADIAL-Y (VERTICAL ACCEL)', centerX + 8, 16);
      ctx.fillText('RADIAL-X (HORIZONTAL ACCEL)', width - 180, centerY - 6);
      ctx.fillText('CLEARANCE ENVELOPE', centerX - 60, centerY - 3.7 * scaleFactor);
    }
  }, [waveform, mode, scaleG, timebase, showX, showY, isFrozen]);

  const xKurt = dsp?.radial_x.time.kurtosis ?? 3.0;
  const yKurt = dsp?.radial_y.time.kurtosis ?? 3.0;
  const xRms = dsp?.radial_x.time.rms ?? 0.0;
  const yRms = dsp?.radial_y.time.rms ?? 0.0;
  const xCf = dsp?.radial_x.time.crest_factor ?? 3.0;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col">
      {/* Header with Title & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <span>Synchronous Biaxial Vibration Oscilloscope</span>
          </h3>
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span>25.6 kS/s</span>
            <span aria-hidden="true">·</span>
            <span>Piezo Biaxial</span>
          </div>
        </div>

        {/* View Mode & Timebase Controls */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setMode('dual')}
              className={`px-2.5 py-1 rounded transition-colors ${
                mode === 'dual'
                  ? 'bg-slate-800 text-cyan-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Time Domain
            </button>
            <button
              onClick={() => setMode('orbit')}
              className={`px-2.5 py-1 rounded transition-colors ${
                mode === 'orbit'
                  ? 'bg-slate-800 text-cyan-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Lissajous Orbit: Radial-X vs Radial-Y shaft trajectory"
            >
              Orbit (X vs Y)
            </button>
          </div>

          {/* Scale selector */}
          <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 text-slate-300 font-mono">
            <span className="text-slate-500">Scale:</span>
            <button
              onClick={() => setScaleG(scaleG === 2 ? 5 : scaleG === 5 ? 10 : scaleG === 10 ? 20 : 2)}
              className="hover:text-cyan-400 font-bold"
            >
              ±{scaleG}g
            </button>
          </div>

          {/* Channel Toggles */}
          {mode === 'dual' && (
            <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setShowX(!showX)}
                className={`flex items-center gap-1 font-mono transition-opacity ${
                  showX ? 'text-cyan-400' : 'text-slate-600'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span>CH-X</span>
              </button>
              <span className="text-slate-700">|</span>
              <button
                onClick={() => setShowY(!showY)}
                className={`flex items-center gap-1 font-mono transition-opacity ${
                  showY ? 'text-amber-400' : 'text-slate-600'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>CH-Y</span>
              </button>
            </div>
          )}

          {/* Freeze */}
          <button
            onClick={() => setIsFrozen(!isFrozen)}
            className={`p-1.5 rounded-lg border transition-colors ${
              isFrozen
                ? 'bg-amber-950/60 text-amber-300 border-amber-800/40'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title={isFrozen ? 'Resume live stream' : 'Freeze trace'}
          >
            {isFrozen ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Canvas */}
      <div className="relative w-full h-64 rounded-lg overflow-hidden border border-slate-800 bg-[#050811]">
        <canvas ref={canvasRef} className="w-full h-full block cursor-crosshair" />

        {/* Live Kurtosis & Shock Alert Tag on Canvas */}
        {xKurt > 5.0 && (
          <div className="absolute top-3 right-3 bg-rose-950/80 border border-rose-700 text-rose-300 px-2 py-1 rounded text-xs font-mono animate-pulse">
            HIGH PEAKEDNESS: KURTOSIS {xKurt.toFixed(1)}
          </div>
        )}
      </div>

      {/* DSP Time-Domain Readouts Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mt-3 text-xs font-mono">
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2">
          <div className="text-[11px] text-cyan-400 font-semibold">RADIAL-X RMS</div>
          <div className="text-sm font-bold text-slate-200 tabular-nums mt-0.5">{xRms} g</div>
          <div className="text-[10px] text-slate-500">Horizontal Bulkhead</div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2">
          <div className="text-[11px] text-amber-400 font-semibold">RADIAL-Y RMS</div>
          <div className="text-sm font-bold text-slate-200 tabular-nums mt-0.5">{yRms} g</div>
          <div className="text-[10px] text-slate-500">Bearing Crown</div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2">
          <div className="text-[11px] text-slate-400">CH-X KURTOSIS</div>
          <div className={`text-sm font-bold tabular-nums mt-0.5 ${xKurt > 5.0 ? 'text-rose-400' : 'text-slate-200'}`}>
            {xKurt}
          </div>
          <div className="text-[10px] text-slate-500">Norm: 2.8 - 3.2</div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2">
          <div className="text-[11px] text-slate-400">CH-Y KURTOSIS</div>
          <div className={`text-sm font-bold tabular-nums mt-0.5 ${yKurt > 5.0 ? 'text-rose-400' : 'text-slate-200'}`}>
            {yKurt}
          </div>
          <div className="text-[10px] text-slate-500">Norm: 2.8 - 3.2</div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2">
          <div className="text-[11px] text-slate-400">CREST FACTOR</div>
          <div className={`text-sm font-bold tabular-nums mt-0.5 ${xCf > 4.5 ? 'text-amber-400' : 'text-slate-200'}`}>
            {xCf}
          </div>
          <div className="text-[10px] text-slate-500">0-Peak / RMS</div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2">
          <div className="text-[11px] text-slate-400">BIAXIAL RATIO</div>
          <div className="text-sm font-bold text-slate-200 tabular-nums mt-0.5">
            {dsp?.cross_axis.rms_ratio_xy ?? 1.0}
          </div>
          <div className="text-[10px] text-slate-500">X/Y Orthogonal</div>
        </div>
      </div>
    </div>
  );
};
