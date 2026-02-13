import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Session, GoalEnd, DrillRectangle } from '../types';

interface SessionContextType {
  sessions: Session[];
  activeSessionId: string | null;
  activeSession: Session | null;
  createSession: (opts: {
    name: string;
    drillType: string;
    area: DrillRectangle | null;
    team1Goal: GoalEnd;
    team2Goal: GoalEnd;
  }) => Session;
  updateSession: (id: string, patch: Partial<Omit<Session, 'id' | 'createdAt'>>) => void;
  deleteSession: (id: string) => void;
  setActiveSessionId: (id: string | null) => void;
  /** Controls whether the setup-modal is visible */
  isSetupOpen: boolean;
  openSetup: () => void;
  closeSetup: () => void;
}

const SessionContext = createContext<SessionContextType | null>(null);

const SESSIONS_KEY = 'touchline_sessions';
const ACTIVE_SESSION_KEY = 'touchline_active_session';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>(() => {
    try {
      const stored = localStorage.getItem(SESSIONS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(() => {
    return localStorage.getItem(ACTIVE_SESSION_KEY) || null;
  });

  const [isSetupOpen, setIsSetupOpen] = useState(false);

  // Persist
  useEffect(() => {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem(ACTIVE_SESSION_KEY, activeSessionId);
    } else {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  }, [activeSessionId]);

  const activeSession = sessions.find(s => s.id === activeSessionId) ?? null;

  const createSession = useCallback(
    (opts: { name: string; drillType: string; area: DrillRectangle | null; team1Goal: GoalEnd; team2Goal: GoalEnd }) => {
      const newSession: Session = {
        id: uuidv4(),
        name: opts.name || 'Untitled Session',
        drillType: opts.drillType,
        area: opts.area,
        team1Goal: opts.team1Goal,
        team2Goal: opts.team2Goal,
        createdAt: new Date().toISOString(),
      };
      setSessions(prev => [...prev, newSession]);
      setActiveSessionIdState(newSession.id);
      return newSession;
    },
    [],
  );

  const updateSession = useCallback((id: string, patch: Partial<Omit<Session, 'id' | 'createdAt'>>) => {
    setSessions(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const deleteSession = useCallback(
    (id: string) => {
      setSessions(prev => prev.filter(s => s.id !== id));
      if (activeSessionId === id) setActiveSessionIdState(null);
    },
    [activeSessionId],
  );

  const setActiveSessionId = useCallback((id: string | null) => {
    setActiveSessionIdState(id);
  }, []);

  const openSetup = useCallback(() => setIsSetupOpen(true), []);
  const closeSetup = useCallback(() => setIsSetupOpen(false), []);

  return (
    <SessionContext.Provider
      value={{
        sessions,
        activeSessionId,
        activeSession,
        createSession,
        updateSession,
        deleteSession,
        setActiveSessionId,
        isSetupOpen,
        openSetup,
        closeSetup,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
