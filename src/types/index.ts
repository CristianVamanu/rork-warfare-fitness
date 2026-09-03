export const HABIT_KEYS = [
  'water', 'sleep', 'meditation', 'stretching', 'creatine', 'vitaminD', 'reading',
] as const;
export type HabitKey = typeof HABIT_KEYS[number];

export interface HabitLog {
  id: string;          // `${userId}_${date}`
  userId: string;
  date: string;         // YYYY-MM-DD, local
  habits: Partial<Record<HabitKey, boolean>>;
  updatedAt: unknown;
}

export interface UserGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water: number;
}

export type EventType =
  | 'WORKOUT_COMPLETED'
  | 'MEAL_LOGGED'
  | 'WATER_LOGGED'
  | 'WEIGHT_RECORDED'
  | 'CHECKIN_SUBMITTED';

export interface AppEvent {
  id: string;
  type: EventType;
  userId: string;
  trainerId: string;
  payload: Record<string, unknown>;
  createdAt: unknown;
}

export interface StatsCache {
  totalWorkouts: number;
  caloriesToday: number;
  waterToday: number;   // ml
  streak: number;
  lastUpdated: unknown;
  cacheDate?: string;          // YYYY-MM-DD local date when cache was last written
  lastWorkoutDate?: string;    // YYYY-MM-DD of the most recent completed workout
}

export interface TenantStripe {
  customerId?: string;
  subscriptionId?: string;
  subscriptionStatus: 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive';
  currentPeriodEnd?: unknown;
}

export interface Tenant {
  id: string;
  trainerId: string;
  name: string;
  email: string;
  createdAt: unknown;
  stripe: TenantStripe;
}

export interface ActiveProgram {
  programId: string;
  programName: string;
  enrolledAt: unknown;
  startDate?: string;              // ISO 'YYYY-MM-DD' (legacy)
  programStartDate?: string;       // Full ISO timestamp (new)
  completedWorkouts: number;
  totalWorkouts: number;           // weeks × daysPerWeek
  lastCompletedDayIndex?: number;  // absolute day index (0-based) of the last non-repeated day completed
}

// Saved position for a program the user isn't currently active on — same
// fields as ActiveProgram minus programId (that's the map key) since it's
// otherwise the exact same shape mirrored to/from `activeProgram` on switch.
export interface ProgramProgressSnapshot {
  programName: string;
  enrolledAt: unknown;
  programStartDate?: string;
  completedWorkouts: number;
  totalWorkouts: number;
  lastCompletedDayIndex?: number;
}

export type FitnessGoal = 'lose-fat' | 'build-muscle' | 'recomposition' | 'strength';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type EquipmentType = 'home' | 'full-gym' | 'minimal';
export type BiologicalSex = 'male' | 'female';

export interface OnboardingData {
  fitnessGoal: FitnessGoal;
  experience: ExperienceLevel;
  trainingDays: number;
  equipment: EquipmentType;
  limitations?: string;
  sex?: BiologicalSex;
  age?: number;
  heightCm?: number;
  medicalHistory?: MedicalHistoryAnswers;
  targetFocus?: 'full-body' | 'upper-body' | 'lower-body' | 'core';
  sessionMinutes?: 30 | 45 | 60 | 90;
  trainingStyle?: 'free-weights' | 'machines' | 'bodyweight' | 'mixed';
  targetWeightKg?: number;
}

// Self-serve weight goal, set once at onboarding (mandatory alongside
// current weight) and read by the dashboard/goals page to show ongoing
// progress toward it. Separate from ClientGoal (goals/{goalId} collection)
// deliberately — that collection is coach/admin-authored only per
// firestore.rules (`allow create: if isAdminOrOwnTrainer(...)`), and this
// one needs to be self-serve at signup, before any coach relationship
// necessarily exists.
export interface WeightGoal {
  startWeightKg: number;
  targetWeightKg: number;
  startedAt: string;          // ISO date, set once at onboarding
  estimatedTargetDate: string; // ISO date — startedAt + the timeline estimate shown at onboarding
  direction: 'lose' | 'gain' | 'maintain';
}

