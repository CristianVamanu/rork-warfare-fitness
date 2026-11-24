// Warfare Fitness: 2D athlete figure for comparison reels.
// Side view, facing right. World units are metres (x right, y up); the caller
// supplies toPx(). Each exercise is a pose(s) function, s = 0 (top) .. 1 (bottom).
(function (G) {
  const L = { sh: 0.44, th: 0.45, to: 0.5, ua: 0.29, fa: 0.27 };
  const v = (x, y) => ({ x, y });
  const add = (a, b) => v(a.x + b.x, a.y + b.y), sub = (a, b) => v(a.x - b.x, a.y - b.y);
  const mul = (a, k) => v(a.x * k, a.y * k), len = (a) => Math.hypot(a.x, a.y);
  const norm = (a) => mul(a, 1 / (len(a) || 1));
  const fromDeg = (d) => v(Math.sin(d * Math.PI / 180), Math.cos(d * Math.PI / 180)); // 0 = up, + = forward
  const perpF = (d) => v(d.y, -d.x); // rotate 90deg clockwise: "front" of a segment pointing up
  function ik(root, target, l1, l2, bendSign) {
    const d = sub(target, root); const D = Math.min(len(d), l1 + l2 - 1e-4); const u = norm(d);
    const a = (l1 * l1 + D * D - l2 * l2) / (2 * D); const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
    const p = v(-u.y * bendSign, u.x * bendSign);
    return add(add(root, mul(u, a)), mul(p, h));
  }

  const POSES = {
    squat(s) {
      const ankle = v(0, 0.085);
      const knee = add(ankle, mul(fromDeg(38 * s), L.sh));
      const hip = add(knee, mul(fromDeg(-(4 + 90 * s)), L.th));
      let lean = Math.asin(Math.max(-0.9, Math.min(0.9, (0.1 - hip.x) / (L.to + 0.02)))) * 180 / Math.PI;
      lean = Math.max(lean, 4);
      const t = fromDeg(lean), neck = add(hip, mul(t, L.to)), f = perpF(t);
      const bar = add(neck, mul(f, -0.07));
      const sh = add(neck, mul(t, -0.05));
      const hand = add(bar, mul(f, 0.02));
      return { ankle, knee, hip, neck, t, f, bar, sh, hand, elbowBend: 1, armK: 0.62, toe: v(1, 0), headUp: 0.6 };
    },
    press(s) {
      const W = norm(v(Math.cos(32 * Math.PI / 180), Math.sin(32 * Math.PI / 180)));
      const hip = v(0, 0.62);
      const ankle = add(hip, mul(W, 0.86 - 0.47 * s));
      const knee = ik(hip, ankle, L.th, L.sh, 1);
      const t = fromDeg(-55), neck = add(hip, mul(t, L.to)), f = perpF(t);
      const sh = add(neck, mul(t, -0.05));
      const hand = add(hip, v(0.06, -0.1));
      return { ankle, knee, hip, neck, t, f, sh, hand, elbowBend: -1, toe: v(-W.y, W.x), W, headUp: 0.2 };
    },
  };

  // Tapered capsule outline as a polygon (no SVG arc-flag ambiguity).
  function capsule(a, b, ra, rb, n = 18) {
    const d = sub(b, a), D = len(d) || 1e-6, base = Math.atan2(d.y, d.x);
    const th = Math.acos(Math.max(-1, Math.min(1, (ra - rb) / D)));
    const pts = [];
    for (let i = 0; i <= n; i++) { const ang = base + th - (2 * th) * i / n; pts.push(v(b.x + rb * Math.cos(ang), b.y + rb * Math.sin(ang))); }
    for (let i = 0; i <= n; i++) { const ang = base - th - (2 * Math.PI - 2 * th) * i / n; pts.push(v(a.x + ra * Math.cos(ang), a.y + ra * Math.sin(ang))); }
    return pts;
  }
  const poly = (pts, P) => 'M' + pts.map((p) => { const q = P(p); return q.x.toFixed(1) + ' ' + q.y.toFixed(1); }).join('L') + 'Z';

  // Returns { far, near, muscles:{quad,glute,core,back,ham}, clips } as SVG path strings.
  function figure(J, P) {
    const limbs = (side) => {
      const o = side === 'far' ? 0.012 : 0; // far side sits a touch higher in frame
      const sh = add(J.sh, v(-o, o));
      const k = J.armK || 1; const elbow = ik(sh, J.hand, L.ua * k, L.fa * k, J.elbowBend);
      const heel = add(J.ankle, mul(J.toe, -0.06)), toe = add(heel, mul(J.toe, 0.27));
      return {
        thigh: capsule(J.hip, J.knee, 0.105, 0.065),
        shank: capsule(J.knee, J.ankle, 0.06, 0.04),
        calf: capsule(add(J.knee, mul(norm(sub(J.ankle, J.knee)), 0.07)), add(J.knee, mul(norm(sub(J.ankle, J.knee)), 0.26)), 0.055, 0.045),
        foot: capsule(add(heel, v(0, 0.0)), toe, 0.04, 0.026),
        uarm: capsule(sh, elbow, 0.056, 0.044),
        farm: capsule(elbow, J.hand, 0.044, 0.033),
        hand: capsule(J.hand, add(J.hand, mul(norm(sub(J.hand, elbow)), 0.06)), 0.035, 0.03),
      };
    };
    const near = limbs('near');
    const t = J.t, f = J.f, hip = J.hip;
    const trunk = {
      pelvis: capsule(add(hip, mul(t, -0.05)), add(hip, mul(t, 0.14)), 0.13, 0.125),
      abs: capsule(add(add(hip, mul(t, 0.1)), mul(f, 0.0)), add(add(hip, mul(t, 0.3)), mul(f, 0.01)), 0.12, 0.13),
      chest: capsule(add(add(hip, mul(t, 0.28)), mul(f, 0.015)), add(add(J.neck, mul(t, -0.06)), mul(f, 0.02)), 0.155, 0.14),
      delt: capsule(add(J.sh, mul(t, -0.02)), add(J.sh, mul(t, 0.03)), 0.08, 0.075),
      neck: capsule(J.neck, add(J.neck, mul(t, 0.1)), 0.05, 0.045),
    };
    const hd = norm(add(t, v(0, J.headUp)));
    trunk.head = capsule(add(J.neck, mul(hd, 0.12)), add(J.neck, mul(hd, 0.2)), 0.1, 0.095);
    const th = norm(sub(J.knee, hip)), thf = v(-th.y, th.x); // thigh front (works for both poses)
    const tf = f;
    const muscles = {
      quad: capsule(add(add(hip, mul(th, 0.08)), mul(thf, 0.045)), add(add(J.knee, mul(th, -0.06)), mul(thf, 0.03)), 0.075, 0.05),
      ham: capsule(add(add(hip, mul(th, 0.1)), mul(thf, -0.05)), add(add(J.knee, mul(th, -0.1)), mul(thf, -0.035)), 0.06, 0.04),
      glute: capsule(add(add(hip, mul(tf, -0.06)), mul(t, -0.04)), add(add(hip, mul(tf, -0.055)), mul(t, 0.06)), 0.085, 0.075),
      core: capsule(add(add(hip, mul(t, 0.1)), mul(tf, 0.07)), add(add(hip, mul(t, 0.32)), mul(tf, 0.08)), 0.05, 0.055),
      back: capsule(add(add(hip, mul(t, 0.08)), mul(tf, -0.085)), add(add(hip, mul(t, 0.36)), mul(tf, -0.09)), 0.045, 0.05),
    };
    const S = (o) => Object.fromEntries(Object.entries(o).map(([k, p]) => [k, poly(p, P)]));
    return { near: S(near), trunk: S(trunk), muscles: S(muscles), clip: { thigh: poly(near.thigh, P), trunk: [trunk.pelvis, trunk.abs, trunk.chest].map((p) => poly(p, P)).join(' ') } };
  }

  G.WF = { POSES, figure, v, add, mul, norm, sub, L };
})(window);
