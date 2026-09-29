import React from 'react';
import { EngineState } from '../types/telemetry';
import { AlertTriangle, Wrench, ShieldAlert, CheckCircle, Flame, Droplet, Disc, Download } from 'lucide-react';

interface FaultInjectionPanelProps {
  engineState: EngineState;
  onInjectFault: (fault: 'none' | 'bearing_flaw' | 'cooling_imbalance' | 'lubrication_degradation', severity: number) => void;
  onSetOperatingPoint: (rpm: number, load: number) => void;
  onExportSnapshot: () => void;
  onRetrainBaseline: () => void;
  isRetraining: boolean;
}

export const FaultInjectionPanel: React.FC<FaultInjectionPanelProps> = ({
  engineState,
  onInjectFault,
  onSetOperatingPoint,
  onExportSnapshot,
  onRetrainBaseline,
  isRetraining,
}) => {
  const currentFault = engineState.active_fault;
  const currentSeverity = engineState.fault_severity || 1.0;

  const handleSeverityChange = (newSev: number) => {
    if (currentFault !== 'none') {
      onInjectFault(currentFault, newSev);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-cyan-400" />
            <span>Testbed Fault Injection & Operating Point Matrix</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Inject calibrated failure modes to validate TRL-4 predictive maintenance models and DSP indicators.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onExportSnapshot}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
            title="Export instantaneous telemetry frame as JSON"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export Snapshot</span>
          </button>
        </div>
      </div>

      {/* Fault Injection Buttons Matrix */}
      <div>
        <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
          <span>Active Testbed Failure Modes</span>
          <span className="text-[11px] text-slate-500 lowercase">select a fault mode to inject</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Nominal Baseline */}
          <button
            onClick={() => onInjectFault('none', 0.0)}
            className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
              currentFault === 'none'
                ? 'bg-emerald-950/40 border-emerald-500/60 ring-1 ring-emerald-500/40'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <CheckCircle className={`w-4 h-4 ${currentFault === 'none' ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span>Nominal Baseline</span>
              </span>
              {currentFault === 'none' && (
                <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">ACTIVE</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Standard operating health. Roller bearings, air cooling shrouds, and oil pressure within baseline envelope.
            </p>
          </button>

          {/* 1. Bearing Flaw */}
          <button
            onClick={() => onInjectFault('bearing_flaw', currentSeverity || 1.0)}
            className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
              currentFault === 'bearing_flaw'
                ? 'bg-rose-950/40 border-rose-500/60 ring-1 ring-rose-500/40'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Disc className={`w-4 h-4 ${currentFault === 'bearing_flaw' ? 'text-rose-400' : 'text-slate-500'}`} />
                <span>Bearing Outer Race Flaw</span>
              </span>
              {currentFault === 'bearing_flaw' && (
                <span className="text-[10px] font-mono text-rose-400 font-bold uppercase">ACTIVE</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Spall on tunnel crankcase roller bearing. Induces impulsive BPFO shocks, kurtosis spike (&gt;6.0), and 3.2 kHz resonance.
            </p>
          </button>

          {/* 2. Cooling Imbalance */}
          <button
            onClick={() => onInjectFault('cooling_imbalance', currentSeverity || 1.0)}
            className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
              currentFault === 'cooling_imbalance'
                ? 'bg-amber-950/40 border-amber-500/60 ring-1 ring-amber-500/40'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Flame className={`w-4 h-4 ${currentFault === 'cooling_imbalance' ? 'text-amber-400' : 'text-slate-500'}`} />
                <span>Cooling Bank Imbalance</span>
              </span>
              {currentFault === 'cooling_imbalance' && (
                <span className="text-[10px] font-mono text-amber-400 font-bold uppercase">ACTIVE</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Right Bank cooling cowl airflow obstruction. CHT2 diverges from CHT1 with thermal delta ΔT &gt; 30°C.
            </p>
          </button>

          {/* 3. Lubrication Degradation */}
          <button
            onClick={() => onInjectFault('lubrication_degradation', currentSeverity || 1.0)}
            className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
              currentFault === 'lubrication_degradation'
                ? 'bg-rose-950/40 border-rose-500/60 ring-1 ring-rose-500/40'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Droplet className={`w-4 h-4 ${currentFault === 'lubrication_degradation' ? 'text-rose-400' : 'text-slate-500'}`} />
                <span>Lubrication Breakdown</span>
              </span>
              {currentFault === 'lubrication_degradation' && (
                <span className="text-[10px] font-mono text-rose-400 font-bold uppercase">ACTIVE</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Oil pump pressure bypass failure & thermal viscosity loss. EOP drops &lt; 1.8 bar, oil temp climbs &gt; 120°C.
            </p>
          </button>
        </div>

        {/* Severity Slider (Enabled when fault is active) */}
        {currentFault !== 'none' && (
          <div className="mt-4 p-3 bg-slate-950/80 border border-slate-800 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Fault Severity Intensity:</span>
              <strong className="text-amber-400">{(currentSeverity * 100).toFixed(0)}%</strong>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-72">
              <span className="text-[10px] text-slate-500 font-mono">10%</span>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={currentSeverity}
                onChange={(e) => handleSeverityChange(parseFloat(e.target.value))}
                className="w-full accent-cyan-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
              />
              <span className="text-[10px] text-slate-500 font-mono">100%</span>
            </div>
          </div>
        )}
      </div>

      {/* Operating Point Controls (RPM & Load) */}
      <div className="border-t border-slate-800/80 pt-4">
        <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">
          Engine Operating Point Regulators (SAE J1939 Dynamic Drive Cycle)
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* RPM Regulator */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-slate-300 font-semibold font-mono">Target Engine Speed</span>
              <span className="text-cyan-400 font-bold font-mono text-sm tabular-nums">
                {engineState.target_rpm} RPM
              </span>
            </div>

            <input
              type="range"
              min="650"
              max="2100"
              step="25"
              value={engineState.target_rpm}
              onChange={(e) => onSetOperatingPoint(parseFloat(e.target.value), engineState.load_pct)}
              className="w-full accent-cyan-500 bg-slate-800 h-2 rounded-lg cursor-pointer my-2"
            />

            <div className="flex items-center justify-between gap-1 text-[11px] font-mono mt-1">
              <button
                onClick={() => onSetOperatingPoint(700, engineState.load_pct)}
                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200"
              >
                700 (Idle)
              </button>
              <button
                onClick={() => onSetOperatingPoint(1300, engineState.load_pct)}
                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200"
              >
                1300 (Max Torque)
              </button>
              <button
                onClick={() => onSetOperatingPoint(1800, engineState.load_pct)}
                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200"
              >
                1800 (Rated)
              </button>
              <button
                onClick={() => onSetOperatingPoint(2100, engineState.load_pct)}
                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200"
              >
                2100 (Max)
              </button>
            </div>
          </div>

          {/* Load Regulator */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-slate-300 font-semibold font-mono">Target Dynamometer Load</span>
              <span className="text-amber-400 font-bold font-mono text-sm tabular-nums">
                {engineState.load_pct.toFixed(0)}% ({engineState.torque_nm.toFixed(0)} N·m)
              </span>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={engineState.load_pct}
              onChange={(e) => onSetOperatingPoint(engineState.target_rpm, parseFloat(e.target.value))}
              className="w-full accent-amber-500 bg-slate-800 h-2 rounded-lg cursor-pointer my-2"
            />

            <div className="flex items-center justify-between gap-1 text-[11px] font-mono mt-1">
              <button
                onClick={() => onSetOperatingPoint(engineState.target_rpm, 10)}
                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200"
              >
                10% (No Load)
              </button>
              <button
                onClick={() => onSetOperatingPoint(engineState.target_rpm, 45)}
                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200"
              >
                45% (Part Load)
              </button>
              <button
                onClick={() => onSetOperatingPoint(engineState.target_rpm, 75)}
                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200"
              >
                75% (Cruise)
              </button>
              <button
                onClick={() => onSetOperatingPoint(engineState.target_rpm, 100)}
                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200"
              >
                100% (Full Stall)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
