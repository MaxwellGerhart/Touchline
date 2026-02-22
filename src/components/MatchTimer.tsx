import { useState, useCallback, useEffect, useRef, KeyboardEvent } from 'react';
import { Play, Pause, RotateCcw, Edit2 } from 'lucide-react';
import { useTimer } from '../context/TimerContext';

export function MatchTimer() {
  const {
    elapsed,
    half,
    status,
    display,
    start,
    pause,
    reset,
    setElapsed,
    setHalf,
    halfEnded,
  } = useTimer();

  // Inline time editing state
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editTimeValue, setEditTimeValue] = useState('');
  const timeInputRef = useRef<HTMLInputElement>(null);

  const openTimeEdit = useCallback(() => {
    if (status === 'running') pause();
    setEditTimeValue(display);
    setIsEditingTime(true);
  }, [status, pause, display]);

  useEffect(() => {
    if (isEditingTime && timeInputRef.current) {
      timeInputRef.current.focus();
      timeInputRef.current.select();
    }
  }, [isEditingTime]);

  const commitTimeEdit = useCallback(() => {
    const raw = editTimeValue.trim();
    let totalSeconds: number | null = null;

    // Try mm:ss
    const mmss = raw.match(/^(\d{1,3}):(\d{1,2})$/);
    if (mmss) {
      totalSeconds = parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10);
    } else {
      // Try plain number as minutes
      const n = parseFloat(raw);
      if (!isNaN(n)) totalSeconds = Math.round(n * 60);
    }

    if (totalSeconds !== null && totalSeconds >= 0) {
      // If the value is >= 45 min and we're in H1, switch to H2 and set remainder
      if (half === 1 && totalSeconds >= 45 * 60) {
        setHalf(2);
        setElapsed(Math.min(totalSeconds - 45 * 60, 45 * 60));
      } else if (half === 2) {
        // In H2 the display shows 45:00-90:00, so subtract 45 min offset
        const h2Seconds = totalSeconds >= 45 * 60 ? totalSeconds - 45 * 60 : totalSeconds;
        setElapsed(Math.min(h2Seconds, 45 * 60));
      } else {
        setElapsed(Math.min(totalSeconds, 45 * 60));
      }
    }

    setIsEditingTime(false);
  }, [editTimeValue, half, setElapsed, setHalf]);

  const cancelTimeEdit = useCallback(() => {
    setIsEditingTime(false);
  }, []);

  const handleEditKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') commitTimeEdit();
      else if (e.key === 'Escape') cancelTimeEdit();
    },
    [commitTimeEdit, cancelTimeEdit],
  );

  // Keyboard shortcut: Space to toggle play/pause
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === ' ' && e.target === e.currentTarget) {
        e.preventDefault();
        if (status === 'running') pause();
        else if (!halfEnded) start();
      }
    },
    [status, pause, start, halfEnded],
  );

  // Progress bar width (0–100%)
  const progress = Math.min((elapsed / (45 * 60)) * 100, 100);

  // Manual time adjustment via click on progress bar
  const progressBarRef = useRef<HTMLDivElement>(null);
  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = progressBarRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setElapsed(pct * 45 * 60);
    },
    [setElapsed],
  );

  // Flash colon when paused
  const colonVisible = useFlashColon(status === 'paused');

  return (
    <div
      className="flex flex-col gap-1.5 select-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="timer"
      aria-label={`Match timer: ${display}`}
    >
      {/* Time display + half badge */}
      <div className="flex items-center gap-2">
        {isEditingTime ? (
          <input
            ref={timeInputRef}
            type="text"
            value={editTimeValue}
            onChange={e => setEditTimeValue(e.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={commitTimeEdit}
            className="font-mono text-2xl font-bold tabular-nums tracking-tight w-24 bg-transparent border-b-2 border-orange-500 dark:border-rose-500 text-gray-900 dark:text-white outline-none"
            placeholder="mm:ss"
          />
        ) : (
          <span
            className="font-mono text-2xl font-bold tabular-nums tracking-tight text-gray-900 dark:text-white cursor-pointer hover:text-orange-600 dark:hover:text-rose-400 transition-colors group"
            aria-live="polite"
            onClick={openTimeEdit}
            title="Click to edit time"
          >
            {status === 'paused'
              ? display.replace(':', colonVisible ? ':' : ' ')
              : display}
            <Edit2 className="inline-block w-3 h-3 ml-1 opacity-0 group-hover:opacity-50 transition-opacity" />
          </span>
        )}

        {/* Half selector */}
        <div className="flex rounded overflow-hidden border border-gray-300 dark:border-gray-600">
          <button
            onClick={() => {
              if (half !== 1) {
                if (status === 'running') pause();
                setHalf(1);
                setElapsed(0);
              }
            }}
            className={`px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
              half === 1
                ? 'bg-orange-500 dark:bg-rose-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            1st
          </button>
          <button
            onClick={() => {
              if (half !== 2) {
                if (status === 'running') pause();
                setHalf(2);
                setElapsed(0);
              }
            }}
            className={`px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
              half === 2
                ? 'bg-orange-500 dark:bg-rose-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            2nd
          </button>
        </div>

        {halfEnded && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400">
            Half Time
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div
        ref={progressBarRef}
        className="relative h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 cursor-pointer group"
        onClick={handleProgressClick}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={45}
        aria-valuenow={Math.floor(elapsed / 60)}
        aria-label="Match progress"
        tabIndex={0}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-orange-500 dark:bg-rose-500 transition-[width] duration-100"
          style={{ width: `${progress}%` }}
        />
        {/* 15-min and 30-min tick marks */}
        <div className="absolute top-0 bottom-0 left-1/3 w-px bg-gray-400/40 dark:bg-gray-500/40" />
        <div className="absolute top-0 bottom-0 left-2/3 w-px bg-gray-400/40 dark:bg-gray-500/40" />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1">
        {status === 'running' ? (
          <button
            onClick={pause}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-yellow-500 hover:bg-yellow-600 text-white transition-colors"
            aria-label="Pause timer"
          >
            <Pause className="w-3.5 h-3.5" /> Pause
          </button>
        ) : (
          <button
            onClick={start}
            disabled={halfEnded}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
            aria-label={status === 'stopped' ? 'Start timer' : 'Resume timer'}
          >
            <Play className="w-3.5 h-3.5" />
            {status === 'stopped' ? 'Start' : 'Resume'}
          </button>
        )}

        <button
          onClick={reset}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
          aria-label="Reset timer"
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      </div>
    </div>
  );
}

/** Flashing colon hook for paused state */
function useFlashColon(active: boolean): boolean {
  const [visible, setVisible] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (active) {
      intervalRef.current = setInterval(() => setVisible(v => !v), 500);
    } else {
      setVisible(true);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active]);

  return visible;
}
