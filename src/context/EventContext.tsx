import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MatchEvent, EventType, Position, DEFAULT_PLAYERS, Player, DEFAULT_EVENT_TYPES, TeamId, TeamNames, DEFAULT_TEAM_NAMES, PlayerDisplayMode, Roster, RosterPlayer } from '../types';

interface EventContextType {
  events: MatchEvent[];
  addEvent: (event: Omit<MatchEvent, 'id' | 'createdAt'>) => void;
  addPlayupEvent: (passer: Player, receiver: Player, startLoc: Position, endLoc: Position, videoTime: number) => void;
  deleteEvent: (id: string) => void;
  updateEventTime: (id: string, newTimestamp: number) => void;
  clearEvents: () => void;
  selectedPlayer: number | null;
  selectedTeam: TeamId | null;
  setSelectedPlayer: (id: number | null, team?: TeamId | null) => void;
  playupReceiver: number | null;
  playupReceiverTeam: TeamId | null;
  setPlayupReceiver: (id: number | null, team?: TeamId | null) => void;
  selectedEventType: EventType | null;
  setSelectedEventType: (type: EventType | null) => void;
  startLocation: Position | null;
  setStartLocation: (pos: Position | null) => void;
  endLocation: Position | null;
  setEndLocation: (pos: Position | null) => void;
  highlightedEventId: string | null;
  setHighlightedEventId: (id: string | null) => void;
  currentVideoTime: number;
  setCurrentVideoTime: (time: number) => void;
  players: Player[];
  updatePlayerName: (id: number, name: string, team: TeamId) => void;
  addPlayer: (id: number, team: TeamId, name?: string) => void;
  removePlayer: (id: number, team: TeamId) => void;
  resetSelection: () => void;
  eventTypes: string[];
  addEventType: (type: string) => void;
  deleteEventType: (type: string) => void;
  teamNames: TeamNames;
  updateTeamName: (team: TeamId, name: string) => void;
  playerDisplayMode: PlayerDisplayMode;
  cyclePlayerDisplayMode: () => void;
  // Roster management
  rosters: Roster[];
  activeRosterId: string | null;
  activeRoster: Roster | null;
  createRoster: (name: string) => Roster;
  deleteRoster: (id: string) => void;
  renameRoster: (id: string, name: string) => void;
  addPlayerToRoster: (rosterId: string, number: number, name: string) => void;
  removePlayerFromRoster: (rosterId: string, playerId: string) => void;
  updateRosterPlayer: (rosterId: string, playerId: string, number: number, name: string) => void;
  setActiveRosterId: (id: string | null) => void;
  addRosterPlayerToTeam: (rosterPlayer: RosterPlayer, team: TeamId) => void;
  setPlayers: (players: Player[]) => void;
}




const EventContext = createContext<EventContextType | null>(null);

const STORAGE_KEY = 'touchline_events';
const PLAYERS_STORAGE_KEY = 'touchline_players';
const EVENT_TYPES_STORAGE_KEY = 'touchline_event_types';
const TEAM_NAMES_STORAGE_KEY = 'touchline_team_names';
const PLAYER_DISPLAY_MODE_STORAGE_KEY = 'touchline_player_display_mode';
const ROSTERS_STORAGE_KEY = 'touchline_rosters';
const ACTIVE_ROSTER_STORAGE_KEY = 'touchline_active_roster';

