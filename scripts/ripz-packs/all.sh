cd "$(dirname "$0")/.."
for row in "gold FFC65A,F5A623,B86A08" "blue 7CC4FF,2F8BFF,0B4FB3" "green 8CF0B0,27C46B,0C7A3C" "red FF9A8A,F0472F,A31A0A" "purple D0A6FF,9052F0,5320A8" "teal 7FF3E0,14B8A6,0B6B63" "steel F1F4F8,AEB7C2,5F6B78"; do set -- $row
  bv/bin/python pk3d/pack.py $1 $2 pk3d/out/$1.png --res 760 --samples 128 > pk3d/render_$1.log 2>&1
  bv/bin/python pk3d/pack.py $1 $2 pk3d/out/$1_back.png --res 380 --samples 64 --back >> pk3d/render_$1.log 2>&1
  echo done $1
done
echo ALLDONE
