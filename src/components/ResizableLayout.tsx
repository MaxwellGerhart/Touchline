import React, { useCallback, useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { useLayout, PanelId } from '../context/LayoutContext';

interface DraggablePanelProps {
  id: PanelId;
  children: React.ReactNode;
  className?: string;
}

export function DraggablePanel({ id, children, className = '' }: DraggablePanelProps) {
  const { draggedPanel, setDraggedPanel, dropTarget, setDropTarget, swapPanels } = useLayout();

  const handleDragStart = (e: React.DragEvent) => {
    setDraggedPanel(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragEnd = () => {
    if (draggedPanel && dropTarget && draggedPanel !== dropTarget) {
      swapPanels(draggedPanel, dropTarget);
    }
    setDraggedPanel(null);
    setDropTarget(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedPanel && draggedPanel !== id) {
      setDropTarget(id);
    }
  };

  const handleDragLeave = () => {
    if (dropTarget === id) {
      setDropTarget(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const isDragging = draggedPanel === id;
  const isDropTarget = dropTarget === id && draggedPanel !== id;

  return (
    <div
      className={`
        relative h-full
        ${isDragging ? 'opacity-50' : ''}
        ${isDropTarget ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-black' : ''}
        ${className}
      `}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ cursor: 'grab' }}
      title="Drag to swap panels"
    >
      {children}
    </div>
  );
}

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
  className?: string;
}

export function ResizeHandle({ direction, onResize, className = '' }: ResizeHandleProps) {
  const isResizing = useRef(false);
  const startPos = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) return;
      const currentPos = direction === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
      const delta = currentPos - startPos.current;
      startPos.current = currentPos;
      onResize(delta);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [direction, onResize]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`
        ${direction === 'horizontal' 
          ? 'w-2 cursor-col-resize hover:bg-blue-500/30' 
          : 'h-2 cursor-row-resize hover:bg-blue-500/30'
        }
        flex items-center justify-center
        transition-colors
        ${className}
      `}
    >
      <div
        className={`
          ${direction === 'horizontal' ? 'w-0.5 h-8' : 'h-0.5 w-8'}
          bg-gray-300 dark:bg-gray-600 rounded-full
        `}
      />
    </div>
  );
}
