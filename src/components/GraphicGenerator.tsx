import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Download, Upload, Image, RefreshCw, FileText } from 'lucide-react';
import { useEvents } from '../context/EventContext';
import {
  GraphicEvent,
  PlayupMapOptions,
  DriveSlipMapOptions,
  EventSequenceMapOptions,
  EventSequenceStyle,
  EventSequenceLineStyle,
  ShotMapOptions,
  CrossMapOptions,
  HeatmapOptions,
  MidRecoveriesOptions,
  FirstSecondBallMapOptions,
  XGTimelineOptions,
  XGTimelineEvent,
  MatchReportOptions,
  renderPlayupMap,
  renderDriveSlipMap,
  renderEventSequenceMap,
  renderShotMap,
  renderCrossMap,
  renderDefensiveHeatmap,
  renderMidRecoveriesHeatmap,
  renderFirstSecondBallMap,
  renderXGTimeline,
  renderMatchReport,
  PLAYUP_CANVAS_W,
  PLAYUP_CANVAS_H,
  CROSS_CANVAS_W,
  CROSS_CANVAS_H,
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
import { buildSequenceRenderData } from '../utils/sequences';
import { generateMatchReportPDF } from '../utils/pdfExport';

type GraphicType = 'playup' | 'driveslip' | 'eventsequence' | 'shotxg' | 'crossmap' | 'heatmap' | 'midrecoveries' | 'firstsecondball' | 'xgtimeline' | 'matchreport';
type DataSource = 'app' | 'csv';
type HalfSelection = '1' | '2' | 'both';

const HALF_DURATION_SEC = 45 * 60; // 2700 seconds

// ── CSV parser ──────────────────────────────────────────────────────────────

function parseCSV(text: string): GraphicEvent[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('"#') && !l.startsWith('#'));
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const idx = {
    videoTimestamp: headers.indexOf('Video Timestamp'),
    playerId: headers.indexOf('Player ID'),
    eventType:  headers.indexOf('Event Type'),
    playerName: headers.indexOf('Player Name'),
    playerTeam: headers.indexOf('Player Team'),
    sequenceId: headers.indexOf('Sequence ID'),
    parentEventId: headers.indexOf('Parent Event ID'),
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
      videoTimestamp: idx.videoTimestamp >= 0 ? parseFloat(cells[idx.videoTimestamp]) || undefined : undefined,
      playerId: idx.playerId >= 0 ? parseInt(cells[idx.playerId], 10) || undefined : undefined,
      eventType:  cells[idx.eventType] || '',
      playerName: cells[idx.playerName] || '',
      playerTeam: cells[idx.playerTeam] || '',
      sequenceId: idx.sequenceId >= 0 ? (cells[idx.sequenceId] || undefined) : undefined,
      parentEventId: idx.parentEventId >= 0 ? (cells[idx.parentEventId] || undefined) : undefined,
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
  const [selectedSequenceIds, setSelectedSequenceIds] = useState<string[]>([]);
  const [includePlayupsInSequenceMap, setIncludePlayupsInSequenceMap] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [excludedEventTypes, setExcludedEventTypes] = useState<Set<string>>(new Set());
  const [halfSelection, setHalfSelection] = useState<HalfSelection>('both');
  const [eventSequenceStyles, setEventSequenceStyles] = useState<Record<string, EventSequenceStyle>>({});
  const [pdfPlots, setPdfPlots] = useState<Set<string>>(new Set());
  const [showPdfOptions, setShowPdfOptions] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [exportScale, setExportScale] = useState(2.5);

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
        playerId: e.playerId,
        playerName: e.playerName,
        playerTeam: e.playerTeam,
        videoTimestamp: e.videoTimestamp,
        sequenceId: e.sequenceId,
        parentEventId: e.parentEventId,
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

  const getExplicitSequenceKey = useCallback((event: GraphicEvent): string | undefined => {
    if (event.sequenceId) return event.sequenceId;
    if (event.parentEventId) return `chain-${event.parentEventId}`;
    return undefined;
  }, []);

  const inferredSequenceKeys = useMemo(() => {
    const directional = teamFilteredEvents.filter(e => !(e.endX === 0 && e.endY === 0));
    const keys: Array<string | undefined> = directional.map(ev => getExplicitSequenceKey(ev));
    const keyByEvent = new Map<GraphicEvent, string>();

    const samePoint = (ax: number, ay: number, bx: number, by: number) =>
      Math.abs(ax - bx) <= 0.01 && Math.abs(ay - by) <= 0.01;

    for (let i = 0; i < directional.length; i++) {
      if (keys[i]) continue;

      let bestPred = -1;
      let bestDelta = Number.POSITIVE_INFINITY;
      for (let j = 0; j < i; j++) {
        const pred = directional[j];
        const curr = directional[i];
        if (!samePoint(pred.endX, pred.endY, curr.startX, curr.startY)) continue;
        const dt = Math.abs((curr.videoTimestamp ?? i) - (pred.videoTimestamp ?? j));
        if (dt < bestDelta) {
          bestDelta = dt;
          bestPred = j;
        }
      }

      if (bestPred >= 0) {
        const predKey = keys[bestPred] || `infer-${bestPred}`;
        keys[bestPred] = predKey;
        keys[i] = predKey;
      }
    }

    for (let i = 0; i < directional.length; i++) {
      if (keys[i]) continue;
      for (let j = i + 1; j < directional.length; j++) {
        const curr = directional[i];
        const next = directional[j];
        if (samePoint(curr.endX, curr.endY, next.startX, next.startY) && keys[j]) {
          keys[i] = keys[j];
          break;
        }
      }
    }

    for (let i = 0; i < directional.length; i++) {
      if (keys[i]) {
        keyByEvent.set(directional[i], keys[i]!);
      }
    }

    return keyByEvent;
  }, [teamFilteredEvents, getExplicitSequenceKey]);

  const getSequenceKey = useCallback((event: GraphicEvent): string | undefined => {
    const explicitOrInferred = getExplicitSequenceKey(event) || inferredSequenceKeys.get(event);
    if (explicitOrInferred) return explicitOrInferred;
    if (!includePlayupsInSequenceMap) return undefined;

    const normalizedType = event.eventType.toLowerCase();
    const isPlayupType = normalizedType === 'playup platform' || normalizedType === 'playup aaa' || normalizedType === 'playup received';
    if (!isPlayupType) return undefined;

    const ts = (event.videoTimestamp ?? 0).toFixed(2);
    return [
      'playup',
      ts,
      event.startX.toFixed(2),
      event.startY.toFixed(2),
      event.endX.toFixed(2),
      event.endY.toFixed(2),
      String(event.playerTeam),
    ].join(':');
  }, [getExplicitSequenceKey, inferredSequenceKeys, includePlayupsInSequenceMap]);

  const eventSequenceSourceEvents: GraphicEvent[] = useMemo(() => {
    if (!selectedPlayer) return teamFilteredEvents;

    const playerEvents = teamFilteredEvents.filter(e => e.playerName === selectedPlayer);
    const playerSequenceKeys = new Set(
      playerEvents
        .map(e => getSequenceKey(e))
        .filter((k): k is string => !!k)
    );

    if (playerSequenceKeys.size === 0) return playerEvents;

    return teamFilteredEvents.filter(e => {
      const key = getSequenceKey(e);
      return (key ? playerSequenceKeys.has(key) : false) || e.playerName === selectedPlayer;
    });
  }, [selectedPlayer, teamFilteredEvents, getSequenceKey]);

  const sequencedEvents: GraphicEvent[] = useMemo(() => {
    return eventSequenceSourceEvents.filter(e => !!getSequenceKey(e));
  }, [eventSequenceSourceEvents, getSequenceKey]);

  const sequenceOptions: Array<{ id: string; label: string }> = useMemo(() => {
    const grouped = new Map<string, GraphicEvent[]>();
    for (const ev of sequencedEvents) {
      const key = getSequenceKey(ev);
      if (!key) continue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(ev);
    }

    return [...grouped.entries()]
      .map(([id, seqEvents]) => {
        const sorted = [...seqEvents].sort((a, b) => (a.videoTimestamp ?? 0) - (b.videoTimestamp ?? 0));
        const first = sorted[0];
        const firstStamp = typeof first?.videoTimestamp === 'number'
          ? `${Math.floor(first.videoTimestamp / 60)}:${String(Math.floor(first.videoTimestamp % 60)).padStart(2, '0')}`
          : 'n/a';
        const label = `${firstStamp} - ${first?.playerName || 'Player'} (${seqEvents.length})`;
        return { id, label };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [sequencedEvents, getSequenceKey]);

  const eventSequenceEvents: GraphicEvent[] = useMemo(() => {
    const selectedSet = new Set(selectedSequenceIds);
    const source = selectedSet.size === 0
      ? sequencedEvents
      : sequencedEvents.filter(e => {
          const key = getSequenceKey(e);
          return key ? selectedSet.has(key) : false;
        });
    const keyedSource = source.map(e => {
      const key = getSequenceKey(e);
      if (!key || e.sequenceId === key) return e;
      return { ...e, sequenceId: key };
    });
    const directional = keyedSource.filter(e => !(e.endX === 0 && e.endY === 0));

    // Normalize direction by mirroring second-half in-app events.
    if (dataSource !== 'app') return directional;
    return directional.map(e => {
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
  }, [sequencedEvents, selectedSequenceIds, getSequenceKey, dataSource]);

  const eventSequenceRenderData = useMemo(() => {
    return buildSequenceRenderData(eventSequenceEvents, getSequenceKey);
  }, [eventSequenceEvents, getSequenceKey]);

  useEffect(() => {
    setSelectedSequenceIds(prev => {
      if (prev.length === 0) return prev;
      const available = new Set(sequenceOptions.map(s => s.id));
      const next = prev.filter(id => available.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [sequenceOptions]);

  const eventSequenceTypes: string[] = useMemo(() => {
    return [...new Set(eventSequenceEvents.map(e => e.eventType))].sort();
  }, [eventSequenceEvents]);

  const selectedSequenceLabel = useMemo(() => {
    if (selectedSequenceIds.length === 0) {
      return `All Sequences (${sequenceOptions.length})`;
    }
    return `${selectedSequenceIds.length} selected`;
  }, [selectedSequenceIds, sequenceOptions]);

  const buildDefaultSequenceStyle = useCallback((eventType: string): EventSequenceStyle => {
    const typeNormalized = eventType.toLowerCase();
    
    // Predefined defaults for common event types
    const defaults: Record<string, EventSequenceStyle> = {
      'dribble': { color: '#888888', lineStyle: 'dotted', lineWidth: 6 },
      'pass': { color: '#001E44', lineStyle: 'solid', lineWidth: 6 },
      'playup platform': { color: '#4A90E2', lineStyle: 'solid', lineWidth: 6 },
      'playup aaa': { color: '#4A90E2', lineStyle: 'solid', lineWidth: 6 },
      'playup received': { color: '#87CEEB', lineStyle: 'solid', lineWidth: 6 },
      'shot': { color: '#E74C3C', lineStyle: 'solid', lineWidth: 6 },
    };
    
    if (defaults[typeNormalized]) {
      return defaults[typeNormalized];
    }
    
    // Fallback for unknown types: use hash-based palette
    const palette = ['#001E44', '#C41E3A', '#2E8B57', '#8B5CF6', '#0EA5E9', '#F59E0B', '#14B8A6', '#EF4444'];
    let hash = 0;
    for (let i = 0; i < eventType.length; i++) {
      hash = ((hash << 5) - hash) + eventType.charCodeAt(i);
      hash |= 0;
    }
    const color = palette[Math.abs(hash) % palette.length];
    return {
      color,
      lineStyle: 'solid',
      lineWidth: 6,
    };
  }, []);

  useEffect(() => {
    if (eventSequenceTypes.length === 0) return;
    setEventSequenceStyles(prev => {
      const next = { ...prev };
      let changed = false;
      for (const eventType of eventSequenceTypes) {
        if (!next[eventType]) {
          next[eventType] = buildDefaultSequenceStyle(eventType);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [eventSequenceTypes, buildDefaultSequenceStyle]);

  const updateEventSequenceStyle = useCallback((eventType: string, patch: Partial<EventSequenceStyle>) => {
    setEventSequenceStyles(prev => ({
      ...prev,
      [eventType]: {
        ...(prev[eventType] || buildDefaultSequenceStyle(eventType)),
        ...patch,
        lineWidth: 6,
      },
    }));
    setGenerated(false);
  }, [buildDefaultSequenceStyle]);

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

    // Start with all events from the selected player
    const playerEvents = teamFilteredEvents.filter(e => e.playerName === selectedPlayer);

    // Find all passes FROM the selected player and get their corresponding received events
    const playupPassTypes = ['playup platform', 'playup aaa'];
    const passesFromPlayer = playerEvents.filter(e => playupPassTypes.includes(e.eventType.toLowerCase()));
    
    // Build a set of coordinate keys from passes the player made
    const passKeys = new Set<string>();
    passesFromPlayer.forEach(e => {
      passKeys.add(`${e.startX.toFixed(2)},${e.startY.toFixed(2)},${e.endX.toFixed(2)},${e.endY.toFixed(2)}`);
    });

    // Include all received events that match those passes (showing who they passed to)
    const receivedFromPassesTheyMade = teamFilteredEvents.filter(e => {
      if (e.playerName === selectedPlayer) return false; // already included
      if (e.eventType.toLowerCase() !== 'playup received') return false;
      const key = `${e.startX.toFixed(2)},${e.startY.toFixed(2)},${e.endX.toFixed(2)},${e.endY.toFixed(2)}`;
      return passKeys.has(key);
    });

    // Also find all received events FOR the selected player and get their corresponding passes
    const receivedByPlayer = playerEvents.filter(e => e.eventType.toLowerCase() === 'playup received');
    const receivedKeys = new Set<string>();
    receivedByPlayer.forEach(e => {
      receivedKeys.add(`${e.startX.toFixed(2)},${e.startY.toFixed(2)},${e.endX.toFixed(2)},${e.endY.toFixed(2)}`);
    });

    // Include all pass events that match those received events (showing who passed to them)
    const passesFromOthersToPlayer = teamFilteredEvents.filter(e => {
      if (e.playerName === selectedPlayer) return false; // already included
      if (!playupPassTypes.includes(e.eventType.toLowerCase())) return false;
      const key = `${e.startX.toFixed(2)},${e.startY.toFixed(2)},${e.endX.toFixed(2)},${e.endY.toFixed(2)}`;
      return receivedKeys.has(key);
    });

    return [...playerEvents, ...receivedFromPassesTheyMade, ...passesFromOthersToPlayer];
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
  const crossCount = filteredEvents.filter(
    e => e.eventType.toLowerCase().startsWith('cross'),
  ).length;
  const driveSlipCount = driveSlipFilteredEvents.filter(
    e => ['drive', 'slip'].includes(e.eventType.toLowerCase()),
  ).length;
  const eventSequenceCount = eventSequenceEvents.length;
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
      renderPlayupMap(canvas, playupFilteredEvents, opts, exportScale);
    } else if (graphicType === 'driveslip') {
      const opts: DriveSlipMapOptions = {
        teamName: displayName,
        subtitle: subtitle || '',
        teamColor,
      };
      renderDriveSlipMap(canvas, driveSlipFilteredEvents, opts, exportScale);
    } else if (graphicType === 'eventsequence') {
      const opts: EventSequenceMapOptions = {
        teamName: displayName,
        subtitle: subtitle || '',
        teamColor,
        eventStyles: eventSequenceStyles,
        sequenceLabels: eventSequenceRenderData.sequenceLabels,
        markerEvents: eventSequenceRenderData.markerEvents,
      };
      renderEventSequenceMap(canvas, eventSequenceEvents, opts, exportScale);
    } else if (graphicType === 'shotxg') {
      const opts: ShotMapOptions = {
        teamName: displayName,
        subtitle: subtitle || '',
        teamColor,
        sizeBy,
      };
      renderShotMap(canvas, filteredEvents, opts, exportScale);
    } else if (graphicType === 'crossmap') {
      const opts: CrossMapOptions = {
        teamName: displayName,
        subtitle: subtitle || '',
        teamColor,
      };
      renderCrossMap(canvas, filteredEvents, opts, exportScale);
    } else if (graphicType === 'heatmap') {
      const opts: HeatmapOptions = {
        teamName: displayName,
        subtitle: subtitle || '',
        teamColor,
      };
      renderDefensiveHeatmap(canvas, filteredEvents, opts, exportScale);
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
      renderMidRecoveriesHeatmap(canvas, midRecoveriesEvents, opts, exportScale);
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
      renderFirstSecondBallMap(canvas, firstSecondBallEvents, opts, exportScale);
    } else if (graphicType === 'matchreport') {
      const opts: MatchReportOptions = {
        team1Name: teams[0] || teamNames.team1 || 'Team 1',
        team2Name: teams[1] || teamNames.team2 || 'Team 2',
        team1Color: teamColor,
        team2Color: team2Color,
        subtitle: subtitle || '',
      };
      renderMatchReport(canvas, reportEvents, opts, exportScale);
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
      renderXGTimeline(canvas, xgEvents, opts, exportScale);
    }
    setGenerated(true);
  }, [graphicType, filteredEvents, playupFilteredEvents, driveSlipFilteredEvents, eventSequenceEvents, eventSequenceStyles, eventSequenceRenderData, selectedSequenceIds, midRecoveriesEvents, firstSecondBallEvents, selectedTeam, selectedPlayer, teams, subtitle, teamColor, team2Color, sizeBy, customTeamName, teamNames, dataSource, appGraphicEvents, csvEvents, halfFilteredAppEvents, reportEvents, showMidGuides, showMidPlayerNames, midGuideColor, midGuideStyle, midGuideWidth, showMidThirds, showMidPenaltyLanes, firstSecondGridStyle, exportScale]);

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

  // ── Generate a plot canvas for PDF inclusion ───────────────────────
  const generatePlotCanvas = useCallback(
    (plotType: string): { canvas: HTMLCanvasElement; width: number; height: number } | null => {
      let w: number, h: number, renderer: (canvas: HTMLCanvasElement, events: any, opts: any, scaleFactor?: number) => void, opts: any;

      switch (plotType) {
        case 'playup':
          w = PLAYUP_CANVAS_W;
          h = PLAYUP_CANVAS_H;
          renderer = renderPlayupMap;
          opts = {
            teamName: customTeamName || selectedPlayer || selectedTeam || teams[0] || 'Team',
            subtitle: subtitle || '',
            teamColor,
          };
          break;
        case 'driveslip':
          w = PLAYUP_CANVAS_W;
          h = PLAYUP_CANVAS_H;
          renderer = renderDriveSlipMap;
          opts = {
            teamName: customTeamName || selectedPlayer || selectedTeam || teams[0] || 'Team',
            subtitle: subtitle || '',
            teamColor,
          };
          break;
        case 'shotxg':
          w = SHOT_CANVAS_W;
          h = SHOT_CANVAS_H;
          renderer = renderShotMap;
          opts = {
            teamName: customTeamName || selectedPlayer || selectedTeam || teams[0] || 'Team',
            subtitle: subtitle || '',
            teamColor,
            sizeBy,
          };
          break;
        case 'crossmap':
          w = CROSS_CANVAS_W;
          h = CROSS_CANVAS_H;
          renderer = renderCrossMap;
          opts = {
            teamName: customTeamName || selectedPlayer || selectedTeam || teams[0] || 'Team',
            subtitle: subtitle || '',
            teamColor,
          };
          break;
        case 'heatmap':
          w = HEATMAP_CANVAS_W;
          h = HEATMAP_CANVAS_H;
          renderer = renderDefensiveHeatmap;
          opts = {
            teamName: customTeamName || selectedPlayer || selectedTeam || teams[0] || 'Team',
            subtitle: subtitle || '',
            teamColor,
          };
          break;
        case 'midrecoveries':
          w = HEATMAP_CANVAS_W;
          h = HEATMAP_CANVAS_H;
          renderer = renderMidRecoveriesHeatmap;
          opts = {
            teamName: customTeamName || selectedPlayer || selectedTeam || teams[0] || 'Team',
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
          break;
        case 'firstsecondball':
          w = HEATMAP_CANVAS_W;
          h = HEATMAP_CANVAS_H;
          renderer = renderFirstSecondBallMap;
          opts = {
            team1Name: teams[0] || 'Team 1',
            team2Name: teams[1] || 'Team 2',
            team1Color: teamColor,
            team2Color,
            gridStyle: firstSecondGridStyle,
          };
          break;
        default:
          return null;
      }

      const tempCanvas = document.createElement('canvas');

      try {
        renderer(tempCanvas, filteredEvents, opts, exportScale);
        return { canvas: tempCanvas, width: w, height: h };
      } catch (e) {
        console.error(`Error rendering ${plotType}:`, e);
        return null;
      }
    },
    [customTeamName, selectedPlayer, selectedTeam, teams, subtitle, teamColor, team2Color, sizeBy, showMidGuides, showMidPlayerNames, midGuideColor, midGuideStyle, midGuideWidth, showMidThirds, showMidPenaltyLanes, firstSecondGridStyle, filteredEvents, exportScale],
  );

  // ── Export PDF with match report and selected plots ────────────────
  const exportPDF = useCallback(async () => {
    const matchReportCanvas = canvasRef.current;
    if (!matchReportCanvas || !generated || graphicType !== 'matchreport') return;

    setIsGeneratingPDF(true);

    try {
      const plots: Array<{ name: string; canvas: HTMLCanvasElement; originalWidth: number; originalHeight: number }> = [];

      // Generate each selected plot
      for (const plotType of pdfPlots) {
        const plotData = generatePlotCanvas(plotType as string);
        if (plotData) {
          const plotNames: Record<string, string> = {
            playup: 'Playup Map',
            driveslip: 'Drive + Slip Map',
            shotxg: 'Shot / xG Map',
            crossmap: 'Cross Map',
            heatmap: 'Defensive Heatmap',
            midrecoveries: 'Mid Recoveries',
            firstsecondball: 'First + Second Ball',
            xgtimeline: 'xG Timeline',
          };
          plots.push({
            name: plotNames[plotType] || plotType,
            canvas: plotData.canvas,
            originalWidth: plotData.width,
            originalHeight: plotData.height,
          });
        }
      }

      // Generate PDF
      generateMatchReportPDF(matchReportCanvas, plots, filename);
    } catch (e) {
      console.error('Error generating PDF:', e);
      alert('Error generating PDF. Check console for details.');
    } finally {
      setIsGeneratingPDF(false);
      setShowPdfOptions(false);
    }
  }, [canvasRef, generated, graphicType, pdfPlots, generatePlotCanvas, filename]);

  // ── Toggle PDF plot selection ──────────────────────────────────────
  const togglePdfPlot = useCallback((plotType: string) => {
    setPdfPlots(prev => {
      const next = new Set(prev);
      if (next.has(plotType)) {
        next.delete(plotType);
      } else {
        next.add(plotType);
      }
      return next;
    });
  }, []);

  // ── Relevant xG timeline shot count (uses all events, not team-filtered) ──
  const xgTimelineShotCount = allEvents.filter(
    e => e.eventType === 'Shot' || e.eventType === 'Goal',
  ).length;

  // ── Canvas display dimensions ─────────────────────────────────────────
  const canvasW = (graphicType === 'playup' || graphicType === 'driveslip' || graphicType === 'eventsequence') ? PLAYUP_CANVAS_W : graphicType === 'shotxg' ? SHOT_CANVAS_W : graphicType === 'crossmap' ? CROSS_CANVAS_W : graphicType === 'xgtimeline' ? XG_TIMELINE_W : graphicType === 'matchreport' ? REPORT_CANVAS_W : HEATMAP_CANVAS_W;
  const canvasH = (graphicType === 'playup' || graphicType === 'driveslip' || graphicType === 'eventsequence') ? PLAYUP_CANVAS_H : graphicType === 'shotxg' ? SHOT_CANVAS_H : graphicType === 'crossmap' ? CROSS_CANVAS_H : graphicType === 'xgtimeline' ? XG_TIMELINE_H : graphicType === 'matchreport' ? REPORT_CANVAS_H : HEATMAP_CANVAS_H;

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
            <option value="eventsequence">Event Sequence Map</option>
            <option value="shotxg">Shot / xG Map</option>
            <option value="crossmap">Cross Map</option>
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

        {/* Export scale */}
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
          Export Scale
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0.5"
              max="4"
              step="0.5"
              value={exportScale}
              onChange={e => setExportScale(parseFloat(e.target.value))}
              className="w-24"
            />
            <span className="w-12 text-sm text-gray-700 dark:text-gray-300 font-medium">{exportScale}x</span>
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

        {graphicType === 'eventsequence' && (
          <div className="flex flex-col gap-1 w-56 self-start">
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
              Sequences
              <details className="relative w-full">
                <summary className="list-none cursor-pointer px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white select-none focus:outline-none">
                  {selectedSequenceLabel}
                </summary>
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-2 max-h-56 overflow-auto">
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSequenceIds([]);
                        setGenerated(false);
                      }}
                      className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 text-[11px] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSequenceIds(sequenceOptions.map(s => s.id));
                        setGenerated(false);
                      }}
                      className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 text-[11px] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      Select All
                    </button>
                  </div>

                  <div className="flex flex-col gap-1">
                    {sequenceOptions.map(seq => {
                      const checked = selectedSequenceIds.includes(seq.id);
                      return (
                        <label key={seq.id} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 px-1 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedSequenceIds(prev => {
                                if (prev.includes(seq.id)) {
                                  return prev.filter(id => id !== seq.id);
                                }
                                return [...prev, seq.id];
                              });
                              setGenerated(false);
                            }}
                            className="h-3.5 w-3.5"
                          />
                          <span className="truncate">{seq.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </details>
            </label>

            <label className="flex items-center gap-2 px-1 text-xs font-medium text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={includePlayupsInSequenceMap}
                onChange={e => {
                  setIncludePlayupsInSequenceMap(e.target.checked);
                  setSelectedSequenceIds([]);
                  setGenerated(false);
                }}
                className="rounded border-gray-300 dark:border-gray-700"
              />
              Include Playups
            </label>
          </div>
        )}

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

        {graphicType === 'eventsequence' && eventSequenceTypes.length > 0 && (
          <div className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400 max-w-2xl">
            Event Styles
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {eventSequenceTypes.map(eventType => {
                const style = eventSequenceStyles[eventType] || buildDefaultSequenceStyle(eventType);
                return (
                  <div key={eventType} className="flex items-center gap-2 rounded border border-gray-200 dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-800">
                    <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 min-w-[90px] truncate" title={eventType}>{eventType}</span>
                    <input
                      type="color"
                      value={style.color}
                      onChange={e => updateEventSequenceStyle(eventType, { color: e.target.value })}
                      className="w-7 h-7 rounded border border-gray-300 dark:border-gray-700 cursor-pointer"
                    />
                    <select
                      value={style.lineStyle}
                      onChange={e => updateEventSequenceStyle(eventType, { lineStyle: e.target.value as EventSequenceLineStyle })}
                      className="px-1.5 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-[11px] text-gray-900 dark:text-white"
                    >
                      <option value="solid">Solid</option>
                      <option value="dashed">Dashed</option>
                      <option value="dotted">Dotted</option>
                    </select>
                    <span className="text-[10px] text-gray-500 w-8 text-center">6</span>
                  </div>
                );
              })}
            </div>
          </div>
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
            (graphicType === 'eventsequence' && eventSequenceCount === 0) ||
            (graphicType === 'shotxg' && shotCount === 0) ||
            (graphicType === 'crossmap' && crossCount === 0) ||
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

        {/* Export PDF (only for match report) */}
        {graphicType === 'matchreport' && (
          <button
            onClick={() => setShowPdfOptions(!showPdfOptions)}
            disabled={!generated}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            <FileText className="w-4 h-4" />
            Export PDF
          </button>
        )}

        {/* Status */}
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {graphicType === 'playup'
            ? `${playupCount} playup event${playupCount !== 1 ? 's' : ''} available`
            : graphicType === 'driveslip'
            ? `${driveSlipCount} drive/slip event${driveSlipCount !== 1 ? 's' : ''} available`
            : graphicType === 'eventsequence'
            ? `${eventSequenceCount} sequence event${eventSequenceCount !== 1 ? 's' : ''} in view`
            : graphicType === 'shotxg'
            ? `${shotCount} shot/goal event${shotCount !== 1 ? 's' : ''} available`
            : graphicType === 'crossmap'
            ? `${crossCount} cross event${crossCount !== 1 ? 's' : ''} available`
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

      {/* ── PDF Export Options ────────────────────────────────────────── */}
      {showPdfOptions && graphicType === 'matchreport' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-800">
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Include Plots in PDF</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {[
                { id: 'playup', label: 'Playup Map', count: playupCount },
                { id: 'driveslip', label: 'Drive + Slip', count: driveSlipCount },
                { id: 'shotxg', label: 'Shot / xG Map', count: shotCount },
                { id: 'crossmap', label: 'Cross Map', count: crossCount },
                { id: 'heatmap', label: 'Defensive Heatmap', count: defCount },
                { id: 'midrecoveries', label: 'Mid Recoveries', count: midRecoveryCount },
                { id: 'firstsecondball', label: 'First + Second Ball', count: firstSecondBallCount },
              ].map(plot => (
                <button
                  key={plot.id}
                  onClick={() => togglePdfPlot(plot.id)}
                  disabled={plot.count === 0}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    pdfPlots.has(plot.id)
                      ? 'bg-purple-500 text-white border-purple-500'
                      : plot.count === 0
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-300 dark:border-gray-700 cursor-not-allowed'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:border-purple-400'
                  }`}
                >
                  {plot.label}
                  <span className="text-[10px] ml-1">({plot.count})</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={exportPDF}
                disabled={pdfPlots.size === 0 || isGeneratingPDF}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
              >
                <FileText className="w-4 h-4" />
                {isGeneratingPDF ? 'Generating...' : 'Generate PDF'}
              </button>
              <button
                onClick={() => setShowPdfOptions(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
