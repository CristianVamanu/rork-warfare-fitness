"""
Composite a comparison reel from real footage, at the background's size
(4K: 2160x3840 with assets/gym_4k.png).

  python composite.py <workdir> <cutA> <cutB> <out.mp4> [--speed A B]

workdir holds gym.png, logo-wf.webp, sound.wav, layout.json and ov/ (from
render_overlay.mjs, rendered at the same scale). cutA / cutB come from
prep_clip.sh. --speed plays each clip faster than its source so reps run at
a normal pace (library clips are slow, about one rep per 6.5 s).
"""
import sys, os, json, glob, subprocess
import numpy as np, cv2

wd, cutA, cutB, out = sys.argv[1:5]
spd = {'A': 2.6, 'B': 2.6}
if '--speed' in sys.argv:
    i = sys.argv.index('--speed'); spd = {'A': float(sys.argv[i + 1]), 'B': float(sys.argv[i + 2])}
FPS = 30
gym = cv2.cvtColor(cv2.imread(os.path.join(wd, 'gym.png')), cv2.COLOR_BGR2RGB).astype(np.float32)
H, W = gym.shape[:2]
S = W / 1080  # layout and overlay are designed at 1080 wide
layout = json.load(open(os.path.join(wd, 'layout.json')))
# keep the ceiling lights from fighting the headline: darken the top of the room
_g = np.clip((np.arange(H) - 120 * S) / (520 * S), 0, 1) ** 1.3
gym *= (0.12 + 0.88 * _g)[:, None, None]

def load(d):
    files = sorted(glob.glob(os.path.join(d, 'f_*.png')))
    box = json.load(open(os.path.join(d, 'box.json')))
    return [cv2.cvtColor(cv2.imread(f, cv2.IMREAD_UNCHANGED), cv2.COLOR_BGRA2RGBA) for f in files], box['fps']
clips = {'A': load(cutA), 'B': load(cutB)}

# Neon sign on the back wall: the logo, soft (the wall is out of focus), a
# restrained bloom, and the odd flicker like a real tube sign.
_logo = cv2.cvtColor(cv2.imread(os.path.join(wd, 'logo-wf.webp'), cv2.IMREAD_UNCHANGED), cv2.COLOR_BGRA2RGBA).astype(np.float32)
_lw = int(560 * S); _lh = int(_logo.shape[0] * _lw / _logo.shape[1])
_logo = cv2.resize(_logo, (_lw, _lh), interpolation=cv2.INTER_CUBIC)
NX, NY = (W - _lw) // 2, int(500 * S)
_core = np.zeros((H, W, 3), np.float32); _a = np.zeros((H, W), np.float32)
_core[NY:NY + _lh, NX:NX + _lw] = _logo[..., :3] * (_logo[..., 3:] / 255)
_a[NY:NY + _lh, NX:NX + _lw] = _logo[..., 3] / 255
_core = cv2.GaussianBlur(_core, (0, 0), 1.6 * S) * 0.62
_a = cv2.GaussianBlur(_a, (0, 0), 1.6 * S)
_bloom = cv2.GaussianBlur(_core, (0, 0), 18 * S) * 0.75 + cv2.GaussianBlur(_core, (0, 0), 60 * S) * 0.45
_rng = np.random.default_rng(11)
_events = sorted(_rng.uniform(1, 25, 7))
def neon_level(t):
    for e in _events:  # a quick double flicker, then back on
        d = t - e
        if 0 <= d < 0.09 or 0.16 <= d < 0.22: return 0.15
        if 0.09 <= d < 0.16: return 0.7
    return 0.93 + 0.07 * np.sin(t * 37) * np.sin(t * 11)

def over(dst, rgba, x, y, op=1.0):
    h, w = rgba.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0: return
    s = rgba[y0 - y:y1 - y, x0 - x:x1 - x].astype(np.float32)
    a = s[..., 3:4] / 255 * op
    dst[y0:y1, x0:x1] = dst[y0:y1, x0:x1] * (1 - a) + s[..., :3] * a

def shadow(dst, cx, cy, rx, ry, strength):
    pad = int(ry * 4 + 40 * S)
    x0, y0, x1, y1 = max(0, cx - rx - pad), max(0, cy - ry - pad), min(W, cx + rx + pad), min(H, cy + ry + pad)
    m = np.zeros((y1 - y0, x1 - x0), np.float32)
    cv2.ellipse(m, (cx - x0, cy - y0), (rx, ry), 0, 0, 360, 1.0, -1)
    m = cv2.GaussianBlur(m, (0, 0), 14 * S) * strength
    dst[y0:y1, x0:x1] *= 1 - m[..., None]

ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                       '-i', os.path.join(wd, 'sound.wav'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p',
                       '-profile:v', 'high', '-level', '5.2', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
for i, figs in enumerate(layout):
    t = i / FPS
    z = 1 + 0.05 * t / 26
    bg = cv2.resize(gym, None, fx=z, fy=z, interpolation=cv2.INTER_LINEAR)
    oy, ox = (bg.shape[0] - H) // 2, (bg.shape[1] - W) // 2
    frame = bg[oy:oy + H, ox:ox + W]
    lv = neon_level(t) * 0.8
    frame = frame * (1 - 0.6 * lv * _a[..., None]) + (_core + _bloom) * lv
    vis = max([f['op'] for f in figs], default=0)
    frame *= 1 - 0.45 * (1 - vis)  # dim the room when no athlete is on stage
    for f in figs:
        frames, cfps = clips[f['k']]
        img = frames[int((t - f['t0']) * cfps * spd[f['k']]) % len(frames)]
        ch, cw = img.shape[:2]
        bw, bh = f['w'] * S, f['h'] * S
        sc = min(bw / cw, bh / ch) * f['z']
        nw, nh = max(1, int(cw * sc)), max(1, int(ch * sc))
        im = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA if sc < 1 else cv2.INTER_CUBIC)
        x = int(f['x'] * S + bw / 2 - nw / 2); y = int(f['y'] * S + bh - nh)
        shadow(frame, x + nw // 2, y + nh - int(6 * S), int(nw * 0.42), int(22 * S), 0.6 * f['op'])
        over(frame, im, x, y, f['op'])
    ov = cv2.imread(os.path.join(wd, 'ov', f'o_{i + 1:05d}.png'), cv2.IMREAD_UNCHANGED)
    if ov.shape[1] != W: ov = cv2.resize(ov, (W, H), interpolation=cv2.INTER_CUBIC)
    over(frame, cv2.cvtColor(ov, cv2.COLOR_BGRA2RGBA), 0, 0)
    ff.stdin.write(np.clip(frame, 0, 255).astype(np.uint8).tobytes())
ff.stdin.close(); ff.wait()
print('wrote', out)
