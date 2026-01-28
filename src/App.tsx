import { useCallback, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { VideoPlayer } from './components/VideoPlayer';
import { SoccerPitch } from './components/SoccerPitch';
import { EventRecordingPanel } from './components/EventRecordingPanel';
import { EventLog } from './components/EventLog';
import { ThemeToggle } from './components/ThemeToggle';
import { DraggablePanel, ResizeHandle } from './components/ResizableLayout';
import { EventProvider } from './context/EventContext';
import { ThemeProvider } from './context/ThemeContext';
import { LayoutProvider, useLayout, getPanelByPosition, PanelId } from './context/LayoutContext';

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

function AppContent() {
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

  // Default layout: video top left, pitch top right, eventRecording bottom left, event log bottom right
  // Horizontal divider: 50% (equal left/right)
  // Left vertical divider: 66% (video bigger than event recording)
  // Right vertical divider: 50% (pitch/events equal)
  const resetLayout = () => {
    setLeftColumnWidth(50);      // 50% left, 50% right
    setLeftTopHeight(66);        // 66% video, 34% event recording
    setRightTopHeight(50);       // 50% pitch, 50% event log
  };

  const leftTop = getPanelByPosition(panels, 'left-top');
  const leftBottom = getPanelByPosition(panels, 'left-bottom');
  const rightTop = getPanelByPosition(panels, 'right-top');
  const rightBottom = getPanelByPosition(panels, 'right-bottom');

  return (
    <div className="h-screen bg-gray-50 dark:bg-black p-3 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect x="3" y="6" width="26" height="20" stroke="black" strokeWidth="2" fill="none" />
              <line x1="16" y1="6" x2="16" y2="26" stroke="black" strokeWidth="1" />
              <circle cx="16" cy="16" r="4" stroke="black" strokeWidth="1" fill="none" />
              <rect x="3" y="12" width="5" height="8" stroke="black" strokeWidth="1" fill="none" />
              <rect x="24" y="12" width="5" height="8" stroke="black" strokeWidth="1" fill="none" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-navy dark:text-white leading-tight">Touchline</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetLayout}
            className="p-2 rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
            title="Reset layout"
          >
            <RotateCcw className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Resizable Layout */}
      <div ref={containerRef} className="flex-1 flex min-h-0">
        {/* Left Column */}
        <div 
          className="flex flex-col min-h-0"
          style={{ width: `${leftColumnWidth}%` }}
        >
          {/* Left Top Panel */}
          <div style={{ height: `${leftTopHeight}%` }} className="min-h-0">
            <DraggablePanel id={leftTop}>
              <PanelContent panelId={leftTop} />
            </DraggablePanel>
          </div>
          
          <ResizeHandle direction="vertical" onResize={handleLeftVerticalResize} />
          
          {/* Left Bottom Panel */}
          <div style={{ height: `${100 - leftTopHeight}%` }} className="min-h-0">
            <DraggablePanel id={leftBottom}>
              <PanelContent panelId={leftBottom} />
            </DraggablePanel>
          </div>
        </div>

        <ResizeHandle direction="horizontal" onResize={handleHorizontalResize} />

        {/* Right Column */}
        <div 
          className="flex flex-col min-h-0"
          style={{ width: `${100 - leftColumnWidth}%` }}
        >
          {/* Right Top Panel */}
          <div style={{ height: `${rightTopHeight}%` }} className="min-h-0">
            <DraggablePanel id={rightTop}>
              <PanelContent panelId={rightTop} />
            </DraggablePanel>
          </div>
          
          <ResizeHandle direction="vertical" onResize={handleRightVerticalResize} />
          
          {/* Right Bottom Panel */}
          <div style={{ height: `${100 - rightTopHeight}%` }} className="min-h-0">
            <DraggablePanel id={rightBottom}>
              <PanelContent panelId={rightBottom} />
            </DraggablePanel>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <LayoutProvider>
        <EventProvider>
          <AppContent />
        </EventProvider>
      </LayoutProvider>
    </ThemeProvider>
  );
}

export default App;
