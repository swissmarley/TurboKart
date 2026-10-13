#!/bin/bash
# Headless-Chrome screenshot of a page served by the shared Vite dev server.
# Usage: tools/screenshot.sh <url> <out.png> [width=1280] [height=720] [waitMs=6000]
# Also writes <out.png>.log containing browser console output (look for errors!).
URL="$1"; OUT="$2"; W="${3:-1280}"; H="${4:-720}"; WAIT="${5:-6000}"
if [ -z "$URL" ] || [ -z "$OUT" ]; then echo "usage: $0 <url> <out.png> [w] [h] [waitMs]"; exit 1; fi
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROF="$(mktemp -d "${TMPDIR:-/tmp}/tk-chrome-XXXXXX")"
rm -f "$OUT"
"$CHROME" --headless=new --user-data-dir="$PROF" --use-angle=swiftshader --enable-unsafe-swiftshader \
  --hide-scrollbars --mute-audio --autoplay-policy=no-user-gesture-required \
  --enable-logging=stderr --v=0 \
  --window-size="$W,$H" --virtual-time-budget="$WAIT" --screenshot="$OUT" "$URL" > "$OUT.raw.log" 2>&1 &
PID=$!
LIMIT=$(( WAIT / 1000 + 40 ))
for ((i=0; i<LIMIT; i++)); do
  sleep 1
  if [ -s "$OUT" ]; then sleep 1; break; fi
  if ! kill -0 $PID 2>/dev/null; then break; fi
done
kill $PID 2>/dev/null; sleep 0.5; kill -9 $PID 2>/dev/null
pkill -f "$PROF" 2>/dev/null
rm -rf "$PROF"
grep -E "CONSOLE|Uncaught|Error|error" "$OUT.raw.log" | grep -v -E "dbus|gpu_init|Fontconfig|crashpad|SharedImageManager|GpuProcessHost|viz_main|angle_platform|ANGLE|GL_|DEPRECATED_ENDPOINT|registration_request|voice_transcription|on_device_model|optimization_guide" > "$OUT.log"
rm -f "$OUT.raw.log"
if [ -s "$OUT" ]; then echo "saved $OUT"; else echo "FAILED to capture $URL"; fi
if [ -s "$OUT.log" ]; then echo "--- console/errors ($OUT.log) ---"; head -40 "$OUT.log"; fi
