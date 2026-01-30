import { useCallback, useRef } from 'react';
import { VideoPlayer } from './VideoPlayer';
import { SoccerPitch } from './SoccerPitch';
import { EventRecordingPanel } from './EventRecordingPanel';
import { EventLog } from './EventLog';
import { DraggablePanel, ResizeHandle } from './ResizableLayout';
import { useLayout, getPanelByPosition, PanelId } from '../context/LayoutContext';

function PanelContent({ panelId }: { panelId: PanelId }) {
  switch (panelId) {
    case 'video':
      return <VideoPlayer />;
    case 'pitch':
      return <SoccerPitch />;
    case 'controls':
      return <EventRecordingPanel />;
    case 'log':
      return <EventLog />;
    default:
      return null;
  }
}

export function TaggingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    panels,
    leftColumnWidth,
    setLeftColumnWidth,
    leftTopHeight,
    setLeftTopHeight,
    rightTopHeight,
    setRightTopHeight,
  } = useLayout();

  const handleHorizontalResize = useCallback((delta: number) => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.offsetWidth;
    const deltaPercent = (delta / containerWidth) * 100;
    setLeftColumnWidth(prev => Math.max(25, Math.min(75, prev + deltaPercent)));
  }, [setLeftColumnWidth]);

  const handleLeftVerticalResize = useCallback((delta: number) => {
    if (!containerRef.current) return;
    const containerHeight = containerRef.current.offsetHeight;
    const deltaPercent = (delta / containerHeight) * 100;
    setLeftTopHeight(prev => Math.max(15, Math.min(85, prev + deltaPercent)));
  }, [setLeftTopHeight]);

  const handleRightVerticalResize = useCallback((delta: number) => {
    if (!containerRef.current) return;
    const containerHeight = containerRef.current.offsetHeight;
    const deltaPercent = (delta / containerHeight) * 100;
    setRightTopHeight(prev => Math.max(15, Math.min(85, prev + deltaPercent)));
  }, [setRightTopHeight]);

  const leftTop = getPanelByPosition(panels, 'left-top');
  const leftBottom = getPanelByPosition(panels, 'left-bottom');
  const rightTop = getPanelByPosition(panels, 'right-top');
  const rightBottom = getPanelByPosition(panels, 'right-bottom');

  return (
    <div ref={containerRef} className="flex-1 flex min-h-0">
        <div
          className="flex flex-col min-h-0"
          style={{ width: `${leftColumnWidth}%` }}
        >
          <div style={{ height: `${leftTopHeight}%` }} className="min-h-0">
            <DraggablePanel id={leftTop}>
              <PanelContent panelId={leftTop} />
            </DraggablePanel>
          </div>
          <ResizeHandle direction="vertical" onResize={handleLeftVerticalResize} />
          <div style={{ height: `${100 - leftTopHeight}%` }} className="min-h-0">
            <DraggablePanel id={leftBottom}>
              <PanelContent panelId={leftBottom} />
            </DraggablePanel>
          </div>
        </div>
        <ResizeHandle direction="horizontal" onResize={handleHorizontalResize} />
        <div
          className="flex flex-col min-h-0"
          style={{ width: `${100 - leftColumnWidth}%` }}
        >
          <div style={{ height: `${rightTopHeight}%` }} className="min-h-0">
            <DraggablePanel id={rightTop}>
              <PanelContent panelId={rightTop} />
            </DraggablePanel>
          </div>
          <ResizeHandle direction="vertical" onResize={handleRightVerticalResize} />
          <div style={{ height: `${100 - rightTopHeight}%` }} className="min-h-0">
            <DraggablePanel id={rightBottom}>
              <PanelContent panelId={rightBottom} />
            </DraggablePanel>
          </div>
        </div>
      </div>
  );
}
