import { useMemo, useRef, useCallback } from 'react';
import { Download } from 'lucide-react';
import { useEvents } from '../context/EventContext';
import { useTimer } from '../context/TimerContext';
import { computeShotFeatures, predictXg } from '../utils/xgModel';
import {
  renderXGTimeline,
  XGTimelineEvent,
  XGTimelineOptions,
} from '../utils/pitchRenderer';

/**
 * Live xG Timeline component.
 *
 * Displays a cumulative xG line chart that updates as events are
 * recorded and the match timer advances. Also supports generating
 * a high-res exportable PNG via the canvas renderer.
 */
export function XGTimeline() {
  const { events, teamNames } = useEvents();
  const { matchMinute, status, half } = useTimer();

  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── Derive xG timeline events from match events ──────────────────────
  const timelineEvents: XGTimelineEvent[] = useMemo(() => {
    return events
      .filter(e => e.eventType === 'Shot' || e.eventType === 'Goal')
      .map(e => {
        // Mirror shots attacking left so xG model always sees "attacking right"
        let sx = e.startLocation.x;
        let sy = e.startLocation.y;
        if (e.endLocation && e.endLocation.x < 50) {
          sx = 100 - sx;
          sy = 100 - sy;
        }
        const { dist, angle } = computeShotFeatures(sx, sy);
        const xg = predictXg(dist, angle);
        return {
          matchMinute: e.videoTimestamp / 60, // convert seconds to minutes
          eventType: e.eventType,
          playerName: e.playerName,
          team: e.playerTeam,
          xg,
        };
      })
      .sort((a, b) => a.matchMinute - b.matchMinute);
  }, [events]);

  // ── Build cumulative series ───────────────────────────────────────────
  const { team1Points, team2Points, maxXg } = useMemo(() => {
    interface Pt {
      minute: number;
      cumulXg: number;
      isGoal: boolean;
      playerName: string;
      xg: number;
    }

    const t1: Pt[] = [{ minute: 0, cumulXg: 0, isGoal: false, playerName: '', xg: 0 }];
    const t2: Pt[] = [{ minute: 0, cumulXg: 0, isGoal: false, playerName: '', xg: 0 }];
    let c1 = 0, c2 = 0;

    for (const ev of timelineEvents) {
      if (String(ev.team) === '1') {
        c1 += ev.xg;
        t1.push({ minute: ev.matchMinute, cumulXg: c1, isGoal: ev.eventType === 'Goal', playerName: ev.playerName, xg: ev.xg });
      } else {
        c2 += ev.xg;
        t2.push({ minute: ev.matchMinute, cumulXg: c2, isGoal: ev.eventType === 'Goal', playerName: ev.playerName, xg: ev.xg });
      }
    }

    const currentMin = matchMinute / 60;
    // Extend to current match minute for live feel
    const extendMin = Math.max(currentMin, t1[t1.length - 1].minute, t2[t2.length - 1].minute, 5);
    t1.push({ ...t1[t1.length - 1], minute: extendMin });
    t2.push({ ...t2[t2.length - 1], minute: extendMin });

    return {
      team1Points: t1,
      team2Points: t2,
      maxXg: Math.max(c1, c2, 0.3),
    };
  }, [timelineEvents, matchMinute]);

  // ── SVG dimensions (responsive) ──────────────────────────────────────
  const viewW = 600;
  const viewH = 260;
  const chartLeft = 48;
  const chartRight = viewW - 16;
  const chartTop = 36;
  const chartBottom = viewH - 44;
  const chartW = chartRight - chartLeft;
  const chartH = chartBottom - chartTop;

  const maxMin = Math.max(
    half === 2 ? 90 : 45,
    ...team1Points.map(p => p.minute),
    ...team2Points.map(p => p.minute),
    5,
  );
  const yMax = Math.max(Math.ceil(maxXg * 4) / 4, 0.25);

  const toX = (min: number) => chartLeft + (min / maxMin) * chartW;
  const toY = (xg: number) => chartBottom - (xg / yMax) * chartH;

  // ── Build SVG step-line path ──────────────────────────────────────────
  function buildStepPath(pts: typeof team1Points): string {
    if (pts.length < 2) return '';
    let d = `M${toX(pts[0].minute)},${toY(pts[0].cumulXg)}`;
    for (let i = 1; i < pts.length; i++) {
      const prevY = toY(pts[i - 1].cumulXg);
      d += ` L${toX(pts[i].minute)},${prevY}`;
      d += ` L${toX(pts[i].minute)},${toY(pts[i].cumulXg)}`;
    }
    return d;
  }

  const t1Path = buildStepPath(team1Points);
  const t2Path = buildStepPath(team2Points);

  const t1c = '#001E44';
  const t2c = '#C41E3A';
  const t1Goals = team1Points.filter(p => p.isGoal).length;
  const t2Goals = team2Points.filter(p => p.isGoal).length;
  // Adjust the cumulative xG to not double-count the extended final point
  const t1Total = team1Points.length > 1 ? team1Points[team1Points.length - 2].cumulXg : 0;
  const t2Total = team2Points.length > 1 ? team2Points[team2Points.length - 2].cumulXg : 0;

  // ── Y-axis ticks ──────────────────────────────────────────────────────
  const ySteps = Math.max(1, Math.ceil(yMax / 0.5));
  const yTicks: number[] = [];
  for (let i = 0; i <= ySteps; i++) yTicks.push((i * yMax) / ySteps);

  // ── X-axis ticks ──────────────────────────────────────────────────────
  const xTicks = [0, 15, 30, 45, 60, 75, 90].filter(v => v <= maxMin);

  // ── Canvas export ─────────────────────────────────────────────────────
  const exportPNG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const opts: XGTimelineOptions = {
      team1Name: teamNames.team1 || 'Team 1',
      team2Name: teamNames.team2 || 'Team 2',
      team1Color: t1c,
      team2Color: t2c,
      subtitle: half === 2 ? 'Full Match' : '1st Half',
      maxMinute: Math.ceil(maxMin),
    };
    renderXGTimeline(canvas, timelineEvents, opts);

    const link = document.createElement('a');
    link.download = 'xg_timeline.png';
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [teamNames, half, maxMin, timelineEvents]);

  return (
    <div className="flex flex-col gap-1 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-2 pt-1">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            xG Timeline
          </h3>
          <div className="flex items-center gap-4 text-[11px] font-semibold">
            <span style={{ color: t1c }} className="dark:text-blue-300">
              {teamNames.team1 || 'Team 1'}: {t1Total.toFixed(2)} xG ({t1Goals}G)
            </span>
            <span style={{ color: t2c }} className="dark:text-rose-400">
              {teamNames.team2 || 'Team 2'}: {t2Total.toFixed(2)} xG ({t2Goals}G)
            </span>
          </div>
        </div>
        <button
          onClick={exportPNG}
          disabled={timelineEvents.length === 0}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-40 text-gray-600 dark:text-gray-400 transition-colors"
          title="Export xG timeline as PNG"
          aria-label="Export xG timeline as PNG"
        >
          <Download className="w-3 h-3" /> PNG
        </button>
      </div>

      {/* SVG Chart */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewW} ${viewH}`}
        className="w-full flex-1 min-h-0"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="xG Timeline chart"
      >
        {/* Grid lines */}
        {yTicks.map(v => (
          <g key={`y-${v}`}>
            <line
              x1={chartLeft} y1={toY(v)} x2={chartRight} y2={toY(v)}
              stroke="currentColor" strokeWidth={0.5} className="text-gray-300 dark:text-gray-700"
            />
            <text
              x={chartLeft - 6} y={toY(v) + 1}
              textAnchor="end" dominantBaseline="middle"
              className="fill-gray-500 dark:fill-gray-500 text-[9px]"
            >
              {v.toFixed(1)}
            </text>
          </g>
        ))}
        {xTicks.map(v => (
          <g key={`x-${v}`}>
            <line
              x1={toX(v)} y1={chartTop} x2={toX(v)} y2={chartBottom}
              stroke="currentColor" strokeWidth={0.5} className="text-gray-300 dark:text-gray-700"
            />
            <text
              x={toX(v)} y={chartBottom + 12}
              textAnchor="middle" dominantBaseline="hanging"
              className="fill-gray-500 dark:fill-gray-500 text-[9px]"
            >
              {v}'
            </text>
          </g>
        ))}

        {/* Half-time line */}
        {maxMin > 45 && (
          <line
            x1={toX(45)} y1={chartTop} x2={toX(45)} y2={chartBottom}
            stroke="#999" strokeWidth={1} strokeDasharray="4 3"
          />
        )}

        {/* Axes */}
        <line x1={chartLeft} y1={chartBottom} x2={chartRight} y2={chartBottom} stroke="currentColor" strokeWidth={1} className="text-gray-500 dark:text-gray-600" />
        <line x1={chartLeft} y1={chartTop} x2={chartLeft} y2={chartBottom} stroke="currentColor" strokeWidth={1} className="text-gray-500 dark:text-gray-600" />

        {/* Team 1 line */}
        <path d={t1Path} fill="none" stroke={t1c} strokeWidth={2.5} className="dark:stroke-blue-400" strokeLinejoin="round" />
        {/* Team 2 line */}
        <path d={t2Path} fill="none" stroke={t2c} strokeWidth={2.5} className="dark:stroke-rose-400" strokeLinejoin="round" />

        {/* Event markers */}
        {team1Points.filter(p => p.minute > 0 || p.cumulXg > 0).slice(0, -1).map((pt, i) => (
          pt.isGoal ? (
            <g key={`t1-${i}`}>
              <circle cx={toX(pt.minute)} cy={toY(pt.cumulXg)} r={6} fill={t1c} stroke="#fff" strokeWidth={1.5} className="dark:fill-blue-400" />
              <text x={toX(pt.minute)} y={toY(pt.cumulXg) - 10} textAnchor="middle" className="fill-gray-800 dark:fill-gray-200 text-[7px] font-bold">{pt.playerName}</text>
            </g>
          ) : (
            <circle key={`t1-${i}`} cx={toX(pt.minute)} cy={toY(pt.cumulXg)} r={3} fill={t1c} stroke="#fff" strokeWidth={1} className="dark:fill-blue-400" />
          )
        ))}
        {team2Points.filter(p => p.minute > 0 || p.cumulXg > 0).slice(0, -1).map((pt, i) => (
          pt.isGoal ? (
            <g key={`t2-${i}`}>
              <circle cx={toX(pt.minute)} cy={toY(pt.cumulXg)} r={6} fill={t2c} stroke="#fff" strokeWidth={1.5} className="dark:fill-rose-400" />
              <text x={toX(pt.minute)} y={toY(pt.cumulXg) + 14} textAnchor="middle" className="fill-gray-800 dark:fill-gray-200 text-[7px] font-bold">{pt.playerName}</text>
            </g>
          ) : (
            <circle key={`t2-${i}`} cx={toX(pt.minute)} cy={toY(pt.cumulXg)} r={3} fill={t2c} stroke="#fff" strokeWidth={1} className="dark:fill-rose-400" />
          )
        ))}

        {/* Current time marker */}
        {status !== 'stopped' && (
          <line
            x1={toX(matchMinute / 60)} y1={chartTop}
            x2={toX(matchMinute / 60)} y2={chartBottom}
            stroke="#F97316" strokeWidth={1.5} strokeDasharray="3 2"
            className="dark:stroke-orange-400"
          />
        )}

        {/* Empty state text */}
        {timelineEvents.length === 0 && (
          <text
            x={chartLeft + chartW / 2} y={chartTop + chartH / 2}
            textAnchor="middle" dominantBaseline="middle"
            className="fill-gray-400 dark:fill-gray-600 text-[11px]"
          >
            Record shots to see xG timeline
          </text>
        )}
      </svg>

      {/* Hidden canvas for PNG export */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
