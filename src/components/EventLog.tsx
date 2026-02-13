
import { Trash2, Download, FileSpreadsheet } from 'lucide-react';
import { useEvents } from '../context/EventContext';
import { useSession } from '../context/SessionContext';
import { formatTimestamp } from '../utils/formatters';
import { exportToCSV } from '../utils/export';

export function EventLog() {
  const {
    events,
    deleteEvent,
    highlightedEventId,
    setHighlightedEventId,
    resetSelection,
    teamNames,
  } = useEvents();

  const { activeSession } = useSession();

  const handleEventClick = (eventId: string) => {
    resetSelection();
    setHighlightedEventId(highlightedEventId === eventId ? null : eventId);
  };

  const handleExportCSV = () => {
    exportToCSV(events, activeSession);
  };

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
      </div>

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
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                    {formatTimestamp(event.videoTimestamp)}
                  </span>
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
