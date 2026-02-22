#!/usr/bin/env python3
"""
Extract trained xG model parameters from xg_model.pkl and print them
as TypeScript constants ready to paste into src/utils/xgModel.ts.

Usage:
    python extract_xg_model.py          # prints to stdout
    python extract_xg_model.py --json   # also writes xg_model_params.json
"""

import json
import pickle
import sys
from pathlib import Path

PKL_PATH = Path(__file__).parent / "xg_model.pkl"


def main():
    if not PKL_PATH.exists():
        print(f"Error: {PKL_PATH} not found. Train the model first (see xGandShotmap.ipynb).", file=sys.stderr)
        sys.exit(1)

    with open(PKL_PATH, "rb") as f:
        model = pickle.load(f)

    # Pipeline: [StandardScaler, LogisticRegression]
    scaler = model[0]
    lr = model[1]

    params = {
        "scaler_mean":  scaler.mean_.tolist(),
        "scaler_scale": scaler.scale_.tolist(),
        "lr_coef":      lr.coef_[0].tolist(),
        "lr_intercept": float(lr.intercept_[0]),
    }

    print("// ── Paste these into src/utils/xgModel.ts ──")
    print(f"let SCALER_MEAN  = {params['scaler_mean']};")
    print(f"let SCALER_SCALE = {params['scaler_scale']};")
    print(f"let LR_COEF      = {params['lr_coef']};")
    print(f"let LR_INTERCEPT  = {params['lr_intercept']};")

    if "--json" in sys.argv:
        json_path = PKL_PATH.with_name("xg_model_params.json")
        with open(json_path, "w") as f:
            json.dump(params, f, indent=2)
        print(f"\nAlso wrote → {json_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
