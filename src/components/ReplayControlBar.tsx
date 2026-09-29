import React from 'react';
import { Play, Pause, RotateCcw, X, FastForward, Film } from 'lucide-react';
import { ReplayStatus } from '../types/telemetry';

interface ReplayControlBarProps {
  replayStatus: ReplayStatus;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (fraction: number) => void;
  onSetSpeed: (speed: number) => void;
  onExitReplay: () => void;
}

export const ReplayControlBar: React.FC<ReplayControlBarProps> = ({
  replayStatus,
  onPlay,
  onPause,
  onSeek,
  onSetSpeed,
  onExitReplay
}) => {
  if (!replayStatus.is_active) return null;

  const { is_paused, source_name, source_type, current_index, total_frames, progress_pct, playback_speed } = replayStatus;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-3xl bg-slate-950/95 border border-cyan-500/40 rounded-xl p-3.5 shadow-2xl backdrop-blur-md text-xs font-mono">
      <div className="flex flex-col gap-2.5">
        {/* Top Header: Source Info & Exit */}
        <div className="flex items-center justify-between gap-3 text-slate-300">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
              <Film className="w-3.5 h-3.5" />
              <span>REPLAY ACTIVE:</span>
            </span>
            <span className="text-slate-100 font-semibold truncate max-w-xs sm:max-w-md">
              {source_name || 'Recorded Telemetry Stream'}
            </span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-400 text-[11px]">{source_type}</span>
          </div>

          <button
            onClick={onExitReplay}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center gap-1 transition-colors text-[11px]"
            title="Exit replay and return to live stream"
          >
            <X className="w-3 h-3 text-rose-400" />
            <span>Exit Replay</span>
          </button>
        </div>

        {/* Scrub Slider Bar */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-400 tabular-nums w-12 text-right">
            {current_index}
          </span>

          <input
            type="range"
            min="0"
            max={Math.max(1, total_frames - 1)}
            value={current_index}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              const frac = total_frames > 0 ? val / (total_frames - 1) : 0;
              onSeek(frac);
            }}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />

          <span className="text-[11px] text-slate-400 tabular-nums w-12">
            {total_frames}
          </span>
        </div>

        {/* Bottom Bar: Play/Pause, Speeds, Progress % */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
          <div className="flex items-center gap-2">
            {is_paused ? (
              <button
                onClick={onPlay}
                className="px-2.5 py-1 rounded bg-cyan-950 hover:bg-cyan-900 border border-cyan-700 text-cyan-300 font-bold flex items-center gap-1.5 transition-colors"
              >
                <Play className="w-3 h-3 fill-cyan-300" />
                <span>Play</span>
              </button>
            ) : (
              <button
                onClick={onPause}
                className="px-2.5 py-1 rounded bg-amber-950 hover:bg-amber-900 border border-amber-700 text-amber-300 font-bold flex items-center gap-1.5 transition-colors"
              >
                <Pause className="w-3 h-3 fill-amber-300" />
                <span>Pause</span>
              </button>
            )}

            <button
              onClick={() => onSeek(0)}
              className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              title="Restart from beginning"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>

          {/* Speed Presets */}
          <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800 text-[11px]">
            <span className="text-slate-500 px-1.5">Speed:</span>
            {[0.5, 1.0, 2.0].map((spd) => (
              <button
                key={spd}
                onClick={() => onSetSpeed(spd)}
                className={`px-2 py-0.5 rounded transition-colors ${
                  playback_speed === spd
                    ? 'bg-slate-800 text-cyan-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          {/* Progress Percentage */}
          <div className="text-[11px] text-slate-400 tabular-nums">
            Progress: <strong className="text-cyan-400">{progress_pct.toFixed(1)}%</strong>
          </div>
        </div>
      </div>
    </div>
  );
};
