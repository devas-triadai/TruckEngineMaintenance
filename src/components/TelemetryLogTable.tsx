import React, { useState } from 'react';
import { TelemetryFrame } from '../types/telemetry';
import { Table, Download, ShieldAlert, CheckCircle, Clock } from 'lucide-react';

interface TelemetryLogTableProps {
  history: TelemetryFrame[];
  onClearHistory: () => void;
}

export const TelemetryLogTable: React.FC<TelemetryLogTableProps> = ({ history, onClearHistory }) => {
  const [filterAnomalyOnly, setFilterAnomalyOnly] = useState(false);

  const displayedRows = filterAnomalyOnly
    ? history.filter((f) => f.anomaly.is_anomaly)
    : history;

  const exportCsv = () => {
    if (history.length === 0) return;
    const headers = [
      'Timestamp',
      'RPM',
      'Torque_Nm',
      'Power_kW',
      'OilPressure_bar',
      'OilTemp_C',
      'CHT1_C',
      'CHT2_C',
      'CHT_Delta_C',
      'RadX_RMS_g',
      'RadY_RMS_g',
      'RadX_Kurtosis',
      'RadY_Kurtosis',
      'RadX_CrestFactor',
      'Bearing_HF_Energy_g',
      'Anomaly_Score',
      'Is_Anomaly',
      'Active_Fault'
    ];

    const rows = history.map((f) => [
      f.timestamp.toFixed(2),
      f.engine_state.rpm,
      f.engine_state.torque_nm,
      f.engine_state.power_kw,
      f.engine_state.oil_pressure_bar,
      f.engine_state.oil_temp_c,
      f.engine_state.cht1_c,
      f.engine_state.cht2_c,
      f.engine_state.cht_delta_c,
      f.dsp_features.radial_x.time.rms,
      f.dsp_features.radial_y.time.rms,
      f.dsp_features.radial_x.time.kurtosis,
      f.dsp_features.radial_y.time.kurtosis,
      f.dsp_features.radial_x.time.crest_factor,
      f.dsp_features.radial_x.spectral.energy_hf_bearing,
      f.anomaly.anomaly_score,
      f.anomaly.is_anomaly ? 1 : 0,
      f.engine_state.active_fault
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `tatra_v8_telemetry_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Table className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-100">
            Real-Time Multimodal Telemetry Flight Recorder
          </h3>
          <span className="text-xs text-slate-500 font-mono">
            ({history.length} snapshots recorded)
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setFilterAnomalyOnly(!filterAnomalyOnly)}
            className={`px-2.5 py-1 rounded-lg border font-mono transition-colors ${
              filterAnomalyOnly
                ? 'bg-rose-950/60 border-rose-800 text-rose-300 font-bold'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {filterAnomalyOnly ? 'Showing Anomalies Only' : 'Filter Anomalies'}
          </button>

          <button
            onClick={exportCsv}
            disabled={history.length === 0}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-mono transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-3 h-3 text-cyan-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={onClearHistory}
            className="px-2 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 font-mono transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="w-full overflow-x-auto max-h-60 rounded-lg border border-slate-800 bg-[#050811]">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-800">
            <tr>
              <th className="py-2 px-3">Time</th>
              <th className="py-2 px-2">RPM</th>
              <th className="py-2 px-2">Load</th>
              <th className="py-2 px-2">Power</th>
              <th className="py-2 px-2">EOP (bar)</th>
              <th className="py-2 px-2">EOT (°C)</th>
              <th className="py-2 px-2">CHT ΔT</th>
              <th className="py-2 px-2">Rad-X Kurt</th>
              <th className="py-2 px-2">Rad-Y Kurt</th>
              <th className="py-2 px-2">Bearing HF</th>
              <th className="py-2 px-2">Anomaly Score</th>
              <th className="py-2 px-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {displayedRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-6 text-center text-slate-500">
                  No telemetry recorded yet.
                </td>
              </tr>
            ) : (
              displayedRows.slice(-30).reverse().map((row, idx) => {
                const isCrit = row.anomaly.anomaly_score > 0.6;
                const isWarn = row.anomaly.anomaly_score > 0.35;
                const timeStr = new Date(row.timestamp * 1000).toLocaleTimeString([], {
                  hour12: false,
                  minute: '2-digit',
                  second: '2-digit',
                  fractionalSecondDigits: 1
                });

                return (
                  <tr
                    key={idx}
                    className={`hover:bg-slate-900/40 transition-colors ${
                      isCrit ? 'bg-rose-950/15' : isWarn ? 'bg-amber-950/10' : ''
                    }`}
                  >
                    <td className="py-1.5 px-3 text-slate-400">{timeStr}</td>
                    <td className="py-1.5 px-2 tabular-nums text-slate-200">
                      {row.engine_state.rpm.toFixed(0)}
                    </td>
                    <td className="py-1.5 px-2 tabular-nums">
                      {row.engine_state.load_pct.toFixed(0)}%
                    </td>
                    <td className="py-1.5 px-2 tabular-nums text-amber-400 font-semibold">
                      {row.engine_state.power_kw.toFixed(0)} kW
                    </td>
                    <td
                      className={`py-1.5 px-2 tabular-nums ${
                        row.thermo_validation.oil_pressure_nominal ? 'text-slate-300' : 'text-rose-400 font-bold'
                      }`}
                    >
                      {row.engine_state.oil_pressure_bar.toFixed(2)}
                    </td>
                    <td className="py-1.5 px-2 tabular-nums">
                      {row.engine_state.oil_temp_c.toFixed(1)}°
                    </td>
                    <td
                      className={`py-1.5 px-2 tabular-nums ${
                        row.engine_state.cht_delta_c > 30 ? 'text-rose-400 font-bold' : 'text-slate-300'
                      }`}
                    >
                      {row.engine_state.cht_delta_c.toFixed(1)}°
                    </td>
                    <td
                      className={`py-1.5 px-2 tabular-nums ${
                        row.dsp_features.radial_x.time.kurtosis > 5.0 ? 'text-rose-400 font-bold' : 'text-cyan-400'
                      }`}
                    >
                      {row.dsp_features.radial_x.time.kurtosis}
                    </td>
                    <td
                      className={`py-1.5 px-2 tabular-nums ${
                        row.dsp_features.radial_y.time.kurtosis > 5.0 ? 'text-rose-400 font-bold' : 'text-amber-400'
                      }`}
                    >
                      {row.dsp_features.radial_y.time.kurtosis}
                    </td>
                    <td className="py-1.5 px-2 tabular-nums">
                      {row.dsp_features.radial_x.spectral.energy_hf_bearing} g
                    </td>
                    <td
                      className={`py-1.5 px-2 tabular-nums font-bold ${
                        isCrit ? 'text-rose-400' : isWarn ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {row.anomaly.anomaly_score.toFixed(3)}
                    </td>
                    <td className="py-1.5 px-3">
                      <span
                        className={`text-[10px] font-bold ${
                          isCrit
                            ? 'text-rose-400'
                            : isWarn
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {row.engine_state.active_fault === 'none'
                          ? 'NOMINAL'
                          : row.engine_state.active_fault.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
