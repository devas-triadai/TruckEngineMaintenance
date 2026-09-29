import React, { useState } from 'react';
import { X, Play, Download, Trash2, Upload, FileText, CheckCircle2, AlertTriangle, AlertOctagon, RefreshCw, Calendar, Clock, User, HardDrive } from 'lucide-react';
import { TestRun } from '../types/telemetry';

interface HistoricalRunsModalProps {
  isOpen: boolean;
  onClose: () => void;
  runs: TestRun[];
  onReplayRun: (runId: string) => void;
  onDownloadPdf: (runId: string) => void;
  onDownloadCsv: (runId: string) => void;
  onDeleteRun: (runId: string) => void;
  onUploadCsv: (file: File) => void;
  isLoading: boolean;
  onRefresh: () => void;
}

export const HistoricalRunsModal: React.FC<HistoricalRunsModalProps> = ({
  isOpen,
  onClose,
  runs,
  onReplayRun,
  onDownloadPdf,
  onDownloadCsv,
  onDeleteRun,
  onUploadCsv,
  isLoading,
  onRefresh
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PASSED' | 'FLAGGED' | 'CRITICAL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  if (!isOpen) return null;

  const filteredRuns = runs.filter((r) => {
    const matchesStatus = statusFilter === 'ALL' || r.final_status === statusFilter;
    const matchesQuery =
      r.run_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.engine_serial.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.operator_id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesQuery;
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      onUploadCsv(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                BEML Testbed Operational Runs & Certification Logs
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                <span>Tatra T3B-928 V8</span>
                <span aria-hidden="true">·</span>
                <span>ISO 10816-6 Inspection Archive</span>
                <span aria-hidden="true">·</span>
                <span>{runs.length} Runs Recorded</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
              title="Refresh runs"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Upload External CSV Strip */}
        <div className="px-6 py-3 bg-slate-950/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-300 font-mono">
            <Upload className="w-4 h-4 text-cyan-400" />
            <span>Upload External Testbed Telemetry CSV:</span>
          </div>

          <label className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-mono transition-colors cursor-pointer flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>Select CSV File</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="px-6 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900/80">
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
            {(['ALL', 'PASSED', 'FLAGGED', 'CRITICAL'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded transition-colors ${
                  statusFilter === st
                    ? 'bg-slate-800 text-cyan-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by run name, serial, or operator..."
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs font-mono placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 w-72"
          />
        </div>

        {/* Runs List Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {filteredRuns.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-sm font-mono">
              {runs.length === 0
                ? 'No test runs recorded yet. Start recording a live run or upload a CSV file.'
                : 'No test runs match your search filters.'}
            </div>
          ) : (
            filteredRuns.map((run) => {
              const isPassed = run.final_status === 'PASSED';
              const isFlagged = run.final_status === 'FLAGGED';
              const isCritical = run.final_status === 'CRITICAL';

              const dateStr = run.start_time
                ? new Date(run.start_time).toLocaleString([], {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'N/A';

              return (
                <div
                  key={run.id}
                  className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-4 hover:border-slate-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Left: Info */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-sm font-bold text-slate-100 font-sans">
                        {run.run_name}
                      </h3>
                      <span className="text-slate-600">·</span>
                      <span
                        className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${
                          isPassed
                            ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
                            : isFlagged
                            ? 'bg-amber-950/60 border-amber-800/80 text-amber-300'
                            : 'bg-rose-950/60 border-rose-800/80 text-rose-300'
                        }`}
                      >
                        {run.final_status}
                      </span>
                      {run.primary_fault !== 'none' && (
                        <span className="text-[10px] font-mono text-rose-400 uppercase">
                          ({run.primary_fault.replace('_', ' ')})
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <span>{dateStr}</span>
                      </span>
                      <span className="text-slate-600">·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{run.duration_seconds ? `${run.duration_seconds.toFixed(0)}s` : 'Active'}</span>
                      </span>
                      <span className="text-slate-600">·</span>
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        <span>{run.operator_id}</span>
                      </span>
                      <span className="text-slate-600">·</span>
                      <span>SN: {run.engine_serial}</span>
                    </div>

                    {/* Metrics Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] font-mono">
                      <div className="bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800">
                        <span className="text-slate-500">Min EHI: </span>
                        <strong className={run.min_ehi < 70 ? 'text-amber-400' : 'text-emerald-400'}>
                          {run.min_ehi.toFixed(1)}%
                        </strong>
                      </div>
                      <div className="bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800">
                        <span className="text-slate-500">Max RPM: </span>
                        <strong className="text-slate-200">{run.max_rpm.toFixed(0)}</strong>
                      </div>
                      <div className="bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800">
                        <span className="text-slate-500">Min EOP: </span>
                        <strong className={run.min_eop < 1.8 ? 'text-rose-400' : 'text-slate-200'}>
                          {run.min_eop.toFixed(2)} bar
                        </strong>
                      </div>
                      <div className="bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800">
                        <span className="text-slate-500">Max CHT Δ: </span>
                        <strong className={run.max_cht_delta > 25 ? 'text-rose-400' : 'text-slate-200'}>
                          {run.max_cht_delta.toFixed(1)}°C
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 self-start md:self-center shrink-0">
                    <button
                      onClick={() => {
                        onReplayRun(run.id);
                        onClose();
                      }}
                      className="px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-700 text-cyan-300 font-mono text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      title="Replay telemetry in live dashboard"
                    >
                      <Play className="w-3.5 h-3.5 fill-cyan-300" />
                      <span>Replay</span>
                    </button>

                    <button
                      onClick={() => onDownloadPdf(run.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs flex items-center gap-1.5 transition-colors"
                      title="Download formal BEML ISO 10816-6 Inspection PDF"
                    >
                      <Download className="w-3.5 h-3.5 text-cyan-400" />
                      <span>PDF</span>
                    </button>

                    <button
                      onClick={() => onDownloadCsv(run.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs flex items-center gap-1.5 transition-colors"
                      title="Download telemetry time-series CSV"
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      <span>CSV</span>
                    </button>

                    <button
                      onClick={() => onDeleteRun(run.id)}
                      className="p-1.5 rounded-lg bg-slate-950 hover:bg-rose-950/60 border border-slate-800 hover:border-rose-800 text-slate-500 hover:text-rose-300 transition-colors"
                      title="Delete run"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
