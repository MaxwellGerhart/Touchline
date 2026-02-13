export type PlayerDisplayMode = 'number' | 'name' | 'both';

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
  playerTeam: TeamId;
  eventType: EventType;
  startLocation: Position;
  endLocation?: Position; // Optional for directional events
  normalizedStartLocation?: Position; // Game-equivalent coordinates (mapped from drill area)
  normalizedEndLocation?: Position;   // Game-equivalent coordinates (mapped from drill area)
  drillType?: string;                 // Drill type when event was recorded
  createdAt: string; // ISO timestamp
}

export type TeamId = 1 | 2;

export interface Player {
  id: number;
  name: string;
  team: TeamId;
}

export interface TeamNames {
  team1: string;
  team2: string;
}

export const DEFAULT_TEAM_NAMES: TeamNames = {
  team1: 'Team 1',
  team2: 'Team 2',
};

export const DEFAULT_PLAYERS: Player[] = [
  { id: 1, name: 'Goalkeeper', team: 1 },
  { id: 2, name: 'Right Back', team: 1 },
  { id: 3, name: 'Center Back', team: 1 },
  { id: 4, name: 'Center Back', team: 1 },
  { id: 5, name: 'Left Back', team: 1 },
  { id: 6, name: 'Defensive Mid', team: 1 },
  { id: 7, name: 'Right Mid', team: 1 },
  { id: 8, name: 'Central Mid', team: 1 },
  { id: 9, name: 'Left Mid', team: 1 },
  { id: 10, name: 'Striker', team: 1 },
  { id: 11, name: 'Striker', team: 1 },
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
  'Playup',
];

  // Roster management
  export interface RosterPlayer {
    number: number;
    name: string;
  }

export interface Roster {
  id: string;
  name: string;
  players: RosterPlayer[];
  createdAt: string;
}

// Drill area types
export interface DrillRectangle {
  x: number;      // 0-100 percentage, top-left X on pitch
  y: number;      // 0-100 percentage, top-left Y on pitch
  width: number;  // 0-100 percentage
  height: number; // 0-100 percentage
}

export interface DrillConfig {
  drillType: string;
  area: DrillRectangle | null;
}

export const DEFAULT_DRILL_CONFIG: DrillConfig = {
  drillType: '',
  area: null,
};

/**
 * Normalize a raw pitch position (0-100) into canonical full-pitch coordinates
 * based on the drill rectangle. This maps the drill area onto the full pitch.
 */
export function normalizePosition(raw: Position, drillArea: DrillRectangle): Position {
  const relX = (raw.x - drillArea.x) / drillArea.width;
  const relY = (raw.y - drillArea.y) / drillArea.height;
  return {
    x: Math.max(0, Math.min(100, relX * 100)),
    y: Math.max(0, Math.min(100, relY * 100)),
  };
}

