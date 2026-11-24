// One entry per comparison reel. Anchors are body points (functions of the pose J),
// "to" is where the leader line ends (next to the callout text).
(function (G) {
  const { add, mul, sub } = WF;
  const thighMid = (J) => add(J.hip, mul(sub(J.knee, J.hip), 0.55));
  const glute = (J) => add(J.hip, mul(J.f, -0.1));
  const lowBack = (J) => add(J.hip, add(mul(J.t, 0.22), mul(J.f, -0.09)));
  const hamMid = (J) => add(add(J.hip, mul(sub(J.knee, J.hip), 0.5)), mul(J.f, -0.06));

  G.COMPS = {
    squat_press: {
      n: '01', title: 'Squat<i>vs</i>Leg Press', hook: 'Which one actually builds your legs?',
      A: { ex: 'squat', label: 'BACK SQUAT', title: 'Back Squat', tag: 'FREE WEIGHT · YOU CONTROL THE BAR',
        levels: { quad: .9, glute: .85, core: .6, back: .7, ham: .25 }, hook: { ox: 230, scale: 360 }, fig: { ox: 300, oy: 1330, scale: 470 },
        calls: [
          { b: 'You balance the bar', s: 'Nothing guides the path. Your core and back hold you upright.', x: 620, y: 520, at: 4.4, a: (J) => add(J.hip, add(mul(J.t, 0.26), mul(J.f, 0.1))), to: { x: 600, y: 548 } },
          { b: 'Deep hip bend', s: 'Glutes stretch hard at the bottom.', x: 620, y: 820, at: 6.0, a: glute, to: { x: 600, y: 848 } },
          { b: 'Quads drive you up', s: 'Plus adductors and calves keep you stable.', x: 620, y: 1060, at: 7.6, a: thighMid, to: { x: 600, y: 1088 } }],
        meters: [['Quads', 4, 'High'], ['Glutes', 4, 'High'], ['Core & back', 4, 'High']] },
      B: { ex: 'press', label: 'LEG PRESS', title: 'Leg Press', tag: 'MACHINE · THE SLED GUIDES THE PATH',
        levels: { quad: 1, glute: .5, core: .05, ham: .1 }, hook: { ox: 600, scale: 250 }, fig: { ox: 340, oy: 1300, scale: 370 },
        calls: [
          { b: 'Back supported', s: 'Very little load on your spine or core.', x: 90, y: 430, at: 11.8, a: (J) => add(J.hip, add(mul(J.t, 0.45), mul(J.f, -0.14))), to: { x: 250, y: 600 } },
          { b: 'Fixed path', s: 'No balancing, so you can push closer to failure.', x: 600, y: 430, at: 13.4, a: (J) => add(J.ankle, mul(J.W, 0.06)), to: { x: 760, y: 600 } },
          { b: 'Quads take the load', s: 'Easy to add volume without the fatigue of heavy squats.', x: 600, y: 1170, at: 15.0, a: thighMid, to: { x: 600, y: 1198 } }],
        meters: [['Quads', 5, 'Max'], ['Glutes', 3, 'Med'], ['Core & back', 1, 'Low']] },
      verdict: [
        ['CHOOSE THE SQUAT FOR', 'Strength & athleticism', ['Whole-body strength that carries over', 'Glutes, core and back working together']],
        ['CHOOSE THE LEG PRESS FOR', 'Extra quad growth', ['More leg volume with less fatigue', 'Training legs when your back needs a break']]],
      both: 'Best plan? <em>Both.</em><br>Squat first. Press after.',
    },

    deadlift_rdl: {
      n: '02', title: 'Deadlift<i>vs</i>RDL', hook: 'Same bar. Completely different job.',
      A: { ex: 'deadlift', label: 'DEADLIFT', title: 'Deadlift', tag: 'CONVENTIONAL · FROM THE FLOOR',
        levels: { quad: .55, glute: .85, ham: .65, back: .95, core: .55 }, hook: { ox: 300, scale: 330 }, fig: { ox: 330, oy: 1330, scale: 470 },
        calls: [
          { b: 'Dead stop on the floor', s: 'Every rep starts from zero. Pure pulling strength.', x: 620, y: 520, at: 4.4, a: (J) => J.bar, to: { x: 600, y: 548 } },
          { b: 'Knees and hips extend', s: 'Quads break it off the floor, glutes finish the lockout.', x: 620, y: 820, at: 6.0, a: thighMid, to: { x: 600, y: 848 } },
          { b: 'Whole back holds the bar', s: 'Your back stays rigid from floor to lockout.', x: 620, y: 1060, at: 7.6, a: lowBack, to: { x: 600, y: 1088 } }],
        meters: [['Hamstrings', 4, 'High'], ['Glutes', 4, 'High'], ['Lower back', 5, 'Max']] },
      B: { ex: 'rdl', label: 'ROMANIAN DEADLIFT', title: 'Romanian Deadlift', tag: 'HIP HINGE · FROM THE TOP',
        levels: { ham: 1, glute: .8, back: .6, core: .35, quad: .05 }, hook: { ox: 760, scale: 330 }, fig: { ox: 360, oy: 1330, scale: 470 },
        calls: [
          { b: 'Starts standing', s: 'No floor reset. The muscles stay under tension the whole set.', x: 620, y: 520, at: 11.8, a: (J) => J.bar, to: { x: 600, y: 548 } },
          { b: 'Soft knees, hips back', s: 'The knees barely move. The hips do the work.', x: 620, y: 820, at: 13.4, a: glute, to: { x: 600, y: 848 } },
          { b: 'Hamstrings stretch under load', s: 'One of the best ways to load them in a long stretch.', x: 620, y: 1060, at: 15.0, a: hamMid, to: { x: 600, y: 1088 } }],
        meters: [['Hamstrings', 5, 'Max'], ['Glutes', 4, 'High'], ['Lower back', 3, 'Med']] },
      verdict: [
        ['CHOOSE THE DEADLIFT FOR', 'Total-body strength', ['Moves the most weight of any lift', 'Builds your back, grip and lockout']],
        ['CHOOSE THE RDL FOR', 'Hamstrings & glutes', ['Long stretch with constant tension', 'Lighter loads, easier to recover from']]],
      both: 'Best plan? <em>Both.</em><br>Deadlift heavy. RDL for size.',
    },
  };
})(window);
