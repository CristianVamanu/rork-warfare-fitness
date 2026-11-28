#!/bin/sh
# sh mix_short.sh voice.mp3 score.wav out.wav
# 31 s cut: four of the narrator's paragraphs (opening, "This is Warfare Fitness...",
# "Train smarter...", the close) placed on the short film; music ducks under the voice.
# Each line: start and end in the recording (s), then where it lands in the film (ms).
V="$1"; M="$2"; O="$3"
seg() { echo "[0:a]atrim=$1:$2,asetpts=PTS-STARTPTS,afade=t=in:d=0.03,adelay=$3:all=1[$4];"; }
F="$(seg 0.00 1.98 400 a)$(seg 3.00 17.08 2780 b)$(seg 46.89 52.57 17260 f)$(seg 53.62 61.02 23340 g)"
ffmpeg -v error -y -i "$V" -i "$M" -filter_complex "${F}[a][b][f][g]amix=inputs=4:normalize=0,apad=whole_dur=31.2,loudnorm=I=-15:TP=-1.5:LRA=9,aresample=48000,asplit[vo][key];[1:a]volume=0.75[m];[m][key]sidechaincompress=threshold=0.02:ratio=6:attack=40:release=500[duck];[vo][duck]amix=inputs=2:normalize=0,alimiter=limit=0.95,atrim=0:31.2[out]" -map "[out]" -ar 48000 "$O"
