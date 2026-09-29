import React from 'react';
import { EngineState, ThermoValidation } from '../types/telemetry';
import { Gauge, Thermometer, Droplets, Wind, Zap, AlertCircle, CheckCircle } from 'lucide-react';

interface EcuGaugesProps {
  state: EngineState;
  thermo: ThermoValidation;
}

export const EcuGauges: React.FC<EcuGaugesProps> = ({ state, thermo }) => {
  const {
    rpm,
    torque_nm,
    power_kw,
    load_pct,
    oil_pressure_bar,
    oil_temp_c,
    cht1_c,
    cht2_c,
    cht_delta_c,
    boost_pressure_bar,
    cooling_valve_pct
  } = state;

  return (
    <div className="space-y-4">
      {/* Thermodynamic Invariants Status Strip */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-semibold uppercase tracking-wider">
            Thermodynamic Invariants:
          </span>
          <span className="text-slate-200">
            Score: <strong className="text-cyan-400 tabular-nums">{thermo.thermo_health_score}%</strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                thermo.oil_pressure_nominal ? 'bg-emerald-400' : 'bg-rose-500 animate-ping'
              }`}
            />
            <span className={thermo.oil_pressure_nominal ? 'text-slate-300' : 'text-rose-400 font-bold'}>
              EOP vs RPM (min {thermo.min_expected_eop_bar} bar)
            </span>
          </div>

          <span className="text-slate-700">·</span>

          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                thermo.cht_balance_nominal ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span className={thermo.cht_balance_nominal ? 'text-slate-300' : 'text-amber-400 font-bold'}>
              CHT Bank Balance (ΔT {cht_delta_c}°C)
            </span>
          </div>

          <span className="text-slate-700">·</span>

          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-slate-300">
              P_brake = (τ × N)/9549 ({power_kw} kW)
            </span>
          </div>
        </div>
      </div>

      {/* Thermodynamic Violations Notification if any */}
      {thermo.violations.length > 0 && (
        <div className="bg-rose-950/20 border border-rose-800/40 rounded-xl p-3 text-xs text-rose-300 font-mono space-y-1">
          {thermo.violations.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main 6 ECU Instruments Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* 1. Engine Speed (RPM, SPN 190) */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-cyan-400" />
              <span>Engine Speed (SPN 190)</span>
            </span>
            <span className="font-mono">CRANKSHAFT</span>
          </div>

          <div className="my-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-slate-100 tabular-nums">
              {rpm.toFixed(0)}
            </span>
            <span className="text-xs uppercase font-mono text-slate-400">RPM</span>
          </div>

          {/* RPM Bar Indicator */}
          <div>
            <div className="flex justify-between text-[10px] text-slate-500 font-mono mb-1">
              <span>650 IDLE</span>
              <span>1800 RATED</span>
              <span>2200 REDLINE</span>
            </div>
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-300 ${
                  rpm > 2000 ? 'bg-rose-500' : rpm > 1700 ? 'bg-amber-500' : 'bg-cyan-500'
                }`}
                style={{ width: `${Math.min(100, ((rpm - 600) / 1600) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* 2. Torque & Power (SPN 92) */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Torque & Power (SPN 92)</span>
            </span>
            <span className="font-mono">12.7L V8 DIESEL</span>
          </div>

          <div className="my-3 flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-slate-100 tabular-nums">
                {torque_nm.toFixed(0)}
              </span>
              <span className="text-xs uppercase font-mono text-slate-400">N·m</span>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold font-mono text-amber-400 tabular-nums">
                {power_kw.toFixed(0)}
              </span>
              <span className="text-xs uppercase font-mono text-slate-400 ml-1">kW</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[10px] text-slate-500 font-mono mb-1">
              <span>0% LOAD</span>
              <span>LOAD: {load_pct.toFixed(0)}%</span>
              <span>1500 N·m MAX</span>
            </div>
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${Math.min(100, load_pct)}%` }}
              />
            </div>
          </div>
        </div>

        {/* 3. Engine Oil Pressure (EOP, SPN 100) */}
        <div className={`bg-slate-900/60 border ${
          thermo.oil_pressure_nominal ? 'border-slate-800' : 'border-rose-800/80 bg-rose-950/10'
        } rounded-xl p-4 flex flex-col justify-between transition-colors`}>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-cyan-400" />
              <span>Oil Pressure (SPN 100)</span>
            </span>
            <span className="font-mono">GALLERY</span>
          </div>

          <div className="my-3 flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-3xl font-bold font-mono tabular-nums ${
                  thermo.oil_pressure_nominal ? 'text-slate-100' : 'text-rose-400'
                }`}
              >
                {oil_pressure_bar.toFixed(2)}
              </span>
              <span className="text-xs uppercase font-mono text-slate-400">BAR</span>
            </div>
            <div className="text-right text-[11px] font-mono text-slate-500">
              Min env: <span className="text-slate-300">{thermo.min_expected_eop_bar.toFixed(1)} bar</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[10px] text-slate-500 font-mono mb-1">
              <span>1.0 CRIT</span>
              <span>DYNAMIC ENVELOPE</span>
              <span>6.0 MAX</span>
            </div>
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-300 ${
                  thermo.oil_pressure_nominal ? 'bg-cyan-500' : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(100, (oil_pressure_bar / 6.0) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* 4. Engine Oil Temperature (EOT, SPN 175) */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5 text-amber-400" />
              <span>Oil Temperature (SPN 175)</span>
            </span>
            <span className="font-mono">SUMP</span>
          </div>

          <div className="my-3 flex items-baseline gap-2">
            <span
              className={`text-3xl font-bold font-mono tabular-nums ${
                oil_temp_c > 115 ? 'text-rose-400' : 'text-slate-100'
              }`}
            >
              {oil_temp_c.toFixed(1)}
            </span>
            <span className="text-xs uppercase font-mono text-slate-400">°C</span>
          </div>

          <div>
            <div className="flex justify-between text-[10px] text-slate-500 font-mono mb-1">
              <span>60°C WARMUP</span>
              <span>85-110°C OPTIMAL</span>
              <span>125°C MAX</span>
            </div>
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-300 ${
                  oil_temp_c > 115 ? 'bg-rose-500' : 'bg-amber-500'
                }`}
                style={{ width: `${Math.min(100, ((oil_temp_c - 50) / 80) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* 5. CHT Bank Balance (Left vs Right Bank) */}
        <div className={`bg-slate-900/60 border ${
          thermo.cht_critical_imbalance ? 'border-rose-800/80 bg-rose-950/10' : 'border-slate-800'
        } rounded-xl p-4 flex flex-col justify-between transition-colors`}>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5 text-cyan-400" />
              <span>CHT Bank Balance</span>
            </span>
            <span className="font-mono">AIR-COOLED HEADS</span>
          </div>

          <div className="my-2 grid grid-cols-2 gap-2 text-center">
            <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-500 font-mono">BANK 1 (LEFT)</div>
              <div className="text-lg font-bold font-mono text-slate-100 tabular-nums">
                {cht1_c.toFixed(1)}°C
              </div>
            </div>
            <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-500 font-mono">BANK 2 (RIGHT)</div>
              <div className={`text-lg font-bold font-mono tabular-nums ${
                thermo.cht_critical_imbalance ? 'text-rose-400' : 'text-slate-100'
              }`}>
                {cht2_c.toFixed(1)}°C
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-500">Differential ΔT:</span>
            <span
              className={`font-bold tabular-nums ${
                cht_delta_c > 30 ? 'text-rose-400' : cht_delta_c > 18 ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {cht_delta_c.toFixed(1)}°C {cht_delta_c > 30 ? '(CRITICAL IMBALANCE)' : '(BALANCED)'}
            </span>
          </div>
        </div>

        {/* 6. Turbo Boost & Hydraulic Blower Fan Valve */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Wind className="w-3.5 h-3.5 text-sky-400" />
              <span>Boost & Cooling Blower</span>
            </span>
            <span className="font-mono">HYDRAULIC BLOWER</span>
          </div>

          <div className="my-3 flex items-baseline justify-between">
            <div>
              <div className="text-[10px] text-slate-500 font-mono">BOOST (SPN 102)</div>
              <div className="text-2xl font-bold font-mono text-slate-100 tabular-nums">
                {boost_pressure_bar.toFixed(2)} <span className="text-xs text-slate-400 font-normal">BAR</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-500 font-mono">FAN VALVE PWM</div>
              <div className="text-2xl font-bold font-mono text-sky-400 tabular-nums">
                {cooling_valve_pct.toFixed(0)} <span className="text-xs text-slate-400 font-normal">%</span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[10px] text-slate-500 font-mono mb-1">
              <span>1.0 ATM</span>
              <span>TWIN TURBO CHARGE</span>
              <span>2.4 BAR MAX</span>
            </div>
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-sky-500 transition-all duration-300"
                style={{ width: `${Math.min(100, ((boost_pressure_bar - 1.0) / 1.4) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
