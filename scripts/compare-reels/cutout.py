"""
Cut a white-background exercise clip out and restyle it for the reels.

  python cutout.py in.mp4 outdir [--trim start end]

- Background: everything near-white that is connected to the frame edge
  (flood fill), so light skin and grey equipment inside the figure stay.
- Muscles: the clip's red highlight is recoloured to brand gold, brightened
  and given a soft glow so it reads on a dark background.
- Output: RGBA PNGs cropped to the figure's bounding box over the whole clip,
  plus box.json with the crop and fps.
"""
import sys, os, json, subprocess
import numpy as np, cv2

src, out = sys.argv[1], sys.argv[2]
STEP = int(sys.argv[sys.argv.index('--step') + 1]) if '--step' in sys.argv else 1
FPS_ARG = float(sys.argv[sys.argv.index('--fps') + 1]) if '--fps' in sys.argv else None
os.makedirs(out, exist_ok=True)
if os.path.isdir(src):  # a folder of frames (e.g. after upscaling)
    import glob
    frames = np.stack([cv2.cvtColor(cv2.imread(f), cv2.COLOR_BGR2RGB) for f in sorted(glob.glob(os.path.join(src, '*.png')))])
    H, W = frames.shape[1:3]; num, den = (FPS_ARG or 30), 1
else:
    probe = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height,r_frame_rate',
                                       '-of', 'json', src], capture_output=True, text=True).stdout)['streams'][0]
    W, H = probe['width'], probe['height']
    num, den = map(int, probe['r_frame_rate'].split('/'))
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)[::STEP]
    num = num / STEP

GOLD_DARK = np.array([196, 112, 10], np.float32)
GOLD_LIGHT = np.array([255, 214, 128], np.float32)

def process(rgb):
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    # near-white mask, then keep only the part connected to the border
    white = (rgb.min(axis=2) > 232).astype(np.uint8)
    ff = np.zeros((H + 2, W + 2), np.uint8)
    mask = white.copy()
    seeds = [(x, 0) for x in range(0, W, 40)] + [(x, H - 1) for x in range(0, W, 40)] + [(0, y) for y in range(0, H, 40)] + [(W - 1, y) for y in range(0, H, 40)]
    bg = np.zeros((H, W), np.uint8)
    for (x, y) in seeds:
        if white[y, x] and not bg[y, x]:
            ff[:] = 0
            m = white.copy()
            cv2.floodFill(m, ff, (x, y), 2)
            bg |= (m == 2).astype(np.uint8)
    fg = 1 - bg
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    alpha = cv2.GaussianBlur(fg.astype(np.float32), (0, 0), 0.9)
    # soften the white fringe left by anti-aliasing: unpremultiply against white
    a3 = np.clip(alpha, 1e-3, 1)[..., None]
    col = rgb.astype(np.float32)
    col = np.clip((col - (1 - a3) * 255) / a3, 0, 255)

    # muscle highlight: strongly red pixels
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    h, s, v = hsv[..., 0], hsv[..., 1] / 255, hsv[..., 2] / 255
    red = ((h < 12) | (h > 168)) & (s > 0.35) & (v > 0.25)
    rm = cv2.GaussianBlur(red.astype(np.float32), (0, 0), 1.2) * fg
    shade = np.clip((v - 0.2) / 0.8, 0, 1)[..., None]
    gold = (GOLD_DARK + (GOLD_LIGHT - GOLD_DARK) * shade) * (0.55 + 0.6 * shade)
    col = col * (1 - rm[..., None]) + gold * rm[..., None]
    # glow: blurred highlight added on top (and allowed just outside the body)
    glow = cv2.GaussianBlur(rm, (0, 0), 12) * 0.38
    col = np.clip(col + glow[..., None] * np.array([255, 170, 40], np.float32), 0, 255)
    alpha = np.maximum(alpha, np.clip(glow * 0.6, 0, 0.5))
    # slight cool grade on the body so the gold pops
    body = (1 - rm[..., None])
    col = col * (1 - 0.12 * body) + body * 0.12 * col * np.array([0.82, 0.86, 0.95], np.float32)
    return col.astype(np.uint8), (alpha * 255).astype(np.uint8)

res = [process(f) for f in frames]
# crop to the union bounding box over the clip
ys, xs = np.where(np.max([a for _, a in res], axis=0) > 20)
pad = 24
x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad)
y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad)
for i, (c, a) in enumerate(res):
    rgba = np.dstack([c, a])[y0:y1, x0:x1]
    cv2.imwrite(os.path.join(out, f'f_{i:04d}.png'), cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))
json.dump({'w': int(x1 - x0), 'h': int(y1 - y0), 'x0': int(x0), 'y0': int(y0), 'fps': num / den, 'n': len(res)}, open(os.path.join(out, 'box.json'), 'w'))
print(out, len(res), x1 - x0, y1 - y0)
