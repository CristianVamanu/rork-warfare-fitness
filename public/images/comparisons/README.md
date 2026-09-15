# Comparison object artwork

Drop-in images for the post-workout share card's "I lifted the weight of…"
block (see src/lib/weightComparison.ts).

## How it works

The card looks for `<id>.png` here and uses it automatically. No code change
is needed to add one. If the file is missing or fails to load, the card falls
back to that object's emoji — so a partial set is fine, and objects can be
upgraded one at a time.

## Specs

- PNG, **transparent background**
- Roughly 800x600, landscape-ish; the card renders it at ~112px tall
- Under ~150KB each (they load only when a card is shown, but the share
  image rasterizes faster with smaller files)
- No watermarks. A watermarked stock preview is not a licensed image —
  it ends up printed across every card a member posts.

## Filenames (must match the object id exactly)

labrador.png
lion.png
piano.png
motorbike.png
grizzly.png
grand-piano.png
giraffe.png
small-car.png
sports-car.png
rhino.png
monster-truck.png
elephant.png
t-rex.png
school-bus.png
helicopter.png
blue-whale.png
