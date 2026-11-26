// Content for battle.html?c=<key>. Each round needs a defensible winner:
// say what the claim rests on in `basis`, and keep `why` to what the source shows.
window.BATTLES = {
  chinup_pullup: {
    basis: 'Muscle activity (EMG) · not growth',
    hook: ['Chin-up vs', 'pull-up'], ask: ['Chin-ups or', 'pull-ups?'],
    a: { name: 'Chin-Up', fr: 'fr_chinup', n: 196 }, b: { name: 'Pull-Up', fr: 'fr_pullup', n: 197 },
    rounds: [
      { cat: 'Biceps', win: 'a', why: 'Palms facing you: the biceps worked harder in the chin-up' },
      { cat: 'Lower traps', win: 'b', why: 'Palms away: the lower traps worked harder in the pull-up' },
      { cat: 'Chest', win: 'a', why: 'The chest helped more in the chin-up' },
    ],
    winner: 'a', final: ['Chin-up', 'wins 2 – 1'], verdict: 'Lats worked very hard in both. Do both.',
  },
};
