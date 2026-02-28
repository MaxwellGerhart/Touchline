/**
 * Canvas-based football pitch renderer.
 *
 * Produces Playup Maps and Shot/xG Maps that visually match the
 * PlayupGraphic.ipynb and xGandShotmap.ipynb notebook outputs.
 */

import { computeShotFeatures, predictXg } from './xgModel';

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
  playerName: string;
  playerTeam: string | number;
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

export function renderPlayupMap(
  canvas: HTMLCanvasElement,
  events: GraphicEvent[],
  options: PlayupMapOptions,
): void {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2;
  const W = PLAYUP_CANVAS_W;
  const H = PLAYUP_CANVAS_H;
  canvas.width = W * dpr;
  canvas.height = H * dpr;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

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
): void {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2;
  const W = SHOT_CANVAS_W;
  const H = SHOT_CANVAS_H;
  canvas.width = W * dpr;
  canvas.height = H * dpr;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const bg = SHOT_BG;
  const tc = options.teamColor || '#001E44';
  const fc = SHOT_TEXT;

  // ── Background ────────────────────────────────────────────────────────
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Prepare shot data ─────────────────────────────────────────────────
  const shots = events
    .filter(e => e.eventType === 'Shot' || e.eventType === 'Goal')
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

      const { dist, angle } = computeShotFeatures(sx, sy);
      const xg = predictXg(dist, angle);
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
): void {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2;
  const W = HEATMAP_CANVAS_W;
  const H = HEATMAP_CANVAS_H;
  canvas.width = W * dpr;
  canvas.height = H * dpr;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

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
): void {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2;
  const W = XG_TIMELINE_W;
  const H = XG_TIMELINE_H;
  canvas.width = W * dpr;
  canvas.height = H * dpr;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

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
    .filter(e => e.eventType === 'Shot' || e.eventType === 'Goal')
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
    team1Points.push({ ...team1Points[team1Points.length - 1], minute: maxMin });
  }
  if (team2Points[team2Points.length - 1].minute < maxMin) {
    team2Points.push({ ...team2Points[team2Points.length - 1], minute: maxMin });
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
  const t1Goals = team1Points.filter(p => p.isGoal).length;
  const t2Goals = team2Points.filter(p => p.isGoal).length;

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
): void {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2;
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

  canvas.width = W * dpr;
  canvas.height = H * dpr;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

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
