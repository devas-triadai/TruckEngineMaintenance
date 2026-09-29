import React, { useState, useEffect } from 'react';
import { Circle, Square, HardDrive, Clock, CheckCircle2, AlertOctagon, FileText } from 'lucide-react';
import { RecordingStatus } from '../types/telemetry';

interface RunRecorderBarProps {
  recordingStatus?: RecordingStatus;
  onStartRecording: (runName: string, engineSerial: string, operatorId: string) => void;
  onStopRecording: () => void;
  onOpenHistory: () => void;
  totalHistoricalRuns: number;
}

export const RunRecorderBar: React.FC<RunRecorderBarProps> = ({
  recordingStatus,
  onStartRecording,
  onStopRecording,
  onOpenHistory,
  totalHistoricalRuns
}) => {
  const isRecording = recordingStatus?.is_recording ?? false;
  const [runName, setRunName] = useState<string>('Operational Testbed Validation #01');
  const [engineSerial, setEngineSerial] = useState<string>('TATRA-T3B-928-80-0419');
  const [operatorId, setOperatorId] = useState<string>('TECH-BEML-01');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    let timer: any = null;
    if (isRecording) {
      const startTime = recordingStatus?.start_time ? new Date(recordingStatus.start_time).getTime() : Date.now();
      timer = setInterval(() => {
        const secs = Math.floor((Date.now() - startTime) / 1000);
        setElapsedSeconds(Math.max(0, secs));
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRecording, recordingStatus?.start_time]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remSecs.toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    if (!runName.trim()) return;
    onStartRecording(runName.trim(), engineSerial.trim(), operatorId.trim());
  };

  return (
    <div className={`w-full max-w-full px-4 py-2 border-b transition-colors overflow-x-hidden ${
      isRecording
        ? 'bg-rose-950/30 border-rose-900/50'
        : 'bg-slate-900/90 border-slate-800'
    }`}>
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5 text-xs">
        {/* Left Side: Status / Recording Inputs */}
        <div className="flex flex-wrap items-center gap-3">
          {isRecording ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-rose-400 font-mono font-bold tracking-wider animate-pulse">
                <Circle className="w-3 h-3 fill-rose-500 text-rose-500" />
                <span>REC LIVE</span>
              </span>
              <span className="text-slate-600">/</span>
              <span className="font-mono text-slate-300 font-bold tabular-nums">
                {formatTime(elapsedSeconds)}
              </span>
              <span className="text-slate-600">/</span>
              <span className="text-slate-300 font-mono">
                Run: <strong>{recordingStatus?.run_name}</strong>
              </span>
              <span className="text-slate-600">/</span>
              <span className="text-slate-400 font-mono">
                SN: {recordingStatus?.engine_serial}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 text-slate-400 font-mono">
                <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                <span className="font-medium">TEST RUN RECORDER:</span>
              </div>
              <input
                type="text"
                value={runName}
                onChange={(e) => setRunName(e.target.value)}
                placeholder="Enter Run Name..."
                className="bg-slate-950 border border-slate-700/80 rounded px-2.5 py-1 text-slate-200 text-xs font-mono focus:outline-none focus:border-cyan-500 w-56 sm:w-64"
              />
              <span className="text-slate-500 text-xs hidden sm:inline">|</span>
              <span className="text-slate-400 font-mono text-[11px] hidden md:inline">
                SN: {engineSerial}
              </span>
            </div>
          )}
        </div>

        {/* Right Side: Action Controls */}
        <div className="flex items-center gap-2.5">
          {isRecording ? (
            <div className="flex items-center gap-3">
              <div className="text-[11px] font-mono text-slate-400 hidden sm:block">
                <span>Frames: </span>
                <strong className="text-slate-200 tabular-nums">
                  {recordingStatus?.total_records ?? 0}
                </strong>
                <span className="mx-1.5">·</span>
                <span>Lowest EHI: </span>
                <strong className="text-amber-400 tabular-nums">
                  {recordingStatus?.min_ehi ?? 100}%
                </strong>
              </div>

              <button
                onClick={onStopRecording}
                className="px-3 py-1 rounded bg-rose-950 hover:bg-rose-900 border border-rose-700 text-rose-200 font-mono font-medium transition-colors flex items-center gap-1.5"
              >
                <Square className="w-3 h-3 fill-rose-300" />
                <span>Stop & Finalize Run</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleStart}
                className="px-3 py-1 rounded bg-cyan-950 hover:bg-cyan-900 border border-cyan-600 text-cyan-200 font-mono font-medium transition-colors flex items-center gap-1.5"
              >
                <Circle className="w-2.5 h-2.5 fill-rose-500 text-rose-500" />
                <span>Start Recording</span>
              </button>

              <button
                onClick={onOpenHistory}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-mono text-xs transition-colors flex items-center gap-1.5"
              >
                <FileText className="w-3 h-3 text-cyan-400" />
                <span>Runs & Reports ({totalHistoricalRuns})</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
