import React from 'react';
import { Activity, Cpu, RefreshCw, Radio, CheckCircle2, AlertTriangle } from 'lucide-react';

interface TopBarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  connectionMode: 'twin' | 'websocket';
  setConnectionMode: (mode: 'twin' | 'websocket') => void;
  wsConnected: boolean;
  onRetrainBaseline: () => void;
  isRetraining: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  setActiveTab,
  connectionMode,
  setConnectionMode,
  wsConnected,
  onRetrainBaseline,
  isRetraining,
}) => {
  const tabs = [
    { id: 'overview', label: 'Overview & Health' },
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
            <span>TRL-4 Predictive Maintenance</span>
            <span aria-hidden="true">·</span>
            <span>25.6 kS/s Edge AI</span>
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
      <div className="flex items-center gap-3">
        {/* Source Toggle */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
          <button
            onClick={() => setConnectionMode('twin')}
            className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              connectionMode === 'twin'
                ? 'bg-cyan-950/80 text-cyan-300 font-medium border border-cyan-800/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Runs real-time physics & DSP engine natively in browser"
          >
            <Cpu className="w-3 h-3" />
            <span>Browser Twin</span>
          </button>
          <button
            onClick={() => setConnectionMode('websocket')}
            className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              connectionMode === 'websocket'
                ? 'bg-emerald-950/80 text-emerald-300 font-medium border border-emerald-800/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Connects to FastAPI Python server at ws://localhost:8000/ws/telemetry"
          >
            <Radio className="w-3 h-3" />
            <span>FastAPI WS</span>
            {connectionMode === 'websocket' && (
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
            )}
          </button>
        </div>

        {/* Baseline Model Retrain Action */}
        <button
          onClick={onRetrainBaseline}
          disabled={isRetraining}
          className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50"
          title="Retrain unsupervised baseline Isolation Forest on healthy operating manifold"
        >
          <RefreshCw className={`w-3 h-3 text-cyan-400 ${isRetraining ? 'animate-spin' : ''}`} />
          <span>{isRetraining ? 'Calibrating...' : 'Train Baseline'}</span>
        </button>
      </div>
    </header>
  );
};
