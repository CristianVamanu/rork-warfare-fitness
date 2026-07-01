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

export interface OnboardingData {
  fitnessGoal: FitnessGoal;
  experience: ExperienceLevel;
  trainingDays: number;
  equipment: EquipmentType;
  limitations?: string;
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
  goals?: UserGoals;
  statsCache?: StatsCache;  // derived — computed by events engine
  activeProgram?: ActiveProgram;
  onboardingComplete?: boolean;
  onboarding?: OnboardingData;
  achievements?: string[];
  xp?: number;
  powerLevel?: number;
  currentWeightKg?: number;
  banned?: boolean;
  membership?: {
    status: 'active' | 'none';
    expiresAt?: unknown;
    grantedBy?: string;
    planId?: string;    // coaching plan ID if on a specific plan
    planName?: string;
  };
  stats: {
    streak: number;
    powerLevel: number;
    totalWorkouts: number;
    totalWeightLifted: number;
  };
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

export type NotificationType = 'manual' | 'auto_missed_workout' | 'auto_streak' | 'auto_milestone' | 'ai_motivation';

export interface AppNotification {
  id: string;
  userId: string;
  trainerId?: string;
  title: string;
  body: string;
  type: NotificationType;
  read: boolean;
  createdAt: unknown;
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
}

export interface MembershipConfig {
  enabled: boolean;
  fee: number; // monthly in USD (e.g. 29.99)
  currency: string; // e.g. 'USD'
  fullLock: boolean; // lock entire app for non-members
  lockedFeatures: string[]; // 'barcode' | 'nutrition-ai' | 'premium-programs'
  lockedProgramIds: string[]; // specific program IDs that require membership
  trialDays: 0 | 7 | 14 | 30; // free trial length; 0 = no trial
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
}
