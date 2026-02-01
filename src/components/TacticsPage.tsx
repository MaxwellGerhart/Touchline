import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  MousePointer2,
  User,
  Flag,
  Hexagon,
  Square,
  Route,
  Move,
  Save,
  FolderOpen,
  Trash2,
  Eraser,
} from 'lucide-react';
import { useTactics } from '../context/TacticsContext';
import {
  Position,
  FormationId,
  TacticsTool,
  BoardObjectType,
  DEFAULT_PLAYERS,
} from '../types';

const FORMATION_IDS: FormationId[] = ['4-4-2', '4-3-3', '3-5-2', '5-3-2', '4-2-3-1'];

const TOOLS: { id: TacticsTool; label: string; icon: React.ReactNode }[] = [
  { id: 'select', label: 'Select', icon: <MousePointer2 className="w-4 h-4" /> },
  { id: 'player', label: 'Player', icon: <User className="w-4 h-4" /> },
  { id: 'object', label: 'Object', icon: <Flag className="w-4 h-4" /> },
  { id: 'area', label: 'Area', icon: <Hexagon className="w-4 h-4" /> },
  { id: 'zone', label: 'Zone', icon: <Square className="w-4 h-4" /> },
  { id: 'path', label: 'Path', icon: <Route className="w-4 h-4" /> },
  { id: 'arrow', label: 'Arrow', icon: <Move className="w-4 h-4" /> },
];

function clamp(p: Position): Position {
  return {
    x: Math.max(0, Math.min(100, p.x)),
    y: Math.max(0, Math.min(100, p.y)),
  };
}

