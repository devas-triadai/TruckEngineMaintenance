import React from 'react';
import { Activity, Cpu, RefreshCw, Radio, Sparkles, HardDrive, Zap } from 'lucide-react';

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
  hasDiagnosticAlert
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
    <header className="flex items-center justify-between px-6 py-3.5 bg-slate-950 border-b border-slate-800/80 sticky top-0 z-40">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
          <Activity className="w-4 h-4" />
        </div>
        <div>
          <a href="#" className="text-base font-bold tracking-tight text-slate-100 hover:text-cyan-400 transition-colors">
            TATRA T3B-928 V8 TESTBED
          </a>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="text-cyan-400 font-semibold">TRL-5 Testbed Validation</span>
            <span aria-hidden="true">·</span>
            <span>NI-DAQ IEPE & J1939</span>
          </div>
        </div>
      </div>

      {/* Zone 2: 4-6 clean text navigation links */}
      <nav className="hidden lg:flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
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

      {/* Zone 3: 1-2 primary actions */}
      <div className="flex items-center gap-2.5">
        {/* HAL DAQ Source Selector (Simulator vs NI-DAQ/CAN Hardware) */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
          <button
            onClick={() => onToggleDaqSource('SIMULATOR')}
            className={`px-2 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              daqSource === 'SIMULATOR'
                ? 'bg-cyan-950/80 text-cyan-300 font-medium border border-cyan-800/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Physics-grounded Tatra V8 simulation model"
          >
            <Cpu className="w-3 h-3" />
            <span>Sim</span>
          </button>
          <button
            onClick={() => onToggleDaqSource('HARDWARE')}
            className={`px-2 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              daqSource === 'HARDWARE'
                ? 'bg-amber-950/80 text-amber-300 font-medium border border-amber-800/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Physical NI-DAQ IEPE Accelerometers (AI0/AI1) & SAE J1939 CAN Transceiver"
          >
            <HardDrive className="w-3 h-3" />
            <span>NI+CAN</span>
          </button>
        </div>

        {/* Runtime Engine Selector (Browser Twin vs FastAPI WebSocket) */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
          <button
            onClick={() => setConnectionMode('twin')}
            className={`px-2 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              connectionMode === 'twin'
                ? 'bg-cyan-950/80 text-cyan-300 font-medium border border-cyan-800/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="In-browser DSP and physics engine"
          >
            <span>Twin</span>
          </button>
          <button
            onClick={() => setConnectionMode('websocket')}
            className={`px-2 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              connectionMode === 'websocket'
                ? 'bg-emerald-950/80 text-emerald-300 font-medium border border-emerald-800/40'
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

        {/* Gemini Diagnostics Drawer Trigger */}
        <button
          onClick={onOpenDiagnostics}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all whitespace-nowrap flex items-center gap-1.5 ${
            hasDiagnosticAlert
              ? 'bg-rose-950/60 border-rose-600 text-rose-300 animate-pulse'
              : 'bg-slate-900 hover:bg-slate-800 border-slate-700/80 text-cyan-300'
          }`}
          title="Run Google GenAI Root-Cause Diagnostics"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Gemini AI</span>
        </button>

        {/* Baseline Model Retrain Action */}
        <button
          onClick={onRetrainBaseline}
          disabled={isRetraining}
          className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors disabled:opacity-50"
          title="Retrain Isolation Forest Baseline"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRetraining ? 'animate-spin text-cyan-400' : ''}`} />
        </button>
      </div>
    </header>
  );
};
