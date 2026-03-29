import { useState, useRef, useMemo, useCallback } from 'react';
import { Download, Upload, Image, RefreshCw } from 'lucide-react';
import { useEvents } from '../context/EventContext';
import {
  GraphicEvent,
  PlayupMapOptions,
  DriveSlipMapOptions,
  ShotMapOptions,
  HeatmapOptions,
  MidRecoveriesOptions,
  FirstSecondBallMapOptions,
  XGTimelineOptions,
  XGTimelineEvent,
  MatchReportOptions,
  renderPlayupMap,
  renderDriveSlipMap,
  renderShotMap,
  renderDefensiveHeatmap,
  renderMidRecoveriesHeatmap,
  renderFirstSecondBallMap,
  renderXGTimeline,
  renderMatchReport,
  PLAYUP_CANVAS_W,
  PLAYUP_CANVAS_H,
  SHOT_CANVAS_W,
  SHOT_CANVAS_H,
  HEATMAP_CANVAS_W,
  HEATMAP_CANVAS_H,
  XG_TIMELINE_W,
  XG_TIMELINE_H,
  REPORT_CANVAS_W,
  REPORT_CANVAS_H,
} from '../utils/pitchRenderer';
import { computeShotFeatures, predictXg } from '../utils/xgModel';

type GraphicType = 'playup' | 'driveslip' | 'shotxg' | 'heatmap' | 'midrecoveries' | 'firstsecondball' | 'xgtimeline' | 'matchreport';
type DataSource = 'app' | 'csv';
type HalfSelection = '1' | '2' | 'both';

const HALF_DURATION_SEC = 45 * 60; // 2700 seconds

// ── CSV parser ──────────────────────────────────────────────────────────────

