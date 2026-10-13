#!/bin/bash
# Batch screenshots of the track sandbox (unique filenames, retries blank captures).
# usage: dev/track-shots.sh <prefix> <track> "<query1>" "<query2>" ...
# e.g.   dev/track-shots.sh /tmp/tk dune-drift "view=drive&d=60" "view=overview"
PREFIX="$1"; TRACK="$2"; shift 2
DIR="$(cd "$(dirname "$0")/.." && pwd)"
STAMP=$(date +%H%M%S)
for Q in "$@"; do
  N=$(echo "$Q" | tr -c 'a-zA-Z0-9' '_')
  OUT="${PREFIX}-${TRACK}-${N}-${STAMP}.png"
  for TRY in 1 2 3 4; do
    MSG=$("$DIR/tools/screenshot.sh" "http://127.0.0.1:5173/dev/track.html?track=${TRACK}&${Q}" "$OUT" 1280 720 30000 2>&1)
    SIZE=$(stat -f %z "$OUT" 2>/dev/null || echo 0)
    if [ "$SIZE" -gt 20000 ]; then break; fi
  done
  echo "$OUT ($SIZE bytes, try $TRY)"
  echo "$MSG" | grep -E "rror|track-sandbox" | grep -v "mcs_client" | sed -e 's/.*CONSOLE:[0-9]*\] //' -e 's/, source.*//'
done