// From the trainer's fitness medical questionnaire — collected during
// onboarding, visible to the trainer/admin on the client's profile, never
// shown to other users.
export interface MedicalHistoryAnswers {
  bodyFatPercent?: number;
  bloodPressure?: string;
  restingHeartRate?: number;
  practicesSports?: boolean;
  sportsDetail?: string;
  movementDisorders?: boolean;
  movementDisordersDetail?: string;
  previousSurgeries?: boolean;
  previousSurgeriesDetail?: string;
  sportsInjuries?: boolean;
  sportsInjuriesDetail?: string;
  musculoskeletalProblems?: boolean;
  musculoskeletalProblemsDetail?: string;
  heartDisease?: boolean;
  heartDiseaseDetail?: string;
  otherMedicalConditions?: boolean;
  otherMedicalConditionsDetail?: string;
  smokes?: boolean;
  drinksAlcoholRegularly?: boolean;
  alcoholFrequency?: string;
  suffersFromStress?: boolean;
  takesSleepingPills?: boolean;
  takesPainMedication?: boolean;
  takesBetaBlockers?: boolean;
  eatsFattyOrSweetFoodsOften?: boolean;
  experiencesFoodCravings?: boolean;
  dailyFluidIntake?: string;
}

export type VerificationLevel = 'unverified' | 'verified';

export interface PRPost {
  id: string;
  userId: string;
  displayName: string;
  photoURL: string | null;
  exerciseName: string;
  weightKg: number;
  reps: number;
  note?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  verificationLevel: VerificationLevel;
  // Content moderation gate, separate from the trust badge above: a post
  // stays hidden from the public feed (visible only to its own author)
  // until an admin approves it — so uploaded media can't go straight to
  // the whole community before anyone's looked at it.
  moderationStatus: 'pending' | 'approved' | 'rejected';
  likeCount: number;
  likedBy?: string[];
  createdAt: unknown;
}

// Private body-progress photo — visible only to its owner and staff (admin/trainer),
// enforced by firestore.rules, never surfaced anywhere public.
export interface ProgressPhoto {
  id: string;
  userId: string;
  photoUrl: string;
  note?: string;
  weightKg?: number;
  createdAt: unknown;
}

