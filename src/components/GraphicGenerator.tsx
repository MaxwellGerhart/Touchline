import { useState, useRef, useMemo, useCallback } from 'react';
import { Download, Upload, Image, RefreshCw } from 'lucide-react';
import { useEvents } from '../context/EventContext';
import {
  GraphicEvent,
  PlayupMapOptions,
  ShotMapOptions,
  renderPlayupMap,
  renderShotMap,
  PLAYUP_CANVAS_W,
  PLAYUP_CANVAS_H,
  SHOT_CANVAS_W,
  SHOT_CANVAS_H,
} from '../utils/pitchRenderer';

type GraphicType = 'playup' | 'shotxg';
type DataSource = 'app' | 'csv';

// ── CSV parser ──────────────────────────────────────────────────────────────

function parseCSV(text: string): GraphicEvent[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('"#') && !l.startsWith('#'));
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const idx = {
    eventType:  headers.indexOf('Event Type'),
    playerName: headers.indexOf('Player Name'),
    playerTeam: headers.indexOf('Player Team'),
    startX:     headers.indexOf('Start X'),
    startY:     headers.indexOf('Start Y'),
    endX:       headers.indexOf('End X'),
    endY:       headers.indexOf('End Y'),
  };

  if (idx.eventType < 0 || idx.startX < 0 || idx.startY < 0) return [];

  const events: GraphicEvent[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
    if (cells.length <= idx.eventType) continue;

    const startX = parseFloat(cells[idx.startX]);
    const startY = parseFloat(cells[idx.startY]);
    if (isNaN(startX) || isNaN(startY)) continue;

    events.push({
      eventType:  cells[idx.eventType] || '',
      playerName: cells[idx.playerName] || '',
      playerTeam: cells[idx.playerTeam] || '',
      startX,
      startY,
      endX: parseFloat(cells[idx.endX]) || 0,
      endY: parseFloat(cells[idx.endY]) || 0,
    });
  }
  return events;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Component
// ═══════════════════════════════════════════════════════════════════════════

