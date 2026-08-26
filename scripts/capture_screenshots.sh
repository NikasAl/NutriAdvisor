#!/usr/bin/env bash
# Capture app screenshots via ADB and resize to 9:16 for RuStore.
#
# Usage:
#   ./scripts/capture_screenshots.sh          # interactive mode, Enter to capture
#   ./scripts/capture_screenshots.sh auto     # capture all without prompts
#   ./scripts/capture_screenshots.sh resize   # just resize existing raw/ screenshots
#
# Requirements: adb, Python3 with Pillow, connected Android device

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MATERIALS="$PROJECT_DIR/Materials"
RAW_DIR="$MATERIALS/screenshots_raw"
OUT_DIR="$MATERIALS/screenshots"

# 9:16 target (RuStore)
TARGET_W=1080
TARGET_H=1920

mkdir -p "$RAW_DIR" "$OUT_DIR"

die() { echo "ERROR: $*" >&2; exit 1; }

# ---- Check dependencies ----
command -v adb >/dev/null 2>&1 || die "adb not found. Install Android platform-tools."
python3 -c "from PIL import Image" 2>/dev/null || die "Pillow not installed. Run: pip3 install Pillow"

# ---- Check device ----
DEVICE_COUNT=$(adb devices | grep -c 'device$' || true)
if [ "$DEVICE_COUNT" -eq 0 ]; then
  die "No Android device connected. Connect via USB or wifi and enable USB debugging."
fi

# ---- Python resize script (embedded) ----
RESIZE_PY=$(cat <<'PYEOF'
import sys, os, glob
from PIL import Image

target_w, target_h = int(sys.argv[1]), int(sys.argv[2])
raw_dir, out_dir = sys.argv[3], sys.argv[4]

def process(filepath, out_path):
    img = Image.open(filepath).convert("RGB")
    w, h = img.size
    # Current aspect ratio
    current = w / h
    target = target_w / target_h
    if current > target:
        # Too wide — crop sides
        new_w = int(h * target)
        left = (w - new_w) // 2
        img = img.crop((left, 0, left + new_w, h))
    elif current < target:
        # Too tall — crop top/bottom
        new_h = int(w / target)
        top = (h - new_h) // 2
        img = img.crop((0, top, w, top + new_h))
    img = img.resize((target_w, target_h), Image.LANCZOS)
    img.save(out_path, "PNG")
    print(f"  {os.path.basename(out_path)}  ({w}x{h} -> {target_w}x{target_h})")

files = sorted(glob.glob(os.path.join(raw_dir, "*.png")))
if not files:
    print("No screenshots found in", raw_dir)
    sys.exit(1)

os.makedirs(out_dir, exist_ok=True)
for i, f in enumerate(files, 1):
    out_path = os.path.join(out_dir, f"{i}.png")
    process(f, out_path)

print(f"\nDone! {len(files)} screenshots saved to {out_dir}")
PYEOF
)

# ---- Resize-only mode ----
if [ "${1:-}" = "resize" ]; then
  echo "Resizing raw screenshots to ${TARGET_W}x${TARGET_H} (9:16)..."
  python3 -c "$RESIZE_PY" "$TARGET_W" "$TARGET_H" "$RAW_DIR" "$OUT_DIR"
  exit 0
fi

# ---- Auto mode (capture without prompts) ----
AUTO=false
if [ "${1:-}" = "auto" ]; then
  AUTO=true
fi

echo "=== RuStore Screenshot Capture ==="
echo "Device: $(adb shell getprop ro.product.model 2>/dev/null || echo 'unknown')"
echo "Target:  ${TARGET_W}x${TARGET_H} (9:16)"
echo "Output:  $OUT_DIR"
echo ""
echo "Navigate to the desired screen in the app, then press Enter to capture."
echo "Type 'q' to finish and resize all screenshots."
echo ""

COUNT=$(ls -1 "$RAW_DIR"/screenshot_*.png 2>/dev/null | wc -l)

while true; do
  if [ "$AUTO" = true ]; then
    echo -n "Capture screenshot #$(($COUNT + 1))? [Y/n] "
    read -r -t 30 answer || answer="y"
    answer=$(echo "${answer:-y}" | tr '[:upper:]' '[:lower:]')
    if [ "$answer" = "n" ] || [ "$answer" = "q" ]; then
      break
    fi
  else
    echo -n "Screenshot #$(($COUNT + 1)) — press Enter to capture, q to finish: "
    read -r answer
    if [ "$answer" = "q" ]; then
      break
    fi
  fi

  COUNT=$(($COUNT + 1))
  TS=$(date +%H%M%S)
  RAW_PATH="$RAW_DIR/screenshot_${TS}.png"

  # Capture via adb
  adb exec-out screencap -p > "$RAW_PATH"

  if [ ! -s "$RAW_PATH" ]; then
    echo "  Failed to capture. Check device connection."
    COUNT=$(($COUNT - 1))
    continue
  fi

  SIZE=$(python3 -c "from PIL import Image; i=Image.open('$RAW_PATH'); print(f'{i.width}x{i.height}')")
  echo "  Captured: $SIZE -> $RAW_PATH"
done

if [ "$COUNT" -eq 0 ]; then
  echo "No screenshots captured."
  exit 0
fi

echo ""
echo "Resizing $COUNT screenshots to ${TARGET_W}x${TARGET_H} (9:16)..."
python3 -c "$RESIZE_PY" "$TARGET_W" "$TARGET_H" "$RAW_DIR" "$OUT_DIR"
