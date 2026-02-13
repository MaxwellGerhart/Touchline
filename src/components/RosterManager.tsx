import { useState, useRef, useEffect } from 'react';
import { Users, Plus, X, Edit2, Check, Trash2, ChevronDown } from 'lucide-react';
import { useEvents } from '../context/EventContext';
import { Roster } from '../types';

export function RosterManager() {
  const {
    rosters,
    activeRosterId,
    activeRoster,
    createRoster,
    deleteRoster,
    renameRoster,
    addPlayerToRoster,
    removePlayerFromRoster,
    updateRosterPlayer,
    setActiveRosterId,
  } = useEvents();

  const [isOpen, setIsOpen] = useState(false);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newRosterName, setNewRosterName] = useState('');
  const [editingRosterId, setEditingRosterId] = useState<string | null>(null);
  const [editRosterName, setEditRosterName] = useState('');
  const [managingRoster, setManagingRoster] = useState<Roster | null>(null);
  const [newPlayerNumber, setNewPlayerNumber] = useState('');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editPlayerNumber, setEditPlayerNumber] = useState('');
  const [editPlayerName, setEditPlayerName] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateRoster = () => {
    if (newRosterName.trim()) {
      const roster = createRoster(newRosterName.trim());
      setNewRosterName('');
      setShowCreateInput(false);
      setActiveRosterId(roster.id);
    }
  };

  const handleRenameRoster = (id: string) => {
    if (editRosterName.trim()) {
      renameRoster(id, editRosterName.trim());
    }
    setEditingRosterId(null);
    setEditRosterName('');
  };

  const handleAddPlayerToRoster = (rosterId: string) => {
    const num = parseInt(newPlayerNumber.trim(), 10);
    if (!isNaN(num) && num > 0 && newPlayerName.trim()) {
      addPlayerToRoster(rosterId, num, newPlayerName.trim());
      setNewPlayerNumber('');
      setNewPlayerName('');
    }
  };

  const handleUpdateRosterPlayer = (rosterId: string, playerId: string) => {
    const num = parseInt(editPlayerNumber.trim(), 10);
    if (!isNaN(num) && num > 0 && editPlayerName.trim()) {
      updateRosterPlayer(rosterId, playerId, num, editPlayerName.trim());
    }
    setEditingPlayerId(null);
    setEditPlayerNumber('');
    setEditPlayerName('');
  };

  // If we're managing a roster, find its latest version from state
  const currentManagedRoster = managingRoster ? rosters.find(r => r.id === managingRoster.id) || null : null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => { setIsOpen(!isOpen); setManagingRoster(null); }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700"
        title="Manage rosters"
      >
        <Users className="w-4 h-4" />
        <span className="max-w-[120px] truncate">
          {activeRoster ? activeRoster.name : 'Rosters'}
        </span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-80 max-h-[70vh] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden flex flex-col">
          {!currentManagedRoster ? (
            // Roster list view
            <>
              <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Rosters</h3>
              </div>
              <div className="flex-1 overflow-auto p-2 space-y-1">
                {rosters.length === 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
                    No rosters yet. Create one to get started.
                  </p>
                )}
                {rosters.map((roster) => (
                  <div
                    key={roster.id}
                    className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                      activeRosterId === roster.id
                        ? 'bg-navy/10 dark:bg-rose/10 ring-1 ring-navy dark:ring-rose'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {editingRosterId === roster.id ? (
                      <div className="flex items-center gap-1 flex-1">
                        <input
                          type="text"
                          value={editRosterName}
                          onChange={(e) => setEditRosterName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameRoster(roster.id);
                            if (e.key === 'Escape') { setEditingRosterId(null); setEditRosterName(''); }
                          }}
                          className="flex-1 px-2 py-1 rounded text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-rose"
                          autoFocus
                        />
                        <button onClick={() => handleRenameRoster(roster.id)} className="p-1 rounded bg-green-500 text-white hover:bg-green-600">
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setActiveRosterId(activeRosterId === roster.id ? null : roster.id);
                          }}
                          className="flex-1 text-left"
                        >
                          <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{roster.name}</div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400">{roster.players.length} players</div>
                        </button>
                        <button
                          onClick={() => setManagingRoster(roster)}
                          className="p-1 rounded text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
                          title="Manage roster"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => { setEditingRosterId(roster.id); setEditRosterName(roster.name); }}
                          className="p-1 rounded text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
                          title="Rename roster"
                        >
                          <span className="text-[10px] font-bold">Aa</span>
                        </button>
                        <button
                          onClick={() => deleteRoster(roster.id)}
                          className="p-1 rounded text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"
                          title="Delete roster"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {/* Create roster */}
              <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                {showCreateInput ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newRosterName}
                      onChange={(e) => setNewRosterName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateRoster();
                        if (e.key === 'Escape') { setNewRosterName(''); setShowCreateInput(false); }
                      }}
                      placeholder="Roster name..."
                      className="flex-1 px-2 py-1.5 rounded text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-rose"
                      autoFocus
                    />
                    <button onClick={handleCreateRoster} className="p-1.5 rounded bg-green-500 text-white hover:bg-green-600">
                      <Check className="w-3 h-3" />
                    </button>
                    <button onClick={() => { setNewRosterName(''); setShowCreateInput(false); }} className="p-1.5 rounded bg-gray-400 text-white hover:bg-gray-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCreateInput(true)}
                    className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    <Plus className="w-3 h-3" />
                    New Roster
                  </button>
                )}
              </div>
            </>
          ) : (
            // Roster detail/edit view
            <>
              <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                <button
                  onClick={() => setManagingRoster(null)}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
                >
                  <ChevronDown className="w-4 h-4 rotate-90" />
                </button>
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex-1 truncate">{currentManagedRoster.name}</h3>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">{currentManagedRoster.players.length} players</span>
              </div>
              <div className="flex-1 overflow-auto p-2 space-y-1">
                {currentManagedRoster.players.length === 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
                    No players in this roster.
                  </p>
                )}
                {currentManagedRoster.players
                  .slice()
                  .sort((a, b) => a.number - b.number)
                  .map((player) => (
                  <div key={player.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                    {editingPlayerId === player.id ? (
                      <div className="flex items-center gap-1 flex-1">
                        <input
                          type="number"
                          value={editPlayerNumber}
                          onChange={(e) => setEditPlayerNumber(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdateRosterPlayer(currentManagedRoster.id, player.id);
                            if (e.key === 'Escape') { setEditingPlayerId(null); }
                          }}
                          className="w-12 px-2 py-1 rounded text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-rose"
                        />
                        <input
                          type="text"
                          value={editPlayerName}
                          onChange={(e) => setEditPlayerName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdateRosterPlayer(currentManagedRoster.id, player.id);
                            if (e.key === 'Escape') { setEditingPlayerId(null); }
                          }}
                          className="flex-1 px-2 py-1 rounded text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-rose"
                        />
                        <button
                          onClick={() => handleUpdateRosterPlayer(currentManagedRoster.id, player.id)}
                          className="p-1 rounded bg-green-500 text-white hover:bg-green-600"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setEditingPlayerId(null)}
                          className="p-1 rounded bg-gray-400 text-white hover:bg-gray-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="w-8 text-center text-xs font-bold text-gray-800 dark:text-gray-200">#{player.number}</span>
                        <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate">{player.name}</span>
                        <button
                          onClick={() => {
                            setEditingPlayerId(player.id);
                            setEditPlayerNumber(String(player.number));
                            setEditPlayerName(player.name);
                          }}
                          className="p-1 rounded text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
                          title="Edit player"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => removePlayerFromRoster(currentManagedRoster.id, player.id)}
                          className="p-1 rounded text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"
                          title="Remove from roster"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {/* Add player to roster */}
              <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={newPlayerNumber}
                    onChange={(e) => setNewPlayerNumber(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddPlayerToRoster(currentManagedRoster.id);
                    }}
                    placeholder="#"
                    className="w-12 px-2 py-1.5 rounded text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-rose"
                  />
                  <input
                    type="text"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddPlayerToRoster(currentManagedRoster.id);
                    }}
                    placeholder="Player name..."
                    className="flex-1 px-2 py-1.5 rounded text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-navy dark:focus:ring-rose"
                  />
                  <button
                    onClick={() => handleAddPlayerToRoster(currentManagedRoster.id)}
                    className="p-1.5 rounded bg-green-500 text-white hover:bg-green-600"
                    title="Add player to roster"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