function parseCSV(text: string): GraphicEvent[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('"#') && !l.startsWith('#'));
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const idx = {
    eventType:  headers.indexOf('Event Type'),
    playerName: headers.indexOf('Player Name'),
    playerTeam: headers.indexOf('Player Team'),
    driveStartX: headers.indexOf('Drive Start X'),
    driveStartY: headers.indexOf('Drive Start Y'),
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
      driveStartX: idx.driveStartX >= 0 ? parseFloat(cells[idx.driveStartX]) || undefined : undefined,
      driveStartY: idx.driveStartY >= 0 ? parseFloat(cells[idx.driveStartY]) || undefined : undefined,
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
  const [team2Color, setTeam2Color] = useState('#C41E3A');
  const [sizeBy, setSizeBy] = useState<'xg' | 'distance'>('xg');
  const [showMidGuides, setShowMidGuides] = useState(true);
  const [showMidPlayerNames, setShowMidPlayerNames] = useState(false);
  const [midGuideColor, setMidGuideColor] = useState('#888888');
  const [midGuideStyle, setMidGuideStyle] = useState<'dotted' | 'dashed'>('dotted');
  const [midGuideWidth, setMidGuideWidth] = useState(1.5);
  const [showMidThirds, setShowMidThirds] = useState(true);
  const [showMidPenaltyLanes, setShowMidPenaltyLanes] = useState(true);
  const [firstSecondGridStyle, setFirstSecondGridStyle] = useState<'dotted' | 'dashed'>('dotted');
  const [generated, setGenerated] = useState(false);
  const [excludedEventTypes, setExcludedEventTypes] = useState<Set<string>>(new Set());
  const [halfSelection, setHalfSelection] = useState<HalfSelection>('both');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Derived data ──────────────────────────────────────────────────────

  // Filter in-app events by half selection
  const halfFilteredAppEvents = useMemo(() => {
    if (halfSelection === 'both') return appEvents;
    if (halfSelection === '1') return appEvents.filter(e => e.videoTimestamp < HALF_DURATION_SEC);
    return appEvents.filter(e => e.videoTimestamp >= HALF_DURATION_SEC);
  }, [appEvents, halfSelection]);

  // Convert in-app MatchEvents → GraphicEvents
  const appGraphicEvents: GraphicEvent[] = useMemo(
    () =>
      halfFilteredAppEvents.map(e => ({
        eventType: e.eventType,
        playerName: e.playerName,
        playerTeam: e.playerTeam,
        videoTimestamp: e.videoTimestamp,
        driveStartX: e.driveStartLocation?.x,
        driveStartY: e.driveStartLocation?.y,
        startX: e.startLocation.x,
        startY: e.startLocation.y,
        endX: e.endLocation?.x ?? 0,
        endY: e.endLocation?.y ?? 0,
      })),
    [halfFilteredAppEvents],
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

  // Mid recoveries: normalize direction by mirroring second-half in-app events.
  const midRecoveriesEvents: GraphicEvent[] = useMemo(() => {
    if (dataSource !== 'app') return filteredEvents;
    return filteredEvents.map(e => {
      if (typeof e.videoTimestamp !== 'number' || e.videoTimestamp < HALF_DURATION_SEC) {
        return e;
      }
      return {
        ...e,
        startX: 100 - e.startX,
        startY: 100 - e.startY,
        endX: 100 - e.endX,
        endY: 100 - e.endY,
      };
    });
  }, [dataSource, filteredEvents]);

  // First + Second Ball map: normalize direction by mirroring second-half in-app events.
  const firstSecondBallEvents: GraphicEvent[] = useMemo(() => {
    if (dataSource !== 'app') return filteredEvents;
    return filteredEvents.map(e => {
      if (typeof e.videoTimestamp !== 'number' || e.videoTimestamp < HALF_DURATION_SEC) {
        return e;
      }
      return {
        ...e,
        startX: 100 - e.startX,
        startY: 100 - e.startY,
        endX: 100 - e.endX,
        endY: 100 - e.endY,
      };
    });
  }, [dataSource, filteredEvents]);

  // Playup-specific filtered events: include pass events where the selected
  // player was either the passer OR the receiver (matched via coordinates).
  const playupFilteredEvents: GraphicEvent[] = useMemo(() => {
    if (!selectedPlayer) return teamFilteredEvents;

    // Start with all events already attributed to this player
    const playerEvents = teamFilteredEvents.filter(e => e.playerName === selectedPlayer);

    // Build a set of coordinate keys from this player's "Playup Received" events
    const receivedKeys = new Set<string>();
    playerEvents
      .filter(e => e.eventType.toLowerCase() === 'playup received')
      .forEach(e => {
        receivedKeys.add(`${e.startX.toFixed(2)},${e.startY.toFixed(2)},${e.endX.toFixed(2)},${e.endY.toFixed(2)}`);
      });

    // Also include pass events (from other players) that this player received
    if (receivedKeys.size > 0) {
      const passTypes = ['playup platform', 'playup aaa'];
      const extraPasses = teamFilteredEvents.filter(e => {
        if (e.playerName === selectedPlayer) return false; // already included
        if (!passTypes.includes(e.eventType.toLowerCase())) return false;
        const key = `${e.startX.toFixed(2)},${e.startY.toFixed(2)},${e.endX.toFixed(2)},${e.endY.toFixed(2)}`;
        return receivedKeys.has(key);
      });
      return [...playerEvents, ...extraPasses];
    }

    // Also check the reverse: if the player made passes, include the received events
    const passKeys = new Set<string>();
    const passTypes = ['playup platform', 'playup aaa'];
    playerEvents
      .filter(e => passTypes.includes(e.eventType.toLowerCase()))
      .forEach(e => {
        passKeys.add(`${e.startX.toFixed(2)},${e.startY.toFixed(2)},${e.endX.toFixed(2)},${e.endY.toFixed(2)}`);
      });

    if (passKeys.size > 0) {
      const extraReceived = teamFilteredEvents.filter(e => {
        if (e.playerName === selectedPlayer) return false;
        if (e.eventType.toLowerCase() !== 'playup received') return false;
        const key = `${e.startX.toFixed(2)},${e.startY.toFixed(2)},${e.endX.toFixed(2)},${e.endY.toFixed(2)}`;
        return passKeys.has(key);
      });
      return [...playerEvents, ...extraReceived];
    }

    return playerEvents;
  }, [selectedPlayer, teamFilteredEvents]);

  const driveSlipFilteredEvents: GraphicEvent[] = useMemo(() => {
    if (!selectedPlayer) return teamFilteredEvents;

    const playerEvents = teamFilteredEvents.filter(e => e.playerName === selectedPlayer);

    const receiverKeys = new Set<string>();
    playerEvents
      .filter(e => e.eventType.toLowerCase() === 'slip received')
      .forEach(e => {
        receiverKeys.add(`${(e.driveStartX ?? -1).toFixed(2)},${(e.driveStartY ?? -1).toFixed(2)},${e.startX.toFixed(2)},${e.startY.toFixed(2)},${e.endX.toFixed(2)},${e.endY.toFixed(2)}`);
      });

    if (receiverKeys.size > 0) {
      const extraDrives = teamFilteredEvents.filter(e => {
        if (e.playerName === selectedPlayer) return false;
        if (!['drive', 'slip'].includes(e.eventType.toLowerCase())) return false;
        const key = `${(e.driveStartX ?? -1).toFixed(2)},${(e.driveStartY ?? -1).toFixed(2)},${e.startX.toFixed(2)},${e.startY.toFixed(2)},${e.endX.toFixed(2)},${e.endY.toFixed(2)}`;
        return receiverKeys.has(key);
      });
      return [...playerEvents, ...extraDrives];
    }

    const driveKeys = new Set<string>();
    playerEvents
      .filter(e => ['drive', 'slip'].includes(e.eventType.toLowerCase()))
      .forEach(e => {
        driveKeys.add(`${(e.driveStartX ?? -1).toFixed(2)},${(e.driveStartY ?? -1).toFixed(2)},${e.startX.toFixed(2)},${e.startY.toFixed(2)},${e.endX.toFixed(2)},${e.endY.toFixed(2)}`);
      });

    if (driveKeys.size > 0) {
      const extraReceivers = teamFilteredEvents.filter(e => {
        if (e.playerName === selectedPlayer) return false;
        if (e.eventType.toLowerCase() !== 'slip received') return false;
        const key = `${(e.driveStartX ?? -1).toFixed(2)},${(e.driveStartY ?? -1).toFixed(2)},${e.startX.toFixed(2)},${e.startY.toFixed(2)},${e.endX.toFixed(2)},${e.endY.toFixed(2)}`;
        return driveKeys.has(key);
      });
      return [...playerEvents, ...extraReceivers];
    }

    return playerEvents;
  }, [selectedPlayer, teamFilteredEvents]);

  // ── Relevant event counts ─────────────────────────────────────────────
  const playupCount = playupFilteredEvents.filter(
    e => ['playup platform', 'playup aaa'].includes(e.eventType.toLowerCase()),
  ).length;
  const driveSlipCount = driveSlipFilteredEvents.filter(
    e => ['drive', 'slip'].includes(e.eventType.toLowerCase()),
  ).length;
  const shotCount = filteredEvents.filter(
    e => e.eventType === 'Shot' || e.eventType === 'Goal',
  ).length;
  const defCount = filteredEvents.filter(
    e => e.eventType === 'Tackle' || e.eventType === 'Interception',
  ).length;
  const midRecoveryCount = filteredEvents.filter(
    e => e.eventType.toLowerCase() === 'mid recovery',
  ).length;
  const firstSecondBallCount = filteredEvents.filter(
    e => e.eventType.toLowerCase() === 'first ball' || e.eventType.toLowerCase() === 'second ball',
  ).length;

  // Available event types for match report filter
  const availableEventTypes: string[] = useMemo(
    () => [...new Set(allEvents.map(e => e.eventType))].sort(),
    [allEvents],
  );

  // Events filtered for match report (respects excluded types)
  const reportEvents: GraphicEvent[] = useMemo(
    () => excludedEventTypes.size === 0
      ? allEvents
      : allEvents.filter(e => !excludedEventTypes.has(e.eventType)),
    [allEvents, excludedEventTypes],
  );

  const toggleReportEventType = useCallback((evType: string) => {
    setExcludedEventTypes(prev => {
      const next = new Set(prev);
      if (next.has(evType)) next.delete(evType);
      else next.add(evType);
      return next;
    });
    setGenerated(false);
  }, []);

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
      renderPlayupMap(canvas, playupFilteredEvents, opts);
    } else if (graphicType === 'driveslip') {
      const opts: DriveSlipMapOptions = {
        teamName: displayName,
        subtitle: subtitle || '',
        teamColor,
      };
      renderDriveSlipMap(canvas, driveSlipFilteredEvents, opts);
    } else if (graphicType === 'shotxg') {
      const opts: ShotMapOptions = {
        teamName: displayName,
        subtitle: subtitle || '',
        teamColor,
        sizeBy,
      };
      renderShotMap(canvas, filteredEvents, opts);
    } else if (graphicType === 'heatmap') {
      const opts: HeatmapOptions = {
        teamName: displayName,
        subtitle: subtitle || '',
        teamColor,
      };
      renderDefensiveHeatmap(canvas, filteredEvents, opts);
    } else if (graphicType === 'midrecoveries') {
      const opts: MidRecoveriesOptions = {
        teamName: displayName,
        subtitle: subtitle || '',
        teamColor,
        showGuides: showMidGuides,
        showPlayerNames: showMidPlayerNames,
        guideColor: midGuideColor,
        guideStyle: midGuideStyle,
        guideWidth: midGuideWidth,
        showThirdsGuides: showMidThirds,
        showPenaltyLaneGuides: showMidPenaltyLanes,
      };
      renderMidRecoveriesHeatmap(canvas, midRecoveriesEvents, opts);
    } else if (graphicType === 'firstsecondball') {
      const opts: FirstSecondBallMapOptions = {
        teamName: displayName,
        subtitle: subtitle || '',
        team1Id: dataSource === 'app' ? '1' : (teams[0] || ''),
        team2Id: dataSource === 'app' ? '2' : (teams[1] || ''),
        team1Name: teams[0] || teamNames.team1 || 'Team 1',
        team2Name: teams[1] || teamNames.team2 || 'Team 2',
        team1Color: teamColor,
        team2Color: team2Color,
        gridStyle: firstSecondGridStyle,
      };
      renderFirstSecondBallMap(canvas, firstSecondBallEvents, opts);
    } else if (graphicType === 'matchreport') {
      const opts: MatchReportOptions = {
        team1Name: teams[0] || teamNames.team1 || 'Team 1',
        team2Name: teams[1] || teamNames.team2 || 'Team 2',
        team1Color: teamColor,
        team2Color: team2Color,
        subtitle: subtitle || '',
      };
      renderMatchReport(canvas, reportEvents, opts);
    } else if (graphicType === 'xgtimeline') {
      // Build XGTimelineEvents from events (both teams needed for timeline)
      const sourceEvents = dataSource === 'app' ? appGraphicEvents : csvEvents;
      const xgEvents: XGTimelineEvent[] = sourceEvents
        .filter(e => e.eventType === 'Shot' || e.eventType === 'Goal')
        .map(e => {
          // Mirror shots attacking left so xG model always sees "attacking right"
          let sx = e.startX;
          let sy = e.startY;
          if (e.endX < 50) {
            sx = 100 - sx;
            sy = 100 - sy;
          }
          const { dist, angle } = computeShotFeatures(sx, sy);
          const xg = predictXg(dist, angle);
          return {
            matchMinute: 0,
            eventType: e.eventType,
            playerName: e.playerName,
            team: e.playerTeam,
            xg,
          };
        })
        .map((e, i, arr) => ({ ...e, matchMinute: ((i + 1) / arr.length) * 90 }));

      // Also use real timestamps from in-app events when available
      if (dataSource === 'app') {
        const shotAppEvents = halfFilteredAppEvents
          .filter(e => e.eventType === 'Shot' || e.eventType === 'Goal')
          .sort((a, b) => a.videoTimestamp - b.videoTimestamp);
        for (let i = 0; i < xgEvents.length && i < shotAppEvents.length; i++) {
          xgEvents[i].matchMinute = shotAppEvents[i].videoTimestamp / 60;
        }
      }

      const opts: XGTimelineOptions = {
        team1Name: teams[0] || teamNames.team1 || 'Team 1',
        team2Name: teams[1] || teamNames.team2 || 'Team 2',
        team1Color: teamColor,
        team2Color: team2Color,
        subtitle: subtitle || '',
      };
      renderXGTimeline(canvas, xgEvents, opts);
    }
    setGenerated(true);
  }, [graphicType, filteredEvents, playupFilteredEvents, driveSlipFilteredEvents, midRecoveriesEvents, firstSecondBallEvents, selectedTeam, selectedPlayer, teams, subtitle, teamColor, team2Color, sizeBy, customTeamName, teamNames, dataSource, appGraphicEvents, csvEvents, halfFilteredAppEvents, reportEvents, showMidGuides, showMidPlayerNames, midGuideColor, midGuideStyle, midGuideWidth, showMidThirds, showMidPenaltyLanes, firstSecondGridStyle]);

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

  // ── Relevant xG timeline shot count (uses all events, not team-filtered) ──
  const xgTimelineShotCount = allEvents.filter(
    e => e.eventType === 'Shot' || e.eventType === 'Goal',
  ).length;

  // ── Canvas display dimensions ─────────────────────────────────────────
  const canvasW = (graphicType === 'playup' || graphicType === 'driveslip') ? PLAYUP_CANVAS_W : graphicType === 'shotxg' ? SHOT_CANVAS_W : graphicType === 'xgtimeline' ? XG_TIMELINE_W : graphicType === 'matchreport' ? REPORT_CANVAS_W : HEATMAP_CANVAS_W;
  const canvasH = (graphicType === 'playup' || graphicType === 'driveslip') ? PLAYUP_CANVAS_H : graphicType === 'shotxg' ? SHOT_CANVAS_H : graphicType === 'xgtimeline' ? XG_TIMELINE_H : graphicType === 'matchreport' ? REPORT_CANVAS_H : HEATMAP_CANVAS_H;

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
            <option value="driveslip">Drive + Slip Map</option>
            <option value="shotxg">Shot / xG Map</option>
            <option value="heatmap">Defensive Heatmap</option>
            <option value="midrecoveries">Mid Recoveries</option>
            <option value="firstsecondball">First + Second Ball Map</option>
            <option value="xgtimeline">xG Timeline</option>
            <option value="matchreport">Match Report</option>
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

        {/* Half selection */}
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
          Half
          <select
            value={halfSelection}
            onChange={e => { setHalfSelection(e.target.value as HalfSelection); setGenerated(false); }}
            className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
          >
            <option value="both">Both Halves</option>
            <option value="1">First Half</option>
            <option value="2">Second Half</option>
          </select>
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
          {(graphicType === 'xgtimeline' || graphicType === 'matchreport') ? 'Team 1 Color' : 'Team Color'}
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

        {/* Team 2 colour (xG timeline / match report) */}
        {(graphicType === 'xgtimeline' || graphicType === 'matchreport' || graphicType === 'firstsecondball') && (
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
            Team 2 Color
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={team2Color}
                onChange={e => { setTeam2Color(e.target.value); setGenerated(false); }}
                className="w-8 h-8 rounded border border-gray-300 dark:border-gray-700 cursor-pointer"
              />
              <span className="text-[10px] font-mono text-gray-500">{team2Color}</span>
            </div>
          </label>
        )}

        {/* Event type filter (match report only) */}
        {graphicType === 'matchreport' && availableEventTypes.length > 0 && (
          <div className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
            Include Events
            <div className="flex flex-wrap gap-1.5 max-w-md">
              {availableEventTypes.map(evType => {
                const included = !excludedEventTypes.has(evType);
                return (
                  <button
                    key={evType}
                    onClick={() => toggleReportEventType(evType)}
                    className={`px-2 py-1 rounded-md text-xs font-medium border transition-colors ${
                      included
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 line-through'
                    }`}
                  >
                    {evType}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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

        {/* Mid recoveries guide config */}
        {graphicType === 'midrecoveries' && (
          <>
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={showMidGuides}
                onChange={e => { setShowMidGuides(e.target.checked); setGenerated(false); }}
                className="rounded border-gray-300 dark:border-gray-700"
              />
              Show Guide Lines
            </label>

            <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={showMidPlayerNames}
                onChange={e => { setShowMidPlayerNames(e.target.checked); setGenerated(false); }}
                className="rounded border-gray-300 dark:border-gray-700"
              />
              Show Player Names
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
              Guide Style
              <select
                value={midGuideStyle}
                onChange={e => { setMidGuideStyle(e.target.value as 'dotted' | 'dashed'); setGenerated(false); }}
                disabled={!showMidGuides}
                className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white disabled:opacity-50"
              >
                <option value="dotted">Dotted</option>
                <option value="dashed">Dashed</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
              Guide Width
              <input
                type="range"
                min={1}
                max={4}
                step={0.5}
                value={midGuideWidth}
                onChange={e => { setMidGuideWidth(Number(e.target.value)); setGenerated(false); }}
                disabled={!showMidGuides}
                className="w-28"
              />
              <span className="text-[10px] text-gray-500">{midGuideWidth.toFixed(1)} px</span>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
              Guide Color
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={midGuideColor}
                  onChange={e => { setMidGuideColor(e.target.value); setGenerated(false); }}
                  disabled={!showMidGuides}
                  className="w-8 h-8 rounded border border-gray-300 dark:border-gray-700 cursor-pointer disabled:opacity-50"
                />
                <span className="text-[10px] font-mono text-gray-500">{midGuideColor}</span>
              </div>
            </label>

            <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={showMidThirds}
                onChange={e => { setShowMidThirds(e.target.checked); setGenerated(false); }}
                disabled={!showMidGuides}
                className="rounded border-gray-300 dark:border-gray-700"
              />
              Show Vertical Thirds
            </label>

            <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={showMidPenaltyLanes}
                onChange={e => { setShowMidPenaltyLanes(e.target.checked); setGenerated(false); }}
                disabled={!showMidGuides}
                className="rounded border-gray-300 dark:border-gray-700"
              />
              Show 18-Yard Lane Lines
            </label>
          </>
        )}

        {/* First + Second Ball grid style */}
        {graphicType === 'firstsecondball' && (
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
            Grid Style
            <select
              value={firstSecondGridStyle}
              onChange={e => { setFirstSecondGridStyle(e.target.value as 'dotted' | 'dashed'); setGenerated(false); }}
              className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
            >
              <option value="dotted">Dotted</option>
              <option value="dashed">Dashed</option>
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
            (graphicType === 'driveslip' && driveSlipCount === 0) ||
            (graphicType === 'shotxg' && shotCount === 0) ||
            (graphicType === 'heatmap' && defCount === 0) ||
            (graphicType === 'midrecoveries' && midRecoveryCount === 0) ||
            (graphicType === 'firstsecondball' && firstSecondBallCount === 0) ||
            (graphicType === 'xgtimeline' && xgTimelineShotCount === 0) ||
            (graphicType === 'matchreport' && reportEvents.length === 0)
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
            : graphicType === 'driveslip'
            ? `${driveSlipCount} drive/slip event${driveSlipCount !== 1 ? 's' : ''} available`
            : graphicType === 'shotxg'
            ? `${shotCount} shot/goal event${shotCount !== 1 ? 's' : ''} available`
            : graphicType === 'xgtimeline'
            ? `${xgTimelineShotCount} shot/goal event${xgTimelineShotCount !== 1 ? 's' : ''} available`
            : graphicType === 'firstsecondball'
            ? `${firstSecondBallCount} first/second ball event${firstSecondBallCount !== 1 ? 's' : ''} available`
            : graphicType === 'matchreport'
            ? `${reportEvents.length} total event${reportEvents.length !== 1 ? 's' : ''} available`
            : graphicType === 'midrecoveries'
            ? `${midRecoveryCount} mid recovery event${midRecoveryCount !== 1 ? 's' : ''} available`
            : `${defCount} tackle/interception event${defCount !== 1 ? 's' : ''} available`}
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
              maxWidth: canvasW >= canvasH ? '600px' : '350px',
              maxHeight: '65vh',
              width: canvasW >= canvasH ? '100%' : 'auto',
              height: canvasW >= canvasH ? 'auto' : '65vh',
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
