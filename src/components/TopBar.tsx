import React from 'react';
import { Activity, Cpu, RefreshCw, Radio, HardDrive, FileText, Wrench } from 'lucide-react';

interface TopBarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  connectionMode: 'twin' | 'websocket';
  setConnectionMode: (mode: 'twin' | 'websocket') => void;
  daqSource: 'SIMULATOR' | 'HARDWARE';
  onToggleDaqSource: (source: 'SIMULATOR' | 'HARDWARE') => void;
  wsConnected: boolean;
  onRetrainBaseline: () => void;
  isRetraining: boolean;
  onOpenDiagnostics: () => void;
  hasDiagnosticAlert?: boolean;
  onOpenHistory: () => void;
  totalHistoricalRuns: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  setActiveTab,
  connectionMode,
  setConnectionMode,
  daqSource,
  onToggleDaqSource,
  wsConnected,
  onRetrainBaseline,
  isRetraining,
  onOpenDiagnostics,
  hasDiagnosticAlert,
  onOpenHistory,
  totalHistoricalRuns
}) => {
  const tabs = [
    { id: 'overview', label: 'Overview & Health' },
    { id: 'orders', label: 'Order Tracking (COT)' },
    { id: 'vibration', label: 'Biaxial Vibration DSP' },
    { id: 'spectrum', label: 'Order Spectrum (FFT)' },
    { id: 'ecu', label: 'ECU & Thermodynamics' },
    { id: 'schematic', label: 'Engine Schematic CAD' },
  ];

  return (
    <header className="w-full max-w-full flex flex-wrap items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 gap-2 overflow-x-hidden sticky top-0 z-40">
      {/* Zone 1: Title & System Status */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
          <Activity className="w-4 h-4" />
        </div>
        <div>
          <a
            href="#"
            className="text-sm sm:text-base font-bold tracking-tight text-slate-100 hover:text-cyan-400 transition-colors"
          >
            TATRA T3B-928 V8 TESTBED
          </a>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
            <span className="text-cyan-400 font-semibold">TRL-6 Operational</span>
            <span aria-hidden="true">·</span>
            <span>BEML EHI System</span>
          </div>
        </div>
      </div>

      {/* Zone 2: Navigation tabs with responsive wrapping */}
      <nav className="flex flex-wrap items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800/80 max-w-full overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700/80'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Grouped Responsive Action Controls */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {/* Runs & Reports Button */}
        <button
          onClick={onOpenHistory}
          className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-950 hover:bg-slate-800 border border-slate-700/80 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 font-mono"
          title="View recorded test runs and generate BEML PDF/CSV inspection reports"
        >
          <FileText className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Runs & Reports</span>
          <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] text-cyan-300">
            {totalHistoricalRuns}
          </span>
        </button>

        {/* Data Source Toggle & Connection Mode Group */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* HAL DAQ Source Selector */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
            <button
              onClick={() => onToggleDaqSource('SIMULATOR')}
              className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1 ${
                daqSource === 'SIMULATOR'
                  ? 'bg-cyan-950/90 text-cyan-300 font-medium border border-cyan-800/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Physics-grounded Tatra V8 simulation model"
            >
              <Cpu className="w-3 h-3" />
              <span>Sim</span>
            </button>
            <button
              onClick={() => onToggleDaqSource('HARDWARE')}
              className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1 ${
                daqSource === 'HARDWARE'
                  ? 'bg-amber-950/90 text-amber-300 font-medium border border-amber-800/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Physical NI-DAQ IEPE Accelerometers & SAE J1939 CAN Transceiver"
            >
              <HardDrive className="w-3 h-3" />
              <span>NI+CAN</span>
            </button>
          </div>

          {/* Runtime Mode Selector */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
            <button
              onClick={() => setConnectionMode('twin')}
              className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1 ${
                connectionMode === 'twin'
                  ? 'bg-cyan-950/90 text-cyan-300 font-medium border border-cyan-800/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="In-browser DSP and physics engine"
            >
              <span>Twin</span>
            </button>
            <button
              onClick={() => setConnectionMode('websocket')}
              className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1 ${
                connectionMode === 'websocket'
                  ? 'bg-emerald-950/90 text-emerald-300 font-medium border border-emerald-800/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Connects to FastAPI Python backend at ws://localhost:8000/ws/telemetry"
            >
              <Radio className="w-3 h-3" />
              <span>FastAPI</span>
              {connectionMode === 'websocket' && (
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`}
                />
              )}
            </button>
          </div>
        </div>

        {/* Offline Diagnostic Trigger & Baseline Retrain Group */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={onOpenDiagnostics}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all whitespace-nowrap flex items-center gap-1.5 font-mono ${
              hasDiagnosticAlert
                ? 'bg-rose-950/90 border-rose-600 text-rose-200 animate-pulse'
                : 'bg-cyan-950/80 hover:bg-cyan-900 border-cyan-700/80 text-cyan-200'
            }`}
            title="100% Offline / Open-Source Powertrain Diagnostics (Rule-Based & Local Ollama)"
          >
            <Wrench className="w-3.5 h-3.5 text-cyan-400" />
            <span>BEML Expert Analysis</span>
          </button>

          <button
            onClick={onRetrainBaseline}
            disabled={isRetraining}
            className="p-2 text-slate-300 bg-slate-950 hover:bg-slate-800 border border-slate-700/80 rounded-lg transition-colors disabled:opacity-50"
            title="Retrain unsupervised baseline Isolation Forest on healthy operating manifold"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isRetraining ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
};
