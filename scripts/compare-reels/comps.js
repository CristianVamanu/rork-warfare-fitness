// One entry per comparison reel. Anchors are body points (functions of the pose J),
// "to" is where the leader line ends (next to the callout text).
(function (G) {
  const { add, mul, sub } = WF;
  const thighMid = (J) => add(J.hip, mul(sub(J.knee, J.hip), 0.55));
  const glute = (J) => add(J.hip, mul(J.f, -0.1));
  const lowBack = (J) => add(J.hip, add(mul(J.t, 0.22), mul(J.f, -0.09)));
  const latPt = (J) => WF.add(J.sh, WF.add(WF.mul(J.t, -0.2), WF.mul(J.f, -0.1)));
  const hamMid = (J) => add(add(J.hip, mul(sub(J.knee, J.hip), 0.5)), mul(J.f, -0.06));


  const armMid = (J) => add(J.sh, mul(sub(J.hand, J.sh), 0.45));
  const chestPt = (J) => add(J.sh, add(mul(J.t, -0.16), mul(J.f, 0.12)));
  const chestUpPt = (J) => add(J.sh, add(mul(J.t, -0.06), mul(J.f, 0.11)));
  const deltPt = (J) => add(J.sh, mul(J.f, 0.04));
  const corePt = (J) => add(J.hip, add(mul(J.t, 0.2), mul(J.f, 0.09)));
  const C3 = (list) => list.map(([b, s, a], i) => ({ b, s, x: 620, y: [520, 820, 1060][i], at: 0, a, to: { x: 600, y: [548, 848, 1088][i] } }));
  const timed = (calls, base) => calls.map((c, i) => ({ ...c, at: base + 1.6 * i }));

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

    pullup_pulldown: {
      n: '03', title: 'Pull-Up<i>vs</i>Pulldown', titleSize: 104, hook: 'Which one builds a bigger back?',
      A: { ex: 'pullup', label: 'PULL-UP', title: 'Pull-Up', tag: 'BODYWEIGHT · YOU MOVE, THE BAR STAYS',
        levels: { lat: .95, upback: .6, bicep: .6 }, hook: { ox: 300, scale: 270 }, fig: { ox: 420, oy: 1360, scale: 380 },
        calls: [
          { b: 'The load is you', s: 'No weight stack. Your bodyweight is the resistance.', x: 620, y: 520, at: 4.4, a: (J) => J.hip, to: { x: 600, y: 548 } },
          { b: 'Lats pull you up', s: 'Lats and upper back do the main work, biceps assist.', x: 620, y: 820, at: 6.0, a: latPt, to: { x: 600, y: 848 } },
          { b: 'Needs strength for rep one', s: "Can't do one yet? You need a band or machine to help.", x: 620, y: 1060, at: 7.6, a: (J) => J.hand, to: { x: 600, y: 1088 } }],
        meters: [['Lats', 4, 'High'], ['Load options', 2, 'Bodyweight'], ['Strength to start', 5, 'High']] },
      B: { ex: 'pulldown', label: 'LAT PULLDOWN', title: 'Lat Pulldown', tag: 'CABLE MACHINE · THE BAR MOVES, YOU STAY',
        levels: { lat: .9, upback: .55, bicep: .55 }, hook: { ox: 740, scale: 270 }, fig: { ox: 420, oy: 1360, scale: 380 },
        calls: [
          { b: 'Pick any weight', s: 'Start light and add plates as you get stronger.', x: 620, y: 520, at: 11.8, a: (J) => J.hand, to: { x: 600, y: 548 } },
          { b: 'Similar lat work', s: 'Studies measure similar lat activity to pull-ups.', x: 620, y: 820, at: 13.4, a: latPt, to: { x: 600, y: 848 } },
          { b: 'Thighs locked in', s: 'The pad holds you down so you can focus on the pull.', x: 620, y: 1060, at: 15.0, a: (J) => J.knee, to: { x: 600, y: 1088 } }],
        meters: [['Lats', 4, 'High'], ['Load options', 5, 'Any'], ['Strength to start', 1, 'Low']] },
      verdict: [
        ['CHOOSE THE PULL-UP FOR', 'Relative strength', ['Getting strong at moving your own body', 'Training anywhere with a bar']],
        ['CHOOSE THE PULLDOWN FOR', 'Adjustable back work', ['Any level, any weight', 'Easy to add reps and sets for size']]],
      both: "Can't do pull-ups yet? <em>Pulldown.</em><br>Already can? Do both.",
    },

    incline_flat: {
      n: '04', title: 'Flat<i>vs</i>Incline Bench', titleSize: 100, hook: 'Which one builds a bigger chest?',
      A: { ex: 'flatbench', label: 'FLAT BENCH', title: 'Flat Bench', tag: 'BARBELL · BENCH AT 0°',
        levels: { chestL: .95, chestU: .55, delt: .45, tricep: .55 }, hook: { ox: 300, scale: 210 }, fig: { ox: 380, oy: 1330, scale: 360 },
        calls: timed(C3([
          ['Your heaviest press', 'Most people move the most weight on a flat bench.', (J) => J.hand],
          ['Mid and lower chest', 'EMG studies show flat pressing favours the lower (sternal) part of the chest.', chestPt],
          ['Triceps finish it', 'Straightening the elbows at the top is triceps work.', armMid]]), 4.4),
        meters: [['Upper chest', 3, 'Med'], ['Mid/lower chest', 5, 'Max'], ['Front delts', 3, 'Med']] },
      B: { ex: 'inclinebench', label: 'INCLINE BENCH', title: 'Incline Bench', tag: 'BARBELL · BENCH AT 30–45°',
        levels: { chestU: .95, chestL: .5, delt: .7, tricep: .55 }, hook: { ox: 780, scale: 210 }, fig: { ox: 400, oy: 1330, scale: 360 },
        calls: timed(C3([
          ['Upper chest bias', 'At 30–45°, studies measure more upper-chest activity than flat.', chestUpPt],
          ['More front delts', 'The steeper the bench, the more your shoulders take over.', deltPt],
          ['A little less weight', 'Most people press less on an incline than on a flat bench.', (J) => J.hand]]), 11.8),
        meters: [['Upper chest', 5, 'Max'], ['Mid/lower chest', 3, 'Med'], ['Front delts', 4, 'High']] },
      verdict: [
        ['CHOOSE FLAT FOR', 'Overall pressing strength', ['Moves the most weight', 'Mid and lower chest']],
        ['CHOOSE INCLINE FOR', 'The upper chest', ['Fills out the top of your chest', 'Keep it around 30–45°, not steeper']]],
      both: 'Best plan? <em>Both.</em><br>Flat for strength.<br>Incline for the top.',
    },

    pushup_bench: {
      n: '05', title: 'Push-Ups<i>vs</i>Bench', titleSize: 108, hook: 'Can push-ups build as much chest as the bench?',
      A: { ex: 'pushup', label: 'PUSH-UPS', title: 'Push-Ups', tag: 'BODYWEIGHT · ANYWHERE',
        levels: { chestL: .85, chestU: .5, delt: .5, tricep: .6, core: .55 }, hook: { ox: 300, scale: 200 }, fig: { ox: 360, oy: 1250, scale: 320 },
        calls: timed(C3([
          ['Your body is the bar', 'You press roughly 65–75% of your bodyweight each rep.', (J) => J.sh],
          ['Core holds the plank', 'Your abs keep your hips from sagging.', corePt],
          ['Same growth, when it is hard', 'Studies found similar chest growth to bench when effort was matched.', chestPt]]), 4.4),
        meters: [['Chest', 4, 'High'], ['Load options', 2, 'Bodyweight+'], ['Core', 4, 'High']] },
      B: { ex: 'flatbench', label: 'BENCH PRESS', title: 'Bench Press', tag: 'BARBELL · ADD WEIGHT ANY TIME',
        levels: { chestL: .9, chestU: .55, delt: .5, tricep: .6 }, hook: { ox: 780, scale: 210 }, fig: { ox: 380, oy: 1330, scale: 360 },
        calls: timed(C3([
          ['Load it up', 'Add small plates week by week. Easy to track progress.', (J) => J.hand],
          ['Back on the bench', 'Fully supported, so every bit of effort goes into the press.', (J) => J.hip],
          ['Best for max strength', 'To get strong at the bench press, you have to bench.', chestPt]]), 11.8),
        meters: [['Chest', 4, 'High'], ['Load options', 5, 'Any'], ['Core', 1, 'Low']] },
      verdict: [
        ['CHOOSE PUSH-UPS FOR', 'Training anywhere', ['Similar chest growth when sets go near failure', 'Add reps or harder variations as you improve']],
        ['CHOOSE THE BENCH FOR', 'Max strength', ['Easy to add weight in small steps', 'The way to get strong at benching']]],
      both: 'No gym? <em>Push-ups work.</em><br>In the gym? Do both.',
    },

    thrust_rdl: {
      n: '06', title: 'Hip Thrust<i>vs</i>RDL', hook: 'Which one builds bigger glutes?',
      A: { ex: 'hipthrust', label: 'HIP THRUST', title: 'Hip Thrust', tag: 'BARBELL · UPPER BACK ON A BENCH',
        levels: { glute: 1, ham: .3, quad: .45 }, hook: { ox: 320, scale: 230 }, fig: { ox: 330, oy: 1300, scale: 370 },
        calls: timed(C3([
          ['Hardest at the top', 'Glutes work hardest with your hips fully locked out.', glute],
          ['Knees stay bent', 'So the hamstrings do less than in an RDL.', hamMid],
          ['Bar on your hips', 'Not on your back, so your spine carries little load.', (J) => J.bar]]), 4.4),
        meters: [['Glutes', 5, 'Max'], ['Hamstrings', 2, 'Low'], ['Lower back', 1, 'Low']] },
      B: { ex: 'rdl', label: 'ROMANIAN DEADLIFT', title: 'Romanian Deadlift', tag: 'HIP HINGE · FROM THE TOP',
        levels: { ham: 1, glute: .85, back: .6, core: .35 }, hook: { ox: 780, scale: 300 }, fig: { ox: 360, oy: 1330, scale: 470 },
        calls: timed(C3([
          ['Hardest at the bottom', 'Glutes and hamstrings are loaded in a long stretch.', glute],
          ['Hamstrings work hard', 'Long range for the back of the thigh, from hip to knee.', hamMid],
          ['Back holds the bar', 'Your back stays braced for the whole set.', lowBack]]), 11.8),
        meters: [['Glutes', 4, 'High'], ['Hamstrings', 5, 'Max'], ['Lower back', 3, 'Med']] },
      verdict: [
        ['CHOOSE THE HIP THRUST FOR', 'Glutes at lockout', ['Max tension with hips extended', 'Little load on the lower back']],
        ['CHOOSE THE RDL FOR', 'Glutes and hamstrings', ['Loaded in a long stretch', 'Builds the whole back of your legs']]],
      both: 'Studies measure similar glute activity.<br><em>Do both.</em>',
    },

    bss_lunge: {
      n: '07', title: 'Split Squat<i>vs</i>Lunge', titleSize: 96, hook: 'Bulgarian split squat or lunge?',
      A: { ex: 'bss', label: 'BULGARIAN SPLIT SQUAT', title: 'Bulgarian Split Squat', tag: 'REAR FOOT ON A BENCH',
        levels: { quad: .9, glute: .85, ham: .3, core: .2 }, hook: { ox: 330, scale: 280 }, fig: { ox: 470, oy: 1330, scale: 430 },
        calls: timed(C3([
          ['The front leg does the work', 'Research shows the back foot adds very little to the lift.', thighMid],
          ['Deep hip and knee bend', 'Glutes and quads both work through a big range.', glute],
          ['Easy to load', 'Feet stay planted, so heavier dumbbells are easy.', (J) => J.hand]]), 4.4),
        meters: [['Quads', 4, 'High'], ['Glutes', 4, 'High'], ['Balance needed', 3, 'Med']] },
      B: { ex: 'lunge', label: 'LUNGE', title: 'Lunge', tag: 'REVERSE · STEP BACK, THEN DOWN',
        levels: { quad: .8, glute: .85, ham: .3, core: .3 }, hook: { ox: 790, scale: 280 }, fig: { ox: 470, oy: 1330, scale: 430 },
        calls: timed(C3([
          ['You move every rep', 'Stepping out and back trains balance and coordination.', (J) => J.hip],
          ['Glutes kick in', 'Studies found moving lunges work the glutes more than static ones.', glute],
          ['No bench needed', 'Do them anywhere, with or without weights.', (J) => J.hand]]), 11.8),
        meters: [['Quads', 4, 'High'], ['Glutes', 4, 'High'], ['Balance needed', 4, 'High']] },
      verdict: [
        ['CHOOSE THE SPLIT SQUAT FOR', 'Max load per leg', ['Front leg does nearly all the work', 'Easy to go heavy and deep']],
        ['CHOOSE THE LUNGE FOR', 'Athletic legs', ['Balance and coordination every step', 'No bench or equipment needed']]],
      both: 'Both build legs.<br><em>Pick the one you will actually do.</em>',
    },

    bbrow_dbrow: {
      n: '08', title: 'Barbell<i>vs</i>Dumbbell Row', titleSize: 92, hook: 'Which row builds a bigger back?',
      A: { ex: 'bbrow', label: 'BARBELL ROW', title: 'Barbell Row', tag: 'BOTH ARMS · HOLD THE HINGE',
        levels: { lat: .85, upback: .85, back: .75, bicep: .5, ham: .3 }, hook: { ox: 300, scale: 300 }, fig: { ox: 360, oy: 1330, scale: 470 },
        calls: timed(C3([
          ['Your heaviest row', 'Both arms pull together, so you can load the most.', (J) => J.hand],
          ['Lower back works too', 'A study found the standing barbell row loaded the spine most of the rows tested.', lowBack],
          ['Lats and upper back', 'They pull the bar up to your lower ribs.', latPt]]), 4.4),
        meters: [['Lats & upper back', 4, 'High'], ['Lower back', 4, 'High'], ['Load', 5, 'Max']] },
      B: { ex: 'dbrow', label: 'DUMBBELL ROW', title: 'Dumbbell Row', tag: 'ONE ARM · SUPPORTED ON A BENCH',
        levels: { lat: .9, upback: .8, bicep: .5 }, hook: { ox: 780, scale: 260 }, fig: { ox: 380, oy: 1330, scale: 420 },
        calls: timed(C3([
          ['Supported by the bench', 'Knee and hand on the bench take strain off your lower back.', (J) => J.hip],
          ['One side at a time', 'Find and fix strength gaps between left and right.', (J) => J.hand],
          ['Longer pull', 'No bar in the way, so the elbow can travel further back.', latPt]]), 11.8),
        meters: [['Lats & upper back', 4, 'High'], ['Lower back', 1, 'Low'], ['Load', 3, 'Med']] },
      verdict: [
        ['CHOOSE THE BARBELL ROW FOR', 'Heavy back strength', ['The most weight you can row', 'Trains your hinge at the same time']],
        ['CHOOSE THE DUMBBELL ROW FOR', 'Back size, less strain', ['Lower back stays supported', 'Each side works on its own']]],
      both: 'Lower back tired? <em>Dumbbell row.</em><br>Feeling fresh? Barbell.',
    },

    dips_cgbench: {
      n: '09', title: 'Dips<i>vs</i>Close-Grip', titleSize: 104, hook: 'Which one builds bigger triceps?',
      A: { ex: 'dip', label: 'DIPS', title: 'Dips', tag: 'BODYWEIGHT · PARALLEL BARS',
        levels: { tricep: .95, chestL: .6, delt: .65 }, hook: { ox: 330, scale: 260 }, fig: { ox: 420, oy: 1360, scale: 400 },
        calls: timed(C3([
          ['Your whole body on your arms', 'Every rep presses your bodyweight back up.', (J) => J.sh],
          ['Deep shoulder stretch', 'The bottom stretches the shoulders a lot. Not everyone finds it comfortable.', deltPt],
          ['Triceps lock it out', 'Straightening the elbows is the triceps’ job.', armMid]]), 4.4),
        meters: [['Triceps', 4, 'High'], ['Chest', 3, 'Med'], ['Load options', 3, 'Bodyweight+']] },
      B: { ex: 'closebench', label: 'CLOSE-GRIP BENCH', title: 'Close-Grip Bench', tag: 'BARBELL · HANDS SHOULDER-WIDTH',
        levels: { tricep: .9, chestL: .6, chestU: .4, delt: .45 }, hook: { ox: 780, scale: 210 }, fig: { ox: 380, oy: 1330, scale: 360 },
        calls: timed(C3([
          ['Easy to load', 'Add small plates week by week.', (J) => J.hand],
          ['Closer grip, more triceps', 'Bringing the hands in shifts work toward the triceps.', armMid],
          ['Chest still helps', 'It is still a bench press, so chest and front delts work too.', chestPt]]), 11.8),
        meters: [['Triceps', 4, 'High'], ['Chest', 3, 'Med'], ['Load options', 5, 'Any']] },
      verdict: [
        ['CHOOSE DIPS FOR', 'Bodyweight strength', ['Moves your whole body', 'Best if your shoulders feel good on them']],
        ['CHOOSE CLOSE-GRIP FOR', 'Steady, heavy triceps work', ['Easy to add weight in small steps', 'Stable, supported position']]],
      both: 'Dips feel good? <em>Do both.</em><br>Shoulders complain? Close-grip.',
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
