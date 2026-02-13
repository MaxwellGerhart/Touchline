import { MatchEvent, DrillConfig } from '../types';
import { formatTimestamp, formatDate } from './formatters';

export function exportToCSV(events: MatchEvent[], drillConfig?: DrillConfig): void {
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
    'Normalized Start X',
    'Normalized Start Y',
    'Normalized End X',
    'Normalized End Y',
    'Drill Type',
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
    event.normalizedStartLocation?.x.toFixed(2) ?? '',
    event.normalizedStartLocation?.y.toFixed(2) ?? '',
    event.normalizedEndLocation?.x.toFixed(2) ?? '',
    event.normalizedEndLocation?.y.toFixed(2) ?? '',
    event.drillType ?? '',
    event.createdAt,
  ]);

  // Build metadata header rows for the drill config
  const metaLines: string[] = [];
  if (drillConfig && (drillConfig.drillType || drillConfig.area)) {
    metaLines.push(`"# Drill Type","${drillConfig.drillType || ''}"`);
    if (drillConfig.area) {
      metaLines.push(`"# Drill Area X","${drillConfig.area.x.toFixed(2)}","# Drill Area Y","${drillConfig.area.y.toFixed(2)}","# Drill Area Width","${drillConfig.area.width.toFixed(2)}","# Drill Area Height","${drillConfig.area.height.toFixed(2)}"`);
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
