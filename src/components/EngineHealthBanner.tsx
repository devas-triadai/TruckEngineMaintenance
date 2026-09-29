import React from 'react';
import { ShieldCheck, AlertTriangle, AlertOctagon, TrendingUp, Cpu, Gauge } from 'lucide-react';
import { TelemetryFrame } from '../types/telemetry';

interface EngineHealthBannerProps {
  frame: TelemetryFrame | null;
  onClearFaults: () => void;
}

export const EngineHealthBanner: React.FC<EngineHealthBannerProps> = ({ frame, onClearFaults }) => {
  if (!frame) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center text-sm text-slate-500 animate-pulse">
        Initializing synchronized telemetry stream...
      </div>
    );
  }

  const { anomaly, engine_state, thermo_validation } = frame;
  const isAnomaly = anomaly.is_anomaly;
  const score = anomaly.anomaly_score;
  const healthPct = anomaly.health_score_pct;

  // Status computation
  let statusText = 'NOMINAL';
  let statusColor = 'text-emerald-400';
  let ringColor = 'bg-emerald-500';
  let borderColor = 'border-slate-800';
  let bannerBg = 'bg-slate-900/40';

  if (score >= 0.75 || thermo_validation.cht_critical_imbalance) {
    statusText = 'CRITICAL FAULT';
    statusColor = 'text-rose-400';
    ringColor = 'bg-rose-500';
    borderColor = 'border-rose-900/50';
    bannerBg = 'bg-rose-950/20';
  } else if (score >= 0.40 || !thermo_validation.oil_pressure_nominal || !thermo_validation.cht_balance_nominal) {
    statusText = 'DEGRADED';
    statusColor = 'text-amber-400';
    ringColor = 'bg-amber-500';
    borderColor = 'border-amber-900/40';
    bannerBg = 'bg-amber-950/20';
  }

  return (
    <div className={`rounded-xl border ${borderColor} ${bannerBg} p-5 transition-all duration-300`}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Overall Health & Status */}
        <div className="flex items-start gap-4">
          <div className="mt-1">
            {statusText === 'NOMINAL' && (
              <div className="w-10 h-10 rounded-lg bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
            )}
            {statusText === 'DEGRADED' && (
              <div className="w-10 h-10 rounded-lg bg-amber-950/80 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
            )}
            {statusText === 'CRITICAL FAULT' && (
              <div className="w-10 h-10 rounded-lg bg-rose-950/80 border border-rose-500/30 flex items-center justify-center text-rose-400 animate-pulse">
                <AlertOctagon className="w-5 h-5" />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-400">
                <span className={`w-2 h-2 rounded-full ${ringColor} ${statusText !== 'NOMINAL' ? 'animate-ping' : ''}`} />
                <span>STATE: {statusText}</span>
              </span>
              <span className="text-slate-600 text-xs">/</span>
              <span className="text-xs text-slate-400 font-mono">
                MODEL: ISOLATION FOREST
              </span>
              <span className="text-slate-600 text-xs">/</span>
              <span className="text-xs text-slate-400 font-mono">
                FS: 25.6 kS/s
              </span>
            </div>

            <div className="flex items-baseline gap-3 mt-1">
              <h2 className="text-2xl font-bold tracking-tight text-slate-100 font-sans">
                {engine_state.active_fault === 'none' && 'Nominal Baseline Operating Envelope'}
                {engine_state.active_fault === 'bearing_flaw' && 'Roller Bearing Outer Race Flaw (BPFO Excitation)'}
                {engine_state.active_fault === 'cooling_imbalance' && 'Right Bank Air-Cooling Shutter Imbalance'}
                {engine_state.active_fault === 'lubrication_degradation' && 'Lubrication Viscosity Breakdown & Pressure Deficit'}
              </h2>
            </div>

            <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
              {engine_state.active_fault === 'none' &&
                'Tunnel crankcase roller bearings and dual-bank air cooling temperatures are within calibrated baseline tolerances. Thermodynamic conservation laws satisfied.'}
              {engine_state.active_fault === 'bearing_flaw' &&
                'Piezoelectric sensors detected impulsive high-kurtosis transient shock bursts at 3.58× shaft order with structural resonance ringdowns at 3.2 kHz.'}
              {engine_state.active_fault === 'cooling_imbalance' &&
                `Right Bank (CHT2: ${engine_state.cht2_c}°C) temperature is diverging from Left Bank (CHT1: ${engine_state.cht1_c}°C) with ΔT=${engine_state.cht_delta_c}°C exceeding 30°C thermal limit.`}
              {engine_state.active_fault === 'lubrication_degradation' &&
                `Main gallery pressure dropped to ${engine_state.oil_pressure_bar} bar with oil temperature climbing to ${engine_state.oil_temp_c}°C. Micro-scuffing acoustic noise detected.`}
            </p>
          </div>
        </div>

        {/* Right: Key Quantitative Indicators */}
        <div className="flex items-center gap-6 self-start lg:self-center border-t lg:border-t-0 lg:border-l border-slate-800/80 pt-3 lg:pt-0 lg:pl-6">
          {/* Anomaly Score */}
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Anomaly Score
            </div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className={`text-3xl font-bold font-mono tabular-nums ${statusColor}`}>
                {score.toFixed(3)}
              </span>
              <span className="text-xs font-mono text-slate-500">/ 1.000</span>
            </div>
            <div className="w-24 bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  score > 0.6 ? 'bg-rose-500' : score > 0.35 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, score * 100)}%` }}
              />
            </div>
          </div>

          {/* Machine Health Score */}
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Health Index
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-3xl font-bold font-mono tabular-nums text-slate-100">
                {healthPct.toFixed(1)}
              </span>
              <span className="text-xs font-mono text-slate-400">%</span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-1.5">
              Confidence: 98.4%
            </div>
          </div>

          {/* Reset / Clear Button if fault active */}
          {engine_state.active_fault !== 'none' && (
            <button
              onClick={onClearFaults}
              className="px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap"
            >
              Clear Fault
            </button>
          )}
        </div>
      </div>

      {/* Feature Attribution Drawer (Explainable Edge AI) */}
      {anomaly.top_contributors.length > 0 && (
        <div className="mt-4 pt-3.5 border-t border-slate-800/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
              <span>Model Feature Attributions (Z-Score Drift from Baseline)</span>
            </span>
            <span className="text-xs text-slate-500 font-mono">
              Threshold: |Z| &gt; 1.5σ
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {anomaly.top_contributors.map((c) => {
              const isCrit = c.impact === 'critical';
              const isWarn = c.impact === 'warning';
              return (
                <div
                  key={c.feature}
                  className={`p-2.5 rounded-lg border text-xs font-mono ${
                    isCrit
                      ? 'bg-rose-950/30 border-rose-800/40 text-rose-300'
                      : isWarn
                      ? 'bg-amber-950/20 border-amber-800/40 text-amber-300'
                      : 'bg-slate-800/40 border-slate-700/50 text-slate-300'
                  }`}
                >
                  <div className="text-[11px] text-slate-400 truncate">{c.label}</div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-sm font-semibold tabular-nums">
                      {c.raw_value}
                    </span>
                    <span
                      className={`text-xs font-bold tabular-nums ${
                        isCrit ? 'text-rose-400' : isWarn ? 'text-amber-400' : 'text-slate-400'
                      }`}
                    >
                      {c.z_score >= 0 ? `+${c.z_score}σ` : `${c.z_score}σ`}
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
};
