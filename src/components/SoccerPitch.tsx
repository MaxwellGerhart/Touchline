import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useEvents } from '../context/EventContext';
import { useDrill } from '../context/DrillContext';
import { Position, DrillRectangle } from '../types';

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

export function SoccerPitch() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Position | null>(null);
  const [dragEnd, setDragEnd] = useState<Position | null>(null);

  // Drill area: two-click drawing state
  const [drillCorner1, setDrillCorner1] = useState<Position | null>(null);
  const [drillPreviewPos, setDrillPreviewPos] = useState<Position | null>(null);

  // Drill area: resize state
  const [resizingHandle, setResizingHandle] = useState<ResizeHandle | null>(null);
  const [resizeAnchor, setResizeAnchor] = useState<Position | null>(null);
  
  const {
    startLocation,
    setStartLocation,
    endLocation,
    setEndLocation,
    highlightedEventId,
    events,
  } = useEvents();

  const { drillConfig, setDrillArea, isDrawingDrillArea, setIsDrawingDrillArea, isDrillActive } = useDrill();

  const highlightedEvent = events.find(e => e.id === highlightedEventId);

  // Whether we are in zoomed drill mode (area exists and is activated)
  const isZoomed = isDrillActive && !!drillConfig.area;
  const drillArea = drillConfig.area;

  // Convert container-percentage click to full-pitch 0-100% coordinates.
  // When zoomed, 0-100% of container maps to just the drill rectangle.
  const getPositionFromEvent = useCallback((e: React.MouseEvent | MouseEvent): Position | null => {
    if (!containerRef.current) return null;
    
    const rect = containerRef.current.getBoundingClientRect();
    const rawX = ((e.clientX - rect.left) / rect.width) * 100;
    const rawY = ((e.clientY - rect.top) / rect.height) * 100;
    
    if (isZoomed && drillArea) {
      // Map container percent → full-pitch percent within drill area
      return {
        x: Math.max(0, Math.min(100, drillArea.x + (rawX / 100) * drillArea.width)),
        y: Math.max(0, Math.min(100, drillArea.y + (rawY / 100) * drillArea.height)),
      };
    }

    return {
      x: Math.max(0, Math.min(100, rawX)),
      y: Math.max(0, Math.min(100, rawY)),
    };
  }, [isZoomed, drillArea]);

  // Convert a full-pitch 0-100% position to display coordinates.
  // When zoomed, we remap to the drill area's local space.
  const toDisplayCoords = useCallback((pos: Position): Position => {
    if (isZoomed && drillArea) {
      return {
        x: ((pos.x - drillArea.x) / drillArea.width) * 100,
        y: ((pos.y - drillArea.y) / drillArea.height) * 100,
      };
    }
    return pos;
  }, [isZoomed, drillArea]);

  // Compute SVG viewBox — zoom into drill area portion of the 105×68 pitch
  const svgViewBox = isZoomed && drillArea
    ? `${(drillArea.x / 100) * 105} ${(drillArea.y / 100) * 68} ${(drillArea.width / 100) * 105} ${(drillArea.height / 100) * 68}`
    : '0 0 105 68';

  const buildRect = (a: Position, b: Position): DrillRectangle => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  });

  // ── Drill area resize: start drag on a corner handle ──
  const handleResizeStart = useCallback((e: React.MouseEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    e.preventDefault();
    if (!drillConfig.area) return;
    const { x, y, width, height } = drillConfig.area;
    // The anchor is the corner opposite to the one being dragged
    const anchor: Record<ResizeHandle, Position> = {
      nw: { x: x + width, y: y + height },
      ne: { x, y: y + height },
      sw: { x: x + width, y },
      se: { x, y },
    };
    setResizingHandle(handle);
    setResizeAnchor(anchor[handle]);
  }, [drillConfig.area]);

  // ── Mouse down on pitch ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const pos = getPositionFromEvent(e);
    if (!pos) return;

    if (isDrawingDrillArea) {
      if (!drillCorner1) {
        // First click: set corner 1
        setDrillCorner1(pos);
        setDrillPreviewPos(pos);
      } else {
        // Second click: finalise the rectangle
        const rect = buildRect(drillCorner1, pos);
        if (rect.width > 1 && rect.height > 1) {
          setDrillArea(rect);
        }
        setDrillCorner1(null);
        setDrillPreviewPos(null);
        setIsDrawingDrillArea(false);
      }
      return;
    }

    // Normal event tagging drag
    setIsDragging(true);
    setDragStart(pos);
    setDragEnd(null);
    setStartLocation(null);
    setEndLocation(null);
  }, [getPositionFromEvent, setStartLocation, setEndLocation, isDrawingDrillArea, drillCorner1, setDrillArea, setIsDrawingDrillArea]);

  // ── Mouse move (shared: event drag, drill preview, resize) ──
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (resizingHandle && resizeAnchor) {
      const pos = getPositionFromEvent(e);
      if (pos) {
        const rect = buildRect(resizeAnchor, pos);
        if (rect.width > 1 && rect.height > 1) {
          setDrillArea(rect);
        }
      }
      return;
    }
    if (isDrawingDrillArea && drillCorner1) {
      const pos = getPositionFromEvent(e);
      if (pos) setDrillPreviewPos(pos);
      return;
    }
    if (isDragging) {
      const pos = getPositionFromEvent(e);
      if (pos) setDragEnd(pos);
    }
  }, [isDragging, isDrawingDrillArea, drillCorner1, resizingHandle, resizeAnchor, getPositionFromEvent, setDrillArea]);

  // ── Mouse up ──
  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (resizingHandle) {
      setResizingHandle(null);
      setResizeAnchor(null);
      return;
    }
    if (isDragging && dragStart) {
      const endPos = getPositionFromEvent(e);
      if (endPos) {
        const distance = Math.sqrt(
          Math.pow(endPos.x - dragStart.x, 2) + Math.pow(endPos.y - dragStart.y, 2)
        );
        setStartLocation(dragStart);
        if (distance > 3) {
          setEndLocation(endPos);
        } else {
          setEndLocation(null);
        }
      }
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
    }
  }, [isDragging, dragStart, resizingHandle, getPositionFromEvent, setStartLocation, setEndLocation]);

  // Cancel drill drawing on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawingDrillArea) {
        setDrillCorner1(null);
        setDrillPreviewPos(null);
        setIsDrawingDrillArea(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDrawingDrillArea, setIsDrawingDrillArea]);

  // Global mouse move / up listeners
  useEffect(() => {
    const needsListeners = isDragging || (isDrawingDrillArea && drillCorner1) || resizingHandle;
    if (needsListeners) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isDrawingDrillArea, drillCorner1, resizingHandle, handleMouseMove, handleMouseUp]);

  // Preview rectangle while drawing
  const drillPreviewRect = (drillCorner1 && drillPreviewPos) ? buildRect(drillCorner1, drillPreviewPos) : null;

  // Compute corner positions for resize handles
  const getHandlePositions = (area: DrillRectangle) => ({
    nw: { x: area.x, y: area.y },
    ne: { x: area.x + area.width, y: area.y },
    sw: { x: area.x, y: area.y + area.height },
    se: { x: area.x + area.width, y: area.y + area.height },
  });

  const handleCursors: Record<ResizeHandle, string> = {
    nw: 'nwse-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    se: 'nwse-resize',
  };


  return (
    <div className="glass-card p-3 rounded-xl h-full flex flex-col">
      <div
        ref={containerRef}
        className={`relative w-full flex-1 rounded-lg overflow-hidden select-none shadow-lg ${
          isDrawingDrillArea ? 'cursor-cell' : 'cursor-crosshair'
        }`}
        onMouseDown={handleMouseDown}
        style={{
          background: '#2E8B57',
          minHeight: '120px',
        }}
      >
        {/* SVG Pitch Markings */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={svgViewBox}
          preserveAspectRatio="none"
        >
          <defs>
            {/* Grass stripe pattern */}
            <pattern id="grassStripesTagging" patternUnits="userSpaceOnUse" width="10.5" height="68">
              <rect x="0" y="0" width="5.25" height="68" fill="#2E8B57" />
              <rect x="5.25" y="0" width="5.25" height="68" fill="#268B4D" />
            </pattern>
            {/* Goal net pattern */}
            <pattern id="goalNetTagging" patternUnits="userSpaceOnUse" width="0.4" height="0.4">
              <rect width="0.4" height="0.4" fill="#f8f8f8" />
              <line x1="0" y1="0" x2="0.4" y2="0" stroke="#ccc" strokeWidth="0.05" />
              <line x1="0" y1="0" x2="0" y2="0.4" stroke="#ccc" strokeWidth="0.05" />
            </pattern>
            {/* Line glow effect */}
            <filter id="lineGlowTagging" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="0.15" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          
          {/* Grass stripes background */}
          <rect x="0" y="0" width="105" height="68" fill="url(#grassStripesTagging)" />
          
          {/* Pitch outline */}
          <rect x="0.15" y="0.15" width="104.7" height="67.7" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="0.35" filter="url(#lineGlowTagging)" />
          
          {/* Halfway line */}
          <line x1="52.5" y1="0" x2="52.5" y2="68" stroke="white" strokeWidth="0.5" />
          
          {/* Center circle */}
          <circle cx="52.5" cy="34" r="9.15" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="0.25" filter="url(#lineGlowTagging)" />
          
          {/* Center spot */}
          <circle cx="52.5" cy="34" r="0.4" fill="white" />
          
          {/* Left penalty area */}
          <rect x="0" y="13.84" width="16.5" height="40.32" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="0.25" filter="url(#lineGlowTagging)" />
          
          {/* Left goal area */}
          <rect x="0" y="24.84" width="5.5" height="18.32" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="0.25" filter="url(#lineGlowTagging)" />
          
          {/* Left penalty spot */}
          <circle cx="11" cy="34" r="0.35" fill="white" />
          
          {/* Left penalty arc */}
          <path d="M 16.5 27.5 A 9.15 9.15 0 0 1 16.5 40.5" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="0.25" filter="url(#lineGlowTagging)" />
          
          {/* Right penalty area */}
          <rect x="88.5" y="13.84" width="16.5" height="40.32" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="0.25" filter="url(#lineGlowTagging)" />
          
          {/* Right goal area */}
          <rect x="99.5" y="24.84" width="5.5" height="18.32" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="0.25" filter="url(#lineGlowTagging)" />
          
          {/* Right penalty spot */}
          <circle cx="94" cy="34" r="0.35" fill="white" />
          
          {/* Right penalty arc */}
          <path d="M 88.5 27.5 A 9.15 9.15 0 0 0 88.5 40.5" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="0.25" filter="url(#lineGlowTagging)" />
          
          {/* Corner arcs */}
          <path d="M 0 1.5 A 1.5 1.5 0 0 0 1.5 0" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="0.25" filter="url(#lineGlowTagging)" />
          <path d="M 103.5 0 A 1.5 1.5 0 0 0 105 1.5" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="0.25" filter="url(#lineGlowTagging)" />
          <path d="M 0 66.5 A 1.5 1.5 0 0 1 1.5 68" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="0.25" filter="url(#lineGlowTagging)" />
          <path d="M 105 66.5 A 1.5 1.5 0 0 0 103.5 68" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="0.25" filter="url(#lineGlowTagging)" />
          
          {/* Left goal with net */}
          <rect x="-2.5" y="30.34" width="2.5" height="7.32" fill="url(#goalNetTagging)" stroke="#ddd" strokeWidth="0.2" />
          <line x1="0" y1="30.34" x2="0" y2="37.66" stroke="white" strokeWidth="0.4" />
          
          {/* Right goal with net */}
          <rect x="105" y="30.34" width="2.5" height="7.32" fill="url(#goalNetTagging)" stroke="#ddd" strokeWidth="0.2" />
          <line x1="105" y1="30.34" x2="105" y2="37.66" stroke="white" strokeWidth="0.4" />
        </svg>

        {/* Real-time drag preview */}
        {isDragging && dragStart && dragEnd && (() => {
          const ds = toDisplayCoords(dragStart);
          const de = toDisplayCoords(dragEnd);
          return (
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <line
                x1={`${ds.x}%`} y1={`${ds.y}%`}
                x2={`${de.x}%`} y2={`${de.y}%`}
                stroke="#FFD700" strokeWidth="2"
              />
              <circle cx={`${ds.x}%`} cy={`${ds.y}%`} r="6" fill="#FFD700" />
              <circle cx={`${de.x}%`} cy={`${de.y}%`} r="6" fill="#FFD700" opacity="0.7" />
            </svg>
          );
        })()}

        {/* Selected location marker */}
        {startLocation && !isDragging && (() => {
          const sl = toDisplayCoords(startLocation);
          const el = endLocation ? toDisplayCoords(endLocation) : null;
          return (
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {el ? (
                <>
                  <line
                    x1={`${sl.x}%`} y1={`${sl.y}%`}
                    x2={`${el.x}%`} y2={`${el.y}%`}
                    stroke="#FFD700" strokeWidth="3"
                  />
                  <circle cx={`${sl.x}%`} cy={`${sl.y}%`} r="8" fill="#FFD700" opacity="0.6" />
                  <circle cx={`${el.x}%`} cy={`${el.y}%`} r="8" fill="#FFD700" stroke="#FFA500" strokeWidth="2" />
                  <polygon
                    points={`${el.x},${el.y - 1.5} ${el.x - 1},${el.y + 0.5} ${el.x + 1},${el.y + 0.5}`}
                    fill="#FFD700"
                    style={{
                      transform: `rotate(${Math.atan2(el.y - sl.y, el.x - sl.x) * 180 / Math.PI + 90}deg)`,
                      transformOrigin: `${el.x}% ${el.y}%`,
                    }}
                  />
                </>
              ) : (
                <circle cx={`${sl.x}%`} cy={`${sl.y}%`} r="10" fill="#FFD700" opacity="0.6" />
              )}
            </svg>
          );
        })()}

        {/* Highlighted event from log */}
        {highlightedEvent && (() => {
          const hs = toDisplayCoords(highlightedEvent.startLocation);
          const he = highlightedEvent.endLocation ? toDisplayCoords(highlightedEvent.endLocation) : null;
          return (
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {he ? (
                <>
                  <line
                    x1={`${hs.x}%`} y1={`${hs.y}%`}
                    x2={`${he.x}%`} y2={`${he.y}%`}
                    stroke="#00BFFF" strokeWidth="3"
                  />
                  <circle cx={`${hs.x}%`} cy={`${hs.y}%`} r="8" fill="#00BFFF" />
                  <circle cx={`${he.x}%`} cy={`${he.y}%`} r="8" fill="#00BFFF" stroke="#1E90FF" strokeWidth="2" />
                </>
              ) : (
                <circle cx={`${hs.x}%`} cy={`${hs.y}%`} r="10" fill="#00BFFF" />
              )}
            </svg>
          );
        })()}

        {/* Persisted drill area overlay with resize handles (only in full-field view) */}
        {drillConfig.area && !isDrawingDrillArea && !isZoomed && (() => {
          const area = drillConfig.area;
          const handles = getHandlePositions(area);
          return (
            <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 5 }}>
              {/* Semi-transparent fill + dashed border (doesn't block clicks) */}
              <rect
                x={`${area.x}%`}
                y={`${area.y}%`}
                width={`${area.width}%`}
                height={`${area.height}%`}
                fill="rgba(255, 165, 0, 0.12)"
                stroke="#FFA500"
                strokeWidth="2"
                strokeDasharray="6 3"
                rx="2"
                ry="2"
                pointerEvents="none"
              />
              {/* Label */}
              <text
                x={`${area.x + area.width / 2}%`}
                y={`${area.y + 3}%`}
                textAnchor="middle"
                fill="#FFA500"
                fontSize="10"
                fontWeight="bold"
                opacity="0.9"
                pointerEvents="none"
              >
                {drillConfig.drillType || 'Drill Area'}
              </text>
              {/* Resize corner handles */}
              {(Object.entries(handles) as [ResizeHandle, Position][]).map(([key, pos]) => (
                <circle
                  key={key}
                  cx={`${pos.x}%`}
                  cy={`${pos.y}%`}
                  r="6"
                  fill="white"
                  stroke="#FFA500"
                  strokeWidth="2"
                  style={{ cursor: handleCursors[key] }}
                  onMouseDown={(e) => handleResizeStart(e, key)}
                />
              ))}
            </svg>
          );
        })()}

        {/* Drill area drawing preview (two-click) — only in full-field view */}
        {!isZoomed && drillPreviewRect && isDrawingDrillArea && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 10 }}>
            <rect
              x={`${drillPreviewRect.x}%`}
              y={`${drillPreviewRect.y}%`}
              width={`${drillPreviewRect.width}%`}
              height={`${drillPreviewRect.height}%`}
              fill="rgba(255, 165, 0, 0.2)"
              stroke="#FFA500"
              strokeWidth="2"
              strokeDasharray="4 2"
            />
            {drillCorner1 && (
              <circle cx={`${drillCorner1.x}%`} cy={`${drillCorner1.y}%`} r="5" fill="#FFA500" />
            )}
          </svg>
        )}

        {/* First corner marker before mouse moves */}
        {!isZoomed && drillCorner1 && !drillPreviewRect && isDrawingDrillArea && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 10 }}>
            <circle cx={`${drillCorner1.x}%`} cy={`${drillCorner1.y}%`} r="5" fill="#FFA500" />
          </svg>
        )}

        {/* Drawing mode indicator */}
        {isDrawingDrillArea && !isZoomed && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full pointer-events-none z-20 animate-pulse">
            {drillCorner1 ? 'Click to set second corner (Esc to cancel)' : 'Click to set first corner (Esc to cancel)'}
          </div>
        )}

        {/* Zoomed drill mode indicator */}
        {isZoomed && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-orange-600/90 text-white text-xs font-bold px-3 py-1 rounded-full pointer-events-none z-20">
            {drillConfig.drillType || 'Drill'} — Zoomed
          </div>
        )}

        
      </div>
    </div>
  );
}
