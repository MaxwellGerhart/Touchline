import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { DrillConfig, DrillRectangle, DEFAULT_DRILL_CONFIG } from '../types';

interface DrillContextType {
  drillConfig: DrillConfig;
  setDrillType: (type: string) => void;
  setDrillArea: (area: DrillRectangle | null) => void;
  clearDrill: () => void;
  isDrawingDrillArea: boolean;
  setIsDrawingDrillArea: (drawing: boolean) => void;
  isDrillActive: boolean;
  setIsDrillActive: (active: boolean) => void;
}

const DrillContext = createContext<DrillContextType | null>(null);

const DRILL_STORAGE_KEY = 'touchline_drill_config';
const DRILL_ACTIVE_STORAGE_KEY = 'touchline_drill_active';

export function DrillProvider({ children }: { children: ReactNode }) {
  const [drillConfig, setDrillConfig] = useState<DrillConfig>(() => {
    const stored = localStorage.getItem(DRILL_STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return DEFAULT_DRILL_CONFIG;
      }
    }
    return DEFAULT_DRILL_CONFIG;
  });

  const [isDrawingDrillArea, setIsDrawingDrillArea] = useState(false);

  const [isDrillActive, setIsDrillActiveState] = useState<boolean>(() => {
    return localStorage.getItem(DRILL_ACTIVE_STORAGE_KEY) === 'true';
  });

  // Persist drill config to localStorage
  useEffect(() => {
    localStorage.setItem(DRILL_STORAGE_KEY, JSON.stringify(drillConfig));
  }, [drillConfig]);

  // Persist active state
  useEffect(() => {
    localStorage.setItem(DRILL_ACTIVE_STORAGE_KEY, String(isDrillActive));
  }, [isDrillActive]);

  // Deactivate if drill area is removed
  useEffect(() => {
    if (!drillConfig.area && isDrillActive) {
      setIsDrillActiveState(false);
    }
  }, [drillConfig.area, isDrillActive]);

  const setDrillType = useCallback((type: string) => {
    setDrillConfig(prev => ({ ...prev, drillType: type }));
  }, []);

  const setDrillArea = useCallback((area: DrillRectangle | null) => {
    setDrillConfig(prev => ({ ...prev, area }));
  }, []);

  const setIsDrillActive = useCallback((active: boolean) => {
    // Can only activate when area exists
    if (active && !drillConfig.area) return;
    setIsDrillActiveState(active);
    // Exit drawing mode when activating
    if (active) setIsDrawingDrillArea(false);
  }, [drillConfig.area]);

  const clearDrill = useCallback(() => {
    setDrillConfig(DEFAULT_DRILL_CONFIG);
    setIsDrawingDrillArea(false);
    setIsDrillActiveState(false);
  }, []);

  return (
    <DrillContext.Provider
      value={{
        drillConfig,
        setDrillType,
        setDrillArea,
        clearDrill,
        isDrawingDrillArea,
        setIsDrawingDrillArea,
        isDrillActive,
        setIsDrillActive,
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