export function GraphicGenerator() {
  const { events: appEvents, teamNames } = useEvents();

  // ── State ─────────────────────────────────────────────────────────────
  const [graphicType, setGraphicType] = useState<GraphicType>('playup');
  const [dataSource, setDataSource] = useState<DataSource>('app');
  const [csvEvents, setCsvEvents] = useState<GraphicEvent[]>([]);
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [customTeamName, setCustomTeamName] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [filename, setFilename] = useState('graphic.png');
  const [teamColor, setTeamColor] = useState('#001E44');
  const [sizeBy, setSizeBy] = useState<'xg' | 'distance'>('xg');
  const [generated, setGenerated] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Derived data ──────────────────────────────────────────────────────

  // Convert in-app MatchEvents → GraphicEvents
  const appGraphicEvents: GraphicEvent[] = useMemo(
    () =>
      appEvents.map(e => ({
        eventType: e.eventType,
        playerName: e.playerName,
        playerTeam: e.playerTeam,
        startX: e.startLocation.x,
        startY: e.startLocation.y,
        endX: e.endLocation?.x ?? 0,
        endY: e.endLocation?.y ?? 0,
      })),
    [appEvents],
  );

  const allEvents = dataSource === 'app' ? appGraphicEvents : csvEvents;

  // Available teams
  const teams: string[] = useMemo(() => {
    if (dataSource === 'app') {
      return [teamNames.team1 || 'Team 1', teamNames.team2 || 'Team 2'];
    }
    return [...new Set(allEvents.map(e => String(e.playerTeam)))].filter(Boolean).sort();
  }, [dataSource, allEvents, teamNames]);

  // Events filtered to the selected team
  const teamFilteredEvents: GraphicEvent[] = useMemo(() => {
    if (!selectedTeam) return allEvents;
    return allEvents.filter(e => {
      const t = String(e.playerTeam);
      // When using in-app events, team is numeric (1 or 2)
      if (dataSource === 'app') {
        if (selectedTeam === (teamNames.team1 || 'Team 1')) return t === '1';
        if (selectedTeam === (teamNames.team2 || 'Team 2')) return t === '2';
      }
      return t === selectedTeam;
    });
  }, [selectedTeam, allEvents, dataSource, teamNames]);

  // Available players from team-filtered events
  const players: string[] = useMemo(() => {
    return [...new Set(teamFilteredEvents.map(e => e.playerName))].filter(Boolean).sort();
  }, [teamFilteredEvents]);

  // Events filtered to the selected player (or all team events)
  const filteredEvents: GraphicEvent[] = useMemo(() => {
    if (!selectedPlayer) return teamFilteredEvents;
    return teamFilteredEvents.filter(e => e.playerName === selectedPlayer);
  }, [selectedPlayer, teamFilteredEvents]);

  // ── Relevant event counts ─────────────────────────────────────────────
  const playupCount = filteredEvents.filter(
    e => e.eventType.toLowerCase() === 'playup',
  ).length;
  const shotCount = filteredEvents.filter(
    e => e.eventType === 'Shot' || e.eventType === 'Goal',
  ).length;

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleCSVUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      setCsvEvents(parseCSV(text));
    };
    reader.readAsText(file);
    setDataSource('csv');
  }, []);

  const generate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const displayName = customTeamName || selectedPlayer || selectedTeam || teams[0] || 'Team';

    if (graphicType === 'playup') {
      const opts: PlayupMapOptions = {
        teamName: displayName,
        subtitle: subtitle || '',
        teamColor,
      };
      renderPlayupMap(canvas, filteredEvents, opts);
    } else {
      const opts: ShotMapOptions = {
        teamName: displayName,
        subtitle: subtitle || '',
        teamColor,
        sizeBy,
      };
      renderShotMap(canvas, filteredEvents, opts);
    }
    setGenerated(true);
  }, [graphicType, filteredEvents, selectedTeam, selectedPlayer, teams, subtitle, teamColor, sizeBy, customTeamName]);

  const exportPNG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !generated) return;
    const link = document.createElement('a');
    link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [filename, generated]);

  // ── Canvas display dimensions ─────────────────────────────────────────
  // The renderer sets canvas.width/height to logical × dpr for crispness.
  // CSS display is at logical (1×) size. Scale to fit preview area.
  const canvasW = graphicType === 'playup' ? PLAYUP_CANVAS_W : SHOT_CANVAS_W;
  const canvasH = graphicType === 'playup' ? PLAYUP_CANVAS_H : SHOT_CANVAS_H;
  const maxPreviewW = 700;
  const scale = Math.min(1, maxPreviewW / canvasW);

  // ═════════════════════════════════════════════════════════════════════
  //  Render
  // ═════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col gap-4 h-full overflow-auto p-1">
      {/* ── Settings bar ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-800">
        {/* Graphic type */}
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
          Graphic Type
          <select
            value={graphicType}
            onChange={e => { setGraphicType(e.target.value as GraphicType); setGenerated(false); }}
            className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
          >
            <option value="playup">Playup Map</option>
            <option value="shotxg">Shot / xG Map</option>
          </select>
        </label>

        {/* Data source */}
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
          Data Source
          <div className="flex items-center gap-2">
            <select
              value={dataSource}
              onChange={e => { setDataSource(e.target.value as DataSource); setGenerated(false); }}
              className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
            >
              <option value="app">In-App Events ({appEvents.length})</option>
              <option value="csv">Upload CSV</option>
            </select>
            {dataSource === 'csv' && (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {csvFileName || 'Choose CSV'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleCSVUpload}
                />
              </>
            )}
          </div>
        </label>

        {/* Team */}
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
          Team
          <select
            value={selectedTeam}
            onChange={e => { setSelectedTeam(e.target.value); setSelectedPlayer(''); setGenerated(false); }}
            className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
          >
            <option value="">All Teams</option>
            {teams.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        {/* Player */}
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
          Player
          <select
            value={selectedPlayer}
            onChange={e => { setSelectedPlayer(e.target.value); setGenerated(false); }}
            className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
          >
            <option value="">All Players</option>
            {players.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>

        {/* Team Name Override */}
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
          Team Name
          <input
            type="text"
            value={customTeamName}
            onChange={e => { setCustomTeamName(e.target.value); setGenerated(false); }}
            placeholder={selectedPlayer || selectedTeam || teams[0] || 'Team'}
            className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white w-40"
          />
        </label>

        {/* Subtitle */}
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
          Subtitle
          <input
            type="text"
            value={subtitle}
            onChange={e => { setSubtitle(e.target.value); setGenerated(false); }}
            placeholder="e.g. Spring 2026"
            className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white w-40"
          />
        </label>

        {/* Filename */}
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
          Output Filename
          <input
            type="text"
            value={filename}
            onChange={e => setFilename(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white w-44"
          />
        </label>

        {/* Team colour */}
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
          Team Color
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={teamColor}
              onChange={e => { setTeamColor(e.target.value); setGenerated(false); }}
              className="w-8 h-8 rounded border border-gray-300 dark:border-gray-700 cursor-pointer"
            />
            <span className="text-[10px] font-mono text-gray-500">{teamColor}</span>
          </div>
        </label>

        {/* Size By (shot map only) */}
        {graphicType === 'shotxg' && (
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
            Size By
            <select
              value={sizeBy}
              onChange={e => { setSizeBy(e.target.value as 'xg' | 'distance'); setGenerated(false); }}
              className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
            >
              <option value="xg">xG (Expected Goals)</option>
              <option value="distance">Shot Distance</option>
            </select>
          </label>
        )}
      </div>

      {/* ── Action buttons ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={generate}
          disabled={
            (graphicType === 'playup' && playupCount === 0) ||
            (graphicType === 'shotxg' && shotCount === 0)
          }
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Generate
        </button>

        <button
          onClick={exportPNG}
          disabled={!generated}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-navy dark:bg-rose-600 hover:bg-blue-900 dark:hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
        >
          <Download className="w-4 h-4" />
          Export PNG
        </button>

        {/* Status */}
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {graphicType === 'playup'
            ? `${playupCount} playup event${playupCount !== 1 ? 's' : ''} available`
            : `${shotCount} shot/goal event${shotCount !== 1 ? 's' : ''} available`}
        </span>
      </div>

      {/* ── Canvas preview ────────────────────────────────────────────── */}
      <div className="flex-1 flex items-start justify-center overflow-auto bg-gray-100 dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        {!generated ? (
          <div className="flex flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-600 py-20">
            <Image className="w-16 h-16 opacity-30" />
            <p className="text-sm">Configure settings above and click <strong>Generate</strong></p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            style={{
              width: canvasW * scale,
              height: canvasH * scale,
              borderRadius: 8,
              boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
            }}
          />
        )}
        {/* Hidden canvas for initial render  */}
        {!generated && (
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        )}
      </div>
    </div>
  );
}
