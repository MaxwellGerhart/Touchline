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
];

// Tactics: formation presets (11 positions, same order as DEFAULT_PLAYERS)
export type FormationId = '4-4-2' | '4-3-3' | '3-5-2' | '5-3-2' | '4-2-3-1';

// Formation positions: rotated 90° (goal on right), scaled toward center for compact layout (factor 0.72)
function compactPos(x: number, y: number): Position {
  return { x: Math.round(50 + (x - 50) * 0.72), y: Math.round(50 + (y - 50) * 0.72) };
}
const _base: Record<FormationId, Position[]> = {
  '4-4-2': [
    { x: 92, y: 50 },   { x: 85, y: 75 },   { x: 85, y: 60 },   { x: 85, y: 40 },   { x: 85, y: 25 },
    { x: 60, y: 75 },   { x: 60, y: 60 },   { x: 60, y: 40 },   { x: 60, y: 25 },
    { x: 25, y: 60 },   { x: 25, y: 40 },
  ],
  '4-3-3': [
    { x: 92, y: 50 },   { x: 85, y: 78 },   { x: 85, y: 60 },   { x: 85, y: 40 },   { x: 85, y: 22 },
    { x: 55, y: 70 },   { x: 55, y: 50 },   { x: 55, y: 30 },
    { x: 22, y: 78 },   { x: 18, y: 50 },   { x: 22, y: 22 },
  ],
  '3-5-2': [
    { x: 92, y: 50 },   { x: 85, y: 70 },   { x: 85, y: 50 },   { x: 85, y: 30 },
    { x: 62, y: 85 },   { x: 62, y: 65 },   { x: 62, y: 50 },   { x: 62, y: 35 },   { x: 62, y: 15 },
    { x: 25, y: 60 },   { x: 25, y: 40 },
  ],
  '5-3-2': [
    { x: 92, y: 50 },   { x: 82, y: 85 },   { x: 85, y: 65 },   { x: 85, y: 50 },   { x: 85, y: 35 },   { x: 82, y: 15 },
    { x: 55, y: 65 },   { x: 55, y: 50 },   { x: 55, y: 35 },
    { x: 22, y: 60 },   { x: 22, y: 40 },
  ],
  '4-2-3-1': [
    { x: 92, y: 50 },   { x: 85, y: 78 },   { x: 85, y: 60 },   { x: 85, y: 40 },   { x: 85, y: 22 },
    { x: 65, y: 65 },   { x: 65, y: 35 },
    { x: 42, y: 78 },   { x: 38, y: 50 },   { x: 42, y: 22 },
    { x: 18, y: 50 },
  ],
};
export const FORMATION_PRESETS: Record<FormationId, Position[]> = {
  '4-4-2': _base['4-4-2'].map((p) => compactPos(p.x, p.y)),
  '4-3-3': _base['4-3-3'].map((p) => compactPos(p.x, p.y)),
  '3-5-2': _base['3-5-2'].map((p) => compactPos(p.x, p.y)),
  '5-3-2': _base['5-3-2'].map((p) => compactPos(p.x, p.y)),
  '4-2-3-1': _base['4-2-3-1'].map((p) => compactPos(p.x, p.y)),
};

// Mirror position for opposition (goal on left, attack from right)
export function mirrorPosition(p: Position): Position {
  return { x: 100 - p.x, y: p.y };
}

// Tactics whiteboard: drawable and draggable items
export type TacticsTool = 'select' | 'player' | 'object' | 'area' | 'zone' | 'path' | 'arrow';

export type BoardObjectType = 'cone' | 'flag';

export type PlayerTeam = 'own' | 'opposition';

export interface TacticsPlayer {
  id: string;
  position: Position;
  number: number;
  name: string;
  team?: PlayerTeam; // default 'own'
}

export interface TacticsObject {
  id: string;
  position: Position;
  type: BoardObjectType;
}

export interface TacticsArea {
  id: string;
  points: Position[];
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface TacticsZone {
  id: string;
  type: 'rectangle' | 'ellipse';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface TacticsPath {
  id: string;
  points: Position[];
  stroke: string;
  strokeWidth: number;
}

export interface TacticsArrow {
  id: string;
  start: Position;
  end: Position;
  stroke: string;
  strokeWidth: number;
}

export interface TacticsBoardState {
  players: TacticsPlayer[];
  objects: TacticsObject[];
  areas: TacticsArea[];
  zones: TacticsZone[];
  paths: TacticsPath[];
  arrows: TacticsArrow[];
  selectedIds: string[];
}

export interface TacticsScenario {
  id: string;
  name: string;
  createdAt: string;
  state: TacticsBoardState;
}
