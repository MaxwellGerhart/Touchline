import { useState } from 'react';
import { RotateCcw, Plus, ChevronDown, Trash2 } from 'lucide-react';
import { EventProvider } from './context/EventContext';
import { ThemeProvider } from './context/ThemeContext';
import { LayoutProvider } from './context/LayoutContext';
import { DrillProvider } from './context/DrillContext';
import { SessionProvider, useSession } from './context/SessionContext';
import { useLayout } from './context/LayoutContext';
import { TaggingPage } from './components/TaggingPage';
import { GraphicGenerator } from './components/GraphicGenerator';
import { ThemeToggle } from './components/ThemeToggle';
import { RosterManager } from './components/RosterManager';
import { SessionSetupModal } from './components/SessionSetupModal';
type AppPage = 'tagging' | 'graphics';

function HeaderActions() {
  const { setLeftColumnWidth, setLeftTopHeight, setRightTopHeight } = useLayout();
  const { openSetup, activeSession, sessions, setActiveSessionId, deleteSession } = useSession();
  const [showSessionPicker, setShowSessionPicker] = useState(false);

  const resetLayout = () => {
    setLeftColumnWidth(50);
    setLeftTopHeight(66);
    setRightTopHeight(50);
  };
  return (
    <>
      {/* Session controls */}
      <div className="relative">
        <div className="flex items-center gap-1">
          <button
            onClick={openSetup}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white transition-colors"
            title="Create new session"
          >
            <Plus className="w-3.5 h-3.5" />
            New Session
          </button>
          {sessions.length > 0 && (
            <button
              onClick={() => setShowSessionPicker(p => !p)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors max-w-[170px] truncate"
              title="Switch session"
            >
              {activeSession ? activeSession.name : 'No session'}
              <ChevronDown className="w-3 h-3 flex-shrink-0" />
            </button>
          )}
        </div>

        {/* Session picker dropdown */}
        {showSessionPicker && (
          <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 min-w-[200px] max-h-64 overflow-auto">
            <button
              onClick={() => { setActiveSessionId(null); setShowSessionPicker(false); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 ${
                !activeSession ? 'font-bold text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              No session (free mode)
            </button>
            {sessions.map(s => (
              <div key={s.id} className="flex items-center hover:bg-gray-100 dark:hover:bg-gray-800">
                <button
                  onClick={() => { setActiveSessionId(s.id); setShowSessionPicker(false); }}
                  className={`flex-1 text-left px-3 py-2 text-xs ${
                    activeSession?.id === s.id ? 'font-bold text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span className="block truncate">{s.name}</span>
                  <span className="block text-[10px] text-gray-400">{s.drillType || 'No drill type'} • T1→{s.team1Goal} T2→{s.team2Goal}</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                  className="p-1.5 mr-1 rounded text-red-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  title="Delete session"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={resetLayout}
        className="p-2 rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
        title="Reset layout"
      >
        <RotateCcw className="w-4 h-4 text-gray-600 dark:text-gray-400" />
      </button>
    </>
  );
}

function AppContent() {
  const [page, setPage] = useState<AppPage>('tagging');

  return (
    <div className="h-screen bg-gray-50 dark:bg-black p-3 flex flex-col overflow-hidden">
      {/* Header with page nav */}
      <header className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none" className="text-navy dark:text-white">
                <rect x="3" y="6" width="26" height="20" stroke="currentColor" strokeWidth="2" fill="none" />
                <line x1="16" y1="6" x2="16" y2="26" stroke="currentColor" strokeWidth="1" />
                <circle cx="16" cy="16" r="4" stroke="currentColor" strokeWidth="1" fill="none" />
                <rect x="3" y="12" width="5" height="8" stroke="currentColor" strokeWidth="1" fill="none" />
                <rect x="24" y="12" width="5" height="8" stroke="currentColor" strokeWidth="1" fill="none" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-navy dark:text-white leading-tight">Touchline</h1>
          </div>
          {/* Page tabs */}
          <nav className="flex items-center gap-1">
            <button
              onClick={() => setPage('tagging')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                page === 'tagging'
                  ? 'bg-navy text-white dark:bg-rose-500 dark:text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'
              }`}
            >
              Tagging
            </button>
            <button
              onClick={() => setPage('graphics')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                page === 'graphics'
                  ? 'bg-navy text-white dark:bg-rose-500 dark:text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'
              }`}
            >
              Graphics
            </button>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <RosterManager />
          {page === 'tagging' && <HeaderActions />}
          <ThemeToggle />
        </div>
      </header>

      {/* Page content */}
      <div className="flex-1 flex flex-col min-h-0">
        {page === 'tagging' && <TaggingPage />}
        {page === 'graphics' && <GraphicGenerator />}
      </div>

      {/* Session setup modal */}
      <SessionSetupModal />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <LayoutProvider>
        <EventProvider>
          <DrillProvider>
            <SessionProvider>
              <AppContent />
            </SessionProvider>
          </DrillProvider>
        </EventProvider>
      </LayoutProvider>
    </ThemeProvider>
  );
}

export default App;
