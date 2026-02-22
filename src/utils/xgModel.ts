/**
 * xG (Expected Goals) prediction model.
 *
 * Implements the same logistic regression pipeline as the xGandShotmap notebook:
 *   StandardScaler → LogisticRegression
 *
 * Default parameters are reasonable approximations.
 * To load exact parameters from your trained xg_model.pkl, run:
 *   python extract_xg_model.py
 * and paste the output constants below.
 */

// ── StatsBomb pitch constants ────────────────────────────────────────────────
const GOAL_X_SB = 120.0;
const GOAL_Y_SB = 40.0;
const GOAL_WIDTH_SB = 7.32; // metres (goal width)

// ── Model parameters (extracted from xg_model.pkl via extract_xg_model.py) ───
// To update: run `python extract_xg_model.py` and paste the output here.
let SCALER_MEAN  = [19.723383815598517, 22.541577550924693];
let SCALER_SCALE = [8.9395584074065, 14.561141344416908];
let LR_COEF      = [-0.7789732922944506, 0.26453226285406606];
let LR_INTERCEPT  = -2.462284937144115;

/**
 * Replace the built-in model weights at runtime
 * (e.g. after fetching a JSON params file).
 */
export function setModelParams(params: {
  scaler_mean: [number, number];
  scaler_scale: [number, number];
  lr_coef: [number, number];
  lr_intercept: number;
}) {
  SCALER_MEAN  = params.scaler_mean;
  SCALER_SCALE = params.scaler_scale;
  LR_COEF      = params.lr_coef;
  LR_INTERCEPT  = params.lr_intercept;
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
): { dist: number; angle: number } {
  const sbX = optaX * 1.2;
  const sbY = optaY * 0.8;

  const dx = GOAL_X_SB - sbX;
  const dy = GOAL_Y_SB - sbY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Angle subtended by goal posts (law of cosines)
  const halfW = GOAL_WIDTH_SB / 2;
  const a = Math.sqrt(dx * dx + (dy - halfW) ** 2);
  const b = Math.sqrt(dx * dx + (dy + halfW) ** 2);
  const cosAngle =
    (a * a + b * b - GOAL_WIDTH_SB * GOAL_WIDTH_SB) / (2 * a * b);
  const angle =
    (Math.acos(Math.max(-1, Math.min(1, cosAngle))) * 180) / Math.PI;

  return { dist, angle };
}

/**
 * Predict xG given pre-computed features using the logistic-regression pipeline.
 */
export function predictXg(dist: number, angle: number): number {
  const z1 = (dist - SCALER_MEAN[0]) / SCALER_SCALE[0];
  const z2 = (angle - SCALER_MEAN[1]) / SCALER_SCALE[1];
  const logit = LR_COEF[0] * z1 + LR_COEF[1] * z2 + LR_INTERCEPT;
  return 1 / (1 + Math.exp(-logit));
}

/**
 * Convenience: compute features and predict xG in one call.
 * Expects opta 0–100 coordinates (after direction normalisation).
 */
export function getXgForShot(optaX: number, optaY: number): number {
  const { dist, angle } = computeShotFeatures(optaX, optaY);
  return predictXg(dist, angle);
}
