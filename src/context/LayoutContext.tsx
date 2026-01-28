import React, { createContext, useContext, useState, useEffect, ReactNode, Dispatch, SetStateAction } from 'react';

export type PanelId = 'video' | 'pitch' | 'controls' | 'log';

interface PanelConfig {
  id: PanelId;
  position: 'left-top' | 'left-bottom' | 'right-top' | 'right-bottom';
}

interface LayoutContextType {
  panels: PanelConfig[];
  swapPanels: (id1: PanelId, id2: PanelId) => void;
  leftColumnWidth: number;
  setLeftColumnWidth: Dispatch<SetStateAction<number>>;
  leftTopHeight: number;
  setLeftTopHeight: Dispatch<SetStateAction<number>>;
  rightTopHeight: number;
  setRightTopHeight: Dispatch<SetStateAction<number>>;
  draggedPanel: PanelId | null;
  setDraggedPanel: (id: PanelId | null) => void;
  dropTarget: PanelId | null;
  setDropTarget: (id: PanelId | null) => void;
}

const LayoutContext = createContext<LayoutContextType | null>(null);

const LAYOUT_STORAGE_KEY = 'touchline_layout';

const DEFAULT_PANELS: PanelConfig[] = [
  { id: 'video', position: 'left-top' },
  { id: 'controls', position: 'left-bottom' },
  { id: 'pitch', position: 'right-top' },
  { id: 'log', position: 'right-bottom' },
];

interface StoredLayout {
  panels: PanelConfig[];
  leftColumnWidth: number;
  leftTopHeight: number;
  rightTopHeight: number;
}

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [panels, setPanels] = useState<PanelConfig[]>(() => {
    const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (stored) {
      try {
        const parsed: StoredLayout = JSON.parse(stored);
        return parsed.panels || DEFAULT_PANELS;
      } catch {
        return DEFAULT_PANELS;
      }
    }
    return DEFAULT_PANELS;
  });

  const [leftColumnWidth, setLeftColumnWidth] = useState(() => {
    const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (stored) {
      try {
        const parsed: StoredLayout = JSON.parse(stored);
        return parsed.leftColumnWidth || 50;
      } catch {
        return 50;
      }
    }
    return 50;
  });

  const [leftTopHeight, setLeftTopHeight] = useState(() => {
    const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (stored) {
      try {
        const parsed: StoredLayout = JSON.parse(stored);
        return parsed.leftTopHeight || 66;
      } catch {
        return 66;
      }
    }
    return 66;
  });

  const [rightTopHeight, setRightTopHeight] = useState(() => {
    const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (stored) {
      try {
        const parsed: StoredLayout = JSON.parse(stored);
        return parsed.rightTopHeight || 66;
      } catch {
        return 66;
      }
    }
    return 66;
  });

  const [draggedPanel, setDraggedPanel] = useState<PanelId | null>(null);
  const [dropTarget, setDropTarget] = useState<PanelId | null>(null);

  // Save to localStorage
  useEffect(() => {
    const layout: StoredLayout = {
      panels,
      leftColumnWidth,
      leftTopHeight,
      rightTopHeight,
    };
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  }, [panels, leftColumnWidth, leftTopHeight, rightTopHeight]);

  const swapPanels = (id1: PanelId, id2: PanelId) => {
    setPanels(prev => {
      const newPanels = [...prev];
      const panel1 = newPanels.find(p => p.id === id1);
      const panel2 = newPanels.find(p => p.id === id2);
      if (panel1 && panel2) {
        const tempPos = panel1.position;
        panel1.position = panel2.position;
        panel2.position = tempPos;
      }
      return newPanels;
    });
  };

  return (
    <LayoutContext.Provider
      value={{
        panels,
        swapPanels,
        leftColumnWidth,
        setLeftColumnWidth,
        leftTopHeight,
        setLeftTopHeight,
        rightTopHeight,
        setRightTopHeight,
        draggedPanel,
        setDraggedPanel,
        dropTarget,
        setDropTarget,
      }}
    >
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
}

export function getPanelByPosition(panels: PanelConfig[], position: PanelConfig['position']): PanelId {
  return panels.find(p => p.position === position)?.id || 'video';
}