export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  weightUnit: 'kg' | 'lbs';
  // Merged flat onto this doc by saveOnboardingData(OnboardingData) — real
  // fields on the document, just not previously reflected in this type.
  fitnessGoal?: FitnessGoal;
  experience?: ExperienceLevel;
  limitations?: string;
  // Only present on accounts that answered these during onboarding, back
  // when the health screening lived there — it's collected on the 1:1
  // coaching application form now, and prefilled from here when present.
  medicalHistory?: MedicalHistoryAnswers;
  role: 'user' | 'trainer' | 'admin';
  trainerId?: string;        // uid of the owning trainer / tenant
  createdAt: unknown;
  lastActive: unknown;
  lastLoginAt?: unknown;
  goals?: UserGoals;
  statsCache?: StatsCache;  // derived — computed by events engine
  // One freeze grants automatically every 7 days and absorbs a single missed
  // day without breaking the streak — spent (available -> false) the moment
  // it actually saves a gap, not just for holding one.
  streakFreeze?: { available: boolean; lastGrantedAt: unknown; lastUsedAt?: unknown };
  // Taste-then-paywall: a non-member gets exactly one real, successful use of
  // each locked AI tool before the paywall shows on subsequent visits —
  // people convert far better after they've already seen the tool work for
  // them. Keyed by the same feature id PaywallGate/MembershipConfig use
  // ('barcode' | 'nutrition-ai' | 'meal-planner'). Set true only after an
  // actual successful result, not just for opening the page.
  aiTaste?: Record<string, boolean>;
  activeProgram?: ActiveProgram;
  // Per-program progress snapshots, keyed by programId — every program the
  // user has ever enrolled in keeps its own saved position here, so
  // switching `activeProgram` to a different program never has to destroy
  // progress the way overwriting a single global pointer used to. Whichever
  // program is currently active is mirrored into `activeProgram` above (so
  // every existing screen that reads `profile.activeProgram.*` keeps
  // working unchanged) — this map is the actual source of truth for a
  // program's progress once the user has switched away from it at least
  // once. A program the user has never switched away from yet may not have
  // an entry here at all; its live progress is simply `activeProgram`.
  programProgress?: Record<string, ProgramProgressSnapshot>;
  onboardingComplete?: boolean;
  onboarding?: OnboardingData;
  // One-time flag — the streak flame's "ignition" welcome animation on the
  // dashboard fires once, right after onboarding, then never again. Stored
  // in Firestore (not localStorage) so it's a true once-ever moment across
  // every device, not just the one they onboarded on.
  flameIgnited?: boolean;
  assignedNutritionPlan?: NutritionPlan;
  achievements?: string[];
  questsCompleted?: string[];
  prBan?: { until: unknown /* Timestamp | null; null = indefinite */; bannedAt: unknown };
  // Set once, server-side only (Stripe webhook), the first time this
  // account actually uses a trial (free or paid) via Stripe checkout — see
  // api/stripe/plan-checkout's alreadyUsedTrial check. Never client-writable
  // (see firestore.rules' self-update blocklist).
  trialUsedAt?: unknown;
  xp?: number;
  powerLevel?: number;
  currentWeightKg?: number;
  weightGoal?: WeightGoal;
  purchasedProgramIds?: string[];
  banned?: boolean;
  // Email-code 2FA, opt-in via Settings. twoFactorPendingSince is set the
  // moment a code is issued at login and cleared on successful verification
  // — (app)/layout.tsx redirects to /verify-2fa whenever it's set, so a
  // user can't navigate past the code screen just by hitting back/a
  // bookmark while a login is mid-verification.
  twoFactorEnabled?: boolean;
  twoFactorPendingSince?: unknown;
  // Where codes actually get sent — falls back to the account's login email
  // when unset. Exists because a login email isn't always a real inbox
  // (e.g. a domain configured for the app but never hooked up to receive
  // mail); this lets 2FA codes go somewhere that's actually monitored.
  twoFactorEmail?: string;
  membership?: {
    status: 'active' | 'none';
    expiresAt?: unknown;
    grantedBy?: string;
    planId?: string;
    planName?: string;
    stripeSubscriptionId?: string;
    cancelAtPeriodEnd?: boolean;
  };
  // Separate from `membership` — a user can hold both an active membership
  // plan AND an active 1:1 coaching plan simultaneously (coaching is a paid
  // add-on tier, not a replacement). They're two independent Stripe
  // subscriptions; tracking them in one shared field meant buying the
  // second one silently overwrote the first's subscription ID, making it
  // impossible to cancel through the app and — worse — un-cancelable by
  // account deletion too, leaving an orphaned subscription still billing
  // a deleted account's card indefinitely.
  coaching?: {
    status: 'active' | 'none';
    expiresAt?: unknown;
    planId?: string;
    planName?: string;
    stripeSubscriptionId?: string;
    cancelAtPeriodEnd?: boolean;
  };
  stats: {
    streak: number;
    powerLevel: number;
    totalWorkouts: number;
    totalWeightLifted: number;
    totalMealsLogged?: number;
  };
  fasting?: FastingSession | null;
  daysWithoutGoals?: DaysWithoutGoal[];
}

export interface FastingSession {
  startedAt: unknown;   // Firestore Timestamp
  goalHours: number;
}

export interface DaysWithoutGoal {
  id: string;
  label: string;        // e.g. "Smoking", "Porn", or a custom short goal
  startedAt: unknown;    // Firestore Timestamp — resets on relapse
}

export interface SystemConfig {
  appName: string;
  trainerName: string;
  trainerEmail: string;
  themeColor: string;
  trainerId?: string;
  stripePublishableKey?: string;
  openaiModel?: string;
  videoGreetingUrl?: string;
  logoUrl?: string;
  pwaInstallBannerEnabled?: boolean; // admin can disable the install banner
  vapidPublicKey?: string; // stored in Firestore so client can subscribe
  landingPage?: LandingPageConfig;
  barcodeScanDailyLimit?: number; // default 20 if unset
  foodAnalysisDailyLimit?: number; // default 20 if unset
  mealIdeasDailyLimit?: number; // default 15 if unset
  b2bLandingPage?: B2BLandingConfig;
}

