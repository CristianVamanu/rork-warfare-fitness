#!/bin/sh
# sh mix_vo.sh voice.mp3 score.wav out.wav
# Places the narrator's seven paragraphs on the 60 s cut (long pauses between
# them shortened; times found with ffmpeg silencedetect on the recording), brings
# the voice up to a normal level and ducks the music under it.
# Each line: start and end in the recording (s), then where it lands in the film (ms).
V="$1"; M="$2"; O="$3"
seg() { echo "[0:a]atrim=$1:$2,asetpts=PTS-STARTPTS,afade=t=in:d=0.03,adelay=$3:all=1[$4];"; }
F="$(seg 0.00 1.98 600 a)$(seg 3.00 17.08 3180 b)$(seg 18.00 31.53 17710 c)$(seg 32.38 39.71 31690 d)$(seg 40.63 46.05 39470 e)$(seg 46.89 52.57 45290 f)$(seg 53.62 61.02 51470 g)"
ffmpeg -v error -y -i "$V" -i "$M" -filter_complex "${F}[a][b][c][d][e][f][g]amix=inputs=7:normalize=0,apad=whole_dur=59.9,loudnorm=I=-15:TP=-1.5:LRA=9,aresample=48000,asplit[vo][key];[1:a]volume=0.75[m];[m][key]sidechaincompress=threshold=0.02:ratio=6:attack=40:release=500[duck];[vo][duck]amix=inputs=2:normalize=0,alimiter=limit=0.95,atrim=0:59.9[out]" -map "[out]" -ar 48000 "$O"
