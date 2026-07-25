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

export type FitnessGoal = 'lose-fat' | 'build-muscle' | 'recomposition' | 'strength';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type EquipmentType = 'home' | 'full-gym' | 'minimal';
export type BiologicalSex = 'male' | 'female' | 'prefer-not-to-say';

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
  role: 'user' | 'trainer' | 'admin';
  trainerId?: string;        // uid of the owning trainer / tenant
  createdAt: unknown;
  lastActive: unknown;
  lastLoginAt?: unknown;
  goals?: UserGoals;
  statsCache?: StatsCache;  // derived — computed by events engine
  activeProgram?: ActiveProgram;
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
  xp?: number;
  powerLevel?: number;
  currentWeightKg?: number;
  purchasedProgramIds?: string[];
  banned?: boolean;
  membership?: {
    status: 'active' | 'none';
    expiresAt?: unknown;
    grantedBy?: string;
    planId?: string;    // coaching plan ID if on a specific plan
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
  // Empty by default and hidden until an admin adds real ones — inventing
  // fake customer quotes and presenting them as genuine is deceptive
  // marketing regardless of which app it's on, so this only ever shows
  // whatever a real admin actually typed in.
  testimonials?: { name: string; quote: string }[];
  heroImageUrl?: string; // optional background image behind the hero section
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
  content: string;
  imageURL?: string;
  likes: string[];
  replyCount: number;
  replyTo?: string | null;
  pinned?: boolean;
  createdAt: unknown;
}

export interface ProgramDay {
  label: string;       // e.g. "Push Day", "Pull Day", "Rest"
  isRest: boolean;
  exercises: Exercise[];
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
  schedule?: ProgramDay[]; // 7-element Mon–Sun weekly pattern (index 0 = Monday)
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
  | 'coaching_approved' | 'coaching_rejected' | 'pr_approved' | 'pr_rejected' | 'goal_assigned';

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
  trialDays: 0 | 7 | 14 | 30; // free trial length; grants full access to every feature regardless of plan
  discountPercent?: number;   // 1-100, applied to new checkouts while active
  discountExpiresAt?: string; // ISO datetime; discount inactive after this
}

export interface MembershipPlan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  currency: string; // e.g. 'USD'
  features: string[]; // bullet points shown on the pricing card
  // Which gated tools this plan unlocks — 'barcode' | 'nutrition-ai' |
  // 'meal-planner' | 'premium-programs'. Empty = every feature (the
  // default — a plan only restricts once an admin explicitly picks a
  // subset).
  featureAccess: string[];
  active: boolean;
}

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