// A separate landing page for the B2B/white-label pitch (trainers, coaches,
// gym owners) — same visual system as the consumer landing page, but its
// own copy/hero/pricing so the two audiences never see the wrong pitch.
export interface B2BLandingConfig {
  badgeText: string;
  headlineLine1: string;
  headlineLine2: string;
  subheadline: string;
  ctaPrimaryLabel: string;
  heroImageUrl?: string;
  heroDemoVideoUrl?: string;
  heroDemoPosterUrl?: string;
  reasons: { title: string; desc: string }[];
  // Explains this is a real installable PWA (home-screen icon, works
  // offline-ish, push notifications) — not "just a website" — and why
  // that beats a native App Store / Play Store app for this use case.
  pwaHeadline: string;
  pwaSubheadline: string;
  pwaPoints: { label: string; native: string; pwa: string }[];
  // "Build it yourself" vs "buy it" comparison strip — the core price
  // justification (a from-scratch build costs vastly more in money/time).
  comparisonHeadline: string;
  comparisonPoints: { label: string; diy: string; us: string }[];
  pricingTiers: {
    name: string;
    price: string;      // e.g. "2,997" — free-text so admin can put "Custom" etc.
    period: string;      // e.g. "one-time"
    description: string;
    features: string[];
    highlighted?: boolean;
  }[];
  guaranteeText?: string;
  faqs: { q: string; a: string }[];
  finalCtaHeadline: string;
  finalCtaSubtext: string;
}

// A lead submitted from the B2B landing page's "Book a Demo" / "Get Started"
// form — reviewed manually in the admin panel (this business is a
// sales-assisted, manually-provisioned white-label service, not instant
// self-serve signup, so there's no Stripe checkout on this page).
export interface TrainerLead {
  id: string;
  name: string;
  email: string;
  businessName?: string;
  phone?: string;
  message?: string;
  clientCount?: string;
  status: 'new' | 'contacted' | 'closed';
  createdAt: unknown;
}

// A visitor's email captured by the exit-intent modal on the consumer
// landing page — before they abandon the quiz/checkout, not a submitted
// application like TrainerLead. Purely for a later "come back and finish"
// nudge email; reviewed manually in the admin panel same as trainerLeads.
export interface LandingLead {
  id: string;
  email: string;
  createdAt: unknown;
}

export interface LandingFeature {
  title: string;
  desc: string;
}

export interface LandingPageConfig {
  badgeText: string;
  headlineLine1: string;
  headlineLine2: string; // shown in the accent color, second line of the hero
  subheadline: string;
  ctaPrimaryLabel: string;
  ctaSecondaryLabel: string;
  features: LandingFeature[];       // title/desc editable; icon/color stay fixed by position
  socialProof: string[];
  quoteText: string;
  quoteAuthor: string;
  finalCtaHeadline: string;
  finalCtaSubtext: string;
  showPublicLeaderboard?: boolean; // opt-in — shows top athletes (name, level, streak only) on the logged-out landing page
  programsToShow?: number; // how many programs to display in the landing page's Programs section — unset/0 means show all
  // Empty by default and hidden until an admin adds real ones — inventing
  // fake customer quotes and presenting them as genuine is deceptive
  // marketing regardless of which app it's on, so this only ever shows
  // whatever a real admin actually typed in.
  testimonials?: { name: string; quote: string }[];
  heroImageUrl?: string; // optional background image behind the hero section
  heroDemoVideoUrl?: string; // optional product-demo video shown in the hero as a "Watch Demo" player
  heroDemoPosterUrl?: string; // poster frame for the demo video, shown before play + while it loads
  screenshotUrls?: string[]; // real in-app screenshots shown in a "See It In Action" gallery on the landing page
  // Empty by default and hidden until an admin adds real ones — same
  // never-fabricate rule as testimonials above, just for member transformation
  // photos instead of quotes.
  transformationPhotos?: { imageUrl: string; caption?: string }[];
}

export interface Channel {
  id: string;
  name: string;
  description?: string;
  emoji?: string;
  createdBy: string;
  pinnedPostId?: string;
  trainerId?: string;
  photoUploadEnabled: boolean;
  slowModeDays: 0 | 7 | 21 | 30;
  allowUserPosts: boolean; // false = announcement-only channel, admin/trainer posts only
  postCount: number;
  createdAt: unknown;
}

