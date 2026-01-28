import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useEvents } from '../context/EventContext';

export function EventRecordingPanel() {
  const {
    selectedPlayer,
    setSelectedPlayer,
    selectedEventType,
    setSelectedEventType,
    startLocation,
    endLocation,
    currentVideoTime,
    players,
    addEvent,
    resetSelection,
    setHighlightedEventId,
    eventTypes,
    addEventType,
    deleteEventType,

    addPlayer,
  } = useEvents();

  const [newEventType, setNewEventType] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [showAddPlayerInput, setShowAddPlayerInput] = useState(false);
  const handleAddPlayer = () => {
    if (newPlayerName.trim()) {
      addPlayer(newPlayerName.trim());
      setNewPlayerName('');
      setShowAddPlayerInput(false);
    }
  };

  const handlePlayerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddPlayer();
    } else if (e.key === 'Escape') {
      setNewPlayerName('');
      setShowAddPlayerInput(false);
    }
  };

  const canRecord = selectedPlayer !== null && selectedEventType !== null && startLocation !== null;

  const handleRecordEvent = () => {
    if (!canRecord || selectedPlayer === null || selectedEventType === null || startLocation === null) return;

    const player = players.find(p => p.id === selectedPlayer);
    if (!player) return;

    addEvent({
      videoTimestamp: currentVideoTime,
      playerId: selectedPlayer,
      playerName: player.name,
      eventType: selectedEventType,
      startLocation,
      endLocation: endLocation || undefined,
    });

    setHighlightedEventId(null);
    resetSelection();
  };

  const handleAddEventType = () => {
    if (newEventType.trim()) {
      addEventType(newEventType.trim());
      setNewEventType('');
      setShowAddInput(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddEventType();
    } else if (e.key === 'Escape') {
      setNewEventType('');
      setShowAddInput(false);
    }
  };

  return (
    <div className="glass-card p-3 rounded-xl h-full flex flex-col gap-2 overflow-auto">
      {/* Player Selection */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Player
        </label>
        <div className="flex flex-wrap gap-1 items-center">
          {players.map((player) => (
            <button
              key={player.id}
              onClick={() => setSelectedPlayer(selectedPlayer === player.id ? null : player.id)}
              className={`
                p-1.5 rounded text-center transition-all duration-200 text-sm font-bold
                ${selectedPlayer === player.id
                  ? 'bg-navy dark:bg-rose text-white ring-1 ring-navy dark:ring-rose'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }
              `}
              title={player.name}
            >
              {player.id}
            </button>
          ))}
          {showAddPlayerInput ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                onKeyDown={handlePlayerKeyDown}
                placeholder="Type name..."
                className="px-2 py-1 rounded text-xs w-24 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-rose"
                autoFocus
              />
              <button
                onClick={handleAddPlayer}
                className="p-1 rounded bg-green-500 text-white hover:bg-green-600"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                onClick={() => { setNewPlayerName(''); setShowAddPlayerInput(false); }}
                className="p-1 rounded bg-gray-400 text-white hover:bg-gray-500"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddPlayerInput(true)}
              className="px-2 py-1 rounded text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          )}
        </div>
      </div>

      {/* Event Type Selection */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Event
        </label>
        <div className="flex flex-wrap gap-1">
          {eventTypes.map((type) => (
            <div key={type} className="relative group">
              <button
                onClick={() => setSelectedEventType(selectedEventType === type ? null : type)}
                className={`
                  px-2 py-1 rounded text-xs font-medium transition-all duration-200
                  ${selectedEventType === type
                    ? 'bg-navy dark:bg-rose text-white ring-1 ring-navy dark:ring-rose'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }
                `}
              >
                {type}
              </button>
              <button
                onClick={() => deleteEventType(type)}
                className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white hidden group-hover:flex items-center justify-center text-xs"
                title="Delete event type"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
          {showAddInput ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newEventType}
                onChange={(e) => setNewEventType(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type name..."
                className="px-2 py-1 rounded text-xs w-24 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-rose"
                autoFocus
              />
              <button
                onClick={handleAddEventType}
                className="p-1 rounded bg-green-500 text-white hover:bg-green-600"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                onClick={() => { setNewEventType(''); setShowAddInput(false); }}
                className="p-1 rounded bg-gray-400 text-white hover:bg-gray-500"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddInput(true)}
              className="px-2 py-1 rounded text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          )}
        </div>
      </div>

      {/* Status and Record Button */}
      <div className="flex-1 flex items-end justify-end">
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-500 dark:text-gray-400 mr-4">
            {selectedPlayer && <span className="text-green-600 dark:text-green-400">#{selectedPlayer}</span>}
            {selectedEventType && <span className="text-green-600 dark:text-green-400 ml-2">{selectedEventType}</span>}
            {startLocation && <span className="text-green-600 dark:text-green-400 ml-2">Location set</span>}
          </div>
          <button
            onClick={handleRecordEvent}
            disabled={!canRecord}
            className={`
              py-2 px-4 rounded-lg font-semibold text-xs transition-all duration-200
              ${canRecord
                ? 'bg-navy dark:bg-rose text-white hover:opacity-90'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
              }
            `}
          >
            Record
          </button>
          <button
            onClick={resetSelection}
            className="py-2 px-3 rounded-lg text-xs bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
