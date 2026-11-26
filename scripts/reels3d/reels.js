// Content for scene.html?c=<key>. Numbers come from src/lib/ptStandards.ts
// (events = the published minimum, competitive = what selected candidates hit).
const mmss = (x, total) => { const s = Math.round(x * total); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
window.REELS3D = {
  seal_pushups: {
    pose: 'pushup', kicker: 'Navy SEAL screening test · push-ups',
    title: 'Pass vs picked',
    hook: ['50 push-ups', 'passes the test.', 'It does not get you picked.'],
    a: { label: 'Minimum to pass', value: 50, done: 'Passes' },
    b: { label: 'Competitive', value: 79, done: 'Competitive' },
    clock: (x) => `${mmss(x, 120)} / 2:00`,
    gap: ['29 more reps', 'in the same 2 minutes', 'The minimum gets you in the door. The competitive score is what candidates who get a contract are hitting.'],
    cta: ['Where would', 'you land?', 'Test yourself free', 'warfarefitness.com/standards'],
  },
};