export function TacticsPage() {
  const pitchRef = useRef<HTMLDivElement>(null);
  const [objectType, setObjectType] = useState<BoardObjectType>('cone');
  const [showLoadMenu, setShowLoadMenu] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [oppositionFormation, setOppositionFormation] = useState<FormationId>('4-4-2');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Position | null>(null);
  const [zoneDragStart, setZoneDragStart] = useState<Position | null>(null);
  const [zoneDragEnd, setZoneDragEnd] = useState<Position | null>(null);
  const [arrowDragEnd, setArrowDragEnd] = useState<Position | null>(null);

  const {
    tool,
    setTool,
    state,
    formation,
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
  } = useTactics();

  const getPosition = useCallback((e: React.MouseEvent | MouseEvent): Position | null => {
    if (!pitchRef.current) return null;
    const rect = pitchRef.current.getBoundingClientRect();
    return clamp({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }, []);

  const hitTest = useCallback(
    (p: Position): string | null => {
      const threshold = 4;
      for (const pl of state.players) {
        const dx = pl.position.x - p.x;
        const dy = pl.position.y - p.y;
        if (dx * dx + dy * dy < threshold * threshold) return pl.id;
      }
      for (const ob of state.objects) {
        const dx = ob.position.x - p.x;
        const dy = ob.position.y - p.y;
        if (dx * dx + dy * dy < threshold * threshold) return ob.id;
      }
      // Simple hit test for shapes (bounding box)
      for (const a of state.areas) {
        if (a.points.length < 2) continue;
        const xs = a.points.map((pt) => pt.x);
        const ys = a.points.map((pt) => pt.y);
        const minX = Math.min(...xs) - 2;
        const maxX = Math.max(...xs) + 2;
        const minY = Math.min(...ys) - 2;
        const maxY = Math.max(...ys) + 2;
        if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) return a.id;
      }
      for (const z of state.zones) {
        const minX = z.x;
        const maxX = z.x + z.width;
        const minY = z.y;
        const maxY = z.y + z.height;
        if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) return z.id;
      }
      for (const path of state.paths) {
        for (const pt of path.points) {
          const dx = pt.x - p.x;
          const dy = pt.y - p.y;
          if (dx * dx + dy * dy < 25) return path.id;
        }
      }
      for (const arr of state.arrows) {
        const midX = (arr.start.x + arr.end.x) / 2;
        const midY = (arr.start.y + arr.end.y) / 2;
        const dx = midX - p.x;
        const dy = midY - p.y;
        if (dx * dx + dy * dy < 36) return arr.id;
      }
      return null;
    },
    [state]
  );

  const handlePitchMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const pos = getPosition(e);
      if (!pos) return;

      if (tool === 'select') {
        const id = hitTest(pos);
        selectId(id, e.ctrlKey || e.metaKey);
        if (id) {
          const pl = state.players.find((p) => p.id === id);
          const ob = state.objects.find((o) => o.id === id);
          if (pl) {
            setDraggingId(id);
            setDragOffset({ x: pos.x - pl.position.x, y: pos.y - pl.position.y });
          } else if (ob) {
            setDraggingId(id);
            setDragOffset({ x: pos.x - ob.position.x, y: pos.y - ob.position.y });
          }
        }
        return;
      }

      if (tool === 'player') {
        const ownCount = state.players.filter((p) => p.team !== 'opposition').length;
        const idx = ownCount % 11;
        const p = DEFAULT_PLAYERS[idx];
        addPlayer(pos, p.id, p.name, 'own');
        return;
      }

      if (tool === 'object') {
        addObject(pos, objectType);
        return;
      }

      if (tool === 'area') {
        setDrawing((d) => ({ ...d, areaPoints: [...d.areaPoints, pos] }));
        return;
      }

      if (tool === 'zone') {
        setZoneDragStart(pos);
        return;
      }

      if (tool === 'path') {
        setDrawing((d) => ({ ...d, pathPoints: [...d.pathPoints, pos] }));
        return;
      }

      if (tool === 'arrow') {
        setDrawing((d) => ({ ...d, arrowStart: pos }));
        setArrowDragEnd(pos);
        return;
      }
    },
    [
      tool,
      getPosition,
      hitTest,
      selectId,
      state,
      objectType,
      addPlayer,
      addObject,
      addArea,
      addZone,
      addPath,
      addArrow,
      setDrawing,
    ]
  );

  const handlePitchMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const pos = getPosition(e);
      if (!pos) return;

      if (draggingId && dragOffset) {
        const pl = state.players.find((p) => p.id === draggingId);
        const ob = state.objects.find((o) => o.id === draggingId);
        if (pl) updatePlayerPosition(draggingId, { x: pos.x - dragOffset.x, y: pos.y - dragOffset.y });
        if (ob) updateObjectPosition(draggingId, { x: pos.x - dragOffset.x, y: pos.y - dragOffset.y });
        return;
      }

      if (zoneDragStart) {
        setZoneDragEnd(pos);
        return;
      }

      if (drawing.arrowStart) {
        setArrowDragEnd(pos);
        return;
      }
    },
    [
      draggingId,
      dragOffset,
      zoneDragStart,
      drawing.arrowStart,
      getPosition,
      state,
      updatePlayerPosition,
      updateObjectPosition,
      setDrawing,
    ]
  );

  const handlePitchMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const pos = getPosition(e);

      if (draggingId) {
        setDraggingId(null);
        setDragOffset(null);
        return;
      }

      if (zoneDragStart && pos) {
        const x = Math.min(zoneDragStart.x, pos.x);
        const y = Math.min(zoneDragStart.y, pos.y);
        const width = Math.abs(pos.x - zoneDragStart.x);
        const height = Math.abs(pos.y - zoneDragStart.y);
        if (width > 2 && height > 2) addZone(x, y, width, height, 'rectangle');
        setZoneDragStart(null);
        setZoneDragEnd(null);
        return;
      }

      if (drawing.arrowStart && pos) {
        const dx = pos.x - drawing.arrowStart.x;
        const dy = pos.y - drawing.arrowStart.y;
        if (Math.hypot(dx, dy) > 3) addArrow(drawing.arrowStart, pos);
        setDrawing((d) => ({ ...d, arrowStart: null }));
        setArrowDragEnd(null);
        return;
      }
    },
    [
      draggingId,
      zoneDragStart,
      drawing.arrowStart,
      getPosition,
      addZone,
      addArrow,
      setDrawing,
    ]
  );

  const handlePitchDoubleClick = useCallback(() => {
    if (tool === 'area' && drawing.areaPoints.length >= 3) {
      addArea(drawing.areaPoints);
    }
    if (tool === 'path' && drawing.pathPoints.length >= 2) {
      addPath(drawing.pathPoints);
    }
  }, [tool, drawing.areaPoints, drawing.pathPoints, addArea, addPath]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelected]);

  useEffect(() => {
    if (draggingId) {
      const onMove = (e: MouseEvent) => {
        const pos = getPosition(e);
        if (!pos) return;
        const pl = state.players.find((p) => p.id === draggingId);
        const ob = state.objects.find((o) => o.id === draggingId);
        if (pl && dragOffset) updatePlayerPosition(draggingId, clamp({ x: pos.x - dragOffset.x, y: pos.y - dragOffset.y }));
        if (ob && dragOffset) updateObjectPosition(draggingId, clamp({ x: pos.x - dragOffset.x, y: pos.y - dragOffset.y }));
      };
      const onUp = () => {
        setDraggingId(null);
        setDragOffset(null);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      return () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
    }
  }, [draggingId, dragOffset, getPosition, state.players, state.objects, updatePlayerPosition, updateObjectPosition]);

  const finishArea = () => {
    if (drawing.areaPoints.length >= 3) addArea(drawing.areaPoints);
    setDrawing((d) => ({ ...d, areaPoints: [] }));
  };

  const finishPath = () => {
    if (drawing.pathPoints.length >= 2) addPath(drawing.pathPoints);
    setDrawing((d) => ({ ...d, pathPoints: [] }));
  };

  const cancelDrawing = () => {
    setDrawing({
      areaPoints: [],
      zoneStart: null,
      pathPoints: [],
      arrowStart: null,
    });
    setZoneDragStart(null);
    setArrowDragEnd(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-2">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={t.label}
              className={`p-2 rounded-md transition-colors ${
                tool === t.id
                  ? 'bg-navy text-white dark:bg-rose-500 dark:text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {t.icon}
            </button>
          ))}
        </div>

        {tool === 'object' && (
          <div className="flex gap-1">
            {(['cone', 'flag'] as BoardObjectType[]).map((type) => (
              <button
                key={type}
                onClick={() => setObjectType(type)}
                className={`px-2 py-1 rounded text-sm capitalize ${
                  objectType === type ? 'bg-navy text-white dark:bg-rose-500' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        )}

        <span className="text-gray-400 dark:text-gray-500">|</span>

        <span className="text-sm text-gray-600 dark:text-gray-400">Formation:</span>
        <div className="flex gap-1">
          {FORMATION_IDS.map((id) => (
            <button
              key={id}
              onClick={() => applyFormation(id)}
              className={`px-2 py-1 rounded text-sm ${
                formation === id ? 'bg-navy text-white dark:bg-rose-500' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              {id}
            </button>
          ))}
        </div>

        <span className="text-gray-400 dark:text-gray-500">|</span>
        <span className="text-sm text-gray-600 dark:text-gray-400">Opposition:</span>
        <div className="flex items-center gap-1 flex-wrap">
          <div className="flex gap-1">
            {FORMATION_IDS.map((id) => (
              <button
                key={id}
                onClick={() => setOppositionFormation(id)}
                className={`px-2 py-1 rounded text-sm ${
                  oppositionFormation === id ? 'bg-amber-600 text-white dark:bg-amber-500' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                {id}
              </button>
            ))}
          </div>
          <button
            onClick={() => addOpposition(oppositionFormation)}
            className="px-2 py-1 rounded text-sm bg-amber-600 text-white dark:bg-amber-500 hover:bg-amber-700 dark:hover:bg-amber-600"
          >
            Add opposition
          </button>
          {state.players.some((p) => p.team === 'opposition') && (
            <button
              onClick={removeOpposition}
              className="px-2 py-1 rounded text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Remove opposition
            </button>
          )}
        </div>

        {(drawing.areaPoints.length > 0 || drawing.pathPoints.length > 0) && (
          <>
            <button
              onClick={tool === 'area' ? finishArea : finishPath}
              className="px-2 py-1 rounded text-sm bg-green-600 text-white"
            >
              Finish {tool === 'area' ? 'area' : 'path'}
            </button>
            <button onClick={cancelDrawing} className="px-2 py-1 rounded text-sm bg-gray-500 text-white">
              Cancel
            </button>
          </>
        )}

        <span className="flex-1" />

        <button
          onClick={() => setShowSaveModal(true)}
          className="flex items-center gap-1 px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-sm"
          title="Save scenario"
        >
          <Save className="w-4 h-4" />
          Save
        </button>
        <div className="relative">
          <button
            onClick={() => setShowLoadMenu(!showLoadMenu)}
            className="flex items-center gap-1 px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-sm"
            title="Load scenario"
          >
            <FolderOpen className="w-4 h-4" />
            Load
          </button>
          {showLoadMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowLoadMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 min-w-[220px] max-h-60 overflow-auto rounded-lg bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 py-1">
                {savedScenarios.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-gray-500">No saved scenarios</p>
                ) : (
                  savedScenarios.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between group px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <button
                        onClick={() => {
                          loadScenario(s.id);
                          setShowLoadMenu(false);
                        }}
                        className="text-left text-sm flex-1 truncate"
                      >
                        {s.name}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteScenario(s.id);
                        }}
                        className="p-1 opacity-0 group-hover:opacity-100 text-red-500"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
        <button
          onClick={clearBoard}
          className="flex items-center gap-1 px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-sm"
          title="Clear board"
        >
          <Eraser className="w-4 h-4" />
          Clear
        </button>
      </div>

      {/* Pitch — 105:68 FIFA proportions, formation oriented with goal on right */}
      <div className="flex-1 min-h-0 flex items-center justify-center rounded-xl overflow-hidden glass-card">
        <div
          ref={pitchRef}
          className="relative w-full h-full min-w-0 min-h-0 max-w-full max-h-full rounded-lg overflow-hidden cursor-crosshair"
          style={{
            aspectRatio: '105/68',
            background: 'linear-gradient(to bottom, #2E8B57 0%, #228B22 25%, #2E8B57 50%, #228B22 75%, #2E8B57 100%)',
          }}
          onMouseDown={handlePitchMouseDown}
          onMouseMove={handlePitchMouseMove}
          onMouseUp={handlePitchMouseUp}
          onDoubleClick={handlePitchDoubleClick}
        >
          {/* Pitch markings */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 105 68" preserveAspectRatio="none">
            <line x1="52.5" y1="0" x2="52.5" y2="68" stroke="white" strokeWidth="0.3" />
            <circle cx="52.5" cy="34" r="9.15" fill="none" stroke="white" strokeWidth="0.3" />
            <circle cx="52.5" cy="34" r="0.5" fill="white" />
            <rect x="0" y="13.84" width="16.5" height="40.32" fill="none" stroke="white" strokeWidth="0.3" />
            <rect x="0" y="24.84" width="5.5" height="18.32" fill="none" stroke="white" strokeWidth="0.3" />
            <circle cx="11" cy="34" r="0.5" fill="white" />
            <path d="M 16.5 27.5 A 9.15 9.15 0 0 1 16.5 40.5" fill="none" stroke="white" strokeWidth="0.3" />
            <rect x="88.5" y="13.84" width="16.5" height="40.32" fill="none" stroke="white" strokeWidth="0.3" />
            <rect x="99.5" y="24.84" width="5.5" height="18.32" fill="none" stroke="white" strokeWidth="0.3" />
            <circle cx="94" cy="34" r="0.5" fill="white" />
            <path d="M 88.5 27.5 A 9.15 9.15 0 0 0 88.5 40.5" fill="none" stroke="white" strokeWidth="0.3" />
            <path d="M 0 2 A 2 2 0 0 0 2 0" fill="none" stroke="white" strokeWidth="0.3" />
            <path d="M 103 0 A 2 2 0 0 0 105 2" fill="none" stroke="white" strokeWidth="0.3" />
            <path d="M 0 66 A 2 2 0 0 1 2 68" fill="none" stroke="white" strokeWidth="0.3" />
            <path d="M 105 66 A 2 2 0 0 0 103 68" fill="none" stroke="white" strokeWidth="0.3" />
            <rect x="-2" y="30.34" width="2" height="7.32" fill="none" stroke="white" strokeWidth="0.3" />
            <rect x="105" y="30.34" width="2" height="7.32" fill="none" stroke="white" strokeWidth="0.3" />
          </svg>

          {/* Drawing layer (SVG, same aspect) */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            {state.areas.map((a) => (
              <polygon
                key={a.id}
                points={a.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill={a.fill}
                stroke={state.selectedIds.includes(a.id) ? '#fff' : a.stroke}
                strokeWidth={a.strokeWidth + (state.selectedIds.includes(a.id) ? 1 : 0)}
              />
            ))}
            {state.zones.map((z) =>
              z.type === 'rectangle' ? (
                <rect
                  key={z.id}
                  x={z.x}
                  y={z.y}
                  width={z.width}
                  height={z.height}
                  fill={z.fill}
                  stroke={state.selectedIds.includes(z.id) ? '#fff' : z.stroke}
                  strokeWidth={z.strokeWidth + (state.selectedIds.includes(z.id) ? 1 : 0)}
                />
              ) : (
                <ellipse
                  key={z.id}
                  cx={z.x + z.width / 2}
                  cy={z.y + z.height / 2}
                  rx={z.width / 2}
                  ry={z.height / 2}
                  fill={z.fill}
                  stroke={state.selectedIds.includes(z.id) ? '#fff' : z.stroke}
                  strokeWidth={z.strokeWidth + (state.selectedIds.includes(z.id) ? 1 : 0)}
                />
              )
            )}
            {state.paths.map((p) => (
              <polyline
                key={p.id}
                points={p.points.map((pt) => `${pt.x},${pt.y}`).join(' ')}
                fill="none"
                stroke={state.selectedIds.includes(p.id) ? '#fff' : p.stroke}
                strokeWidth={p.strokeWidth + (state.selectedIds.includes(p.id) ? 1 : 0)}
              />
            ))}
            {state.arrows.map((arr) => {
              const dx = arr.end.x - arr.start.x;
              const dy = arr.end.y - arr.start.y;
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len;
              const uy = dy / len;
              const head = 4;
              const tipX = arr.end.x - ux * head;
              const tipY = arr.end.y - uy * head;
              const perpX = -uy * (head / 2);
              const perpY = ux * (head / 2);
              return (
                <g key={arr.id}>
                  <line
                    x1={arr.start.x}
                    y1={arr.start.y}
                    x2={tipX}
                    y2={tipY}
                    stroke={state.selectedIds.includes(arr.id) ? '#fff' : arr.stroke}
                    strokeWidth={arr.strokeWidth}
                  />
                  <polygon
                    points={`${arr.end.x},${arr.end.y} ${tipX + perpX},${tipY + perpY} ${tipX - perpX},${tipY - perpY}`}
                    fill={state.selectedIds.includes(arr.id) ? '#fff' : arr.stroke}
                  />
                </g>
              );
            })}
            {/* In-progress drawing */}
            {drawing.areaPoints.length > 0 && (
              <polygon
                points={drawing.areaPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="rgba(255,200,0,0.2)"
                stroke="#eab308"
                strokeWidth={2}
                strokeDasharray="4 2"
              />
            )}
            {drawing.pathPoints.length > 0 && (
              <polyline
                points={drawing.pathPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="#22c55e"
                strokeWidth={3}
                strokeDasharray="4 2"
              />
            )}
            {zoneDragStart && zoneDragEnd && (
              <rect
                x={Math.min(zoneDragStart.x, zoneDragEnd.x)}
                y={Math.min(zoneDragStart.y, zoneDragEnd.y)}
                width={Math.abs(zoneDragEnd.x - zoneDragStart.x)}
                height={Math.abs(zoneDragEnd.y - zoneDragStart.y)}
                fill="rgba(59,130,246,0.2)"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="4 2"
              />
            )}
            {drawing.arrowStart && arrowDragEnd && (
              <line
                x1={drawing.arrowStart.x}
                y1={drawing.arrowStart.y}
                x2={arrowDragEnd.x}
                y2={arrowDragEnd.y}
                stroke="#ef4444"
                strokeWidth={3}
                strokeDasharray="4 2"
              />
            )}
          </svg>

          {/* Players */}
          {state.players.map((pl) => {
            const isOpposition = pl.team === 'opposition';
            return (
              <div
                key={pl.id}
                className={`absolute w-8 h-8 -ml-4 -mt-4 select-none flex items-center justify-center rounded-full text-xs font-bold border-2 shadow-lg ${
                  isOpposition
                    ? 'bg-white dark:bg-gray-200 text-navy border-amber-500 dark:border-amber-400'
                    : 'bg-navy dark:bg-rose-500 text-white border-white'
                }`}
                style={{
                  left: `${pl.position.x}%`,
                  top: `${pl.position.y}%`,
                  zIndex: 5,
                  borderColor: state.selectedIds.includes(pl.id) ? '#fbbf24' : undefined,
                }}
                title={pl.name}
              >
                {pl.number}
              </div>
            );
          })}

          {/* Objects */}
          {state.objects.map((ob) => (
            <div
              key={ob.id}
              className="absolute w-6 h-6 -ml-3 -mt-3 select-none flex items-center justify-center rounded-full border-2 border-white shadow"
              style={{
                left: `${ob.position.x}%`,
                top: `${ob.position.y}%`,
                zIndex: 5,
                backgroundColor: ob.type === 'cone' ? '#f59e0b' : '#ef4444',
                borderColor: state.selectedIds.includes(ob.id) ? '#fbbf24' : 'white',
              }}
              title={ob.type}
            >
              {ob.type === 'flag' ? <Flag className="w-3 h-3 text-white" /> : null}
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
        {tool === 'select' && 'Click to select. Drag to move. Delete to remove.'}
        {tool === 'player' && 'Click pitch to add a player. Use Formation to populate 11.'}
        {tool === 'object' && 'Click pitch to add a cone or flag.'}
        {tool === 'area' && 'Click to add polygon points. Double-click or Finish to close.'}
        {tool === 'zone' && 'Drag to draw a rectangle.'}
        {tool === 'path' && 'Click to add path points. Double-click or Finish to end.'}
        {tool === 'arrow' && 'Drag from start to end to draw an arrow.'}
      </p>

      {/* Save modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-4 w-full max-w-sm">
            <h3 className="font-semibold mb-2">Save scenario</h3>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Scenario name"
              className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-transparent mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setSaveName('');
                }}
                className="px-3 py-1.5 rounded bg-gray-200 dark:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  saveScenario(saveName);
                  setShowSaveModal(false);
                  setSaveName('');
                }}
                className="px-3 py-1.5 rounded bg-navy text-white dark:bg-rose-500"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
