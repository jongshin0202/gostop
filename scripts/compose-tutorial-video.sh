#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
BUILD="$ROOT/build/tutorial"
ASSETS="$ROOT/assets"
mkdir -p "$ASSETS" "$BUILD/audio"

PART1=38
MOBILE=22
PART2=306

normalize_desktop() {
  local input="$1" output="$2" seconds="$3"
  ffmpeg -hide_banner -loglevel error -y -sseof "-$seconds" -i "$input" -t "$seconds" \
    -vf "fps=30,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x100c09,setsar=1,fade=t=in:st=0:d=0.2,fade=t=out:st=$(python3 - <<PY
print(max(0,float('$seconds')-.2))
PY
):d=0.2" \
    -an -c:v libx264 -preset medium -crf 24 -pix_fmt yuv420p "$output"
}

normalize_mobile() {
  local input="$1" output="$2" seconds="$3"
  ffmpeg -hide_banner -loglevel error -y -sseof "-$seconds" -i "$input" -t "$seconds" \
    -vf "fps=30,scale=-2:680,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x100c09,setsar=1,fade=t=in:st=0:d=0.2,fade=t=out:st=$(python3 - <<PY
print(max(0,float('$seconds')-.2))
PY
):d=0.2" \
    -an -c:v libx264 -preset medium -crf 24 -pix_fmt yuv420p "$output"
}

normalize_desktop "$BUILD/part1-raw.webm" "$BUILD/part1.mp4" "$PART1"
normalize_mobile "$BUILD/mobile-raw.webm" "$BUILD/mobile.mp4" "$MOBILE"
normalize_desktop "$BUILD/part2-raw.webm" "$BUILD/part2.mp4" "$PART2"

cat > "$BUILD/video-list.txt" <<EOF
file '$BUILD/part1.mp4'
file '$BUILD/mobile.mp4'
file '$BUILD/part2.mp4'
EOF
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$BUILD/video-list.txt" -c copy "$BUILD/video-silent.mp4"

node - "$BUILD/captions.json" "$BUILD/audio/cues.tsv" <<'NODE'
const fs=require('fs');
const [jsonPath,outPath]=process.argv.slice(2);
const data=JSON.parse(fs.readFileSync(jsonPath,'utf8'));
const rows=(data.timeline||[]).map((cue,index)=>[
  String(index).padStart(3,'0'),
  Math.max(.25,Number(cue.end)-Number(cue.start)),
  String(cue.text||'').replace(/[\t\r\n]+/g,' ')
]);
fs.writeFileSync(outPath,rows.map(row=>row.join('\t')).join('\n'));
NODE

: > "$BUILD/audio/list.txt"
while IFS=
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$BUILD/audio/list.txt" -c copy "$BUILD/narration.m4a"
ffmpeg -hide_banner -loglevel error -y -i "$BUILD/video-silent.mp4" -i "$BUILD/narration.m4a" \
  -c:v copy -c:a aac -b:a 128k -movflags +faststart -shortest "$ASSETS/gostop-live-how-to-play.mp4"

cp "$BUILD/captions.json" "$ASSETS/gostop-live-how-to-play-captions.json"
ffmpeg -hide_banner -loglevel error -y -ss 1 -i "$ASSETS/gostop-live-how-to-play.mp4" -frames:v 1 -q:v 3 "$ASSETS/gostop-live-how-to-play-poster.jpg"

size=$(stat -c%s "$ASSETS/gostop-live-how-to-play.mp4")
echo "Generated tutorial video: $size bytes"
if [ "$size" -gt 95000000 ]; then
  echo "Tutorial video is too large for GitHub."
  exit 1
fi
\t' read -r id duration narration; do
  [ -n "$id" ] || continue
  source_audio="$BUILD/audio/$id.mp3"
  if ! edge-tts --voice en-US-GuyNeural --rate=+18% --text "$narration" --write-media "$source_audio" >/dev/null 2>&1; then
    espeak -s 170 -w "$BUILD/audio/$id.wav" "$narration"
    source_audio="$BUILD/audio/$id.wav"
  fi
  ffmpeg -hide_banner -loglevel error -y -i "$source_audio" \
    -af "apad=pad_dur=$duration,afade=t=in:st=0:d=0.06,afade=t=out:st=$(python3 - <<PY
print(max(0,float('$duration')-.12))
PY
):d=0.12" \
    -t "$duration" -ar 48000 -ac 2 -c:a aac -b:a 128k "$BUILD/audio/$id.m4a"
  printf "file '%s'\n" "$BUILD/audio/$id.m4a" >> "$BUILD/audio/list.txt"
done < "$BUILD/audio/cues.tsv"

ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$BUILD/audio/list.txt" -c copy "$BUILD/narration.m4a"
ffmpeg -hide_banner -loglevel error -y -i "$BUILD/video-silent.mp4" -i "$BUILD/narration.m4a" \
  -c:v copy -c:a aac -b:a 128k -movflags +faststart -shortest "$ASSETS/gostop-live-how-to-play.mp4"

cp "$BUILD/captions.json" "$ASSETS/gostop-live-how-to-play-captions.json"
ffmpeg -hide_banner -loglevel error -y -ss 1 -i "$ASSETS/gostop-live-how-to-play.mp4" -frames:v 1 -q:v 3 "$ASSETS/gostop-live-how-to-play-poster.jpg"

size=$(stat -c%s "$ASSETS/gostop-live-how-to-play.mp4")
echo "Generated tutorial video: $size bytes"
if [ "$size" -gt 95000000 ]; then
  echo "Tutorial video is too large for GitHub."
  exit 1
fi
