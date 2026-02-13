import React, { useState } from 'react';
import { Plus, X, Edit2, Check, Eye, UserPlus } from 'lucide-react';
import { useEvents } from '../context/EventContext';
import { TeamId, Player, RosterPlayer } from '../types';

export function EventRecordingPanel() {
  const {
    selectedPlayer,
    selectedTeam,
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
    removePlayer,
    teamNames,
    updateTeamName,
    playerDisplayMode,
    cyclePlayerDisplayMode,
    activeRoster,
    addRosterPlayerToTeam,
  } = useEvents();

  const [newEventType, setNewEventType] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);
  const [newPlayerNumber, setNewPlayerNumber] = useState('');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [showAddPlayerInputTeam1, setShowAddPlayerInputTeam1] = useState(false);
  const [showAddPlayerInputTeam2, setShowAddPlayerInputTeam2] = useState(false);
  const [showRosterPickerTeam1, setShowRosterPickerTeam1] = useState(false);
  const [showRosterPickerTeam2, setShowRosterPickerTeam2] = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');
  const [editingTeam, setEditingTeam] = useState<TeamId | null>(null);
  const [editTeamName, setEditTeamName] = useState('');

  const team1Players = players.filter(p => p.team === 1);
  const team2Players = players.filter(p => p.team === 2);

  // Get roster players not yet on the given team
  const getAvailableRosterPlayers = (team: TeamId) => {
    if (!activeRoster) return [];
    const teamPlayers = players.filter(p => p.team === team);
    return activeRoster.players.filter(
      rp => !teamPlayers.some(tp => tp.id === rp.number)
    );
  };

  const filteredRosterPlayers = (team: TeamId) => {
    const available = getAvailableRosterPlayers(team);
    if (!rosterSearch.trim()) return available;
    const q = rosterSearch.toLowerCase();
    return available.filter(p => p.name.toLowerCase().includes(q) || String(p.number).includes(q));
  };

  const handleAddFromRoster = (rosterPlayer: RosterPlayer, team: TeamId) => {
    addRosterPlayerToTeam(rosterPlayer, team);
  };

  const getPlayerLabel = (player: Player) => {
    switch (playerDisplayMode) {
      case 'name': return player.name;
      case 'both': return `${player.id} ${player.name}`;
      default: return String(player.id);
    }
  };

  const handleAddPlayer = (team: TeamId) => {
    const num = parseInt(newPlayerNumber.trim(), 10);
    if (!isNaN(num) && num > 0) {
      addPlayer(num, team, newPlayerName.trim() || undefined);
      setNewPlayerNumber('');
      setNewPlayerName('');
      if (team === 1) setShowAddPlayerInputTeam1(false);
      else setShowAddPlayerInputTeam2(false);
    }
  };

  const handlePlayerKeyDown = (e: React.KeyboardEvent, team: TeamId) => {
    if (e.key === 'Enter') {
      handleAddPlayer(team);
    } else if (e.key === 'Escape') {
      setNewPlayerNumber('');
      setNewPlayerName('');
      if (team === 1) setShowAddPlayerInputTeam1(false);
      else setShowAddPlayerInputTeam2(false);
    }
  };

  const handleEditTeamName = (team: TeamId) => {
    setEditingTeam(team);
    setEditTeamName(team === 1 ? teamNames.team1 : teamNames.team2);
  };

  const handleSaveTeamName = () => {
    if (editingTeam && editTeamName.trim()) {
      updateTeamName(editingTeam, editTeamName.trim());
    }
    setEditingTeam(null);
    setEditTeamName('');
  };

  const handleTeamNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTeamName();
    } else if (e.key === 'Escape') {
      setEditingTeam(null);
      setEditTeamName('');
    }
  };

  const canRecord = selectedPlayer !== null && selectedTeam !== null && selectedEventType !== null && startLocation !== null;

  const handleRecordEvent = () => {
    if (!canRecord || selectedPlayer === null || selectedTeam === null || selectedEventType === null || startLocation === null) return;

    const player = players.find(p => p.id === selectedPlayer && p.team === selectedTeam);
    if (!player) return;

    addEvent({
      videoTimestamp: currentVideoTime,
      playerId: selectedPlayer,
      playerName: player.name,
      playerTeam: selectedTeam,
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
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            Player
          </label>
          <button
            onClick={cyclePlayerDisplayMode}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            title={`Display: ${playerDisplayMode}. Click to cycle.`}
          >
            <Eye className="w-3 h-3" />
            {playerDisplayMode === 'number' ? '#' : playerDisplayMode === 'name' ? 'Aa' : '# Aa'}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {/* Team 1 Row */}
          <div className="flex items-center gap-1">
            {/* Team 1 Button */}
            {editingTeam === 1 ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={editTeamName}
                  onChange={(e) => setEditTeamName(e.target.value)}
                  onKeyDown={handleTeamNameKeyDown}
                  className="px-2 py-1 rounded text-xs w-20 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-rose"
                  autoFocus
                />
                <button
                  onClick={handleSaveTeamName}
                  className="p-1 rounded bg-green-500 text-white hover:bg-green-600"
                >
                  <Check className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleEditTeamName(1)}
                className="p-1.5 rounded text-sm font-bold bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 flex items-center gap-1 min-w-[70px] justify-center"
                title="Click to edit team name"
              >
                {teamNames.team1}
                <Edit2 className="w-3 h-3 opacity-50" />
              </button>
            )}
            {/* Team 1 Players */}
            {team1Players.map((player) => (
              <div key={`team1-${player.id}`} className="relative group">
                <button
                  onClick={() => setSelectedPlayer(
                    selectedPlayer === player.id && selectedTeam === 1 ? null : player.id,
                    selectedPlayer === player.id && selectedTeam === 1 ? null : 1
                  )}
                  className={`
                    p-1.5 rounded text-center transition-all duration-200 text-sm font-bold
                    ${selectedPlayer === player.id && selectedTeam === 1
                      ? 'bg-navy dark:bg-rose text-white ring-1 ring-navy dark:ring-rose'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }
                  `}
                  title={player.name}
                >
                  {getPlayerLabel(player)}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removePlayer(player.id, 1);
                  }}
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white hidden group-hover:flex items-center justify-center text-xs"
                  title="Remove player"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
            {showAddPlayerInputTeam1 ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={newPlayerNumber}
                  onChange={(e) => setNewPlayerNumber(e.target.value)}
                  onKeyDown={(e) => handlePlayerKeyDown(e, 1)}
                  placeholder="#"
                  className="px-2 py-1 rounded text-xs w-12 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-rose"
                  autoFocus
                />
                <input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  onKeyDown={(e) => handlePlayerKeyDown(e, 1)}
                  placeholder="Name"
                  className="px-2 py-1 rounded text-xs w-20 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-rose"
                />
                <button
                  onClick={() => handleAddPlayer(1)}
                  className="p-1 rounded bg-green-500 text-white hover:bg-green-600"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button
                  onClick={() => { setNewPlayerNumber(''); setNewPlayerName(''); setShowAddPlayerInputTeam1(false); }}
                  className="p-1 rounded bg-gray-400 text-white hover:bg-gray-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : showRosterPickerTeam1 && activeRoster ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={rosterSearch}
                    onChange={(e) => setRosterSearch(e.target.value)}
                    placeholder="Search roster..."
                    className="px-2 py-1 rounded text-xs w-28 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-rose"
                    autoFocus
                  />
                  <button
                    onClick={() => { setShowRosterPickerTeam1(false); setRosterSearch(''); }}
                    className="p-1 rounded bg-gray-400 text-white hover:bg-gray-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-auto">
                  {filteredRosterPlayers(1).map((rp) => (
                    <button
                      key={rp.id}
                      onClick={() => { handleAddFromRoster(rp, 1); }}
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800"
                      title={`${rp.number} - ${rp.name}`}
                    >
                      #{rp.number} {rp.name}
                    </button>
                  ))}
                  {filteredRosterPlayers(1).length === 0 && (
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 py-1">No available players</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                {activeRoster && (
                  <button
                    onClick={() => { setShowRosterPickerTeam1(true); setRosterSearch(''); }}
                    className="p-1.5 rounded text-sm font-bold bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 flex items-center gap-1"
                    title="Add from roster"
                  >
                    <UserPlus className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={() => setShowAddPlayerInputTeam1(true)}
                  className="p-1.5 rounded text-sm font-bold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center gap-1"
                  title="Add custom player"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Team 2 Row */}
          <div className="flex items-center gap-1">
            {/* Team 2 Button */}
            {editingTeam === 2 ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={editTeamName}
                  onChange={(e) => setEditTeamName(e.target.value)}
                  onKeyDown={handleTeamNameKeyDown}
                  className="px-2 py-1 rounded text-xs w-20 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-rose"
                  autoFocus
                />
                <button
                  onClick={handleSaveTeamName}
                  className="p-1 rounded bg-green-500 text-white hover:bg-green-600"
                >
                  <Check className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleEditTeamName(2)}
                className="p-1.5 rounded text-sm font-bold bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800 flex items-center gap-1 min-w-[70px] justify-center"
                title="Click to edit team name"
              >
                {teamNames.team2}
                <Edit2 className="w-3 h-3 opacity-50" />
              </button>
            )}
            {/* Team 2 Players */}
            {team2Players.map((player) => (
              <div key={`team2-${player.id}`} className="relative group">
                <button
                  onClick={() => setSelectedPlayer(
                    selectedPlayer === player.id && selectedTeam === 2 ? null : player.id,
                    selectedPlayer === player.id && selectedTeam === 2 ? null : 2
                  )}
                  className={`
                    p-1.5 rounded text-center transition-all duration-200 text-sm font-bold
                    ${selectedPlayer === player.id && selectedTeam === 2
                      ? 'bg-navy dark:bg-rose text-white ring-1 ring-navy dark:ring-rose'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }
                  `}
                  title={player.name}
                >
                  {getPlayerLabel(player)}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removePlayer(player.id, 2);
                  }}
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white hidden group-hover:flex items-center justify-center text-xs"
                  title="Remove player"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
            {showAddPlayerInputTeam2 ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={newPlayerNumber}
                  onChange={(e) => setNewPlayerNumber(e.target.value)}
                  onKeyDown={(e) => handlePlayerKeyDown(e, 2)}
                  placeholder="#"
                  className="px-2 py-1 rounded text-xs w-12 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-rose"
                  autoFocus
                />
                <input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  onKeyDown={(e) => handlePlayerKeyDown(e, 2)}
                  placeholder="Name"
                  className="px-2 py-1 rounded text-xs w-20 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-rose"
                />
                <button
                  onClick={() => handleAddPlayer(2)}
                  className="p-1 rounded bg-green-500 text-white hover:bg-green-600"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button
                  onClick={() => { setNewPlayerNumber(''); setNewPlayerName(''); setShowAddPlayerInputTeam2(false); }}
                  className="p-1 rounded bg-gray-400 text-white hover:bg-gray-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : showRosterPickerTeam2 && activeRoster ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={rosterSearch}
                    onChange={(e) => setRosterSearch(e.target.value)}
                    placeholder="Search roster..."
                    className="px-2 py-1 rounded text-xs w-28 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-rose"
                    autoFocus
                  />
                  <button
                    onClick={() => { setShowRosterPickerTeam2(false); setRosterSearch(''); }}
                    className="p-1 rounded bg-gray-400 text-white hover:bg-gray-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-auto">
                  {filteredRosterPlayers(2).map((rp) => (
                    <button
                      key={rp.id}
                      onClick={() => { handleAddFromRoster(rp, 2); }}
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800"
                      title={`${rp.number} - ${rp.name}`}
                    >
                      #{rp.number} {rp.name}
                    </button>
                  ))}
                  {filteredRosterPlayers(2).length === 0 && (
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 py-1">No available players</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                {activeRoster && (
                  <button
                    onClick={() => { setShowRosterPickerTeam2(true); setRosterSearch(''); }}
                    className="p-1.5 rounded text-sm font-bold bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800 flex items-center gap-1"
                    title="Add from roster"
                  >
                    <UserPlus className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={() => setShowAddPlayerInputTeam2(true)}
                  className="p-1.5 rounded text-sm font-bold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center gap-1"
                  title="Add custom player"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
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
                  p-1.5 rounded text-sm font-bold transition-all duration-200
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
              className="p-1.5 rounded text-sm font-bold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center gap-1"
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
