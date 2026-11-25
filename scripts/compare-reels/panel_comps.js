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
    a: { name: 'Pull-Up', fr: 'fr_pullup', n: 197, primary: 'Lats', secondary: 'Biceps, mid back, rear delts, core', move: 'You pull your whole body up to a fixed bar', best: 'Upper body strength once you can do several reps', short: ['Lifts your own bodyweight', 'Core and grip work hard', 'Needs only a bar'], type: 'Compound' },
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
  bbcurl_hammer: {
    a: { name: 'Barbell Curl', fr: 'fr_bbcurl', primary: 'Biceps', secondary: 'Brachialis, forearms', move: 'Palms face up, both arms curl one bar', best: 'Building the biceps with heavier loads', short: ['Palms up targets the biceps', 'Both arms lift together', 'Easy to load heavier'], type: 'Isolation' },
    b: { name: 'Hammer Curl', fr: 'fr_hammer', primary: 'Brachialis, brachioradialis', secondary: 'Biceps', move: 'Palms face each other, thumbs up', best: 'Thicker arms and stronger forearms', short: ['Neutral grip, thumbs up', 'More forearm work', 'Easier on the wrists for many'], type: 'Isolation' },
    best: '<b>Barbell curl</b> for the biceps · <b>Hammer</b> for arm thickness',
  },
  press_latraise: {
    a: { name: 'Military Press', fr: 'fr_milpress', primary: 'Front delts', secondary: 'Side delts, triceps, upper chest', move: 'Two joints: shoulders and elbows press overhead', best: 'Overall shoulder strength', short: ['Heavy compound press', 'Triceps work too', 'Builds overhead strength'], type: 'Compound' },
    b: { name: 'Lateral Raise', fr: 'fr_latraise', primary: 'Side delts', secondary: 'Upper traps, front delts', move: 'One joint: arms raise out to the side', best: 'Wider-looking shoulders', short: ['Isolates the side delts', 'Light weight, strict form', 'Good for higher reps'], type: 'Isolation' },
    best: '<b>Press</b> for strength · <b>Lateral raise</b> for wider shoulders',
  },
  pushdown_overhead: {
    a: { name: 'Triceps Pushdown', fr: 'fr_pushdown', primary: 'Triceps', secondary: 'None. It is an isolation lift', move: 'Arms by your sides, elbows straighten downward', best: 'Triceps volume, easy on the shoulders', short: ['Simple to learn', 'Arms stay at your sides', 'Good for high reps'], type: 'Isolation' },
    b: { name: 'Overhead Extension', fr: 'fr_ohext', primary: 'Triceps, long head', secondary: 'None. It is an isolation lift', move: 'Arms overhead, elbows straighten upward', best: 'Training the long head on a stretch', short: ['Stretches the long head', 'Arms raised overhead', 'Pairs well with pushdowns'], type: 'Isolation' },
    best: '<b>Pushdown</b> for volume · <b>Overhead</b> to stretch the long head',
  },
  sldl_legcurl: {
    a: { name: 'Stiff-Leg Deadlift', fr: 'fr_sldl', primary: 'Hamstrings, glutes', secondary: 'Lower back, forearms', move: 'Hip hinge: the hips move, knees stay almost straight', best: 'Hamstrings and glutes on a stretch, with heavy loads', short: ['Hip hinge movement', 'Works glutes too', 'Trains the lower back to hold'], type: 'Compound' },
    b: { name: 'Lying Leg Curl', fr: 'fr_legcurl', primary: 'Hamstrings', secondary: 'Calves', move: 'Knee bend: only the knee moves', best: 'Isolating the hamstrings with no back load', short: ['Isolates the hamstrings', 'Only the knee moves', 'No load on your back'], type: 'Isolation' },
    best: '<b>Deadlift</b> trains the hip · <b>Leg curl</b> trains the knee. Do both',
  },
  calf_standing_seated: {
    a: { name: 'Standing Calf Raise', fr: 'fr_stcalf', primary: 'Gastrocnemius', secondary: 'Soleus', move: 'Knees straight, you rise onto your toes', best: 'The upper calf muscle you see from behind', short: ['Straight knees', 'Works both calf muscles', 'Handles heavy loads'], type: 'Isolation' },
    b: { name: 'Seated Calf Raise', fr: 'fr_secalf', primary: 'Soleus', secondary: 'Gastrocnemius (less)', move: 'Knees bent at about 90 degrees', best: 'The deeper soleus under the calf', short: ['Bent knees', 'Shifts work to the soleus', 'Pairs well with standing'], type: 'Isolation' },
    best: '<b>Standing</b> for the upper calf · <b>Seated</b> for the soleus',
  },
  chinup_pullup: {
    hook: { big: ['Chin-up or', 'pull-up?'], sub: 'Your grip changes the muscle' },
    ctaQ: 'Chin-ups or', ctaQ2: 'pull-ups?',
    a: { name: 'Chin-Up', fr: 'fr_chinup', n: 196, primary: 'Lats, biceps', secondary: 'Mid back, rear delts, core', move: 'Palms face you, shoulder-width grip', best: 'More biceps work, and usually more reps', short: ['Palms facing you', 'Biceps work harder', 'Most people get more reps'], type: 'Compound' },
    b: { name: 'Pull-Up', fr: 'fr_pullup', n: 197, primary: 'Lats', secondary: 'Biceps, mid back, rear delts, core', move: 'Palms face away, wider grip', best: 'Back width and upper body strength', short: ['Palms facing away', 'Lats do more of the work', 'Usually the harder of the two'], type: 'Compound' },
    best: '<b>Chin-up</b> for more biceps · <b>Pull-up</b> for the lats',
  },
  front_back_squat: {
    hook: { big: ['Front squat or', 'back squat?'], sub: 'Where the bar sits changes everything' },
    ctaQ: 'Front or', ctaQ2: 'back squat?',
    a: { name: 'Front Squat', fr: 'fr_frontsquat', primary: 'Quadriceps', secondary: 'Glutes, upper back, core', move: 'Bar on the front of the shoulders, torso upright', best: 'Quads, with less load on the lower back', short: ['Bar in front, torso upright', 'More quad focus', 'Usually lighter than back squat'], type: 'Compound' },
    b: { name: 'Back Squat', fr: 'fr_Classic_Barbell_Squat', primary: 'Quadriceps, glutes', secondary: 'Adductors, hamstrings, lower back', move: 'Bar on the upper back, more forward lean', best: 'Lifting the most weight, overall leg strength', short: ['Bar on your upper back', 'Hips and glutes work more', 'You can load it heaviest'], type: 'Compound' },
    best: '<b>Front</b> for the quads · <b>Back</b> for the heaviest loads',
  },
  db_bb_bench: {
    hook: { big: ['Dumbbells or', 'barbell?'], sub: 'Which bench press builds your chest?' },
    ctaQ: 'Dumbbells or', ctaQ2: 'barbell?',
    a: { name: 'Dumbbell Bench', fr: 'fr_dbbench', primary: 'Chest', secondary: 'Front delts, triceps', move: 'Each arm presses its own dumbbell', best: 'Range of motion and evening out each side', short: ['Each side works on its own', 'Deeper stretch at the bottom', 'Hands can find their own path'], type: 'Compound' },
    b: { name: 'Barbell Bench', fr: 'fr_flatbench', primary: 'Chest', secondary: 'Front delts, triceps', move: 'Both arms press one bar', best: 'Lifting the most weight, pressing strength', short: ['Heaviest press you can load', 'Small, exact weight jumps', 'Easy to track progress'], type: 'Compound' },
    best: '<b>Dumbbells</b> for range · <b>Barbell</b> for strength',
  },
  hack_legpress: {
    hook: { big: ['Hack squat or', 'leg press?'], sub: 'Two machines, one big difference' },
    ctaQ: 'Hack squat or', ctaQ2: 'leg press?',
    a: { name: 'Hack Squat', fr: 'fr_hacksquat', primary: 'Quadriceps', secondary: 'Glutes, adductors', move: 'You stand, back on a pad, and squat on rails', best: 'Deep quad work, squat-like but supported', short: ['You squat, standing', 'Back supported on rails', 'Strong quad focus'], type: 'Compound' },
    b: { name: 'Leg Press', fr: 'fr_Sled_45_Degree_Leg_Wide_Press', primary: 'Quadriceps, glutes', secondary: 'Hamstrings, adductors, calves', move: 'You sit and push the sled away', best: 'Heavy leg work with the back fully supported', short: ['You sit and push', 'Fully supported back', 'Handles very heavy loads'], type: 'Compound' },
    best: '<b>Hack squat</b> for the quads · <b>Leg press</b> for heavy volume',
  },
};
