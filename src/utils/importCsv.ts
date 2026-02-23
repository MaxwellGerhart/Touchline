import { MatchEvent, TeamId, Position } from '../types';
import { v4 as uuidv4 } from 'uuid';

export interface ImportResult {
  events: MatchEvent[];
  error?: string;
}

const REQUIRED_COLUMNS = [
  'Video Timestamp',
  'Player ID',
  'Player Name',
  'Player Team',
  'Event Type',
  'Start X',
  'Start Y',
];

/**
 * Parse a single CSV line, handling quoted fields with escaped double-quotes.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * Parse a CSV string (matching the Touchline export format) into MatchEvent[].
 *
 * - Skips metadata rows that start with `#`.
 * - Validates that all required columns are present.
 * - Returns an error message if the CSV is malformed.
 */
export function parseCSV(csvText: string): ImportResult {
  const rawLines = csvText.trim().split(/\r?\n/);

  // Strip metadata rows (lines starting with `"#` or `#`)
  const lines = rawLines.filter(line => {
    const trimmed = line.trim();
    return trimmed !== '' && !trimmed.startsWith('"#') && !trimmed.startsWith('#');
  });

  if (lines.length < 2) {
    return { events: [], error: 'CSV file is empty or has no data rows.' };
  }

  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  const headerMap: Record<string, number> = {};
  headers.forEach((h, i) => {
    headerMap[h] = i;
  });

  const missing = REQUIRED_COLUMNS.filter(col => !(col in headerMap));
  if (missing.length > 0) {
    return {
      events: [],
      error: `CSV is missing required column(s): ${missing.join(', ')}`,
    };
  }

  const get = (cols: string[], col: string): string => {
    const idx = headerMap[col];
    return idx !== undefined && cols[idx] !== undefined ? cols[idx].trim() : '';
  };

  const events: MatchEvent[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);

    const videoTimestampRaw = get(cols, 'Video Timestamp');
    const videoTimestamp = parseFloat(videoTimestampRaw);
    if (isNaN(videoTimestamp)) {
      return {
        events: [],
        error: `Row ${i + 1}: Invalid video timestamp "${videoTimestampRaw}".`,
      };
    }

    const playerIdRaw = get(cols, 'Player ID');
    const playerId = parseInt(playerIdRaw, 10);
    if (isNaN(playerId)) {
      return {
        events: [],
        error: `Row ${i + 1}: Invalid player ID "${playerIdRaw}".`,
      };
    }

    const playerTeamRaw = get(cols, 'Player Team');
    const playerTeam = parseInt(playerTeamRaw, 10) as TeamId;
    if (playerTeam !== 1 && playerTeam !== 2) {
      return {
        events: [],
        error: `Row ${i + 1}: Invalid player team "${playerTeamRaw}". Must be 1 or 2.`,
      };
    }

    const startX = parseFloat(get(cols, 'Start X'));
    const startY = parseFloat(get(cols, 'Start Y'));
    if (isNaN(startX) || isNaN(startY)) {
      return {
        events: [],
        error: `Row ${i + 1}: Invalid start location coordinates.`,
      };
    }

    const startLocation: Position = { x: startX, y: startY };

    let endLocation: Position | undefined;
    const endXRaw = get(cols, 'End X');
    const endYRaw = get(cols, 'End Y');
    if (endXRaw !== '' && endYRaw !== '') {
      const endX = parseFloat(endXRaw);
      const endY = parseFloat(endYRaw);
      if (!isNaN(endX) && !isNaN(endY)) {
        endLocation = { x: endX, y: endY };
      }
    }

    const event: MatchEvent = {
      id: uuidv4(), // Always assign new IDs to avoid collisions
      videoTimestamp,
      playerId,
      playerName: get(cols, 'Player Name'),
      playerTeam,
      eventType: get(cols, 'Event Type'),
      startLocation,
      endLocation,
      drillType: get(cols, 'Drill Type') || undefined,
      sessionId: get(cols, 'Session ID') || undefined,
      createdAt: get(cols, 'Created At') || new Date().toISOString(),
    };

    events.push(event);
  }

  return { events };
}

/**
 * Merge imported events into an existing list by appending all of them.
 *
 * Returns the count of added events.
 */
export function mergeEvents(
  existingEvents: MatchEvent[],
  importedEvents: MatchEvent[],
): { merged: MatchEvent[]; added: number; skipped: number } {
  return {
    merged: [...existingEvents, ...importedEvents],
    added: importedEvents.length,
    skipped: 0,
  };
}

/**
 * Extract unique players from imported events that don't exist in the current
 * player list for the given team.
 */
export function findNewPlayers(
  importedEvents: MatchEvent[],
  existingPlayers: { id: number; team: TeamId }[],
): { id: number; name: string; team: TeamId }[] {
  const existingSet = new Set(
    existingPlayers.map(p => `${p.id}|${p.team}`),
  );

  const seen = new Set<string>();
  const newPlayers: { id: number; name: string; team: TeamId }[] = [];

  for (const event of importedEvents) {
    const key = `${event.playerId}|${event.playerTeam}`;
    if (!existingSet.has(key) && !seen.has(key)) {
      seen.add(key);
      newPlayers.push({
        id: event.playerId,
        name: event.playerName,
        team: event.playerTeam,
      });
    }
  }

  return newPlayers;
}
