"""
Remove white panels left inside a cut-out clip.

cutout.py removes the white that touches the frame edge. White trapped inside
the figure's outline (the gap between a bench and the body, the back panel of
a machine) is not connected to the edge, so it stays. This pass removes any
large, flat, near-white area. Skin highlights are small and shaded, so they
are kept.

  python dewhite.py <dir of RGBA f_*.png>     (in place)
"""
import sys, glob, os
import numpy as np, cv2

d = sys.argv[1]
for f in sorted(glob.glob(os.path.join(d, 'f_*.png'))):
    im = cv2.imread(f, cv2.IMREAD_UNCHANGED)
    bgr, a = im[..., :3], im[..., 3]
    h, w = a.shape
    mn = bgr.min(axis=2); mx = bgr.max(axis=2)
    white = ((mn > 232) & (mx - mn < 14) & (a > 200)).astype(np.uint8)
    white = cv2.morphologyEx(white, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(white, 8)
    kill = np.zeros((h, w), np.uint8)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] > 0.0012 * h * w:
            kill[lab == i] = 1
    if kill.any():
        kill = cv2.dilate(kill, np.ones((7, 7), np.uint8))          # take the soft edge too
        soft = cv2.GaussianBlur(kill.astype(np.float32), (0, 0), 1.5)
        im[..., 3] = (a.astype(np.float32) * (1 - np.clip(soft * 1.3, 0, 1))).astype(np.uint8)
        cv2.imwrite(f, im)