export function EventProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<MatchEvent[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  const [players, setPlayers] = useState<Player[]>(() => {
    const stored = localStorage.getItem(PLAYERS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_PLAYERS;
  });

  const [eventTypes, setEventTypes] = useState<string[]>(() => {
    const stored = localStorage.getItem(EVENT_TYPES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_EVENT_TYPES;
  });

  const [teamNames, setTeamNames] = useState<TeamNames>(() => {
    const stored = localStorage.getItem(TEAM_NAMES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_TEAM_NAMES;
  });

  const [playerDisplayMode, setPlayerDisplayMode] = useState<PlayerDisplayMode>(() => {
    const stored = localStorage.getItem(PLAYER_DISPLAY_MODE_STORAGE_KEY);
    return (stored === 'number' || stored === 'name' || stored === 'both') ? stored : 'number';
  });

  const [rosters, setRosters] = useState<Roster[]>(() => {
    const stored = localStorage.getItem(ROSTERS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  const [activeRosterId, setActiveRosterId] = useState<string | null>(() => {
    return localStorage.getItem(ACTIVE_ROSTER_STORAGE_KEY) || null;
  });

  const [selectedPlayer, setSelectedPlayerState] = useState<number | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<TeamId | null>(null);
  const [playupReceiverState, setPlayupReceiverState] = useState<number | null>(null);
  const [playupReceiverTeamState, setPlayupReceiverTeamState] = useState<TeamId | null>(null);
  const [selectedEventType, setSelectedEventType] = useState<EventType | null>(null);

  const setSelectedPlayer = useCallback((id: number | null, team?: TeamId | null) => {
    setSelectedPlayerState(id);
    setSelectedTeam(team ?? null);
  }, []);

  const setPlayupReceiver = useCallback((id: number | null, team?: TeamId | null) => {
    setPlayupReceiverState(id);
    setPlayupReceiverTeamState(team ?? null);
  }, []);

  const addPlayer = useCallback((id: number, team: TeamId, name?: string) => {
    setPlayers((prev: Player[]) => {
      // Prevent duplicate IDs within the same team
      if (prev.some(p => p.id === id && p.team === team)) return prev;
      return [...prev, { id, name: name?.trim() || `Player ${id}`, team }];
    });
  }, []);
  const [startLocation, setStartLocation] = useState<Position | null>(null);
  const [endLocation, setEndLocation] = useState<Position | null>(null);
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
  const [currentVideoTime, setCurrentVideoTime] = useState<number>(0);

  // Persist events to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }, [events]);

  // Persist players to localStorage
  useEffect(() => {
    localStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(players));
  }, [players]);

  // Persist event types to localStorage
  useEffect(() => {
    localStorage.setItem(EVENT_TYPES_STORAGE_KEY, JSON.stringify(eventTypes));
  }, [eventTypes]);

  // Persist team names to localStorage
  useEffect(() => {
    localStorage.setItem(TEAM_NAMES_STORAGE_KEY, JSON.stringify(teamNames));
  }, [teamNames]);

  // Persist player display mode to localStorage
  useEffect(() => {
    localStorage.setItem(PLAYER_DISPLAY_MODE_STORAGE_KEY, playerDisplayMode);
  }, [playerDisplayMode]);

  const cyclePlayerDisplayMode = useCallback(() => {
    setPlayerDisplayMode(prev => {
      if (prev === 'number') return 'name';
      if (prev === 'name') return 'both';
      return 'number';
    });
  }, []);

  // Persist rosters to localStorage
  useEffect(() => {
    localStorage.setItem(ROSTERS_STORAGE_KEY, JSON.stringify(rosters));
  }, [rosters]);

  // Persist active roster id to localStorage
  useEffect(() => {
    if (activeRosterId) {
      localStorage.setItem(ACTIVE_ROSTER_STORAGE_KEY, activeRosterId);
    } else {
      localStorage.removeItem(ACTIVE_ROSTER_STORAGE_KEY);
    }
  }, [activeRosterId]);

  const activeRoster = rosters.find(r => r.id === activeRosterId) || null;

  const createRoster = useCallback((name: string): Roster => {
    const newRoster: Roster = {
      id: uuidv4(),
      name: name.trim(),
      players: [],
      createdAt: new Date().toISOString(),
    };
    setRosters(prev => [...prev, newRoster]);
    return newRoster;
  }, []);

  const deleteRoster = useCallback((id: string) => {
    setRosters(prev => prev.filter(r => r.id !== id));
    if (activeRosterId === id) {
      setActiveRosterId(null);
    }
  }, [activeRosterId]);

  const renameRoster = useCallback((id: string, name: string) => {
    setRosters(prev => prev.map(r => r.id === id ? { ...r, name: name.trim() } : r));
  }, []);

  const addPlayerToRoster = useCallback((rosterId: string, number: number, name: string) => {
    setRosters(prev => prev.map(r => {
      if (r.id !== rosterId) return r;
      const newPlayer: RosterPlayer = { id: uuidv4(), number, name: name.trim() || `Player ${number}` };
      return { ...r, players: [...r.players, newPlayer] };
    }));
  }, []);

  const removePlayerFromRoster = useCallback((rosterId: string, playerId: string) => {
    setRosters(prev => prev.map(r => {
      if (r.id !== rosterId) return r;
      return { ...r, players: r.players.filter(p => p.id !== playerId) };
    }));
  }, []);

  const updateRosterPlayer = useCallback((rosterId: string, playerId: string, number: number, name: string) => {
    setRosters(prev => prev.map(r => {
      if (r.id !== rosterId) return r;
      return { ...r, players: r.players.map(p => p.id === playerId ? { ...p, number, name: name.trim() } : p) };
    }));
  }, []);

  const addRosterPlayerToTeam = useCallback((rosterPlayer: RosterPlayer, team: TeamId) => {
    setPlayers((prev: Player[]) => {
      if (prev.some(p => p.id === rosterPlayer.number && p.team === team)) return prev;
      return [...prev, { id: rosterPlayer.number, name: rosterPlayer.name, team }];
    });
  }, []);

  const addEvent = useCallback((eventData: Omit<MatchEvent, 'id' | 'createdAt'>) => {
    const newEvent: MatchEvent = {
      ...eventData,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    };
    setEvents(prev => [...prev, newEvent].sort((a, b) => a.videoTimestamp - b.videoTimestamp));
  }, []);

  const addPlayupEvent = useCallback((passer: Player, receiver: Player, startLoc: Position, endLoc: Position, videoTime: number) => {
    const now = new Date().toISOString();
    const passEvent: MatchEvent = {
      id: uuidv4(),
      videoTimestamp: videoTime,
      playerId: passer.id,
      playerName: passer.name,
      playerTeam: passer.team,
      eventType: 'Playup',
      startLocation: startLoc,
      endLocation: endLoc,
      createdAt: now,
    };
    const receiveEvent: MatchEvent = {
      id: uuidv4(),
      videoTimestamp: videoTime,
      playerId: receiver.id,
      playerName: receiver.name,
      playerTeam: receiver.team,
      eventType: 'Playup Received',
      startLocation: startLoc,
      endLocation: endLoc,
      createdAt: now,
    };
    setEvents(prev => [...prev, passEvent, receiveEvent].sort((a, b) => a.videoTimestamp - b.videoTimestamp));
  }, []);

  const deleteEvent = useCallback((id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    if (highlightedEventId === id) {
      setHighlightedEventId(null);
    }
  }, [highlightedEventId]);

  const updateEventTime = useCallback((id: string, newTimestamp: number) => {
    setEvents(prev =>
      prev
        .map(e => (e.id === id ? { ...e, videoTimestamp: Math.max(0, newTimestamp) } : e))
        .sort((a, b) => a.videoTimestamp - b.videoTimestamp)
    );
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setHighlightedEventId(null);
  }, []);

  const updatePlayerName = useCallback((id: number, name: string, team: TeamId) => {
    setPlayers(prev => prev.map(p => (p.id === id && p.team === team) ? { ...p, name } : p));
  }, []);

  const removePlayer = useCallback((id: number, team: TeamId) => {
    setPlayers(prev => prev.filter(p => !(p.id === id && p.team === team)));
    // Clear selection if the removed player was selected
    if (selectedPlayer === id && selectedTeam === team) {
      setSelectedPlayerState(null);
      setSelectedTeam(null);
    }
  }, [selectedPlayer, selectedTeam]);

  const updateTeamName = useCallback((team: TeamId, name: string) => {
    setTeamNames(prev => ({
      ...prev,
      [team === 1 ? 'team1' : 'team2']: name,
    }));
  }, []);

  const addEventType = useCallback((type: string) => {
    const trimmed = type.trim();
    if (trimmed && !eventTypes.includes(trimmed)) {
      setEventTypes(prev => [...prev, trimmed]);
    }
  }, [eventTypes]);

  const deleteEventType = useCallback((type: string) => {
    setEventTypes(prev => prev.filter(t => t !== type));
    if (selectedEventType === type) {
      setSelectedEventType(null);
    }
  }, [selectedEventType]);

  const resetSelection = useCallback(() => {
    setSelectedPlayerState(null);
    setSelectedTeam(null);
    setPlayupReceiverState(null);
    setPlayupReceiverTeamState(null);
    setSelectedEventType(null);
    setStartLocation(null);
    setEndLocation(null);
  }, []);

  return (
    <EventContext.Provider
      value={{
        events,
        addEvent,
        addPlayupEvent,
        deleteEvent,
        updateEventTime,
        clearEvents,
        selectedPlayer,
        selectedTeam,
        setSelectedPlayer,
        playupReceiver: playupReceiverState,
        playupReceiverTeam: playupReceiverTeamState,
        setPlayupReceiver,
        selectedEventType,
        setSelectedEventType,
        startLocation,
        setStartLocation,
        endLocation,
        setEndLocation,
        highlightedEventId,
        setHighlightedEventId,
        currentVideoTime,
        setCurrentVideoTime,
        players,
        updatePlayerName,
        addPlayer,
        removePlayer,
        resetSelection,
        eventTypes,
        addEventType,
        deleteEventType,
        teamNames,
        updateTeamName,
        playerDisplayMode,
        cyclePlayerDisplayMode,
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
        addRosterPlayerToTeam,
        setPlayers,
      }}
    >
      {children}
    </EventContext.Provider>
  );
}

export function useEvents() {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error('useEvents must be used within an EventProvider');
  }
  return context;
}
