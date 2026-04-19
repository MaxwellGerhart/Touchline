/**
 * Formula-based xG model using shot angle, shot distance, and header context.
 *
 * Input coordinates are expected in opta-style normalised pitch units (0-100).
 */

const PITCH_LENGTH_M = 105;
const PITCH_WIDTH_M = 68;
const GOAL_WIDTH_M = 7.32;
const GOAL_CENTER_X = PITCH_LENGTH_M;
const GOAL_CENTER_Y = PITCH_WIDTH_M / 2;
const LEFT_POST_Y = GOAL_CENTER_Y - GOAL_WIDTH_M / 2;
const RIGHT_POST_Y = GOAL_CENTER_Y + GOAL_WIDTH_M / 2;

// Coefficients from provided simple xG model.
const B0 = -1.745598;
const B_ANGLE = 1.338737;
const B_DISTANCE = -0.110384;
const B_HEADER = 0.646730;
const B_ANGLE_DISTANCE = 0.168798;
const B_ANGLE_HEADER = -0.424885;
const B_DISTANCE_HEADER = -0.134178;
const B_ANGLE_DISTANCE_HEADER = -0.055093;

/**
 * Replace the built-in model weights at runtime
 * (e.g. after fetching a JSON params file).
 */
export function setModelParams(params: {
  scaler_mean: number[];
  scaler_scale: number[];
  lr_coef: number[];
  lr_intercept: number;
}) {
  // Kept for backward compatibility with older code paths.
  void params;
}

function normalizeEventType(eventType: string | undefined): string {
  return (eventType || '').trim().toLowerCase();
}

export function isHeaderEventType(eventType: string | undefined): boolean {
  return normalizeEventType(eventType).includes('header');
}

export function isShotLikeEventType(eventType: string | undefined): boolean {
  const normalized = normalizeEventType(eventType);
  return normalized === 'shot' || normalized === 'goal' || normalized.includes('header');
}

/**
 * Compute distance-to-goal and angle-subtended-by-goal for a shot.
 *
 * Input: opta normalised coordinates (0–100).
 * Internally converts to StatsBomb coords (120×80) before calculating.
 */
export function computeShotFeatures(
  optaX: number,
  optaY: number,
  eventType?: string,
): { dist: number; angle: number; isHeader: number; inBounds: boolean } {
  const inBounds = optaX >= 0 && optaX <= 100 && optaY >= 0 && optaY <= 100;
  const isHeader = isHeaderEventType(eventType) ? 1 : 0;

  if (!inBounds) {
    return { dist: 0, angle: 0, isHeader, inBounds: false };
  }

  const pitchX = (optaX / 100) * PITCH_LENGTH_M;
  const pitchY = (optaY / 100) * PITCH_WIDTH_M;

  const distToLeftPost = Math.hypot(pitchX - GOAL_CENTER_X, pitchY - LEFT_POST_Y);
  const distToRightPost = Math.hypot(pitchX - GOAL_CENTER_X, pitchY - RIGHT_POST_Y);
  const goalDistance = Math.hypot(GOAL_CENTER_X - pitchX, GOAL_CENTER_Y - pitchY);

  const denominator = 2 * distToLeftPost * distToRightPost;
  const cosAngle = denominator > 0
    ? (distToLeftPost ** 2 + distToRightPost ** 2 - GOAL_WIDTH_M ** 2) / denominator
    : 1;
  const goalAngle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));

  return { dist: goalDistance, angle: goalAngle, isHeader, inBounds: true };
}

/**
 * Predict xG given pre-computed features using the logistic-regression pipeline.
 */
export function predictXg(dist: number, angle: number, isHeader = 0, inBounds = true): number {
  if (!inBounds) return 0;

  const logit =
    B0 +
    B_ANGLE * angle +
    B_DISTANCE * dist +
    B_HEADER * isHeader +
    B_ANGLE_DISTANCE * angle * dist +
    B_ANGLE_HEADER * angle * isHeader +
    B_DISTANCE_HEADER * dist * isHeader +
    B_ANGLE_DISTANCE_HEADER * angle * dist * isHeader;

  return 1 / (1 + Math.exp(-logit));
}

/**
 * Convenience: compute features and predict xG in one call.
 * Expects opta 0–100 coordinates (after direction normalisation).
 */
export function getXgForShot(optaX: number, optaY: number, eventType?: string): number {
  const { dist, angle, isHeader, inBounds } = computeShotFeatures(optaX, optaY, eventType);
  return predictXg(dist, angle, isHeader, inBounds);
}
