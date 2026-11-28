// Content for workout.html?w=<key>. n = frame count of the clip folder (default 197).
window.WORKOUTS = {
  calisthenics: {
  title:['Ultimate','Calisthenics','Workout'], sub:'8 moves · full body · abs included',
  rest:'Rest 90 s', foot:'3 days a week · rest about 90 s between sets · stop 1 to 2 reps before failure',
  ex:[
    {name:'Pull-Up',fr:'fr_pullup',m:'Lats, biceps, mid back',sets:3,reps:'5–8'},
    {name:'Chest Dip',fr:'fr_dips',m:'Chest, triceps, front delts',sets:3,reps:'5–8'},
    {name:'Squat',fr:'fr_Squat',m:'Quads, glutes',sets:3,reps:'15–20'},
    {name:'Inverted Row',fr:'fr_invrow',m:'Mid back, lats, rear delts',sets:3,reps:'8–12'},
    {name:'Push-Up',fr:'fr_pushup',m:'Chest, triceps, core',sets:3,reps:'8–15'},
    {name:'Hanging Leg Raise',fr:'fr_hlr',m:'Abs, hip flexors',sets:3,reps:'8–12',abs:1},
    {name:'V-Up',fr:'fr_vup',m:'Abs',sets:3,reps:'8–12',abs:1},
    {name:'Side Plank',fr:'fr_sideplank',m:'Obliques',sets:3,reps:'20–30 s',per:'each side',abs:1},
  ]},
  kettlebell: {
    title: ['Ultimate', 'Kettlebell', 'Workout'], sub: '8 moves · one kettlebell · full body',
    rest: 'Rest 60–90 s', foot: '2–3 days a week · rest 60–90 s · use a bell you control on every rep',
    promo: ['Want the full 90 days?', 'Kettlebell', 'Warfare', 'The complete program in the Warfare Fitness app'],
    ex: [
      { name: 'Kettlebell Swing', fr: 'kb_swing', n: 198, m: 'Glutes, hamstrings, back', sets: 4, reps: '15' },
      { name: 'Goblet Squat', fr: 'kb_goblet', n: 198, m: 'Quads, glutes, core', sets: 3, reps: '10–12' },
      { name: 'One-Arm Row', fr: 'kb_row', n: 198, m: 'Lats, mid back, biceps', sets: 3, reps: '10', per: 'each side' },
      { name: 'Strict Press', fr: 'kb_press', n: 177, m: 'Shoulders, triceps', sets: 3, reps: '6–8', per: 'each side' },
      { name: 'Romanian Deadlift', fr: 'kb_rdl', n: 182, m: 'Hamstrings, glutes', sets: 3, reps: '10–12' },
      { name: 'Reverse Lunge', fr: 'kb_lunge', n: 177, m: 'Quads, glutes', sets: 3, reps: '8', per: 'each leg' },
      { name: 'Russian Twist', fr: 'kb_twist', n: 245, m: 'Obliques, abs', sets: 3, reps: '20', per: '10 each side', abs: 1 },
      { name: 'Plank Pass-Through', fr: 'kb_plank', n: 342, m: 'Abs, shoulders', sets: 3, reps: '10', per: '5 each side', abs: 1 },
    ] },
  home_women: {
    title: ['20-Minute', 'Home', 'Workout'], sub: 'For women · 6 moves · no equipment',
    rest: 'Rest 30 s', foot: 'About 20 minutes · 3 rounds of each move · rest 30 s between sets',
    ex: [
      { name: 'Jumping Jack', fr: 'hw_g_jack', n: 158, m: 'Warm-up, full body', sets: 3, reps: '30 s' },
      { name: 'Squat', fr: 'hw_g_squat', n: 198, m: 'Quads, glutes', sets: 3, reps: '15' },
      { name: 'Push-Up', fr: 'hw_g_pushup', n: 198, m: 'Chest, triceps, core', sets: 3, reps: '8–12' },
      { name: 'Plank Hip Raise', fr: 'hw_g_bridge', n: 199, m: 'Abs, shoulders', sets: 3, reps: '10–12', abs: 1 },
      { name: 'Reverse Crunch', fr: 'hw_g_revcrunch', n: 198, m: 'Lower abs', sets: 3, reps: '12–15', abs: 1 },
      { name: 'Front Plank', fr: 'hw_g_plank', n: 219, m: 'Abs, core', sets: 3, reps: '30 s', abs: 1 },
    ] },
  home_men: {
    title: ['20-Minute', 'Home', 'Workout'], sub: 'For men · 6 moves · no equipment',
    rest: 'Rest 30 s', foot: 'About 20 minutes · 3 rounds of each move · rest 30 s between sets',
    ex: [
      { name: 'Jumping Jack', fr: 'hw_m_jack', n: 158, m: 'Warm-up, full body', sets: 3, reps: '40 s' },
      { name: 'Push-Up', fr: 'fr_pushup', m: 'Chest, triceps, core', sets: 3, reps: '12–15' },
      { name: 'Squat', fr: 'fr_Squat', m: 'Quads, glutes', sets: 3, reps: '20' },
      { name: 'Close-Grip Push-Up', fr: 'hw_m_cgpush', n: 197, m: 'Triceps, chest', sets: 3, reps: '8–12' },
      { name: 'Burpee', fr: 'hw_m_burpee', n: 198, m: 'Full body, conditioning', sets: 3, reps: '10' },
      { name: 'Lying Leg Raise', fr: 'hw_m_legraise', n: 197, m: 'Abs, hip flexors', sets: 3, reps: '12–15', abs: 1 },
    ] },
};
