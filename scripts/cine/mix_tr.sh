#!/bin/sh
# sh mix_tr.sh voice.mp3 score.wav out.wav   (trainers reel: voice starts at 0.5 s, music ducks under it)
ffmpeg -v error -y -i "$1" -i "$2" -filter_complex "[0:a]adelay=500:all=1,apad=whole_dur=36.5,loudnorm=I=-15:TP=-1.5:LRA=9,aresample=48000,asplit[vo][key];[1:a]volume=0.75[m];[m][key]sidechaincompress=threshold=0.02:ratio=6:attack=40:release=500[duck];[vo][duck]amix=inputs=2:normalize=0,alimiter=limit=0.95,atrim=0:36.5[out]" -map "[out]" -ar 48000 "$3"
