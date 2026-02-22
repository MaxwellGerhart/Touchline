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

  // Surface
  ctx.fillStyle = pitchColor;
  ctx.fillRect(r.x, r.y, r.w, r.h);

  // Boundary
  strokeRect(ctx, r.x, r.y, r.w, r.h, lineColor, lw);

  // Halfway
  const [hx0, hy0] = meterFull(PL / 2, 0, r);
  const [, hy1] = meterFull(PL / 2, PW, r);
  line(ctx, hx0, hy0, hx0, hy1, lineColor, lw);

  // Centre circle & spot
  const [ccx, ccy] = meterFull(PL / 2, PW / 2, r);
  const ccr = (CIRCLE_R / PL) * r.w;
  circle(ctx, ccx, ccy, ccr, lineColor, lw);
  filledCircle(ctx, ccx, ccy, 2, lineColor);

  // Penalty areas (both ends)
  for (const xBase of [0, PL]) {
    const isLeft = xBase === 0;

    // Penalty area rect
    const [pax0] = meterFull(isLeft ? 0 : PL - PA_DEPTH, PA_Y0, r);
    const [pax1, pay1] = meterFull(isLeft ? PA_DEPTH : PL, PA_Y1, r);
    const [, pay0] = meterFull(0, PA_Y0, r);
    strokeRect(ctx, pax0, pay0, pax1 - pax0, pay1 - pay0, lineColor, lw);

    // Goal area rect
    const [gax0] = meterFull(isLeft ? 0 : PL - GA_DEPTH, GA_Y0, r);
    const [gax1, gay1] = meterFull(isLeft ? GA_DEPTH : PL, GA_Y1, r);
    const [, gay0] = meterFull(0, GA_Y0, r);
    strokeRect(ctx, gax0, gay0, gax1 - gax0, gay1 - gay0, lineColor, lw);

    // Penalty spot
    const penX = isLeft ? PEN_DIST : PL - PEN_DIST;
    const [psx, psy] = meterFull(penX, PW / 2, r);
    filledCircle(ctx, psx, psy, 2, lineColor);

    // Penalty arc (D outside the penalty area)
    const [pcx, pcy] = meterFull(penX, PW / 2, r);
    const arcR = (CIRCLE_R / PL) * r.w;
    const paEdgeX = isLeft ? PA_DEPTH : PL - PA_DEPTH;
    const [paEdgePx] = meterFull(paEdgeX, 0, r);

    ctx.beginPath();
    const steps = 200;
    let started = false;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const ax = pcx + arcR * Math.cos(t);
      const ay = pcy + arcR * Math.sin(t);
      const outside = isLeft ? ax > paEdgePx : ax < paEdgePx;
      if (outside) {
        if (!started) { ctx.moveTo(ax, ay); started = true; }
        else ctx.lineTo(ax, ay);
      }
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lw;
    ctx.stroke();
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

  // Surface
  ctx.fillStyle = pitchColor;
  ctx.fillRect(r.x, r.y, r.w, r.h);

  // Boundary (goal line at top, halfway at bottom, sidelines)
  strokeRect(ctx, r.x, r.y, r.w, r.h, lineColor, lw);

  // Penalty area
  const [paTL_x, paTL_y] = meterHalf(PL, PA_Y0, r);
  const [paBR_x, paBR_y] = meterHalf(PL - PA_DEPTH, PA_Y1, r);
  strokeRect(ctx, paTL_x, paTL_y, paBR_x - paTL_x, paBR_y - paTL_y, lineColor, lw);

  // Goal area
  const [gaTL_x, gaTL_y] = meterHalf(PL, GA_Y0, r);
  const [gaBR_x, gaBR_y] = meterHalf(PL - GA_DEPTH, GA_Y1, r);
  strokeRect(ctx, gaTL_x, gaTL_y, gaBR_x - gaTL_x, gaBR_y - gaTL_y, lineColor, lw);

  // Penalty spot
  const [psx, psy] = meterHalf(PL - PEN_DIST, PW / 2, r);
  filledCircle(ctx, psx, psy, 2.5, lineColor);

  // Penalty arc (outside penalty area)
  const [pcx, pcy] = meterHalf(PL - PEN_DIST, PW / 2, r);
  const arcRx = (CIRCLE_R / PW) * r.w;
  const arcRy = (CIRCLE_R / (PL / 2)) * r.h;
  const [, paEdgeY] = meterHalf(PL - PA_DEPTH, 0, r);

  ctx.beginPath();
  const steps = 200;
  let started = false;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const ax = pcx + arcRx * Math.cos(t);
    const ay = pcy + arcRy * Math.sin(t);
    if (ay > paEdgeY) {
      if (!started) { ctx.moveTo(ax, ay); started = true; }
      else ctx.lineTo(ax, ay);
    }
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lw;
  ctx.stroke();

  // Centre circle arc (only portion in attacking half)
  const [cx2, cy2] = meterHalf(PL / 2, PW / 2, r);
  const crx = (CIRCLE_R / PW) * r.w;
  const cry = (CIRCLE_R / (PL / 2)) * r.h;

  ctx.beginPath();
  started = false;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const ax = cx2 + crx * Math.cos(t);
    const ay = cy2 + cry * Math.sin(t);
    if (ay < r.y + r.h) { // above halfway line
      if (!started) { ctx.moveTo(ax, ay); started = true; }
      else ctx.lineTo(ax, ay);
    }
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lw;
  ctx.stroke();

  // Centre spot
  filledCircle(ctx, cx2, cy2, 2.5, lineColor);
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
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const bg = SHOT_BG;
  const tc = options.teamColor || '#001E44';
  const fc = SHOT_TEXT;

  // ── Background ────────────────────────────────────────────────────────
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Extract playup & receiver events ──────────────────────────────────
  const rawPlayups = events.filter(e => e.eventType.toLowerCase() === 'playup');
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
  // Final third starts at x ≈ 66.67 (after normalisation, all attack right)
  const FINAL_THIRD = 66.67;
  const betweenColor = tc;                          // team colour
  const behindColor  = adjustColor(tc, 0, 0.35);    // lighter tint of team colour

  const behindCount  = playups.filter(p => p.endX >= FINAL_THIRD).length;
  const betweenCount = playups.length - behindCount;

  function playupColor(pu: GraphicEvent): string {
    return pu.endX >= FINAL_THIRD ? behindColor : betweenColor;
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

  // "Between Lines" legend
  let lx = W * 0.12;
  filledCircle(ctx, lx, legendY + 6, 12, betweenColor, fc, 2);
  plainText(ctx, `Between Lines (${betweenCount})`, lx + 24, legendY - 8, fc, 26);
  lx += ctx.measureText(`Between Lines (${betweenCount})`).width + 70;

  // "In Behind" legend
  filledCircle(ctx, lx, legendY + 6, 12, behindColor, fc, 2);
  plainText(ctx, `In Behind (${behindCount})`, lx + 24, legendY - 8, fc, 26);
  lx += ctx.measureText(`In Behind (${behindCount})`).width + 70;

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
    ['Between Lines', String(betweenCount)],
    ['In Behind', String(behindCount)],
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
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

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
