// Content for the white-panel comparison reels (panels.html?c=<key>).
// a / b: the two exercises. fr: frame folder made by panel_frames.py. best: closing bar (layout 2).
// Keep claims conservative and sourced; see the PR / notes for references.
window.COMPS = {
  legext_legpress: {
    a: { name: 'Leg Extension', fr: 'fr_legext', primary: 'Quadriceps', secondary: 'None. It is an isolation lift', move: 'One joint: only the knee moves', best: 'Finishing the quads, or training them when your back is tired', short: ['Isolates the quads', 'Only the knee moves', 'No load on your back'], type: 'Isolation' },
    b: { name: 'Leg Press', fr: 'fr_Sled_45_Degree_Leg_Wide_Press', primary: 'Quadriceps, glutes', secondary: 'Hamstrings, adductors, calves', move: 'Two joints: hips and knees move together', best: 'Overall leg size and strength', short: ['Quads and glutes together', 'Hips and knees both move', 'Handles heavier loads'], type: 'Compound' },
    best: '<b>Extension</b> to finish the quads · <b>Press</b> for overall size',
  },
  pullup_pulldown: {
    a: { name: 'Pull-Up', fr: 'fr_pullup', primary: 'Lats', secondary: 'Biceps, mid back, rear delts, core', move: 'You pull your whole body up to a fixed bar', best: 'Upper body strength once you can do several reps', short: ['Lifts your own bodyweight', 'Core and grip work hard', 'Needs only a bar'], type: 'Compound' },
    b: { name: 'Lat Pulldown', fr: 'fr_pulldown', primary: 'Lats', secondary: 'Biceps, mid back, rear delts', move: 'You stay seated and pull the bar down to you', best: 'Beginners building up to pull-ups, and extra back volume', short: ['Load adjusts from very light', 'Easy to learn', 'Good for higher reps'], type: 'Compound' },
    best: '<b>Pull-up</b> for strength · <b>Pulldown</b> to build up to it',
  },
  incline_flat: {
    a: { name: 'Incline Bench', fr: 'fr_inclinebench', primary: 'Upper chest, front delts', secondary: 'Triceps', move: 'Bench set at about 30 to 45 degrees', best: 'Building the upper chest', short: ['More upper chest work', 'More front delt work', 'Usually less weight than flat'], type: 'Compound' },
    b: { name: 'Flat Bench', fr: 'fr_flatbench', primary: 'Chest', secondary: 'Front delts, triceps', move: 'Flat bench, bar pressed straight up over the chest', best: 'Overall chest size and pressing strength', short: ['Works the whole chest', 'Usually your strongest press', 'Easy to track progress'], type: 'Compound' },
    best: '<b>Incline</b> for the upper chest · <b>Flat</b> for overall strength',
  },
  pushup_bench: {
    a: { name: 'Push-Up', fr: 'fr_pushup', primary: 'Chest, triceps', secondary: 'Front delts, core', move: 'Hands on the floor, your whole body moves', best: 'Training anywhere, with no equipment', short: ['No equipment needed', 'Core works to hold a plank', 'Progress with harder variations'], type: 'Compound' },
    b: { name: 'Bench Press', fr: 'fr_flatbench', primary: 'Chest, triceps', secondary: 'Front delts', move: 'You lie on the bench and press the bar up', best: 'Maximum pressing strength', short: ['Easy to load heavy', 'Small, exact weight jumps', 'Back supported by the bench'], type: 'Compound' },
    best: '<b>Push-up</b> anywhere · <b>Bench</b> to go heavy',
  },
  bbrow_dbrow: {
    a: { name: 'Barbell Row', fr: 'fr_bbrow', primary: 'Lats, mid back', secondary: 'Rear delts, biceps, lower back', move: 'Both arms pull one bar to the stomach', best: 'Heavy back strength', short: ['Heaviest row you can load', 'Both sides pull together', 'Lower back holds the hinge'], type: 'Compound' },
    b: { name: 'Dumbbell Row', fr: 'fr_dbrow', primary: 'Lats, mid back', secondary: 'Rear delts, biceps, lower back', move: 'Each arm pulls its own dumbbell', best: 'Range of motion and evening out each side', short: ['Each side works on its own', 'Hands can turn freely', 'Longer range at the top'], type: 'Compound' },
    best: '<b>Barbell</b> for heavy loads · <b>Dumbbells</b> for range and balance',
  },
  dips_cgbench: {
    a: { name: 'Chest Dips', fr: 'fr_dips', primary: 'Lower chest, triceps', secondary: 'Front delts', move: 'Your body moves between two bars, leaning forward', best: 'Lower chest and triceps with just bodyweight', short: ['Bodyweight, add load later', 'Deep stretch for the chest', 'Lean forward for more chest'], type: 'Compound' },
    b: { name: 'Close-Grip Bench', fr: 'fr_cgbench', primary: 'Triceps', secondary: 'Chest, front delts', move: 'Narrow grip, elbows kept close to the body', best: 'Triceps strength', short: ['Heavy triceps loading', 'Back supported by the bench', 'Easy to load in small jumps'], type: 'Compound' },
    best: '<b>Dips</b> for chest and triceps · <b>Close-grip</b> for triceps strength',
  },
  squat_legpress: {
    a: { name: 'Barbell Squat', fr: 'fr_Classic_Barbell_Squat', primary: 'Quadriceps, glutes, adductors', secondary: 'Hamstrings, lower back, core', move: 'Free bar on your back, you balance the weight', best: 'Overall strength and athletic legs', short: ['Trains balance and core', 'Hips and knees both move', 'Carries over to sport'], type: 'Compound' },
    b: { name: 'Leg Press', fr: 'fr_Sled_45_Degree_Leg_Wide_Press', primary: 'Quadriceps, glutes', secondary: 'Hamstrings, adductors, calves', move: 'Back supported, the sled moves on a fixed path', best: 'Leg size with less load on the back', short: ['No balance needed', 'Back stays supported', 'Easy to push close to failure'], type: 'Compound' },
    best: '<b>Squat</b> for full-body strength · <b>Press</b> for leg size, back supported',
  },
};
