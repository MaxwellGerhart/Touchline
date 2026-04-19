/**
 * Canvas-based football pitch renderer.
 *
 * Produces Playup Maps and Shot/xG Maps that visually match the
 * PlayupGraphic.ipynb and xGandShotmap.ipynb notebook outputs.
 */

import { computeShotFeatures, isShotLikeEventType, predictXg } from './xgModel';

// ═══════════════════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════════════════

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GraphicEvent {
  eventType: string;
  playerId?: number;
  playerName: string;
  playerTeam: string | number;
  videoTimestamp?: number;
  sequenceId?: string;
  parentEventId?: string;
  driveStartX?: number;
  driveStartY?: number;
  startX: number; // opta 0-100
  startY: number; // opta 0-100
  endX: number;
  endY: number;
}

export interface PlayupMapOptions {
  teamName: string;
  subtitle: string;
  teamColor: string;
}

export interface DriveSlipMapOptions {
  teamName: string;
  subtitle: string;
  teamColor: string;
}

export type EventSequenceLineStyle = 'solid' | 'dashed' | 'dotted';

export interface EventSequenceStyle {
  color: string;
  lineStyle: EventSequenceLineStyle;
  lineWidth: number;
}

export interface CrossMapOptions {
  teamName: string;
  subtitle: string;
  teamColor: string;
}

export interface EventSequenceMapOptions {
  teamName: string;
  subtitle: string;
  teamColor: string;
  eventStyles: Record<string, EventSequenceStyle>;
  sequenceLabels?: string[];
  markerEvents?: GraphicEvent[];
}

export interface ShotMapOptions {
  teamName: string;
  subtitle: string;
  teamColor: string;
  sizeBy: 'xg' | 'distance';
}

export interface HeatmapOptions {
  teamName: string;
  subtitle: string;
  teamColor: string;
}

export interface MidRecoveriesOptions {
  teamName: string;
  subtitle: string;
  teamColor: string;
  showGuides?: boolean;
  showPlayerNames?: boolean;
  guideColor?: string;
  guideStyle?: 'dotted' | 'dashed';
  guideWidth?: number;
  showThirdsGuides?: boolean;
  showPenaltyLaneGuides?: boolean;
}

export interface FirstSecondBallMapOptions {
  teamName: string;
  subtitle: string;
  team1Id?: string;
  team2Id?: string;
  team1Name?: string;
  team2Name?: string;
  team1Color: string;
  team2Color: string;
  gridStyle?: 'dotted' | 'dashed';
  showThirds?: boolean;
  showAttackingDirection?: boolean;
  applyJitterToDense?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════════════

// Pitch dimensions in metres
const PL = 105; // pitch length
const PW = 68;  // pitch width

// Penalty area: 16.5 m deep, 40.32 m wide, centred
const PA_DEPTH = 16.5;
const PA_WIDTH = 40.32;
const PA_Y0 = (PW - PA_WIDTH) / 2;  // ≈ 13.84
const PA_Y1 = PA_Y0 + PA_WIDTH;     // ≈ 54.16

// Goal area: 5.5 m deep, 18.32 m wide, centred
const GA_DEPTH = 5.5;
const GA_WIDTH = 18.32;
const GA_Y0 = (PW - GA_WIDTH) / 2;  // ≈ 24.84
const GA_Y1 = GA_Y0 + GA_WIDTH;     // ≈ 43.16

const PEN_DIST = 11;
const CIRCLE_R = 9.15;

// ── Shot-map / playup-map palette (light style) ─────────────────────────
const SHOT_BG    = '#EEEEEE';
const SHOT_TEXT  = '#000000';
const SHOT_GREY  = '#888888';

// ═══════════════════════════════════════════════════════════════════════════
//  Coordinate helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Opta (0-100 × 0-100) → canvas pixel on full-pitch rectangle. */
function optaFull(ox: number, oy: number, r: Rect): [number, number] {
  return [r.x + (ox / 100) * r.w, r.y + (oy / 100) * r.h];
}

/**
 * Pitch metres → canvas pixel on full-pitch rectangle.
 * pitchY increases downward on canvas (top = 0, bottom = PW).
 */
function meterFull(mx: number, my: number, r: Rect): [number, number] {
  return [r.x + (mx / PL) * r.w, r.y + (my / PW) * r.h];
}

/**
 * Opta → canvas pixel on vertical half-pitch.
 * optaX 50-100 maps to vertical (100 = top / goal, 50 = bottom / half).
 * optaY 0-100 maps to horizontal.
 */
function optaHalf(ox: number, oy: number, r: Rect): [number, number] {
  return [r.x + (oy / 100) * r.w, r.y + ((100 - ox) / 50) * r.h];
}

/** Pitch metres → canvas on vertical half-pitch (52.5-105 vertical). */
function meterHalf(mx: number, my: number, r: Rect): [number, number] {
  return [r.x + (my / PW) * r.w, r.y + ((PL - mx) / (PL / 2)) * r.h];
}

// ═══════════════════════════════════════════════════════════════════════════
//  Drawing primitives
// ═══════════════════════════════════════════════════════════════════════════

function line(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,
  color: string, lw: number,
) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function strokeRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string, lw: number,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.strokeRect(x, y, w, h);
}

function circle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  strokeColor: string, lw: number,
) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function filledCircle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  fill: string, strokeColor?: string, lw?: number,
) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lw ?? 1;
    ctx.stroke();
  }
}

function diamond(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, size: number,
  fill: string, strokeColor?: string, lw?: number,
) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size, cy);
  ctx.lineTo(cx, cy + size);
  ctx.lineTo(cx - size, cy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lw ?? 1;
    ctx.stroke();
  }
}

function outlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  fill: string,
  outline: string,
  fontSize: number,
  opts?: {
    weight?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    outlineWidth?: number;
    font?: string;
  },
) {
  const family = opts?.font ?? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const weight = opts?.weight ?? 'normal';
  ctx.font = `${weight} ${fontSize}px ${family}`;
  ctx.textAlign = opts?.align ?? 'left';
  ctx.textBaseline = opts?.baseline ?? 'top';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = opts?.outlineWidth ?? 3;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function plainText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  fill: string,
  fontSize: number,
  opts?: {
    weight?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    font?: string;
  },
) {
  const family = opts?.font ?? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const weight = opts?.weight ?? 'normal';
  ctx.font = `${weight} ${fontSize}px ${family}`;
  ctx.textAlign = opts?.align ?? 'left';
  ctx.textBaseline = opts?.baseline ?? 'top';
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number,
  x1: number, y1: number,
  color: string,
  lw: number,
  headSize: number = 8,
  bgColor?: string,
) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const angle = Math.atan2(dy, dx);

  // Shaft with outline effect
  if (bgColor) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = bgColor;
    ctx.lineWidth = lw + 2;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();

  // Arrow-head
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(
    x1 - headSize * Math.cos(angle - Math.PI / 6),
    y1 - headSize * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    x1 - headSize * Math.cos(angle + Math.PI / 6),
    y1 - headSize * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// ═══════════════════════════════════════════════════════════════════════════
//  Pitch drawing – full (horizontal)
// ═══════════════════════════════════════════════════════════════════════════

function drawFullPitch(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  pitchColor: string,
  lineColor: string,
) {
  const lw = Math.max(1, r.w / 900);
  const arcR = (CIRCLE_R / PL) * r.w;

  const m = (mX: number, mY: number) => meterFull(mX, mY, r);
  const sr = (x0: number, y0: number, x1: number, y1: number) =>
    strokeRect(ctx, x0, y0, x1 - x0, y1 - y0, lineColor, lw);
  const ln = (x0: number, y0: number, x1: number, y1: number) =>
    line(ctx, x0, y0, x1, y1, lineColor, lw);
  const fc = (x: number, y: number) =>
    filledCircle(ctx, x, y, 2, lineColor);
  const penArc = (cx: number, cy: number, start: number, end: number, acw: boolean) => {
    ctx.beginPath();
    ctx.arc(cx, cy, arcR, start, end, acw);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lw;
    ctx.stroke();
  };

  // Surface
  ctx.fillStyle = pitchColor;
  ctx.fillRect(r.x, r.y, r.w, r.h);

  // Boundary
  strokeRect(ctx, r.x, r.y, r.w, r.h, lineColor, lw);

  // Halfway line
  const [hx, hy0] = m(PL / 2, 0);
  const [,   hy1] = m(PL / 2, PW);
  ln(hx, hy0, hx, hy1);

  // Centre circle & spot
  const [ccx, ccy] = m(PL / 2, PW / 2);
  circle(ctx, ccx, ccy, arcR, lineColor, lw);
  fc(ccx, ccy);

  for (const isLeft of [true, false]) {
    // Penalty area box
    const [pax0, pay0] = m(isLeft ? 0        : PL - PA_DEPTH, PA_Y0);
    const [pax1, pay1] = m(isLeft ? PA_DEPTH : PL,            PA_Y1);
    sr(pax0, pay0, pax1, pay1);

    // Goal area box
    const [gax0, gay0] = m(isLeft ? 0        : PL - GA_DEPTH, GA_Y0);
    const [gax1, gay1] = m(isLeft ? GA_DEPTH : PL,            GA_Y1);
    sr(gax0, gay0, gax1, gay1);

    // Penalty spot
    const [psx, psy] = m(isLeft ? PEN_DIST : PL - PEN_DIST, PW / 2);
    fc(psx, psy);

    // Penalty arc.
    // The circle centred on the spot crosses the PA edge line at ±halfAngle
    // from the horizontal. We then pick the arc that sweeps outward —
    // through π (left) or through 0/2π (right) — using anticlockwise=true
    // to select the correct sector without any midAngle arithmetic.
    const [paEdgePx] = m(isLeft ? PA_DEPTH : PL - PA_DEPTH, 0);
    const ratio = (paEdgePx - psx) / arcR;
    const halfAngle = Math.acos(Math.max(-1, Math.min(1, ratio)));

    if (isLeft) {
      penArc(psx, psy,  halfAngle, -halfAngle, true);  // sweeps through π
    } else {
      penArc(psx, psy, -halfAngle,  halfAngle, true);  // sweeps through 0
    }
  }
}

function drawFullPitchGuides(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  opts?: {
    lineColor?: string;
    style?: 'dotted' | 'dashed';
    lineWidth?: number;
    showThirds?: boolean;
    showPenaltyLanes?: boolean;
  },
) {
  const lineColor = opts?.lineColor ?? SHOT_GREY;
  const style = opts?.style ?? 'dotted';
  const showThirds = opts?.showThirds ?? true;
  const showPenaltyLanes = opts?.showPenaltyLanes ?? true;
  const lw = opts?.lineWidth ?? Math.max(1, r.w / 1300);
  const dashOn = style === 'dashed' ? Math.max(8, r.w / 75) : Math.max(5, r.w / 160);
  const dashOff = style === 'dashed' ? Math.max(6, r.w / 110) : Math.max(5, r.w / 220);

  const m = (mX: number, mY: number) => meterFull(mX, mY, r);

  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();

  ctx.setLineDash([dashOn, dashOff]);
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lw;

  // Vertical thirds of the full pitch length.
  if (showThirds) {
    for (const xM of [PL / 3, (2 * PL) / 3]) {
      const [x, y0] = m(xM, 0);
      const [, y1] = m(xM, PW);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }
  }

  // Horizontal guides from the 18-yard box edges.
  if (showPenaltyLanes) {
    for (const yM of [PA_Y0, PA_Y1]) {
      const [, y] = m(0, yM);
      
      // Middle section: from penalty box edge to penalty box edge (skip the boxes)
      const [x0] = m(PA_DEPTH, yM);
      const [x1] = m(PL - PA_DEPTH, yM);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function draw18ZoneGrid(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  lineColor: string,
  style: 'dotted' | 'dashed' = 'dotted',
) {
  const isDotted = style === 'dotted';
  const baseLw = Math.max(1, r.w / 900);
  const lw = isDotted ? Math.max(2, baseLw * 1.8) : baseLw;
  const m = (mX: number, mY: number) => meterFull(mX, mY, r);

  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';

  const xGuides = [PA_DEPTH, PL / 3, (2 * PL) / 3, PL - PA_DEPTH];
  const yGuides = [PA_Y0, GA_Y0, GA_Y1, PA_Y1];

  // For dotted mode: draw line segments between intersections with calculated dash pattern
  // For dashed mode: draw full lines with standard dash pattern
  
  if (isDotted) {
    // Dotted: draw segments between intersection points with pattern that aligns dots
    // Draw vertical segments
    for (let xi = 0; xi < xGuides.length; xi++) {
      const xM = xGuides[xi];
      const [x] = m(xM, 0);
      
      // Draw segment from 0 to first guide
      let [, y0] = m(xM, 0);
      let [, y1] = m(xM, yGuides[0]);
      const dist0 = Math.hypot(x - x, y1 - y0);
      const pattern0 = calculateDottedPattern(dist0, lw);
      ctx.setLineDash(pattern0);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
      
      // Draw segments between guides
      for (let yi = 0; yi < yGuides.length - 1; yi++) {
        [, y0] = m(xM, yGuides[yi]);
        [, y1] = m(xM, yGuides[yi + 1]);
        const dist = Math.hypot(x - x, y1 - y0);
        const pattern = calculateDottedPattern(dist, lw);
        ctx.setLineDash(pattern);
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.stroke();
      }
      
      // Draw segment from last guide to end
      [, y0] = m(xM, yGuides[yGuides.length - 1]);
      [, y1] = m(xM, PW);
      const distEnd = Math.hypot(x - x, y1 - y0);
      const patternEnd = calculateDottedPattern(distEnd, lw);
      ctx.setLineDash(patternEnd);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }
    
    // Draw horizontal segments
    for (let yi = 0; yi < yGuides.length; yi++) {
      const yM = yGuides[yi];
      const [, y] = m(0, yM);
      
      // Draw segment from 0 to first guide
      let [x0] = m(0, yM);
      let [x1] = m(xGuides[0], yM);
      let dist = Math.hypot(x1 - x0, y - y);
      let pattern = calculateDottedPattern(dist, lw);
      ctx.setLineDash(pattern);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      
      // Draw segments between guides
      for (let xi = 0; xi < xGuides.length - 1; xi++) {
        [x0] = m(xGuides[xi], yM);
        [x1] = m(xGuides[xi + 1], yM);
        dist = Math.hypot(x1 - x0, y - y);
        pattern = calculateDottedPattern(dist, lw);
        ctx.setLineDash(pattern);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
      }
      
      // Draw segment from last guide to end
      [x0] = m(xGuides[xGuides.length - 1], yM);
      [x1] = m(PL, yM);
      dist = Math.hypot(x1 - x0, y - y);
      pattern = calculateDottedPattern(dist, lw);
      ctx.setLineDash(pattern);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }

    // Overlay intersection dots explicitly
    const dotR = Math.max(1.5, lw * 0.65);
    ctx.setLineDash([]);
    for (const xM of xGuides) {
      for (const yM of yGuides) {
        const [ix, iy] = m(xM, yM);
        filledCircle(ctx, ix, iy, dotR, lineColor);
      }
    }
  } else {
    // Dashed mode: draw continuous lines with standard dash
    const dashOn = Math.max(8, r.w / 95);
    const dashOff = Math.max(6, r.w / 130);
    ctx.setLineDash([dashOn, dashOff]);
    
    for (const xM of xGuides) {
      const [x, y0] = m(xM, 0);
      const [, y1] = m(xM, PW);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }

    for (const yM of yGuides) {
      const [x0, y] = m(0, yM);
      const [x1] = m(PL, yM);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

// Helper function to calculate dash pattern that will align dots with segment length
function calculateDottedPattern(segmentLength: number, lineWidth: number): number[] {
  if (segmentLength <= 0) return [0.01, 15];
  
  // Medium spacing for a balanced number of dots
  const dotSize = 0.5; // tiny mark
  const spacing = Math.max(12, lineWidth * 4); // medium gap between dots
  
  // Calculate how many dots should fit in this segment
  const dotSpacing = dotSize + spacing;
  const numDots = Math.max(1, Math.round(segmentLength / dotSpacing));
  const adjustedSpacing = segmentLength / numDots;
  
  return [dotSize, adjustedSpacing - dotSize];
}

// ═══════════════════════════════════════════════════════════════════════════
//  Pitch drawing – vertical half (attacking end)
// ═══════════════════════════════════════════════════════════════════════════

function drawHalfPitch(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  pitchColor: string,
  lineColor: string,
) {
  const lw = Math.max(1, r.w / 600);
  const arcRx = CIRCLE_R * (r.w / PW);
  const arcRy = CIRCLE_R * (r.h / (PL / 2));

  const m = (mX: number, mY: number) => meterHalf(mX, mY, r);
  const sr = (x0: number, y0: number, x1: number, y1: number) =>
    strokeRect(ctx, x0, y0, x1 - x0, y1 - y0, lineColor, lw);
  const fc = (x: number, y: number) =>
    filledCircle(ctx, x, y, 2.5, lineColor);

  // Draws the portion of an ellipse on one side of a horizontal clip line.
  // keepBelow=true → keep the arc where canvas-Y > clipY (lower on screen).
  // keepBelow=false → keep the arc where canvas-Y < clipY (higher on screen).
  const ellipseArc = (
    cx: number, cy: number,
    rx: number, ry: number,
    clipY: number,
    keepBelow: boolean,
  ) => {
    const sinT = Math.max(-1, Math.min(1, (clipY - cy) / ry));
    const tCross = Math.asin(sinT); // angle where ellipse crosses clipY, in [-π/2, π/2]
    // Ellipse crosses clipY at two angles: tCross and π - tCross.
    // Bottom arc (larger Y) runs from tCross → π - tCross (clockwise, anticlockwise=false).
    // Top arc (smaller Y) runs from π - tCross → tCross + 2π (clockwise).
    const [startAngle, endAngle] = keepBelow
      ? [tCross,          Math.PI - tCross]
      : [Math.PI - tCross, tCross + Math.PI * 2];

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, startAngle, endAngle, false);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lw;
    ctx.stroke();
  };

  // Surface
  ctx.fillStyle = pitchColor;
  ctx.fillRect(r.x, r.y, r.w, r.h);

  // Boundary
  strokeRect(ctx, r.x, r.y, r.w, r.h, lineColor, lw);

  // Penalty area
  const [pax0, pay0] = m(PL,            PA_Y0);
  const [pax1, pay1] = m(PL - PA_DEPTH, PA_Y1);
  sr(pax0, pay0, pax1, pay1);

  // Goal area
  const [gax0, gay0] = m(PL,            GA_Y0);
  const [gax1, gay1] = m(PL - GA_DEPTH, GA_Y1);
  sr(gax0, gay0, gax1, gay1);

  // Penalty spot & arc (arc bulges downward, away from goal)
  const [psx, psy] = m(PL - PEN_DIST, PW / 2);
  fc(psx, psy);
  const [, paEdgeY] = m(PL - PA_DEPTH, 0);
  ellipseArc(psx, psy, arcRx, arcRy, paEdgeY, true);

  // Centre spot & circle arc (keep only the top half, inside attacking half)
  const [ccx, ccy] = m(PL / 2, PW / 2);
  fc(ccx, ccy);
  ellipseArc(ccx, ccy, arcRx, arcRy, r.y + r.h, false);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Playup Map renderer – light style matching Shot Map
// ═══════════════════════════════════════════════════════════════════════════

export const PLAYUP_CANVAS_W = 2200;
export const PLAYUP_CANVAS_H = 1600;
export const CROSS_CANVAS_W = 1400;
export const CROSS_CANVAS_H = 1300;

export function renderPlayupMap(
  canvas: HTMLCanvasElement,
  events: GraphicEvent[],
  options: PlayupMapOptions,
  scaleFactor?: number,
): void {
  const effectiveScale = scaleFactor ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2);
  const W = PLAYUP_CANVAS_W;
  const H = PLAYUP_CANVAS_H;
  canvas.width = W * effectiveScale;
  canvas.height = H * effectiveScale;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(effectiveScale, effectiveScale);

  const bg = SHOT_BG;
  const tc = options.teamColor || '#001E44';
  const fc = SHOT_TEXT;

  // ── Background ────────────────────────────────────────────────────────
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Extract playup & receiver events ──────────────────────────────────
  const rawPlayups = events.filter(e => ['playup platform', 'playup aaa'].includes(e.eventType.toLowerCase()));
  const receivedMap = new Map<string, string>();
  events
    .filter(e => e.eventType.toLowerCase() === 'playup received')
    .forEach(e => {
      const key = `${e.startX.toFixed(2)},${e.startY.toFixed(2)},${e.endX.toFixed(2)},${e.endY.toFixed(2)}`;
      receivedMap.set(key, e.playerName);
    });

  // ── Normalize direction: mirror playups going left so all attack right ─
  const playups = rawPlayups.map(pu => {
    const origKey = `${pu.startX.toFixed(2)},${pu.startY.toFixed(2)},${pu.endX.toFixed(2)},${pu.endY.toFixed(2)}`;
    if (pu.endX < pu.startX) {
      const mirrored = {
        ...pu,
        startX: 100 - pu.startX,
        startY: 100 - pu.startY,
        endX: 100 - pu.endX,
        endY: 100 - pu.endY,
      };
      const recName = receivedMap.get(origKey);
      if (recName) {
        const mirroredKey = `${mirrored.startX.toFixed(2)},${mirrored.startY.toFixed(2)},${mirrored.endX.toFixed(2)},${mirrored.endY.toFixed(2)}`;
        receivedMap.set(mirroredKey, recName);
      }
      return mirrored;
    }
    return pu;
  });

  // ── Categorise playups by zone ──────────────────────────────────────────
  const betweenColor = tc;                          // team colour
  const behindColor  = adjustColor(tc, 0, 0.35);    // lighter tint of team colour

  const behindCount  = playups.filter(p => p.eventType.toLowerCase() === 'playup aaa').length;
  const betweenCount = playups.filter(p => p.eventType.toLowerCase() === 'playup platform').length;

  function playupColor(pu: GraphicEvent): string {
    return pu.eventType.toLowerCase() === 'playup aaa' ? behindColor : betweenColor;
  }

  const counts: Record<string, number> = {};
  playups.forEach(p => {
    counts[p.playerName] = (counts[p.playerName] || 0) + 1;
  });

  // ── Title area (centered, shot-map style) ─────────────────────────────
  const titleY = 50;
  plainText(ctx, options.teamName, W / 2, titleY, tc, 64, {
    weight: 'bold',
    align: 'center',
  });
  plainText(ctx, `${options.subtitle}`, W / 2, titleY + 76, fc, 36, {
    weight: 'bold',
    align: 'center',
  });

  // ── Legend strip (zone categories) ────────────────────────────────────
  const legendY = 195;

  // "Platform" legend
  let lx = W * 0.12;
  filledCircle(ctx, lx, legendY + 6, 12, betweenColor, fc, 2);
  plainText(ctx, `Platform (${betweenCount})`, lx + 24, legendY - 8, fc, 26);
  lx += ctx.measureText(`Platform (${betweenCount})`).width + 70;

  // "AAA" legend
  filledCircle(ctx, lx, legendY + 6, 12, behindColor, fc, 2);
  plainText(ctx, `AAA (${behindCount})`, lx + 24, legendY - 8, fc, 26);
  lx += ctx.measureText(`AAA (${behindCount})`).width + 70;

  // Receiver legend
  diamond(ctx, lx, legendY + 6, 10, tc, fc, 2);
  plainText(ctx, 'Receiver', lx + 20, legendY - 8, fc, 24);

  // Direction arrow at right edge
  const dirX0 = W * 0.88;
  const dirX1 = W * 0.90;
  drawArrow(ctx, dirX0 - 40, legendY + 6, dirX1, legendY + 6, SHOT_GREY, 2.4, 14);
  plainText(ctx, 'Attack', dirX0, legendY + 22, SHOT_GREY, 20, { align: 'center' });

  // ── Pitch (horizontal, matching shot-map colours) ─────────────────────
  const pitchAspect = PL / PW; // ≈ 1.544
  const pitchPadX = 100;
  const pitchPadTop = 250;
  const pitchPadBot = 200;
  const availW = W - pitchPadX * 2;
  const availH = H - pitchPadTop - pitchPadBot;
  let pitchW: number, pitchH: number;
  if (availW / pitchAspect <= availH) {
    pitchW = availW;
    pitchH = availW / pitchAspect;
  } else {
    pitchH = availH;
    pitchW = availH * pitchAspect;
  }
  const pitchRect: Rect = {
    x: (W - pitchW) / 2,
    y: pitchPadTop,
    w: pitchW,
    h: pitchH,
  };
  drawFullPitch(ctx, pitchRect, bg, fc);

  // ── Arrows & dots ────────────────────────────────────────────────────
  for (const pu of playups) {
    const [sx, sy] = optaFull(pu.startX, pu.startY, pitchRect);
    const [ex, ey] = optaFull(pu.endX, pu.endY, pitchRect);
    const color = playupColor(pu);

    // Arrow shaft
    drawArrow(ctx, sx, sy, ex, ey, color, 3.5, 16);

    // Origin dot
    filledCircle(ctx, sx, sy, 10, color, fc, 2);

    // Receiver diamond
    diamond(ctx, ex, ey, 10, color, fc, 2);

    // (labels collected below after this loop)
  }

  // ── Collision-aware label placement ──────────────────────────────────
  const LABEL_FONT = 20;
  const LABEL_PAD = 4;                 // px padding around text bbox
  ctx.font = `bold ${LABEL_FONT}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  interface LabelRect { x: number; y: number; w: number; h: number }
  const placed: LabelRect[] = [];

  function rectsOverlap(a: LabelRect, b: LabelRect): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function overlapArea(a: LabelRect, b: LabelRect): number {
    const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return ox * oy;
  }

  function totalOverlap(r: LabelRect): number {
    let sum = 0;
    for (const p of placed) {
      if (rectsOverlap(r, p)) sum += overlapArea(r, p);
    }
    return sum;
  }

  // Candidate offsets: [dx, dy, textAlign]
  const candidateOffsets: [number, number, CanvasTextAlign][] = [
    [-14,  14, 'right'],   // bottom-left (original origin style)
    [ 14, -24, 'left'],    // top-right
    [-14, -24, 'right'],   // top-left
    [ 14,  14, 'left'],    // bottom-right
    [-14,  34, 'right'],   // further below-left
    [ 14,  34, 'left'],    // further below-right
    [-14, -44, 'right'],   // further above-left
    [ 14, -44, 'left'],    // further above-right
  ];

  const recCandidateOffsets: [number, number, CanvasTextAlign][] = [
    [ 16,  -8, 'left'],    // original receiver style
    [-16,  -8, 'right'],   // mirror
    [ 16, -28, 'left'],    // above-right
    [-16, -28, 'right'],   // above-left
    [ 16,  16, 'left'],    // below-right
    [-16,  16, 'right'],   // below-left
    [ 16, -48, 'left'],    // further above
    [ 16,  36, 'left'],    // further below
  ];

  function placeLabel(
    text: string,
    anchorX: number, anchorY: number,
    candidates: [number, number, CanvasTextAlign][],
  ): { x: number; y: number; align: CanvasTextAlign } {
    const tw = ctx.measureText(text).width;
    const th = LABEL_FONT;

    let best = candidates[0];
    let bestOverlap = Infinity;

    for (const [dx, dy, align] of candidates) {
      const lx = align === 'right' ? anchorX + dx - tw : anchorX + dx;
      const ly = anchorY + dy;
      const rect: LabelRect = {
        x: lx - LABEL_PAD, y: ly - LABEL_PAD,
        w: tw + LABEL_PAD * 2, h: th + LABEL_PAD * 2,
      };
      const ov = totalOverlap(rect);
      if (ov === 0) {
        // No collision — use this position and register it
        placed.push(rect);
        return { x: anchorX + dx, y: anchorY + dy, align };
      }
      if (ov < bestOverlap) {
        bestOverlap = ov;
        best = [dx, dy, align];
      }
    }

    // All candidates overlap — pick least-overlapping
    const [dx, dy, align] = best;
    const lx = align === 'right' ? anchorX + dx - tw : anchorX + dx;
    placed.push({
      x: lx - LABEL_PAD, y: anchorY + dy - LABEL_PAD,
      w: tw + LABEL_PAD * 2, h: LABEL_FONT + LABEL_PAD * 2,
    });
    return { x: anchorX + dx, y: anchorY + dy, align };
  }

  // Draw origin (passer) labels
  for (const pu of playups) {
    const [sx, sy] = optaFull(pu.startX, pu.startY, pitchRect);
    const pos = placeLabel(pu.playerName, sx, sy, candidateOffsets);
    outlinedText(ctx, pu.playerName, pos.x, pos.y, fc, bg, LABEL_FONT, {
      weight: 'bold',
      align: pos.align,
      outlineWidth: 5,
    });
  }

  // Draw receiver labels
  for (const pu of playups) {
    const [ex, ey] = optaFull(pu.endX, pu.endY, pitchRect);
    const key = `${pu.startX.toFixed(2)},${pu.startY.toFixed(2)},${pu.endX.toFixed(2)},${pu.endY.toFixed(2)}`;
    const recName = receivedMap.get(key) || '';
    if (recName) {
      const pos = placeLabel(recName, ex, ey, recCandidateOffsets);
      outlinedText(ctx, recName, pos.x, pos.y, fc, bg, LABEL_FONT, {
        weight: 'bold',
        align: pos.align,
        outlineWidth: 5,
      });
    }
  }

  // ── Stats strip ───────────────────────────────────────────────────────
  const totalPlayups = playups.length;
  const uniquePassers = new Set(playups.map(pu => pu.playerName)).size;
  const uniqueReceivers = new Set(
    playups
      .map(pu => {
        const key = `${pu.startX.toFixed(2)},${pu.startY.toFixed(2)},${pu.endX.toFixed(2)},${pu.endY.toFixed(2)}`;
        return receivedMap.get(key) || '';
      })
      .filter(Boolean),
  ).size;

  const statsY = pitchRect.y + pitchRect.h + 50;
  const stats = [
    ['Playups', String(totalPlayups)],
    ['Platform', String(betweenCount)],
    ['AAA', String(behindCount)],
    ['Passers', String(uniquePassers)],
    ['Receivers', String(uniqueReceivers)],
  ];

  const statSpacing = W / (stats.length + 1);
  for (let i = 0; i < stats.length; i++) {
    const xPos = statSpacing * (i + 1);
    plainText(ctx, stats[i][1], xPos, statsY, tc, 56, {
      weight: 'bold',
      align: 'center',
    });
    plainText(ctx, stats[i][0], xPos, statsY + 68, SHOT_GREY, 28, {
      align: 'center',
    });
  }
}

export function renderCrossMap(
  canvas: HTMLCanvasElement,
  events: GraphicEvent[],
  options: CrossMapOptions,
  scaleFactor?: number,
): void {
  const effectiveScale = scaleFactor ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2);
  const W = CROSS_CANVAS_W;
  const H = CROSS_CANVAS_H;
  canvas.width = W * effectiveScale;
  canvas.height = H * effectiveScale;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(effectiveScale, effectiveScale);

  const bg = SHOT_BG;
  const fc = SHOT_TEXT;
  const successColor = '#16a34a';
  const failureColor = '#dc2626';

  const getCrossOutcome = (eventType: string): 'success' | 'failure' | 'unknown' => {
    const t = eventType.toLowerCase();
    if (t.includes('(s)') || t.includes('successful')) return 'success';
    if (t.includes('(u)') || t.includes('unsuccessful')) return 'failure';
    return 'unknown';
  };

  const crosses = events.filter(e => e.eventType.toLowerCase().startsWith('cross'));
  const successful = crosses.filter(e => getCrossOutcome(e.eventType) === 'success');
  const unsuccessful = crosses.filter(e => getCrossOutcome(e.eventType) === 'failure');

  const normalizedCrosses = crosses.map(cross => {
    const hasEnd = !(cross.endX === 0 && cross.endY === 0);
    // In half-pitch mode we normalize events to the attacking-right frame.
    // Use average X so crosses entirely on the left side are mirrored reliably.
    const avgX = hasEnd ? (cross.startX + cross.endX) / 2 : cross.startX;
    const attacksLeft = avgX < 50;
    if (!attacksLeft) return cross;

    return {
      ...cross,
      startX: 100 - cross.startX,
      startY: 100 - cross.startY,
      endX: hasEnd ? 100 - cross.endX : cross.endX,
      endY: hasEnd ? 100 - cross.endY : cross.endY,
    };
  });

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const titleY = 50;
  plainText(ctx, options.teamName, W / 2, titleY, options.teamColor || successColor, 64, {
    weight: 'bold',
    align: 'center',
  });
  plainText(ctx, options.subtitle, W / 2, titleY + 76, fc, 36, {
    weight: 'bold',
    align: 'center',
  });

  const legendY = 214;
  let legendX = W * 0.16;
  filledCircle(ctx, legendX, legendY + 6, 11, successColor, fc, 2);
  plainText(ctx, `Successful (${successful.length})`, legendX + 22, legendY - 8, fc, 24);
  legendX += ctx.measureText(`Successful (${successful.length})`).width + 70;
  filledCircle(ctx, legendX, legendY + 6, 11, failureColor, fc, 2);
  plainText(ctx, `Unsuccessful (${unsuccessful.length})`, legendX + 22, legendY - 8, fc, 24);

  const pitchAspect = PW / (PL / 2);
  const pitchPadX = 145;
  const pitchPadTop = 280;
  const pitchPadBot = 160;
  const availW = W - pitchPadX * 2;
  const availH = H - pitchPadTop - pitchPadBot;
  let pitchW: number;
  let pitchH: number;
  if (availW / pitchAspect <= availH) {
    pitchW = availW;
    pitchH = availW / pitchAspect;
  } else {
    pitchH = availH;
    pitchW = availH * pitchAspect;
  }
  const pitchRect: Rect = {
    x: (W - pitchW) / 2,
    y: pitchPadTop,
    w: pitchW,
    h: pitchH,
  };
  drawHalfPitch(ctx, pitchRect, bg, fc);

  for (const cross of normalizedCrosses) {
    const isSuccessful = getCrossOutcome(cross.eventType) === 'success';
    const color = isSuccessful ? successColor : failureColor;

    const clampHalfX = (x: number) => Math.max(50, Math.min(100, x));
    const clampY = (y: number) => Math.max(0, Math.min(100, y));

    const startX = clampHalfX(cross.startX);
    const startY = clampY(cross.startY);

    const [sx, sy] = optaHalf(startX, startY, pitchRect);
    const hasEnd = !(cross.endX === 0 && cross.endY === 0);
    const endX = hasEnd ? clampHalfX(cross.endX) : startX;
    const endY = hasEnd ? clampY(cross.endY) : startY;
    const [ex, ey] = optaHalf(endX, endY, pitchRect);

    drawArrow(ctx, sx, sy, ex, ey, color, 4.8, 15, bg);
    filledCircle(ctx, sx, sy, 9, color, fc, 2);

    if (hasEnd) {
      if (isSuccessful) {
        diamond(ctx, ex, ey, 10, color, fc, 2);
      } else {
        const size = 10;
        line(ctx, ex - size, ey - size, ex + size, ey + size, color, 4);
        line(ctx, ex - size, ey + size, ex + size, ey - size, color, 4);
      }
    }
  }

  const statsY = pitchRect.y + pitchRect.h + 44;
  plainText(ctx, `Crosses (${crosses.length})`, W / 2, statsY, options.teamColor || successColor, 50, {
    weight: 'bold',
    align: 'center',
  });
  plainText(ctx, `${successful.length} successful • ${unsuccessful.length} unsuccessful`, W / 2, statsY + 52, fc, 28, {
    align: 'center',
  });
}

export function renderDriveSlipMap(
  canvas: HTMLCanvasElement,
  events: GraphicEvent[],
  options: DriveSlipMapOptions,
  scaleFactor?: number,
): void {
  const effectiveScale = scaleFactor ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2);
  const W = PLAYUP_CANVAS_W;
  const H = PLAYUP_CANVAS_H;
  canvas.width = W * effectiveScale;
  canvas.height = H * effectiveScale;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(effectiveScale, effectiveScale);

  const bg = SHOT_BG;
  const tc = options.teamColor || '#5B21B6';
  const fc = SHOT_TEXT;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const rawDriveEvents = events.filter(e => ['drive', 'slip'].includes(e.eventType.toLowerCase()));
  const receiverMap = new Map<string, string>();
  events
    .filter(e => e.eventType.toLowerCase() === 'slip received')
    .forEach(e => {
      const key = `${(e.driveStartX ?? -1).toFixed(2)},${(e.driveStartY ?? -1).toFixed(2)},${e.startX.toFixed(2)},${e.startY.toFixed(2)},${e.endX.toFixed(2)},${e.endY.toFixed(2)}`;
      receiverMap.set(key, e.playerName);
    });

  const drives = rawDriveEvents.map(ev => {
    const origKey = `${(ev.driveStartX ?? -1).toFixed(2)},${(ev.driveStartY ?? -1).toFixed(2)},${ev.startX.toFixed(2)},${ev.startY.toFixed(2)},${ev.endX.toFixed(2)},${ev.endY.toFixed(2)}`;
    if (ev.endX < ev.startX) {
      const mirrored = {
        ...ev,
        driveStartX: ev.driveStartX !== undefined ? 100 - ev.driveStartX : undefined,
        driveStartY: ev.driveStartY !== undefined ? 100 - ev.driveStartY : undefined,
        startX: 100 - ev.startX,
        startY: 100 - ev.startY,
        endX: 100 - ev.endX,
        endY: 100 - ev.endY,
      };
      const receiver = receiverMap.get(origKey);
      if (receiver) {
        const mirroredKey = `${(mirrored.driveStartX ?? -1).toFixed(2)},${(mirrored.driveStartY ?? -1).toFixed(2)},${mirrored.startX.toFixed(2)},${mirrored.startY.toFixed(2)},${mirrored.endX.toFixed(2)},${mirrored.endY.toFixed(2)}`;
        receiverMap.set(mirroredKey, receiver);
      }
      return mirrored;
    }
    return ev;
  });

  const titleY = 50;
  plainText(ctx, options.teamName, W / 2, titleY, tc, 64, {
    weight: 'bold',
    align: 'center',
  });
  plainText(ctx, `${options.subtitle}`, W / 2, titleY + 76, fc, 36, {
    weight: 'bold',
    align: 'center',
  });

  const dribbleColor = adjustColor(tc, 0, 0.25);
  const passColor = tc;
  const receiverColor = adjustColor(tc, 0, 0.1);

  const legendY = 195;
  let lx = W * 0.12;
  ctx.save();
  ctx.setLineDash([14, 10]);
  line(ctx, lx, legendY + 6, lx + 36, legendY + 6, dribbleColor, 4);
  ctx.restore();
  plainText(ctx, 'Dribble (dashed)', lx + 48, legendY - 8, fc, 24);
  lx += ctx.measureText('Dribble (dashed)').width + 100;

  line(ctx, lx, legendY + 6, lx + 36, legendY + 6, passColor, 4);
  plainText(ctx, 'Pass (solid)', lx + 48, legendY - 8, fc, 24);
  lx += ctx.measureText('Pass (solid)').width + 90;

  diamond(ctx, lx, legendY + 6, 10, receiverColor, fc, 2);
  plainText(ctx, 'Receiver', lx + 24, legendY - 8, fc, 24);

  const dirX0 = W * 0.88;
  const dirX1 = W * 0.90;
  drawArrow(ctx, dirX0 - 40, legendY + 6, dirX1, legendY + 6, SHOT_GREY, 2.4, 14);
  plainText(ctx, 'Attack', dirX0, legendY + 22, SHOT_GREY, 20, { align: 'center' });

  const pitchAspect = PL / PW;
  const pitchPadX = 100;
  const pitchPadTop = 250;
  const pitchPadBot = 200;
  const availW = W - pitchPadX * 2;
  const availH = H - pitchPadTop - pitchPadBot;
  let pitchW: number, pitchH: number;
  if (availW / pitchAspect <= availH) {
    pitchW = availW;
    pitchH = availW / pitchAspect;
  } else {
    pitchH = availH;
    pitchW = availH * pitchAspect;
  }
  const pitchRect: Rect = {
    x: (W - pitchW) / 2,
    y: pitchPadTop,
    w: pitchW,
    h: pitchH,
  };
  drawFullPitch(ctx, pitchRect, bg, fc);

  for (const ev of drives) {
    const dribbleStartX = ev.driveStartX ?? ev.startX;
    const dribbleStartY = ev.driveStartY ?? ev.startY;
    const [dx0, dy0] = optaFull(dribbleStartX, dribbleStartY, pitchRect);
    const [dx1, dy1] = optaFull(ev.startX, ev.startY, pitchRect);
    const [px1, py1] = optaFull(ev.endX, ev.endY, pitchRect);

    ctx.save();
    ctx.setLineDash([14, 10]);
    line(ctx, dx0, dy0, dx1, dy1, dribbleColor, 3.2);
    ctx.restore();

    drawArrow(ctx, dx1, dy1, px1, py1, passColor, 3.6, 16);

    filledCircle(ctx, dx0, dy0, 8, dribbleColor, fc, 2);
    filledCircle(ctx, dx1, dy1, 7, passColor, fc, 2);
    diamond(ctx, px1, py1, 10, receiverColor, fc, 2);
  }

  // Collision-aware player labels (same strategy as playup map).
  const LABEL_FONT = 20;
  const LABEL_PAD = 4;
  ctx.font = `bold ${LABEL_FONT}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  interface LabelRect { x: number; y: number; w: number; h: number }
  const placed: LabelRect[] = [];

  function rectsOverlap(a: LabelRect, b: LabelRect): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function overlapArea(a: LabelRect, b: LabelRect): number {
    const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return ox * oy;
  }

  function totalOverlap(r: LabelRect): number {
    let sum = 0;
    for (const p of placed) {
      if (rectsOverlap(r, p)) sum += overlapArea(r, p);
    }
    return sum;
  }

  const dribblerOffsets: [number, number, CanvasTextAlign][] = [
    [-14, 14, 'right'],
    [14, -24, 'left'],
    [-14, -24, 'right'],
    [14, 14, 'left'],
    [-14, 34, 'right'],
    [14, 34, 'left'],
    [-14, -44, 'right'],
    [14, -44, 'left'],
  ];

  const receiverOffsets: [number, number, CanvasTextAlign][] = [
    [16, -8, 'left'],
    [-16, -8, 'right'],
    [16, -28, 'left'],
    [-16, -28, 'right'],
    [16, 16, 'left'],
    [-16, 16, 'right'],
    [16, -48, 'left'],
    [16, 36, 'left'],
  ];

  function placeLabel(
    text: string,
    anchorX: number, anchorY: number,
    candidates: [number, number, CanvasTextAlign][],
  ): { x: number; y: number; align: CanvasTextAlign } {
    const tw = ctx.measureText(text).width;
    const th = LABEL_FONT;

    let best = candidates[0];
    let bestOverlap = Infinity;

    for (const [dx, dy, align] of candidates) {
      const lx = align === 'right' ? anchorX + dx - tw : anchorX + dx;
      const ly = anchorY + dy;
      const rect: LabelRect = {
        x: lx - LABEL_PAD, y: ly - LABEL_PAD,
        w: tw + LABEL_PAD * 2, h: th + LABEL_PAD * 2,
      };
      const ov = totalOverlap(rect);
      if (ov === 0) {
        placed.push(rect);
        return { x: anchorX + dx, y: anchorY + dy, align };
      }
      if (ov < bestOverlap) {
        bestOverlap = ov;
        best = [dx, dy, align];
      }
    }

    const [dx, dy, align] = best;
    const lx = align === 'right' ? anchorX + dx - tw : anchorX + dx;
    placed.push({
      x: lx - LABEL_PAD, y: anchorY + dy - LABEL_PAD,
      w: tw + LABEL_PAD * 2, h: LABEL_FONT + LABEL_PAD * 2,
    });
    return { x: anchorX + dx, y: anchorY + dy, align };
  }

  for (const ev of drives) {
    const [sx, sy] = optaFull(ev.startX, ev.startY, pitchRect);
    const pos = placeLabel(ev.playerName, sx, sy, dribblerOffsets);
    outlinedText(ctx, ev.playerName, pos.x, pos.y, fc, bg, LABEL_FONT, {
      weight: 'bold',
      align: pos.align,
      outlineWidth: 5,
    });
  }

  for (const ev of drives) {
    const [ex, ey] = optaFull(ev.endX, ev.endY, pitchRect);
    const key = `${(ev.driveStartX ?? -1).toFixed(2)},${(ev.driveStartY ?? -1).toFixed(2)},${ev.startX.toFixed(2)},${ev.startY.toFixed(2)},${ev.endX.toFixed(2)},${ev.endY.toFixed(2)}`;
    const receiver = receiverMap.get(key) || '';
    if (receiver) {
      const pos = placeLabel(receiver, ex, ey, receiverOffsets);
      outlinedText(ctx, receiver, pos.x, pos.y, fc, bg, LABEL_FONT, {
        weight: 'bold',
        align: pos.align,
        outlineWidth: 5,
      });
    }
  }

  const driveCount = drives.length;
  const receiveCount = events.filter(e => e.eventType.toLowerCase() === 'slip received').length;
  const uniqueDribblers = new Set(drives.map(d => d.playerName)).size;

  const statsY = pitchRect.y + pitchRect.h + 50;
  const stats = [
    ['Drive + Slip', String(driveCount)],
    ['Slip Received', String(receiveCount)],
    ['Dribblers', String(uniqueDribblers)],
  ];

  const statSpacing = W / (stats.length + 1);
  for (let i = 0; i < stats.length; i++) {
    const xPos = statSpacing * (i + 1);
    plainText(ctx, stats[i][1], xPos, statsY, tc, 56, {
      weight: 'bold',
      align: 'center',
    });
    plainText(ctx, stats[i][0], xPos, statsY + 68, SHOT_GREY, 28, {
      align: 'center',
    });
  }
}

export function renderEventSequenceMap(
  canvas: HTMLCanvasElement,
  events: GraphicEvent[],
  options: EventSequenceMapOptions,
  scaleFactor?: number,
): void {
  const effectiveScale = scaleFactor ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2);
  const W = PLAYUP_CANVAS_W;
  const H = PLAYUP_CANVAS_H;
  canvas.width = W * effectiveScale;
  canvas.height = H * effectiveScale;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(effectiveScale, effectiveScale);

  const bg = SHOT_BG;
  const tc = options.teamColor || '#001E44';
  const fc = SHOT_TEXT;
  const sequenceMarkerRadius = 24;

  const directionalEvents = events.filter(e => !(e.endX === 0 && e.endY === 0));

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const titleY = 50;
  plainText(ctx, options.teamName, W / 2, titleY, tc, 64, {
    weight: 'bold',
    align: 'center',
  });
  plainText(ctx, `${options.subtitle}`, W / 2, titleY + 76, fc, 36, {
    weight: 'bold',
    align: 'center',
  });

  const typeCounts = new Map<string, number>();
  const renderedSegments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const markerEvents = (options.markerEvents ?? directionalEvents).filter(e => !(e.endX === 0 && e.endY === 0));

  for (const ev of directionalEvents) {
    typeCounts.set(ev.eventType, (typeCounts.get(ev.eventType) || 0) + 1);
  }

  const firstTouchByPlayerInSequence = new Map<string, { x: number; y: number }>();
  const getSequenceKey = (ev: GraphicEvent) => ev.sequenceId || (ev.parentEventId ? `chain-${ev.parentEventId}` : 'ungrouped');
  for (const ev of directionalEvents) {
    if (!ev.playerName) continue;
    const perSequencePlayerKey = `${getSequenceKey(ev)}::${ev.playerName}`;
    if (firstTouchByPlayerInSequence.has(perSequencePlayerKey)) continue;

    const isReceivedEvent = ev.eventType.toLowerCase().includes('received');
    const isChainedPassReceiver = ev.eventType.toLowerCase() === 'pass' && !!ev.sequenceId;
    const hasValidEnd = !(ev.endX === 0 && ev.endY === 0);
    firstTouchByPlayerInSequence.set(
      perSequencePlayerKey,
      (isReceivedEvent || isChainedPassReceiver) && hasValidEnd
        ? { x: ev.endX, y: ev.endY }
        : { x: ev.startX, y: ev.startY },
    );
  }

  const legendY = 190;
  let ly = legendY;
  const legendMaxWidth = W * 0.84;
  const legendGap = 18;

  const drawLegendSample = (x: number, y: number, style: EventSequenceStyle) => {
    ctx.save();
    if (style.lineStyle === 'dashed') {
      ctx.setLineDash([12, 8]);
      ctx.lineCap = 'butt';
    } else if (style.lineStyle === 'dotted') {
      ctx.setLineDash([0, Math.max(8, style.lineWidth * 2.2)]);
      ctx.lineCap = 'round';
    } else {
      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
    }
    line(ctx, x, y, x + 34, y, style.color, Math.max(2, style.lineWidth));
    ctx.restore();
  };

  const legendItems = [...typeCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([eventType, count]) => {
      const style = options.eventStyles[eventType] ?? {
        color: tc,
        lineStyle: 'solid',
        lineWidth: 6,
      };
      const label = `${eventType} (${count})`;
      ctx.font = `normal 22px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      const width = ctx.measureText(label).width + 44;
      return { style, label, width };
    });

  const rows: Array<Array<(typeof legendItems)[number]>> = [];
  let currentRow: Array<(typeof legendItems)[number]> = [];
  let currentRowWidth = 0;

  for (const item of legendItems) {
    const nextWidth = currentRow.length === 0 ? item.width : currentRowWidth + legendGap + item.width;
    if (currentRow.length > 0 && nextWidth > legendMaxWidth) {
      rows.push(currentRow);
      currentRow = [item];
      currentRowWidth = item.width;
    } else {
      currentRow.push(item);
      currentRowWidth = nextWidth;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  const pitchAspect = PL / PW;
  const pitchPadX = 100;
  const pitchPadTop = 190;
  const pitchPadBot = 170;
  const availW = W - pitchPadX * 2;
  const availH = H - pitchPadTop - pitchPadBot;
  let pitchW: number, pitchH: number;
  if (availW / pitchAspect <= availH) {
    pitchW = availW;
    pitchH = availW / pitchAspect;
  } else {
    pitchH = availH;
    pitchW = availH * pitchAspect;
  }
  const pitchRect: Rect = {
    x: (W - pitchW) / 2,
    y: pitchPadTop,
    w: pitchW,
    h: pitchH,
  };
  drawFullPitch(ctx, pitchRect, bg, fc);

  // Draw all the lines first
  for (const ev of directionalEvents) {
    const style = options.eventStyles[ev.eventType] ?? {
      color: tc,
      lineStyle: 'solid',
      lineWidth: 6,
    };
    const [sx, sy] = optaFull(ev.startX, ev.startY, pitchRect);
    const [ex, ey] = optaFull(ev.endX, ev.endY, pitchRect);

    ctx.save();
    if (style.lineStyle === 'dashed') {
      ctx.setLineDash([12, 8]);
      ctx.lineCap = 'butt';
    } else if (style.lineStyle === 'dotted') {
      ctx.setLineDash([0, Math.max(8, style.lineWidth * 2.2)]);
      ctx.lineCap = 'round';
    } else {
      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
    }
    line(ctx, sx, sy, ex, ey, style.color, Math.max(2.5, style.lineWidth + 1));
    renderedSegments.push({ x1: sx, y1: sy, x2: ex, y2: ey });
    ctx.restore();
  }

  // Draw all endpoint arrows on top (so they appear over the lines)
  for (const ev of directionalEvents) {
    const style = options.eventStyles[ev.eventType] ?? {
      color: tc,
      lineStyle: 'solid',
      lineWidth: 6,
    };
    const [sx, sy] = optaFull(ev.startX, ev.startY, pitchRect);
    const [ex, ey] = optaFull(ev.endX, ev.endY, pitchRect);
    const angle = Math.atan2(ey - sy, ex - sx);
    const head = 16;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - head * Math.cos(angle - Math.PI / 6), ey - head * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(ex - head * Math.cos(angle + Math.PI / 6), ey - head * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = style.color;
    ctx.fill();
  }

  for (const ev of markerEvents) {
    const style = options.eventStyles[ev.eventType] ?? {
      color: tc,
      lineStyle: 'solid',
      lineWidth: 6,
    };
    const [sx, sy] = optaFull(ev.startX, ev.startY, pitchRect);

    filledCircle(ctx, sx, sy, sequenceMarkerRadius, style.color, fc, 2.6);
    if (typeof ev.playerId === 'number') {
      outlinedText(ctx, String(ev.playerId), sx, sy, '#FFFFFF', '#0F172A', 22, {
        weight: 'bold',
        align: 'center',
        baseline: 'middle',
        outlineWidth: 3,
      });
    }
  }

  // Label each player once at the first touch point in the sequence.
  const placedLabelRects: Array<{ x: number; y: number; w: number; h: number }> = [];

  const expandedRect = (rect: { x: number; y: number; w: number; h: number }, pad: number) => ({
    x: rect.x - pad,
    y: rect.y - pad,
    w: rect.w + pad * 2,
    h: rect.h + pad * 2,
  });

  const isPointInRect = (px: number, py: number, rect: { x: number; y: number; w: number; h: number }) => {
    return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
  };

  const segmentsIntersect = (
    a1x: number, a1y: number, a2x: number, a2y: number,
    b1x: number, b1y: number, b2x: number, b2y: number,
  ) => {
    const cross = (x1: number, y1: number, x2: number, y2: number) => x1 * y2 - y1 * x2;
    const rX = a2x - a1x;
    const rY = a2y - a1y;
    const sX = b2x - b1x;
    const sY = b2y - b1y;
    const denom = cross(rX, rY, sX, sY);
    if (Math.abs(denom) < 1e-6) return false;
    const uNum = cross(b1x - a1x, b1y - a1y, rX, rY);
    const tNum = cross(b1x - a1x, b1y - a1y, sX, sY);
    const t = tNum / denom;
    const u = uNum / denom;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  };

  const segmentHitsRect = (seg: { x1: number; y1: number; x2: number; y2: number }, rect: { x: number; y: number; w: number; h: number }, pad: number) => {
    const r = expandedRect(rect, pad);
    if (isPointInRect(seg.x1, seg.y1, r) || isPointInRect(seg.x2, seg.y2, r)) return true;

    const left = { x1: r.x, y1: r.y, x2: r.x, y2: r.y + r.h };
    const right = { x1: r.x + r.w, y1: r.y, x2: r.x + r.w, y2: r.y + r.h };
    const top = { x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y };
    const bottom = { x1: r.x, y1: r.y + r.h, x2: r.x + r.w, y2: r.y + r.h };

    return (
      segmentsIntersect(seg.x1, seg.y1, seg.x2, seg.y2, left.x1, left.y1, left.x2, left.y2) ||
      segmentsIntersect(seg.x1, seg.y1, seg.x2, seg.y2, right.x1, right.y1, right.x2, right.y2) ||
      segmentsIntersect(seg.x1, seg.y1, seg.x2, seg.y2, top.x1, top.y1, top.x2, top.y2) ||
      segmentsIntersect(seg.x1, seg.y1, seg.x2, seg.y2, bottom.x1, bottom.y1, bottom.x2, bottom.y2)
    );
  };

  const rectsOverlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, pad = 6) => {
    const aa = expandedRect(a, pad);
    const bb = expandedRect(b, pad);
    return aa.x < bb.x + bb.w && aa.x + aa.w > bb.x && aa.y < bb.y + bb.h && aa.y + aa.h > bb.y;
  };

  for (const [sequencePlayerKey, first] of firstTouchByPlayerInSequence.entries()) {
    if (!first) continue;
    const playerName = sequencePlayerKey.split('::')[1] || '';
    if (!playerName) continue;
    const [anchorX, anchorY] = optaFull(first.x, first.y, pitchRect);
    ctx.font = `bold 20px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    const labelW = ctx.measureText(playerName).width;
    const labelH = 24;

    const candidates = [
      { x: anchorX + sequenceMarkerRadius + 10, y: anchorY - sequenceMarkerRadius - 8 },
      { x: anchorX + sequenceMarkerRadius + 10, y: anchorY + 8 },
      { x: anchorX - sequenceMarkerRadius - 10 - labelW, y: anchorY - sequenceMarkerRadius - 8 },
      { x: anchorX - sequenceMarkerRadius - 10 - labelW, y: anchorY + 8 },
      { x: anchorX - labelW / 2, y: anchorY - sequenceMarkerRadius - labelH - 8 },
      { x: anchorX - labelW / 2, y: anchorY + sequenceMarkerRadius + 8 },
    ];

    let chosen = candidates[0];
    for (const c of candidates) {
      const rect = { x: c.x, y: c.y, w: labelW, h: labelH };
      const overlapsLine = renderedSegments.some(seg => segmentHitsRect(seg, rect, 6));
      const overlapsLabel = placedLabelRects.some(existing => rectsOverlap(existing, rect));
      const outOfBounds =
        rect.x < pitchRect.x + 4 ||
        rect.y < pitchRect.y + 4 ||
        rect.x + rect.w > pitchRect.x + pitchRect.w - 4 ||
        rect.y + rect.h > pitchRect.y + pitchRect.h - 4;
      if (!overlapsLine && !overlapsLabel && !outOfBounds) {
        chosen = c;
        break;
      }
    }

    const placed = { x: chosen.x, y: chosen.y, w: labelW, h: labelH };
    placedLabelRects.push(placed);
    outlinedText(ctx, playerName, chosen.x, chosen.y, fc, '#FFFFFF', 20, {
      weight: 'bold',
      outlineWidth: 3,
    });
  }

  const bottomLegendTop = pitchRect.y + pitchRect.h + 48;
  ly = bottomLegendTop;
  for (const row of rows) {
    const rowWidth = row.reduce((sum, item) => sum + item.width, 0) + legendGap * Math.max(0, row.length - 1);
    let lx = (W - rowWidth) / 2;
    for (const item of row) {
      drawLegendSample(lx, ly + 4, item.style);
      plainText(ctx, item.label, lx + 44, ly - 8, fc, 22);
      lx += item.width + legendGap;
    }
    ly += 34;
  }
}

/** Shift a hex colour's hue and lighten it. */
function adjustColor(hex: string, hueDeg: number, lighten: number): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  h = ((h * 360 + hueDeg) % 360) / 360;
  if (h < 0) h += 1;
  const nl = Math.min(1, l + lighten);

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q2 = nl < 0.5 ? nl * (1 + s) : nl + s - nl * s;
  const p2 = 2 * nl - q2;
  const rr = Math.round(hue2rgb(p2, q2, h + 1 / 3) * 255);
  const gg = Math.round(hue2rgb(p2, q2, h) * 255);
  const bb = Math.round(hue2rgb(p2, q2, h - 1 / 3) * 255);

  return `#${rr.toString(16).padStart(2, '0')}${gg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Shot / xG Map renderer
// ═══════════════════════════════════════════════════════════════════════════

export const SHOT_CANVAS_W = 1600;
export const SHOT_CANVAS_H = 2200;

export function renderShotMap(
  canvas: HTMLCanvasElement,
  events: GraphicEvent[],
  options: ShotMapOptions,
  scaleFactor?: number,
): void {
  const effectiveScale = scaleFactor ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2);
  const W = SHOT_CANVAS_W;
  const H = SHOT_CANVAS_H;
  canvas.width = W * effectiveScale;
  canvas.height = H * effectiveScale;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(effectiveScale, effectiveScale);
  const bg = SHOT_BG;
  const tc = options.teamColor || '#001E44';
  const fc = SHOT_TEXT;

  // ── Background ────────────────────────────────────────────────────────
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Prepare shot data ─────────────────────────────────────────────────
  const shots = events
    .filter(e => isShotLikeEventType(e.eventType))
    .map(e => {
      let sx = e.startX;
      let sy = e.startY;
      let ex = e.endX;

      // Mirror if attacking left
      if (ex < 50) {
        sx = 100 - sx;
        sy = 100 - sy;
        ex = 100 - ex;
      }

      const { dist, angle, isHeader, inBounds } = computeShotFeatures(sx, sy, e.eventType);
      const xg = predictXg(dist, angle, isHeader, inBounds);
      const isGoal = e.eventType === 'Goal';
      const size =
        options.sizeBy === 'xg'
          ? xg * 1000 + 60
          : 600 * (1 - dist / 50) + 80;

      return { sx, sy, isGoal, xg, dist, size, player: e.playerName };
    });

  const totalXg = shots.reduce((s, sh) => s + sh.xg, 0);
  const goals = shots.filter(s => s.isGoal).length;
  const avgDist = shots.length
    ? shots.reduce((s, sh) => s + sh.dist, 0) / shots.length
    : 0;

  // ── Title / legend area ───────────────────────────────────────────────
  const titleY = 60;
  plainText(ctx, options.teamName, W / 2, titleY, tc, 64, {
    weight: 'bold',
    align: 'center',
  });
  plainText(ctx, options.subtitle, W / 2, titleY + 76, fc, 40, {
    weight: 'bold',
    align: 'center',
  });

  // xG / distance size legend
  const sizeLabel = options.sizeBy === 'xg' ? 'xG' : 'distance';
  plainText(ctx, `Low ${sizeLabel}`, W * 0.18, 220, fc, 28, { align: 'center' });
  const bubbleSizes =
    options.sizeBy === 'xg'
      ? [0.05, 0.15, 0.3, 0.5, 0.75]
      : [500, 400, 300, 200, 100];
  for (let i = 0; i < bubbleSizes.length; i++) {
    const val = bubbleSizes[i];
    const r =
      options.sizeBy === 'xg'
        ? Math.sqrt((val * 1000 + 60) / Math.PI) * 1.5
        : Math.sqrt(val / Math.PI) * 1.5;
    filledCircle(ctx, W * 0.3 + i * W * 0.1, 226, r, bg, fc, 2);
  }
  plainText(ctx, `High ${sizeLabel}`, W * 0.82, 220, fc, 28, { align: 'center' });

  // Goal / No-goal legend
  plainText(ctx, 'Goal', W * 0.42, 290, fc, 26, { align: 'right' });
  filledCircle(ctx, W * 0.45, 304, 14, tc, fc, 2);
  filledCircle(ctx, W * 0.52, 304, 14, bg, fc, 2);
  plainText(ctx, 'No Goal', W * 0.55, 290, fc, 26);

  // ── Half-pitch ────────────────────────────────────────────────────────
  const halfAspect = PW / (PL / 2); // width / height ≈ 1.295
  const pitchAreaW = W - 160;
  const pitchAreaH = pitchAreaW / halfAspect;
  const pitchRect: Rect = {
    x: 80,
    y: 380,
    w: pitchAreaW,
    h: Math.min(pitchAreaH, H - 700),
  };
  drawHalfPitch(ctx, pitchRect, bg, fc);

  // ── Plot shots ────────────────────────────────────────────────────────
  for (const shot of shots) {
    const [cx, cy] = optaHalf(shot.sx, shot.sy, pitchRect);
    const r = Math.max(6, Math.sqrt(shot.size / Math.PI) * 1.5);
    filledCircle(
      ctx, cx, cy, r,
      shot.isGoal ? tc : bg,
      fc, 2,
    );
  }

  // ── Stats strip ───────────────────────────────────────────────────────
  const statsY = pitchRect.y + pitchRect.h + 60;
  const stats =
    options.sizeBy === 'xg'
      ? [
          ['Shots', String(shots.length)],
          ['Goals', String(goals)],
          ['Total xG', totalXg.toFixed(2)],
          ['xG/Shot', shots.length ? (totalXg / shots.length).toFixed(2) : '—'],
        ]
      : [
          ['Shots', String(shots.length)],
          ['Goals', String(goals)],
          ['Avg Dist (yds)', avgDist.toFixed(1)],
        ];

  const statSpacing = W / (stats.length + 1);
  for (let i = 0; i < stats.length; i++) {
    const xPos = statSpacing * (i + 1);
    plainText(ctx, stats[i][1], xPos, statsY, tc, 56, {
      weight: 'bold',
      align: 'center',
    });
    plainText(ctx, stats[i][0], xPos, statsY + 68, SHOT_GREY, 28, {
      align: 'center',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Defensive Heatmap renderer
// ═══════════════════════════════════════════════════════════════════════════

export const HEATMAP_CANVAS_W = 2200;
export const HEATMAP_CANVAS_H = 1600;

/**
 * Render a defensive heatmap showing spatial density of Tackles & Interceptions.
 * Uses a monochromatic team-colour density (transparent → light tint → full colour)
 * to match the clean, minimal light style of the other graphics.
 */
export function renderDefensiveHeatmap(
  canvas: HTMLCanvasElement,
  events: GraphicEvent[],
  options: HeatmapOptions,
  scaleFactor?: number,
): void {
  const effectiveScale = scaleFactor ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2);
  const W = HEATMAP_CANVAS_W;
  const H = HEATMAP_CANVAS_H;
  canvas.width = W * effectiveScale;
  canvas.height = H * effectiveScale;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(effectiveScale, effectiveScale);

  const bg = SHOT_BG;
  const tc = options.teamColor || '#001E44';
  const fc = SHOT_TEXT;

  // Parse team colour into RGB components for the density ramp
  const tcR = parseInt(tc.slice(1, 3), 16);
  const tcG = parseInt(tc.slice(3, 5), 16);
  const tcB = parseInt(tc.slice(5, 7), 16);

  // ── Background ────────────────────────────────────────────────────────
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Filter defensive events ───────────────────────────────────────────
  const defEvents = events.filter(e => {
    const t = e.eventType.toLowerCase();
    return t === 'tackle' || t === 'interception';
  });

  const tackles = defEvents.filter(e => e.eventType.toLowerCase() === 'tackle');
  const interceptions = defEvents.filter(e => e.eventType.toLowerCase() === 'interception');

  // ── Title area ────────────────────────────────────────────────────────
  const titleY = 50;
  plainText(ctx, options.teamName, W / 2, titleY, tc, 64, {
    weight: 'bold',
    align: 'center',
  });
  plainText(ctx, options.subtitle || 'Defensive Actions', W / 2, titleY + 76, fc, 36, {
    weight: 'bold',
    align: 'center',
  });

  // ── Legend strip ──────────────────────────────────────────────────────
  const legendY = 195;

  // Tackle legend
  let lx = W * 0.12;
  filledCircle(ctx, lx, legendY + 6, 12, tc, fc, 2);
  plainText(ctx, `Tackles (${tackles.length})`, lx + 24, legendY - 8, fc, 26);
  lx += ctx.measureText(`Tackles (${tackles.length})`).width + 80;

  // Interception legend
  diamond(ctx, lx, legendY + 6, 10, tc, fc, 2);
  plainText(ctx, `Interceptions (${interceptions.length})`, lx + 22, legendY - 8, fc, 26);

  // Density gradient legend (monochromatic: light tint → full team colour)
  const gradX = W * 0.72;
  const gradW = W * 0.18;
  const gradH2 = 20;
  const gradY = legendY - 4;
  const hGrad = ctx.createLinearGradient(gradX, 0, gradX + gradW, 0);
  hGrad.addColorStop(0, `rgba(${tcR}, ${tcG}, ${tcB}, 0.05)`);
  hGrad.addColorStop(0.5, `rgba(${tcR}, ${tcG}, ${tcB}, 0.35)`);
  hGrad.addColorStop(1, `rgba(${tcR}, ${tcG}, ${tcB}, 0.85)`);
  ctx.fillStyle = hGrad;
  ctx.fillRect(gradX, gradY, gradW, gradH2);
  ctx.strokeStyle = SHOT_GREY;
  ctx.lineWidth = 1;
  ctx.strokeRect(gradX, gradY, gradW, gradH2);
  plainText(ctx, 'Low', gradX - 8, gradY - 2, SHOT_GREY, 20, { align: 'right' });
  plainText(ctx, 'High', gradX + gradW + 8, gradY - 2, SHOT_GREY, 20);

  // ── Pitch ─────────────────────────────────────────────────────────────
  const pitchAspect = PL / PW;
  const pitchPadX = 100;
  const pitchPadTop = 250;
  const pitchPadBot = 200;
  const availW = W - pitchPadX * 2;
  const availH = H - pitchPadTop - pitchPadBot;
  let pitchW: number, pitchH: number;
  if (availW / pitchAspect <= availH) {
    pitchW = availW;
    pitchH = availW / pitchAspect;
  } else {
    pitchH = availH;
    pitchW = availH * pitchAspect;
  }
  const pitchRect: Rect = {
    x: (W - pitchW) / 2,
    y: pitchPadTop,
    w: pitchW,
    h: pitchH,
  };
  drawFullPitch(ctx, pitchRect, bg, fc);

  // ── Monochromatic Kernel Density Overlay ──────────────────────────────
  if (defEvents.length > 0) {
    const GRID_W = 480;
    const GRID_H = 320;
    const sigma = 24;
    const sigma2 = sigma * sigma;
    const kernelRadius = Math.ceil(sigma * 3);

    // Build density grid
    const density = new Float64Array(GRID_W * GRID_H);
    for (const ev of defEvents) {
      const gx = (ev.startX / 100) * (GRID_W - 1);
      const gy = (ev.startY / 100) * (GRID_H - 1);

      const x0 = Math.max(0, Math.floor(gx - kernelRadius));
      const x1 = Math.min(GRID_W - 1, Math.ceil(gx + kernelRadius));
      const y0 = Math.max(0, Math.floor(gy - kernelRadius));
      const y1 = Math.min(GRID_H - 1, Math.ceil(gy + kernelRadius));

      for (let yi = y0; yi <= y1; yi++) {
        for (let xi = x0; xi <= x1; xi++) {
          const dx = xi - gx;
          const dy = yi - gy;
          const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigma2));
          density[yi * GRID_W + xi] += w;
        }
      }
    }

    let maxD = 0;
    for (let i = 0; i < density.length; i++) {
      if (density[i] > maxD) maxD = density[i];
    }

    // Paint monochromatic density using team colour
    const heatCanvas = document.createElement('canvas');
    heatCanvas.width = GRID_W;
    heatCanvas.height = GRID_H;
    const hctx = heatCanvas.getContext('2d')!;
    const imgData = hctx.createImageData(GRID_W, GRID_H);

    for (let i = 0; i < density.length; i++) {
      const t = maxD > 0 ? density[i] / maxD : 0;
      const idx = i * 4;
      if (t < 0.02) {
        imgData.data[idx] = 0;
        imgData.data[idx + 1] = 0;
        imgData.data[idx + 2] = 0;
        imgData.data[idx + 3] = 0;
      } else {
        // Monochromatic ramp: team colour with increasing opacity
        imgData.data[idx] = tcR;
        imgData.data[idx + 1] = tcG;
        imgData.data[idx + 2] = tcB;
        imgData.data[idx + 3] = Math.round(15 + 210 * t); // 15-225 alpha
      }
    }
    hctx.putImageData(imgData, 0, 0);

    // Draw clipped to pitch
    ctx.save();
    ctx.beginPath();
    ctx.rect(pitchRect.x, pitchRect.y, pitchRect.w, pitchRect.h);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(heatCanvas, pitchRect.x, pitchRect.y, pitchRect.w, pitchRect.h);
    ctx.restore();

    // Redraw pitch lines on top of the density overlay
    drawFullPitch(ctx, pitchRect, 'transparent', fc);
  }

  // ── Plot individual event markers ─────────────────────────────────────
  for (const ev of defEvents) {
    const [px, py] = optaFull(ev.startX, ev.startY, pitchRect);
    if (ev.eventType.toLowerCase() === 'tackle') {
      filledCircle(ctx, px, py, 8, tc, '#FFFFFF', 2);
    } else {
      diamond(ctx, px, py, 8, tc, '#FFFFFF', 2);
    }
  }

  // ── Stats strip ───────────────────────────────────────────────────────
  const statsY = pitchRect.y + pitchRect.h + 50;
  const totalDef = defEvents.length;
  const heatStats = [
    ['Defensive Actions', String(totalDef)],
    ['Tackles', String(tackles.length)],
    ['Interceptions', String(interceptions.length)],
    ['Players', String(new Set(defEvents.map(e => e.playerName)).size)],
  ];

  const heatStatSpacing = W / (heatStats.length + 1);
  for (let i = 0; i < heatStats.length; i++) {
    const xPos = heatStatSpacing * (i + 1);
    plainText(ctx, heatStats[i][1], xPos, statsY, tc, 56, {
      weight: 'bold',
      align: 'center',
    });
    plainText(ctx, heatStats[i][0], xPos, statsY + 68, SHOT_GREY, 28, {
      align: 'center',
    });
  }
}

/**
 * Render a heatmap showing spatial density of Mid Recovery events.
 * Includes dotted tactical guides for pitch thirds and penalty-box edge lanes.
 */
export function renderMidRecoveriesHeatmap(
  canvas: HTMLCanvasElement,
  events: GraphicEvent[],
  options: MidRecoveriesOptions,
  scaleFactor?: number,
): void {
  const effectiveScale = scaleFactor ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2);
  const W = HEATMAP_CANVAS_W;
  const H = HEATMAP_CANVAS_H;
  canvas.width = W * effectiveScale;
  canvas.height = H * effectiveScale;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(effectiveScale, effectiveScale);

  const bg = SHOT_BG;
  const tc = options.teamColor || '#001E44';
  const fc = SHOT_TEXT;

  const tcR = parseInt(tc.slice(1, 3), 16);
  const tcG = parseInt(tc.slice(3, 5), 16);
  const tcB = parseInt(tc.slice(5, 7), 16);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const recoveryEvents = events.filter(e => e.eventType.toLowerCase() === 'mid recovery');

  const titleY = 50;
  plainText(ctx, options.teamName, W / 2, titleY, tc, 64, {
    weight: 'bold',
    align: 'center',
  });
  plainText(ctx, options.subtitle || 'Mid Recoveries', W / 2, titleY + 76, fc, 36, {
    weight: 'bold',
    align: 'center',
  });

  const legendY = 195;

  let lx = W * 0.12;
  filledCircle(ctx, lx, legendY + 6, 12, tc, fc, 2);
  plainText(ctx, `Mid Recoveries (${recoveryEvents.length})`, lx + 24, legendY - 8, fc, 26);

  const gradX = W * 0.72;
  const gradW = W * 0.18;
  const gradH2 = 20;
  const gradY = legendY - 4;
  const hGrad = ctx.createLinearGradient(gradX, 0, gradX + gradW, 0);
  hGrad.addColorStop(0, `rgba(${tcR}, ${tcG}, ${tcB}, 0.05)`);
  hGrad.addColorStop(0.5, `rgba(${tcR}, ${tcG}, ${tcB}, 0.35)`);
  hGrad.addColorStop(1, `rgba(${tcR}, ${tcG}, ${tcB}, 0.85)`);
  ctx.fillStyle = hGrad;
  ctx.fillRect(gradX, gradY, gradW, gradH2);
  ctx.strokeStyle = SHOT_GREY;
  ctx.lineWidth = 1;
  ctx.strokeRect(gradX, gradY, gradW, gradH2);
  plainText(ctx, 'Low', gradX - 8, gradY - 2, SHOT_GREY, 20, { align: 'right' });
  plainText(ctx, 'High', gradX + gradW + 8, gradY - 2, SHOT_GREY, 20);

  const pitchAspect = PL / PW;
  const pitchPadX = 100;
  const pitchPadTop = 250;
  const pitchPadBot = 200;
  const availW = W - pitchPadX * 2;
  const availH = H - pitchPadTop - pitchPadBot;
  let pitchW: number, pitchH: number;
  if (availW / pitchAspect <= availH) {
    pitchW = availW;
    pitchH = availW / pitchAspect;
  } else {
    pitchH = availH;
    pitchW = availH * pitchAspect;
  }
  const pitchRect: Rect = {
    x: (W - pitchW) / 2,
    y: pitchPadTop,
    w: pitchW,
    h: pitchH,
  };
  drawFullPitch(ctx, pitchRect, bg, fc);

  if (recoveryEvents.length > 0) {
    const GRID_W = 480;
    const GRID_H = 320;
    const sigma = 38;
    const sigma2 = sigma * sigma;
    const kernelRadius = Math.ceil(sigma * 3);

    const density = new Float64Array(GRID_W * GRID_H);
    for (const ev of recoveryEvents) {
      const gx = (ev.startX / 100) * (GRID_W - 1);
      const gy = (ev.startY / 100) * (GRID_H - 1);

      const x0 = Math.max(0, Math.floor(gx - kernelRadius));
      const x1 = Math.min(GRID_W - 1, Math.ceil(gx + kernelRadius));
      const y0 = Math.max(0, Math.floor(gy - kernelRadius));
      const y1 = Math.min(GRID_H - 1, Math.ceil(gy + kernelRadius));

      for (let yi = y0; yi <= y1; yi++) {
        for (let xi = x0; xi <= x1; xi++) {
          const dx = xi - gx;
          const dy = yi - gy;
          const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigma2));
          density[yi * GRID_W + xi] += w;
        }
      }
    }

    let maxD = 0;
    for (let i = 0; i < density.length; i++) {
      if (density[i] > maxD) maxD = density[i];
    }

    const heatCanvas = document.createElement('canvas');
    heatCanvas.width = GRID_W;
    heatCanvas.height = GRID_H;
    const hctx = heatCanvas.getContext('2d')!;
    const imgData = hctx.createImageData(GRID_W, GRID_H);

    for (let i = 0; i < density.length; i++) {
      const t = maxD > 0 ? density[i] / maxD : 0;
      const idx = i * 4;
      imgData.data[idx] = tcR;
      imgData.data[idx + 1] = tcG;
      imgData.data[idx + 2] = tcB;
      imgData.data[idx + 3] = Math.round(200 * Math.pow(t, 1.2));
    }
    hctx.putImageData(imgData, 0, 0);

    ctx.save();
    ctx.beginPath();
    ctx.rect(pitchRect.x, pitchRect.y, pitchRect.w, pitchRect.h);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = 'blur(4px)';
    ctx.drawImage(heatCanvas, pitchRect.x, pitchRect.y, pitchRect.w, pitchRect.h);
    ctx.restore();

    drawFullPitch(ctx, pitchRect, 'transparent', fc);
  }

  if (options.showGuides ?? true) {
    drawFullPitchGuides(ctx, pitchRect, {
      lineColor: options.guideColor ?? SHOT_GREY,
      style: options.guideStyle ?? 'dotted',
      lineWidth: options.guideWidth,
      showThirds: options.showThirdsGuides ?? true,
      showPenaltyLanes: options.showPenaltyLaneGuides ?? true,
    });
  }

  for (const ev of recoveryEvents) {
    const [px, py] = optaFull(ev.startX, ev.startY, pitchRect);
    filledCircle(ctx, px, py, 8, tc, '#FFFFFF', 2);

    if (options.showPlayerNames ?? false) {
      outlinedText(ctx, ev.playerName, px + 12, py - 18, fc, bg, 18, {
        weight: 'bold',
        align: 'left',
        outlineWidth: 4,
      });
    }
  }

  const statsY = pitchRect.y + pitchRect.h + 50;
  // Match lane stats to the horizontal guide lines drawn at PA_Y0/PA_Y1.
  const centralLaneMinOptaY = (PA_Y0 / PW) * 100;
  const centralLaneMaxOptaY = (PA_Y1 / PW) * 100;
  const centralRecoveries = recoveryEvents.filter(
    e => e.startY >= centralLaneMinOptaY && e.startY <= centralLaneMaxOptaY,
  ).length;
  const wideRecoveries = recoveryEvents.length - centralRecoveries;
  const stats = [
    ['Total', String(recoveryEvents.length)],
    ['Wide', String(wideRecoveries)],
    ['Central', String(centralRecoveries)],
  ];

  const statSpacing = W / (stats.length + 1);
  for (let i = 0; i < stats.length; i++) {
    const xPos = statSpacing * (i + 1);
    plainText(ctx, stats[i][1], xPos, statsY, tc, 56, {
      weight: 'bold',
      align: 'center',
    });
    plainText(ctx, stats[i][0], xPos, statsY + 68, SHOT_GREY, 28, {
      align: 'center',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  First + Second Ball Map helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Seeded pseudo-random number generator for consistent jitter */
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/** Calculate jitter offset for a point to reduce overplotting */
function calculateJitter(
  x: number, y: number, radius: number,
  denseRadius: number,
  nearby: { x: number; y: number }[],
): { jx: number; jy: number; applied: boolean } {
  // Check if this point has overlapping neighbors
  const overlappingCount = nearby.filter(
    p => Math.hypot(p.x - x, p.y - y) < denseRadius
  ).length;

  if (overlappingCount < 2) {
    // Not dense enough to jitter
    return { jx: 0, jy: 0, applied: false };
  }

  // Create a pseudo-random position based on point location
  const seed1 = x * 73856093 ^ y * 19349663;
  const seed2 = seed1 * 83492791;
  const angle = seededRandom(seed1) * Math.PI * 2;
  const dist = seededRandom(seed2) * radius * 0.4;

  return {
    jx: Math.cos(angle) * dist,
    jy: Math.sin(angle) * dist,
    applied: true,
  };
}

/** Detect zones with high event density and return their bounds */
function matchFirstSecondBalls(
  firstBalls: GraphicEvent[],
  secondBalls: GraphicEvent[],
): Array<{ first: GraphicEvent; second: GraphicEvent }> {
  const pairs: Array<{ first: GraphicEvent; second: GraphicEvent }> = [];
  const usedSecondIndices = new Set<number>();

  for (const fb of firstBalls) {
    // Try to match by sequenceId first
    if (fb.sequenceId) {
      const sbIdx = secondBalls.findIndex(sb => sb.sequenceId === fb.sequenceId);
      if (sbIdx >= 0 && !usedSecondIndices.has(sbIdx)) {
        pairs.push({ first: fb, second: secondBalls[sbIdx] });
        usedSecondIndices.add(sbIdx);
        continue;
      }
    }

    // Fall back to nearest spatial match
    let closestIdx = -1;
    let closestDist = Infinity;
    for (let i = 0; i < secondBalls.length; i++) {
      if (usedSecondIndices.has(i)) continue;
      const sb = secondBalls[i];
      const dist = Math.hypot(sb.startX - fb.startX, sb.startY - fb.startY);
      if (dist < closestDist && dist < 20) {
        // Within 20% of pitch
        closestDist = dist;
        closestIdx = i;
      }
    }

    if (closestIdx >= 0) {
      pairs.push({ first: firstBalls[firstBalls.indexOf(fb)], second: secondBalls[closestIdx] });
      usedSecondIndices.add(closestIdx);
    }
  }

  return pairs;
}

/** Draw arrow indicator showing attacking direction */
function drawAttackingDirectionIndicator(
  ctx: CanvasRenderingContext2D,
  pitchRect: Rect,
  team1Label: string,
  team2Label: string,
  textColor: string,
) {
  // Center both direction labels on their own row between legend and pitch.
  const centerX = pitchRect.x + pitchRect.w / 2;
  const fontSize = 24;
  const yText = pitchRect.y - 44;

  const leftText = `< ${team2Label} attacks`;
  const rightText = `${team1Label} attacks >`;

  // Measure text to guarantee adequate separation regardless of team-name length.
  ctx.save();
  ctx.font = `normal ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const leftWidth = ctx.measureText(leftText).width;
  const rightWidth = ctx.measureText(rightText).width;
  ctx.restore();

  const minGap = 44;
  const halfGap = Math.max((leftWidth + rightWidth) / 4 + minGap, pitchRect.w * 0.14);

  const leftLabelX = centerX - halfGap;
  plainText(ctx, leftText, leftLabelX, yText, textColor, fontSize, {
    weight: 'normal',
    align: 'center',
  });

  const rightLabelX = centerX + halfGap;
  plainText(ctx, rightText, rightLabelX, yText, textColor, fontSize, {
    weight: 'normal',
    align: 'center',
  });
}

/**
 * Render First + Second Ball events on a full pitch with tactical dashed guides.
 */
export function renderFirstSecondBallMap(
  canvas: HTMLCanvasElement,
  events: GraphicEvent[],
  options: FirstSecondBallMapOptions,
  scaleFactor?: number,
): void {
  const effectiveScale = scaleFactor ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2);
  const W = HEATMAP_CANVAS_W;
  // Give this chart more vertical breathing room for title/legend/direction rows.
  const H = HEATMAP_CANVAS_H + 180;
  canvas.width = W * effectiveScale;
  canvas.height = H * effectiveScale;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(effectiveScale, effectiveScale);

  const bg = SHOT_BG;
  const fc = SHOT_TEXT;
  const team1Color = options.team1Color || '#001E44';
  const team2Color = options.team2Color || '#C41E3A';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const firstBalls = events.filter(e => e.eventType.toLowerCase() === 'first ball');
  const secondBalls = events.filter(e => e.eventType.toLowerCase() === 'second ball');
  const ballEvents = events.filter(e => {
    const t = e.eventType.toLowerCase();
    return t === 'first ball' || t === 'second ball';
  });

  const uniqueTeams = [...new Set(ballEvents.map(e => String(e.playerTeam)))].filter(Boolean);
  const team1Id = options.team1Id || uniqueTeams[0] || '1';
  const team2Id = options.team2Id || uniqueTeams.find(t => t !== team1Id) || uniqueTeams[1] || '2';
  const teamColorById = new Map<string, string>();
  const teamLabelById = new Map<string, string>();
  teamColorById.set(team1Id, team1Color);
  teamColorById.set(team2Id, team2Color);
  teamLabelById.set(team1Id, options.team1Name || team1Id);
  teamLabelById.set(team2Id, options.team2Name || team2Id);
  const colorForTeam = (teamId: string | number): string => teamColorById.get(String(teamId)) ?? team1Color;
  const labelForTeam = (teamId: string): string => teamLabelById.get(teamId) ?? teamId;

  const titleY = 50;
  plainText(ctx, options.teamName, W / 2, titleY, fc, 64, {
    weight: 'bold',
    align: 'center',
  });
  plainText(ctx, options.subtitle || 'First + Second Ball Map', W / 2, titleY + 76, fc, 36, {
    weight: 'bold',
    align: 'center',
  });

  const legendY = 195;
  const legendItems: Array<
    | { kind: 'team'; text: string; color: string }
    | { kind: 'shape'; text: string; shape: 'circle' | 'diamond' }
  > = [];

  if (ballEvents.some(e => String(e.playerTeam) === team1Id)) {
    legendItems.push({ kind: 'team', text: labelForTeam(team1Id), color: team1Color });
  }
  if (ballEvents.some(e => String(e.playerTeam) === team2Id)) {
    legendItems.push({ kind: 'team', text: labelForTeam(team2Id), color: team2Color });
  }
  legendItems.push({ kind: 'shape', text: `First Ball (${firstBalls.length})`, shape: 'circle' });
  legendItems.push({ kind: 'shape', text: `Second Ball (${secondBalls.length})`, shape: 'diamond' });

  const legendItemWidth = (item: (typeof legendItems)[number]): number => {
    if (item.kind === 'team') {
      ctx.font = `normal 26px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      return 24 + ctx.measureText(item.text).width + 56;
    }
    ctx.font = `normal 24px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    return 22 + ctx.measureText(item.text).width + 50;
  };

  const totalLegendWidth = legendItems.reduce((sum, item) => sum + legendItemWidth(item), 0);
  let lx = (W - totalLegendWidth) / 2;

  for (const item of legendItems) {
    if (item.kind === 'team') {
      filledCircle(ctx, lx, legendY + 6, 12, item.color, fc, 2);
      plainText(ctx, item.text, lx + 24, legendY - 8, fc, 26);
      lx += legendItemWidth(item);
      continue;
    }

    if (item.shape === 'circle') {
      filledCircle(ctx, lx, legendY + 6, 10, fc, bg, 2);
    } else {
      diamond(ctx, lx, legendY + 6, 9, fc, bg, 2);
    }
    plainText(ctx, item.text, lx + 22, legendY - 8, fc, 24);
    lx += legendItemWidth(item);
  }


  const pitchAspect = PL / PW;
  const pitchPadX = 100;
  const pitchPadTop = 320;
  const pitchPadBot = 200;
  const availW = W - pitchPadX * 2;
  const availH = H - pitchPadTop - pitchPadBot;
  let pitchW: number, pitchH: number;
  if (availW / pitchAspect <= availH) {
    pitchW = availW;
    pitchH = availW / pitchAspect;
  } else {
    pitchH = availH;
    pitchW = availH * pitchAspect;
  }
  const pitchRect: Rect = {
    x: (W - pitchW) / 2,
    y: pitchPadTop,
    w: pitchW,
    h: pitchH,
  };

  drawFullPitch(ctx, pitchRect, bg, fc);

  // Keep pitch uniform with a single background color.

  draw18ZoneGrid(ctx, pitchRect, SHOT_GREY, options.gridStyle ?? 'dotted');
  // Redraw field markings above guides to ensure perfect visual lock with official lines.
  drawFullPitch(ctx, pitchRect, 'transparent', fc);

  // Match first and second balls into pairs
  const ballPairs = matchFirstSecondBalls(firstBalls, secondBalls);

  // Collect all ball positions for dense zone detection
  const allBallPositions = ballEvents.map(e => ({
    x: (e.startX / 100) * pitchRect.w,
    y: (e.startY / 100) * pitchRect.h,
  }));

  // Draw connecting arrows from first to second ball (colored by second-ball winner)
  for (const pair of ballPairs) {
    const team2Id_val = String(pair.second.playerTeam);
    const arrowColor = colorForTeam(team2Id_val);
    const [px1, py1] = optaFull(pair.first.startX, pair.first.startY, pitchRect);
    const [px2, py2] = optaFull(pair.second.startX, pair.second.startY, pitchRect);
    drawArrow(ctx, px1, py1, px2, py2, arrowColor, 1.5, 6);
  }

  // Draw first ball events
  for (const ev of firstBalls) {
    const [px, py] = optaFull(ev.startX, ev.startY, pitchRect);

    // Apply jitter if in a dense zone
    let drawX = px;
    let drawY = py;
    if (options.applyJitterToDense ?? true) {
      const jitterResult = calculateJitter(px, py, 8, 24, allBallPositions.map(p => ({
        x: p.x + pitchRect.x,
        y: p.y + pitchRect.y,
      })));
      if (jitterResult.applied) {
        drawX += jitterResult.jx;
        drawY += jitterResult.jy;
      }
    }

    filledCircle(ctx, drawX, drawY, 12, colorForTeam(ev.playerTeam), '#FFFFFF', 2);
  }

  // Draw second ball events
  for (const ev of secondBalls) {
    const [px, py] = optaFull(ev.startX, ev.startY, pitchRect);

    // Apply jitter if in a dense zone
    let drawX = px;
    let drawY = py;
    if (options.applyJitterToDense ?? true) {
      const jitterResult = calculateJitter(px, py, 8, 24, allBallPositions.map(p => ({
        x: p.x + pitchRect.x,
        y: p.y + pitchRect.y,
      })));
      if (jitterResult.applied) {
        drawX += jitterResult.jx;
        drawY += jitterResult.jy;
      }
    }

    diamond(ctx, drawX, drawY, 12, colorForTeam(ev.playerTeam), '#FFFFFF', 2);
  }

  // Draw attacking direction indicators
  if (options.showAttackingDirection ?? true) {
    drawAttackingDirectionIndicator(
      ctx,
      pitchRect,
      labelForTeam(team1Id),
      labelForTeam(team2Id),
      SHOT_GREY,
    );
  }

  const statsY = pitchRect.y + pitchRect.h + 50;
  const t1Id = team1Id;
  const t2Id = team2Id;
  const t1Label = labelForTeam(t1Id);
  const t2Label = labelForTeam(t2Id);

  const t1First = firstBalls.filter(e => String(e.playerTeam) === t1Id).length;
  const t2First = firstBalls.filter(e => String(e.playerTeam) === t2Id).length;
  const t1Second = secondBalls.filter(e => String(e.playerTeam) === t1Id).length;
  const t2Second = secondBalls.filter(e => String(e.playerTeam) === t2Id).length;

  const pct = (n: number, d: number) => (d > 0 ? ((n / d) * 100).toFixed(1) : '0.0');
  const stats = [
    [`${t1Label} won % of First Balls`, `${pct(t1First, firstBalls.length)}%`],
    [`${t2Label} won % of First Balls`, `${pct(t2First, firstBalls.length)}%`],
    [`${t1Label} won % of Second Balls`, `${pct(t1Second, secondBalls.length)}%`],
    [`${t2Label} won % of Second Balls`, `${pct(t2Second, secondBalls.length)}%`],
  ];

  const statSpacing = W / (stats.length + 1);
  for (let i = 0; i < stats.length; i++) {
    const xPos = statSpacing * (i + 1);
    plainText(ctx, stats[i][1], xPos, statsY, fc, 52, {
      weight: 'bold',
      align: 'center',
    });
    plainText(ctx, stats[i][0], xPos, statsY + 66, SHOT_GREY, 24, {
      align: 'center',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  xG Timeline renderer
// ═══════════════════════════════════════════════════════════════════════════

export const XG_TIMELINE_W = 2200;
export const XG_TIMELINE_H = 1400;

export interface XGTimelineEvent {
  matchMinute: number;   // 0–90+
  eventType: string;     // 'Shot' | 'Goal' etc.
  playerName: string;
  team: string | number; // team identifier
  xg: number;            // expected goals value for this shot
}

export interface XGTimelineOptions {
  team1Name: string;
  team2Name: string;
  team1Color: string;
  team2Color: string;
  subtitle?: string;
  /** Maximum match minute shown on the x-axis (default 90) */
  maxMinute?: number;
}

export function renderXGTimeline(
  canvas: HTMLCanvasElement,
  events: XGTimelineEvent[],
  options: XGTimelineOptions,
  scaleFactor?: number,
): void {
  const effectiveScale = scaleFactor ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2);
  const W = XG_TIMELINE_W;
  const H = XG_TIMELINE_H;
  canvas.width = W * effectiveScale;
  canvas.height = H * effectiveScale;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(effectiveScale, effectiveScale);

  const bg = SHOT_BG;
  const fc = SHOT_TEXT;
  const t1c = options.team1Color || '#001E44';
  const t2c = options.team2Color || '#C41E3A';
  const maxMin = options.maxMinute ?? 90;

  // ── Background ────────────────────────────────────────────────────────
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Title ─────────────────────────────────────────────────────────────
  const titleY = 50;
  plainText(ctx, 'xG Timeline', W / 2, titleY, fc, 56, {
    weight: 'bold',
    align: 'center',
  });
  if (options.subtitle) {
    plainText(ctx, options.subtitle, W / 2, titleY + 68, SHOT_GREY, 30, {
      align: 'center',
    });
  }

  // ── Legend ────────────────────────────────────────────────────────────
  const legendY = options.subtitle ? 175 : 140;
  const legL = W * 0.3;

  // Team 1 legend
  line(ctx, legL - 40, legendY, legL, legendY, t1c, 4);
  filledCircle(ctx, legL - 20, legendY, 6, t1c);
  plainText(ctx, options.team1Name, legL + 14, legendY - 12, fc, 26);

  // Team 2 legend
  const legR = W * 0.65;
  line(ctx, legR - 40, legendY, legR, legendY, t2c, 4);
  filledCircle(ctx, legR - 20, legendY, 6, t2c);
  plainText(ctx, options.team2Name, legR + 14, legendY - 12, fc, 26);

  // Goal marker legend
  const legG = W * 0.88;
  ctx.save();
  ctx.beginPath();
  ctx.arc(legG - 20, legendY, 10, 0, Math.PI * 2);
  ctx.strokeStyle = fc;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = bg;
  ctx.fill();
  // Draw small star inside
  drawStar(ctx, legG - 20, legendY, 6, fc);
  ctx.restore();
  plainText(ctx, 'Goal', legG, legendY - 12, fc, 26);

  // ── Chart area ────────────────────────────────────────────────────────
  const chartLeft = 140;
  const chartRight = W - 80;
  const chartTop = legendY + 55;
  const chartBottom = H - 200;
  const chartW = chartRight - chartLeft;
  const chartH = chartBottom - chartTop;

  // ── Separate events by team ───────────────────────────────────────────
  const sorted = [...events]
    .filter(e => isShotLikeEventType(e.eventType))
    .sort((a, b) => a.matchMinute - b.matchMinute);

  const isTeam1 = (e: XGTimelineEvent) => {
    const t = String(e.team);
    return t === '1' || t === options.team1Name;
  };

  // Build cumulative series for each team
  interface Point { minute: number; cumulXg: number; isGoal: boolean; playerName: string; xg: number; }

  const team1Points: Point[] = [{ minute: 0, cumulXg: 0, isGoal: false, playerName: '', xg: 0 }];
  const team2Points: Point[] = [{ minute: 0, cumulXg: 0, isGoal: false, playerName: '', xg: 0 }];

  let t1cumul = 0;
  let t2cumul = 0;
  for (const ev of sorted) {
    if (isTeam1(ev)) {
      t1cumul += ev.xg;
      team1Points.push({
        minute: ev.matchMinute,
        cumulXg: t1cumul,
        isGoal: ev.eventType === 'Goal',
        playerName: ev.playerName,
        xg: ev.xg,
      });
    } else {
      t2cumul += ev.xg;
      team2Points.push({
        minute: ev.matchMinute,
        cumulXg: t2cumul,
        isGoal: ev.eventType === 'Goal',
        playerName: ev.playerName,
        xg: ev.xg,
      });
    }
  }

  // Extend lines to max minute
  if (team1Points[team1Points.length - 1].minute < maxMin) {
    team1Points.push({ ...team1Points[team1Points.length - 1], minute: maxMin, isGoal: false });
  }
  if (team2Points[team2Points.length - 1].minute < maxMin) {
    team2Points.push({ ...team2Points[team2Points.length - 1], minute: maxMin, isGoal: false });
  }

  // Max xG for y-axis scaling
  const maxXg = Math.max(t1cumul, t2cumul, 0.5);
  const yMax = Math.ceil(maxXg * 4) / 4; // round up to nearest 0.25

  // ── Axes and grid ─────────────────────────────────────────────────────
  const gridColor = '#CCCCCC';
  const axisColor = '#666666';

  // Horizontal gridlines + y-axis labels
  const ySteps = Math.max(1, Math.ceil(yMax / 0.5));
  for (let i = 0; i <= ySteps; i++) {
    const val = (i * yMax) / ySteps;
    const py = chartBottom - (val / yMax) * chartH;
    line(ctx, chartLeft, py, chartRight, py, gridColor, 1);
    plainText(ctx, val.toFixed(2), chartLeft - 16, py - 10, axisColor, 22, {
      align: 'right',
    });
  }

  // Vertical gridlines + x-axis labels (every 15 minutes)
  const xTicks = [0, 15, 30, 45, 60, 75, 90].filter(v => v <= maxMin);
  for (const min of xTicks) {
    const px = chartLeft + (min / maxMin) * chartW;
    line(ctx, px, chartTop, px, chartBottom, gridColor, 1);
    plainText(ctx, `${min}'`, px, chartBottom + 12, axisColor, 22, {
      align: 'center',
    });
  }

  // Half-time dotted line at 45'
  if (maxMin > 45) {
    const htX = chartLeft + (45 / maxMin) * chartW;
    ctx.save();
    ctx.setLineDash([8, 6]);
    line(ctx, htX, chartTop, htX, chartBottom, '#999999', 2);
    ctx.restore();
    plainText(ctx, 'HT', htX, chartTop - 28, '#999999', 20, { align: 'center' });
  }

  // Axis borders
  line(ctx, chartLeft, chartBottom, chartRight, chartBottom, axisColor, 2);
  line(ctx, chartLeft, chartTop, chartLeft, chartBottom, axisColor, 2);

  // Y-axis label
  ctx.save();
  ctx.translate(40, chartTop + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  plainText(ctx, 'Cumulative xG', 0, 0, axisColor, 24, {
    weight: 'bold',
    align: 'center',
  });
  ctx.restore();

  // X-axis label
  plainText(ctx, 'Match Minute', chartLeft + chartW / 2, chartBottom + 55, axisColor, 24, {
    weight: 'bold',
    align: 'center',
  });

  // ── Helper to convert data to canvas coordinates ──────────────────────
  const toCanvasX = (min: number) => chartLeft + (min / maxMin) * chartW;
  const toCanvasY = (xg: number) => chartBottom - (xg / yMax) * chartH;

  // ── Draw team lines (step function style) ─────────────────────────────
  function drawTeamLine(points: Point[], color: string) {
    if (points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(toCanvasX(points[0].minute), toCanvasY(points[0].cumulXg));

    for (let i = 1; i < points.length; i++) {
      // Horizontal step first, then vertical
      const prevY = toCanvasY(points[i - 1].cumulXg);
      const curX = toCanvasX(points[i].minute);
      const curY = toCanvasY(points[i].cumulXg);

      ctx.lineTo(curX, prevY);
      ctx.lineTo(curX, curY);
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  drawTeamLine(team1Points, t1c);
  drawTeamLine(team2Points, t2c);

  // ── Draw event markers ────────────────────────────────────────────────
  function drawEventMarkers(points: Point[], color: string) {
    for (const pt of points) {
      if (pt.minute === 0 && pt.cumulXg === 0) continue;
      const cx = toCanvasX(pt.minute);
      const cy = toCanvasY(pt.cumulXg);

      if (pt.isGoal) {
        // Goal: larger circle with star marker
        filledCircle(ctx, cx, cy, 14, color, '#FFFFFF', 3);
        drawStar(ctx, cx, cy, 8, '#FFFFFF');
      } else {
        // Shot: simple dot
        filledCircle(ctx, cx, cy, 6, color, '#FFFFFF', 2);
      }
    }
  }

  drawEventMarkers(team1Points, t1c);
  drawEventMarkers(team2Points, t2c);

  // ── Goal labels ───────────────────────────────────────────────────────
  function drawGoalLabels(points: Point[], color: string, above: boolean) {
    for (const pt of points) {
      if (!pt.isGoal) continue;
      const cx = toCanvasX(pt.minute);
      const cy = toCanvasY(pt.cumulXg);
      const labelY = above ? cy - 32 : cy + 22;

      // Player name
      plainText(ctx, pt.playerName, cx, labelY, color, 20, {
        weight: 'bold',
        align: 'center',
      });
      // Minute
      plainText(ctx, `${Math.round(pt.minute)}'`, cx, labelY + (above ? -22 : 22), SHOT_GREY, 18, {
        align: 'center',
      });
    }
  }

  drawGoalLabels(team1Points, t1c, true);
  drawGoalLabels(team2Points, t2c, false);

  // ── Final xG Summary ─────────────────────────────────────────────────
  const summaryY = chartBottom + 95;
  const t1Goals = sorted.filter(ev => isTeam1(ev) && ev.eventType === 'Goal').length;
  const t2Goals = sorted.filter(ev => !isTeam1(ev) && ev.eventType === 'Goal').length;

  const statsItems = [
    [options.team1Name, `${t1Goals} goal${t1Goals !== 1 ? 's' : ''}`, t1cumul.toFixed(2) + ' xG'],
    [options.team2Name, `${t2Goals} goal${t2Goals !== 1 ? 's' : ''}`, t2cumul.toFixed(2) + ' xG'],
  ];

  const statSpacing = W / 3;
  for (let i = 0; i < statsItems.length; i++) {
    const xPos = statSpacing * (i + 1);
    const teamCol = i === 0 ? t1c : t2c;
    plainText(ctx, statsItems[i][0], xPos, summaryY, teamCol, 36, {
      weight: 'bold',
      align: 'center',
    });
    plainText(ctx, `${statsItems[i][1]}  •  ${statsItems[i][2]}`, xPos, summaryY + 44, SHOT_GREY, 26, {
      align: 'center',
    });
  }
}

/** Draw a small 5-point star */
function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// ═══════════════════════════════════════════════════════════════════════════
//  Match Report renderer
// ═══════════════════════════════════════════════════════════════════════════

export const REPORT_CANVAS_W = 2200;
export const REPORT_CANVAS_H = 1800;

export interface MatchReportOptions {
  team1Name: string;
  team2Name: string;
  team1Color: string;
  team2Color: string;
  subtitle?: string;
}

/**
 * Render a full-session match report that auto-adapts to whatever event types
 * are present.  Draws a team-vs-team comparison bar + a horizontal bar chart
 * of every event type, plus a top-performers table.
 */
export function renderMatchReport(
  canvas: HTMLCanvasElement,
  events: GraphicEvent[],
  options: MatchReportOptions,
  scaleFactor?: number,
): void {
  const effectiveScale = scaleFactor ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2);
  const W = REPORT_CANVAS_W;

  // ── Pre-scan data to compute dynamic height ─────────────────────────
  const eventTypeSet = new Set<string>();
  events.forEach(e => eventTypeSet.add(e.eventType));
  const eventTypes = [...eventTypeSet].sort();

  const playerKeys = new Set<string>();
  events.forEach(e => playerKeys.add(`${e.playerName}__${e.playerTeam}`));
  const playerRows = Math.min(playerKeys.size, 10);

  const barRowH = 52;
  const rowHeight = 42;
  // header(150) + banners(100) + bars section heading(46) + bars + gap(30)
  // + table heading(44) + header row + data rows + footer(60)
  const H = Math.max(REPORT_CANVAS_H,
    155 + 64 + 36 + 46 + eventTypes.length * barRowH + 30 + 44 + (playerRows + 1) * rowHeight + 80);

  canvas.width = W * effectiveScale;
  canvas.height = H * effectiveScale;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(effectiveScale, effectiveScale);

  const bg = SHOT_BG;
  const fc = SHOT_TEXT;
  const grey = SHOT_GREY;
  const c1 = options.team1Color || '#001E44';
  const c2 = options.team2Color || '#C41E3A';

  // ── Background ──────────────────────────────────────────────────────
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── (event types already gathered above) ────────────────────────────

  // ── Count events per team per type ──────────────────────────────────
  const team1Events = events.filter(e => String(e.playerTeam) === '1');
  const team2Events = events.filter(e => String(e.playerTeam) === '2');

  const counts1: Record<string, number> = {};
  const counts2: Record<string, number> = {};
  eventTypes.forEach(t => { counts1[t] = 0; counts2[t] = 0; });
  team1Events.forEach(e => { counts1[e.eventType] = (counts1[e.eventType] || 0) + 1; });
  team2Events.forEach(e => { counts2[e.eventType] = (counts2[e.eventType] || 0) + 1; });

  const total1 = team1Events.length;
  const total2 = team2Events.length;

  // ── Header ──────────────────────────────────────────────────────────
  const titleY = 50;
  plainText(ctx, 'MATCH REPORT', W / 2, titleY, fc, 56, { weight: 'bold', align: 'center' });
  if (options.subtitle) {
    plainText(ctx, options.subtitle, W / 2, titleY + 68, grey, 32, { align: 'center' });
  }

  // ── Team banners ────────────────────────────────────────────────────
  const bannerY = 155;
  const bannerH = 64;

  // Team 1 left banner
  ctx.fillStyle = c1;
  roundRect(ctx, 60, bannerY, W / 2 - 90, bannerH, 10);
  ctx.fill();
  plainText(ctx, options.team1Name, 80, bannerY + 14, '#FFFFFF', 32, { weight: 'bold' });
  plainText(ctx, `${total1} events`, W / 2 - 60, bannerY + 18, '#FFFFFF', 24, { align: 'right' });

  // Team 2 right banner
  ctx.fillStyle = c2;
  roundRect(ctx, W / 2 + 30, bannerY, W / 2 - 90, bannerH, 10);
  ctx.fill();
  plainText(ctx, options.team2Name, W / 2 + 50, bannerY + 14, '#FFFFFF', 32, { weight: 'bold' });
  plainText(ctx, `${total2} events`, W - 80, bannerY + 18, '#FFFFFF', 24, { align: 'right' });

  // ── Comparison bars section ─────────────────────────────────────────
  const barSectionY = bannerY + bannerH + 36;
  const barInnerPad = 6;
  const barLabelGap = 140;       // gap between center labels and bar start
  const barNumGap = 36;          // gap between bar end and number
  const maxBarW = (W / 2 - barLabelGap - barNumGap - 60);  // leave room for numbers
  const centerX = W / 2;

  // Section heading
  plainText(ctx, 'STATS BREAKDOWN', centerX, barSectionY, fc, 30, { weight: 'bold', align: 'center' });

  const barStartY = barSectionY + 46;

  // Draw comparison bars for each event type
  eventTypes.forEach((evType, i) => {
    const rowY = barStartY + i * barRowH;
    const v1 = counts1[evType] || 0;
    const v2 = counts2[evType] || 0;
    const rowMax = Math.max(v1, v2, 1);

    // Label (center)
    plainText(ctx, evType, centerX, rowY + 4, fc, 22, { weight: '600', align: 'center' });

    // Team 1 bar (grows left from center)
    const bw1 = (v1 / rowMax) * maxBarW;
    const barH = barRowH - barInnerPad * 2 - 20;

    ctx.fillStyle = c1;
    roundRect(ctx, centerX - barLabelGap - bw1, rowY + 26, bw1, barH, 5);
    ctx.fill();
    if (v1 > 0) {
      plainText(ctx, String(v1), centerX - barLabelGap - bw1 - 12, rowY + 26, fc, 20, { weight: 'bold', align: 'right' });
    }

    // Team 2 bar (grows right from center)
    const bw2 = (v2 / rowMax) * maxBarW;
    ctx.fillStyle = c2;
    roundRect(ctx, centerX + barLabelGap, rowY + 26, bw2, barH, 5);
    ctx.fill();
    if (v2 > 0) {
      plainText(ctx, String(v2), centerX + barLabelGap + bw2 + 12, rowY + 26, fc, 20, { weight: 'bold' });
    }
  });

  // ── Top performers table ────────────────────────────────────────────
  const tableY = barStartY + eventTypes.length * barRowH + 30;

  // Compute per-player totals
  const playerTotals: Record<string, { team: string | number; count: number; breakdown: Record<string, number> }> = {};
  events.forEach(e => {
    const key = `${e.playerName}__${e.playerTeam}`;
    if (!playerTotals[key]) {
      playerTotals[key] = { team: e.playerTeam, count: 0, breakdown: {} };
    }
    playerTotals[key].count += 1;
    playerTotals[key].breakdown[e.eventType] = (playerTotals[key].breakdown[e.eventType] || 0) + 1;
  });

  const sortedPlayers = Object.entries(playerTotals)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10);

  // Pick top 4 most common event types as detail columns
  const typeFreq: Record<string, number> = {};
  events.forEach(e => { typeFreq[e.eventType] = (typeFreq[e.eventType] || 0) + 1; });
  const detailCols = Object.entries(typeFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([t]) => t);

  // Section heading
  plainText(ctx, 'TOP PERFORMERS', centerX, tableY, fc, 30, { weight: 'bold', align: 'center' });

  // Table header
  const tblY = tableY + 44;
  const tblX = 80;
  const tblW = W - tblX * 2;
  const nameColW = 360;
  const teamColW = 200;
  const totalColW = 120;
  const fixedW = nameColW + teamColW + totalColW;
  const detColW = detailCols.length > 0 ? Math.floor((tblW - fixedW - 32) / detailCols.length) : 160;

  // Header row background
  ctx.fillStyle = '#DDDDDD';
  roundRect(ctx, tblX, tblY, W - tblX * 2, rowHeight, 6);
  ctx.fill();

  let colX = tblX + 16;
  plainText(ctx, 'Player', colX, tblY + 10, fc, 22, { weight: 'bold' });
  colX += nameColW;
  plainText(ctx, 'Team', colX, tblY + 10, fc, 22, { weight: 'bold' });
  colX += teamColW;
  plainText(ctx, 'Total', colX, tblY + 10, fc, 22, { weight: 'bold' });
  colX += totalColW;
  detailCols.forEach(dc => {
    plainText(ctx, dc, colX, tblY + 10, fc, 22, { weight: 'bold' });
    colX += detColW;
  });

  // Data rows
  sortedPlayers.forEach(([key, data], idx) => {
    const playerName = key.split('__')[0];
    const isTeam1 = String(data.team) === '1';
    const rowY2 = tblY + rowHeight + idx * rowHeight;

    // Alternating row background
    if (idx % 2 === 0) {
      ctx.fillStyle = '#E8E8E8';
      ctx.fillRect(tblX, rowY2, W - tblX * 2, rowHeight);
    }

    // Team color indicator dot
    filledCircle(ctx, tblX + 8, rowY2 + rowHeight / 2, 6, isTeam1 ? c1 : c2);

    let cx = tblX + 16;
    plainText(ctx, playerName || '–', cx, rowY2 + 10, fc, 20);
    cx += nameColW;
    plainText(ctx, isTeam1 ? options.team1Name : options.team2Name, cx, rowY2 + 10, isTeam1 ? c1 : c2, 20, { weight: '600' });
    cx += teamColW;
    plainText(ctx, String(data.count), cx, rowY2 + 10, fc, 20, { weight: 'bold' });
    cx += totalColW;
    detailCols.forEach(dc => {
      const v = data.breakdown[dc] || 0;
      plainText(ctx, v > 0 ? String(v) : '–', cx, rowY2 + 10, v > 0 ? fc : '#BBBBBB', 20);
      cx += detColW;
    });
  });

  // ── Footer branding ─────────────────────────────────────────────────
  plainText(ctx, 'Touchline', W - 60, H - 40, '#CCCCCC', 20, { align: 'right' });
}

/* Rounded-rectangle path helper */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
