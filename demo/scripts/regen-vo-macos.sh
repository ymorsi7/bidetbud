#!/usr/bin/env bash
# Naturaler narration via macOS Speech (Reed). Shorter lines so 60s stays dense.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=assets/voice
VOICE="Reed (English (US))"
RATE=192
mkdir -p "$OUT" /tmp/bb-vo

speak() {
  local id="$1" text="$2"
  local aiff="/tmp/bb-vo/$id.aiff"
  say -v "$VOICE" -r "$RATE" -o "$aiff" "$text"
  ffmpeg -y -i "$aiff" -ar 44100 -ac 1 "$OUT/$id.wav" >/dev/null 2>&1
  local d
  d=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT/$id.wav")
  printf "%-12s %ss\n" "$id" "$d"
}

speak hook "There's one thing the West still hasn't figured out."
speak bidets "Bidets."
speak world "Bidet Bud maps places that actually have one. Over ten thousand spots, eighty-plus countries."
speak pins "Every pin is a real restroom."
speak filters "Masajid, restaurants, hotels, public spots."
speak search "Search a city, a name, even an acronym. I C S D finds San Diego."
speak detail "Confirmed in person. Directions in one tap."
speak near "Near me: a hundred thirty five places within ten miles."
speak evidence "Every pin needs real evidence. No guessing."
speak phone "On your phone. Real footage from a verified spot in Astoria."
speak add "Know a spot? Add it. We review every submission."
speak end "Bidet Bud dot com. Free, community built, open source."
