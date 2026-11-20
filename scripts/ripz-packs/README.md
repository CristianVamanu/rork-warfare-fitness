# Ripz pack renders

The pack images in `public/ripz/` are 3D renders, made with Blender's Python
module (`pip install bpy`) and Playwright.

1. `node art.mjs` writes the print for each pack (lettering, crosshair,
   labels) and the zig-zag cut mask as transparent PNGs into `art/`.
2. `python pack.py <id> <hex1,hex2,hex3> out.png [--back] [--res 760] [--samples 128]`
   builds the foil pouch, lays the print on it, lights it and renders it with
   a transparent background. `all.sh` runs all six fronts and backs.
3. Convert to WebP: full size (`<id>.webp`, 760 px wide), half size for the
   wheel (`<id>_sm.webp`, 380 px) and the plain back (`<id>_back.webp`, 260 px).

To add a pack: add it to `RIPZ_PACKS` in `src/lib/ripz.ts` and to the list in
`art.mjs` and `all.sh`, then render it. Paths in the scripts are relative to
the folder they were first run from; adjust before running.