export interface ChannelPost {
  id: string;
  channelId: string;
  userId: string;
  userDisplayName: string;
  userPhotoURL?: string;
  // Denormalized at write time (like userDisplayName) rather than looked up
  // per-render — a regular member can't read the admin's users/{uid} doc
  // anyway (see firestore.rules), so this is the only way the badge could
  // render for anyone but the admin's own client.
  userIsAdmin?: boolean;
  content: string;
  imageURL?: string;
  likes: string[];
  replyCount: number;
  replyTo?: string | null;
  // Set when this reply answers ANOTHER reply rather than the post itself.
  // Threads are capped at two visible levels (post -> reply -> reply), the
  // same shape Facebook uses: a reply to a nested reply is stored against
  // the same top-level parent so a thread can never run away sideways on a
  // phone. Absent on top-level replies and on posts.
  parentReplyId?: string | null;
  pinned?: boolean;
  createdAt: unknown;
}

export interface ProgramDay {
  label: string;       // e.g. "Push Day", "Pull Day", "Rest"
  isRest: boolean;
  exercises: Exercise[];
}

/**
 * A week-ranged block within a long program — e.g. "Weeks 1-4: Base
 * Building" — each with its own 7-element weekly pattern. Lets a 90-day
 * program actually vary what it trains over time instead of one 7-day
 * template repeating for the program's entire length. `startWeek`/`endWeek`
 * are 1-indexed and inclusive. Optional: a program with no phases just uses
 * its top-level `schedule` for every week, exactly as before.
 */
export interface ProgramPhase {
  id: string;
  label: string;
  startWeek: number;
  endWeek: number;
  schedule: ProgramDay[];
}

export interface Program {
  id: string;
  name: string;
  description: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  goal: 'strength' | 'hypertrophy' | 'endurance' | 'weight-loss' | 'general';
  weeks: number;
  daysPerWeek: number;
  exercises: Exercise[];  // flat fallback list used by session page
  schedule?: ProgramDay[]; // 7-element Mon–Sun weekly pattern (index 0 = Monday); phases[0]'s schedule when phases are used
  phases?: ProgramPhase[]; // when present, overrides `schedule` per week range — see ProgramPhase
  createdBy: string;
  trainerId?: string;
  isPublic: boolean;
  isPremium?: boolean; // requires active membership to access
  price?: number;      // one-time USD price for individual purchase (alternative to membership gate)
  targetGender?: 'male' | 'female' | 'anyone'; // display label; defaults to 'anyone' if unset
  imageUrl?: string; // cover image shown on the landing page & program lists
}

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: number | string;
  restSeconds: number;
  notes?: string;
  muscleGroup?: string;
  isCardio?: boolean;
  cardioDurationSeconds?: number; // duration per set for cardio exercises
  isHiit?: boolean;               // interval-style cardio — work/rest rounds instead of one flat timer
  hiitWorkSeconds?: number;
  hiitRestSeconds?: number;
  hiitRounds?: number;
  videoUrl?: string;             // Firebase Storage download URL from exercise library
}

export interface ExerciseVideo {
  id: string;
  name: string;                 // canonical name e.g. "Barbell Back Squat"
  aliases: string[];            // alternate names for AI matching
  muscleGroups: string[];
  equipment: string[];
  videoUrl: string;
  thumbnailUrl?: string;
  uploadedAt: unknown;
  uploadedBy: string;
}

export interface WorkoutLog {
  id: string;
  userId: string;
  trainerId?: string;
  programId?: string;
  exercises: Array<{
    name: string;
    sets: Array<{ weight: number; reps: number; completed: boolean }>;
  }>;
  duration: number;
  calories: number;
  completedAt: unknown;
}

export interface Meal {
  id: string;
  userId: string;
  trainerId?: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  loggedAt: unknown;
}

export interface Post {
  id: string;
  userId: string;
  trainerId?: string;
  userDisplayName: string;
  userPhotoURL?: string;
  content: string;
  imageURL?: string;
  likes: string[];
  commentCount: number;
  createdAt: unknown;
}

