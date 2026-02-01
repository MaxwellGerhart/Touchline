import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useEffect,
} from 'react';
import {
  Position,
  TacticsBoardState,
  TacticsScenario,
  TacticsPlayer,
  TacticsTool,
  BoardObjectType,
  FormationId,
  FORMATION_PRESETS,
  mirrorPosition,
  PlayerTeam,
  DEFAULT_PLAYERS,
} from '../types';

const STORAGE_KEY = 'touchline_tactics_scenarios';

function genId(): string {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyState(): TacticsBoardState {
  return {
    players: [],
    objects: [],
    areas: [],
    zones: [],
    paths: [],
    arrows: [],
    selectedIds: [],
  };
}

interface DrawingState {
  areaPoints: Position[];
  zoneStart: Position | null;
  pathPoints: Position[];
  arrowStart: Position | null;
}

interface TacticsContextType {
  tool: TacticsTool;
  setTool: (t: TacticsTool) => void;
  state: TacticsBoardState;
  setState: (s: TacticsBoardState | ((prev: TacticsBoardState) => TacticsBoardState)) => void;
  formation: FormationId;
  setFormation: (f: FormationId) => void;
  drawing: DrawingState;
  setDrawing: (d: DrawingState | ((prev: DrawingState) => DrawingState)) => void;
  // Actions
  addPlayer: (position: Position, number?: number, name?: string, team?: PlayerTeam) => void;
  addObject: (position: Position, type: BoardObjectType) => void;
  addArea: (points: Position[]) => void;
  addZone: (x: number, y: number, width: number, height: number, type: 'rectangle' | 'ellipse') => void;
  addPath: (points: Position[]) => void;
  addArrow: (start: Position, end: Position) => void;
  updatePlayerPosition: (id: string, position: Position) => void;
  updateObjectPosition: (id: string, position: Position) => void;
  deleteSelected: () => void;
  selectId: (id: string | null, addToSelection?: boolean) => void;
  clearBoard: () => void;
  applyFormation: (formationId: FormationId) => void;
  addOpposition: (formationId: FormationId) => void;
  removeOpposition: () => void;
  // Save / load
  saveScenario: (name: string) => void;
  loadScenario: (id: string) => void;
  savedScenarios: TacticsScenario[];
  deleteScenario: (id: string) => void;
}

const TacticsContext = createContext<TacticsContextType | null>(null);

const defaultDrawing: DrawingState = {
  areaPoints: [],
  zoneStart: null,
  pathPoints: [],
  arrowStart: null,
};

export function TacticsProvider({ children }: { children: ReactNode }) {
  const [tool, setTool] = useState<TacticsTool>('select');
  const [state, setState] = useState<TacticsBoardState>(emptyState);
  const [formation, setFormation] = useState<FormationId>('4-4-2');
  const [drawing, setDrawing] = useState<DrawingState>(defaultDrawing);
  const [savedScenarios, setSavedScenarios] = useState<TacticsScenario[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedScenarios));
    } catch {}
  }, [savedScenarios]);

  const addPlayer = useCallback(
    (position: Position, number?: number, name?: string, team: PlayerTeam = 'own') => {
      setState((prev) => {
        const ownCount = prev.players.filter((p) => p.team !== 'opposition').length;
        const idx = ownCount % 11;
        const defaultPlayer = DEFAULT_PLAYERS[idx];
        const nextNumber = number ?? defaultPlayer.id;
        const nextName = name ?? defaultPlayer.name;
        return {
          ...prev,
          players: [
            ...prev.players,
            {
              id: genId(),
              position,
              number: nextNumber,
              name: nextName,
              team,
            },
          ],
        };
      });
    },
    []
  );

  const addObject = useCallback((position: Position, type: BoardObjectType) => {
    setState((prev) => ({
      ...prev,
      objects: [
        ...prev.objects,
        { id: genId(), position, type },
      ],
    }));
  }, []);

  const addArea = useCallback((points: Position[]) => {
    if (points.length < 3) return;
    setState((prev) => ({
      ...prev,
      areas: [
        ...prev.areas,
        {
          id: genId(),
          points,
          fill: 'rgba(255, 200, 0, 0.25)',
          stroke: '#eab308',
          strokeWidth: 2,
        },
      ],
    }));
    setDrawing((d) => ({ ...d, areaPoints: [] }));
  }, []);

  const addZone = useCallback(
    (x: number, y: number, width: number, height: number, type: 'rectangle' | 'ellipse') => {
      setState((prev) => ({
        ...prev,
        zones: [
          ...prev.zones,
          {
            id: genId(),
            type,
            x,
            y,
            width,
            height,
            fill: 'rgba(59, 130, 246, 0.2)',
            stroke: '#3b82f6',
            strokeWidth: 2,
          },
        ],
      }));
      setDrawing((d) => ({ ...d, zoneStart: null }));
    },
    []
  );

  const addPath = useCallback((points: Position[]) => {
    if (points.length < 2) return;
    setState((prev) => ({
      ...prev,
      paths: [
        ...prev.paths,
        {
          id: genId(),
          points,
          stroke: '#22c55e',
          strokeWidth: 3,
        },
      ],
    }));
    setDrawing((d) => ({ ...d, pathPoints: [] }));
  }, []);

  const addArrow = useCallback((start: Position, end: Position) => {
    setState((prev) => ({
      ...prev,
      arrows: [
        ...prev.arrows,
        {
          id: genId(),
          start,
          end,
          stroke: '#ef4444',
          strokeWidth: 3,
        },
      ],
    }));
    setDrawing((d) => ({ ...d, arrowStart: null }));
  }, []);

  const updatePlayerPosition = useCallback((id: string, position: Position) => {
    setState((prev) => ({
      ...prev,
      players: prev.players.map((p) =>
        p.id === id ? { ...p, position } : p
      ),
    }));
  }, []);

  const updateObjectPosition = useCallback((id: string, position: Position) => {
    setState((prev) => ({
      ...prev,
      objects: prev.objects.map((o) =>
        o.id === id ? { ...o, position } : o
      ),
    }));
  }, []);

  const deleteSelected = useCallback(() => {
    setState((prev) => {
      const ids = new Set(prev.selectedIds);
      return {
        ...prev,
        players: prev.players.filter((p) => !ids.has(p.id)),
        objects: prev.objects.filter((o) => !ids.has(o.id)),
        areas: prev.areas.filter((a) => !ids.has(a.id)),
        zones: prev.zones.filter((z) => !ids.has(z.id)),
        paths: prev.paths.filter((p) => !ids.has(p.id)),
        arrows: prev.arrows.filter((a) => !ids.has(a.id)),
        selectedIds: [],
      };
    });
  }, []);

  const selectId = useCallback((id: string | null, addToSelection?: boolean) => {
    setState((prev) => {
      if (id === null) return { ...prev, selectedIds: [] };
      if (addToSelection) {
        const next = prev.selectedIds.includes(id)
          ? prev.selectedIds.filter((x) => x !== id)
          : [...prev.selectedIds, id];
        return { ...prev, selectedIds: next };
      }
      return { ...prev, selectedIds: prev.selectedIds.includes(id) ? prev.selectedIds : [id] };
    });
  }, []);

  const clearBoard = useCallback(() => {
    setState(emptyState());
    setDrawing(defaultDrawing);
  }, []);

  const applyFormation = useCallback(
    (formationId: FormationId) => {
      setFormation(formationId);
      const positions = FORMATION_PRESETS[formationId];
      const opposition = (prev: TacticsPlayer[]) => prev.filter((p) => p.team === 'opposition');
      const ownPlayers: TacticsPlayer[] = DEFAULT_PLAYERS.slice(0, 11).map((p, i) => ({
        id: genId(),
        position: positions[i] ?? { x: 50, y: 50 },
        number: p.id,
        name: p.name,
        team: 'own' as PlayerTeam,
      }));
      setState((prev) => ({
        ...prev,
        players: [...ownPlayers, ...opposition(prev.players)],
        selectedIds: [],
      }));
    },
    []
  );

  const addOpposition = useCallback(
    (formationId: FormationId) => {
      const positions = FORMATION_PRESETS[formationId].map(mirrorPosition);
      const oppositionPlayers: TacticsPlayer[] = DEFAULT_PLAYERS.slice(0, 11).map((p, i) => ({
        id: genId(),
        position: positions[i] ?? { x: 50, y: 50 },
        number: p.id,
        name: p.name,
        team: 'opposition' as PlayerTeam,
      }));
      setState((prev) => ({
        ...prev,
        players: [...prev.players.filter((p) => p.team !== 'opposition'), ...oppositionPlayers],
        selectedIds: [],
      }));
    },
    []
  );

  const removeOpposition = useCallback(() => {
    setState((prev) => ({
      ...prev,
      players: prev.players.filter((p) => p.team !== 'opposition'),
      selectedIds: prev.selectedIds.filter(
        (id) => !prev.players.some((p) => p.id === id && p.team === 'opposition')
      ),
    }));
  }, []);

  const saveScenario = useCallback(
    (name: string) => {
      const scenario: TacticsScenario = {
        id: genId(),
        name: name.trim() || `Scenario ${new Date().toLocaleString()}`,
        createdAt: new Date().toISOString(),
        state: { ...state, selectedIds: [] },
      };
      setSavedScenarios((prev) => [scenario, ...prev]);
    },
    [state]
  );

  const loadScenario = useCallback((id: string) => {
    const scenario = savedScenarios.find((s) => s.id === id);
    if (scenario) setState({ ...scenario.state, selectedIds: [] });
  }, [savedScenarios]);

  const deleteScenario = useCallback((id: string) => {
    setSavedScenarios((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return (
    <TacticsContext.Provider
      value={{
        tool,
        setTool,
        state,
        setState,
        formation,
        setFormation,
        drawing,
        setDrawing,
        addPlayer,
        addObject,
        addArea,
        addZone,
        addPath,
        addArrow,
        updatePlayerPosition,
        updateObjectPosition,
        deleteSelected,
        selectId,
        clearBoard,
        applyFormation,
        addOpposition,
        removeOpposition,
        saveScenario,
        loadScenario,
        savedScenarios,
        deleteScenario,
      }}
    >
      {children}
    </TacticsContext.Provider>
  );
}

export function useTactics() {
  const ctx = useContext(TacticsContext);
  if (!ctx) throw new Error('useTactics must be used within TacticsProvider');
  return ctx;
}
