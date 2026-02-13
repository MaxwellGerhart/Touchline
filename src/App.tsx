import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { EventProvider } from './context/EventContext';
import { ThemeProvider } from './context/ThemeContext';
import { LayoutProvider } from './context/LayoutContext';
import { useLayout } from './context/LayoutContext';
import { TaggingPage } from './components/TaggingPage';
import { ThemeToggle } from './components/ThemeToggle';
import { RosterManager } from './components/RosterManager';
type AppPage = 'tagging';

function HeaderActions() {
  const { setLeftColumnWidth, setLeftTopHeight, setRightTopHeight } = useLayout();
  const resetLayout = () => {
    setLeftColumnWidth(50);
    setLeftTopHeight(66);
    setRightTopHeight(50);
  };
  return (
    <button
      onClick={resetLayout}
      className="p-2 rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
      title="Reset layout"
    >
      <RotateCcw className="w-4 h-4 text-gray-600 dark:text-gray-400" />
    </button>
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
            {/* Removed Tactics and Replay buttons */}
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
        {/* Removed Tactics and Replay pages */}
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
