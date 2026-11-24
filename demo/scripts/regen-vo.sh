#!/usr/bin/env bash
# Naturaler Kokoro takes: Adam, slight speed-up, spoken-friendly wording.
set -euo pipefail
cd "$(dirname "$0")/.."
export HYPERFRAMES_PYTHON="${HYPERFRAMES_PYTHON:-$PWD/.venv-thumb/bin/python}"
CLI=(node "$HOME/.agents/skills/hyperframes/scripts/plugin-cli.mjs" tts)
VOICE=am_adam
SPEED=1.08
OUT=assets/voice
mkdir -p "$OUT"

speak() {
  local id="$1" text="$2"
  "${CLI[@]}" "$text" -o "$OUT/$id.wav" -v "$VOICE" -s "$SPEED" --json
}

speak hook "There's one thing the West still hasn't figured out."
speak bidets "Bidets."
speak world "Bidet Bud is the map of places that actually have one. Over ten thousand spots, across more than eighty countries."
speak pins "Every pin is a real restroom."
speak filters "Filter by masaajid, restaurants, hotels, public spots."
speak search "Search a city, a name, even an acronym. Type I C S D, and it finds the Islamic Center of San Diego."
speak detail "Confirmed in person. Directions in one tap."
speak near "Near me: a hundred thirty five places within ten miles of Union Square."
speak evidence "Every pin needs real evidence. A bidet, a wash let, or a handheld sprayer. No guessing."
speak phone "On your phone, in your pocket. This is real footage from a verified spot in Astoria."
speak add "Know a spot? Add it. Every submission is reviewed before it goes live."
speak end "Bidet Bud dot com. Free, community built, open source."

echo "--- durations ---"
for f in "$OUT"/*.wav; do
  d=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$f")
  printf "%-28s %s\n" "$f" "$d"
done
