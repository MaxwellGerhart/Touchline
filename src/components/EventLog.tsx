import { useState, useRef, useCallback, KeyboardEvent, ChangeEvent } from 'react';
import { Trash2, Download, Upload, FileSpreadsheet, Pencil, Undo2 } from 'lucide-react';
import { useEvents } from '../context/EventContext';
import { useSession } from '../context/SessionContext';
import { formatTimestamp } from '../utils/formatters';
import { exportToCSV } from '../utils/export';
import { MatchEvent } from '../types';

/** Parse a mm:ss or m:ss string into total seconds, or null if invalid. */
function parseTimeInput(value: string): number | null {
  const trimmed = value.trim();
  // Try mm:ss
  const colonMatch = trimmed.match(/^(\d{1,3}):(\d{1,2})$/);
  if (colonMatch) {
    const mins = parseInt(colonMatch[1], 10);
    const secs = parseInt(colonMatch[2], 10);
    if (secs >= 60) return null;
    return mins * 60 + secs;
  }
  // Try plain number (seconds)
  const num = parseFloat(trimmed);
  if (!isNaN(num) && num >= 0) return Math.round(num);
  return null;
}

export function EventLog() {
  const {
    events,
    deleteEvent,
    updateEventTime,
    highlightedEventId,
    setHighlightedEventId,
    resetSelection,
    teamNames,
    importEvents,
    clearEvents,
    restoreEvents,
  } = useEvents();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [importMessage, setImportMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<MatchEvent[] | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startEditing = useCallback((eventId: string, currentTimestamp: number) => {
    setEditingId(eventId);
    setEditValue(formatTimestamp(currentTimestamp));
    // Focus input after render
    setTimeout(() => inputRef.current?.select(), 0);
  }, []);

  const commitEdit = useCallback((eventId: string) => {
    const seconds = parseTimeInput(editValue);
    if (seconds !== null) {
      updateEventTime(eventId, seconds);
    }
    setEditingId(null);
  }, [editValue, updateEventTime]);

  const handleEditKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>, eventId: string) => {
    if (e.key === 'Enter') {
      commitEdit(eventId);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  }, [commitEdit]);

  const { activeSession } = useSession();

  const handleEventClick = (eventId: string) => {
    resetSelection();
    setHighlightedEventId(highlightedEventId === eventId ? null : eventId);
  };

  const handleExportCSV = () => {
    exportToCSV(events, activeSession);
  };

  const handleLoadGame = () => {
    fileInputRef.current?.click();
  };

  const handleClear = useCallback(() => {
    if (events.length === 0) return;
    setUndoSnapshot([...events]);
    clearEvents();
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoSnapshot(null), 10000);
  }, [events, clearEvents]);

  const handleUndo = useCallback(() => {
    if (!undoSnapshot) return;
    restoreEvents(undoSnapshot);
    setUndoSnapshot(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, [undoSnapshot, restoreEvents]);

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const csvText = evt.target?.result as string;
      if (!csvText) {
        setImportMessage({ text: 'Could not read file.', type: 'error' });
        return;
      }
      const result = importEvents(csvText);
      if (result.error) {
        setImportMessage({ text: result.error, type: 'error' });
      } else {
        setImportMessage({
          text: `Loaded ${result.added} event(s).${result.skipped > 0 ? ` ${result.skipped} duplicate(s) skipped.` : ''}`,
          type: 'success',
        });
      }
      // Auto-dismiss after 5 seconds
      setTimeout(() => setImportMessage(null), 5000);
    };
    reader.onerror = () => {
      setImportMessage({ text: 'Failed to read file.', type: 'error' });
    };
    reader.readAsText(file);

    // Reset so the same file can be re-uploaded
    e.target.value = '';
  }, [importEvents]);

  const getEventTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      Pass: 'bg-blue-500',
      Shot: 'bg-orange-500',
      Tackle: 'bg-yellow-600',
      Interception: 'bg-purple-500',
      Dribble: 'bg-green-500',
      Cross: 'bg-cyan-500',
      Header: 'bg-pink-500',
      Foul: 'bg-red-500',
      Save: 'bg-teal-500',
      Goal: 'bg-emerald-500',
      Playup: 'bg-indigo-500',
      'Playup Received': 'bg-indigo-400',
    };
    return colors[type] || 'bg-gray-500';
  };

  return (
    <div className="glass-card p-3 rounded-xl flex flex-col h-full">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h3 className="text-xs font-semibold text-navy dark:text-white uppercase tracking-wide">
          Events ({events.length})
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={handleLoadGame}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors bg-emerald-600 text-white hover:bg-emerald-700"
            title="Load Game from CSV"
          >
            <Upload className="w-3 h-3" />
            <span>Load</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={handleExportCSV}
            disabled={events.length === 0}
            className={`
              flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors
              ${events.length > 0
                ? 'bg-navy dark:bg-rose text-white hover:opacity-90'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
              }
            `}
            title="Export to CSV"
          >
            <Download className="w-3 h-3" />
            <span>CSV</span>
          </button>
          <button
            onClick={handleClear}
            disabled={events.length === 0}
            className={`
              flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors
              ${events.length > 0
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
              }
            `}
            title="Clear all events"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {undoSnapshot && (
        <div className="mb-2 px-2 py-1.5 rounded text-xs font-medium flex items-center justify-between bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
          <span>Cleared {undoSnapshot.length} event(s)</span>
          <button
            onClick={handleUndo}
            className="flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded bg-amber-600 text-white hover:bg-amber-700 transition-colors"
          >
            <Undo2 className="w-3 h-3" />
            Undo
          </button>
        </div>
      )}

      {importMessage && (
        <div
          className={`mb-2 px-2 py-1.5 rounded text-xs font-medium flex items-center justify-between ${
            importMessage.type === 'success'
              ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
          }`}
        >
          <span>{importMessage.text}</span>
          <button
            onClick={() => setImportMessage(null)}
            className="ml-2 opacity-60 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}

      {events.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400 text-xs">
          <div className="text-center">
            <FileSpreadsheet className="w-8 h-8 mx-auto mb-1 opacity-50" />
            <p>No events yet</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-0">
          {events.map((event) => (
            <div
              key={event.id}
              onClick={() => handleEventClick(event.id)}
              className={`
                p-2 rounded cursor-pointer transition-all duration-200
                ${highlightedEventId === event.id
                  ? 'bg-blue-100 dark:bg-blue-900/50 ring-1 ring-blue-500'
                  : 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800'
                }
              `}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {editingId === event.id ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(event.id)}
                      onKeyDown={e => handleEditKeyDown(e, event.id)}
                      onClick={e => e.stopPropagation()}
                      className="w-14 text-xs font-mono px-1 py-0.5 rounded border border-blue-400 dark:border-blue-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
                      aria-label="Edit event time"
                    />
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); startEditing(event.id, event.videoTimestamp); }}
                      className="text-xs font-mono text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors group/time flex items-center gap-0.5"
                      title="Click to edit time"
                      aria-label={`Edit time ${formatTimestamp(event.videoTimestamp)}`}
                    >
                      {formatTimestamp(event.videoTimestamp)}
                      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/time:opacity-60 transition-opacity" />
                    </button>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium text-white ${getEventTypeColor(event.eventType)}`}>
                    {event.eventType}
                  </span>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate" title={`${event.playerName} (${event.playerTeam === 1 ? teamNames.team1 : teamNames.team2})`}>
                    #{event.playerId} {event.playerName}
                  </span>
                  <span className={`px-1 py-0.5 rounded text-xs font-medium ${event.playerTeam === 1 ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300'}`}>
                    {event.playerTeam === 1 ? teamNames.team1 : teamNames.team2}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteEvent(event.id);
                  }}
                  className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/50 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
