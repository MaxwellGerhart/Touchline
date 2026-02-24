export type PlayerDisplayMode = 'number' | 'name' | 'both';

export interface Position {
  x: number; // 0-100 percentage
  y: number; // 0-100 percentage
}

// Event type is now a string to allow custom types
export type EventType = string;

/** Which end of the drill area a goal sits on */
export type GoalEnd = 'left' | 'right';

/** A session groups drill config + events together */
export interface Session {
  id: string;
  name: string;
  drillType: string;
  area: DrillRectangle | null;
  /** Which goal Team 1 is attacking */
  team1Goal: GoalEnd;
  /** Which goal Team 2 is attacking */
  team2Goal: GoalEnd;
  createdAt: string; // ISO timestamp
}

export interface MatchEvent {
  id: string;
  videoTimestamp: number; // seconds
  playerId: number; // 1-11
  playerName: string;
  playerTeam: TeamId;
  eventType: EventType;
  startLocation: Position;
  endLocation?: Position; // Optional for directional events
  drillType?: string;                 // Drill type when event was recorded
  sessionId?: string;                 // Session that owns this event
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
  'Playup Platform',
  'Playup AAA',
];

  // Roster management
  export interface RosterPlayer {
    id: string;
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



/**
 * Compute distance-to-goal for a position.
 *
 * X becomes abs(raw.x − goal edge of drill area).
 * Y is kept unchanged.
 *
 * @param goalSide – which end has the goal ('left' | 'right')
 */
export function distanceToGoal(
  raw: Position,
  drillArea: DrillRectangle,
  goalSide: 'left' | 'right',
): Position {
  const goalEdge = goalSide === 'right'
    ? drillArea.x + drillArea.width
    : drillArea.x;

  return {
    x: Math.abs(raw.x - goalEdge),
    y: raw.y,
  };
}