export type NotificationType =
  | 'manual' | 'auto_missed_workout' | 'auto_streak' | 'auto_milestone' | 'ai_motivation'
  | 'coaching_approved' | 'coaching_rejected' | 'pr_approved' | 'pr_rejected' | 'goal_assigned' | 'message';

export interface AppNotification {
  id: string;
  userId: string;
  trainerId?: string;
  title: string;
  body: string;
  type: NotificationType;
  read: boolean;
  createdAt: unknown;
  actionLabel?: string;  // e.g. "Pay for 1:1 Coaching"
  actionUrl?: string;    // e.g. "/profile?coachingPlanId=xxx"
}

export type GoalCategory = 'strength' | 'weight' | 'workouts' | 'nutrition' | 'custom';
export type GoalStatus = 'active' | 'completed' | 'missed';

// Trainer/admin-assigned goal for a specific client — a target the coach
// sets (e.g. "Bench 100kg", "Lose 5kg", "20 workouts this month"), which
// the client can then check in on themselves. Progress is a plain number
// the client updates manually rather than auto-derived from workoutLogs/
// weightLogs, since a goal can be anything (including non-numeric-feeling
// things like "run a 5k") and forcing every goal through one auto-tracked
// metric would make most goal types impossible to represent.
export interface ClientGoal {
  id: string;
  userId: string;
  trainerId?: string;
  title: string;
  description?: string;
  category: GoalCategory;
  targetValue?: number;
  currentValue?: number;
  unit?: string; // e.g. 'kg', 'workouts', 'reps' — freeform, blank for non-numeric goals
  targetDate?: string; // ISO date
  status: GoalStatus;
  createdBy: string; // trainer/admin uid
  createdAt: unknown;
  completedAt?: unknown;
}

// Simplified PT (physical training) test result — modeled on the classic
// 3-event military fitness test format (max push-ups, max sit-ups, timed
// run), scored on a generic 0-100-per-event benchmark scale. This is
// deliberately NOT presented as an official/classified Army ACFT or Marine
// PFT score (those are age/sex-banded and far more precise) — just a
// reasonable approximation for training purposes, clearly labeled as such.
export interface PtTestResult {
  id: string;
  userId: string;
  pushups: number;
  situps: number;
  runMinutes: number; // total run time in minutes (decimal), e.g. 11.5 = 11:30
  runDistanceMiles: 1.5 | 2;
  pushupsScore: number; // 0-100
  situpsScore: number; // 0-100
  runScore: number; // 0-100
  totalScore: number; // 0-300
  tier: 'needs-work' | 'solid' | 'strong' | 'elite';
  createdAt: unknown;
  // Optional unit-selection-standard mode (e.g. Spetsnaz Selection Prep) —
  // absent/'generic' on every pre-existing result, so old data keeps
  // rendering with the original 0-300 scoring path untouched. Any value
  // other than 'generic' is a unit id matched against UNIT_STANDARDS in
  // the PT Test page (not a fixed union — new units don't need a type change).
  standard?: 'generic' | string;
  pullups?: number;
  standardPassed?: boolean;
}

export type CoachingApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface CoachingApplication {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  planId: string;
  planName: string;
  currentWeight: string;
  goals: string;
  experience: string;
  injuries: string;
  availability: string;
  // Health screening / lifestyle habits answers, collected on the coaching
  // application form (they used to be mandatory onboarding steps).
  medicalHistory?: MedicalHistoryAnswers;
  status: CoachingApplicationStatus;
  createdAt: unknown;
  reviewedAt?: unknown;
  reviewedBy?: string;
  rejectionReason?: string;
}

export interface AutoNotificationRule {
  id: string;
  enabled: boolean;
  label: string;
  description: string;
  schedule: 'daily' | 'weekly'; // cron frequency
}

export interface NotificationConfig {
  rules: Record<string, boolean>; // rule id → enabled
  aiMotivationEnabled: boolean;
  aiMotivationSchedule: 'daily' | 'weekly';
}

