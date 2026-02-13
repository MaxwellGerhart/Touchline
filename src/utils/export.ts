import { MatchEvent, Session } from '../types';
import { formatTimestamp, formatDate } from './formatters';

export function exportToCSV(events: MatchEvent[], session?: Session | null): void {
  if (events.length === 0) {
    alert('No events to export');
    return;
  }

  const headers = [
    'ID',
    'Video Timestamp',
    'Video Time (MM:SS)',
    'Player ID',
    'Player Name',
    'Player Team',
    'Event Type',
    'Start X',
    'Start Y',
    'End X',
    'End Y',
    'Drill Type',
    'Session ID',
    'Created At',
  ];

  const rows = events.map(event => [
    event.id,
    event.videoTimestamp.toFixed(2),
    formatTimestamp(event.videoTimestamp),
    event.playerId,
    event.playerName,
    event.playerTeam,
    event.eventType,
    event.startLocation.x.toFixed(2),
    event.startLocation.y.toFixed(2),
    event.endLocation?.x.toFixed(2) ?? '',
    event.endLocation?.y.toFixed(2) ?? '',
    event.drillType ?? '',
    event.sessionId ?? '',
    event.createdAt,
  ]);

  // Build metadata header rows for the drill config / session
  const metaLines: string[] = [];
  if (session) {
    metaLines.push(`"# Session","${session.name}","# Session ID","${session.id}"`);
    metaLines.push(`"# Team 1 Goal","${session.team1Goal}","# Team 2 Goal","${session.team2Goal}","# Created At","${session.createdAt}"`);
    if (session.drillType) {
      metaLines.push(`"# Drill Type","${session.drillType}"`);
    }
    if (session.area) {
      metaLines.push(`"# Drill Area X","${session.area.x.toFixed(2)}","# Drill Area Y","${session.area.y.toFixed(2)}","# Drill Area Width","${session.area.width.toFixed(2)}","# Drill Area Height","${session.area.height.toFixed(2)}"`);
    }
    metaLines.push(''); // blank line separator
  }

  const csvContent = [
    ...metaLines,
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `touchline-events-${formatDate(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
