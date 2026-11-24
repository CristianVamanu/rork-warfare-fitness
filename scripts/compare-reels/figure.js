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

  // Shared hinge: shank lean, thigh angle, shoulder target x, bar x (null = touch the legs).
  function hinge(s, shankDeg, thighDeg, shX, barX) {
    const ankle = v(0, 0.085);
    const knee = add(ankle, mul(fromDeg(shankDeg), L.sh));
    const hip = add(knee, mul(fromDeg(-thighDeg), L.th));
    let lean = Math.asin(Math.max(-0.95, Math.min(0.95, (shX - hip.x) / 0.45))) * 180 / Math.PI;
    lean = Math.max(lean, 3);
    const t = fromDeg(lean), neck = add(hip, mul(t, L.to)), f = perpF(t);
    const sh = add(neck, mul(t, -0.05));
    const R = 0.76;
    let bx = barX;
    if (bx === null) { // slide along the front of the thigh / shin
      const y = sh.y - R * 0.98; const onShank = y < knee.y;
      const a = onShank ? ankle : hip, b2 = onShank ? knee : knee;
      const k = onShank ? (y - ankle.y) / (knee.y - ankle.y) : (hip.y - y) / (hip.y - knee.y);
      const px = onShank ? ankle.x + (knee.x - ankle.x) * k : hip.x + (knee.x - hip.x) * k;
      bx = px + 0.085;
    }
    const dx = Math.max(-R + 0.01, Math.min(R - 0.01, bx - sh.x));
    const hand = v(sh.x + dx, sh.y - Math.sqrt(R * R - dx * dx));
    return { ankle, knee, hip, neck, t, f, sh, hand, bar: hand, straightArms: true, barR: 0.225, toe: v(1, 0), headUp: 0.35 };
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
    // Conventional deadlift: bar over mid-foot, knees and hips extend together.
    deadlift(s) { return hinge(s, 12 * s, 4 + 54 * s, 0.1, 0.07); },
    // Romanian deadlift: soft knees barely move, hips travel back, bar slides down the thighs.
    rdl(s) { return hinge(s, -6 * s, 3 + 24 * s, 0.1 + 0.02 * s, null); },
    // Pull-up: hands fixed on the bar, the body travels. Bottom = dead hang (s=0 here is the hang).
    pullup(s) {
      const hand = v(0.05, 2.22);
      const sh = v(hand.x - 0.06 * s, hand.y - (0.6 - 0.42 * s));
      const t = fromDeg(-14 * s), f = perpF(t);
      const neck = add(sh, mul(t, 0.05)), hip = sub(neck, mul(t, L.to));
      const legDir = norm(v(Math.sin(0.18 + 0.12 * s), -Math.cos(0.18 + 0.12 * s)));
      const knee = add(hip, mul(legDir, L.th)), ankle = add(knee, mul(norm(v(legDir.x * 0.6, legDir.y)), L.sh));
      return { ankle, knee, hip, neck, t, f, sh, hand, elbowBend: -1, armK: 1.1, toe: norm(v(0.35, -1)), headUp: 0.15 + 0.3 * s, upper: true };
    },
    // Lat pulldown: seated, thighs braced under the pad, bar pulled to the upper chest.
    pulldown(s) {
      const hip = v(0, 0.56);
      const knee = v(0.43, 0.6), ankle = v(0.47, 0.085);
      const t = fromDeg(-(12 + 10 * s)), f = perpF(t);
      const neck = add(hip, mul(t, L.to)), sh = add(neck, mul(t, -0.05));
      const top = add(sh, v(0.1, 0.6)), bottom = add(add(neck, mul(f, 0.17)), mul(t, -0.08));
      const hand = add(top, mul(sub(bottom, top), s));
      return { ankle, knee, hip, neck, t, f, sh, hand, elbowBend: -1, armK: 1.1, toe: v(1, 0), headUp: 0.35, upper: true, pulley: v(0.12, 2.15) };
    },
    // Lying press. incline: bench angle in degrees (0 = flat). close: close grip (bar lower, elbows tucked).
    bench(s, incline = 0, close = false) {
      const hip = incline ? v(0.15, 0.6) : v(0.22, 0.56);
      const t = incline ? fromDeg(-(90 - incline)) : v(-1, 0.04);
      const tt = norm(t), f = perpF(tt);
      const neck = add(hip, mul(tt, L.to)), sh = add(neck, mul(tt, -0.05));
      const top = add(sh, v(incline ? 0.04 : 0.03, 0.58));
      const bottom = incline ? add(add(neck, mul(f, 0.17)), mul(tt, -0.07)) : add(add(sh, mul(tt, close ? -0.2 : -0.14)), mul(f, 0.16));
      const hand = add(top, mul(sub(bottom, top), s));
      const knee = incline ? v(0.55, 0.6) : v(0.62, 0.5), ankle = incline ? v(0.6, 0.085) : v(0.6, 0.085);
      return { ankle, knee, hip, neck, t: tt, f, sh, hand, bar: hand, barR: 0.225, elbowBend: -1, toe: v(1, 0), headUp: incline ? 0.15 : 0.02, bench: incline || 'flat' };
    },
    flatbench(s) { return POSES.bench(s, 0); },
    inclinebench(s) { return POSES.bench(s, 38); },
    closebench(s) { return POSES.bench(s, 0, true); },
    // Push-up: a rigid plank pivoting on the toes, hands under the shoulders.
    pushup(s) {
      const A = v(-0.85, 0.11), reach = L.sh + L.th + 0.45;
      const sinT = 0.42 - 0.31 * s, cosT = Math.sqrt(1 - sinT * sinT);
      const d = v(cosT, sinT);
      const knee = add(A, mul(d, L.sh)), hip = add(knee, mul(d, L.th));
      const t = d, f = perpF(t), neck = add(hip, mul(t, L.to)), sh = add(neck, mul(t, -0.05));
      const hand = v(sh.x + 0.02, 0.06);
      void reach;
      return { ankle: A, knee, hip, neck, t, f, sh, hand, elbowBend: -1, toe: norm(v(0.35, -1)), headUp: 0.12 };
    },
    // Parallel-bar dip: hands fixed on the bars, the body lowers with a slight forward lean.
    dip(s) {
      const H = v(0.0, 1.25);
      const t = fromDeg(10 + 14 * s), f = perpF(t);
      const sh = add(H, v(-0.03 - 0.1 * s, 0.56 - 0.38 * s));
      const neck = add(sh, mul(t, 0.05)), hip = sub(neck, mul(t, L.to));
      const knee = add(hip, v(0.12, -0.4)), ankle = add(knee, v(-0.34, -0.22));
      return { ankle, knee, hip, neck, t, f, sh, hand: H, elbowBend: -1, toe: norm(v(-0.4, -1)), headUp: 0.3, dipBars: H };
    },
    // Barbell hip thrust: upper back on the bench, feet flat, hips rise to lockout. s=0 top.
    hipthrust(s) {
      const S = v(-0.1, 0.5), ang = -36 * s * Math.PI / 180;
      const dirT = v(Math.cos(ang), Math.sin(ang));
      const hip = add(S, mul(dirT, 0.45));
      const t = mul(dirT, -1), f = perpF(t);
      const neck = add(hip, mul(t, L.to)), sh = S;
      const ankle = v(0.66, 0.085), knee = ik(hip, ankle, L.th, L.sh, 1);
      const bar = add(hip, v(0, 0.13));
      return { ankle, knee, hip, neck, t, f, sh, hand: add(bar, v(-0.04, 0.0)), bar, barR: 0.225, elbowBend: 1, armK: 0.8, toe: v(1, 0), headUp: 1.4, thrustBench: true };
    },
    // Bulgarian split squat: rear foot on a bench, dumbbells at the sides.
    bss(s) {
      const hip = v(-0.05 - 0.05 * s, 0.86 - 0.37 * s);
      const fa = v(0.38, 0.085), ra = v(-0.52, 0.53);
      const knee = ik(hip, fa, L.th, L.sh, 1), rk = ik(hip, ra, L.th, L.sh, 1);
      const t = fromDeg(8 + 12 * s), f = perpF(t), neck = add(hip, mul(t, L.to)), sh = add(neck, mul(t, -0.05));
      const hand = add(sh, v(0.03, -0.62));
      return { ankle: fa, knee, hip, neck, t, f, sh, hand, straightArms: true, dumbbell: true, toe: v(1, 0), headUp: 0.6,
        far: { knee: rk, ankle: ra, toe: norm(v(-1, -0.15)) }, splitBench: true };
    },
    // Reverse lunge: step back, then lower until the back knee nearly touches the floor.
    lunge(s) {
      const step = Math.min(1, s / 0.45), down = Math.max(0, (s - 0.35) / 0.65);
      const e = step * step * (3 - 2 * step);
      const ra = v(0.02 - 0.77 * e, 0.085 + 0.05 * e + 0.08 * Math.sin(Math.PI * e));
      const hip = v(0.02 - 0.06 * e - 0.2 * down, 0.89 - 0.41 * down);
      const fa = v(0.06, 0.085);
      const knee = ik(hip, fa, L.th, L.sh, 1), rk = ik(hip, ra, L.th, L.sh, 1);
      const t = fromDeg(5 + 6 * down), f = perpF(t), neck = add(hip, mul(t, L.to)), sh = add(neck, mul(t, -0.05));
      const hand = add(sh, v(0.03, -0.62));
      return { ankle: fa, knee, hip, neck, t, f, sh, hand, straightArms: true, dumbbell: true, toe: v(1, 0), headUp: 0.6,
        far: { knee: rk, ankle: ra, toe: norm(v(1, -0.35 * e)) } };
    },
    // Barbell row: hold a hinge, pull the bar to the lower ribs.
    bbrow(s) {
      const J = hinge(0.75, 9, 46, 0.12, 0.08);
      const hang = J.hand, belly = add(add(J.hip, mul(J.t, 0.17)), mul(J.f, 0.13));
      const hand = add(hang, mul(sub(belly, hang), s));
      return { ...J, hand, bar: hand, straightArms: false, elbowBend: 1, armK: 1 };
    },
    // One-arm dumbbell row: knee and hand on the bench, the other arm rows.
    dbrow(s) {
      const hip = v(-0.2, 0.86), t = norm(v(1, 0.12)), f = perpF(t);
      const neck = add(hip, mul(t, L.to)), sh = add(neck, mul(t, -0.05));
      const ankle = v(-0.02, 0.085), knee = ik(hip, ankle, L.th, L.sh, 1);
      const hang = add(sh, v(0.02, -0.6)), up = add(add(hip, mul(t, 0.14)), mul(f, 0.1));
      const hand = add(hang, mul(sub(up, hang), s));
      return { ankle, knee, hip, neck, t, f, sh, hand, elbowBend: 1, dumbbell: true, toe: v(1, 0), headUp: 0.15, rowBench: true,
        far: { knee: v(-0.14, 0.5), ankle: v(-0.58, 0.5), toe: v(-1, 0), hand: v(sh.x + 0.03, 0.47), elbowBend: -1 } };
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
  function figure(J0, P) {
    let J = J0;
    const limbs = (side) => {
      const S = side === 'far' && J.far ? { ...J, ...J.far } : J;
      const o = side === 'far' ? 0.012 : 0; // far side sits a touch higher in frame
      const sh = add(S.sh, v(-o, o));
      const k = S.armK || 1; const elbow = S.straightArms ? add(sh, mul(sub(S.hand, sh), 0.5)) : ik(sh, S.hand, L.ua * k, L.fa * k, S.elbowBend);
      const heel = add(S.ankle, mul(S.toe, -0.06)), toe = add(heel, mul(S.toe, 0.27));
      const Jx = J; J = S; // limb shapes below read the (possibly far-side) joints
      return {
        thigh: capsule(J.hip, J.knee, 0.105, 0.065),
        shank: capsule(J.knee, J.ankle, 0.06, 0.04),
        calf: capsule(add(J.knee, mul(norm(sub(J.ankle, J.knee)), 0.07)), add(J.knee, mul(norm(sub(J.ankle, J.knee)), 0.26)), 0.055, 0.045),
        foot: capsule(add(heel, v(0, 0.0)), toe, 0.04, 0.026),
        uarm: capsule(sh, elbow, 0.056, 0.044),
        farm: capsule(elbow, J.hand, 0.044, 0.033),
        hand: capsule(J.hand, add(J.hand, mul(norm(sub(J.hand, elbow)), 0.06)), 0.035, 0.03),
        bicep: capsule(add(add(sh, mul(sub(elbow, sh), 0.2)), mul(perpF(norm(sub(elbow, sh))), -0.025)), add(add(sh, mul(sub(elbow, sh), 0.85)), mul(perpF(norm(sub(elbow, sh))), -0.02)), 0.04, 0.032),
        tricep: capsule(add(add(sh, mul(sub(elbow, sh), 0.2)), mul(perpF(norm(sub(elbow, sh))), 0.025)), add(add(sh, mul(sub(elbow, sh), 0.85)), mul(perpF(norm(sub(elbow, sh))), 0.02)), 0.042, 0.032),
        elbowPt: elbow,
        _restore: (J = Jx, 0),
      };
    };
    const near = limbs('near');
    const farL = limbs('far'); delete farL.bicep; delete farL.tricep; delete farL.elbowPt; delete farL._restore;
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
      chestU: capsule(add(add(J.sh, mul(t, -0.04)), mul(tf, 0.1)), add(add(J.sh, mul(t, -0.13)), mul(tf, 0.12)), 0.06, 0.06),
      chestL: capsule(add(add(J.sh, mul(t, -0.14)), mul(tf, 0.12)), add(add(J.sh, mul(t, -0.26)), mul(tf, 0.11)), 0.06, 0.055),
      delt: capsule(add(add(J.sh, mul(t, 0.02)), mul(tf, 0.04)), add(add(J.sh, mul(t, -0.06)), mul(tf, 0.05)), 0.05, 0.045),
      lat: capsule(add(add(J.sh, mul(t, -0.1)), mul(tf, -0.08)), add(add(hip, mul(t, 0.16)), mul(tf, -0.1)), 0.075, 0.05),
      upback: capsule(add(add(J.sh, mul(t, -0.02)), mul(tf, -0.1)), add(add(J.sh, mul(t, -0.16)), mul(tf, -0.11)), 0.06, 0.06),
      back: capsule(add(add(hip, mul(t, 0.08)), mul(tf, -0.085)), add(add(hip, mul(t, 0.36)), mul(tf, -0.09)), 0.045, 0.05),
    };
    const bicep = near.bicep, tricep = near.tricep, elbowPt = near.elbowPt; delete near.bicep; delete near.tricep; delete near.elbowPt; delete near._restore;
    const S = (o) => Object.fromEntries(Object.entries(o).map(([k, p]) => [k, poly(p, P)]));
    return { elbow: elbowPt, bicep: poly(bicep, P), tricep: poly(tricep, P), far: S(farL), near: S(near), trunk: S(trunk), muscles: S(muscles), clip: { thigh: poly(near.thigh, P), trunk: [trunk.pelvis, trunk.abs, trunk.chest].map((p) => poly(p, P)).join(' ') } };
  }

  G.WF = { POSES, figure, v, add, mul, norm, sub, L };
})(window);
