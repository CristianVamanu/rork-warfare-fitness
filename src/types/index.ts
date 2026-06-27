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
  startDate: string;         // ISO 'YYYY-MM-DD'
  completedWorkouts: number;
  totalWorkouts: number;     // weeks × daysPerWeek
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
  trainerId?: string;         // uid of the primary admin / tenant owner
  stripePublishableKey?: string;
  openaiModel?: string;
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
}

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: number | string;
  restSeconds: number;
  notes?: string;
  muscleGroup?: string;
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

export interface NutritionAnalysis {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
}
