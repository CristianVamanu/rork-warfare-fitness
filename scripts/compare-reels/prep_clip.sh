#!/bin/bash
# prep_clip.sh <clip.mp4> <outdir> <bv python> <srv python> <esrgan.pth>
# Every 2nd frame (clips are played back faster anyway), cropped to the
# athlete, AI-upscaled to 2x, then cut out and gold-graded at that size.
set -e
SRC="$1"; OUT="$2"; BV="$3"; SRV="$4"; PTH="$5"; D=$(dirname "$0")
T=$(mktemp -d)
"$BV" "$D/cutout.py" "$SRC" "$T/lo" --step 2 >/dev/null
read W H X Y FPS < <("$BV" -c "import json;b=json.load(open('$T/lo/box.json'));print(b['w'],b['h'],b['x0'],b['y0'],b['fps'])")
mkdir -p "$T/crop"
ffmpeg -v error -i "$SRC" -vf "select=not(mod(n\,2)),crop=$W:$H:$X:$Y,scale=iw*0.6:-2:flags=area" -vsync 0 "$T/crop/f_%04d.png"
"$SRV" -I "$D/upscale.py" "$PTH" "$T/crop" "$T/hi" 3.3333 >/dev/null
"$BV" "$D/cutout.py" "$T/hi" "$OUT" --fps "$FPS"
"$BV" "$D/dewhite.py" "$OUT"
rm -rf "$T"
