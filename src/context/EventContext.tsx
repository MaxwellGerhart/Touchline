import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MatchEvent, EventType, Position, DEFAULT_PLAYERS, Player, DEFAULT_EVENT_TYPES, TeamId, TeamNames, DEFAULT_TEAM_NAMES } from '../types';

interface EventContextType {
  events: MatchEvent[];
  addEvent: (event: Omit<MatchEvent, 'id' | 'createdAt'>) => void;
  deleteEvent: (id: string) => void;
  clearEvents: () => void;
  selectedPlayer: number | null;
  selectedTeam: TeamId | null;
  setSelectedPlayer: (id: number | null, team?: TeamId | null) => void;
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
}




const EventContext = createContext<EventContextType | null>(null);

const STORAGE_KEY = 'touchline_events';
const PLAYERS_STORAGE_KEY = 'touchline_players';
const EVENT_TYPES_STORAGE_KEY = 'touchline_event_types';
const TEAM_NAMES_STORAGE_KEY = 'touchline_team_names';

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

  const [selectedPlayer, setSelectedPlayerState] = useState<number | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<TeamId | null>(null);
  const [selectedEventType, setSelectedEventType] = useState<EventType | null>(null);

  const setSelectedPlayer = useCallback((id: number | null, team?: TeamId | null) => {
    setSelectedPlayerState(id);
    setSelectedTeam(team ?? null);
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

  const addEvent = useCallback((eventData: Omit<MatchEvent, 'id' | 'createdAt'>) => {
    const newEvent: MatchEvent = {
      ...eventData,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    };
    setEvents(prev => [...prev, newEvent].sort((a, b) => a.videoTimestamp - b.videoTimestamp));
  }, []);

  const deleteEvent = useCallback((id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    if (highlightedEventId === id) {
      setHighlightedEventId(null);
    }
  }, [highlightedEventId]);

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
    setSelectedEventType(null);
    setStartLocation(null);
    setEndLocation(null);
  }, []);

  return (
    <EventContext.Provider
      value={{
        events,
        addEvent,
        deleteEvent,
        clearEvents,
        selectedPlayer,
        selectedTeam,
        setSelectedPlayer,
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
