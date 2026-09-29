import React from 'react';
import { ShieldCheck, AlertTriangle, AlertOctagon, TrendingUp, Sparkles, Activity, Gauge, Flame, Droplet, Wind } from 'lucide-react';
import { TelemetryFrame } from '../types/telemetry';

interface EngineHealthBannerProps {
  frame: TelemetryFrame | null;
  onClearFaults: () => void;
  onOpenDiagnostics: () => void;
}

export const EngineHealthBanner: React.FC<EngineHealthBannerProps> = ({
  frame,
  onClearFaults,
  onOpenDiagnostics
}) => {
  if (!frame) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center text-sm text-slate-500 animate-pulse">
        Initializing synchronized multimodal telemetry stream...
      </div>
    );
  }

  const { anomaly, engine_state, thermo_validation, ehi, source } = frame;
  const isAnomaly = anomaly.is_anomaly;
  const anomalyScore = anomaly.anomaly_score;
  const overallEhi = ehi?.overall_ehi ?? anomaly.health_score_pct;
  const ehiStatus = ehi?.status ?? (overallEhi >= 80 ? 'HEALTHY' : overallEhi >= 60 ? 'DEGRADED' : 'CRITICAL');
  const isoZone = ehi?.iso_10816_zone ?? 'Zone A (Nominal)';
  const subScores = ehi?.sub_scores || {
    vibration: 95.0,
    thermal: 92.0,
    lubrication: 94.0,
    combustion: 96.0
  };

  // Status computation
  let statusText: string = ehiStatus;
  let statusColor = 'text-emerald-400';
  let ringColor = 'bg-emerald-500';
  let borderColor = 'border-slate-800';
  let bannerBg = 'bg-slate-900/40';

  if (ehiStatus === 'CRITICAL' || anomalyScore >= 0.75 || thermo_validation.cht_critical_imbalance) {
    statusText = 'CRITICAL FAULT';
    statusColor = 'text-rose-400';
    ringColor = 'bg-rose-500';
    borderColor = 'border-rose-900/50';
    bannerBg = 'bg-rose-950/20';
  } else if (ehiStatus === 'DEGRADED' || anomalyScore >= 0.40 || !thermo_validation.oil_pressure_nominal || !thermo_validation.cht_balance_nominal) {
    statusText = 'DEGRADED';
    statusColor = 'text-amber-400';
    ringColor = 'bg-amber-500';
    borderColor = 'border-amber-900/40';
    bannerBg = 'bg-amber-950/20';
  }

  return (
    <div className={`rounded-xl border ${borderColor} ${bannerBg} p-5 transition-all duration-300 space-y-4`}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Overall Health & Status */}
        <div className="flex items-start gap-4">
          <div className="mt-1">
            {statusText === 'HEALTHY' && (
              <div className="w-10 h-10 rounded-lg bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
            )}
            {statusText === 'DEGRADED' && (
              <div className="w-10 h-10 rounded-lg bg-amber-950/80 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
            )}
            {(statusText === 'CRITICAL' || statusText === 'CRITICAL FAULT') && (
              <div className="w-10 h-10 rounded-lg bg-rose-950/80 border border-rose-500/30 flex items-center justify-center text-rose-400 animate-pulse">
                <AlertOctagon className="w-5 h-5" />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-400">
                <span className={`w-2 h-2 rounded-full ${ringColor} ${statusText !== 'HEALTHY' ? 'animate-ping' : ''}`} />
                <span>STATE: {statusText}</span>
              </span>
              <span className="text-slate-600 text-xs">/</span>
              <span className="text-xs text-slate-400 font-mono">
                ISO 10816-6: <strong className="text-slate-200">{isoZone}</strong>
              </span>
              <span className="text-slate-600 text-xs">/</span>
              <span className="text-xs text-slate-400 font-mono uppercase">
                SOURCE: <strong className="text-cyan-400">{source || 'SIMULATOR'}</strong>
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
                'Tunnel crankcase roller bearings and dual-bank air cooling temperatures are within calibrated baseline tolerances. Continuous ISO 10816-6 vibration severity rating is in Zone A.'}
              {engine_state.active_fault === 'bearing_flaw' &&
                'Piezoelectric sensors detected impulsive high-kurtosis transient shock bursts at 3.58× shaft order with structural resonance ringdowns at 3.2 kHz.'}
              {engine_state.active_fault === 'cooling_imbalance' &&
                `Right Bank (CHT2: ${engine_state.cht2_c}°C) temperature is diverging from Left Bank (CHT1: ${engine_state.cht1_c}°C) with ΔT=${engine_state.cht_delta_c}°C exceeding 30°C thermal limit.`}
              {engine_state.active_fault === 'lubrication_degradation' &&
                `Main gallery pressure dropped to ${engine_state.oil_pressure_bar} bar with oil temperature climbing to ${engine_state.oil_temp_c}°C. Hydrodynamic boundary lubrication compromised.`}
            </p>
          </div>
        </div>

        {/* Right: Key Quantitative Indicators */}
        <div className="flex items-center gap-6 self-start lg:self-center border-t lg:border-t-0 lg:border-l border-slate-800/80 pt-3 lg:pt-0 lg:pl-6">
          {/* Continuous Engine Health Index (EHI) */}
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Engine Health Index (EHI)
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className={`text-3xl font-bold font-mono tabular-nums ${statusColor}`}>
                {overallEhi.toFixed(1)}
              </span>
              <span className="text-xs font-mono text-slate-400">/ 100</span>
            </div>
            <div className="w-28 bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  overallEhi < 60 ? 'bg-rose-500' : overallEhi < 80 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, overallEhi)}%` }}
              />
            </div>
          </div>

          {/* Anomaly Score */}
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Anomaly Score
            </div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-3xl font-bold font-mono tabular-nums text-slate-200">
                {anomalyScore.toFixed(3)}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-1.5">
              Isolation Forest
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            <button
              onClick={onOpenDiagnostics}
              className="px-3.5 py-2 text-xs font-medium text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 font-mono shadow-md"
              title="Run 100% Offline BEML Expert Diagnostics on internal DSP anomaly vectors"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>BEML Expert Analysis</span>
            </button>

            {engine_state.active_fault !== 'none' && (
              <button
                onClick={onClearFaults}
                className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap text-center"
              >
                Clear Fault
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ISO 10816-6 EHI Multi-Factor Sub-Scores Ribbon */}
      <div className="pt-3.5 border-t border-slate-800/80">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
            ISO 10816-6 Multi-Factor Sub-Score Matrix
          </span>
          <span className="text-xs text-slate-500 font-mono">
            Primary Stressor: <strong className="text-slate-300">{ehi?.primary_stressor || 'None'}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          {/* Vibration Score (35%) */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3 text-cyan-400" />
                <span>Vibration (35%)</span>
              </span>
              <span className="text-[10px] text-slate-500">ISO Zone</span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-base font-bold tabular-nums ${
                subScores.vibration < 60 ? 'text-rose-400' : subScores.vibration < 80 ? 'text-amber-400' : 'text-slate-100'
              }`}>
                {subScores.vibration.toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-400">{isoZone.split(' ')[0]}</span>
            </div>
          </div>

          {/* Thermal Balance Score (25%) */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-400" />
                <span>Thermal Balance (25%)</span>
              </span>
              <span className="text-[10px] text-slate-500">CHT ΔT</span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-base font-bold tabular-nums ${
                subScores.thermal < 60 ? 'text-rose-400' : subScores.thermal < 80 ? 'text-amber-400' : 'text-slate-100'
              }`}>
                {subScores.thermal.toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-400">ΔT: {engine_state.cht_delta_c}°C</span>
            </div>
          </div>

          {/* Lubrication Score (20%) */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="flex items-center gap-1">
                <Droplet className="w-3 h-3 text-sky-400" />
                <span>Lubrication (20%)</span>
              </span>
              <span className="text-[10px] text-slate-500">Hydrodynamic</span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-base font-bold tabular-nums ${
                subScores.lubrication < 60 ? 'text-rose-400' : subScores.lubrication < 80 ? 'text-amber-400' : 'text-slate-100'
              }`}>
                {subScores.lubrication.toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-400">{engine_state.oil_pressure_bar} bar</span>
            </div>
          </div>

          {/* Combustion & Volumetric Efficiency (20%) */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="flex items-center gap-1">
                <Wind className="w-3 h-3 text-emerald-400" />
                <span>Combustion (20%)</span>
              </span>
              <span className="text-[10px] text-slate-500">Turbo/Torque</span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-base font-bold tabular-nums ${
                subScores.combustion < 60 ? 'text-rose-400' : subScores.combustion < 80 ? 'text-amber-400' : 'text-slate-100'
              }`}>
                {subScores.combustion.toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-400">{engine_state.boost_pressure_bar} bar</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
