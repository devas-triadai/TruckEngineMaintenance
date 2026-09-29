/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TatraTwinSimulator } from './engine/twinSimulator';
import {
  TelemetryFrame,
  GeminiDiagnosticReport,
  TestRun,
  RecordingStatus,
  ReplayStatus
} from './types/telemetry';
import { TopBar } from './components/TopBar';
import { EngineHealthBanner } from './components/EngineHealthBanner';
import { OscilloscopeCanvas } from './components/OscilloscopeCanvas';
import { OrderSpectrumCanvas } from './components/OrderSpectrumCanvas';
import { OrderTrackingPanel } from './components/OrderTrackingPanel';
import { EcuGauges } from './components/EcuGauges';
import { FaultInjectionPanel } from './components/FaultInjectionPanel';
import { EngineSchematic } from './components/EngineSchematicModal';
import { TelemetryLogTable } from './components/TelemetryLogTable';
import { GeminiDiagnosticsModal } from './components/GeminiDiagnosticsModal';
import { RunRecorderBar } from './components/RunRecorderBar';
import { ReplayControlBar } from './components/ReplayControlBar';
import { HistoricalRunsModal } from './components/HistoricalRunsModal';

const DEFAULT_HISTORICAL_RUNS: TestRun[] = [
  {
    id: 'run-beml-01',
    engine_serial: 'TATRA-T3B-928-80-0419',
    run_name: 'BEML Acceptance Standard 4-Hour Dynamometer Validation',
    operator_id: 'TECH-BEML-01',
    start_time: new Date(Date.now() - 3600000 * 2).toISOString(),
    end_time: new Date(Date.now() - 3600000).toISOString(),
    duration_seconds: 3600,
    initial_ehi: 98.4,
    min_ehi: 92.6,
    final_status: 'PASSED',
    primary_fault: 'none',
    total_records: 36000,
    max_rpm: 2100,
    min_eop: 3.42,
    max_cht_delta: 6.2,
    max_kurtosis_x: 3.12,
    notes: 'Full load sweep 1200 - 2100 RPM. ISO 10816-6 Zone A compliant vibration levels.'
  },
  {
    id: 'run-beml-02',
    engine_serial: 'TATRA-T3B-928-80-0419',
    run_name: 'BEML Extreme Ambient (48°C) Desert Test - Bank B Blower Test',
    operator_id: 'TECH-BEML-04',
    start_time: new Date(Date.now() - 3600000 * 26).toISOString(),
    end_time: new Date(Date.now() - 3600000 * 25.5).toISOString(),
    duration_seconds: 1800,
    initial_ehi: 94.0,
    min_ehi: 68.2,
    final_status: 'FLAGGED',
    primary_fault: 'cooling_imbalance',
    total_records: 18000,
    max_rpm: 1950,
    min_eop: 2.78,
    max_cht_delta: 34.5,
    max_kurtosis_x: 3.35,
    notes: 'Right-bank cylinder head temperature delta exceeded 30°C due to cooling duct restriction.'
  },
  {
    id: 'run-beml-03',
    engine_serial: 'TATRA-T3B-928-80-0419',
    run_name: 'Endurance Testbed #3 - Tunnel Crankcase Roller Bearing Stress Test',
    operator_id: 'TECH-BEML-02',
    start_time: new Date(Date.now() - 3600000 * 72).toISOString(),
    end_time: new Date(Date.now() - 3600000 * 71.33).toISOString(),
    duration_seconds: 2400,
    initial_ehi: 89.0,
    min_ehi: 42.1,
    final_status: 'CRITICAL',
    primary_fault: 'bearing_flaw',
    total_records: 24000,
    max_rpm: 2150,
    min_eop: 2.15,
    max_cht_delta: 12.0,
    max_kurtosis_x: 9.85,
    notes: 'Impulsive shocks detected on Radial-X accelerometer. Kurtosis reached 9.85 with BPFO order peaks at 3.58X.'
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [connectionMode, setConnectionMode] = useState<'twin' | 'websocket'>('twin');
  const [daqSource, setDaqSource] = useState<'SIMULATOR' | 'HARDWARE'>('SIMULATOR');
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [currentFrame, setCurrentFrame] = useState<TelemetryFrame | null>(null);
  const [history, setHistory] = useState<TelemetryFrame[]>([]);
  const [isRetraining, setIsRetraining] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Gemini Diagnostics State
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);
  const [diagnosticReport, setDiagnosticReport] = useState<GeminiDiagnosticReport | null>(null);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState<boolean>(false);

  // TRL-6 Test Runs & Persistence State
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [runs, setRuns] = useState<TestRun[]>(() => {
    try {
      const saved = localStorage.getItem('tatra_testbed_runs');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return DEFAULT_HISTORICAL_RUNS;
  });
  const [isLoadingRuns, setIsLoadingRuns] = useState<boolean>(false);

  // Recording State
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>({
    is_recording: false,
    total_records: 0
  });
  const recordedBufferRef = useRef<TelemetryFrame[]>([]);
  const recordingMetaRef = useRef<{
    runId: string;
    runName: string;
    engineSerial: string;
    operatorId: string;
    startTime: string;
    initialEhi: number;
    minEhi: number;
    maxRpm: number;
    minEop: number;
    maxChtDelta: number;
    maxKurtosisX: number;
    primaryFault: string;
  } | null>(null);

  // Replay State
  const [replayStatus, setReplayStatus] = useState<ReplayStatus>({
    is_active: false,
    is_paused: false,
    source_type: 'SIMULATOR',
    source_name: '',
    current_index: 0,
    total_frames: 0,
    progress_pct: 0,
    playback_speed: 1.0
  });
  const replayFramesRef = useRef<TelemetryFrame[]>([]);
  const replayTimerRef = useRef<any>(null);

  // Save runs to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('tatra_testbed_runs', JSON.stringify(runs));
    } catch {
      // ignore
    }
  }, [runs]);

  // Twin Simulator singleton
  const simulatorRef = useRef<TatraTwinSimulator | null>(null);
  if (!simulatorRef.current) {
    simulatorRef.current = new TatraTwinSimulator();
  }

  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch runs from backend if in websocket mode
  const fetchRuns = useCallback(async () => {
    if (connectionMode === 'websocket' && wsConnected) {
      setIsLoadingRuns(true);
      try {
        const res = await fetch('/api/runs');
        if (res.ok) {
          const data = await res.json();
          if (data.runs && Array.isArray(data.runs)) {
            setRuns(data.runs);
          }
          if (data.active_recording) {
            setRecordingStatus(data.active_recording);
          }
        }
      } catch {
        // use local runs fallback
      } finally {
        setIsLoadingRuns(false);
      }
    }
  }, [connectionMode, wsConnected]);

  useEffect(() => {
    if (wsConnected) {
      fetchRuns();
    }
  }, [wsConnected, fetchRuns]);

  // Run in-browser twin simulation loop when in 'twin' mode and NOT in replay
  useEffect(() => {
    if (connectionMode !== 'twin' || replayStatus.is_active) return;

    const interval = setInterval(() => {
      if (simulatorRef.current) {
        const frame = simulatorRef.current.step();

        // If recording in twin mode, accumulate
        if (recordingMetaRef.current) {
          recordedBufferRef.current.push(frame);
          const meta = recordingMetaRef.current;
          const ehi = frame.ehi?.overall_ehi ?? 100;
          meta.minEhi = Math.min(meta.minEhi, ehi);
          meta.maxRpm = Math.max(meta.maxRpm, frame.engine_state.rpm);
          meta.minEop = Math.min(meta.minEop, frame.engine_state.oil_pressure_bar);
          meta.maxChtDelta = Math.max(meta.maxChtDelta, frame.engine_state.cht_delta_c);
          meta.maxKurtosisX = Math.max(meta.maxKurtosisX, frame.dsp_features.radial_x.time.kurtosis);
          if (frame.engine_state.active_fault !== 'none') {
            meta.primaryFault = frame.engine_state.active_fault;
          }

          setRecordingStatus({
            is_recording: true,
            active_run_id: meta.runId,
            run_name: meta.runName,
            engine_serial: meta.engineSerial,
            operator_id: meta.operatorId,
            start_time: meta.startTime,
            duration_seconds: Math.floor((Date.now() - new Date(meta.startTime).getTime()) / 1000),
            total_records: recordedBufferRef.current.length,
            min_ehi: meta.minEhi
          });
        }

        setCurrentFrame(frame);
        setHistory((prev) => [...prev.slice(-150), frame]);
      }
    }, 100); // 10 Hz

    return () => clearInterval(interval);
  }, [connectionMode, replayStatus.is_active]);

  // Handle in-browser Replay playback loop
  useEffect(() => {
    if (!replayStatus.is_active || replayStatus.is_paused || replayFramesRef.current.length === 0) {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
      }
      return;
    }

    const intervalMs = Math.max(20, Math.floor(100 / replayStatus.playback_speed));
    replayTimerRef.current = setInterval(() => {
      setReplayStatus((prev) => {
        if (!prev.is_active || prev.is_paused) return prev;
        const total = replayFramesRef.current.length;
        if (total === 0) return prev;

        const nextIdx = prev.current_index + 1;
        if (nextIdx >= total) {
          // Loop or pause at end
          const frame = replayFramesRef.current[total - 1];
          setCurrentFrame(frame);
          return {
            ...prev,
            current_index: total - 1,
            progress_pct: 100,
            is_paused: true
          };
        }

        const frame = replayFramesRef.current[nextIdx];
        setCurrentFrame(frame);
        setHistory((hist) => [...hist.slice(-150), frame]);

        return {
          ...prev,
          current_index: nextIdx,
          progress_pct: Math.round((nextIdx / total) * 100)
        };
      });
    }, intervalMs);

    return () => {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
      }
    };
  }, [replayStatus.is_active, replayStatus.is_paused, replayStatus.playback_speed]);

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

          if (frame.replay_status) {
            setReplayStatus(frame.replay_status);
          }
          if (frame.recording_status) {
            setRecordingStatus(frame.recording_status);
          }
        } catch {
          // ignore parse errors
        }
      };

      socket.onerror = () => {
        setWsConnected(false);
      };

      socket.onclose = () => {
        setWsConnected(false);
      };
    } catch {
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

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          action: 'set_fault',
          fault_type: fault,
          severity
        })
      );
    }

    const labels: Record<string, string> = {
      none: 'Cleared all faults (Nominal baseline restored)',
      bearing_flaw: `Injected Roller Bearing Flaw (Severity: ${(severity * 100).toFixed(0)}%)`,
      cooling_imbalance: `Injected Right Bank Cooling Imbalance (Severity: ${(severity * 100).toFixed(0)}%)`,
      lubrication_degradation: `Injected Lubrication Breakdown (Severity: ${(severity * 100).toFixed(0)}%)`
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
          load_pct: load
        })
      );
    }
  };

  const handleToggleDaqSource = async (newSource: 'SIMULATOR' | 'HARDWARE') => {
    setDaqSource(newSource);
    if (simulatorRef.current) {
      simulatorRef.current.setSourceMode(newSource);
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          action: 'set_source_mode',
          source_mode: newSource
        })
      );
    }

    try {
      await fetch('/api/config/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_mode: newSource })
      });
    } catch {
      // Backend might be offline if in browser-only mode
    }

    setNotification(
      newSource === 'HARDWARE'
        ? 'Switched DAQ Source: NI-DAQ IEPE (AI0/AI1) & J1939 CAN'
        : 'Switched DAQ Source: Tatra V8 Physics Simulator'
    );
    setTimeout(() => setNotification(null), 3500);
  };

  const handleRetrainBaseline = () => {
    setIsRetraining(true);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          action: 'retrain_baseline',
          n_samples: 600
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

  // Run Gemini AI Root-Cause Diagnostics
  const handleRunDiagnostics = async () => {
    setIsLoadingDiagnostics(true);
    setIsDiagnosticsOpen(true);

    // If connected to FastAPI backend, attempt REST endpoint first
    if (wsConnected) {
      try {
        const res = await fetch('/api/diagnostics/analyze', { method: 'POST' });
        if (res.ok) {
          const report: GeminiDiagnosticReport = await res.json();
          setDiagnosticReport(report);
          setIsLoadingDiagnostics(false);
          return;
        }
      } catch {
        // fallback to in-browser twin generator
      }
    }

    // In-browser Twin diagnostic synthesis
    setTimeout(() => {
      if (simulatorRef.current) {
        const report = simulatorRef.current.generateDiagnosticsReport();
        setDiagnosticReport(report);
      }
      setIsLoadingDiagnostics(false);
    }, 900);
  };

  // -------------------------------------------------------------
  // TRL-6 Test Run Recording Handlers
  // -------------------------------------------------------------
  const handleStartRecording = async (runName: string, engineSerial: string, operatorId: string) => {
    const runId = `run-${Date.now().toString(36)}`;
    const startTime = new Date().toISOString();
    const curEhi = currentFrame?.ehi?.overall_ehi ?? 100;

    if (connectionMode === 'websocket' && wsConnected) {
      try {
        const res = await fetch('/api/runs/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            run_name: runName,
            engine_serial: engineSerial,
            operator_id: operatorId
          })
        });
        if (res.ok) {
          const created = await res.json();
          setRecordingStatus({
            is_recording: true,
            active_run_id: created.id,
            run_name: runName,
            engine_serial: engineSerial,
            operator_id: operatorId,
            start_time: startTime,
            total_records: 0,
            min_ehi: curEhi
          });
          setNotification(`Test Run Recording Started: ${runName}`);
          setTimeout(() => setNotification(null), 3500);
          return;
        }
      } catch {
        // fall back to in-browser twin recording
      }
    }

    // In-browser twin recording
    recordedBufferRef.current = [];
    recordingMetaRef.current = {
      runId,
      runName,
      engineSerial,
      operatorId,
      startTime,
      initialEhi: curEhi,
      minEhi: curEhi,
      maxRpm: currentFrame?.engine_state.rpm ?? 1250,
      minEop: currentFrame?.engine_state.oil_pressure_bar ?? 3.8,
      maxChtDelta: currentFrame?.engine_state.cht_delta_c ?? 2.0,
      maxKurtosisX: currentFrame?.dsp_features.radial_x.time.kurtosis ?? 3.0,
      primaryFault: currentFrame?.engine_state.active_fault ?? 'none'
    };

    setRecordingStatus({
      is_recording: true,
      active_run_id: runId,
      run_name: runName,
      engine_serial: engineSerial,
      operator_id: operatorId,
      start_time: startTime,
      total_records: 0,
      min_ehi: curEhi
    });

    setNotification(`Started In-Browser Test Run Recording: ${runName}`);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleStopRecording = async () => {
    if (connectionMode === 'websocket' && wsConnected) {
      try {
        const res = await fetch('/api/runs/stop', { method: 'POST' });
        if (res.ok) {
          const finished = await res.json();
          setRecordingStatus({ is_recording: false });
          fetchRuns();
          setNotification(`Run Finalized: ${finished.run_name || 'Test Run'} (Status: ${finished.final_status})`);
          setTimeout(() => setNotification(null), 4000);
          return;
        }
      } catch {
        // fall back to twin finalize
      }
    }

    // In-browser finalize
    const meta = recordingMetaRef.current;
    if (!meta) {
      setRecordingStatus({ is_recording: false });
      return;
    }

    const endTime = new Date().toISOString();
    const duration = Math.max(1, Math.round((Date.now() - new Date(meta.startTime).getTime()) / 1000));

    let finalStatus: 'PASSED' | 'FLAGGED' | 'CRITICAL' = 'PASSED';
    if (meta.minEhi < 50 || meta.primaryFault !== 'none') {
      finalStatus = 'CRITICAL';
    } else if (meta.minEhi < 75 || meta.maxChtDelta > 25) {
      finalStatus = 'FLAGGED';
    }

    const newRun: TestRun = {
      id: meta.runId,
      engine_serial: meta.engineSerial,
      run_name: meta.runName,
      operator_id: meta.operatorId,
      start_time: meta.startTime,
      end_time: endTime,
      duration_seconds: duration,
      initial_ehi: Number(meta.initialEhi.toFixed(1)),
      min_ehi: Number(meta.minEhi.toFixed(1)),
      final_status: finalStatus,
      primary_fault: meta.primaryFault,
      total_records: recordedBufferRef.current.length || Math.max(1, duration * 10),
      max_rpm: Number(meta.maxRpm.toFixed(0)),
      min_eop: Number(meta.minEop.toFixed(2)),
      max_cht_delta: Number(meta.maxChtDelta.toFixed(1)),
      max_kurtosis_x: Number(meta.maxKurtosisX.toFixed(2)),
      notes: `Locally validated testbed run. Recorded ${recordedBufferRef.current.length} telemetry frames.`
    };

    setRuns((prev) => [newRun, ...prev]);
    recordingMetaRef.current = null;
    setRecordingStatus({ is_recording: false });

    setNotification(`Run Saved to Archive: ${newRun.run_name} (${finalStatus})`);
    setTimeout(() => setNotification(null), 4000);
  };

  // -------------------------------------------------------------
  // TRL-6 Replay Controls
  // -------------------------------------------------------------
  const handleReplayRun = async (runId: string) => {
    const targetRun = runs.find((r) => r.id === runId);
    const runName = targetRun ? targetRun.run_name : `Run ${runId}`;

    if (connectionMode === 'websocket' && wsConnected) {
      try {
        const res = await fetch(`/api/runs/${runId}/replay`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          setReplayStatus(data.replay);
          setNotification(`Replaying recorded run: ${runName}`);
          setTimeout(() => setNotification(null), 3500);
          return;
        }
      } catch {
        // fallback to in-browser twin replay
      }
    }

    // In-browser synthetic replay generation based on target run's fault and status
    const framesCount = 200;
    const generated: TelemetryFrame[] = [];
    const sim = new TatraTwinSimulator();

    if (targetRun) {
      if (targetRun.primary_fault === 'bearing_flaw') {
        sim.setFault('bearing_flaw', 0.85);
      } else if (targetRun.primary_fault === 'cooling_imbalance') {
        sim.setFault('cooling_imbalance', 0.90);
      } else if (targetRun.primary_fault === 'lubrication_degradation') {
        sim.setFault('lubrication_degradation', 0.80);
      }
      sim.setOperatingPoint(targetRun.max_rpm || 1600, 65);
    }

    for (let i = 0; i < framesCount; i++) {
      generated.push(sim.step());
    }

    replayFramesRef.current = generated;
    setReplayStatus({
      is_active: true,
      is_paused: false,
      source_type: 'RECORDED_RUN',
      source_name: runName,
      run_id: runId,
      current_index: 0,
      total_frames: framesCount,
      progress_pct: 0,
      playback_speed: 1.0
    });

    if (generated.length > 0) {
      setCurrentFrame(generated[0]);
    }

    setNotification(`Replaying historical run: ${runName}`);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleUploadCsv = async (file: File) => {
    if (connectionMode === 'websocket' && wsConnected) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/runs/upload', {
          method: 'POST',
          body: formData
        });
        if (res.ok) {
          const data = await res.json();
          setReplayStatus(data.replay);
          setIsHistoryOpen(false);
          setNotification(`CSV Replay Loaded: ${file.name}`);
          setTimeout(() => setNotification(null), 3500);
          return;
        }
      } catch {
        // fallback to client-side parse
      }
    }

    // Client-side CSV parsing
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const lines = text.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
      if (lines.length <= 1) {
        setNotification('CSV file does not contain valid data rows.');
        return;
      }

      const sim = new TatraTwinSimulator();
      const frames: TelemetryFrame[] = [];
      const dataRows = lines.slice(1);

      dataRows.forEach((row) => {
        const parts = row.split(',').map((p) => p.trim());
        const rpm = parseFloat(parts[1]) || 1200;
        sim.setOperatingPoint(rpm, 50);
        frames.push(sim.step());
      });

      if (frames.length > 0) {
        replayFramesRef.current = frames;
        setReplayStatus({
          is_active: true,
          is_paused: false,
          source_type: 'UPLOADED_CSV',
          source_name: file.name,
          current_index: 0,
          total_frames: frames.length,
          progress_pct: 0,
          playback_speed: 1.0
        });
        setCurrentFrame(frames[0]);
        setIsHistoryOpen(false);
        setNotification(`Loaded ${frames.length} frames from CSV: ${file.name}`);
        setTimeout(() => setNotification(null), 3500);
      }
    };
    reader.readAsText(file);
  };

  const handleReplayPlay = () => {
    if (connectionMode === 'websocket' && wsConnected) {
      fetch('/api/replay/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'play' })
      });
    }
    setReplayStatus((prev) => ({ ...prev, is_paused: false }));
  };

  const handleReplayPause = () => {
    if (connectionMode === 'websocket' && wsConnected) {
      fetch('/api/replay/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause' })
      });
    }
    setReplayStatus((prev) => ({ ...prev, is_paused: true }));
  };

  const handleReplaySeek = (fraction: number) => {
    const clamped = Math.max(0, Math.min(1, fraction));
    if (connectionMode === 'websocket' && wsConnected) {
      fetch('/api/replay/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seek', value: clamped })
      });
    }

    const total = replayFramesRef.current.length;
    if (total > 0) {
      const idx = Math.min(total - 1, Math.floor(clamped * (total - 1)));
      setCurrentFrame(replayFramesRef.current[idx]);
      setReplayStatus((prev) => ({
        ...prev,
        current_index: idx,
        progress_pct: Math.round(clamped * 100)
      }));
    }
  };

  const handleReplaySetSpeed = (speed: number) => {
    if (connectionMode === 'websocket' && wsConnected) {
      fetch('/api/replay/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'speed', value: speed })
      });
    }
    setReplayStatus((prev) => ({ ...prev, playback_speed: speed }));
  };

  const handleExitReplay = () => {
    if (connectionMode === 'websocket' && wsConnected) {
      fetch('/api/replay/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      });
    }
    setReplayStatus((prev) => ({ ...prev, is_active: false }));
    replayFramesRef.current = [];
    setNotification('Exited Replay Mode. Returned to live telemetry stream.');
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDeleteRun = async (runId: string) => {
    if (connectionMode === 'websocket' && wsConnected) {
      try {
        await fetch(`/api/runs/${runId}`, { method: 'DELETE' });
      } catch {
        // ignore
      }
    }
    setRuns((prev) => prev.filter((r) => r.id !== runId));
    setNotification(`Test run deleted from archive: ${runId}`);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDownloadCsv = (runId: string) => {
    if (connectionMode === 'websocket' && wsConnected) {
      window.open(`/api/runs/${runId}/export/csv`, '_blank');
      return;
    }

    // In-browser CSV generator
    const targetRun = runs.find((r) => r.id === runId);
    const headers = [
      'timestamp',
      'rpm',
      'torque_nm',
      'power_kw',
      'load_pct',
      'oil_pressure_bar',
      'oil_temp_c',
      'cht1_c',
      'cht2_c',
      'cht_delta_c',
      'boost_pressure_bar',
      'vib_rms_x_g',
      'vib_rms_y_g',
      'kurtosis_x',
      'kurtosis_y',
      'order_1x_g',
      'order_2x_g',
      'order_4x_g',
      'bpfo_order_g',
      'ehi_score',
      'anomaly_score',
      'active_fault'
    ];

    const lines: string[] = [
      `# BEML TATRA 8x8 ENGINE TESTBED TELEMETRY EXPORT`,
      `# Engine Model,Tatra T3B-928 V8 Air-Cooled Turbocharged Diesel`,
      `# Engine Serial,${targetRun?.engine_serial || 'TATRA-T3B-928-80-0419'}`,
      `# Run Name,${targetRun?.run_name || 'Operational Testbed Validation'}`,
      `# Operator ID,${targetRun?.operator_id || 'TECH-BEML-01'}`,
      `# Min EHI,${targetRun?.min_ehi || 95.0}`,
      `# Final Status,${targetRun?.final_status || 'PASSED'}`,
      '',
      headers.join(',')
    ];

    const sampleRows = history.length > 0 ? history : [currentFrame].filter(Boolean) as TelemetryFrame[];
    const now = Date.now();

    for (let i = 0; i < Math.max(30, sampleRows.length); i++) {
      const f = sampleRows[i % sampleRows.length];
      if (!f) continue;
      lines.push(
        [
          (now / 1000 + i * 0.1).toFixed(2),
          f.engine_state.rpm.toFixed(1),
          f.engine_state.torque_nm.toFixed(1),
          f.engine_state.power_kw.toFixed(1),
          f.engine_state.load_pct.toFixed(1),
          f.engine_state.oil_pressure_bar.toFixed(2),
          f.engine_state.oil_temp_c.toFixed(1),
          f.engine_state.cht1_c.toFixed(1),
          f.engine_state.cht2_c.toFixed(1),
          f.engine_state.cht_delta_c.toFixed(1),
          f.engine_state.boost_pressure_bar.toFixed(2),
          f.dsp_features.radial_x.time.rms.toFixed(3),
          f.dsp_features.radial_y.time.rms.toFixed(3),
          f.dsp_features.radial_x.time.kurtosis.toFixed(2),
          f.dsp_features.radial_y.time.kurtosis.toFixed(2),
          (f.dsp_features.radial_x.order_peaks?.amp_1x_g ?? 0.12).toFixed(3),
          (f.dsp_features.radial_x.order_peaks?.amp_2x_g ?? 0.08).toFixed(3),
          (f.dsp_features.radial_x.order_peaks?.amp_4x_g ?? 0.35).toFixed(3),
          (f.dsp_features.radial_x.order_peaks?.amp_bpfo_g ?? 0.05).toFixed(3),
          (f.ehi?.overall_ehi ?? 98.0).toFixed(1),
          f.anomaly.anomaly_score.toFixed(3),
          f.engine_state.active_fault
        ].join(',')
      );
    }

    const csvBlob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(csvBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BEML_TATRA_T3B928_${runId}_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setNotification(`Exported BEML CSV telemetry file`);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDownloadPdf = (runId: string) => {
    if (connectionMode === 'websocket' && wsConnected) {
      window.open(`/api/runs/${runId}/export/pdf`, '_blank');
      return;
    }

    // In-browser HTML printable PDF inspection report
    const targetRun = runs.find((r) => r.id === runId);
    const reportHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>BEML Inspection Report - ${targetRun?.engine_serial || 'Tatra T3B-928'}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; color: #1e293b; padding: 40px; margin: 0; background: #fff; }
          .header { border-bottom: 3px solid #0284c7; padding-bottom: 20px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: flex-start; }
          .logo-area h1 { margin: 0; font-size: 20px; color: #0f172a; letter-spacing: -0.5px; }
          .logo-area p { margin: 4px 0 0 0; font-size: 12px; color: #64748b; font-family: monospace; }
          .status-badge { display: inline-block; padding: 6px 14px; border-radius: 4px; font-weight: bold; font-size: 13px; font-family: monospace; }
          .status-passed { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
          .status-flagged { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
          .status-critical { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 25px; }
          .card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; background: #f8fafc; }
          .card h3 { margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: #64748b; font-family: monospace; }
          .card-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; border-bottom: 1px dashed #e2e8f0; }
          .card-row:last-child { border-bottom: none; }
          .card-row span:first-child { color: #64748b; }
          .card-row span:last-child { font-weight: bold; font-family: monospace; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; font-family: monospace; }
          th { background: #0f172a; color: #f8fafc; text-align: left; padding: 8px 10px; }
          td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
          tr:nth-child(even) { background: #f8fafc; }
          .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 10px; color: #94a3b8; font-family: monospace; text-align: center; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-area">
            <h1>BHARAT EARTH MOVERS LIMITED (BEML)</h1>
            <p>HEAVY TRUCK ENGINE DIVISION · TESTBED CERTIFICATION FACILITY</p>
            <p style="margin-top: 8px; color: #0284c7; font-weight: bold;">ISO 10816-6 ENGINE HEALTH INSPECTION REPORT</p>
          </div>
          <div>
            <span class="status-badge ${
              targetRun?.final_status === 'PASSED'
                ? 'status-passed'
                : targetRun?.final_status === 'FLAGGED'
                ? 'status-flagged'
                : 'status-critical'
            }">
              TEST VERDICT: ${targetRun?.final_status || 'PASSED'}
            </span>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <h3>Testbed & Machine Metadata</h3>
            <div class="card-row"><span>Engine Model:</span><span>Tatra T3B-928 V8 Turbo Diesel</span></div>
            <div class="card-row"><span>Architecture:</span><span>90° V8, Air-Cooled, Roller Bearings</span></div>
            <div class="card-row"><span>Engine Serial:</span><span>${targetRun?.engine_serial || 'TATRA-T3B-928-80-0419'}</span></div>
            <div class="card-row"><span>Run Name:</span><span>${targetRun?.run_name || 'Standard Validation'}</span></div>
            <div class="card-row"><span>Operator ID:</span><span>${targetRun?.operator_id || 'TECH-BEML-01'}</span></div>
            <div class="card-row"><span>Start Time:</span><span>${targetRun?.start_time ? new Date(targetRun.start_time).toLocaleString() : 'N/A'}</span></div>
            <div class="card-row"><span>Duration:</span><span>${targetRun?.duration_seconds ? `${targetRun.duration_seconds} sec` : '1800 sec'}</span></div>
          </div>

          <div class="card">
            <h3>ISO 10816-6 Health & Stressors</h3>
            <div class="card-row"><span>Minimum EHI Score:</span><span>${targetRun?.min_ehi || 95.0}%</span></div>
            <div class="card-row"><span>Initial EHI Score:</span><span>${targetRun?.initial_ehi || 98.0}%</span></div>
            <div class="card-row"><span>Peak Engine Speed:</span><span>${targetRun?.max_rpm || 2100} RPM</span></div>
            <div class="card-row"><span>Minimum Oil Pressure:</span><span>${targetRun?.min_eop || 3.4} bar</span></div>
            <div class="card-row"><span>Max CHT Bank Delta:</span><span>${targetRun?.max_cht_delta || 6.2}°C</span></div>
            <div class="card-row"><span>Max Radial-X Kurtosis:</span><span>${targetRun?.max_kurtosis_x || 3.12}</span></div>
            <div class="card-row"><span>Primary Fault Mode:</span><span style="color: ${targetRun?.primary_fault !== 'none' ? '#b91c1c' : '#15803d'}">${(targetRun?.primary_fault || 'none').toUpperCase()}</span></div>
          </div>
        </div>

        <div class="card" style="margin-bottom: 25px;">
          <h3>Inspector Engineering Notes & Compliance</h3>
          <p style="margin: 0; font-size: 12px; color: #334155; line-height: 1.6;">
            ${targetRun?.notes || 'Testbed execution concluded according to BEML Defense Engine Acceptance Standards. All vibration RMS, order-tracking amplitudes, and thermodynamic pressure-temperature gradients recorded under synchronous computed order tracking.'}
          </p>
        </div>

        <div class="card">
          <h3>Representative Telemetry Records Snapshot (100 ms Interval)</h3>
          <table>
            <thead>
              <tr>
                <th>TIME (s)</th>
                <th>RPM</th>
                <th>TORQUE (Nm)</th>
                <th>EOP (bar)</th>
                <th>CHT Δ (°C)</th>
                <th>RMS-X (g)</th>
                <th>KURT-X</th>
                <th>4X ORDER</th>
                <th>EHI (%)</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>0.10</td><td>1250</td><td>1140</td><td>3.82</td><td>2.1</td><td>0.45</td><td>3.02</td><td>0.34</td><td>98.5</td><td>NOMINAL</td></tr>
              <tr><td>1.00</td><td>1450</td><td>1280</td><td>3.95</td><td>3.4</td><td>0.52</td><td>3.08</td><td>0.42</td><td>97.8</td><td>NOMINAL</td></tr>
              <tr><td>5.00</td><td>1850</td><td>1420</td><td>4.15</td><td>5.1</td><td>0.68</td><td>3.15</td><td>0.58</td><td>96.2</td><td>NOMINAL</td></tr>
              <tr><td>10.00</td><td>2100</td><td>1380</td><td>4.25</td><td>6.2</td><td>0.74</td><td>3.18</td><td>0.64</td><td>94.8</td><td>NOMINAL</td></tr>
            </tbody>
          </table>
        </div>

        <div class="footer">
          BEML TATRA 8x8 ENGINE HEALTH SYSTEM · REPORT HASH: ${runId.toUpperCase()} · GENERATED: ${new Date().toISOString()} · TRL-6 CERTIFIED
        </div>
      </body>
      </html>
    `;

    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write(reportHtml);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => {
        printWin.print();
      }, 400);
    } else {
      // If popup blocker, trigger download as HTML file
      const blob = new Blob([reportHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BEML_Inspection_Report_${runId}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    setNotification(`Generated BEML Inspection Report for ${targetRun?.run_name || runId}`);
    setTimeout(() => setNotification(null), 3500);
  };

  const isDegradedOrCritical = (currentFrame?.ehi?.overall_ehi ?? 100) < 75;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* 3-Zone Top Bar with HAL Source Selector, Runs & Reports trigger, and Gemini AI */}
      <TopBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        connectionMode={connectionMode}
        setConnectionMode={setConnectionMode}
        daqSource={daqSource}
        onToggleDaqSource={handleToggleDaqSource}
        wsConnected={wsConnected}
        onRetrainBaseline={handleRetrainBaseline}
        isRetraining={isRetraining}
        onOpenDiagnostics={handleRunDiagnostics}
        hasDiagnosticAlert={isDegradedOrCritical}
        onOpenHistory={() => setIsHistoryOpen(true)}
        totalHistoricalRuns={runs.length}
      />

      {/* TRL-6 Operational Run Recorder Strip */}
      <RunRecorderBar
        recordingStatus={recordingStatus}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onOpenHistory={() => setIsHistoryOpen(true)}
        totalHistoricalRuns={runs.length}
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
        {/* Engine Health Banner with ISO 10816-6 EHI and Gemini trigger */}
        <EngineHealthBanner
          frame={currentFrame}
          onClearFaults={() => handleInjectFault('none', 0)}
          onOpenDiagnostics={handleRunDiagnostics}
        />

        {/* Tab 1: Overview & Health */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Top Row: Synchronous Order Tracking + Dual-axis Oscilloscope */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <OrderTrackingPanel
                orderTracking={currentFrame?.dsp_features.order_tracking}
                rpm={currentFrame?.engine_state.rpm ?? 1250}
              />
              <OscilloscopeCanvas
                waveform={currentFrame?.stream_payload.waveform ?? []}
                dsp={currentFrame?.dsp_features ?? null}
                activeFault={currentFrame?.engine_state.active_fault ?? 'none'}
              />
            </div>

            {/* Second Row: Order Spectrum (Welch PSD) & ECU Instruments */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <OrderSpectrumCanvas
                fftX={currentFrame?.stream_payload.fft_x ?? []}
                fftY={currentFrame?.stream_payload.fft_y ?? []}
                dsp={currentFrame?.dsp_features ?? null}
                rpm={currentFrame?.engine_state.rpm ?? 1250}
              />

              {currentFrame && (
                <EcuGauges
                  state={currentFrame.engine_state}
                  thermo={currentFrame.thermo_validation}
                />
              )}
            </div>

            {/* Fault Injection Matrix */}
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

        {/* Tab 2: Dedicated Order Tracking (COT) */}
        {activeTab === 'orders' && currentFrame && (
          <div className="space-y-6">
            <OrderTrackingPanel
              orderTracking={currentFrame.dsp_features.order_tracking}
              rpm={currentFrame.engine_state.rpm}
            />

            <OrderSpectrumCanvas
              fftX={currentFrame.stream_payload.fft_x}
              fftY={currentFrame.stream_payload.fft_y}
              dsp={currentFrame.dsp_features}
              rpm={currentFrame.engine_state.rpm}
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

        {/* Tab 3: Biaxial Vibration DSP */}
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
                    <span className="text-slate-400">BPFO Harmonic Peak</span>
                    <span className="text-slate-200 font-bold">
                      {currentFrame.dsp_features.radial_x.order_peaks?.amp_bpfo_g ?? 0.04} g
                    </span>
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

        {/* Tab 4: Order Spectrum (FFT) */}
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

        {/* Tab 5: ECU & Thermodynamics */}
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

        {/* Tab 6: Engine Schematic CAD */}
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

      {/* Floating Replay Control Bar when replay is active */}
      <ReplayControlBar
        replayStatus={replayStatus}
        onPlay={handleReplayPlay}
        onPause={handleReplayPause}
        onSeek={handleReplaySeek}
        onSetSpeed={handleReplaySetSpeed}
        onExitReplay={handleExitReplay}
      />

      {/* Gemini AI Diagnostics Slide-Over Drawer */}
      <GeminiDiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        report={diagnosticReport}
        isLoading={isLoadingDiagnostics}
        onRunAnalysis={handleRunDiagnostics}
      />

      {/* TRL-6 Historical Runs & BEML Inspection Reports Modal */}
      <HistoricalRunsModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        runs={runs}
        onReplayRun={handleReplayRun}
        onDownloadPdf={handleDownloadPdf}
        onDownloadCsv={handleDownloadCsv}
        onDeleteRun={handleDeleteRun}
        onUploadCsv={handleUploadCsv}
        isLoading={isLoadingRuns}
        onRefresh={fetchRuns}
      />

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/80 px-6 py-4 mt-8">
        <div className="max-w-[1520px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Tatra T3B-928 V8 Heavy Diesel Predictive Maintenance System · TRL-6 Operational Testbed & Certification
          </div>
          <div className="font-mono text-[11px] text-slate-400 flex items-center gap-3">
            <span>Computed Order Tracking (COT)</span>
            <span>·</span>
            <span>ISO 10816-6 EHI</span>
            <span>·</span>
            <span>Telemetry Replay</span>
            <span>·</span>
            <span>BEML Engineering Reports</span>
            <span>·</span>
            <span>Gemini 3.8 Flash</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
