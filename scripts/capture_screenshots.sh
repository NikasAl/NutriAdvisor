#!/usr/bin/env bash
# Capture app screenshots via ADB for RuStore.
# Temporarily sets device resolution to 9:16, captures screenshots,
# then restores the original resolution.
#
# Usage:
#   ./scripts/capture_screenshots.sh            # interactive, Enter to capture
#   ./scripts/capture_screenshots.sh resize      # just resize existing raw/ to 1080x1920
#
# Requirements: adb, Python3 with Pillow, connected Android device

# Ensure stdin is a terminal
[ -t 0 ] || exec 0</dev/tty

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MATERIALS="$PROJECT_DIR/Materials"
RAW_DIR="$MATERIALS/screenshots_raw"
OUT_DIR="$MATERIALS/screenshots"

# RuStore target
TARGET_W=1080
TARGET_H=1920

mkdir -p "$RAW_DIR" "$OUT_DIR"

die() { echo "ERROR: $*" >&2; restore_resolution 2>/dev/null; exit 1; }

# ---- Check dependencies ----
command -v adb >/dev/null 2>&1 || die "adb not found. Install Android platform-tools."
python3 -c "from PIL import Image" 2>/dev/null || die "Pillow not installed. Run: pip3 install Pillow"

# ---- Check device ----
DEVICE_COUNT=$(adb devices | grep -c 'device$') || true
if [ "$DEVICE_COUNT" -eq 0 ]; then
  die "No Android device connected."
fi

device_model=$(adb shell getprop ro.product.model 2>/dev/null | tr -d '\r' || echo 'unknown')
device_serial=$(adb get-serialno 2>/dev/null | tr -d '\r' || echo '')

echo "=== RuStore Screenshot Capture ==="
echo "Device:  $device_model"
echo "Target:  ${TARGET_W}x${TARGET_H} (9:16)"
echo "Output:  $OUT_DIR"
echo ""

# ---- Python resize script (embedded) ----
RESIZE_PY=$(cat <<'PYEOF'
import sys, os, glob
from PIL import Image

target_w, target_h = int(sys.argv[1]), int(sys.argv[2])
raw_dir, out_dir = sys.argv[3], sys.argv[4]

def process(filepath, out_path):
    img = Image.open(filepath).convert("RGB")
    w, h = img.size
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
  echo "Resizing raw screenshots to ${TARGET_W}x${TARGET_H}..."
  python3 -c "$RESIZE_PY" "$TARGET_W" "$TARGET_H" "$RAW_DIR" "$OUT_DIR"
  exit 0
fi

# ---- Save and change resolution ----
ORIG_SIZE=$(adb shell wm size 2>/dev/null | sed 's/.*: //' | tr -d '\r')
ORIG_DENSITY=$(adb shell wm density 2>/dev/null | sed 's/.*: //' | tr -d '\r')
ORIG_OVERSCAN=$(adb shell wm overscan 2>/dev/null | sed 's/.*: //' | tr -d '\r' || echo "")

echo "Current resolution: $ORIG_SIZE"
echo "Current density:   $ORIG_DENSITY"
echo ""
echo "Changing resolution to ${TARGET_W}x${TARGET_H} (9:16)..."
adb shell wm size "${TARGET_W}x${TARGET_H}"

# Adjust density proportionally if possible
ORIG_W=$(echo "$ORIG_SIZE" | cut -dx -f1)
ORIG_H=$(echo "$ORIG_SIZE" | cut -dx -f2)
if [ -n "$ORIG_W" ] && [ -n "$ORIG_DENSITY" ] && [ "$ORIG_W" -gt 0 ] 2>/dev/null; then
  NEW_DENSITY=$(( TARGET_W * ORIG_DENSITY / ORIG_W ))
  adb shell wm density "$NEW_DENSITY"
  echo "Density adjusted:   $ORIG_DENSITY -> $NEW_DENSITY"
fi

echo "Done. Open the app on the device and navigate to the desired screen."
echo ""
echo "Controls:"
echo "  Enter  — capture screenshot"
echo "  q      — finish and restore resolution"
echo "  Ctrl+C — abort (resolution will be restored automatically)"
echo ""

# ---- Restore function ----
restore_resolution() {
  echo ""
  echo "Restoring original resolution..."
  adb shell wm size "$ORIG_SIZE" 2>/dev/null || true
  adb shell wm density "$ORIG_DENSITY" 2>/dev/null || true
  if [ -n "$ORIG_OVERSCAN" ]; then
    adb shell wm overscan "$ORIG_OVERSCAN" 2>/dev/null || true
  fi
  echo "Restored: $ORIG_SIZE, density $ORIG_DENSITY"
}

# Ensure restore on exit (including Ctrl+C)
trap restore_resolution EXIT INT TERM

# ---- Capture loop ----
COUNT=$(ls -1 "$RAW_DIR"/screenshot_*.png 2>/dev/null | wc -l) || true

total_start=$(date +%s)

while true; do
  echo -n "Screenshot #$(($COUNT + 1)) — press Enter to capture, q to finish: "
  read -r answer || { echo; break; }

  if [ "$answer" = "q" ]; then
    break
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
  echo "  Captured: $SIZE"
done

# ---- Resize ----
if [ "$COUNT" -eq 0 ]; then
  echo "No screenshots captured."
  exit 0
fi

echo ""
echo "Resizing $COUNT screenshots to ${TARGET_W}x${TARGET_H}..."
python3 -c "$RESIZE_PY" "$TARGET_W" "$TARGET_H" "$RAW_DIR" "$OUT_DIR"

total_end=$(date +%s)
total_secs=$((total_end - total_start))
echo ""
echo "Total time: ${total_secs}s. Screenshots in $OUT_DIR"
