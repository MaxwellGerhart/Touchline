import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';

export type MatchHalf = 1 | 2;
export type TimerStatus = 'stopped' | 'running' | 'paused';

interface TimerContextType {
  /** Elapsed seconds in the current half (0–2700) */
  elapsed: number;
  /** Current half (1 or 2) */
  half: MatchHalf;
  /** Timer status */
  status: TimerStatus;
  /** Match minute for display (0:00–45:00 in H1, 45:00–90:00 in H2) */
  matchMinute: number;
  /** Formatted mm:ss string */
  display: string;
  /** Start or resume the timer */
  start: () => void;
  /** Pause the timer */
  pause: () => void;
  /** Reset timer and begin second half */
  startSecondHalf: () => void;
  /** Full reset back to 0 / first half */
  reset: () => void;
  /** Manually set elapsed seconds (for out-of-order corrections) */
  setElapsed: (seconds: number) => void;
  /** Manually set the half (1 or 2) */
  setHalf: (h: MatchHalf) => void;
  /** Whether the current half has ended (reached 45 min) */
  halfEnded: boolean;
  /** Get the attack direction for a team based on the current half */
  getAttackDirection: (team1Goal: 'left' | 'right') => 'left' | 'right';
}

const TimerContext = createContext<TimerContextType | null>(null);

const HALF_DURATION = 45 * 60; // 2700 seconds

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const [elapsed, setElapsedState] = useState(0);
  const [half, setHalf] = useState<MatchHalf>(1);
  const [status, setStatus] = useState<TimerStatus>('stopped');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef<number>(0);

  const halfEnded = elapsed >= HALF_DURATION;

  // Match minute accounts for the half offset
  const matchMinute = half === 1 ? elapsed : elapsed + HALF_DURATION;

  const display = formatTime(half === 1 ? elapsed : elapsed + HALF_DURATION);

  // Clear interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Auto-pause when half ends
  useEffect(() => {
    if (elapsed >= HALF_DURATION && status === 'running') {
      setStatus('paused');
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [elapsed, status]);

  const startTicking = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    lastTickRef.current = performance.now();
    intervalRef.current = setInterval(() => {
      const now = performance.now();
      const delta = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      setElapsedState(prev => Math.min(prev + delta, HALF_DURATION));
    }, 100); // 10 Hz update for smooth display
  }, []);

  const start = useCallback(() => {
    if (halfEnded) return;
    setStatus('running');
    startTicking();
  }, [halfEnded, startTicking]);

  const pause = useCallback(() => {
    setStatus('paused');
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startSecondHalf = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setElapsedState(0);
    setHalf(2);
    setStatus('stopped');
  }, []);

  const reset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setElapsedState(0);
    setHalf(1);
    setStatus('stopped');
  }, []);

  const setElapsed = useCallback((seconds: number) => {
    setElapsedState(Math.max(0, Math.min(seconds, HALF_DURATION)));
  }, []);

  const getAttackDirection = useCallback(
    (team1Goal: 'left' | 'right'): 'left' | 'right' => {
      // In second half, teams swap ends
      if (half === 2) return team1Goal === 'left' ? 'right' : 'left';
      return team1Goal;
    },
    [half],
  );

  return (
    <TimerContext.Provider
      value={{
        elapsed,
        half,
        status,
        matchMinute,
        display,
        start,
        pause,
        startSecondHalf,
        reset,
        setElapsed,
        setHalf,
        halfEnded,
        getAttackDirection,
      }}
    >
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const context = useContext(TimerContext);
  if (!context) throw new Error('useTimer must be used within a TimerProvider');
  return context;
}
