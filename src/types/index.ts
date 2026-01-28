export interface Position {
  x: number; // 0-100 percentage
  y: number; // 0-100 percentage
}

// Event type is now a string to allow custom types
export type EventType = string;

export interface MatchEvent {
  id: string;
  videoTimestamp: number; // seconds
  playerId: number; // 1-11
  playerName: string;
  eventType: EventType;
  startLocation: Position;
  endLocation?: Position; // Optional for directional events
  createdAt: string; // ISO timestamp
}

export interface Player {
  id: number;
  name: string;
}

export const DEFAULT_PLAYERS: Player[] = [
  { id: 1, name: 'Goalkeeper' },
  { id: 2, name: 'Right Back' },
  { id: 3, name: 'Center Back' },
  { id: 4, name: 'Center Back' },
  { id: 5, name: 'Left Back' },
  { id: 6, name: 'Defensive Mid' },
  { id: 7, name: 'Right Mid' },
  { id: 8, name: 'Central Mid' },
  { id: 9, name: 'Left Mid' },
  { id: 10, name: 'Striker' },
  { id: 11, name: 'Striker' },
];

export const DEFAULT_EVENT_TYPES: string[] = [
  'Pass',
  'Shot',
  'Tackle',
  'Interception',
  'Dribble',
  'Cross',
  'Header',
  'Foul',
  'Save',
  'Goal',
];