export interface CoachingPlan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  currency: string;       // 'USD' | 'EUR' | 'GBP'
  features: string[];     // bullet points shown to users
  active: boolean;
  // Which gated tools this specific plan unlocks — 'barcode' | 'nutrition-ai'
  // | 'meal-planner' | 'premium-programs'. Undefined/empty means "every
  // feature" (matches pre-existing plans, which had no restriction at all).
  featureAccess?: string[];
}

export interface NutritionPlanMeal {
  name: string;         // e.g. "Breakfast", "Lunch", "Post-Workout Snack"
  items: string[];      // e.g. "3 whole eggs + 2 egg whites", "1 cup oats with berries"
  calories?: number;
}

export interface NutritionPlan {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  meals: NutritionPlanMeal[];
  coachNotes?: string;
  assignedAt: unknown;
  assignedBy: string;   // trainer/admin uid
}

export interface MembershipConfig {
  enabled: boolean;
  // Deprecated single-tier fields — kept optional so old installs that
  // still have this data don't error, but the admin UI no longer edits
  // these. Replaced by MembershipPlan[] (multiple, fully admin-editable
  // tiers, each with its own price and feature access).
  planName?: string;
  description?: string;
  features?: string[];
  fee?: number;
  currency?: string;
  lockedFeatures?: string[];
  lockedProgramIds?: string[];
  fullLock: boolean; // lock entire app for non-members/non-trial users
  trialDays: 0 | 7 | 14 | 30; // trial length; grants full access to every feature regardless of plan
  discountPercent?: number;   // 1-100, applied to new checkouts while active
  discountExpiresAt?: string; // ISO datetime; discount inactive after this
  // MadMuscles-style paid trial: charge trialPriceCents immediately at
  // checkout instead of granting `trialDays` of free no-card access. When
  // this is on, the createdAt-based free-trial bypass (inTrial in
  // useFeatureAccess.ts/MembershipGuard.tsx, trialActive() in
  // firestore.rules) is disabled entirely — access is only ever granted
  // via an actual Stripe subscription (which itself starts in Stripe's
  // own 'trialing' status for `trialDays`, already treated as active
  // access by the webhook). Requires fullLock so the paywall/checkout
  // actually gets shown to someone with no subscription yet — enforced by
  // the admin UI, not just documented here.
  paidTrialEnabled?: boolean;
  trialPriceCents?: number; // e.g. 100 = $1.00, charged once at checkout
}

export interface MembershipPlan {
  id: string;
  name: string;
  description: string;
  // Every term below is independently optional — an admin offering only a
  // yearly plan sets ONLY price12mo and leaves the rest unset; nothing
  // requires a monthly price to exist just because a longer term does. At
  // least one of the four must be set for the plan to be purchasable (each
  // is the TOTAL price for that whole term, not per-month — price6mo is
  // what's charged once for 6 months, billed on that cadence).
  priceMonthly?: number;
  price3mo?: number;
  price6mo?: number;
  price12mo?: number;
  currency: string; // e.g. 'USD'
  features: string[]; // bullet points shown on the pricing card
  // Which plan gets the "Most Popular" badge on the landing page and the
  // in-app paywalls. Previously not a real field at all — every pricing
  // card just badged whichever plan happened to be array index 0, with no
  // way for an admin to actually choose which one that was short of
  // deleting and recreating plans in a different order. At most one plan
  // should have this true at a time (enforced by the admin toggle, not by
  // this type) — if none do, callers fall back to index 0 so existing
  // installs keep behaving exactly as before.
  mostPopular?: boolean;
  // Which gated tools this plan unlocks — 'barcode' | 'nutrition-ai' |
  // 'meal-planner' | 'premium-programs'. Empty = every feature (the
  // default — a plan only restricts once an admin explicitly picks a
  // subset).
  featureAccess: string[];
  active: boolean;
}

export type PlanBillingPeriodMonths = 1 | 3 | 6 | 12;

export interface Conversation {
  id: string;
  adminId: string;
  userId: string;
  userDisplayName: string;
  userEmail: string;
  lastMessage: string;
  lastMessageAt: unknown;
  createdAt: unknown;
  unreadByUser: boolean;
  unreadByAdmin: boolean;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  isFromAdmin: boolean;
  createdAt: unknown;
}

export interface NutritionAnalysis {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  salt?: number;
}
