import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useEvents } from '../context/EventContext';
import { Position } from '../types';

export function SoccerPitch() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Position | null>(null);
  const [dragEnd, setDragEnd] = useState<Position | null>(null);
  
  const {
    startLocation,
    setStartLocation,
    endLocation,
    setEndLocation,
    highlightedEventId,
    events,
  } = useEvents();

  const highlightedEvent = events.find(e => e.id === highlightedEventId);

  const getPositionFromEvent = useCallback((e: React.MouseEvent | MouseEvent): Position | null => {
    if (!containerRef.current) return null;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const pos = getPositionFromEvent(e);
    if (pos) {
      setIsDragging(true);
      setDragStart(pos);
      setDragEnd(null);
      // Reset any previous selection
      setStartLocation(null);
      setEndLocation(null);
    }
  }, [getPositionFromEvent, setStartLocation, setEndLocation]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const pos = getPositionFromEvent(e);
      if (pos) {
        setDragEnd(pos);
      }
    }
  }, [isDragging, getPositionFromEvent]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (isDragging && dragStart) {
      const endPos = getPositionFromEvent(e);
      
      // If drag distance is significant, it's a directional event
      if (endPos) {
        const distance = Math.sqrt(
          Math.pow(endPos.x - dragStart.x, 2) + Math.pow(endPos.y - dragStart.y, 2)
        );
        
        setStartLocation(dragStart);
        if (distance > 3) {
          // Threshold for considering it a drag
          setEndLocation(endPos);
        } else {
          setEndLocation(null);
        }
      }
      
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
    }
  }, [isDragging, dragStart, getPositionFromEvent, setStartLocation, setEndLocation]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);


  return (
    <div className="glass-card p-3 rounded-xl h-full flex flex-col">
      <div
        ref={containerRef}
        className="relative w-full flex-1 rounded-lg overflow-hidden cursor-crosshair select-none"
        onMouseDown={handleMouseDown}
        style={{
          background: 'linear-gradient(to bottom, #2E8B57 0%, #228B22 25%, #2E8B57 50%, #228B22 75%, #2E8B57 100%)',
          minHeight: '120px',
        }}
      >
        {/* SVG Pitch Markings */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 105 68"
          preserveAspectRatio="none"
        >

          
          {/* Center line */}
          <line x1="52.5" y1="0" x2="52.5" y2="68" stroke="white" strokeWidth="0.3" />
          
          {/* Center circle */}
          <circle cx="52.5" cy="34" r="9.15" fill="none" stroke="white" strokeWidth="0.3" />
          
          {/* Center spot */}
          <circle cx="52.5" cy="34" r="0.5" fill="white" />
          
          {/* Left penalty area */}
          <rect x="0" y="13.84" width="16.5" height="40.32" fill="none" stroke="white" strokeWidth="0.3" />
          
          {/* Left goal area */}
          <rect x="0" y="24.84" width="5.5" height="18.32" fill="none" stroke="white" strokeWidth="0.3" />
          
          {/* Left penalty spot */}
          <circle cx="11" cy="34" r="0.5" fill="white" />
          
          {/* Left penalty arc */}
          <path
            d="M 16.5 27.5 A 9.15 9.15 0 0 1 16.5 40.5"
            fill="none"
            stroke="white"
            strokeWidth="0.3"
          />
          
          {/* Right penalty area */}
          <rect x="88.5" y="13.84" width="16.5" height="40.32" fill="none" stroke="white" strokeWidth="0.3" />
          
          {/* Right goal area */}
          <rect x="99.5" y="24.84" width="5.5" height="18.32" fill="none" stroke="white" strokeWidth="0.3" />
          
          {/* Right penalty spot */}
          <circle cx="94" cy="34" r="0.5" fill="white" />
          
          {/* Right penalty arc */}
          <path
            d="M 88.5 27.5 A 9.15 9.15 0 0 0 88.5 40.5"
            fill="none"
            stroke="white"
            strokeWidth="0.3"
          />
          
          {/* Corner arcs - bigger radius */}
          <path d="M 0 2 A 2 2 0 0 0 2 0" fill="none" stroke="white" strokeWidth="0.3" />
          <path d="M 103 0 A 2 2 0 0 0 105 2" fill="none" stroke="white" strokeWidth="0.3" />
          <path d="M 0 66 A 2 2 0 0 1 2 68" fill="none" stroke="white" strokeWidth="0.3" />
          <path d="M 105 66 A 2 2 0 0 0 103 68" fill="none" stroke="white" strokeWidth="0.3" />
          
          {/* Goals */}
          <rect x="-2" y="30.34" width="2" height="7.32" fill="none" stroke="white" strokeWidth="0.3" />
          <rect x="105" y="30.34" width="2" height="7.32" fill="none" stroke="white" strokeWidth="0.3" />
        </svg>

        {/* Real-time drag preview */}
        {isDragging && dragStart && dragEnd && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <line
              x1={`${dragStart.x}%`}
              y1={`${dragStart.y}%`}
              x2={`${dragEnd.x}%`}
              y2={`${dragEnd.y}%`}
              stroke="#FFD700"
              strokeWidth="2"
            />
            <circle
              cx={`${dragStart.x}%`}
              cy={`${dragStart.y}%`}
              r="6"
              fill="#FFD700"
            />
            <circle
              cx={`${dragEnd.x}%`}
              cy={`${dragEnd.y}%`}
              r="6"
              fill="#FFD700"
              opacity="0.7"
            />
          </svg>
        )}

        {/* Selected location marker */}
        {startLocation && !isDragging && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {endLocation ? (
              <>
                <line
                  x1={`${startLocation.x}%`}
                  y1={`${startLocation.y}%`}
                  x2={`${endLocation.x}%`}
                  y2={`${endLocation.y}%`}
                  stroke="#FFD700"
                  strokeWidth="3"
                />
                <circle
                  cx={`${startLocation.x}%`}
                  cy={`${startLocation.y}%`}
                  r="8"
                  fill="#FFD700"
                  opacity="0.6"
                />
                <circle
                  cx={`${endLocation.x}%`}
                  cy={`${endLocation.y}%`}
                  r="8"
                  fill="#FFD700"
                  stroke="#FFA500"
                  strokeWidth="2"
                />
                {/* Arrow head indicator */}
                <polygon
                  points={`${endLocation.x},${endLocation.y - 1.5} ${endLocation.x - 1},${endLocation.y + 0.5} ${endLocation.x + 1},${endLocation.y + 0.5}`}
                  fill="#FFD700"
                  style={{
                    transform: `rotate(${Math.atan2(endLocation.y - startLocation.y, endLocation.x - startLocation.x) * 180 / Math.PI + 90}deg)`,
                    transformOrigin: `${endLocation.x}% ${endLocation.y}%`,
                  }}
                />
              </>
            ) : (
              <circle
                cx={`${startLocation.x}%`}
                cy={`${startLocation.y}%`}
                r="10"
                fill="#FFD700"
                opacity="0.6"
              />
            )}
          </svg>
        )}

        {/* Highlighted event from log */}
        {highlightedEvent && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {highlightedEvent.endLocation ? (
              <>
                <line
                  x1={`${highlightedEvent.startLocation.x}%`}
                  y1={`${highlightedEvent.startLocation.y}%`}
                  x2={`${highlightedEvent.endLocation.x}%`}
                  y2={`${highlightedEvent.endLocation.y}%`}
                  stroke="#00BFFF"
                  strokeWidth="3"
                />
                <circle
                  cx={`${highlightedEvent.startLocation.x}%`}
                  cy={`${highlightedEvent.startLocation.y}%`}
                  r="8"
                  fill="#00BFFF"
                  className="animate-pulse-marker"
                />
                <circle
                  cx={`${highlightedEvent.endLocation.x}%`}
                  cy={`${highlightedEvent.endLocation.y}%`}
                  r="8"
                  fill="#00BFFF"
                  stroke="#1E90FF"
                  strokeWidth="2"
                />
              </>
            ) : (
              <circle
                cx={`${highlightedEvent.startLocation.x}%`}
                cy={`${highlightedEvent.startLocation.y}%`}
                r="10"
                fill="#00BFFF"
                className="animate-pulse-marker"
              />
            )}
          </svg>
        )}

        
      </div>
    </div>
  );
}
