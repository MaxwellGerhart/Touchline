import { createContext, useContext, useState, ReactNode } from 'react';
import { DrillRectangle } from '../types';

interface DrillContextType {
  /** Whether the user is currently drawing a drill area on the pitch */
  isDrawingDrillArea: boolean;
  setIsDrawingDrillArea: (drawing: boolean) => void;
  /** Whether the pitch is zoomed into the active session's drill area */
  isDrillActive: boolean;
  setIsDrillActive: (active: boolean) => void;
  /** Temporarily holds an area freshly drawn on the pitch (for session creation) */
  pendingArea: DrillRectangle | null;
  setPendingArea: (area: DrillRectangle | null) => void;
  /** When true, completed drawing is for a new session — don't update active session */
  drawingForNewSession: boolean;
  setDrawingForNewSession: (v: boolean) => void;
}

const DrillContext = createContext<DrillContextType | null>(null);

export function DrillProvider({ children }: { children: ReactNode }) {
  const [isDrawingDrillArea, setIsDrawingDrillArea] = useState(false);
  const [isDrillActive, setIsDrillActive] = useState(false);
  const [pendingArea, setPendingArea] = useState<DrillRectangle | null>(null);
  const [drawingForNewSession, setDrawingForNewSession] = useState(false);

  return (
    <DrillContext.Provider
      value={{
        isDrawingDrillArea,
        setIsDrawingDrillArea,
        isDrillActive,
        setIsDrillActive,
        pendingArea,
        setPendingArea,
        drawingForNewSession,
        setDrawingForNewSession,
      }}
    >
      {children}
    </DrillContext.Provider>
  );
}

export function useDrill() {
  const context = useContext(DrillContext);
  if (!context) {
    throw new Error('useDrill must be used within a DrillProvider');
  }
  return context;
}
