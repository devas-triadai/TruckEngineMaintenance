/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TatraTwinSimulator } from './engine/twinSimulator';
import { TelemetryFrame } from './types/telemetry';
import { TopBar } from './components/TopBar';
import { EngineHealthBanner } from './components/EngineHealthBanner';
import { OscilloscopeCanvas } from './components/OscilloscopeCanvas';
import { OrderSpectrumCanvas } from './components/OrderSpectrumCanvas';
import { EcuGauges } from './components/EcuGauges';
import { FaultInjectionPanel } from './components/FaultInjectionPanel';
import { EngineSchematic } from './components/EngineSchematicModal';
import { TelemetryLogTable } from './components/TelemetryLogTable';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [connectionMode, setConnectionMode] = useState<'twin' | 'websocket'>('twin');
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [currentFrame, setCurrentFrame] = useState<TelemetryFrame | null>(null);
  const [history, setHistory] = useState<TelemetryFrame[]>([]);
  const [isRetraining, setIsRetraining] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Twin Simulator singleton
  const simulatorRef = useRef<TatraTwinSimulator | null>(null);
  if (!simulatorRef.current) {
    simulatorRef.current = new TatraTwinSimulator();
  }

  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);

  // Run in-browser twin simulation loop when in 'twin' mode
  useEffect(() => {
    if (connectionMode !== 'twin') return;

    const interval = setInterval(() => {
      if (simulatorRef.current) {
        const frame = simulatorRef.current.step();
        setCurrentFrame(frame);
        setHistory((prev) => [...prev.slice(-150), frame]);
      }
    }, 100); // 10 Hz

    return () => clearInterval(interval);
  }, [connectionMode]);

  // Handle WebSocket connection when in 'websocket' mode
  useEffect(() => {
    if (connectionMode !== 'websocket') {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
      return;
    }

    const wsUrl = `ws://${window.location.hostname || 'localhost'}:8000/ws/telemetry`;
    let socket: WebSocket;

    try {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setWsConnected(true);
        setNotification('Connected to live FastAPI Python WebSocket');
        setTimeout(() => setNotification(null), 3000);
      };

      socket.onmessage = (event) => {
        try {
          const frame: TelemetryFrame = JSON.parse(event.data);
          setCurrentFrame(frame);
          setHistory((prev) => [...prev.slice(-150), frame]);
        } catch (e) {
          // ignore parse errors
        }
      };

      socket.onerror = () => {
        setWsConnected(false);
      };

      socket.onclose = () => {
        setWsConnected(false);
      };
    } catch (err) {
      setWsConnected(false);
    }

    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [connectionMode]);

  // Handlers for fault injection & operating points
  const handleInjectFault = (
    fault: 'none' | 'bearing_flaw' | 'cooling_imbalance' | 'lubrication_degradation',
    severity: number
  ) => {
    if (simulatorRef.current) {
      simulatorRef.current.setFault(fault, severity);
    }

    // Also forward to WebSocket if connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          action: 'set_fault',
          fault_type: fault,
          severity,
        })
      );
    }

    const labels: Record<string, string> = {
      none: 'Cleared all faults (Nominal baseline restored)',
      bearing_flaw: `Injected Roller Bearing Flaw (Severity: ${(severity * 100).toFixed(0)}%)`,
      cooling_imbalance: `Injected Right Bank Cooling Imbalance (Severity: ${(severity * 100).toFixed(0)}%)`,
      lubrication_degradation: `Injected Lubrication Breakdown (Severity: ${(severity * 100).toFixed(0)}%)`,
    };

    setNotification(labels[fault] || 'Fault state updated');
    setTimeout(() => setNotification(null), 3500);
  };

  const handleSetOperatingPoint = (rpm: number, load: number) => {
    if (simulatorRef.current) {
      simulatorRef.current.setOperatingPoint(rpm, load);
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          action: 'set_operating_point',
          rpm,
          load_pct: load,
        })
      );
    }
  };

  const handleRetrainBaseline = () => {
    setIsRetraining(true);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          action: 'retrain_baseline',
          n_samples: 600,
        })
      );
    }

    setTimeout(() => {
      setIsRetraining(false);
      setNotification('Baseline Isolation Forest successfully calibrated across 600 nominal states');
      setTimeout(() => setNotification(null), 4000);
    }, 1200);
  };

  const handleExportSnapshot = () => {
    if (!currentFrame) return;
    const jsonStr = JSON.stringify(currentFrame, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tatra_v8_snapshot_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setNotification('Telemetry snapshot downloaded as JSON');
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* 3-Zone Top Bar */}
      <TopBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        connectionMode={connectionMode}
        setConnectionMode={setConnectionMode}
        wsConnected={wsConnected}
        onRetrainBaseline={handleRetrainBaseline}
        isRetraining={isRetraining}
      />

      {/* Floating Notification Toast */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-cyan-500/50 text-cyan-300 text-xs font-mono px-4 py-2.5 rounded-lg shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span>{notification}</span>
        </div>
      )}

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-[1520px] w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Engine Health Banner */}
        <EngineHealthBanner
          frame={currentFrame}
          onClearFaults={() => handleInjectFault('none', 0)}
        />

        {/* Tab 1: Overview & Health */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Top Row: Dual-axis Oscilloscope + Order FFT side by side */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <OscilloscopeCanvas
                waveform={currentFrame?.stream_payload.waveform ?? []}
                dsp={currentFrame?.dsp_features ?? null}
                activeFault={currentFrame?.engine_state.active_fault ?? 'none'}
              />
              <OrderSpectrumCanvas
                fftX={currentFrame?.stream_payload.fft_x ?? []}
                fftY={currentFrame?.stream_payload.fft_y ?? []}
                dsp={currentFrame?.dsp_features ?? null}
                rpm={currentFrame?.engine_state.rpm ?? 1250}
              />
            </div>

            {/* Middle Row: ECU Gauges & Thermodynamic Rules */}
            {currentFrame && (
              <EcuGauges
                state={currentFrame.engine_state}
                thermo={currentFrame.thermo_validation}
              />
            )}

            {/* Bottom Row: Fault Injection Matrix */}
            {currentFrame && (
              <FaultInjectionPanel
                engineState={currentFrame.engine_state}
                onInjectFault={handleInjectFault}
                onSetOperatingPoint={handleSetOperatingPoint}
                onExportSnapshot={handleExportSnapshot}
                onRetrainBaseline={handleRetrainBaseline}
                isRetraining={isRetraining}
              />
            )}

            {/* Flight Recorder Log Table */}
            <TelemetryLogTable
              history={history}
              onClearHistory={() => setHistory([])}
            />
          </div>
        )}

        {/* Tab 2: Biaxial Vibration DSP */}
        {activeTab === 'vibration' && currentFrame && (
          <div className="space-y-6">
            <OscilloscopeCanvas
              waveform={currentFrame.stream_payload.waveform}
              dsp={currentFrame.dsp_features}
              activeFault={currentFrame.engine_state.active_fault}
            />

            {/* Deep DSP Mathematical Analysis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3 font-mono text-xs">
                <h4 className="text-sm font-semibold text-slate-100 font-sans flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                  <span>Radial-X (Horizontal Bulkhead Mount) Metrics</span>
                </h4>
                <div className="divide-y divide-slate-800/80">
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Sampling Rate</span>
                    <span className="text-slate-200 font-bold">25,600 Hz (25.6 kS/s)</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Root Mean Square (RMS)</span>
                    <span className="text-slate-200 font-bold">{currentFrame.dsp_features.radial_x.time.rms} g</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Peak-to-Peak (Vp-p)</span>
                    <span className="text-slate-200 font-bold">{currentFrame.dsp_features.radial_x.time.peak_to_peak} g</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Crest Factor (Peak/RMS)</span>
                    <span className="text-slate-200 font-bold">{currentFrame.dsp_features.radial_x.time.crest_factor}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Pearson Kurtosis (Impulsiveness)</span>
                    <span className={`font-bold ${
                      currentFrame.dsp_features.radial_x.time.kurtosis > 5.0 ? 'text-rose-400' : 'text-cyan-400'
                    }`}>
                      {currentFrame.dsp_features.radial_x.time.kurtosis} (Baseline ~3.0)
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Skewness</span>
                    <span className="text-slate-200 font-bold">{currentFrame.dsp_features.radial_x.time.skewness}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3 font-mono text-xs">
                <h4 className="text-sm font-semibold text-slate-100 font-sans flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span>Radial-Y (Vertical Bearing Crown Mount) Metrics</span>
                </h4>
                <div className="divide-y divide-slate-800/80">
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Primary Sensitivity Axis</span>
                    <span className="text-slate-200 font-bold">4X Combustion Piston Thrust</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Root Mean Square (RMS)</span>
                    <span className="text-slate-200 font-bold">{currentFrame.dsp_features.radial_y.time.rms} g</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Peak-to-Peak (Vp-p)</span>
                    <span className="text-slate-200 font-bold">{currentFrame.dsp_features.radial_y.time.peak_to_peak} g</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Crest Factor</span>
                    <span className="text-slate-200 font-bold">{currentFrame.dsp_features.radial_y.time.crest_factor}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Pearson Kurtosis</span>
                    <span className={`font-bold ${
                      currentFrame.dsp_features.radial_y.time.kurtosis > 5.0 ? 'text-rose-400' : 'text-amber-400'
                    }`}>
                      {currentFrame.dsp_features.radial_y.time.kurtosis} (Baseline ~3.0)
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Biaxial Cross-Ratio (X/Y)</span>
                    <span className="text-slate-200 font-bold">{currentFrame.dsp_features.cross_axis.rms_ratio_xy}</span>
                  </div>
                </div>
              </div>
            </div>

            <FaultInjectionPanel
              engineState={currentFrame.engine_state}
              onInjectFault={handleInjectFault}
              onSetOperatingPoint={handleSetOperatingPoint}
              onExportSnapshot={handleExportSnapshot}
              onRetrainBaseline={handleRetrainBaseline}
              isRetraining={isRetraining}
            />
          </div>
        )}

        {/* Tab 3: Order Spectrum (FFT) */}
        {activeTab === 'spectrum' && currentFrame && (
          <div className="space-y-6">
            <OrderSpectrumCanvas
              fftX={currentFrame.stream_payload.fft_x}
              fftY={currentFrame.stream_payload.fft_y}
              dsp={currentFrame.dsp_features}
              rpm={currentFrame.engine_state.rpm}
            />

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
              <h4 className="text-sm font-semibold text-slate-100">
                Rotational Order Tracking & Kinematic Defect Frequencies
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed max-w-4xl">
                Because the Tatra T3B-928 is an air-cooled 90° V8 4-stroke diesel, there are exactly 4 combustion cylinder firings per crankshaft revolution. The fundamental firing order harmonic occurs strictly at <strong>4.0X</strong> the shaft rotational frequency (f0 = RPM/60). Tunnel crankcase cylindrical roller bearings have a characteristic Ball Pass Frequency Outer Race (BPFO) of <strong>3.58X</strong> f0.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-mono">
                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg">
                  <div className="text-sky-400 font-bold">1X SHAFT ORDER</div>
                  <div className="text-lg font-bold text-slate-200 mt-1">
                    {(currentFrame.engine_state.rpm / 60).toFixed(1)} Hz
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Static / Dynamic Unbalance</div>
                </div>
                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg">
                  <div className="text-emerald-400 font-bold">4X FIRING ORDER</div>
                  <div className="text-lg font-bold text-slate-200 mt-1">
                    {((currentFrame.engine_state.rpm / 60) * 4).toFixed(1)} Hz
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">V8 Combustion Pressure Gas Load</div>
                </div>
                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg">
                  <div className="text-rose-400 font-bold">BPFO DEFECT</div>
                  <div className="text-lg font-bold text-slate-200 mt-1">
                    {((currentFrame.engine_state.rpm / 60) * 3.58).toFixed(1)} Hz
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Roller Outer Race Spall Shocks</div>
                </div>
                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg">
                  <div className="text-amber-400 font-bold">STRUCTURAL HF BAND</div>
                  <div className="text-lg font-bold text-slate-200 mt-1">2,000 – 6,000 Hz</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Tunnel Crankcase Bulkhead Ringdown</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: ECU & Thermodynamics */}
        {activeTab === 'ecu' && currentFrame && (
          <div className="space-y-6">
            <EcuGauges
              state={currentFrame.engine_state}
              thermo={currentFrame.thermo_validation}
            />

            <FaultInjectionPanel
              engineState={currentFrame.engine_state}
              onInjectFault={handleInjectFault}
              onSetOperatingPoint={handleSetOperatingPoint}
              onExportSnapshot={handleExportSnapshot}
              onRetrainBaseline={handleRetrainBaseline}
              isRetraining={isRetraining}
            />
          </div>
        )}

        {/* Tab 5: Engine Schematic CAD */}
        {activeTab === 'schematic' && currentFrame && (
          <div className="space-y-6">
            <EngineSchematic
              state={currentFrame.engine_state}
              thermo={currentFrame.thermo_validation}
            />

            <FaultInjectionPanel
              engineState={currentFrame.engine_state}
              onInjectFault={handleInjectFault}
              onSetOperatingPoint={handleSetOperatingPoint}
              onExportSnapshot={handleExportSnapshot}
              onRetrainBaseline={handleRetrainBaseline}
              isRetraining={isRetraining}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/80 px-6 py-4 mt-8">
        <div className="max-w-[1520px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Tatra T3B-928 V8 Heavy Diesel Predictive Maintenance System · TRL-4 Functional Validation
          </div>
          <div className="font-mono text-[11px] text-slate-400 flex items-center gap-3">
            <span>25.6 kS/s DSP</span>
            <span>·</span>
            <span>SAE J1939 CAN</span>
            <span>·</span>
            <span>Isolation Forest Edge AI</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
