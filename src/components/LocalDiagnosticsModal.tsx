import React, { useState } from 'react';
import { LocalDiagnosticReport } from '../types/telemetry';
import {
  Cpu,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  Download,
  ClipboardList,
  Wrench,
  Clock,
  ShieldCheck
} from 'lucide-react';

interface LocalDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: LocalDiagnosticReport | null;
  isLoading: boolean;
  onRunAnalysis: () => void;
}

export const LocalDiagnosticsModal: React.FC<LocalDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  report,
  isLoading,
  onRunAnalysis
}) => {
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  if (!isOpen) return null;

  const toggleCheck = (idx: number) => {
    setCheckedItems((prev) => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const getCriticalityBadge = (crit?: string) => {
    switch (crit) {
      case 'IMMEDIATE_SHUTDOWN':
        return {
          label: 'IMMEDIATE SHUTDOWN',
          badgeClass: 'bg-rose-950/80 border-rose-600 text-rose-300 animate-pulse',
          icon: <AlertOctagon className="w-4 h-4 text-rose-400" />
        };
      case 'HIGH':
        return {
          label: 'HIGH CRITICALITY',
          badgeClass: 'bg-rose-950/60 border-rose-700 text-rose-300',
          icon: <AlertTriangle className="w-4 h-4 text-rose-400" />
        };
      case 'MEDIUM':
        return {
          label: 'MEDIUM SEVERITY',
          badgeClass: 'bg-amber-950/60 border-amber-700 text-amber-300',
          icon: <AlertTriangle className="w-4 h-4 text-amber-400" />
        };
      case 'LOW':
      default:
        return {
          label: 'NOMINAL / LOW RISK',
          badgeClass: 'bg-emerald-950/60 border-emerald-700 text-emerald-300',
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        };
    }
  };

  const critInfo = getCriticalityBadge(report?.criticality);

  const exportReportMarkdown = () => {
    if (!report) return;
    const md = `# TATRA T3B-928 V8 TESTBED - OFFLINE EXPERT DIAGNOSTIC REPORT
Generated: ${new Date().toISOString()}
Engine: ${report.engine_model || 'Tatra T3B-928 V8 Air-Cooled Diesel'}
Source: ${report.source || 'RULE_BASED_EXPERT'}
Model Version: ${report.model_version || 'BEML Deterministic Expert System'}
Criticality: ${report.criticality}
Component Affected: ${report.component_affected}

## 1. ROOT CAUSE HYPOTHESIS
${report.root_cause_hypothesis}

## 2. PRESCRIPTIVE TESTBED INSPECTION PROTOCOL
${report.recommended_actions.map((act, i) => `${i + 1}. [ ] ${act}`).join('\n')}

---
Certified for BEML / Tatra 8x8 Powertrain Functional Validation (TRL-6 Air-Gapped)
`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tatra_v8_diagnostic_report_${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-950 border-l border-slate-800 h-full flex flex-col shadow-2xl overflow-y-auto">
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between sticky top-0 bg-slate-950/95 backdrop-blur z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100">
                  BEML Expert Analysis (100% Offline)
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800 text-cyan-300">
                  {report?.model_version || 'Rule-Based / Local Ollama'}
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 inline" />
                <span>Air-Gapped Testbed Engine · Zero Cloud Dependencies</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRunAnalysis}
              disabled={isLoading}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-cyan-400 transition-colors disabled:opacity-50"
              title="Run Local Diagnostics"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 flex-1">
          {isLoading ? (
            <div className="py-24 text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-xl bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400 animate-spin">
                <Cpu className="w-6 h-6" />
              </div>
              <div className="text-sm font-semibold text-slate-200 font-sans">
                Running Offline Diagnostic Engine...
              </div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto font-mono">
                Evaluating CHT thermal bank delta, lubricating oil pressure degradation curves, and ISO 10816-6 vibration kurtosis impacts.
              </p>
            </div>
          ) : report ? (
            <>
              {/* Criticality & Affected Component Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                <div className={`p-4 rounded-xl border flex items-center gap-3 ${critInfo.badgeClass}`}>
                  <div className="shrink-0">{critInfo.icon}</div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">Mechanical Risk</div>
                    <div className="text-sm font-bold mt-0.5">{critInfo.label}</div>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center gap-3">
                  <Wrench className="w-5 h-5 text-cyan-400 shrink-0" />
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">Suspect Assembly</div>
                    <div className="text-sm font-bold text-slate-100 mt-0.5 truncate">
                      {report.component_affected}
                    </div>
                  </div>
                </div>
              </div>

              {/* Root Cause Hypothesis Box */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-400">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Engineering Root-Cause Hypothesis</span>
                </div>
                <p className="text-sm text-slate-200 leading-relaxed font-sans">
                  {report.root_cause_hypothesis}
                </p>
              </div>

              {/* Prescriptive Inspection Protocols (Interactive Checklist) */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-400">
                    <ClipboardList className="w-3.5 h-3.5 text-amber-400" />
                    <span>Prescriptive Testbed Technician Checklist</span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {Object.values(checkedItems).filter(Boolean).length} / {report.recommended_actions.length} completed
                  </span>
                </div>

                <div className="space-y-2.5">
                  {report.recommended_actions.map((action, idx) => {
                    const isChecked = !!checkedItems[idx];
                    return (
                      <div
                        key={idx}
                        onClick={() => toggleCheck(idx)}
                        className={`p-3 rounded-lg border text-xs cursor-pointer transition-all flex items-start gap-3 ${
                          isChecked
                            ? 'bg-emerald-950/20 border-emerald-800/40 text-slate-400 line-through'
                            : 'bg-slate-950/80 border-slate-800/80 text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded border mt-0.5 flex items-center justify-center shrink-0 transition-colors ${
                            isChecked
                              ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                              : 'border-slate-700 bg-slate-900'
                          }`}
                        >
                          {isChecked && <CheckCircle2 className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <span className="leading-relaxed">{action}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Report Metadata Footer */}
              <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 font-mono">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    Analysis Engine: {report.source} · {report.model_version}
                  </span>
                </div>

                <button
                  onClick={exportReportMarkdown}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3 h-3 text-cyan-400" />
                  <span>Export Report (.md)</span>
                </button>
              </div>
            </>
          ) : (
            <div className="py-24 text-center space-y-3">
              <div className="text-sm font-semibold text-slate-300">No active report generated</div>
              <button
                onClick={onRunAnalysis}
                className="px-4 py-2 text-xs font-medium text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors font-mono"
              >
                Run Local Diagnostics
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
