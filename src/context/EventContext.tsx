import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MatchEvent, EventType, Position, DEFAULT_PLAYERS, Player, DEFAULT_EVENT_TYPES } from '../types';

interface EventContextType {
  events: MatchEvent[];
  addEvent: (event: Omit<MatchEvent, 'id' | 'createdAt'>) => void;
  deleteEvent: (id: string) => void;
  clearEvents: () => void;
  selectedPlayer: number | null;
  setSelectedPlayer: (id: number | null) => void;
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
  updatePlayerName: (id: number, name: string) => void;
  addPlayer: (name: string) => void;
  resetSelection: () => void;
  eventTypes: string[];
  addEventType: (type: string) => void;
  deleteEventType: (type: string) => void;
}




const EventContext = createContext<EventContextType | null>(null);

const STORAGE_KEY = 'touchline_events';
const PLAYERS_STORAGE_KEY = 'touchline_players';
const EVENT_TYPES_STORAGE_KEY = 'touchline_event_types';

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

  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [selectedEventType, setSelectedEventType] = useState<EventType | null>(null);

  const addPlayer = useCallback((name: string) => {
    setPlayers((prev: Player[]) => {
      const nextId = prev.length > 0 ? Math.max(...prev.map((p: Player) => p.id)) + 1 : 1;
      return [...prev, { id: nextId, name: name || `Player ${nextId}` }];
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

  const updatePlayerName = useCallback((id: number, name: string) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, name } : p));
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
    setSelectedPlayer(null);
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
        resetSelection,
        eventTypes,
        addEventType,
        deleteEventType,
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
