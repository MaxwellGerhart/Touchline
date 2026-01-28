import { MatchEvent } from '../types';
import { formatTimestamp, formatDate } from './formatters';

export function exportToCSV(events: MatchEvent[]): void {
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
    'Event Type',
    'Start X',
    'Start Y',
    'End X',
    'End Y',
    'Created At',
  ];

  const rows = events.map(event => [
    event.id,
    event.videoTimestamp.toFixed(2),
    formatTimestamp(event.videoTimestamp),
    event.playerId,
    event.playerName,
    event.eventType,
    event.startLocation.x.toFixed(2),
    event.startLocation.y.toFixed(2),
    event.endLocation?.x.toFixed(2) ?? '',
    event.endLocation?.y.toFixed(2) ?? '',
    event.createdAt,
  ]);

  const csvContent = [
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
