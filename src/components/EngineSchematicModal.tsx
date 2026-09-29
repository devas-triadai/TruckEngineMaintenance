import React from 'react';
import { EngineState, ThermoValidation } from '../types/telemetry';
import { Cpu, Wind, Droplets, Disc, Thermometer, Radio, CheckCircle2, AlertOctagon } from 'lucide-react';

interface EngineSchematicProps {
  state: EngineState;
  thermo: ThermoValidation;
}

export const EngineSchematic: React.FC<EngineSchematicProps> = ({ state, thermo }) => {
  const isBearingFault = state.active_fault === 'bearing_flaw';
  const isCoolingFault = state.active_fault === 'cooling_imbalance';
  const isLubeFault = state.active_fault === 'lubrication_degradation';

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>Tatra T3B-928 V8 Mechanical Architecture CAD & Sensor Topology</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            90° V8 Air-Cooled Diesel · Tunnel Crankcase with Roller Bearings · 25.6 kS/s Biaxial Accelerometers
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span>Active Fault: </span>
          <span className={`font-bold ${
            state.active_fault === 'none' ? 'text-emerald-400' : 'text-rose-400 uppercase animate-pulse'
          }`}>
            {state.active_fault.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Interactive Vector CAD Visualization */}
      <div className="relative w-full aspect-[16/9] min-h-[380px] bg-[#050811] rounded-xl border border-slate-800/80 p-4 flex items-center justify-center overflow-hidden">
        <svg viewBox="0 0 900 520" className="w-full h-full max-h-[480px]">
          <defs>
            {/* Gradients */}
            <linearGradient id="crankcaseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>

            <linearGradient id="cylinderBankL" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>

            <linearGradient id="cylinderBankR" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={isCoolingFault ? '#7f1d1d' : '#334155'} />
              <stop offset="100%" stopColor={isCoolingFault ? '#450a0a' : '#1e293b'} />
            </linearGradient>

            <radialGradient id="bearingGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={isBearingFault ? '#ef4444' : '#06b6d4'} stopOpacity="0.8" />
              <stop offset="100%" stopColor={isBearingFault ? '#991b1b' : '#0e7490'} stopOpacity="0.0" />
            </radialGradient>
          </defs>

          {/* Grid background */}
          <g stroke="#0f172a" strokeWidth="1">
            {Array.from({ length: 18 }).map((_, i) => (
              <line key={`v${i}`} x1={i * 50} y1="0" x2={i * 50} y2="520" />
            ))}
            {Array.from({ length: 11 }).map((_, j) => (
              <line key={`h${j}`} x1="0" y1={j * 50} x2="900" y2={j * 50} />
            ))}
          </g>

          {/* TATRA TUNNEL CRANKCASE (Center heavy block) */}
          <rect
            x="280"
            y="210"
            width="340"
            height="180"
            rx="12"
            fill="url(#crankcaseGrad)"
            stroke="#334155"
            strokeWidth="2"
          />
          <text x="450" y="245" fill="#64748b" fontSize="11" fontFamily="IBM Plex Mono" textAnchor="middle" fontWeight="bold">
            TATRA MONOLITHIC TUNNEL CRANKCASE
          </text>

          {/* TUNNEL ROLLER BEARINGS (Circular cutouts through solid block) */}
          <g>
            {/* Front Bearing Saddle */}
            <circle
              cx="360"
              cy="310"
              r="44"
              fill={isBearingFault ? 'url(#bearingGlow)' : '#090d16'}
              stroke={isBearingFault ? '#ef4444' : '#06b6d4'}
              strokeWidth={isBearingFault ? '3' : '2'}
              className={isBearingFault ? 'animate-pulse' : ''}
            />
            {/* Roller elements */}
            {Array.from({ length: 10 }).map((_, idx) => {
              const angle = (idx * Math.PI * 2) / 10;
              const rx = 360 + 32 * Math.cos(angle);
              const ry = 310 + 32 * Math.sin(angle);
              return (
                <circle
                  key={idx}
                  cx={rx}
                  cy={ry}
                  r="5"
                  fill={isBearingFault ? '#fca5a5' : '#38bdf8'}
                  stroke="#0f172a"
                  strokeWidth="1"
                />
              );
            })}
            <circle cx="360" cy="310" r="18" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
            <text x="360" y="314" fill="#94a3b8" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">
              BRG 1
            </text>

            {/* Rear Bearing Saddle */}
            <circle cx="540" cy="310" r="44" fill="#090d16" stroke="#334155" strokeWidth="2" />
            {Array.from({ length: 10 }).map((_, idx) => {
              const angle = (idx * Math.PI * 2) / 10;
              const rx = 540 + 32 * Math.cos(angle);
              const ry = 310 + 32 * Math.sin(angle);
              return (
                <circle key={idx} cx={rx} cy={ry} r="5" fill="#64748b" stroke="#0f172a" strokeWidth="1" />
              );
            })}
            <circle cx="540" cy="310" r="18" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
            <text x="540" y="314" fill="#94a3b8" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">
              BRG 2
            </text>
          </g>

          {/* CRANKSHAFT CONNECTING LINE */}
          <line x1="360" y1="310" x2="540" y2="310" stroke="#475569" strokeWidth="8" strokeDasharray="6,4" />

          {/* LEFT CYLINDER BANK (Bank 1: Cylinders 1-4, angled at 45° left) */}
          <g transform="translate(300, 210) rotate(-45)">
            <rect x="-10" y="-120" width="160" height="110" rx="8" fill="url(#cylinderBankL)" stroke="#475569" strokeWidth="1.5" />
            {/* Ribbed air-cooling fins */}
            {Array.from({ length: 8 }).map((_, i) => (
              <line key={i} x1="-15" y1={-110 + i * 14} x2="155" y2={-110 + i * 14} stroke="#64748b" strokeWidth="2" />
            ))}
            <text x="70" y="-55" fill="#f1f5f9" fontSize="10" fontFamily="IBM Plex Mono" textAnchor="middle" fontWeight="bold">
              BANK 1 (LEFT CYL 1-4)
            </text>
            <text x="70" y="-38" fill="#38bdf8" fontSize="11" fontFamily="IBM Plex Mono" textAnchor="middle" fontWeight="bold">
              {state.cht1_c}°C
            </text>
          </g>

          {/* RIGHT CYLINDER BANK (Bank 2: Cylinders 5-8, angled at 45° right) */}
          <g transform="translate(600, 210) rotate(45)">
            <rect
              x="-150"
              y="-120"
              width="160"
              height="110"
              rx="8"
              fill="url(#cylinderBankR)"
              stroke={isCoolingFault ? '#ef4444' : '#475569'}
              strokeWidth={isCoolingFault ? '2.5' : '1.5'}
            />
            {/* Ribbed cooling fins */}
            {Array.from({ length: 8 }).map((_, i) => (
              <line
                key={i}
                x1="-155"
                y1={-110 + i * 14}
                x2="15"
                y2={-110 + i * 14}
                stroke={isCoolingFault ? '#f87171' : '#64748b'}
                strokeWidth="2"
              />
            ))}
            <text x="-70" y="-55" fill="#f1f5f9" fontSize="10" fontFamily="IBM Plex Mono" textAnchor="middle" fontWeight="bold">
              BANK 2 (RIGHT CYL 5-8)
            </text>
            <text
              x="-70"
              y="-38"
              fill={isCoolingFault ? '#fca5a5' : '#38bdf8'}
              fontSize="11"
              fontFamily="IBM Plex Mono"
              textAnchor="middle"
              fontWeight="bold"
            >
              {state.cht2_c}°C {isCoolingFault ? '▲ OVERHEAT' : ''}
            </text>
          </g>

          {/* FRONT HYDRAULIC COOLING BLOWER FAN */}
          <g transform="translate(140, 260)">
            <circle cx="50" cy="50" r="55" fill="#0b1120" stroke="#38bdf8" strokeWidth="2" />
            {/* Fan Blades */}
            {Array.from({ length: 8 }).map((_, i) => {
              const ang = (i * Math.PI * 2) / 8 + (state.rpm / 200);
              const x2 = 50 + 44 * Math.cos(ang);
              const y2 = 50 + 44 * Math.sin(ang);
              return <line key={i} x1="50" y1="50" x2={x2} y2={y2} stroke="#38bdf8" strokeWidth="3" />;
            })}
            <circle cx="50" cy="50" r="16" fill="#1e293b" stroke="#38bdf8" strokeWidth="2" />
            <text x="50" y="125" fill="#94a3b8" fontSize="10" fontFamily="IBM Plex Mono" textAnchor="middle">
              HYDRAULIC BLOWER ({state.cooling_valve_pct}%)
            </text>
            {/* Air duct arrows */}
            <path d="M 110 30 Q 180 30 240 120" fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4,4" />
            <path d="M 110 70 Q 200 100 280 200" fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4,4" />
          </g>

          {/* TWIN TURBOCHARGERS (Top Left & Top Right) */}
          <g transform="translate(450, 45)">
            <circle cx="-110" cy="25" r="26" fill="#1e293b" stroke="#f59e0b" strokeWidth="2" />
            <text x="-110" y="29" fill="#f59e0b" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">TURBO 1</text>
            <circle cx="110" cy="25" r="26" fill="#1e293b" stroke="#f59e0b" strokeWidth="2" />
            <text x="110" y="29" fill="#f59e0b" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">TURBO 2</text>
            <path d="M -84 25 L 84 25" stroke="#f59e0b" strokeWidth="3" />
            <rect x="-40" y="15" width="80" height="20" rx="4" fill="#0f172a" stroke="#f59e0b" strokeWidth="1.5" />
            <text x="0" y="29" fill="#fbbf24" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">
              INTERCOOLER ({state.boost_pressure_bar} BAR)
            </text>
          </g>

          {/* SENSOR PIN 1: RADIAL-X (Piezoelectric Horizontal Accelerometer) */}
          <g transform="translate(230, 310)">
            <line x1="0" y1="0" x2="80" y2="0" stroke="#06b6d4" strokeWidth="2" />
            <circle cx="0" cy="0" r="14" fill="#083344" stroke="#06b6d4" strokeWidth="2" />
            <text x="0" y="4" fill="#06b6d4" fontSize="10" fontFamily="IBM Plex Mono" textAnchor="middle" fontWeight="bold">X</text>
            <rect x="-65" y="-35" width="130" height="22" rx="4" fill="#083344" stroke="#06b6d4" strokeWidth="1" />
            <text x="0" y="-21" fill="#22d3ee" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">
              RADIAL-X (25.6 kS/s)
            </text>
          </g>

          {/* SENSOR PIN 2: RADIAL-Y (Piezoelectric Vertical Accelerometer) */}
          <g transform="translate(360, 150)">
            <line x1="0" y1="0" x2="0" y2="110" stroke="#fbbf24" strokeWidth="2" />
            <circle cx="0" cy="0" r="14" fill="#451a03" stroke="#fbbf24" strokeWidth="2" />
            <text x="0" y="4" fill="#fbbf24" fontSize="10" fontFamily="IBM Plex Mono" textAnchor="middle" fontWeight="bold">Y</text>
            <rect x="-65" y="-35" width="130" height="22" rx="4" fill="#451a03" stroke="#fbbf24" strokeWidth="1" />
            <text x="0" y="-21" fill="#fcd34d" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">
              RADIAL-Y (25.6 kS/s)
            </text>
          </g>

          {/* SENSOR PIN 3: ENGINE OIL GALLERY & PRESSURE SENSOR */}
          <g transform="translate(450, 420)">
            <line
              x1="-90"
              y1="-30"
              x2="90"
              y2="-30"
              stroke={isLubeFault ? '#ef4444' : '#0284c7'}
              strokeWidth="5"
              className={isLubeFault ? 'animate-pulse' : ''}
            />
            <circle cx="0" cy="0" r="12" fill="#082f49" stroke={isLubeFault ? '#ef4444' : '#38bdf8'} strokeWidth="2" />
            <text x="0" y="4" fill="#38bdf8" fontSize="8" fontFamily="IBM Plex Mono" textAnchor="middle">EOP</text>
            <rect x="-75" y="20" width="150" height="22" rx="4" fill="#082f49" stroke="#38bdf8" strokeWidth="1" />
            <text x="0" y="34" fill="#bae6fd" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">
              OIL: {state.oil_pressure_bar} BAR / {state.oil_temp_c}°C
            </text>
          </g>

          {/* SENSOR PIN 4: FLYWHEEL SPEED PICKUP (SPN 190) */}
          <g transform="translate(640, 310)">
            <circle cx="40" cy="0" r="48" fill="none" stroke="#475569" strokeWidth="2" strokeDasharray="3,3" />
            <rect x="75" y="-12" width="115" height="24" rx="4" fill="#0f172a" stroke="#64748b" strokeWidth="1" />
            <text x="132" y="4" fill="#94a3b8" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">
              SPEED: {state.rpm} RPM
            </text>
          </g>

          {/* ACTIVE FAULT ANNOTATION BOX ON SCHEMATIC */}
          {state.active_fault !== 'none' && (
            <g transform="translate(30, 440)">
              <rect x="0" y="0" width="340" height="55" rx="8" fill="#450a0a" stroke="#ef4444" strokeWidth="1.5" />
              <text x="15" y="22" fill="#fca5a5" fontSize="11" fontFamily="IBM Plex Mono" fontWeight="bold">
                ▲ ACTIVE FAULT DETECTED AT SENSOR SITE
              </text>
              <text x="15" y="42" fill="#fecaca" fontSize="9" fontFamily="IBM Plex Mono">
                {state.active_fault === 'bearing_flaw' && 'Roller Bearing 1 Seat: High-frequency ringdown shock bursts'}
                {state.active_fault === 'cooling_imbalance' && `Bank 2 Cooling Duct: Severe thermal gradient (ΔT: ${state.cht_delta_c}°C)`}
                {state.active_fault === 'lubrication_degradation' && `Main Gallery: Pressure deficit (${state.oil_pressure_bar} bar < nominal)`}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Engineering Subsystem Legend Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
        <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg flex items-start gap-2.5">
          <Disc className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-slate-200">Tunnel Crankcase Design</div>
            <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              Monolithic tunnel crankcase with cylindrical roller main bearings providing extreme rigidity for 8x8 off-road shock loads.
            </div>
          </div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg flex items-start gap-2.5">
          <Wind className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-slate-200">Air Cooling & Hydraulic Blower</div>
            <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              Front blower powered by engine oil hydraulic clutch. Individual finned heads eliminate coolant hoses, radiators, and water pump failure points.
            </div>
          </div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg flex items-start gap-2.5">
          <Radio className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-slate-200">Biaxial Sensor Placement</div>
            <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              Radial-X captures torsional shaft unbalance, Radial-Y captures 4X combustion cylinder thrust and roller bearing outer-race impacts.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
