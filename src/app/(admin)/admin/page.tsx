'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Users, Dumbbell, Activity, Settings, Shield, CreditCard, CheckCircle, AlertTriangle,
  MessageSquare, Send, ChevronLeft, Ban, UserCheck,
  Key, ExternalLink, Sparkles, Bell, Zap, Flame, Trophy, RefreshCw, Plus, Edit2, Trash2, TrendingUp,
  Video, Upload, X as XIcon, Play, Apple, Wand2, Rocket, User, Download, Target, Search, Mail,
} from 'lucide-react';
import { collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getIdToken } from 'firebase/auth';
import { uploadVideo, deleteVideo, type StorageProvider } from '@/lib/uploadVideo';
import { extractVideoThumbnail, extractVideoThumbnailFromUrl } from '@/lib/videoThumbnail';
import { DEFAULT_PRIVACY_POLICY, DEFAULT_TERMS, DEFAULT_B2B_TERMS } from '@/lib/legalDefaults';
import {
  getSystemConfig, setSystemConfig,
  getAllUsers, setUserRole, setUserTrainer,
  subscribeAdminConversations, getOrCreateConversation, subscribeMessages, sendMessage, markConversationRead, deleteConversation,
  getMembershipConfig, saveMembershipConfig,
  sendNotification, sendNotificationToAll, getNotificationConfig, saveNotificationConfig,
  getChannels, createChannel, updateChannel, deleteChannel,
  getCoachingPlans, saveCoachingPlans, assignCoachingPlan, revokeCoachingPlan,
  getMembershipPlans, saveMembershipPlans,
  getExerciseVideos, saveExerciseVideo, deleteExerciseVideo, updateExerciseVideoThumbnail,
  getExerciseTaxonomy, saveExerciseTaxonomy,
  assignNutritionPlan,
  getCoachingApplications, approveCoachingApplication, rejectCoachingApplication,
  getProgressPhotos, getUserWorkouts,
  createGoal, getClientGoals, setGoalStatus, deleteGoal,
  getTrainerLeads, updateTrainerLeadStatus,
  getLandingLeads,
  getAllPrograms, getHiddenMockIds, getDeletedMockIds,
} from '@/lib/firestore';
import { MOCK_PROGRAMS } from '@/lib/programs';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import type { Conversation, Message, MembershipConfig, MembershipPlan, NotificationConfig, Channel, CoachingPlan, ExerciseVideo, NutritionPlan, CoachingApplication, LandingPageConfig, MedicalHistoryAnswers, ProgressPhoto, ClientGoal, GoalCategory, B2BLandingConfig, TrainerLead, LandingLead } from '@/types';
import { DEFAULT_LANDING_CONFIG, DEFAULT_B2B_LANDING_CONFIG } from '@/lib/landingDefaults';
import { getPlanBillingPeriods } from '@/lib/utils';

type Tab = 'overview' | 'programs' | 'clients' | 'messages' | 'community' | 'notifications' | 'membership' | 'coaching' | 'library' | 'analytics' | 'integrations' | 'leads' | 'settings';

// Shared by both plan editors (CoachingPlan's Tool Access and
// MembershipPlan's Tool Access) — feature ids here must match what
// PaywallGate/useFeatureAccess check against on the gated pages
// themselves (community, quests, breathing pages; the leaderboard tab
// within community; FastingWidget on the dashboard).
const TOOL_ACCESS_OPTIONS = [
  { id: 'barcode', label: 'Barcode Scanner' },
  { id: 'nutrition-ai', label: 'AI Food Analyzer' },
  { id: 'meal-planner', label: 'AI Meal Planner' },
  { id: 'premium-programs', label: 'Premium Training Plans' },
  { id: 'community', label: 'Community' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'pr-wall', label: 'PR Wall' },
  { id: 'quests', label: 'Quests & Achievements' },
  { id: 'fasting', label: 'Fasting Timer' },
  { id: 'breathing', label: 'Breathing Exercises' },
] as const;

const LOCKABLE_FEATURE_OPTIONS = [
  { id: 'barcode', label: 'Barcode Scanner', desc: 'Nutrition lookup via product barcode' },
  { id: 'nutrition-ai', label: 'AI Food Analyzer', desc: 'Photo-based nutrition analysis' },
  { id: 'meal-planner', label: 'AI Meal Planner', desc: 'Generates a full daily meal plan' },
  { id: 'scan-and-go', label: 'Scan & Go', desc: 'Photo-based workout builder from gym equipment' },
  { id: 'premium-programs', label: 'Premium Training Plans', desc: 'Programs marked as Premium require membership' },
  { id: 'community', label: 'Community', desc: 'Channels — browsing and posting' },
  { id: 'leaderboard', label: 'Leaderboard', desc: 'Power-level rankings' },
  { id: 'pr-wall', label: 'PR Wall', desc: 'Personal-record posts feed' },
  { id: 'quests', label: 'Quests & Achievements', desc: 'Quest tracking and achievement badges' },
  { id: 'fasting', label: 'Fasting Timer', desc: 'Intermittent fasting tracker on the dashboard' },
  { id: 'breathing', label: 'Breathing Exercises', desc: 'Guided breathing sessions' },
] as const;

interface SecretStatusUI {
  key: string;
  configured: boolean;
  source: 'firestore' | 'env' | 'none';
  masked: string;
}

const SECRET_GROUPS: { title: string; service: string; keys: { key: string; label: string; placeholder: string }[] }[] = [
  {
    title: 'OpenAI', service: 'openai', keys: [
      { key: 'OPENAI_API_KEY', label: 'API Key', placeholder: 'sk-...' },
    ],
  },
  {
    title: 'Stripe', service: 'stripe', keys: [
      { key: 'STRIPE_SECRET_KEY', label: 'Secret Key', placeholder: 'sk_live_...' },
      { key: 'STRIPE_WEBHOOK_SECRET', label: 'Webhook Signing Secret', placeholder: 'whsec_...' },
      { key: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', label: 'Publishable Key', placeholder: 'pk_live_...' },
    ],
  },
  {
    title: 'Cloudflare R2', service: 'r2', keys: [
      { key: 'R2_ACCOUNT_ID', label: 'Account ID', placeholder: 'a589823...' },
      { key: 'R2_ACCESS_KEY_ID', label: 'Access Key ID', placeholder: '' },
      { key: 'R2_SECRET_ACCESS_KEY', label: 'Secret Access Key', placeholder: '' },
      { key: 'R2_BUCKET_NAME', label: 'Bucket Name (public content)', placeholder: 'warfare-fitness-storage' },
      { key: 'R2_PUBLIC_URL', label: 'Public URL', placeholder: 'https://pub-xxxx.r2.dev' },
      { key: 'R2_BACKUP_BUCKET_NAME', label: 'Backup Bucket Name (must be PRIVATE, no public access)', placeholder: 'warfare-fitness-backups' },
    ],
  },
  {
    title: 'Push Notifications (VAPID)', service: 'vapid', keys: [
      { key: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', label: 'Public Key', placeholder: '' },
      { key: 'VAPID_PRIVATE_KEY', label: 'Private Key', placeholder: '' },
    ],
  },
  {
    title: 'Firebase Storage', service: 'firebase-storage', keys: [],
  },
  {
    title: 'Cloudflare Analytics', service: 'cloudflare-analytics', keys: [
      { key: 'CLOUDFLARE_API_TOKEN', label: 'API Token', placeholder: 'Create at dash.cloudflare.com/profile/api-tokens with "Zone Analytics: Read" permission' },
      { key: 'CLOUDFLARE_ZONE_ID', label: 'Zone ID', placeholder: 'Found on your domain\'s Overview page in Cloudflare, right sidebar' },
    ],
  },
  {
    title: 'Resend (Transactional Email)', service: 'resend', keys: [
      { key: 'RESEND_API_KEY', label: 'API Key', placeholder: 're_...' },
      { key: 'RESEND_FROM_EMAIL', label: 'From Address', placeholder: 'Warfare Fitness <noreply@yourdomain.com>' },
    ],
  },
];

interface BulkFile {
  id: string;
  file: File;
  name: string;       // parsed and editable
  aliases: string;    // comma-separated, editable
  status: 'pending' | 'uploading' | 'done' | 'error';
  errorMsg?: string;
}

/** Parse an exercise name from a video filename.
 *  Handles patterns like: "050c7a09-45_degree_side_bend.mp4"
 *  and "d66c0b3d-45_Degree_Side_Bend_..._552_F.mp4"
 */
function parseExerciseName(filename: string): string {
  let name = filename;
  // Strip extension
  name = name.replace(/\.[^.]+$/, '');
  // Strip leading UUID prefix (8 hex chars + dash)
  name = name.replace(/^[0-9a-f]{8}-/i, '');
  // Replace underscores and hyphens with spaces
  name = name.replace(/[_-]+/g, ' ');
  // Remove trailing codes like "552 F", "552", standalone letters at end
  name = name.replace(/\s+\d+\s+[A-Z]\s*$/, '');
  name = name.replace(/\s+\d+\s*$/, '');
  // Remove ellipsis artifacts
  name = name.replace(/\.\.\./g, '').replace(/\s{2,}/g, ' ');
  // Title case
  name = name.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  return name;
}

const MUSCLE_CATEGORIES = [
  'Abs', 'Arms', 'Back', 'Biceps', 'Calves', 'Cardio', 'Chest',
  'Core', 'Full Body', 'Glutes', 'Hamstrings', 'Legs', 'Obliques',
  'Quadriceps', 'Shoulders', 'Triceps',
];

const EQUIPMENT_OPTIONS = [
  'Bodyweight', 'Barbell', 'Dumbbell', 'Cable', 'Machine',
  'Kettlebell', 'Resistance Band', 'Pull-up Bar', 'Bench', 'Mixed',
];

interface UserData {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
  trainerId?: string | null;
  banned?: boolean;
  statsCache?: { totalWorkouts?: number; streak?: number };
  stats?: { totalWorkouts?: number };
  xp?: number;
  powerLevel?: number;
  activeProgram?: { programName?: string; completedWorkouts?: number; totalWorkouts?: number };
  createdAt?: unknown;
  lastLoginAt?: unknown;
  fitnessGoal?: string;
  experience?: string;
  trainingDays?: number;
  equipment?: string;
  limitations?: string;
  sex?: string;
  age?: number;
  heightCm?: number;
  currentWeightKg?: number;
  medicalHistory?: MedicalHistoryAnswers;
}

interface AdminClientWorkout {
  id: string;
  duration?: number;
  totalWeightLifted?: number;
  exercises?: unknown[];
  completedAt: unknown;
}

function formatLastLogin(ts: unknown): string {
  const t = ts as { toDate?: () => Date } | undefined;
  const date = t?.toDate?.();
  if (!date) return 'Never';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminPageInner />
    </Suspense>
  );
}

function AdminPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, tenant } = useAuth();
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab');
    const valid: Tab[] = ['overview', 'programs', 'clients', 'messages', 'community', 'notifications', 'membership', 'coaching', 'library', 'analytics', 'integrations', 'leads', 'settings'];
    return (valid as string[]).includes(t ?? '') ? (t as Tab) : 'overview';
  });

  // ── Overview state ──────────────────────────────────────────────────────────
  const [users, setUsers] = useState<UserData[]>([]);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [programCount, setProgramCount] = useState(0);
  const [workoutsToday, setWorkoutsToday] = useState(0);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // ── Clients state ──────────────────────────────────────────────────────────
  const [clientsLoading, setClientsLoading] = useState(false);
  const [banningUser, setBanningUser] = useState<string | null>(null);

  // ── Messages state ─────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convsLoading, setConvsLoading] = useState(false);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Live messages for whichever conversation the admin has open — a
  // client's incoming message now appears immediately instead of only on
  // the next manual reopen of the thread.
  useEffect(() => {
    if (!activeConv) { setMessages([]); return; }
    setMsgLoading(true);
    const unsub = subscribeMessages(activeConv.id, (msgs) => {
      setMessages(msgs);
      setMsgLoading(false);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
    return unsub;
  }, [activeConv?.id]);

  // ── Settings state ─────────────────────────────────────────────────────────
  const [settingsForm, setSettingsForm] = useState({ appName: '', trainerName: '', trainerEmail: '', openaiModel: 'gpt-4o-mini', videoGreetingUrl: '', stripePublishableKey: '', logoUrl: '', pwaInstallBannerEnabled: true, vapidPublicKey: '', barcodeScanDailyLimit: 20, foodAnalysisDailyLimit: 20, mealIdeasDailyLimit: 15 });
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingHeroImage, setUploadingHeroImage] = useState(false);
  const [uploadingDemoVideo, setUploadingDemoVideo] = useState(false);
  const [uploadingScreenshots, setUploadingScreenshots] = useState(false);
  const [uploadingTransformationPhotos, setUploadingTransformationPhotos] = useState(false);
  const [legalForm, setLegalForm] = useState({ privacyPolicyText: '', termsText: '', b2bTermsText: '' });
  const [savingLegal, setSavingLegal] = useState(false);
  const [runningBackup, setRunningBackup] = useState(false);
  const [lastBackupResult, setLastBackupResult] = useState<{ collections: number; sizeBytes: number; location: string } | null>(null);

  // ── Membership state ───────────────────────────────────────────────────────
  const [membership, setMembership] = useState<MembershipConfig>({
    enabled: false, fullLock: false, lockedFeatures: [], lockedProgramIds: [], trialDays: 0,
  });
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [savingMembership, setSavingMembership] = useState(false);
  const [togglingMember, setTogglingMember] = useState<string | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [assigningTrainer, setAssigningTrainer] = useState<string | null>(null);

  // ── Membership plans state (multiple, fully admin-editable pricing tiers) ──
  const [membershipPlans, setMembershipPlans] = useState<MembershipPlan[]>([]);
  const [savingMembershipPlans, setSavingMembershipPlans] = useState(false);
  const [showMembershipPlanForm, setShowMembershipPlanForm] = useState(false);
  const [editingMembershipPlan, setEditingMembershipPlan] = useState<MembershipPlan | null>(null);
  const [membershipPlanForm, setMembershipPlanForm] = useState<{ name: string; description: string; priceMonthly: string; price3mo: string; price6mo: string; price12mo: string; currency: string; features: string; active: boolean; featureAccess: string[] }>({ name: '', description: '', priceMonthly: '', price3mo: '', price6mo: '', price12mo: '', currency: 'USD', features: '', active: true, featureAccess: [] });

  // ── Analytics state (real visitor data pulled from Cloudflare's edge) ──────
  const [analytics, setAnalytics] = useState<{
    rangeDays: number;
    totals: { requests: number; pageViews: number; uniques: number; threats: number };
    daily: { date: string; requests: number; pageViews: number; uniques: number }[];
  } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  // No "all time" option: Cloudflare's analytics retention doesn't reach
  // that far back (plan-dependent), and the year-wide query it required
  // timed out at the proxy and surfaced as an HTML error page to the admin.
  const [analyticsRange, setAnalyticsRange] = useState<'today' | 'yesterday' | '7d' | '14d' | '30d'>('30d');

  // ── Notifications state ────────────────────────────────────────────────────
  const DEFAULT_NOTIF_CONFIG: NotificationConfig = {
    rules: { missed_workout: false, streak_reminder: false, weekly_recap: false },
    aiMotivationEnabled: false,
    aiMotivationSchedule: 'daily',
  };
  const [notifConfig, setNotifConfig] = useState<NotificationConfig>(DEFAULT_NOTIF_CONFIG);
  const [notifLoading, setNotifLoading] = useState(false);
  const [savingNotifConfig, setSavingNotifConfig] = useState(false);
  const [manualNotif, setManualNotif] = useState({ title: '', body: '', target: 'all' as 'all' | string });
  const [sendingNotif, setSendingNotif] = useState(false);
  const [processingCron, setProcessingCron] = useState(false);

  // ── Coaching plans state ───────────────────────────────────────────────────
  const [coachingPlans, setCoachingPlans] = useState<CoachingPlan[]>([]);
  const [savingPlans, setSavingPlans] = useState(false);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<CoachingPlan | null>(null);
  const [planForm, setPlanForm] = useState<{ name: string; description: string; priceMonthly: string; currency: string; features: string; active: boolean; featureAccess: string[] }>({ name: '', description: '', priceMonthly: '', currency: 'USD', features: '', active: true, featureAccess: [] });
  const [assigningPlan, setAssigningPlan] = useState<string | null>(null);

  // ── Coaching applications state ────────────────────────────────────────────
  const [coachingApplications, setCoachingApplications] = useState<CoachingApplication[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [reviewingApp, setReviewingApp] = useState<string | null>(null);
  const [rejectingApp, setRejectingApp] = useState<CoachingApplication | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // ── Exercise library state ────────────────────────────────────────────────
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseVideo[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [exSearchQuery, setExSearchQuery] = useState('');
  const [exCategoryFilter, setExCategoryFilter] = useState<string | null>(null);
  // Admin-manageable on top of the built-in defaults below — starts as the
  // defaults, then getExerciseTaxonomy() overwrites with the saved lists
  // once an admin has actually added/removed anything.
  const [muscleCategories, setMuscleCategories] = useState<string[]>(MUSCLE_CATEGORIES);
  const [equipmentOptions, setEquipmentOptions] = useState<string[]>(EQUIPMENT_OPTIONS);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [newEquipmentInput, setNewEquipmentInput] = useState('');
  const [savingTaxonomy, setSavingTaxonomy] = useState(false);
  const [showExForm, setShowExForm] = useState(false);
  const [editingEx, setEditingEx] = useState<ExerciseVideo | null>(null);
  const [exForm, setExForm] = useState({ name: '', aliases: '', muscleGroups: '', equipment: '' });
  const [exFile, setExFile] = useState<File | null>(null);
  const [exUploadProgress, setExUploadProgress] = useState(0);
  const [savingEx, setSavingEx] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState({ done: 0, total: 0, failed: 0 });
  // Bulk upload
  const [bulkCategory, setBulkCategory] = useState('Abs');
  const [bulkEquipment, setBulkEquipment] = useState('Bodyweight');
  const [bulkFiles, setBulkFiles] = useState<BulkFile[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<Record<string, number>>({});
  const bulkDropRef = useRef<HTMLDivElement>(null);

  // ── Integrations / API keys state ─────────────────────────────────────────
  const [storageProvider, setStorageProvider] = useState<StorageProvider>('firebase');
  const [savingProvider, setSavingProvider] = useState(false);
  const [secretStatuses, setSecretStatuses] = useState<SecretStatusUI[]>([]);
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [secretInputs, setSecretInputs] = useState<Record<string, string>>({});
  const [savingSecret, setSavingSecret] = useState<string | null>(null);
  const [testingService, setTestingService] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});

  // ── Nutrition plan (AI) state ─────────────────────────────────────────────
  const [nutritionModalUser, setNutritionModalUser] = useState<UserData | null>(null);
  const [profileDetailUser, setProfileDetailUser] = useState<UserData | null>(null);
  const [profileDetailPhotos, setProfileDetailPhotos] = useState<ProgressPhoto[]>([]);
  const [profileDetailWorkouts, setProfileDetailWorkouts] = useState<AdminClientWorkout[]>([]);
  const [nutritionTrainerNotes, setNutritionTrainerNotes] = useState('');
  const [nutritionDraft, setNutritionDraft] = useState<Omit<NutritionPlan, 'assignedAt' | 'assignedBy'> | null>(null);
  const [generatingNutrition, setGeneratingNutrition] = useState(false);
  const [assigningNutrition, setAssigningNutrition] = useState(false);

  // ── Client goals state ──────────────────────────────────────────────────────
  const [goalModalUser, setGoalModalUser] = useState<UserData | null>(null);
  const [clientGoals, setClientGoals] = useState<ClientGoal[]>([]);
  const [loadingGoals, setLoadingGoals] = useState(false);
  const [goalForm, setGoalForm] = useState<{ title: string; description: string; category: GoalCategory; targetValue: string; currentValue: string; unit: string; targetDate: string; alsoMessage: boolean }>({
    title: '', description: '', category: 'strength', targetValue: '', currentValue: '', unit: '', targetDate: '', alsoMessage: true,
  });
  const [savingGoal, setSavingGoal] = useState(false);

  // ── Community channels state ───────────────────────────────────────────────
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelForm, setChannelForm] = useState({ name: '', description: '', emoji: '', photoUploadEnabled: true, slowModeDays: 0 as 0|7|21|30, allowUserPosts: true });
  const [savingChannel, setSavingChannel] = useState(false);
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);

  // ── Landing page state ─────────────────────────────────────────────────────
  const [landingForm, setLandingForm] = useState<LandingPageConfig>(DEFAULT_LANDING_CONFIG);
  const [savingLanding, setSavingLanding] = useState(false);

  // ── B2B (/trainers) landing page state ─────────────────────────────────────
  const [b2bForm, setB2bForm] = useState<B2BLandingConfig>(DEFAULT_B2B_LANDING_CONFIG);
  const [savingB2b, setSavingB2b] = useState(false);
  const [uploadingB2bHero, setUploadingB2bHero] = useState(false);
  const [uploadingB2bVideo, setUploadingB2bVideo] = useState(false);
  const [trainerLeads, setTrainerLeads] = useState<TrainerLead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [landingLeads, setLandingLeads] = useState<LandingLead[]>([]);
  const [loadingLandingLeads, setLoadingLandingLeads] = useState(false);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    const trainerId = profile?.trainerId;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    Promise.all([
      getAllUsers().catch(() => [] as UserData[]),
      getSystemConfig(),
      // Mirrors /admin/programs' own counting logic: published Firestore
      // programs plus whichever built-in seed programs haven't been
      // hidden/deleted/promoted into a Firestore doc already (promoted ones
      // would otherwise be double-counted, once as a mock and once as its
      // own program doc). This card was previously hardcoded to always
      // read 0 via a stray `Promise.resolve([])` placeholder that was never
      // replaced with a real fetch.
      Promise.all([getAllPrograms().catch(() => []), getHiddenMockIds().catch(() => []), getDeletedMockIds().catch(() => [])])
        .then(([published, hiddenIds, deletedIds]) => {
          const publishedIds = new Set((published as { id: string }[]).map((p) => p.id));
          const hidden = new Set(hiddenIds);
          const deleted = new Set(deletedIds);
          const visibleMocks = MOCK_PROGRAMS.filter((p) => !publishedIds.has(p.id) && !hidden.has(p.id) && !deleted.has(p.id));
          return [...(published as unknown[]), ...visibleMocks];
        }),
      trainerId
        ? getDocs(query(collection(db, 'events'),
            where('trainerId', '==', trainerId),
            where('type', '==', 'WORKOUT_COMPLETED'),
            where('createdAt', '>=', Timestamp.fromDate(todayStart)),
            orderBy('createdAt', 'desc')
          )).then(s => s.size).catch(() => 0)
        : Promise.resolve(0),
    ]).then(([u, c, progs, wToday]) => {
      setUsers(u as UserData[]);
      setConfig(c);
      setProgramCount((progs as unknown[]).length);
      setWorkoutsToday(wToday as number);
      if (c) {
        const cfg = c as Record<string, string>;
        setSettingsForm({
          appName: cfg.appName || '',
          trainerName: cfg.trainerName || '',
          trainerEmail: cfg.trainerEmail || '',
          openaiModel: cfg.openaiModel || 'gpt-4o-mini',
          videoGreetingUrl: cfg.videoGreetingUrl || '',
          stripePublishableKey: cfg.stripePublishableKey || '',
          logoUrl: cfg.logoUrl || '',
          pwaInstallBannerEnabled: cfg.pwaInstallBannerEnabled !== false as unknown,
          vapidPublicKey: cfg.vapidPublicKey || '',
          barcodeScanDailyLimit: Number(cfg.barcodeScanDailyLimit) || 20,
          foodAnalysisDailyLimit: Number(cfg.foodAnalysisDailyLimit) || 20,
          mealIdeasDailyLimit: Number(cfg.mealIdeasDailyLimit) || 15,
        });
        setStorageProvider((cfg.storageProvider as StorageProvider) || 'firebase');
        setLegalForm({
          privacyPolicyText: cfg.privacyPolicyText || DEFAULT_PRIVACY_POLICY,
          termsText: cfg.termsText || DEFAULT_TERMS,
          b2bTermsText: cfg.b2bTermsText || DEFAULT_B2B_TERMS,
        });
        const savedLanding = (c as { landingPage?: Partial<LandingPageConfig> }).landingPage;
        if (savedLanding) {
          setLandingForm({ ...DEFAULT_LANDING_CONFIG, ...savedLanding });
        }
        const savedB2b = (c as { b2bLandingPage?: Partial<B2BLandingConfig> }).b2bLandingPage;
        if (savedB2b) {
          setB2bForm({ ...DEFAULT_B2B_LANDING_CONFIG, ...savedB2b });
        }
      }
    }).catch(console.error).finally(() => setOverviewLoading(false));
  }, [profile?.trainerId]);

  useEffect(() => {
    setLoadingLeads(true);
    getTrainerLeads().then(setTrainerLeads).catch(() => {}).finally(() => setLoadingLeads(false));
    setLoadingLandingLeads(true);
    getLandingLeads().then(setLandingLeads).catch(() => {}).finally(() => setLoadingLandingLeads(false));
  }, []);

  // Load real Stripe/OpenAI/etc config status once on mount for the Overview card
  useEffect(() => {
    if (user) loadSecretStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Load this client's private progress photos + recent workout history
  // whenever the profile modal opens — previously this modal only showed
  // onboarding answers and the health screening, nothing about what the
  // client has actually been doing in training.
  useEffect(() => {
    if (!profileDetailUser) { setProfileDetailPhotos([]); setProfileDetailWorkouts([]); return; }
    getProgressPhotos(profileDetailUser.id).then(setProfileDetailPhotos).catch(() => setProfileDetailPhotos([]));
    getUserWorkouts(profileDetailUser.id, 10).then((w) => setProfileDetailWorkouts(w as AdminClientWorkout[])).catch(() => setProfileDetailWorkouts([]));
  }, [profileDetailUser]);

  // ── Tab loaders ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'clients' && users.length === 0) loadUsers();
    if (tab === 'membership') { loadMembership(); loadCoachingPlans(); loadMembershipPlans(); }
    if (tab === 'coaching') loadCoachingApplications();
    if (tab === 'notifications') loadNotifConfig();
    if (tab === 'community') loadChannels();
    if (tab === 'library' && exerciseLibrary.length === 0) loadExerciseLibrary();
    if (tab === 'integrations') loadSecretStatuses();
    if (tab === 'analytics') loadAnalytics(analyticsRange);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAnalytics(range: typeof analyticsRange = analyticsRange) {
    if (!user) return;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const token = await getIdToken(user);
      const res = await fetch(`/api/admin/analytics?range=${range}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (status ${res.status})`);
      setAnalytics(data);
    } catch (err) {
      setAnalyticsError(err instanceof Error ? err.message : String(err));
    } finally { setAnalyticsLoading(false); }
  }

  async function loadSecretStatuses() {
    if (!user) return;
    setSecretsLoading(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/admin/secrets', { headers: { Authorization: `Bearer ${token}` } });
      const text = await res.text();
      let data: { secrets?: SecretStatusUI[]; error?: string };
      try { data = JSON.parse(text); }
      catch { throw new Error(`Server returned a non-JSON response (status ${res.status}). Check Vercel function logs.`); }
      if (res.ok) setSecretStatuses(data.secrets ?? []);
      else throw new Error(data.error || `Request failed (status ${res.status})`);
    } catch (err) {
      toast.error(`Failed to load integration status: ${err instanceof Error ? err.message : String(err)}`, { duration: 8000 });
    } finally { setSecretsLoading(false); }
  }

  async function handleSaveSecret(key: string) {
    if (!user) return;
    const value = secretInputs[key] ?? '';
    setSavingSecret(key);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/admin/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      toast.success(`${key} saved`);
      setSecretInputs(prev => ({ ...prev, [key]: '' }));
      await loadSecretStatuses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save key');
    } finally {
      setSavingSecret(null);
    }
  }

  async function handleTestService(service: string) {
    if (!user) return;
    setTestingService(service);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/admin/secrets/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ service }),
      });
      const data = await res.json();
      setTestResults(prev => ({ ...prev, [service]: { ok: !!data.ok, message: data.message || data.error || 'Unknown error' } }));
    } catch {
      setTestResults(prev => ({ ...prev, [service]: { ok: false, message: 'Request failed' } }));
    } finally {
      setTestingService(null);
    }
  }

  async function handleSaveStorageProvider(provider: StorageProvider) {
    setSavingProvider(true);
    try {
      await setSystemConfig({ storageProvider: provider });
      setStorageProvider(provider);
      toast.success(`Storage provider set to ${provider === 'r2' ? 'Cloudflare R2' : 'Firebase Storage'}`);
    } catch { toast.error('Failed to save storage provider'); }
    finally { setSavingProvider(false); }
  }

  async function loadUsers() {
    setClientsLoading(true);
    try { setUsers(await getAllUsers() as UserData[]); }
    catch { toast.error('Failed to load users'); }
    finally { setClientsLoading(false); }
  }

  // Live — a client starting or replying to a "Message Support" thread now
  // shows up here immediately. This used to be a one-time fetch gated on
  // "tab === messages && conversations.length === 0", so a new conversation
  // created after the admin had already visited the tab once (leaving
  // conversations at []) never appeared until the tab was left and reopened.
  useEffect(() => {
    if (!user) return;
    setConvsLoading(true);
    const unsub = subscribeAdminConversations(user.uid, (convs) => {
      setConversations(convs);
      setConvsLoading(false);
    });
    return unsub;
  }, [user]);

  // The header's Messages icon links straight to /admin?tab=messages, which
  // previously always landed on the conversation LIST, not the actual
  // thread — the admin had to click again to see the message that made the
  // icon appear in the first place, which read as "this just took me to
  // the dashboard" instead of into messages. Auto-opens the most recently
  // active unread conversation the first time this tab loads with unread
  // messages waiting, same as tapping it manually would. Guarded by a ref
  // (not state) so it fires at most once per mount — an admin deliberately
  // going Back to the list (setActiveConv(null)) must stay on the list even
  // if `conversations` hasn't changed since, not get bounced straight back
  // into the thread.
  const autoOpenedUnreadRef = useRef(false);
  useEffect(() => {
    if (autoOpenedUnreadRef.current || tab !== 'messages' || activeConv || conversations.length === 0) return;
    const firstUnread = conversations.find((c) => c.unreadByAdmin);
    if (firstUnread) {
      autoOpenedUnreadRef.current = true;
      openConversation(firstUnread);
    }
  }, [tab, activeConv, conversations]);

  async function openConversation(conv: Conversation) {
    setActiveConv(conv);
    if (conv.unreadByAdmin) markConversationRead(conv.id, true).catch(() => {});
  }

  async function startConversation(u: UserData) {
    if (!user || !profile) return;
    try {
      const convId = await getOrCreateConversation(user.uid, u.id, u.displayName || 'User', u.email || '');
      const conv: Conversation = {
        id: convId, adminId: user.uid, userId: u.id,
        userDisplayName: u.displayName || 'User', userEmail: u.email || '',
        lastMessage: '', lastMessageAt: null, createdAt: null,
        unreadByUser: false, unreadByAdmin: false,
      };
      setTab('messages');
      setConversations(prev => prev.find(c => c.id === convId) ? prev : [conv, ...prev]);
      await openConversation(conv);
    } catch { toast.error('Failed to open conversation'); }
  }

  async function handleSendMessage() {
    if (!activeConv || !msgText.trim() || !user || !profile) return;
    setSendingMsg(true);
    const text = msgText.trim();
    setMsgText('');
    try {
      await sendMessage(activeConv.id, user.uid, profile.displayName, text, true);
      setConversations(prev => prev.map(c => c.id === activeConv.id ? { ...c, lastMessage: text, unreadByUser: true } : c));
    } catch { toast.error('Failed to send message'); setMsgText(text); }
    finally { setSendingMsg(false); }
  }

  async function handleBanToggle(u: UserData) {
    if (!u.banned && !confirm(`Ban ${u.displayName}? Their account will be disabled — they won't be able to sign in at all.`)) return;
    setBanningUser(u.id);
    try {
      if (!user) throw new Error('Not signed in');
      const token = await getIdToken(user);
      const res = await fetch('/api/admin/ban-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: u.id, action: u.banned ? 'unban' : 'ban' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user');
      toast.success(u.banned ? `${u.displayName} unbanned` : `${u.displayName} banned — account disabled`);
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update user');
    } finally { setBanningUser(null); }
  }

  async function handleDeleteUser(u: UserData) {
    if (!confirm(`Permanently delete ${u.displayName || u.email}? This removes their account and every workout, meal, message, and photo they've logged. This cannot be undone.`)) return;
    if (!user) return;
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: u.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user');
      toast.success(`${u.displayName || 'User'} and all their data deleted`);
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete user');
    }
  }

  function openNutritionModal(u: UserData) {
    setNutritionModalUser(u);
    setNutritionDraft(null);
    setNutritionTrainerNotes('');
  }

  async function openGoalModal(u: UserData) {
    setGoalModalUser(u);
    setGoalForm({ title: '', description: '', category: 'strength', targetValue: '', currentValue: '', unit: '', targetDate: '', alsoMessage: true });
    setLoadingGoals(true);
    try { setClientGoals(await getClientGoals(u.id)); } catch { /* noop */ }
    finally { setLoadingGoals(false); }
  }

  async function handleCreateGoal() {
    if (!user || !profile || !goalModalUser || !goalForm.title.trim()) return;
    setSavingGoal(true);
    try {
      await createGoal({
        userId: goalModalUser.id,
        title: goalForm.title.trim(),
        ...(goalForm.description.trim() ? { description: goalForm.description.trim() } : {}),
        category: goalForm.category,
        ...(goalForm.targetValue ? { targetValue: parseFloat(goalForm.targetValue) } : {}),
        ...(goalForm.currentValue ? { currentValue: parseFloat(goalForm.currentValue) } : {}),
        ...(goalForm.unit.trim() ? { unit: goalForm.unit.trim() } : {}),
        ...(goalForm.targetDate ? { targetDate: goalForm.targetDate } : {}),
        createdBy: user.uid,
      });

      // Notification always fires — it's the primary, low-friction way a
      // client finds out a goal was set. The coach message is optional
      // (checked by default) since it also opens a real conversation
      // thread they can reply in, not just a one-way alert.
      await sendNotification({
        userId: goalModalUser.id,
        title: 'New goal set for you',
        body: goalForm.targetValue
          ? `${goalForm.title} — target: ${goalForm.targetValue}${goalForm.unit ? ` ${goalForm.unit}` : ''}`
          : goalForm.title,
        type: 'goal_assigned',
        actionUrl: '/goals',
        actionLabel: 'View Goal',
      });

      if (goalForm.alsoMessage) {
        const convId = await getOrCreateConversation(user.uid, goalModalUser.id, goalModalUser.displayName || 'User', goalModalUser.email || '');
        const messageBody = `🎯 New goal: ${goalForm.title}${goalForm.targetValue ? ` — target ${goalForm.targetValue}${goalForm.unit ? ` ${goalForm.unit}` : ''}` : ''}${goalForm.targetDate ? ` by ${new Date(goalForm.targetDate).toLocaleDateString()}` : ''}${goalForm.description.trim() ? `\n\n${goalForm.description.trim()}` : ''}`;
        await sendMessage(convId, user.uid, profile.displayName, messageBody, true);
      }

      toast.success(`Goal set for ${goalModalUser.displayName || 'client'}`);
      setGoalForm({ title: '', description: '', category: 'strength', targetValue: '', currentValue: '', unit: '', targetDate: '', alsoMessage: true });
      setClientGoals(await getClientGoals(goalModalUser.id));
    } catch {
      toast.error('Failed to set goal');
    } finally {
      setSavingGoal(false);
    }
  }

  async function handleGoalStatusChange(goal: ClientGoal, status: ClientGoal['status']) {
    try {
      await setGoalStatus(goal.id, status);
      setClientGoals(prev => prev.map(g => g.id === goal.id ? { ...g, status } : g));
    } catch { toast.error('Failed to update goal'); }
  }

  async function handleDeleteGoal(goal: ClientGoal) {
    if (!confirm(`Delete the goal "${goal.title}"?`)) return;
    try {
      await deleteGoal(goal.id);
      setClientGoals(prev => prev.filter(g => g.id !== goal.id));
      toast.success('Goal deleted');
    } catch { toast.error('Failed to delete goal'); }
  }

  async function handleGenerateNutrition() {
    if (!user || !nutritionModalUser) return;
    setGeneratingNutrition(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/admin/nutrition-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: nutritionModalUser.id, trainerNotes: nutritionTrainerNotes.trim() }),
      });
      const text = await res.text();
      let data: { plan?: typeof nutritionDraft; error?: string };
      try { data = JSON.parse(text); }
      catch { throw new Error(`Server returned a non-JSON response (status ${res.status}). Check Vercel function logs.`); }
      if (!res.ok) throw new Error(data.error || `Generation failed (status ${res.status})`);
      setNutritionDraft(data.plan ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate plan', { duration: 8000 });
    } finally {
      setGeneratingNutrition(false);
    }
  }

  async function handleAssignNutrition() {
    if (!user || !nutritionModalUser || !nutritionDraft) return;
    setAssigningNutrition(true);
    try {
      await assignNutritionPlan(nutritionModalUser.id, { ...nutritionDraft, assignedBy: user.uid });
      toast.success(`Nutrition plan assigned to ${nutritionModalUser.displayName || 'client'}`);
      setNutritionModalUser(null);
      setNutritionDraft(null);
    } catch {
      toast.error('Failed to assign plan');
    } finally {
      setAssigningNutrition(false);
    }
  }

  async function loadMembership() {
    setMembershipLoading(true);
    try {
      const cfg = await getMembershipConfig();
      if (cfg) setMembership(cfg);
    } catch { /* use defaults */ }
    finally { setMembershipLoading(false); }
  }

  async function handleSaveMembership() {
    setSavingMembership(true);
    try {
      await saveMembershipConfig(membership);
      toast.success('Membership settings saved');
    } catch { toast.error('Failed to save membership settings'); }
    finally { setSavingMembership(false); }
  }

  async function loadCoachingPlans() {
    try { setCoachingPlans(await getCoachingPlans()); } catch { /* noop */ }
  }

  async function handleSavePlan() {
    const price = parseFloat(planForm.priceMonthly);
    if (!planForm.name.trim() || isNaN(price) || price <= 0) {
      toast.error('Name and a valid price are required'); return;
    }
    setSavingPlans(true);
    try {
      const plan: CoachingPlan = {
        id: editingPlan?.id ?? `plan_${Date.now()}`,
        name: planForm.name.trim(),
        description: planForm.description.trim(),
        priceMonthly: price,
        currency: planForm.currency,
        features: planForm.features.split('\n').map(f => f.trim()).filter(Boolean),
        active: planForm.active,
        featureAccess: planForm.featureAccess,
      };
      const updated = editingPlan
        ? coachingPlans.map(p => p.id === plan.id ? plan : p)
        : [...coachingPlans, plan];
      await saveCoachingPlans(updated);
      setCoachingPlans(updated);
      setShowPlanForm(false);
      setEditingPlan(null);
      setPlanForm({ name: '', description: '', priceMonthly: '', currency: 'USD', features: '', active: true, featureAccess: [] });
      toast.success(editingPlan ? 'Plan updated' : 'Plan created');
    } catch { toast.error('Failed to save plan'); }
    finally { setSavingPlans(false); }
  }

  async function handleDeletePlan(plan: CoachingPlan) {
    if (!confirm(`Delete the "${plan.name}" plan? This cannot be undone.`)) return;
    try {
      const updated = coachingPlans.filter(p => p.id !== plan.id);
      await saveCoachingPlans(updated);
      setCoachingPlans(updated);
      toast.success('Plan deleted');
    } catch { toast.error('Failed to delete plan'); }
  }

  function startEditPlan(plan: CoachingPlan) {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      description: plan.description,
      priceMonthly: String(plan.priceMonthly),
      currency: plan.currency,
      features: plan.features.join('\n'),
      active: plan.active,
      featureAccess: plan.featureAccess ?? [],
    });
    setShowPlanForm(true);
  }

  function renderCoachingPlanForm() {
    return (
      <>
                  <p className="text-sm font-bold text-white">{editingPlan ? 'Edit Plan' : 'New Coaching Plan'}</p>
                  <div>
                    <label className="text-xs text-text-secondary mb-1 block">Plan Name</label>
                    <input
                      value={planForm.name}
                      onChange={e => setPlanForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. 1:1 Personal Coaching"
                      className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary mb-1 block">Description</label>
                    <textarea
                      value={planForm.description}
                      onChange={e => setPlanForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="What clients get with this plan…"
                      rows={2}
                      className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-text-secondary mb-1 block">Price / Month</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">$</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={planForm.priceMonthly}
                          onChange={e => setPlanForm(f => ({ ...f, priceMonthly: e.target.value }))}
                          placeholder="99.00"
                          className="w-full bg-surface border border-white/10 rounded-xl pl-7 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary mb-1 block">Currency</label>
                      <select
                        value={planForm.currency}
                        onChange={e => setPlanForm(f => ({ ...f, currency: e.target.value }))}
                        className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
                      >
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary mb-1 block">Features (one per line)</label>
                    <textarea
                      value={planForm.features}
                      onChange={e => setPlanForm(f => ({ ...f, features: e.target.value }))}
                      placeholder={"Weekly check-in calls\nPersonalised training plan\nDirect messaging with coach"}
                      rows={4}
                      className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary mb-1 block">Tool Access</label>
                    <p className="text-xs text-text-tertiary mb-2">
                      Leave all unchecked to grant every feature (default). Check specific ones to restrict this plan to only those.
                    </p>
                    <div className="space-y-1.5">
                      {TOOL_ACCESS_OPTIONS.map(({ id, label }) => (
                        <label key={id} className="flex items-center gap-2.5 py-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={planForm.featureAccess.includes(id)}
                            onChange={() => togglePlanFeatureAccess(id)}
                            className="w-4 h-4 accent-accent"
                          />
                          <span className="text-sm text-white">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">Active</p>
                      <p className="text-xs text-text-secondary">Visible to clients for purchase</p>
                    </div>
                    <button
                      onClick={() => setPlanForm(f => ({ ...f, active: !f.active }))}
                      className={`w-11 h-6 rounded-full transition-colors relative ${planForm.active ? 'bg-accent' : 'bg-surface-elevated'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${planForm.active ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" fullWidth onClick={() => { setShowPlanForm(false); setEditingPlan(null); }}>Cancel</Button>
                    <Button fullWidth loading={savingPlans} disabled={!planForm.name.trim() || !planForm.priceMonthly} onClick={handleSavePlan}>
                      {editingPlan ? 'Save' : 'Create'}
                    </Button>
                  </div>
      </>
    );
  }


  function togglePlanFeatureAccess(id: string) {
    setPlanForm(f => ({
      ...f,
      featureAccess: f.featureAccess.includes(id) ? f.featureAccess.filter(x => x !== id) : [...f.featureAccess, id],
    }));
  }

  async function loadMembershipPlans() {
    try { setMembershipPlans(await getMembershipPlans()); } catch { /* noop */ }
  }

  async function handleSaveMembershipPlan() {
    const priceMonthly = parseFloat(membershipPlanForm.priceMonthly);
    const price3mo = parseFloat(membershipPlanForm.price3mo);
    const price6mo = parseFloat(membershipPlanForm.price6mo);
    const price12mo = parseFloat(membershipPlanForm.price12mo);
    const hasAnyPrice = [priceMonthly, price3mo, price6mo, price12mo].some(p => !isNaN(p) && p > 0);
    if (!membershipPlanForm.name.trim() || !hasAnyPrice) {
      toast.error('Name and at least one billing-term price are required'); return;
    }
    setSavingMembershipPlans(true);
    try {
      const plan: MembershipPlan = {
        id: editingMembershipPlan?.id ?? `mplan_${Date.now()}`,
        name: membershipPlanForm.name.trim(),
        description: membershipPlanForm.description.trim(),
        ...(!isNaN(priceMonthly) && priceMonthly > 0 ? { priceMonthly } : {}),
        ...(!isNaN(price3mo) && price3mo > 0 ? { price3mo } : {}),
        ...(!isNaN(price6mo) && price6mo > 0 ? { price6mo } : {}),
        ...(!isNaN(price12mo) && price12mo > 0 ? { price12mo } : {}),
        currency: membershipPlanForm.currency,
        features: membershipPlanForm.features.split('\n').map(f => f.trim()).filter(Boolean),
        active: membershipPlanForm.active,
        featureAccess: membershipPlanForm.featureAccess,
      };
      const updated = editingMembershipPlan
        ? membershipPlans.map(p => p.id === plan.id ? plan : p)
        : [...membershipPlans, plan];
      await saveMembershipPlans(updated);
      setMembershipPlans(updated);
      setShowMembershipPlanForm(false);
      setEditingMembershipPlan(null);
      setMembershipPlanForm({ name: '', description: '', priceMonthly: '', price3mo: '', price6mo: '', price12mo: '', currency: 'USD', features: '', active: true, featureAccess: [] });
      toast.success(editingMembershipPlan ? 'Plan updated' : 'Plan created');
    } catch { toast.error('Failed to save plan'); }
    finally { setSavingMembershipPlans(false); }
  }

  async function handleDeleteMembershipPlan(plan: MembershipPlan) {
    if (!confirm(`Delete the "${plan.name}" plan? This cannot be undone.`)) return;
    try {
      const updated = membershipPlans.filter(p => p.id !== plan.id);
      await saveMembershipPlans(updated);
      setMembershipPlans(updated);
      toast.success('Plan deleted');
    } catch { toast.error('Failed to delete plan'); }
  }

  function startEditMembershipPlan(plan: MembershipPlan) {
    setEditingMembershipPlan(plan);
    setMembershipPlanForm({
      name: plan.name,
      description: plan.description,
      priceMonthly: plan.priceMonthly ? String(plan.priceMonthly) : '',
      price3mo: plan.price3mo ? String(plan.price3mo) : '',
      price6mo: plan.price6mo ? String(plan.price6mo) : '',
      price12mo: plan.price12mo ? String(plan.price12mo) : '',
      currency: plan.currency,
      features: plan.features.join('\n'),
      active: plan.active,
      featureAccess: plan.featureAccess ?? [],
    });
    setShowMembershipPlanForm(true);
  }

  function renderMembershipPlanForm() {
    return (
      <>
                  <p className="text-sm font-bold text-white">{editingMembershipPlan ? 'Edit Plan' : 'New Membership Plan'}</p>
                  <div>
                    <label className="text-xs text-text-secondary mb-1 block">Plan Name</label>
                    <input
                      value={membershipPlanForm.name}
                      onChange={e => setMembershipPlanForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Conquer"
                      className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary mb-1 block">Description</label>
                    <textarea
                      value={membershipPlanForm.description}
                      onChange={e => setMembershipPlanForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="What members get with this plan…"
                      rows={2}
                      className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-text-secondary mb-1 block">Price / Month (optional)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">$</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={membershipPlanForm.priceMonthly}
                          onChange={e => setMembershipPlanForm(f => ({ ...f, priceMonthly: e.target.value }))}
                          placeholder="49.00"
                          className="w-full bg-surface border border-white/10 rounded-xl pl-7 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary mb-1 block">Currency</label>
                      <select
                        value={membershipPlanForm.currency}
                        onChange={e => setMembershipPlanForm(f => ({ ...f, currency: e.target.value }))}
                        className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
                      >
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary mb-1 block">Longer Terms (optional — leave blank to not offer that term)</label>
                    <p className="text-[11px] text-text-tertiary mb-2">Total price for the whole term, not per month — e.g. $250 for 6 months billed once every 6 months.</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">$</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={membershipPlanForm.price3mo}
                          onChange={e => setMembershipPlanForm(f => ({ ...f, price3mo: e.target.value }))}
                          placeholder="3 months"
                          className="w-full bg-surface border border-white/10 rounded-xl pl-7 pr-2 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
                        />
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">$</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={membershipPlanForm.price6mo}
                          onChange={e => setMembershipPlanForm(f => ({ ...f, price6mo: e.target.value }))}
                          placeholder="6 months"
                          className="w-full bg-surface border border-white/10 rounded-xl pl-7 pr-2 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
                        />
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">$</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={membershipPlanForm.price12mo}
                          onChange={e => setMembershipPlanForm(f => ({ ...f, price12mo: e.target.value }))}
                          placeholder="12 months"
                          className="w-full bg-surface border border-white/10 rounded-xl pl-7 pr-2 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary mb-1 block">Features (one per line, shown on the pricing card)</label>
                    <textarea
                      value={membershipPlanForm.features}
                      onChange={e => setMembershipPlanForm(f => ({ ...f, features: e.target.value }))}
                      placeholder={"Full access to all training programs\nAI food analyzer\nCommunity & leaderboard access"}
                      rows={4}
                      className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary mb-1 block">Tool Access</label>
                    <p className="text-xs text-text-tertiary mb-2">
                      Leave all unchecked to grant every feature (default). Check specific ones to restrict this plan to only those.
                    </p>
                    <div className="space-y-1.5">
                      {TOOL_ACCESS_OPTIONS.map(({ id, label }) => (
                        <label key={id} className="flex items-center gap-2.5 py-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={membershipPlanForm.featureAccess.includes(id)}
                            onChange={() => toggleMembershipPlanFeatureAccess(id)}
                            className="w-4 h-4 accent-accent"
                          />
                          <span className="text-sm text-white">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">Active</p>
                      <p className="text-xs text-text-secondary">Visible to non-members for purchase</p>
                    </div>
                    <button
                      onClick={() => setMembershipPlanForm(f => ({ ...f, active: !f.active }))}
                      className={`w-11 h-6 rounded-full transition-colors relative ${membershipPlanForm.active ? 'bg-accent' : 'bg-surface-elevated'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${membershipPlanForm.active ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" fullWidth onClick={() => { setShowMembershipPlanForm(false); setEditingMembershipPlan(null); }}>Cancel</Button>
                    <Button
                      fullWidth
                      loading={savingMembershipPlans}
                      disabled={!membershipPlanForm.name.trim() || ![membershipPlanForm.priceMonthly, membershipPlanForm.price3mo, membershipPlanForm.price6mo, membershipPlanForm.price12mo].some(v => parseFloat(v) > 0)}
                      onClick={handleSaveMembershipPlan}
                    >
                      {editingMembershipPlan ? 'Save' : 'Create'}
                    </Button>
                  </div>
      </>
    );
  }


  function toggleMembershipPlanFeatureAccess(id: string) {
    setMembershipPlanForm(f => ({
      ...f,
      featureAccess: f.featureAccess.includes(id) ? f.featureAccess.filter(x => x !== id) : [...f.featureAccess, id],
    }));
  }

  async function handleAssignPlan(u: UserData, planId: string, planName: string) {
    setAssigningPlan(u.id);
    try {
      await assignCoachingPlan(u.id, planId, planName);
      toast.success(`${u.displayName} assigned to ${planName}`);
      await loadUsers();
    } catch { toast.error('Failed to assign plan'); }
    finally { setAssigningPlan(null); }
  }

  async function handleRevokePlan(u: UserData) {
    setAssigningPlan(u.id);
    try {
      await revokeCoachingPlan(u.id);
      toast.success(`Coaching plan revoked from ${u.displayName}`);
      await loadUsers();
    } catch { toast.error('Failed to revoke plan'); }
    finally { setAssigningPlan(null); }
  }

  async function loadCoachingApplications() {
    setLoadingApplications(true);
    try {
      setCoachingApplications(await getCoachingApplications());
    } catch { toast.error('Failed to load coaching applications'); }
    finally { setLoadingApplications(false); }
  }

  async function handleApproveApplication(app: CoachingApplication) {
    if (!user) return;
    setReviewingApp(app.id);
    try {
      await approveCoachingApplication(app, user.uid);
      toast.success(`${app.userName} approved — they've been notified to pay`);
      setCoachingApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'approved' } : a));
      notifyCoachingStatusEmail(app.id);
    } catch { toast.error('Failed to approve application'); }
    finally { setReviewingApp(null); }
  }

  async function handleRejectApplication() {
    if (!user || !rejectingApp) return;
    setReviewingApp(rejectingApp.id);
    try {
      await rejectCoachingApplication(rejectingApp, user.uid, rejectReason.trim() || undefined);
      toast.success(`${rejectingApp.userName}'s application rejected`);
      setCoachingApplications(prev => prev.map(a => a.id === rejectingApp.id ? { ...a, status: 'rejected' } : a));
      notifyCoachingStatusEmail(rejectingApp.id);
      setRejectingApp(null);
      setRejectReason('');
    } catch { toast.error('Failed to reject application'); }
    finally { setReviewingApp(null); }
  }

  async function notifyCoachingStatusEmail(applicationId: string) {
    if (!user) return;
    try {
      const token = await getIdToken(user);
      await fetch('/api/email/coaching-status', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      });
    } catch {
      // Non-fatal — coaching status email is best-effort
    }
  }

  async function handleToggleMember(u: UserData) {
    if (!user) return;
    setTogglingMember(u.id);
    const currentStatus = (u as UserData & { membership?: { status?: string } }).membership?.status ?? 'none';
    const newStatus = currentStatus === 'active' ? 'none' : 'active';
    try {
      // Goes through the server (not the client-side setUserMembership
      // write) so revoking a user with a real Stripe subscription actually
      // cancels it — otherwise Stripe keeps billing them every cycle while
      // the app shows them as not a member, and the next subscription
      // webhook silently flips membership.status back to 'active' anyway.
      const token = await getIdToken(user);
      const res = await fetch('/api/admin/set-membership', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id, status: newStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update membership');
      toast.success(newStatus === 'active' ? `${u.displayName} is now a member` : `${u.displayName}'s membership revoked`);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, membership: { status: newStatus } } : x));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update membership');
    } finally { setTogglingMember(null); }
  }

  async function handleSetRole(u: UserData, role: 'user' | 'trainer') {
    if (!user || u.id === user.uid) return; // can't change your own role — avoids locking yourself out of /admin
    setChangingRole(u.id);
    try {
      await setUserRole(u.id, role);
      toast.success(`${u.displayName || 'User'} is now ${role === 'trainer' ? 'a trainer' : 'a regular user'}`);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role, ...(role === 'trainer' ? { trainerId: null } : {}) } : x));
    } catch { toast.error('Failed to update role'); }
    finally { setChangingRole(null); }
  }

  async function handleAssignTrainer(u: UserData, trainerId: string) {
    setAssigningTrainer(u.id);
    try {
      await setUserTrainer(u.id, trainerId || null);
      toast.success(trainerId ? `Assigned to trainer` : 'Unassigned from trainer');
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, trainerId: trainerId || null } : x));
    } catch { toast.error('Failed to assign trainer'); }
    finally { setAssigningTrainer(null); }
  }

  function toggleLockedFeature(f: string) {
    setMembership(m => ({
      ...m,
      lockedFeatures: (m.lockedFeatures ?? []).includes(f) ? (m.lockedFeatures ?? []).filter(x => x !== f) : [...(m.lockedFeatures ?? []), f],
    }));
  }

  async function loadChannels() {
    setChannelsLoading(true);
    try { setChannels(await getChannels(profile?.trainerId)); }
    catch { toast.error('Failed to load channels'); }
    finally { setChannelsLoading(false); }
  }

  async function handleSaveChannel() {
    if (!user || !channelForm.name.trim()) return;
    setSavingChannel(true);
    try {
      const data = {
        name: channelForm.name.trim(),
        description: channelForm.description.trim() || undefined,
        emoji: channelForm.emoji.trim() || undefined,
        photoUploadEnabled: channelForm.photoUploadEnabled,
        slowModeDays: channelForm.slowModeDays,
        allowUserPosts: channelForm.allowUserPosts,
        createdBy: user.uid,
        trainerId: profile?.trainerId ?? user.uid,
      };
      if (editingChannel) {
        await updateChannel(editingChannel.id, data);
        toast.success('Channel updated');
      } else {
        await createChannel(data as Parameters<typeof createChannel>[0]);
        toast.success('Channel created');
      }
      setShowChannelForm(false);
      setEditingChannel(null);
      setChannelForm({ name: '', description: '', emoji: '', photoUploadEnabled: true, slowModeDays: 0, allowUserPosts: true });
      await loadChannels();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save channel';
      toast.error(msg, { duration: 6000 });
      console.error('[Admin] channel save error:', msg);
    } finally {
      setSavingChannel(false);
    }
  }

  async function handleDeleteChannel(ch: Channel) {
    if (!confirm(`Delete #${ch.name}? All posts will be lost.`)) return;
    try {
      await deleteChannel(ch.id);
      setChannels(prev => prev.filter(c => c.id !== ch.id));
      toast.success('Channel deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete channel', { duration: 6000 });
    }
  }

  function startEditChannel(ch: Channel) {
    setEditingChannel(ch);
    setChannelForm({
      name: ch.name,
      description: ch.description ?? '',
      emoji: ch.emoji ?? '',
      photoUploadEnabled: ch.photoUploadEnabled,
      slowModeDays: ch.slowModeDays,
      allowUserPosts: ch.allowUserPosts ?? true,
    });
    setShowChannelForm(true);
  }

  function renderChannelForm() {
    return (
      <>
        <h3 className="text-sm font-bold text-white">{editingChannel ? 'Edit Channel' : 'Create Channel'}</h3>
        <div className="flex gap-2">
          <input
            value={channelForm.emoji}
            onChange={e => setChannelForm(f => ({ ...f, emoji: e.target.value }))}
            placeholder="📢"
            maxLength={2}
            className="w-14 text-center bg-surface border border-white/10 rounded-xl px-2 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
          />
          <input
            value={channelForm.name}
            onChange={e => setChannelForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Channel name"
            className="flex-1 bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
          />
        </div>
        <input
          value={channelForm.description}
          onChange={e => setChannelForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Description (optional)"
          className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
        />
        <div>
          <label className="text-xs text-text-secondary mb-1.5 block">Slow Mode</label>
          <div className="flex gap-2">
            {([0, 7, 21, 30] as const).map(d => (
              <button
                key={d}
                onClick={() => setChannelForm(f => ({ ...f, slowModeDays: d }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${channelForm.slowModeDays === d ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'}`}
              >
                {d === 0 ? 'Off' : `${d}d`}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Photo Upload</p>
            <p className="text-xs text-text-secondary">Allow users to attach images</p>
          </div>
          <button
            onClick={() => setChannelForm(f => ({ ...f, photoUploadEnabled: !f.photoUploadEnabled }))}
            className={`w-11 h-6 rounded-full transition-colors relative ${channelForm.photoUploadEnabled ? 'bg-accent' : 'bg-surface-elevated'}`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${channelForm.photoUploadEnabled ? 'left-6' : 'left-1'}`} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Allow User Posts</p>
            <p className="text-xs text-text-secondary">Off = announcement-only, only admin/trainer can post</p>
          </div>
          <button
            onClick={() => setChannelForm(f => ({ ...f, allowUserPosts: !f.allowUserPosts }))}
            className={`w-11 h-6 rounded-full transition-colors relative ${channelForm.allowUserPosts ? 'bg-accent' : 'bg-surface-elevated'}`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${channelForm.allowUserPosts ? 'left-6' : 'left-1'}`} />
          </button>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" fullWidth onClick={() => { setShowChannelForm(false); setEditingChannel(null); }}>Cancel</Button>
          <Button fullWidth loading={savingChannel} disabled={!channelForm.name.trim()} onClick={handleSaveChannel}>
            {editingChannel ? 'Save' : 'Create'}
          </Button>
        </div>
      </>
    );
  }

  async function loadNotifConfig() {
    setNotifLoading(true);
    try {
      const cfg = await getNotificationConfig();
      if (cfg) setNotifConfig(cfg);
    } catch { /* use defaults */ }
    finally { setNotifLoading(false); }
  }

  async function handleSaveNotifConfig() {
    setSavingNotifConfig(true);
    try {
      await saveNotificationConfig(notifConfig);
      toast.success('Auto-notification rules saved');
    } catch { toast.error('Failed to save'); }
    finally { setSavingNotifConfig(false); }
  }

  async function handleSendManualNotif() {
    if (!manualNotif.title.trim() || !manualNotif.body.trim() || !user) return;
    setSendingNotif(true);
    try {
      if (manualNotif.target === 'all') {
        const userIds = clients.map(c => c.id);
        await sendNotificationToAll(userIds, {
          trainerId: user.uid,
          title: manualNotif.title.trim(),
          body: manualNotif.body.trim(),
          type: 'manual',
        });
        toast.success(`Sent to ${userIds.length} clients`);
      } else {
        await sendNotification({
          userId: manualNotif.target,
          trainerId: user.uid,
          title: manualNotif.title.trim(),
          body: manualNotif.body.trim(),
          type: 'manual',
        });
        const name = clients.find(c => c.id === manualNotif.target)?.displayName || 'client';
        toast.success(`Sent to ${name}`);
      }
      setManualNotif(m => ({ ...m, title: '', body: '' }));
    } catch { toast.error('Failed to send notification'); }
    finally { setSendingNotif(false); }
  }

  async function handleRunCronNow() {
    if (!user) return;
    setProcessingCron(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/admin/run-notifications', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      let data: { sent?: unknown[]; error?: string; debug?: { rulesEnabled?: Record<string, boolean>; aiEnabled?: boolean; usersConsidered?: number; usersWithActiveProgram?: number } };
      try { data = JSON.parse(text); }
      catch { throw new Error(`Server returned a non-JSON response (status ${res.status}). Check Vercel function logs.`); }
      if (res.ok) {
        const sentCount = data.sent?.length ?? 0;
        if (sentCount === 0 && data.debug) {
          const { rulesEnabled, aiEnabled, usersConsidered, usersWithActiveProgram } = data.debug;
          const noRulesOn = !rulesEnabled?.missed_workout && !rulesEnabled?.streak_reminder && !rulesEnabled?.weekly_recap && !aiEnabled;
          toast(
            noRulesOn
              ? `0 sent — no rules are enabled. Toggle a rule and click "Save Rules" first, then Run Now.`
              : `0 sent — ${usersConsidered ?? 0} users checked (${usersWithActiveProgram ?? 0} with an active program), but none matched any enabled rule right now.`,
            { icon: 'ℹ️', duration: 8000 }
          );
        } else {
          toast.success(`Auto-notifications processed — ${sentCount} sent`);
        }
      } else {
        throw new Error(data.error || `Request failed (status ${res.status})`);
      }
    } catch (err) {
      toast.error(`Failed to run: ${err instanceof Error ? err.message : String(err)}`, { duration: 8000 });
    }
    finally { setProcessingCron(false); }
  }

  // ── Exercise Library ────────────────────────────────────────────────────────
  async function loadExerciseLibrary() {
    setLibraryLoading(true);
    try { setExerciseLibrary(await getExerciseVideos()); } catch { /* noop */ }
    finally { setLibraryLoading(false); }
    try {
      const taxonomy = await getExerciseTaxonomy();
      if (taxonomy) {
        if (taxonomy.muscleGroups.length > 0) setMuscleCategories(taxonomy.muscleGroups);
        if (taxonomy.equipment.length > 0) setEquipmentOptions(taxonomy.equipment);
      }
    } catch { /* noop — falls back to the built-in defaults */ }
  }

  async function addCategory(kind: 'muscleGroups' | 'equipment', value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    const current = kind === 'muscleGroups' ? muscleCategories : equipmentOptions;
    if (current.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      toast.error(`"${trimmed}" already exists`);
      return;
    }
    const next = [...current, trimmed];
    setSavingTaxonomy(true);
    try {
      await saveExerciseTaxonomy({
        muscleGroups: kind === 'muscleGroups' ? next : muscleCategories,
        equipment: kind === 'equipment' ? next : equipmentOptions,
      });
      if (kind === 'muscleGroups') { setMuscleCategories(next); setNewCategoryInput(''); }
      else { setEquipmentOptions(next); setNewEquipmentInput(''); }
    } catch {
      toast.error('Failed to save — try again');
    } finally {
      setSavingTaxonomy(false);
    }
  }

  async function removeCategory(kind: 'muscleGroups' | 'equipment', value: string) {
    const inUse = kind === 'muscleGroups'
      ? exerciseLibrary.filter(ex => ex.muscleGroups.includes(value)).length
      : exerciseLibrary.filter(ex => ex.equipment.includes(value)).length;
    if (inUse > 0 && !confirm(`"${value}" is still tagged on ${inUse} exercise${inUse !== 1 ? 's' : ''}. Removing it from the list won't untag those exercises — just hides it from the picker for future edits. Continue?`)) {
      return;
    }
    const current = kind === 'muscleGroups' ? muscleCategories : equipmentOptions;
    const next = current.filter(c => c !== value);
    setSavingTaxonomy(true);
    try {
      await saveExerciseTaxonomy({
        muscleGroups: kind === 'muscleGroups' ? next : muscleCategories,
        equipment: kind === 'equipment' ? next : equipmentOptions,
      });
      if (kind === 'muscleGroups') setMuscleCategories(next);
      else setEquipmentOptions(next);
    } catch {
      toast.error('Failed to save — try again');
    } finally {
      setSavingTaxonomy(false);
    }
  }

  function startEditEx(ex?: ExerciseVideo) {
    if (ex) {
      setEditingEx(ex);
      setExForm({
        name: ex.name,
        aliases: ex.aliases.join(', '),
        muscleGroups: ex.muscleGroups.join(', '),
        equipment: ex.equipment.join(', '),
      });
    } else {
      setEditingEx(null);
      setExForm({ name: '', aliases: '', muscleGroups: '', equipment: '' });
    }
    setExFile(null);
    setExUploadProgress(0);
    setShowExForm(true);
  }

  // Shared by both the "Add Single" form (top of the list) and the inline
  // edit form (rendered in place of whichever row you clicked the pencil
  // on) — no scrolling either way since the form now opens exactly where
  // you are instead of somewhere else on the page.
  function renderExerciseForm() {
    return (
      <>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">{editingEx ? 'Edit Exercise' : 'New Exercise'}</h3>
          <button onClick={() => { setShowExForm(false); setEditingEx(null); }}><XIcon className="w-4 h-4 text-text-secondary" /></button>
        </div>
        <Input placeholder="Exercise name (e.g. Barbell Back Squat)" value={exForm.name} onChange={e => setExForm(f => ({ ...f, name: e.target.value }))} />
        <Input placeholder="Aliases — comma separated (e.g. squat, back squat, bb squat)" value={exForm.aliases} onChange={e => setExForm(f => ({ ...f, aliases: e.target.value }))} />

        {/* Tap-to-select chips instead of free text — typing "chest" vs "Chest"
            silently didn't match the canonical MUSCLE_CATEGORIES list used by
            the library's filter chips, which is exactly why existing
            exercises couldn't be cleanly reassigned to a category. */}
        <div>
          <label className="text-xs text-text-secondary mb-1.5 block">Muscle Groups</label>
          <div className="flex flex-wrap gap-1.5">
            {muscleCategories.map(cat => {
              const selected = exForm.muscleGroups.split(',').map(s => s.trim()).filter(Boolean).includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    const current = exForm.muscleGroups.split(',').map(s => s.trim()).filter(Boolean);
                    const next = selected ? current.filter(c => c !== cat) : [...current, cat];
                    setExForm(f => ({ ...f, muscleGroups: next.join(', ') }));
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    selected ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs text-text-secondary mb-1.5 block">Equipment</label>
          <div className="flex flex-wrap gap-1.5">
            {equipmentOptions.map(eq => {
              const selected = exForm.equipment.split(',').map(s => s.trim()).filter(Boolean).includes(eq);
              return (
                <button
                  key={eq}
                  type="button"
                  onClick={() => {
                    const current = exForm.equipment.split(',').map(s => s.trim()).filter(Boolean);
                    const next = selected ? current.filter(c => c !== eq) : [...current, eq];
                    setExForm(f => ({ ...f, equipment: next.join(', ') }));
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    selected ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary hover:text-white'
                  }`}
                >
                  {eq}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="text-xs text-text-secondary mb-1 block">Video file (MP4, MOV, WebM)</label>
          {editingEx?.videoUrl && !exFile && (
            <button
              type="button"
              onClick={() => setPreviewVideo(editingEx.videoUrl)}
              className={`w-full h-28 mb-2 rounded-xl flex items-center justify-center relative overflow-hidden transition-colors ${editingEx.thumbnailUrl ? 'bg-black' : 'bg-white/10 hover:bg-accent/20'}`}
            >
              {editingEx.thumbnailUrl && (
                <img src={editingEx.thumbnailUrl} alt={editingEx.name} className="absolute inset-0 w-full h-full object-cover" />
              )}
              <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center ${editingEx.thumbnailUrl ? 'bg-black/50' : ''}`}>
                <Play className={`w-5 h-5 ${editingEx.thumbnailUrl ? 'text-white' : 'text-accent'}`} />
              </div>
            </button>
          )}
          <input
            type="file"
            accept="video/*"
            className="text-sm text-text-secondary w-full"
            onChange={e => setExFile(e.target.files?.[0] ?? null)}
          />
          {editingEx?.videoUrl && !exFile && (
            <p className="text-xs text-text-tertiary mt-1">Tap the preview above to confirm this is the right clip — upload a new file to replace it.</p>
          )}
        </div>
        {savingEx && exUploadProgress > 0 && exUploadProgress < 100 && (
          <div className="w-full bg-white/10 rounded-full h-1.5">
            <div className="bg-accent h-1.5 rounded-full transition-all" style={{ width: `${exUploadProgress}%` }} />
          </div>
        )}
        <Button onClick={handleSaveEx} loading={savingEx} className="w-full">
          {savingEx ? (exUploadProgress > 0 ? `Uploading ${exUploadProgress}%…` : 'Saving…') : 'Save Exercise'}
        </Button>
      </>
    );
  }

  async function handleSaveEx() {
    if (!user || !exForm.name.trim()) { toast.error('Exercise name required'); return; }
    if (!editingEx && !exFile) { toast.error('Please select a video file'); return; }
    setSavingEx(true);
    try {
      let videoUrl = editingEx?.videoUrl ?? '';
      let thumbnailUrl = editingEx?.thumbnailUrl;
      if (exFile) {
        const oldVideoUrl = editingEx?.videoUrl;
        const oldThumbnailUrl = editingEx?.thumbnailUrl;
        videoUrl = await uploadVideo(storageProvider, user, exFile, 'exerciseLibrary', setExUploadProgress);
        const thumbBlob = await extractVideoThumbnail(exFile).catch(() => null);
        if (thumbBlob) {
          const thumbFile = new File([thumbBlob], 'thumb.jpg', { type: 'image/jpeg' });
          thumbnailUrl = await uploadVideo(storageProvider, user, thumbFile, 'exerciseLibrary').catch(() => thumbnailUrl);
        }
        // Clean up the files being replaced now that the new ones are safely uploaded.
        if (oldVideoUrl && oldVideoUrl !== videoUrl) deleteVideo(storageProvider, user, oldVideoUrl);
        if (oldThumbnailUrl && oldThumbnailUrl !== thumbnailUrl) deleteVideo(storageProvider, user, oldThumbnailUrl);
      }
      const payload = {
        name: exForm.name.trim(),
        aliases: exForm.aliases.split(',').map(s => s.trim()).filter(Boolean),
        muscleGroups: exForm.muscleGroups.split(',').map(s => s.trim()).filter(Boolean),
        equipment: exForm.equipment.split(',').map(s => s.trim()).filter(Boolean),
        videoUrl,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        uploadedBy: user.uid,
      };
      await saveExerciseVideo(payload, editingEx?.id);
      toast.success(editingEx ? 'Exercise updated' : 'Exercise added to library');
      setShowExForm(false);
      setEditingEx(null);
      await loadExerciseLibrary();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to save exercise: ${msg}`, { duration: 6000 });
      console.error(err);
    } finally {
      setSavingEx(false);
      setExUploadProgress(0);
    }
  }

  async function handleDeleteEx(id: string) {
    if (!confirm('Delete this exercise from the library?')) return;
    const ex = exerciseLibrary.find(e => e.id === id);
    try {
      await deleteExerciseVideo(id);
      setExerciseLibrary(prev => prev.filter(e => e.id !== id));
      toast.success('Deleted');
      if (user && ex) {
        deleteVideo(storageProvider, user, ex.videoUrl);
        deleteVideo(storageProvider, user, ex.thumbnailUrl);
      }
    } catch { toast.error('Failed to delete'); }
  }

  // Pulls a frame straight off each hosted video URL and saves it back.
  // `force: false` only fills in videos with no thumbnail at all (the
  // original one-time-cleanup use case); `force: true` regenerates every
  // video's thumbnail, including ones that already have one — needed
  // because some earlier thumbnails were bad captures (a black/near-black
  // frame grabbed before the video's decoder had anything buffered) that
  // still counted as "has a thumbnailUrl" and so never got backfilled.
  async function handleBackfillThumbnails(force = false) {
    if (!user) return;
    const targets = force
      ? exerciseLibrary.filter(e => e.videoUrl)
      : exerciseLibrary.filter(e => !e.thumbnailUrl && e.videoUrl);
    if (targets.length === 0) { toast('Every exercise already has a thumbnail'); return; }
    setBackfillRunning(true);
    setBackfillProgress({ done: 0, total: targets.length, failed: 0 });
    let failed = 0;
    for (const ex of targets) {
      try {
        const blob = await extractVideoThumbnailFromUrl(ex.videoUrl);
        if (!blob) throw new Error('no frame');
        const thumbFile = new File([blob], 'thumb.jpg', { type: 'image/jpeg' });
        const thumbnailUrl = await uploadVideo(storageProvider, user, thumbFile, 'exerciseLibrary');
        await updateExerciseVideoThumbnail(ex.id, thumbnailUrl);
        setExerciseLibrary(prev => prev.map(e => e.id === ex.id ? { ...e, thumbnailUrl } : e));
      } catch {
        failed++;
      }
      setBackfillProgress(prev => ({ ...prev, done: prev.done + 1, failed }));
    }
    setBackfillRunning(false);
    if (failed > 0) {
      toast.error(`Backfilled ${targets.length - failed} of ${targets.length} — ${failed} couldn't be read (likely a CORS-blocked host)`, { duration: 6000 });
    } else {
      toast.success(`Generated thumbnails for ${targets.length} exercise${targets.length !== 1 ? 's' : ''}`);
    }
  }

  // ── Bulk upload ──────────────────────────────────────────────────────────────
  function handleBulkFilePick(files: FileList | null) {
    if (!files) return;
    const newItems: BulkFile[] = Array.from(files)
      .filter(f => f.type.startsWith('video/'))
      .map(f => ({
        id: Math.random().toString(36).slice(2),
        file: f,
        name: parseExerciseName(f.name),
        aliases: '',
        status: 'pending',
      }));
    setBulkFiles(prev => [...prev, ...newItems]);
  }

  function updateBulkFile(id: string, patch: Partial<Pick<BulkFile, 'name' | 'aliases'>>) {
    setBulkFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  }

  function removeBulkFile(id: string) {
    setBulkFiles(prev => prev.filter(f => f.id !== id));
  }

  async function handleBulkUpload() {
    if (!user || bulkFiles.filter(f => f.status === 'pending').length === 0) return;
    setBulkUploading(true);
    const pending = bulkFiles.filter(f => f.status === 'pending');
    let done = 0;
    let failed = 0;

    await Promise.all(pending.map(async (item) => {
      setBulkFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'uploading' } : f));
      try {
        const videoUrl = await uploadVideo(storageProvider, user, item.file, 'exerciseLibrary', (pct) => {
          setBulkProgress(prev => ({ ...prev, [item.id]: pct }));
        });
        const thumbBlob = await extractVideoThumbnail(item.file).catch(() => null);
        const thumbnailUrl = thumbBlob
          ? await uploadVideo(storageProvider, user, new File([thumbBlob], 'thumb.jpg', { type: 'image/jpeg' }), 'exerciseLibrary').catch(() => undefined)
          : undefined;
        await saveExerciseVideo({
          name: item.name.trim(),
          aliases: item.aliases.split(',').map(s => s.trim()).filter(Boolean),
          muscleGroups: [bulkCategory],
          equipment: [bulkEquipment],
          videoUrl,
          ...(thumbnailUrl ? { thumbnailUrl } : {}),
          uploadedBy: user.uid,
        });
        setBulkFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'done' } : f));
        done++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('Bulk upload error:', msg);
        setBulkFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'error', errorMsg: msg } : f));
        failed++;
      }
    }));

    setBulkUploading(false);
    if (done > 0) toast.success(`${done} exercise${done !== 1 ? 's' : ''} uploaded!`);
    if (failed > 0) toast.error(`${failed} failed — check red items`);
    if (done > 0) {
      setBulkFiles(prev => prev.filter(f => f.status !== 'done'));
      await loadExerciseLibrary();
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true);
    try {
      await setSystemConfig(settingsForm);
      toast.success('Settings saved');
    } catch { toast.error('Failed to save settings'); }
    finally { setSavingSettings(false); }
  }

  function updateLandingFeature(i: number, patch: Partial<{ title: string; desc: string }>) {
    setLandingForm(f => ({
      ...f,
      features: f.features.map((feat, idx) => idx === i ? { ...feat, ...patch } : feat),
    }));
  }

  function addLandingFeature() {
    setLandingForm(f => ({ ...f, features: [...f.features, { title: '', desc: '' }] }));
  }

  function removeLandingFeature(i: number) {
    setLandingForm(f => ({ ...f, features: f.features.filter((_, idx) => idx !== i) }));
  }

  function updateSocialProof(i: number, value: string) {
    setLandingForm(f => ({
      ...f,
      socialProof: f.socialProof.map((line, idx) => idx === i ? value : line),
    }));
  }

  function addTestimonial() {
    setLandingForm(f => ({ ...f, testimonials: [...(f.testimonials ?? []), { name: '', quote: '' }] }));
  }

  function updateTestimonial(i: number, patch: Partial<{ name: string; quote: string }>) {
    setLandingForm(f => ({
      ...f,
      testimonials: (f.testimonials ?? []).map((t, idx) => idx === i ? { ...t, ...patch } : t),
    }));
  }

  function removeTestimonial(i: number) {
    setLandingForm(f => ({ ...f, testimonials: (f.testimonials ?? []).filter((_, idx) => idx !== i) }));
  }

  function updateTransformationPhoto(i: number, patch: Partial<{ caption: string }>) {
    setLandingForm(f => ({
      ...f,
      transformationPhotos: (f.transformationPhotos ?? []).map((p, idx) => idx === i ? { ...p, ...patch } : p),
    }));
  }

  function removeTransformationPhoto(i: number) {
    setLandingForm(f => ({ ...f, transformationPhotos: (f.transformationPhotos ?? []).filter((_, idx) => idx !== i) }));
  }

  // Generic CSV export — quotes every field and escapes embedded quotes so
  // a comma/quote/newline inside a name or message (e.g. "This is a test")
  // can't corrupt the column structure when opened in Excel/Brevo's
  // importer. Triggers a real browser download via a throwaway <a> — safe
  // here since this is the actual production admin page, not a sandboxed
  // preview that blocks script-driven downloads.
  function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
    // Guard against CSV/formula injection: a field starting with =, +, -, @
    // (or tab/CR) is executed as a formula by Excel/Sheets even when
    // quoted, so prefix such values with a leading apostrophe to force
    // text interpretation — this is what Google/OWASP recommend.
    const escape = (v: string | number) => {
      let s = String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function leadDate(lead: { createdAt: unknown }): string {
    const ts = lead.createdAt as { toDate?: () => Date } | null;
    return ts?.toDate?.().toISOString().slice(0, 10) ?? '';
  }

  async function handleTransformationPhotosUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !user) return;
    setUploadingTransformationPhotos(true);
    try {
      const urls: string[] = [];
      for (const file of files) {
        urls.push(await uploadVideo(storageProvider, user, file, 'branding'));
      }
      setLandingForm(f => ({
        ...f,
        transformationPhotos: [...(f.transformationPhotos ?? []), ...urls.map((imageUrl) => ({ imageUrl, caption: '' }))],
      }));
      toast.success(`${urls.length} photo${urls.length > 1 ? 's' : ''} uploaded — click Save Landing Page below to publish`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to upload photos: ${msg}`, { duration: 6000 });
    } finally {
      setUploadingTransformationPhotos(false);
      e.target.value = '';
    }
  }

  async function handleSaveLanding() {
    setSavingLanding(true);
    try {
      await setSystemConfig({ landingPage: landingForm });
      toast.success('Landing page saved');
    } catch { toast.error('Failed to save landing page'); }
    finally { setSavingLanding(false); }
  }

  function handleResetLanding() {
    if (!confirm('Reset the landing page to the default copy? This discards your customizations (until you save again).')) return;
    setLandingForm(DEFAULT_LANDING_CONFIG);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingLogo(true);
    try {
      const url = await uploadVideo(storageProvider, user, file, 'branding');
      setSettingsForm(s => ({ ...s, logoUrl: url }));
      await setSystemConfig({ logoUrl: url });
      toast.success('Logo uploaded');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to upload logo: ${msg}`, { duration: 6000 });
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  }

  async function handleHeroImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingHeroImage(true);
    try {
      const url = await uploadVideo(storageProvider, user, file, 'branding');
      setLandingForm(f => ({ ...f, heroImageUrl: url }));
      toast.success('Hero image uploaded — click Save Landing Page below to publish it');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to upload hero image: ${msg}`, { duration: 6000 });
    } finally {
      setUploadingHeroImage(false);
      e.target.value = '';
    }
  }

  async function handleDemoVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingDemoVideo(true);
    try {
      const url = await uploadVideo(storageProvider, user, file, 'branding');
      setLandingForm(f => ({ ...f, heroDemoVideoUrl: url }));
      toast.success('Demo video uploaded — click Save Landing Page below to publish it');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to upload demo video: ${msg}`, { duration: 6000 });
    } finally {
      setUploadingDemoVideo(false);
      e.target.value = '';
    }
  }

  async function handleB2bHeroImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingB2bHero(true);
    try {
      const url = await uploadVideo(storageProvider, user, file, 'branding');
      setB2bForm(f => ({ ...f, heroImageUrl: url }));
      toast.success('Hero image uploaded — click Save below to publish it');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to upload hero image: ${msg}`, { duration: 6000 });
    } finally {
      setUploadingB2bHero(false);
      e.target.value = '';
    }
  }

  async function handleB2bVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingB2bVideo(true);
    try {
      const url = await uploadVideo(storageProvider, user, file, 'branding');
      setB2bForm(f => ({ ...f, heroDemoVideoUrl: url }));
      toast.success('Demo video uploaded — click Save below to publish it');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to upload demo video: ${msg}`, { duration: 6000 });
    } finally {
      setUploadingB2bVideo(false);
      e.target.value = '';
    }
  }

  async function handleSaveB2b() {
    setSavingB2b(true);
    try {
      await setSystemConfig({ b2bLandingPage: b2bForm });
      toast.success('B2B landing page saved');
    } catch {
      toast.error('Failed to save — try again');
    } finally {
      setSavingB2b(false);
    }
  }

  async function handleScreenshotsUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !user) return;
    setUploadingScreenshots(true);
    try {
      // Sequential, not Promise.all — real device screenshots run several
      // MB each, so uploading a handful at once competes for the same
      // upload bandwidth and tends to time out on slower connections.
      const urls: string[] = [];
      for (const file of files) {
        urls.push(await uploadVideo(storageProvider, user, file, 'branding'));
      }
      setLandingForm(f => ({ ...f, screenshotUrls: [...(f.screenshotUrls ?? []), ...urls] }));
      toast.success(`${urls.length} screenshot${urls.length > 1 ? 's' : ''} uploaded — click Save Landing Page below to publish`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to upload screenshots: ${msg}`, { duration: 6000 });
    } finally {
      setUploadingScreenshots(false);
      e.target.value = '';
    }
  }

  async function handleSaveLegal() {
    setSavingLegal(true);
    try {
      await setSystemConfig(legalForm);
      toast.success('Legal pages saved');
    } catch { toast.error('Failed to save legal pages'); }
    finally { setSavingLegal(false); }
  }

  async function handleRunBackup() {
    if (!user) return;
    setRunningBackup(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/admin/backup', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Backup failed');
      setLastBackupResult(data);
      toast.success('Backup complete');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setRunningBackup(false);
    }
  }

  const stripeConfigured = secretStatuses.find(s => s.key === 'STRIPE_SECRET_KEY')?.configured ?? false;
  const clients = users.filter(u => u.role !== 'admin');
  const trainers = users.filter(u => u.role === 'trainer');

  // Exports the currently-loaded client list as a CSV — client-side only,
  // no new API surface, since the admin panel already has this exact data
  // loaded for the Clients tab. Quotes every field and escapes embedded
  // quotes so a comma or quote in someone's name can't corrupt the file.
  function handleExportClientsCsv() {
    const csvField = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Name', 'Email', 'Fitness Goal', 'Experience', 'Membership Status', 'Total Workouts', 'Streak', 'Joined'],
      ...clients.map((u) => {
        const uu = u as UserData & { membership?: { status?: string } };
        const joined = (u.createdAt as { toDate?: () => Date } | undefined)?.toDate?.();
        return [
          u.displayName || '',
          u.email || '',
          u.fitnessGoal || '',
          u.experience || '',
          uu.membership?.status || 'none',
          u.statsCache?.totalWorkouts ?? u.stats?.totalWorkouts ?? 0,
          u.statsCache?.streak ?? 0,
          joined ? joined.toLocaleDateString('en-US') : '',
        ];
      }),
    ];
    const csv = rows.map((row) => row.map(csvField).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const exSearchQueryLower = exSearchQuery.trim().toLowerCase();
  const filteredExerciseLibrary = exerciseLibrary
    .filter(ex => !exSearchQueryLower ||
      ex.name.toLowerCase().includes(exSearchQueryLower) ||
      ex.aliases.some(a => a.toLowerCase().includes(exSearchQueryLower))
    )
    .filter(ex => {
      if (!exCategoryFilter) return true;
      if (exCategoryFilter === '__uncategorized__') return ex.muscleGroups.length === 0;
      return ex.muscleGroups.includes(exCategoryFilter);
    });

  // Live per-category counts so curating a messy library is actually
  // possible — e.g. a "Cardio" chip showing 40 exercises when only 5 are
  // real cardio moves is the exact signal that those 35 are miscategorized.
  const exCategoryCounts: Record<string, number> = {};
  for (const cat of muscleCategories) {
    exCategoryCounts[cat] = exerciseLibrary.filter(ex => ex.muscleGroups.includes(cat)).length;
  }
  const uncategorizedCount = exerciseLibrary.filter(ex => ex.muscleGroups.length === 0).length;

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'programs', label: 'Programs', icon: Dumbbell },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'community', label: 'Community', icon: Users },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'membership', label: 'Membership', icon: CreditCard },
    { id: 'coaching', label: 'Coaching Apps', icon: UserCheck },
    { id: 'library', label: 'Library', icon: Video },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    { id: 'integrations', label: 'Integrations', icon: Key },
    { id: 'leads', label: 'Leads', icon: Mail },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-white">Admin Dashboard</h1>
        <p className="text-text-secondary text-sm mt-0.5">Manage your fitness platform</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              tab === id ? 'bg-accent text-black' : 'text-text-secondary hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Users, label: 'Clients', value: clients.length, color: 'text-blue-400', bg: 'bg-blue-400/10' },
              { icon: Dumbbell, label: 'Programs', value: programCount, color: 'text-purple-400', bg: 'bg-purple-400/10' },
              { icon: Activity, label: 'Workouts Today', value: workoutsToday, color: 'text-green-400', bg: 'bg-green-400/10' },
              { icon: Shield, label: 'System', value: '✓', color: 'text-accent', bg: 'bg-accent-muted' },
            ].map(({ icon: Icon, label, value, color, bg }) => (
              <motion.div key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="p-4">
                  <div className={`inline-flex p-2 rounded-lg ${bg} mb-2`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <p className="text-xl font-black text-white">{overviewLoading ? '—' : value}</p>
                  <p className="text-xs text-text-secondary">{label}</p>
                </Card>
              </motion.div>
            ))}
          </div>

          <Card className="p-5">
            <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-accent" /> Payment Processing
            </h2>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {stripeConfigured ? <CheckCircle className="w-5 h-5 text-success" /> : <CreditCard className="w-5 h-5 text-text-tertiary" />}
                <span className={`text-sm font-medium ${stripeConfigured ? 'text-success' : 'text-text-tertiary'}`}>
                  {stripeConfigured ? 'Stripe Connected' : 'Not configured'}
                </span>
              </div>
              {!stripeConfigured && (
                <Button size="sm" variant="ghost" onClick={() => setTab('integrations')}>Set up</Button>
              )}
            </div>
            {!stripeConfigured && (
              <p className="text-xs text-text-secondary mt-2">
                Add your Stripe secret key in Admin → Integrations to enable membership and program billing.
              </p>
            )}
          </Card>

          {config && (
            <Card className="p-5">
              <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <Settings className="w-4 h-4 text-accent" /> System Configuration
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'App Name', value: config.appName as string },
                  { label: 'Trainer', value: config.trainerName as string },
                  { label: 'OpenAI Model', value: config.openaiModel as string },
                  { label: 'Stripe', value: config.stripePublishableKey ? 'Configured' : 'Not set' },
                ].map(({ label, value }) => (
                  <div key={label} className="p-3 bg-surface-elevated rounded-xl">
                    <p className="text-xs text-text-secondary">{label}</p>
                    <p className="text-sm font-medium text-white truncate">{value || '—'}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── Programs ──────────────────────────────────────────────────────────── */}
      {tab === 'programs' && (
        <div className="space-y-4">
          <Card className="p-6 text-center border-accent/20 bg-accent/5">
            <Dumbbell className="w-10 h-10 text-accent mx-auto mb-3" />
            <h3 className="text-white font-bold mb-1">AI-Powered Program Builder</h3>
            <p className="text-text-secondary text-sm mb-4">
              Describe a program in plain text — AI generates a complete weekly schedule with exercises, sets, reps, RPE, and rest times. You review and edit everything before publishing.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button onClick={() => router.push('/admin/programs/builder')}>
                <Sparkles className="w-4 h-4" /> Create with AI
              </Button>
              <Button variant="secondary" onClick={() => router.push('/admin/programs')}>
                View All Programs
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Clients ───────────────────────────────────────────────────────────── */}
      {tab === 'clients' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-text-secondary text-sm">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
            {clients.length > 0 && (
              <Button size="sm" variant="ghost" onClick={handleExportClientsCsv}>
                <Download className="w-3.5 h-3.5" /> Export CSV
              </Button>
            )}
          </div>
          {clientsLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          ) : clients.length === 0 ? (
            <Card className="p-8 text-center">
              <Users className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
              <p className="text-text-secondary text-sm">No clients yet.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {clients.map((u) => (
                <Card key={u.id} className={`p-4 ${u.banned ? 'border-danger/30 opacity-70' : ''}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-accent-muted flex items-center justify-center text-accent text-sm font-bold flex-shrink-0">
                        {u.displayName?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white truncate">{u.displayName || 'Unknown'}</p>
                          {u.banned && <Badge variant="danger">Banned</Badge>}
                        </div>
                        <p className="text-xs text-text-secondary truncate">{u.email}</p>
                        <p className="text-xs text-text-tertiary mt-0.5">Last login: {formatLastLogin(u.lastLoginAt)}</p>
                        {u.activeProgram && (
                          <p className="text-xs text-text-tertiary mt-0.5">
                            {u.activeProgram.programName} · {u.activeProgram.completedWorkouts}/{u.activeProgram.totalWorkouts} sessions
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap justify-end border-t border-white/5 pt-2 sm:border-0 sm:pt-0 flex-shrink-0">
                      <button
                        onClick={() => setProfileDetailUser(u)}
                        title="View Profile & Health Info"
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors text-text-secondary hover:text-white"
                      >
                        <User className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => startConversation(u)}
                        title="Message"
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors text-text-secondary hover:text-accent"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                                      <button
                        onClick={() => router.push('/admin/programs')}
                        title="Assign Program"
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors text-text-secondary hover:text-white"
                      >
                        <Dumbbell className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openNutritionModal(u)}
                        title="AI Nutrition Plan"
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors text-text-secondary hover:text-green-400"
                      >
                        <Apple className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openGoalModal(u)}
                        title="Set Goal"
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors text-text-secondary hover:text-accent"
                      >
                        <Target className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleBanToggle(u)}
                        disabled={banningUser === u.id}
                        title={u.banned ? 'Unban' : 'Ban'}
                        className={`p-2 rounded-lg transition-colors ${u.banned ? 'hover:bg-green-400/10 text-green-400' : 'hover:bg-danger/10 text-text-secondary hover:text-danger'}`}
                      >
                        {u.banned ? <UserCheck className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleDeleteUser(u)}
                        title="Delete user"
                        className="p-2 rounded-lg hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Messages ─────────────────────────────────────────────────────────── */}
      {tab === 'messages' && (
        <div>
          {activeConv ? (
            <div className="flex flex-col h-[70vh]">
              <div className="flex items-center gap-3 pb-3 border-b border-white/8 mb-3">
                <button onClick={() => setActiveConv(null)} className="p-1.5 rounded-lg hover:bg-white/5 text-text-secondary hover:text-white">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div>
                  <p className="text-sm font-bold text-white">{activeConv.userDisplayName}</p>
                  <p className="text-xs text-text-secondary">{activeConv.userEmail}</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {msgLoading ? (
                  <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-text-tertiary text-sm py-8">No messages yet. Say hello!</p>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`flex ${m.isFromAdmin ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${m.isFromAdmin ? 'bg-accent text-black' : 'bg-surface-elevated text-white'}`}>
                        <p className="text-sm">{m.content}</p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="flex gap-2 pt-3 border-t border-white/8 mt-3">
                <input
                  value={msgText}
                  onChange={e => setMsgText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                  placeholder="Type a message…"
                  className="flex-1 bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
                />
                <Button onClick={handleSendMessage} loading={sendingMsg} disabled={!msgText.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-text-secondary text-sm">{conversations.length} conversation{conversations.length !== 1 ? 's' : ''}</p>
                <Button size="sm" variant="ghost" onClick={() => setTab('clients')}>
                  Start new (via Clients tab)
                </Button>
              </div>
              {convsLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
              ) : conversations.length === 0 ? (
                <Card className="p-8 text-center">
                  <MessageSquare className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
                  <p className="text-text-secondary text-sm">No conversations yet.</p>
                  <p className="text-text-tertiary text-xs mt-1">Go to the Clients tab and click the message icon to start a DM.</p>
                </Card>
              ) : (
                <div className="space-y-2">
                  {conversations.map((conv) => (
                    <Card
                      key={conv.id}
                      className={`p-4 transition-colors ${conv.unreadByAdmin ? 'border-accent/40' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full bg-accent-muted flex items-center justify-center text-accent text-sm font-bold flex-shrink-0 cursor-pointer"
                          onClick={() => openConversation(conv)}
                        >
                          {conv.userDisplayName?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openConversation(conv)}>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{conv.userDisplayName}</p>
                            {conv.unreadByAdmin && <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />}
                          </div>
                          <p className="text-xs text-text-secondary truncate">{conv.lastMessage || 'No messages yet'}</p>
                        </div>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm(`Delete conversation with ${conv.userDisplayName}? This cannot be undone.`)) return;
                            try {
                              await deleteConversation(conv.id);
                              setConversations(cs => cs.filter(c => c.id !== conv.id));
                              toast.success('Conversation deleted');
                            } catch {
                              toast.error('Failed to delete conversation');
                            }
                          }}
                          className="p-2 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger/10 transition-colors flex-shrink-0"
                          title="Delete conversation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Community ────────────────────────────────────────────────────────── */}
      {tab === 'community' && (
        <div className="space-y-4">
          <Card
            className="p-4 flex items-center gap-3 hover:border-accent/30 transition-colors cursor-pointer"
            onClick={() => router.push('/admin/pr-review')}
          >
            <div className="w-9 h-9 rounded-xl bg-accent-muted flex items-center justify-center flex-shrink-0">
              <Trophy className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">PR Wall Review</p>
              <p className="text-xs text-text-secondary">Verify submitted PRs and assign trust badges</p>
            </div>
          </Card>

          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <p className="text-text-secondary text-sm">{channels.length} channel{channels.length !== 1 ? 's' : ''}</p>
            <Button size="sm" onClick={() => { setEditingChannel(null); setChannelForm({ name: '', description: '', emoji: '', photoUploadEnabled: true, slowModeDays: 0, allowUserPosts: true }); setShowChannelForm(true); }}>
              <Plus className="w-4 h-4" /> New Channel
            </Button>
          </div>

          {showChannelForm && !editingChannel && (
            <Card className="p-5 space-y-3 border-accent/30">
              {renderChannelForm()}
            </Card>
          )}

          {channelsLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : channels.length === 0 && !showChannelForm ? (
            <Card className="p-8 text-center">
              <p className="text-white font-bold">No channels yet</p>
              <p className="text-text-secondary text-sm mt-1">Create a channel for your community.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {channels.map(ch => (
                editingChannel?.id === ch.id && showChannelForm ? (
                  <Card key={ch.id} className="p-5 space-y-3 border-accent/30">
                    {renderChannelForm()}
                  </Card>
                ) : (
                <Card key={ch.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{ch.emoji || '#'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white"># {ch.name}</p>
                      <div className="flex gap-3 text-xs text-text-tertiary mt-0.5">
                        <span>{ch.postCount} posts</span>
                        {ch.slowModeDays > 0 && <span>Slow: {ch.slowModeDays}d</span>}
                        {ch.photoUploadEnabled && <span>📷 photos on</span>}
                        {ch.allowUserPosts === false && <span className="text-yellow-400">📢 announcement-only</span>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => startEditChannel(ch)} className="p-2 rounded-lg hover:bg-white/5 text-text-secondary hover:text-white transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteChannel(ch)} className="p-2 rounded-lg hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </Card>
                )
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Notifications ────────────────────────────────────────────────────── */}
      {tab === 'notifications' && (
        <div className="space-y-5">
          {notifLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          ) : (
            <>
              {/* Manual push */}
              <Card className="p-5 space-y-4">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Bell className="w-4 h-4 text-accent" /> Send Notification
                </h2>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Recipient</label>
                  <select
                    value={manualNotif.target}
                    onChange={e => setManualNotif(m => ({ ...m, target: e.target.value }))}
                    className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
                  >
                    <option value="all">All clients ({clients.length})</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.displayName || c.email}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Title</label>
                  <Input
                    value={manualNotif.title}
                    onChange={e => setManualNotif(m => ({ ...m, title: e.target.value }))}
                    placeholder="e.g. New program available!"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Message</label>
                  <textarea
                    value={manualNotif.body}
                    onChange={e => setManualNotif(m => ({ ...m, body: e.target.value }))}
                    placeholder="Write your message…"
                    rows={3}
                    className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none"
                  />
                </div>
                <Button
                  onClick={handleSendManualNotif}
                  loading={sendingNotif}
                  disabled={!manualNotif.title.trim() || !manualNotif.body.trim()}
                  fullWidth
                >
                  <Send className="w-4 h-4" /> Send Now
                </Button>
              </Card>

              {/* Auto-notification rules */}
              <Card className="p-5 space-y-4">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-accent" /> Auto-Notification Rules
                </h2>
                <p className="text-xs text-text-secondary">
                  These run automatically every day at 8 AM UTC via Vercel cron.
                  Requires Firebase Admin SDK env vars (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).
                </p>

                {[
                  { id: 'missed_workout', label: 'Missed Workout', desc: 'Notify users who haven\'t logged a workout in 24h while on an active program', icon: Dumbbell, color: 'text-yellow-400' },
                  { id: 'streak_reminder', label: 'Streak Celebration', desc: 'Remind users with an active streak to keep going', icon: Flame, color: 'text-orange-400' },
                  { id: 'weekly_recap', label: 'Weekly Recap', desc: 'Sunday digest of the week\'s workouts, volume, and streak — sent only to users who trained that week', icon: TrendingUp, color: 'text-blue-400' },
                ].map(({ id, label, desc, icon: Icon, color }) => (
                  <div key={id} className="flex items-start gap-3 py-1">
                    <div className="w-8 h-8 rounded-lg bg-surface-elevated flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{label}</p>
                      <p className="text-xs text-text-secondary mt-0.5">{desc}</p>
                    </div>
                    <button
                      onClick={() => setNotifConfig(c => ({ ...c, rules: { ...c.rules, [id]: !c.rules[id] } }))}
                      className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 mt-1 ${notifConfig.rules[id] ? 'bg-accent' : 'bg-surface-elevated'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${notifConfig.rules[id] ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                ))}

                {/* AI motivation */}
                <div className="pt-2 border-t border-white/8 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-400/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Zap className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">AI Motivation</p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        GPT generates a personalised motivational message for each client. Requires OPENAI_API_KEY.
                      </p>
                    </div>
                    <button
                      onClick={() => setNotifConfig(c => ({ ...c, aiMotivationEnabled: !c.aiMotivationEnabled }))}
                      className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 mt-1 ${notifConfig.aiMotivationEnabled ? 'bg-purple-500' : 'bg-surface-elevated'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${notifConfig.aiMotivationEnabled ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                  {notifConfig.aiMotivationEnabled && (
                    <div>
                      <label className="text-xs text-text-secondary mb-1 block">Frequency</label>
                      <div className="flex gap-2">
                        {(['daily', 'weekly'] as const).map(s => (
                          <button
                            key={s}
                            onClick={() => setNotifConfig(c => ({ ...c, aiMotivationSchedule: s }))}
                            className={`px-4 py-2 rounded-xl text-xs font-medium transition-colors ${notifConfig.aiMotivationSchedule === s ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'}`}
                          >
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSaveNotifConfig} loading={savingNotifConfig} fullWidth>
                    Save Rules
                  </Button>
                  <Button variant="secondary" onClick={handleRunCronNow} loading={processingCron} title="Run all enabled auto-rules right now">
                    <RefreshCw className="w-4 h-4" /> Run Now
                  </Button>
                </div>
              </Card>

              {/* Milestone */}
              <Card className="p-4 border-accent/20 bg-accent/5">
                <div className="flex items-center gap-3">
                  <Trophy className="w-8 h-8 text-accent flex-shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-white">Milestone notifications</p>
                    <p className="text-xs text-text-secondary mt-0.5">
                      These fire automatically when a user completes 10, 25, or 50 workouts — no configuration needed.
                    </p>
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ── Membership ───────────────────────────────────────────────────────── */}
      {tab === 'membership' && (
        <div className="space-y-5">
          {membershipLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          ) : (
            <>
              {/* Enable / fee */}
              <Card className="p-5 space-y-4">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-accent" /> Membership Settings
                </h2>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">Enable Membership System</p>
                    <p className="text-xs text-text-secondary mt-0.5">Restrict features to paying members only</p>
                  </div>
                  <button
                    onClick={() => setMembership(m => ({ ...m, enabled: !m.enabled }))}
                    className={`w-11 h-6 rounded-full transition-colors relative ${membership.enabled ? 'bg-accent' : 'bg-surface-elevated'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${membership.enabled ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
                {membership.enabled && (
                  <>
                    <p className="text-xs text-text-tertiary -mt-1">
                      Pricing, descriptions, and per-plan feature access now live in <span className="text-white font-medium">Membership Plans</span> below — create as many tiers as you want. These settings apply globally, across every plan.
                    </p>
                    <div>
                      <label className="text-xs text-text-secondary mb-2 block">Free Trial Period</label>
                      <div className="grid grid-cols-4 gap-2">
                        {([0, 7, 14, 30] as const).map((d) => (
                          <button
                            key={d}
                            onClick={() => setMembership(m => ({ ...m, trialDays: d }))}
                            className={`py-2 rounded-xl text-xs font-bold transition-all border ${membership.trialDays === d ? 'bg-accent text-black border-accent' : 'border-white/10 text-text-secondary'}`}
                          >
                            {d === 0 ? 'None' : `${d}d`}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-text-tertiary mt-1.5">
                        {membership.paidTrialEnabled
                          ? 'New members get this many days on the trial price below before being charged the plan\'s full price.'
                          : 'New members get this many days free before being charged.'}
                      </p>
                    </div>
                    {membership.trialDays > 0 && (
                      <div className="p-3 bg-surface-elevated rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-white">Paid Trial (MadMuscles-style)</p>
                            <p className="text-xs text-text-secondary mt-0.5">Charge a small fee upfront instead of a free, no-card trial — filters out non-payers and gets you paid from day one.</p>
                          </div>
                          <button
                            onClick={() => setMembership(m => ({
                              ...m,
                              paidTrialEnabled: !m.paidTrialEnabled,
                              // A paid trial only ever gets enforced through
                              // the checkout paywall (LockedScreen) — without
                              // Full Platform Lock also on, nothing would
                              // ever prompt payment and the trial fee would
                              // never actually get charged to anyone.
                              fullLock: !m.paidTrialEnabled ? true : m.fullLock,
                            }))}
                            className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${membership.paidTrialEnabled ? 'bg-accent' : 'bg-surface'}`}
                          >
                            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${membership.paidTrialEnabled ? 'left-6' : 'left-1'}`} />
                          </button>
                        </div>
                        {membership.paidTrialEnabled && (
                          <div>
                            <label className="text-xs text-text-secondary mb-1 block">Trial Price (USD, charged immediately)</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={((membership.trialPriceCents ?? 100) / 100).toFixed(2)}
                              onChange={e => setMembership(m => ({ ...m, trialPriceCents: Math.round((parseFloat(e.target.value) || 0) * 100) }))}
                              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
                            />
                            <p className="text-xs text-text-tertiary mt-1.5">
                              e.g. $1.00 for {membership.trialDays} days, then the member's chosen plan price applies automatically — same pattern as MadMuscles and most subscription fitness apps.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-white">Full Platform Lock</p>
                        <p className="text-xs text-text-secondary mt-0.5">
                          {membership.paidTrialEnabled ? 'Required while Paid Trial is on — non-members must check out to get in.' : 'Non-members can only see the dashboard'}
                        </p>
                      </div>
                      <button
                        onClick={() => !membership.paidTrialEnabled && setMembership(m => ({ ...m, fullLock: !m.fullLock }))}
                        disabled={membership.paidTrialEnabled}
                        className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${membership.fullLock ? 'bg-danger' : 'bg-surface-elevated'} ${membership.paidTrialEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${membership.fullLock ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>
                  </>
                )}
              </Card>

              {/* Limited-time discount */}
              {membership.enabled && (
                <Card className="p-5 space-y-4">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-accent" /> Limited-Time Discount
                  </h2>
                  <p className="text-xs text-text-secondary">
                    Applies to the first payment on new membership and coaching plan checkouts while active. Leave at 0% to disable.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-text-secondary mb-1 block">Discount %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={membership.discountPercent ?? 0}
                        onChange={e => setMembership(m => ({ ...m, discountPercent: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary mb-1 block">Expires</label>
                      <input
                        type="datetime-local"
                        value={membership.discountExpiresAt ? membership.discountExpiresAt.slice(0, 16) : ''}
                        onChange={e => setMembership(m => ({ ...m, discountExpiresAt: e.target.value ? new Date(e.target.value).toISOString() : undefined }))}
                        className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
                      />
                    </div>
                  </div>
                  {(membership.discountPercent ?? 0) > 0 && membership.discountExpiresAt && new Date(membership.discountExpiresAt).getTime() > Date.now() && (
                    <div className="p-2.5 bg-success/10 border border-success/20 rounded-xl text-xs text-success">
                      Active: {membership.discountPercent}% off until {new Date(membership.discountExpiresAt).toLocaleString()}
                    </div>
                  )}
                </Card>
              )}

              {/* Locked features */}
              {membership.enabled && !membership.fullLock && (
                <Card className="p-5 space-y-3">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Shield className="w-4 h-4 text-accent" /> Lockable Features
                  </h2>
                  <p className="text-xs text-text-secondary">Non-members see a paywall on these features.</p>
                  {LOCKABLE_FEATURE_OPTIONS.map(({ id, label, desc }) => (
                    <div key={id} className="flex items-center justify-between py-1">
                      <div>
                        <p className="text-sm font-medium text-white">{label}</p>
                        <p className="text-xs text-text-secondary">{desc}</p>
                      </div>
                      <button
                        onClick={() => toggleLockedFeature(id)}
                        className={`w-11 h-6 rounded-full transition-colors relative ${(membership.lockedFeatures ?? []).includes(id) ? 'bg-accent' : 'bg-surface-elevated'}`}
                      >
                        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${(membership.lockedFeatures ?? []).includes(id) ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>
                  ))}
                </Card>
              )}

              <Button onClick={handleSaveMembership} loading={savingMembership} fullWidth>
                Save Membership Settings
              </Button>

              {/* ── Membership Plans (instant self-serve tiers) ── */}
              {membership.enabled && (
              <Card className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-accent" /> Membership Plans
                  </h2>
                  <Button size="sm" onClick={() => {
                    setEditingMembershipPlan(null);
                    setMembershipPlanForm({ name: '', description: '', priceMonthly: '', price3mo: '', price6mo: '', price12mo: '', currency: 'USD', features: '', active: true, featureAccess: [] });
                    setShowMembershipPlanForm(true);
                  }}>
                    <Plus className="w-3.5 h-3.5" /> New Plan
                  </Button>
                </div>
                <p className="text-xs text-text-secondary">
                  Create as many pricing tiers as you want — users pick one and pay instantly. Each plan controls its own price and which tools it unlocks (Tool Access below). Leave Tool Access unchecked to grant every feature.
                </p>

                {showMembershipPlanForm && !editingMembershipPlan && (
                  <div className="bg-surface-elevated rounded-2xl p-4 space-y-3 border border-accent/30">
                    {renderMembershipPlanForm()}
                  </div>
                )}

                {membershipPlans.length === 0 && !showMembershipPlanForm ? (
                  <p className="text-text-tertiary text-sm text-center py-3">No membership plans yet. Create one above.</p>
                ) : (
                  <div className="space-y-3">
                    {membershipPlans.map((plan) => (
                      editingMembershipPlan?.id === plan.id && showMembershipPlanForm ? (
                        <div key={plan.id} className="bg-surface-elevated rounded-2xl p-4 space-y-3 border border-accent/30">
                          {renderMembershipPlanForm()}
                        </div>
                      ) : (
                      <div key={plan.id} className={`p-4 rounded-2xl border ${plan.active ? 'border-accent/20 bg-accent/5' : 'border-white/8 opacity-60'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-white">{plan.name}</p>
                              {plan.active ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Inactive</Badge>}
                            </div>
                            <p className="text-sm font-black text-accent mt-0.5">
                              {[
                                plan.priceMonthly ? `1mo: ${plan.currency} ${plan.priceMonthly.toFixed(2)}` : null,
                                plan.price3mo ? `3mo: ${plan.currency} ${plan.price3mo.toFixed(2)}` : null,
                                plan.price6mo ? `6mo: ${plan.currency} ${plan.price6mo.toFixed(2)}` : null,
                                plan.price12mo ? `12mo: ${plan.currency} ${plan.price12mo.toFixed(2)}` : null,
                              ].filter(Boolean).join(' · ') || 'No price set'}
                            </p>
                            {plan.description && <p className="text-xs text-text-secondary mt-1">{plan.description}</p>}
                            {plan.features.length > 0 && (
                              <ul className="mt-2 space-y-0.5">
                                {plan.features.map((f, i) => (
                                  <li key={i} className="text-xs text-text-secondary flex items-center gap-1.5">
                                    <CheckCircle className="w-3 h-3 text-accent flex-shrink-0" />{f}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {(plan.featureAccess?.length ?? 0) > 0 && (
                              <p className="text-[10px] text-accent mt-2">🔒 Restricted to: {plan.featureAccess.join(', ')}</p>
                            )}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => startEditMembershipPlan(plan)} className="p-2.5 rounded-lg hover:bg-white/5 text-text-secondary hover:text-white transition-colors">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteMembershipPlan(plan)} className="p-2.5 rounded-lg hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                      )
                    ))}
                  </div>
                )}
              </Card>
              )}

              {/* ── Coaching Plans ── */}
              <Card className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-accent" /> Coaching Plans <span className="text-xs font-normal text-text-tertiary">(1:1 application)</span>
                  </h2>
                  <Button size="sm" onClick={() => {
                    setEditingPlan(null);
                    setPlanForm({ name: '', description: '', priceMonthly: '', currency: 'USD', features: '', active: true, featureAccess: [] });
                    setShowPlanForm(true);
                  }}>
                    <Plus className="w-3.5 h-3.5" /> New Plan
                  </Button>
                </div>
                <p className="text-xs text-text-secondary">Separate from Membership Plans above — these are reviewed manually via a coaching application, not purchased instantly. Coaching programs (marked 1:1) are unlocked by any active plan.</p>

                {showPlanForm && !editingPlan && (
                  <div className="bg-surface-elevated rounded-2xl p-4 space-y-3 border border-accent/30">
                    {renderCoachingPlanForm()}
                  </div>
                )}

                {coachingPlans.length === 0 && !showPlanForm ? (
                  <p className="text-text-tertiary text-sm text-center py-3">No coaching plans yet. Create one above.</p>
                ) : (
                  <div className="space-y-3">
                    {coachingPlans.map((plan) => (
                      editingPlan?.id === plan.id && showPlanForm ? (
                        <div key={plan.id} className="bg-surface-elevated rounded-2xl p-4 space-y-3 border border-accent/30">
                          {renderCoachingPlanForm()}
                        </div>
                      ) : (
                      <div key={plan.id} className={`p-4 rounded-2xl border ${plan.active ? 'border-accent/20 bg-accent/5' : 'border-white/8 opacity-60'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-white">{plan.name}</p>
                              {plan.active ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Inactive</Badge>}
                            </div>
                            <p className="text-sm font-black text-accent mt-0.5">{plan.currency} {plan.priceMonthly.toFixed(2)}/mo</p>
                            {plan.description && <p className="text-xs text-text-secondary mt-1">{plan.description}</p>}
                            {plan.features.length > 0 && (
                              <ul className="mt-2 space-y-0.5">
                                {plan.features.map((f, i) => (
                                  <li key={i} className="text-xs text-text-secondary flex items-center gap-1.5">
                                    <CheckCircle className="w-3 h-3 text-accent flex-shrink-0" />{f}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => startEditPlan(plan)} className="p-2.5 rounded-lg hover:bg-white/5 text-text-secondary hover:text-white transition-colors">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeletePlan(plan)} className="p-2.5 rounded-lg hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                      )
                    ))}
                  </div>
                )}
              </Card>

              {/* Client membership management */}
              <Card className="p-5 space-y-3">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-accent" /> Client Access
                </h2>
                <p className="text-xs text-text-secondary">Manually grant membership and assign coaching plans to each client.</p>
                {clients.length === 0 ? (
                  <p className="text-text-tertiary text-sm text-center py-4">No clients yet.</p>
                ) : clients.map((u) => {
                  const mem = (u as UserData & { membership?: { status?: string; planId?: string; planName?: string } }).membership;
                  const isMember = mem?.status === 'active';
                  const currentPlanId = mem?.planId;
                  const currentPlanName = mem?.planName;
                  return (
                    <div key={u.id} className="py-2 border-t border-white/5 first:border-0 first:pt-0 space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent-muted flex items-center justify-center text-accent text-xs font-bold flex-shrink-0">
                          {u.displayName?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{u.displayName || 'Unknown'}</p>
                          <p className="text-xs text-text-secondary truncate">{u.email}</p>
                          {currentPlanName && <p className="text-xs text-accent mt-0.5">📋 {currentPlanName}</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isMember ? <Badge variant="success">Member</Badge> : <Badge variant="muted">Free</Badge>}
                          {membership.enabled && (
                            <button
                              onClick={() => handleToggleMember(u)}
                              disabled={togglingMember === u.id}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                isMember
                                  ? 'bg-danger/10 text-danger hover:bg-danger/20'
                                  : 'bg-accent-muted text-accent hover:bg-accent/20'
                              }`}
                            >
                              {togglingMember === u.id ? '…' : isMember ? 'Revoke' : 'Grant'}
                            </button>
                          )}
                        </div>
                      </div>
                      {(membershipPlans.filter(p => p.active).length > 0 || coachingPlans.filter(p => p.active).length > 0) && (
                        <div className="flex items-center gap-2 pl-11">
                          <select
                            className="flex-1 bg-surface border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-accent/50"
                            defaultValue=""
                            onChange={async (e) => {
                              const pid = e.target.value;
                              if (!pid) return;
                              const plan = membershipPlans.find(p => p.id === pid) ?? coachingPlans.find(p => p.id === pid);
                              if (plan) await handleAssignPlan(u, plan.id, plan.name);
                              e.target.value = '';
                            }}
                          >
                            <option value="">Assign plan…</option>
                            {membershipPlans.filter(p => p.active).length > 0 && (
                              <optgroup label="Membership Plans">
                                {membershipPlans.filter(p => p.active).map(p => {
                                  const period = getPlanBillingPeriods(p)[0];
                                  return (
                                    <option key={p.id} value={p.id}>
                                      {p.name}{period ? ` — ${p.currency} ${period.price}${period.months === 1 ? '/mo' : ` / ${period.months}mo`}` : ''}
                                    </option>
                                  );
                                })}
                              </optgroup>
                            )}
                            {coachingPlans.filter(p => p.active).length > 0 && (
                              <optgroup label="Coaching Plans">
                                {coachingPlans.filter(p => p.active).map(p => (
                                  <option key={p.id} value={p.id}>{p.name} — {p.currency} {p.priceMonthly}/mo</option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                          {currentPlanId && (
                            <button
                              onClick={() => handleRevokePlan(u)}
                              disabled={assigningPlan === u.id}
                              className="px-2 py-1.5 rounded-lg text-xs text-danger hover:bg-danger/10 transition-colors whitespace-nowrap"
                            >
                              {assigningPlan === u.id ? '…' : 'Remove plan'}
                            </button>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2 pl-11">
                        <Badge variant={u.role === 'trainer' ? 'accent' : 'muted'}>{u.role === 'trainer' ? 'Trainer' : 'User'}</Badge>
                        {u.id !== user?.uid && (
                          <button
                            onClick={() => handleSetRole(u, u.role === 'trainer' ? 'user' : 'trainer')}
                            disabled={changingRole === u.id}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface border border-white/10 text-text-secondary hover:text-white hover:border-white/20 transition-colors whitespace-nowrap"
                          >
                            {changingRole === u.id ? '…' : u.role === 'trainer' ? 'Demote to User' : 'Make Trainer'}
                          </button>
                        )}
                        {u.role !== 'trainer' && trainers.length > 0 && (
                          <select
                            className="flex-1 bg-surface border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-accent/50"
                            value={u.trainerId || ''}
                            disabled={assigningTrainer === u.id}
                            onChange={(e) => handleAssignTrainer(u, e.target.value)}
                          >
                            <option value="">No trainer assigned</option>
                            {trainers.map((t) => (
                              <option key={t.id} value={t.id}>{t.displayName || t.email}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </Card>
            </>
          )}
        </div>
      )}

      {/* ── Coaching Applications ─────────────────────────────────────────────── */}
      {tab === 'coaching' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-white">1:1 Coaching Applications</h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Review intake forms, then approve or reject. Approved clients get a notification with a pay button; rejected clients get a notification too.
            </p>
          </div>

          {loadingApplications ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          ) : coachingApplications.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-text-secondary">No applications yet.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {coachingApplications.map((app) => (
                <Card key={app.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-white">{app.userName}</p>
                      <p className="text-xs text-text-secondary">{app.userEmail}</p>
                      <p className="text-xs text-accent mt-0.5">{app.planName}</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full whitespace-nowrap ${
                      app.status === 'pending' ? 'bg-yellow-400/10 text-yellow-400'
                      : app.status === 'approved' ? 'bg-success/10 text-success'
                      : 'bg-danger/10 text-danger'
                    }`}>
                      {app.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div><span className="text-text-tertiary">Weight:</span> <span className="text-white">{app.currentWeight || '—'}</span></div>
                    <div><span className="text-text-tertiary">Availability:</span> <span className="text-white">{app.availability || '—'}</span></div>
                    <div className="col-span-2"><span className="text-text-tertiary">Goals:</span> <span className="text-white">{app.goals || '—'}</span></div>
                    <div className="col-span-2"><span className="text-text-tertiary">Experience:</span> <span className="text-white">{app.experience || '—'}</span></div>
                    {app.injuries && (
                      <div className="col-span-2"><span className="text-text-tertiary">Injuries:</span> <span className="text-white">{app.injuries}</span></div>
                    )}
                    {app.status === 'rejected' && app.rejectionReason && (
                      <div className="col-span-2"><span className="text-text-tertiary">Rejection reason:</span> <span className="text-danger">{app.rejectionReason}</span></div>
                    )}
                  </div>

                  {app.status === 'pending' && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        fullWidth
                        onClick={() => handleApproveApplication(app)}
                        loading={reviewingApp === app.id}
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        fullWidth
                        onClick={() => { setRejectingApp(app); setRejectReason(''); }}
                        disabled={reviewingApp === app.id}
                      >
                        Reject
                      </Button>
                    </div>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    fullWidth
                    onClick={() => startConversation({ id: app.userId, displayName: app.userName, email: app.userEmail })}
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Message {app.userName}
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reject application modal */}
      <Modal open={!!rejectingApp} onClose={() => setRejectingApp(null)} title={`Reject ${rejectingApp?.userName ?? ''}'s Application`}>
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary">Reason (optional, shown to the user)</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Currently at full 1:1 capacity, please re-apply next month"
              rows={3}
              style={{ backgroundColor: 'var(--surface-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--foreground)' }}
              className="w-full border rounded-xl px-4 py-3 text-sm placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40 transition-all resize-none"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={() => setRejectingApp(null)}>Cancel</Button>
            <Button fullWidth loading={reviewingApp === rejectingApp?.id} onClick={handleRejectApplication}>Confirm Reject</Button>
          </div>
        </div>
      </Modal>

      {/* ── Exercise Library ──────────────────────────────────────────────────── */}
      {tab === 'library' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-white">Exercise Library</h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Bulk-upload by category — names are parsed from filenames automatically. The AI matches these to generated programs.
            </p>
          </div>

          {/* ── Bulk Upload Panel ─────────────────────────────────────────────── */}
          <Card className="p-4 space-y-4 border border-accent/20">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-bold text-white">Bulk Upload</h3>
            </div>

            {/* Category + Equipment selectors */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block">Muscle Group / Category</label>
                <select
                  value={bulkCategory}
                  onChange={e => setBulkCategory(e.target.value)}
                  className="w-full bg-surface-elevated border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50"
                >
                  {muscleCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block">Equipment</label>
                <select
                  value={bulkEquipment}
                  onChange={e => setBulkEquipment(e.target.value)}
                  className="w-full bg-surface-elevated border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50"
                >
                  {equipmentOptions.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>

            {/* Drop zone */}
            <div
              ref={bulkDropRef}
              onDragOver={e => { e.preventDefault(); bulkDropRef.current?.classList.add('border-accent'); }}
              onDragLeave={() => bulkDropRef.current?.classList.remove('border-accent')}
              onDrop={e => {
                e.preventDefault();
                bulkDropRef.current?.classList.remove('border-accent');
                handleBulkFilePick(e.dataTransfer.files);
              }}
              className="border-2 border-dashed border-white/15 rounded-xl p-6 text-center cursor-pointer hover:border-accent/40 transition-colors"
              onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'video/*'; inp.multiple = true; inp.onchange = (e) => handleBulkFilePick((e.target as HTMLInputElement).files); inp.click(); }}
            >
              <Upload className="w-6 h-6 text-text-tertiary mx-auto mb-2" />
              <p className="text-sm text-text-secondary">Drop video files here or <span className="text-accent">browse</span></p>
              <p className="text-xs text-text-tertiary mt-1">MP4 · MOV · WebM — select multiple at once</p>
              <p className="text-xs text-text-tertiary">Names are auto-parsed from filenames</p>
            </div>

            {/* Staging list */}
            {bulkFiles.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-text-secondary font-medium">{bulkFiles.length} file{bulkFiles.length !== 1 ? 's' : ''} staged</p>
                  <button onClick={() => setBulkFiles([])} className="text-xs text-red-400 hover:underline" disabled={bulkUploading}>Clear all</button>
                </div>
                {bulkFiles.map(item => (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-3 space-y-2 ${
                      item.status === 'done' ? 'border-success/30 bg-success/5' :
                      item.status === 'error' ? 'border-red-500/30 bg-red-500/5' :
                      item.status === 'uploading' ? 'border-accent/30 bg-accent/5' :
                      'border-white/8 bg-surface-elevated'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Video className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <input
                          className="w-full bg-transparent text-sm text-white font-medium border-b border-transparent hover:border-white/20 focus:border-accent/50 focus:outline-none pb-0.5"
                          value={item.name}
                          onChange={e => updateBulkFile(item.id, { name: e.target.value })}
                          disabled={item.status !== 'pending'}
                          placeholder="Exercise name"
                        />
                        <input
                          className="w-full bg-transparent text-xs text-text-secondary border-b border-transparent hover:border-white/20 focus:border-accent/50 focus:outline-none pb-0.5 mt-0.5"
                          value={item.aliases}
                          onChange={e => updateBulkFile(item.id, { aliases: e.target.value })}
                          disabled={item.status !== 'pending'}
                          placeholder="Aliases (optional, comma-separated)"
                        />
                      </div>
                      {item.status === 'pending' && (
                        <button onClick={() => removeBulkFile(item.id)} className="p-1 text-text-tertiary hover:text-red-400 flex-shrink-0">
                          <XIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {item.status === 'done' && <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />}
                      {item.status === 'error' && <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                    </div>
                    {item.status === 'uploading' && (
                      <div className="w-full bg-white/10 rounded-full h-1">
                        <div
                          className="bg-accent h-1 rounded-full transition-all"
                          style={{ width: `${bulkProgress[item.id] ?? 0}%` }}
                        />
                      </div>
                    )}
                    {item.status === 'error' && item.errorMsg && (
                      <p className="text-xs text-red-400">{item.errorMsg}</p>
                    )}
                  </div>
                ))}

                <Button
                  fullWidth
                  onClick={handleBulkUpload}
                  loading={bulkUploading}
                  disabled={bulkUploading || bulkFiles.every(f => f.status !== 'pending')}
                >
                  <Upload className="w-4 h-4" />
                  {bulkUploading
                    ? `Uploading ${bulkFiles.filter(f => f.status === 'done').length} of ${bulkFiles.filter(f => f.status !== 'error').length}…`
                    : `Upload ${bulkFiles.filter(f => f.status === 'pending').length} exercise${bulkFiles.filter(f => f.status === 'pending').length !== 1 ? 's' : ''} as ${bulkCategory}`
                  }
                </Button>
              </div>
            )}
          </Card>

          {/* ── Single add / edit form ────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-text-secondary">Library ({exerciseLibrary.length})</p>
            <div className="flex items-center gap-2">
              {exerciseLibrary.some(e => !e.thumbnailUrl) && (
                <Button size="sm" variant="ghost" onClick={() => handleBackfillThumbnails(false)} loading={backfillRunning}>
                  {backfillRunning
                    ? `Generating ${backfillProgress.done}/${backfillProgress.total}…`
                    : `Backfill Thumbnails (${exerciseLibrary.filter(e => !e.thumbnailUrl).length})`}
                </Button>
              )}
              {exerciseLibrary.some(e => e.videoUrl) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { if (confirm('Regenerate thumbnails for every video in the library? This replaces existing ones too.')) handleBackfillThumbnails(true); }}
                  loading={backfillRunning}
                  title="Re-captures a frame for every video, including ones that already have a thumbnail — fixes bad/black captures"
                >
                  {backfillRunning
                    ? `Generating ${backfillProgress.done}/${backfillProgress.total}…`
                    : 'Regenerate All Thumbnails'}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => startEditEx()}>
                <Plus className="w-4 h-4" /> Add Single
              </Button>
            </div>
          </div>

          {showExForm && !editingEx && (
            <div className="p-4 space-y-3 rounded-2xl bg-surface border border-accent/30">
              {renderExerciseForm()}
            </div>
          )}

          {exerciseLibrary.length > 0 && (
            <>
              <div className="relative">
                <Search className="w-4 h-4 text-text-tertiary absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  value={exSearchQuery}
                  onChange={e => setExSearchQuery(e.target.value)}
                  placeholder="Search exercises by name or alias…"
                  className="w-full bg-surface border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
                />
              </div>

              {/* Category chips — counts make miscategorized exercises visible at
                  a glance (a "Cardio" chip with 40 when only 5 belong there is
                  exactly the signal a messy library needs to get curated). */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                <button
                  onClick={() => setExCategoryFilter(null)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex-shrink-0 ${
                    exCategoryFilter === null ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary hover:text-white'
                  }`}
                >
                  All ({exerciseLibrary.length})
                </button>
                {muscleCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setExCategoryFilter(exCategoryFilter === cat ? null : cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex-shrink-0 ${
                      exCategoryFilter === cat ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary hover:text-white'
                    }`}
                  >
                    {cat} ({exCategoryCounts[cat]})
                  </button>
                ))}
                {uncategorizedCount > 0 && (
                  <button
                    onClick={() => setExCategoryFilter(exCategoryFilter === '__uncategorized__' ? null : '__uncategorized__')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex-shrink-0 ${
                      exCategoryFilter === '__uncategorized__' ? 'bg-accent text-black' : 'bg-danger/10 text-danger hover:bg-danger/20'
                    }`}
                  >
                    Uncategorized ({uncategorizedCount})
                  </button>
                )}
              </div>

              <button
                onClick={() => setShowCategoryManager(v => !v)}
                className="text-xs text-accent hover:underline flex items-center gap-1"
              >
                {showCategoryManager ? 'Hide' : 'Manage'} categories &amp; equipment
              </button>

              {showCategoryManager && (
                <Card className="p-4 space-y-4 border border-accent/20">
                  {([
                    ['muscleGroups', 'Muscle Group Categories', muscleCategories, newCategoryInput, setNewCategoryInput] as const,
                    ['equipment', 'Equipment Types', equipmentOptions, newEquipmentInput, setNewEquipmentInput] as const,
                  ]).map(([kind, label, list, inputValue, setInputValue]) => (
                    <div key={kind}>
                      <p className="text-xs font-bold text-text-secondary uppercase tracking-wide mb-2">{label}</p>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {list.map(item => (
                          <span key={item} className="pl-3 pr-1.5 py-1.5 rounded-lg text-xs font-bold bg-surface-elevated text-white flex items-center gap-1.5">
                            {item}
                            <button
                              onClick={() => removeCategory(kind, item)}
                              disabled={savingTaxonomy}
                              className="p-0.5 rounded hover:bg-danger/20 hover:text-danger transition-colors disabled:opacity-50"
                              title={`Remove ${item}`}
                            >
                              <XIcon className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        {list.length === 0 && <p className="text-xs text-text-tertiary">None yet.</p>}
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={inputValue}
                          onChange={e => setInputValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') addCategory(kind, inputValue); }}
                          placeholder={`Add a new ${kind === 'muscleGroups' ? 'category' : 'equipment type'}…`}
                          className="flex-1 bg-surface border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
                        />
                        <Button size="sm" onClick={() => addCategory(kind, inputValue)} loading={savingTaxonomy} disabled={!inputValue.trim()}>
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </Card>
              )}
            </>
          )}

          {/* ── Library list ─────────────────────────────────────────────────── */}
          {previewVideo && (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setPreviewVideo(null)}>
              <div className="relative w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <button className="absolute -top-8 right-0 text-white" onClick={() => setPreviewVideo(null)}><XIcon className="w-5 h-5" /></button>
                <video src={previewVideo} controls autoPlay crossOrigin="anonymous" className="w-full rounded-xl" />
              </div>
            </div>
          )}

          {libraryLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : exerciseLibrary.length === 0 ? (
            <Card className="p-8 text-center">
              <Video className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
              <p className="text-text-secondary text-sm">No exercises yet.</p>
              <p className="text-text-tertiary text-xs mt-1">Use bulk upload above to get started.</p>
            </Card>
          ) : filteredExerciseLibrary.length === 0 ? (
            <Card className="p-8 text-center">
              <Search className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
              <p className="text-text-secondary text-sm">
                No exercises
                {exSearchQuery ? ` match "${exSearchQuery}"` : ''}
                {exCategoryFilter === '__uncategorized__' ? ' are uncategorized' : exCategoryFilter ? ` in ${exCategoryFilter}` : ''}.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredExerciseLibrary.map(ex => (
                editingEx?.id === ex.id && showExForm ? (
                  <div key={ex.id} className="p-4 space-y-3 rounded-2xl bg-surface border border-accent/30">
                    {renderExerciseForm()}
                  </div>
                ) : (
                  <Card key={ex.id} className="p-3 flex items-center gap-3">
                    <button
                      onClick={() => setPreviewVideo(ex.videoUrl)}
                      className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 relative overflow-hidden transition-colors ${ex.thumbnailUrl ? 'bg-black' : 'bg-white/10 hover:bg-accent/20'}`}
                    >
                      {ex.thumbnailUrl && (
                        <img src={ex.thumbnailUrl} alt={ex.name} className="absolute inset-0 w-full h-full object-cover" />
                      )}
                      <Play className={`w-5 h-5 relative z-10 ${ex.thumbnailUrl ? 'text-white' : 'text-accent'}`} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{ex.name}</p>
                      <p className="text-xs text-text-secondary truncate">
                        {[...ex.muscleGroups, ...ex.equipment].join(' · ')}
                      </p>
                      {ex.aliases.length > 0 && (
                        <p className="text-xs text-text-tertiary truncate">Also: {ex.aliases.join(', ')}</p>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => startEditEx(ex)} className="p-2.5 rounded-lg hover:bg-white/10 transition-colors">
                        <Edit2 className="w-4 h-4 text-text-secondary" />
                      </button>
                      <button onClick={() => handleDeleteEx(ex.id)} className="p-2.5 rounded-lg hover:bg-red-500/20 transition-colors">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </Card>
                )
              ))}
            </div>
          )}

          <Card className="p-4 border border-white/5">
            <div className="flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-white">AI Auto-Matching</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  When you generate a program with AI, exercises are automatically matched to your library by name and aliases.
                  Matched exercises will have a demo video attached that clients can watch during their workout.
                </p>
                <p className="text-xs text-text-tertiary mt-2">
                  Tip: the exercise name in the library should match what the AI would name it. Add short aliases (e.g. &quot;side bend&quot;) to catch variations.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Analytics — real visitor data from Cloudflare's edge ────────────── */}
      {tab === 'analytics' && (
        <div className="space-y-5">
          <Card className="p-4 border border-blue-400/20 bg-blue-400/5">
            <p className="text-xs text-text-secondary">
              Pulled directly from Cloudflare, which sits in front of every request to your site — this counts real
              server-side traffic, not client-side JavaScript that ad-blockers or privacy tools can suppress. Requires
              a Cloudflare API token + Zone ID set in <span className="text-white font-medium">Integrations</span>.
            </p>
          </Card>

          {/* Range picker */}
          <div className="flex gap-1.5 flex-wrap">
            {([
              ['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', '7 Days'],
              ['14d', '14 Days'], ['30d', '30 Days'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => { setAnalyticsRange(value); loadAnalytics(value); }}
                disabled={analyticsLoading}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${
                  analyticsRange === value ? 'bg-accent text-black border-accent' : 'bg-surface-elevated text-text-secondary border-white/10 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {analyticsLoading ? (
            <div className="grid grid-cols-2 gap-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
          ) : analyticsError ? (
            <Card className="p-6 text-center">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
              <p className="text-sm text-white font-bold">Couldn&apos;t load analytics</p>
              <p className="text-xs text-text-secondary mt-1">{analyticsError}</p>
              <Button size="sm" variant="ghost" className="mt-3" onClick={() => loadAnalytics()}>
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </Button>
            </Card>
          ) : analytics ? (
            <>
              <p className="text-xs text-text-tertiary">
                {analyticsRange === 'today' ? 'Today' : analyticsRange === 'yesterday' ? 'Yesterday' : `Last ${analytics.rangeDays} days`}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-4">
                  <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Unique Visits</p>
                  <p className="text-2xl font-black text-white mt-1">{analytics.totals.uniques.toLocaleString()}</p>
                  <p className="text-[10px] text-text-tertiary mt-0.5">summed across days — a returning visitor counts once per day</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Page Views</p>
                  <p className="text-2xl font-black text-white mt-1">{analytics.totals.pageViews.toLocaleString()}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Total Requests</p>
                  <p className="text-2xl font-black text-white mt-1">{analytics.totals.requests.toLocaleString()}</p>
                  <p className="text-[10px] text-text-tertiary mt-0.5">includes images, scripts, API calls, etc.</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Threats Blocked</p>
                  <p className="text-2xl font-black text-white mt-1">{analytics.totals.threats.toLocaleString()}</p>
                </Card>
              </div>

              {analytics.daily.length > 0 && (
                <Card className="p-4">
                  <p className="text-xs font-bold text-white mb-3">Daily Page Views</p>
                  <div className="flex items-end gap-1 h-32">
                    {analytics.daily.map((d) => {
                      const max = Math.max(...analytics.daily.map(x => x.pageViews), 1);
                      const pct = Math.max(2, Math.round((d.pageViews / max) * 100));
                      return (
                        <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                          {/* bg-accent/70 (Tailwind's opacity-modifier syntax) silently
                              renders nothing here — --accent is a raw hex CSS variable,
                              not the R-G-B triplet format that modifier needs to combine
                              with an alpha value. Using the `opacity` utility instead
                              works with any color format. */}
                          <div className="w-full bg-accent opacity-70 group-hover:opacity-100 rounded-t transition-opacity" style={{ height: `${pct}%` }} />
                          <div className="absolute -top-8 hidden group-hover:block bg-black text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                            {d.date}: {d.pageViews.toLocaleString()} views
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] text-text-tertiary">
                    <span>{analytics.daily[0]?.date}</span>
                    <span>{analytics.daily[analytics.daily.length - 1]?.date}</span>
                  </div>
                </Card>
              )}
            </>
          ) : (
            <Card className="p-10 text-center">
              <TrendingUp className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
              <p className="text-white font-bold">No analytics yet</p>
              <p className="text-text-secondary text-sm mt-1">Set up a Cloudflare API token and Zone ID in Integrations to see visitor data here.</p>
            </Card>
          )}
        </div>
      )}

      {/* ── Integrations / API Keys ──────────────────────────────────────────── */}
      {tab === 'integrations' && (
        <div className="space-y-5">
          <Card className="p-4 border border-blue-400/20 bg-blue-400/5">
            <div className="flex items-start gap-3">
              <Shield className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-white">Keys are encrypted before storage</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  Every key you save here is encrypted (AES-256-GCM) using a master key that lives only on the server —
                  never in this database. Even a full data leak would expose only unreadable ciphertext.
                </p>
              </div>
            </div>
          </Card>

          {/* Storage provider toggle */}
          <Card className="p-5 space-y-3">
            <h2 className="text-base font-bold text-white">Video Storage Provider</h2>
            <p className="text-xs text-text-secondary">
              Choose where exercise video uploads go. Cloudflare R2 has no egress fees — recommended once configured below.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleSaveStorageProvider('firebase')}
                disabled={savingProvider}
                className={`flex-1 p-3 rounded-xl border text-sm font-medium transition-colors ${
                  storageProvider === 'firebase' ? 'border-accent bg-accent/10 text-white' : 'border-white/10 text-text-secondary hover:bg-white/5'
                }`}
              >
                Firebase Storage
              </button>
              <button
                onClick={() => handleSaveStorageProvider('r2')}
                disabled={savingProvider}
                className={`flex-1 p-3 rounded-xl border text-sm font-medium transition-colors ${
                  storageProvider === 'r2' ? 'border-accent bg-accent/10 text-white' : 'border-white/10 text-text-secondary hover:bg-white/5'
                }`}
              >
                Cloudflare R2 <span className="text-success text-xs">(no egress fees)</span>
              </button>
            </div>
          </Card>

          {secretsLoading ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : (
            SECRET_GROUPS.map((group) => {
              const result = testResults[group.service];
              return (
                <Card key={group.service} className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-white">{group.title}</h2>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={testingService === group.service}
                      onClick={() => handleTestService(group.service)}
                    >
                      Test Connection
                    </Button>
                  </div>

                  {result && (
                    <div className={`text-xs p-2 rounded-lg ${result.ok ? 'bg-success/10 text-success' : 'bg-red-500/10 text-red-400'}`}>
                      {result.ok ? '✓ ' : '✗ '}{result.message}
                    </div>
                  )}

                  {group.keys.length === 0 ? (
                    <p className="text-xs text-text-tertiary">Uses your existing Firebase project — no extra keys needed.</p>
                  ) : (
                    <div className="space-y-3">
                      {group.keys.map(({ key, label, placeholder }) => {
                        const status = secretStatuses.find(s => s.key === key);
                        return (
                          <div key={key} className="p-3 bg-surface-elevated rounded-xl border border-white/5">
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="text-xs font-medium text-white">{label}</label>
                              {status?.configured ? (
                                <Badge variant={status.source === 'firestore' ? 'success' : 'info'}>
                                  {status.source === 'firestore' ? `Saved · ${status.masked}` : `Env var · ${status.masked}`}
                                </Badge>
                              ) : (
                                <Badge variant="muted">Not configured</Badge>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Input
                                type="password"
                                value={secretInputs[key] ?? ''}
                                onChange={e => setSecretInputs(prev => ({ ...prev, [key]: e.target.value }))}
                                placeholder={placeholder || 'Paste new value to replace'}
                              />
                              <Button
                                size="sm"
                                loading={savingSecret === key}
                                disabled={!secretInputs[key]?.trim()}
                                onClick={() => handleSaveSecret(key)}
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ── Leads ─────────────────────────────────────────────────────────────── */}
      {tab === 'leads' && (
        <div className="space-y-5">
          {/* Trainer demo-request leads */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-accent" /> Trainer Leads
              </h2>
              {trainerLeads.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => downloadCsv(
                    'trainer-leads.csv',
                    ['Name', 'Email', 'Phone', 'Business', 'Client Count', 'Message', 'Status', 'Date'],
                    trainerLeads.map((l) => [l.name, l.email, l.phone ?? '', l.businessName ?? '', l.clientCount ?? '', l.message ?? '', l.status, leadDate(l)]),
                  )}
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </Button>
              )}
            </div>
            <p className="text-xs text-text-secondary">Demo requests submitted from the /trainers page, newest first.</p>
            {loadingLeads ? (
              <p className="text-xs text-text-tertiary">Loading…</p>
            ) : trainerLeads.length === 0 ? (
              <p className="text-xs text-text-tertiary">No demo requests yet.</p>
            ) : (
              <div className="space-y-2">
                {trainerLeads.map((lead) => (
                  <div key={lead.id} className="border border-white/10 rounded-xl p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{lead.name} {lead.businessName ? `· ${lead.businessName}` : ''}</p>
                      <p className="text-xs text-text-secondary truncate">{lead.email} {lead.phone ? `· ${lead.phone}` : ''} {lead.clientCount ? `· ${lead.clientCount} clients` : ''}</p>
                      {lead.message && <p className="text-xs text-text-tertiary mt-1">{lead.message}</p>}
                    </div>
                    <select
                      className="bg-surface-elevated border border-border rounded-lg px-2 py-1 text-xs text-white flex-shrink-0"
                      value={lead.status}
                      onChange={(e) => {
                        const status = e.target.value as TrainerLead['status'];
                        setTrainerLeads(ls => ls.map(l => l.id === lead.id ? { ...l, status } : l));
                        updateTrainerLeadStatus(lead.id, status).catch(() => toast.error('Failed to update status'));
                      }}
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Exit-intent email captures from the consumer landing page */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-accent" /> Landing Page Leads
              </h2>
              {landingLeads.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => downloadCsv(
                    'landing-page-leads.csv',
                    ['Email', 'Date'],
                    landingLeads.map((l) => [l.email, leadDate(l)]),
                  )}
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </Button>
              )}
            </div>
            <p className="text-xs text-text-secondary">
              Emails captured by the exit-intent popup on the main landing page before someone left without converting, newest first. Export as CSV to import into Brevo (or any other list).
            </p>
            {loadingLandingLeads ? (
              <p className="text-xs text-text-tertiary">Loading…</p>
            ) : landingLeads.length === 0 ? (
              <p className="text-xs text-text-tertiary">No captures yet.</p>
            ) : (
              <div className="rounded-xl border border-white/10 divide-y divide-white/5 overflow-hidden">
                {landingLeads.map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span className="text-sm font-medium text-white truncate">{lead.email}</span>
                    <span className="text-xs text-text-tertiary flex-shrink-0">{leadDate(lead)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Settings ──────────────────────────────────────────────────────────── */}
      {tab === 'settings' && (
        <div className="space-y-5">
          <Card className="p-5 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Settings className="w-4 h-4 text-accent" /> App Configuration
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">App Name</label>
                <Input value={settingsForm.appName} onChange={e => setSettingsForm(s => ({ ...s, appName: e.target.value }))} placeholder="Warfare Fitness" />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Trainer Name</label>
                <Input value={settingsForm.trainerName} onChange={e => setSettingsForm(s => ({ ...s, trainerName: e.target.value }))} placeholder="Your name" />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Trainer Email</label>
                <Input value={settingsForm.trainerEmail} onChange={e => setSettingsForm(s => ({ ...s, trainerEmail: e.target.value }))} placeholder="you@example.com" />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">OpenAI Model</label>
                <Input value={settingsForm.openaiModel} onChange={e => setSettingsForm(s => ({ ...s, openaiModel: e.target.value }))} placeholder="gpt-4o-mini" />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Video Greeting URL</label>
                <Input value={settingsForm.videoGreetingUrl} onChange={e => setSettingsForm(s => ({ ...s, videoGreetingUrl: e.target.value }))} placeholder="https://… (YouTube link, or an MP4 / hosted video URL)" />
                <p className="text-xs text-text-tertiary mt-1">Plays automatically after a new user completes onboarding. YouTube links and direct video files both work. Leave blank to skip.</p>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Logo / Brand Image</label>
                <p className="text-xs text-text-tertiary mb-2">Replaces the default &quot;W&quot; icon in the header and throughout the app. Square image recommended.</p>
                <div className="flex items-center gap-3">
                  {settingsForm.logoUrl && (
                    <img src={settingsForm.logoUrl} alt="Logo preview" className="w-12 h-12 rounded-xl object-cover border border-white/10 flex-shrink-0" />
                  )}
                  <label className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                    <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-elevated border border-white/10 text-sm text-white hover:border-accent/40 cursor-pointer transition-colors">
                      <Upload className="w-4 h-4" /> {uploadingLogo ? 'Uploading…' : settingsForm.logoUrl ? 'Change Logo' : 'Upload Logo'}
                    </span>
                  </label>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">PWA Install Banner</p>
                  <p className="text-xs text-text-secondary mt-0.5">Show &ldquo;Add to Home Screen&rdquo; prompt to users. Snoozed for 30 days after dismissal.</p>
                </div>
                <button
                  onClick={() => setSettingsForm(s => ({ ...s, pwaInstallBannerEnabled: !s.pwaInstallBannerEnabled }))}
                  className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${settingsForm.pwaInstallBannerEnabled ? 'bg-accent' : 'bg-surface-elevated'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${settingsForm.pwaInstallBannerEnabled ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Barcode Scans / Day</label>
                  <input
                    type="number"
                    min="1"
                    value={settingsForm.barcodeScanDailyLimit}
                    onChange={e => setSettingsForm(s => ({ ...s, barcodeScanDailyLimit: parseInt(e.target.value) || 20 }))}
                    className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Food Analyses / Day</label>
                  <input
                    type="number"
                    min="1"
                    value={settingsForm.foodAnalysisDailyLimit}
                    onChange={e => setSettingsForm(s => ({ ...s, foodAnalysisDailyLimit: parseInt(e.target.value) || 20 }))}
                    className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Meal Ideas / Day</label>
                  <input
                    type="number"
                    min="1"
                    value={settingsForm.mealIdeasDailyLimit}
                    onChange={e => setSettingsForm(s => ({ ...s, mealIdeasDailyLimit: parseInt(e.target.value) || 15 }))}
                    className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
                  />
                </div>
              </div>
              <p className="text-xs text-text-tertiary -mt-2">Per-user daily caps to prevent abuse of paid API usage (OpenAI, OpenFoodFacts).</p>
            </div>
            <Button onClick={handleSaveSettings} loading={savingSettings} fullWidth>Save Configuration</Button>
          </Card>

          {/* Backups */}
          <Card className="p-5 space-y-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-accent" /> Backups
            </h2>
            <p className="text-xs text-text-secondary">
              Exports every collection (users, workouts, meals, messages, PR posts, progress photos, and more) to a single JSON file.
              {' '}Uploaded to Cloudflare R2 if configured under Integrations — otherwise saved locally on this server, which protects against a bad deploy or an accidental deletion, but <strong className="text-white">not</strong> against losing the server itself. Configure R2 for real off-server disaster recovery.
            </p>
            <Button onClick={handleRunBackup} loading={runningBackup} variant="secondary" fullWidth>
              <Download className="w-4 h-4" /> Run Backup Now
            </Button>
            {lastBackupResult && (
              <p className="text-xs text-text-tertiary">
                Last backup: {lastBackupResult.collections} collections, {(lastBackupResult.sizeBytes / 1024).toFixed(0)}KB → {lastBackupResult.location}
              </p>
            )}
            <p className="text-[11px] text-text-tertiary">
              To automate daily backups, add a cron job on the server: <code className="bg-surface px-1 py-0.5 rounded">curl -X POST https://yourdomain.com/api/admin/backup -H &quot;Authorization: Bearer $CRON_SECRET&quot;</code>
            </p>
          </Card>

          {/* Landing Page */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Rocket className="w-4 h-4 text-accent" /> Landing Page
              </h2>
              <a href="/" target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">Preview ↗</a>
            </div>
            <p className="text-xs text-text-secondary">
              Customize your public homepage — this stays exactly as you set it across every app update, since it&apos;s stored here, not in code. Use <code className="bg-black/30 px-1 rounded">{'{appName}'}</code> in the subheadline to insert your app name automatically.
            </p>

            <div>
              <label className="text-xs text-text-secondary mb-1 block">Hero Background Image (optional)</label>
              <p className="text-[11px] text-text-tertiary mb-2">Shows behind the headline, blended into the dark background. Best results: a tall portrait-orientation photo with the subject roughly centered — it gets cropped differently on mobile vs desktop.</p>
              <div className="flex items-center gap-3">
                {landingForm.heroImageUrl && (
                  <img src={landingForm.heroImageUrl} alt="Hero preview" className="w-16 h-20 rounded-xl object-cover border border-white/10 flex-shrink-0" />
                )}
                <div className="flex flex-col gap-1.5">
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-white/10 text-xs font-bold text-white cursor-pointer hover:border-accent/40 transition-colors">
                    <input type="file" accept="image/*" className="hidden" onChange={handleHeroImageUpload} disabled={uploadingHeroImage} />
                    <Upload className="w-4 h-4" /> {uploadingHeroImage ? 'Uploading…' : landingForm.heroImageUrl ? 'Change Image' : 'Upload Image'}
                  </label>
                  {landingForm.heroImageUrl && (
                    <button
                      type="button"
                      onClick={() => setLandingForm(f => ({ ...f, heroImageUrl: '' }))}
                      className="text-[11px] text-danger hover:underline text-left"
                    >
                      Remove image
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Demo Video (optional)</label>
              <p className="text-[11px] text-text-tertiary mb-2">A short walkthrough of the app. Adds a "Watch Demo" link near the hero CTA that opens it in a lightbox — visitors who want proof before signing up can see the product working without leaving the page.</p>
              <div className="flex items-center gap-3">
                {landingForm.heroDemoVideoUrl && (
                  <video src={landingForm.heroDemoVideoUrl} className="w-24 h-16 rounded-xl object-cover border border-white/10 flex-shrink-0 bg-black" muted crossOrigin="anonymous" />
                )}
                <div className="flex flex-col gap-1.5">
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-white/10 text-xs font-bold text-white cursor-pointer hover:border-accent/40 transition-colors">
                    <input type="file" accept="video/*" className="hidden" onChange={handleDemoVideoUpload} disabled={uploadingDemoVideo} />
                    <Upload className="w-4 h-4" /> {uploadingDemoVideo ? 'Uploading…' : landingForm.heroDemoVideoUrl ? 'Change Video' : 'Upload Video'}
                  </label>
                  {landingForm.heroDemoVideoUrl && (
                    <button
                      type="button"
                      onClick={() => setLandingForm(f => ({ ...f, heroDemoVideoUrl: '' }))}
                      className="text-[11px] text-danger hover:underline text-left"
                    >
                      Remove video
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">App Screenshots (optional)</label>
              <p className="text-[11px] text-text-tertiary mb-2">Real in-app screenshots shown in a &quot;See It In Action&quot; gallery on the landing page. Upload several at once — order here is the order they appear.</p>
              {landingForm.screenshotUrls && landingForm.screenshotUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {landingForm.screenshotUrls.map((url, i) => (
                    <div key={url + i} className="relative flex-shrink-0">
                      <img src={url} alt={`Screenshot ${i + 1}`} className="w-16 h-32 rounded-xl object-cover border border-white/10" />
                      <button
                        type="button"
                        onClick={() => setLandingForm(f => ({ ...f, screenshotUrls: (f.screenshotUrls ?? []).filter((_, idx) => idx !== i) }))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger rounded-full flex items-center justify-center"
                        aria-label={`Remove screenshot ${i + 1}`}
                      >
                        <XIcon className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-white/10 text-xs font-bold text-white cursor-pointer hover:border-accent/40 transition-colors">
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleScreenshotsUpload} disabled={uploadingScreenshots} />
                <Upload className="w-4 h-4" /> {uploadingScreenshots ? 'Uploading…' : 'Add Screenshots'}
              </label>
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-1 block">Member Transformation Photos (optional)</label>
              <p className="text-[11px] text-text-tertiary mb-2">
                Real member photos only — this section stays hidden on the landing page until at least one is added here. Visual proof converts far better than copy alone in this niche, so it&apos;s worth adding as soon as you have any real ones.
              </p>
              {landingForm.transformationPhotos && landingForm.transformationPhotos.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-2">
                  {landingForm.transformationPhotos.map((p, i) => (
                    <div key={p.imageUrl + i} className="relative bg-surface-elevated rounded-xl p-2 space-y-2">
                      <div className="relative">
                        <img src={p.imageUrl} alt={`Transformation ${i + 1}`} className="w-full aspect-[3/4] rounded-lg object-cover border border-white/10" />
                        <button
                          type="button"
                          onClick={() => removeTransformationPhoto(i)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger rounded-full flex items-center justify-center"
                          aria-label={`Remove transformation photo ${i + 1}`}
                        >
                          <XIcon className="w-3 h-3 text-white" />
                        </button>
                      </div>
                      <Input
                        value={p.caption ?? ''}
                        onChange={e => updateTransformationPhoto(i, { caption: e.target.value })}
                        placeholder="Caption (optional)"
                        className="text-xs"
                      />
                    </div>
                  ))}
                </div>
              )}
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-white/10 text-xs font-bold text-white cursor-pointer hover:border-accent/40 transition-colors">
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleTransformationPhotosUpload} disabled={uploadingTransformationPhotos} />
                <Upload className="w-4 h-4" /> {uploadingTransformationPhotos ? 'Uploading…' : 'Add Photos'}
              </label>
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Badge Text (above headline)</label>
              <Input value={landingForm.badgeText} onChange={e => setLandingForm(f => ({ ...f, badgeText: e.target.value }))} placeholder="Your coach. Your plan. Your results." />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Headline — Line 1</label>
                <Input value={landingForm.headlineLine1} onChange={e => setLandingForm(f => ({ ...f, headlineLine1: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Headline — Line 2 (accent color)</label>
                <Input value={landingForm.headlineLine2} onChange={e => setLandingForm(f => ({ ...f, headlineLine2: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Subheadline</label>
              <textarea
                value={landingForm.subheadline}
                onChange={e => setLandingForm(f => ({ ...f, subheadline: e.target.value }))}
                rows={3}
                className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Primary Button Label</label>
                <Input value={landingForm.ctaPrimaryLabel} onChange={e => setLandingForm(f => ({ ...f, ctaPrimaryLabel: e.target.value }))} placeholder="Get Started" />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Secondary Button Label</label>
                <Input value={landingForm.ctaSecondaryLabel} onChange={e => setLandingForm(f => ({ ...f, ctaSecondaryLabel: e.target.value }))} placeholder="Sign In" />
              </div>
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-2 block">Feature Highlights</label>
              <div className="space-y-2">
                {landingForm.features.map((f, i) => (
                  <div key={i} className="p-3 bg-surface-elevated rounded-xl space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={f.title}
                        onChange={e => updateLandingFeature(i, { title: e.target.value })}
                        placeholder={`Feature ${i + 1} title`}
                        className="flex-1"
                      />
                      <Button variant="ghost" size="sm" onClick={() => removeLandingFeature(i)}>
                        Remove
                      </Button>
                    </div>
                    <textarea
                      value={f.desc}
                      onChange={e => updateLandingFeature(i, { desc: e.target.value })}
                      rows={2}
                      placeholder="One-sentence benefit"
                      className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none"
                    />
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={addLandingFeature}>
                  + Add Feature
                </Button>
              </div>
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-2 block">Social Proof Line Items</label>
              <div className="space-y-2">
                {landingForm.socialProof.map((line, i) => (
                  <Input key={i} value={line} onChange={e => updateSocialProof(i, e.target.value)} placeholder={`Line ${i + 1}`} />
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-2 block">Motivational Quote</label>
              <div className="space-y-2">
                <textarea
                  value={landingForm.quoteText}
                  onChange={e => setLandingForm(f => ({ ...f, quoteText: e.target.value }))}
                  rows={2}
                  placeholder="The only bad workout is the one that didn't happen."
                  className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none"
                />
                <Input
                  value={landingForm.quoteAuthor}
                  onChange={e => setLandingForm(f => ({ ...f, quoteAuthor: e.target.value }))}
                  placeholder="Attribution (optional, e.g. a name or leave generic)"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-text-secondary block">Testimonials</label>
                <button onClick={addTestimonial} className="flex items-center gap-1 text-xs text-accent font-medium">
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
              <p className="text-xs text-text-tertiary mb-2">
                Real quotes only — this section stays hidden on the landing page until at least one is added here.
              </p>
              <div className="space-y-2">
                {(landingForm.testimonials ?? []).map((t, i) => (
                  <div key={i} className="p-3 bg-surface-elevated rounded-xl space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={t.name}
                        onChange={e => updateTestimonial(i, { name: e.target.value })}
                        placeholder="Member name"
                        className="flex-1"
                      />
                      <button onClick={() => removeTestimonial(i)} className="p-2 text-text-tertiary hover:text-danger transition-colors flex-shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <textarea
                      value={t.quote}
                      onChange={e => updateTestimonial(i, { quote: e.target.value })}
                      rows={2}
                      placeholder="What they actually said"
                      className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-3 p-3 bg-surface border border-white/10 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={landingForm.showPublicLeaderboard !== false}
                onChange={e => setLandingForm(f => ({ ...f, showPublicLeaderboard: e.target.checked }))}
                className="w-4 h-4 accent-accent"
              />
              <div>
                <p className="text-sm font-medium text-white">Show public leaderboard</p>
                <p className="text-xs text-text-tertiary">Displays top athletes (name, level, streak — no email or private data) to logged-out visitors as social proof.</p>
              </div>
            </label>

            <div>
              <label className="text-xs text-text-secondary mb-1 block">Programs to show on landing page</label>
              <Input
                type="number"
                min="0"
                value={landingForm.programsToShow || ''}
                onChange={e => setLandingForm(f => ({ ...f, programsToShow: parseInt(e.target.value, 10) || 0 }))}
                placeholder="0 = show all"
              />
              <p className="text-xs text-text-tertiary mt-1">Limits the Programs section to this many cards. Leave at 0 to show every published program.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Final CTA Headline</label>
                <Input value={landingForm.finalCtaHeadline} onChange={e => setLandingForm(f => ({ ...f, finalCtaHeadline: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Final CTA Subtext</label>
                <Input value={landingForm.finalCtaSubtext} onChange={e => setLandingForm(f => ({ ...f, finalCtaSubtext: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleResetLanding}>Reset to Default</Button>
              <Button onClick={handleSaveLanding} loading={savingLanding} fullWidth>Save Landing Page</Button>
            </div>
          </Card>

          {/* B2B (/trainers) Landing Page */}
          <Card className="p-5 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Rocket className="w-4 h-4 text-accent" /> B2B Landing Page (/trainers)
            </h2>
            <p className="text-xs text-text-secondary">
              A separate landing page pitching the white-label offer to trainers/gym owners — linked from the main site's nav as &quot;For Trainers&quot;.
            </p>

            <div>
              <label className="text-xs text-text-secondary mb-1 block">Hero Image</label>
              <div className="flex items-center gap-3">
                {b2bForm.heroImageUrl && (
                  <img src={b2bForm.heroImageUrl} alt="Hero preview" className="w-16 h-20 rounded-xl object-cover border border-white/10 flex-shrink-0" />
                )}
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-elevated border border-border text-xs font-medium text-white cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={handleB2bHeroImageUpload} disabled={uploadingB2bHero} />
                  <Upload className="w-4 h-4" /> {uploadingB2bHero ? 'Uploading…' : b2bForm.heroImageUrl ? 'Change Image' : 'Upload Image'}
                </label>
                {b2bForm.heroImageUrl && (
                  <button onClick={() => setB2bForm(f => ({ ...f, heroImageUrl: '' }))} className="text-xs text-danger">Remove</button>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-1 block">Hero Demo Video (optional — shown as a "Watch Demo" player instead of the static image)</label>
              <div className="flex items-center gap-3">
                {b2bForm.heroDemoVideoUrl && (
                  <video src={b2bForm.heroDemoVideoUrl} className="w-24 h-16 rounded-xl object-cover border border-white/10 flex-shrink-0 bg-black" muted crossOrigin="anonymous" />
                )}
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-elevated border border-border text-xs font-medium text-white cursor-pointer">
                  <input type="file" accept="video/*" className="hidden" onChange={handleB2bVideoUpload} disabled={uploadingB2bVideo} />
                  <Upload className="w-4 h-4" /> {uploadingB2bVideo ? 'Uploading…' : b2bForm.heroDemoVideoUrl ? 'Change Video' : 'Upload Video'}
                </label>
                {b2bForm.heroDemoVideoUrl && (
                  <button onClick={() => setB2bForm(f => ({ ...f, heroDemoVideoUrl: '' }))} className="text-xs text-danger">Remove</button>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-1 block">Badge Text</label>
              <Input value={b2bForm.badgeText} onChange={e => setB2bForm(f => ({ ...f, badgeText: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Headline (line 1)</label>
                <Input value={b2bForm.headlineLine1} onChange={e => setB2bForm(f => ({ ...f, headlineLine1: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Headline (line 2, accent color)</label>
                <Input value={b2bForm.headlineLine2} onChange={e => setB2bForm(f => ({ ...f, headlineLine2: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Subheadline</label>
              <textarea
                className="w-full bg-surface-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm text-white resize-none"
                rows={2}
                value={b2bForm.subheadline}
                onChange={e => setB2bForm(f => ({ ...f, subheadline: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">CTA Button Label</label>
              <Input value={b2bForm.ctaPrimaryLabel} onChange={e => setB2bForm(f => ({ ...f, ctaPrimaryLabel: e.target.value }))} placeholder="Book a Demo" />
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-2 block">Reasons to Choose Us</label>
              <div className="space-y-2">
                {b2bForm.reasons.map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Input
                        value={r.title}
                        onChange={e => setB2bForm(f => ({ ...f, reasons: f.reasons.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x) }))}
                        placeholder="Title"
                      />
                      <Input
                        value={r.desc}
                        onChange={e => setB2bForm(f => ({ ...f, reasons: f.reasons.map((x, idx) => idx === i ? { ...x, desc: e.target.value } : x) }))}
                        placeholder="Description"
                      />
                    </div>
                    <button onClick={() => setB2bForm(f => ({ ...f, reasons: f.reasons.filter((_, idx) => idx !== i) }))} className="text-danger self-start mt-2">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setB2bForm(f => ({ ...f, reasons: [...f.reasons, { title: '', desc: '' }] }))}>
                  <Plus className="w-3.5 h-3.5" /> Add Reason
                </Button>
              </div>
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-1 block">PWA Section Headline</label>
              <Input value={b2bForm.pwaHeadline} onChange={e => setB2bForm(f => ({ ...f, pwaHeadline: e.target.value }))} placeholder="This isn't a website. It's a real app." />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">PWA Section Subheadline</label>
              <textarea
                className="w-full bg-surface-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm text-white resize-none"
                rows={2}
                value={b2bForm.pwaSubheadline}
                onChange={e => setB2bForm(f => ({ ...f, pwaSubheadline: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-2 block">App Store vs Our PWA Comparison</label>
              <div className="space-y-2">
                {b2bForm.pwaPoints.map((row, i) => (
                  <div key={i} className="flex gap-2">
                    <div className="flex-1 grid grid-cols-3 gap-1.5">
                      <Input value={row.label} onChange={e => setB2bForm(f => ({ ...f, pwaPoints: f.pwaPoints.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x) }))} placeholder="Row label" />
                      <Input value={row.native} onChange={e => setB2bForm(f => ({ ...f, pwaPoints: f.pwaPoints.map((x, idx) => idx === i ? { ...x, native: e.target.value } : x) }))} placeholder="App Store / Play Store" />
                      <Input value={row.pwa} onChange={e => setB2bForm(f => ({ ...f, pwaPoints: f.pwaPoints.map((x, idx) => idx === i ? { ...x, pwa: e.target.value } : x) }))} placeholder="Our PWA" />
                    </div>
                    <button onClick={() => setB2bForm(f => ({ ...f, pwaPoints: f.pwaPoints.filter((_, idx) => idx !== i) }))} className="text-danger self-start mt-2">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setB2bForm(f => ({ ...f, pwaPoints: [...f.pwaPoints, { label: '', native: '', pwa: '' }] }))}>
                  <Plus className="w-3.5 h-3.5" /> Add Row
                </Button>
              </div>
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-1 block">Comparison Section Headline</label>
              <Input value={b2bForm.comparisonHeadline} onChange={e => setB2bForm(f => ({ ...f, comparisonHeadline: e.target.value }))} placeholder="What this actually replaces" />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-2 block">Build-It-Yourself vs Buy-It Comparison</label>
              <div className="space-y-2">
                {b2bForm.comparisonPoints.map((row, i) => (
                  <div key={i} className="flex gap-2">
                    <div className="flex-1 grid grid-cols-3 gap-1.5">
                      <Input value={row.label} onChange={e => setB2bForm(f => ({ ...f, comparisonPoints: f.comparisonPoints.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x) }))} placeholder="Row label" />
                      <Input value={row.diy} onChange={e => setB2bForm(f => ({ ...f, comparisonPoints: f.comparisonPoints.map((x, idx) => idx === i ? { ...x, diy: e.target.value } : x) }))} placeholder="DIY" />
                      <Input value={row.us} onChange={e => setB2bForm(f => ({ ...f, comparisonPoints: f.comparisonPoints.map((x, idx) => idx === i ? { ...x, us: e.target.value } : x) }))} placeholder="Us" />
                    </div>
                    <button onClick={() => setB2bForm(f => ({ ...f, comparisonPoints: f.comparisonPoints.filter((_, idx) => idx !== i) }))} className="text-danger self-start mt-2">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setB2bForm(f => ({ ...f, comparisonPoints: [...f.comparisonPoints, { label: '', diy: '', us: '' }] }))}>
                  <Plus className="w-3.5 h-3.5" /> Add Row
                </Button>
              </div>
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-2 block">Pricing Tiers</label>
              <div className="space-y-3">
                {b2bForm.pricingTiers.map((tier, i) => (
                  <div key={i} className="border border-white/10 rounded-xl p-3 space-y-2">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Input value={tier.name} onChange={e => setB2bForm(f => ({ ...f, pricingTiers: f.pricingTiers.map((t, idx) => idx === i ? { ...t, name: e.target.value } : t) }))} placeholder="Name" />
                      <Input value={tier.price} onChange={e => setB2bForm(f => ({ ...f, pricingTiers: f.pricingTiers.map((t, idx) => idx === i ? { ...t, price: e.target.value } : t) }))} placeholder="Price (or Custom)" />
                      <Input value={tier.period} onChange={e => setB2bForm(f => ({ ...f, pricingTiers: f.pricingTiers.map((t, idx) => idx === i ? { ...t, period: e.target.value } : t) }))} placeholder="/month" />
                      <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                        <input type="checkbox" checked={!!tier.highlighted} onChange={e => setB2bForm(f => ({ ...f, pricingTiers: f.pricingTiers.map((t, idx) => idx === i ? { ...t, highlighted: e.target.checked } : t) }))} />
                        Highlighted
                      </label>
                    </div>
                    <Input value={tier.description} onChange={e => setB2bForm(f => ({ ...f, pricingTiers: f.pricingTiers.map((t, idx) => idx === i ? { ...t, description: e.target.value } : t) }))} placeholder="Description" />
                    <Input
                      value={tier.features.join(', ')}
                      onChange={e => setB2bForm(f => ({ ...f, pricingTiers: f.pricingTiers.map((t, idx) => idx === i ? { ...t, features: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } : t) }))}
                      placeholder="Features, comma-separated"
                    />
                    <button onClick={() => setB2bForm(f => ({ ...f, pricingTiers: f.pricingTiers.filter((_, idx) => idx !== i) }))} className="text-xs text-danger">Remove Tier</button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setB2bForm(f => ({ ...f, pricingTiers: [...f.pricingTiers, { name: '', price: '', period: '/month', description: '', features: [] }] }))}>
                  <Plus className="w-3.5 h-3.5" /> Add Tier
                </Button>
              </div>
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-1 block">Guarantee Text (shown under the price)</label>
              <Input value={b2bForm.guaranteeText ?? ''} onChange={e => setB2bForm(f => ({ ...f, guaranteeText: e.target.value }))} />
            </div>

            <div>
              <label className="text-xs text-text-secondary mb-2 block">FAQ</label>
              <div className="space-y-2">
                {b2bForm.faqs.map((item, i) => (
                  <div key={i} className="flex gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Input value={item.q} onChange={e => setB2bForm(f => ({ ...f, faqs: f.faqs.map((x, idx) => idx === i ? { ...x, q: e.target.value } : x) }))} placeholder="Question" />
                      <textarea
                        className="w-full bg-surface-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm text-white resize-none"
                        rows={2}
                        value={item.a}
                        onChange={e => setB2bForm(f => ({ ...f, faqs: f.faqs.map((x, idx) => idx === i ? { ...x, a: e.target.value } : x) }))}
                        placeholder="Answer"
                      />
                    </div>
                    <button onClick={() => setB2bForm(f => ({ ...f, faqs: f.faqs.filter((_, idx) => idx !== i) }))} className="text-danger self-start mt-2">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setB2bForm(f => ({ ...f, faqs: [...f.faqs, { q: '', a: '' }] }))}>
                  <Plus className="w-3.5 h-3.5" /> Add FAQ
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Final CTA Headline</label>
                <Input value={b2bForm.finalCtaHeadline} onChange={e => setB2bForm(f => ({ ...f, finalCtaHeadline: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Final CTA Subtext</label>
                <Input value={b2bForm.finalCtaSubtext} onChange={e => setB2bForm(f => ({ ...f, finalCtaSubtext: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setB2bForm(DEFAULT_B2B_LANDING_CONFIG)}>Reset to Default</Button>
              <Button onClick={handleSaveB2b} loading={savingB2b} fullWidth>Save B2B Landing Page</Button>
            </div>
          </Card>

          {/* Legal Pages */}
          <Card className="p-5 space-y-4">
            <h2 className="text-base font-bold text-white">Legal Pages</h2>
            <p className="text-xs text-text-secondary">
              Edit your Privacy Policy, Terms & Conditions, and B2B Terms (the separate agreement for the white-label trainer offer). Use blank lines between paragraphs and start a line with <code className="bg-black/30 px-1 rounded">## </code> for a section heading.
            </p>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Privacy Policy</label>
              <textarea
                value={legalForm.privacyPolicyText}
                onChange={e => setLegalForm(s => ({ ...s, privacyPolicyText: e.target.value }))}
                rows={8}
                className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs font-mono placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-y"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Terms & Conditions</label>
              <textarea
                value={legalForm.termsText}
                onChange={e => setLegalForm(s => ({ ...s, termsText: e.target.value }))}
                rows={8}
                className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs font-mono placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-y"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">B2B Terms & Conditions (shown at /b2b-terms, linked from the /trainers page)</label>
              <textarea
                value={legalForm.b2bTermsText}
                onChange={e => setLegalForm(s => ({ ...s, b2bTermsText: e.target.value }))}
                rows={8}
                className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs font-mono placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-y"
              />
            </div>
            <Button onClick={handleSaveLegal} loading={savingLegal} fullWidth>Save Legal Pages</Button>
          </Card>

          {/* Stripe Configuration */}
          <Card className="p-5 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-green-400" /> Stripe Payment Processor
            </h2>
            <p className="text-xs text-text-secondary">Configure Stripe to accept membership payments from your clients.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Stripe Publishable Key <span className="text-text-tertiary">(pk_live_… or pk_test_…)</span></label>
                <Input
                  value={settingsForm.stripePublishableKey}
                  onChange={e => setSettingsForm(s => ({ ...s, stripePublishableKey: e.target.value }))}
                  placeholder="pk_live_…"
                />
                <p className="text-xs text-text-tertiary mt-1">Safe to store — this is the public key only.</p>
              </div>
              <div className="p-3 bg-surface-elevated rounded-xl border border-yellow-400/20">
                <div className="flex items-center gap-2 mb-1">
                  <Key className="w-4 h-4 text-yellow-400" />
                  <p className="text-sm font-medium text-white">STRIPE_SECRET_KEY</p>
                  <Badge variant="muted">Env var only</Badge>
                </div>
                <p className="text-xs text-text-tertiary">The Stripe secret key is managed in the <button className="text-accent underline" onClick={() => setTab('integrations')}>Integrations</button> tab, not here.</p>
              </div>
            </div>
            <Button onClick={handleSaveSettings} loading={savingSettings} fullWidth>Save Stripe Config</Button>
            <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-accent hover:underline">
              <ExternalLink className="w-3.5 h-3.5" /> Stripe API Keys Dashboard
            </a>
          </Card>

          <Card className="p-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-yellow-400" /> API Keys & Storage
              </h2>
              <p className="text-xs text-text-secondary mt-1">OpenAI, Stripe, R2, and push notification keys are managed in one place now.</p>
            </div>
            <Button size="sm" onClick={() => setTab('integrations')}>Open Integrations</Button>
          </Card>
        </div>
      )}

      {/* ── Client Profile & Health Info Modal ───────────────────────────────── */}
      <Modal
        open={!!profileDetailUser}
        onClose={() => setProfileDetailUser(null)}
        title={profileDetailUser?.displayName || profileDetailUser?.email || 'Client Profile'}
      >
        {profileDetailUser && (
          <div className="space-y-4">
            <Card className="p-4 space-y-2">
              <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wide">Onboarding</h3>
              <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                <span className="text-text-tertiary">Goal</span><span className="text-white">{profileDetailUser.fitnessGoal || '—'}</span>
                <span className="text-text-tertiary">Experience</span><span className="text-white">{profileDetailUser.experience || '—'}</span>
                <span className="text-text-tertiary">Training Days</span><span className="text-white">{profileDetailUser.trainingDays ?? '—'}</span>
                <span className="text-text-tertiary">Equipment</span><span className="text-white">{profileDetailUser.equipment || '—'}</span>
                <span className="text-text-tertiary">Sex</span><span className="text-white">{profileDetailUser.sex || '—'}</span>
                <span className="text-text-tertiary">Age</span><span className="text-white">{profileDetailUser.age ?? '—'}</span>
                <span className="text-text-tertiary">Height</span><span className="text-white">{profileDetailUser.heightCm ? `${profileDetailUser.heightCm} cm` : '—'}</span>
                <span className="text-text-tertiary">Weight</span><span className="text-white">{profileDetailUser.currentWeightKg ? `${profileDetailUser.currentWeightKg} kg` : '—'}</span>
              </div>
              {profileDetailUser.limitations && (
                <div className="pt-1.5 border-t border-white/5">
                  <p className="text-text-tertiary text-xs mb-0.5">Limitations</p>
                  <p className="text-white text-xs">{profileDetailUser.limitations}</p>
                </div>
              )}
            </Card>

            <Card className="p-4 space-y-3">
              <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wide">Training Activity</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 bg-surface-elevated rounded-xl">
                  <p className="text-sm font-bold text-white">{profileDetailUser.powerLevel ?? 0}</p>
                  <p className="text-[10px] text-text-tertiary">Power Level</p>
                </div>
                <div className="p-2.5 bg-surface-elevated rounded-xl">
                  <p className="text-sm font-bold text-white">{profileDetailUser.statsCache?.streak ?? 0}d</p>
                  <p className="text-[10px] text-text-tertiary">Streak</p>
                </div>
                <div className="p-2.5 bg-surface-elevated rounded-xl">
                  <p className="text-sm font-bold text-white">{profileDetailUser.statsCache?.totalWorkouts ?? profileDetailUser.stats?.totalWorkouts ?? 0}</p>
                  <p className="text-[10px] text-text-tertiary">Total Workouts</p>
                </div>
              </div>
              {profileDetailWorkouts.length === 0 ? (
                <p className="text-xs text-text-tertiary">No workouts logged yet.</p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wide">Recent Sessions</p>
                  {profileDetailWorkouts.map((w) => {
                    const ts = w.completedAt as { toDate?: () => Date } | null;
                    const d = ts?.toDate?.();
                    return (
                      <div key={w.id} className="flex items-center justify-between text-xs px-3 py-2 bg-surface-elevated rounded-lg">
                        <span className="text-white">{w.duration ? `${w.duration} min` : 'Session'} · {Array.isArray(w.exercises) ? w.exercises.length : 0} exercises</span>
                        <span className="text-text-tertiary">{d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {profileDetailUser.medicalHistory ? (
              <Card className="p-4 space-y-2">
                <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wide">Health Screening</h3>
                {(() => {
                  const m = profileDetailUser.medicalHistory;
                  const rows: { label: string; value?: boolean; detail?: string }[] = [
                    { label: 'Practices sports/exercise', value: m.practicesSports, detail: m.sportsDetail },
                    { label: 'Movement/coordination disorders', value: m.movementDisorders, detail: m.movementDisordersDetail },
                    { label: 'Previous surgeries', value: m.previousSurgeries, detail: m.previousSurgeriesDetail },
                    { label: 'Sports injuries', value: m.sportsInjuries, detail: m.sportsInjuriesDetail },
                    { label: 'Musculoskeletal problems', value: m.musculoskeletalProblems, detail: m.musculoskeletalProblemsDetail },
                    { label: 'Heart disease', value: m.heartDisease, detail: m.heartDiseaseDetail },
                    { label: 'Other medical conditions', value: m.otherMedicalConditions, detail: m.otherMedicalConditionsDetail },
                    { label: 'Smokes', value: m.smokes },
                    { label: 'Drinks alcohol regularly', value: m.drinksAlcoholRegularly, detail: m.alcoholFrequency },
                    { label: 'Suffers from stress', value: m.suffersFromStress },
                    { label: 'Sleeping pills/sedatives', value: m.takesSleepingPills },
                    { label: 'Pain medication', value: m.takesPainMedication },
                    { label: 'Beta blockers', value: m.takesBetaBlockers },
                    { label: 'Eats fatty/sweet foods often', value: m.eatsFattyOrSweetFoodsOften },
                    { label: 'Experiences food cravings', value: m.experiencesFoodCravings },
                  ].filter((r) => r.value !== undefined);
                  return (
                    <>
                      {(m.bodyFatPercent || m.bloodPressure || m.restingHeartRate || m.dailyFluidIntake) && (
                        <div className="grid grid-cols-2 gap-y-1.5 text-xs pb-2 border-b border-white/5">
                          {m.bodyFatPercent && (<><span className="text-text-tertiary">Body Fat</span><span className="text-white">{m.bodyFatPercent}%</span></>)}
                          {m.bloodPressure && (<><span className="text-text-tertiary">Blood Pressure</span><span className="text-white">{m.bloodPressure}</span></>)}
                          {m.restingHeartRate && (<><span className="text-text-tertiary">Resting HR</span><span className="text-white">{m.restingHeartRate} bpm</span></>)}
                          {m.dailyFluidIntake && (<><span className="text-text-tertiary">Fluid Intake</span><span className="text-white">{m.dailyFluidIntake}</span></>)}
                        </div>
                      )}
                      {rows.length === 0 ? (
                        <p className="text-xs text-text-tertiary">No screening answers recorded.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {rows.map((r) => (
                            <div key={r.label} className="flex items-start justify-between gap-2 text-xs">
                              <span className="text-text-secondary">{r.label}</span>
                              <span className={`font-medium flex-shrink-0 ${r.value ? 'text-yellow-400' : 'text-text-tertiary'}`}>
                                {r.value ? (r.detail ? r.detail : 'Yes') : 'No'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </Card>
            ) : (
              <Card className="p-4">
                <p className="text-xs text-text-tertiary">No health screening submitted (onboarding predates this feature, or was skipped).</p>
              </Card>
            )}

            <Card className="p-4 space-y-2">
              <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wide">Body Progress Photos</h3>
              {profileDetailPhotos.length === 0 ? (
                <p className="text-xs text-text-tertiary">No progress photos uploaded yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {profileDetailPhotos.map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p.id} src={p.photoUrl} alt="Progress" className="w-full aspect-square object-cover rounded-lg" />
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </Modal>

      {/* ── AI Nutrition Plan Modal ──────────────────────────────────────────── */}
      <Modal
        open={!!nutritionModalUser}
        onClose={() => { setNutritionModalUser(null); setNutritionDraft(null); }}
        title={`Nutrition Plan — ${nutritionModalUser?.displayName || nutritionModalUser?.email || ''}`}
      >
        <div className="space-y-4">
          {!nutritionDraft ? (
            <>
              <p className="text-sm text-text-secondary">
                AI will generate a plan based on this client&apos;s onboarding profile (goal, experience, sex, age, height, weight, limitations).
              </p>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Additional instructions (optional)</label>
                <textarea
                  value={nutritionTrainerNotes}
                  onChange={(e) => setNutritionTrainerNotes(e.target.value)}
                  placeholder="e.g. vegetarian, 5 meals/day, avoid dairy…"
                  rows={3}
                  className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none"
                />
              </div>
              <Button fullWidth onClick={handleGenerateNutrition} loading={generatingNutrition}>
                <Wand2 className="w-4 h-4" /> Generate with AI
              </Button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2">
                {(['calories', 'protein', 'carbs', 'fat'] as const).map((key) => (
                  <div key={key}>
                    <label className="text-[10px] text-text-tertiary uppercase block mb-1">{key}</label>
                    <input
                      type="number"
                      value={nutritionDraft[key]}
                      onChange={(e) => setNutritionDraft(prev => prev ? { ...prev, [key]: Number(e.target.value) } : prev)}
                      className="w-full bg-surface border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto">
                {nutritionDraft.meals.map((meal, i) => (
                  <div key={i} className="p-3 bg-surface-elevated rounded-xl border border-white/5">
                    <input
                      value={meal.name}
                      onChange={(e) => setNutritionDraft(prev => {
                        if (!prev) return prev;
                        const meals = [...prev.meals];
                        meals[i] = { ...meals[i], name: e.target.value };
                        return { ...prev, meals };
                      })}
                      className="w-full bg-transparent text-sm font-bold text-white mb-2 focus:outline-none"
                    />
                    <textarea
                      value={meal.items.join('\n')}
                      onChange={(e) => setNutritionDraft(prev => {
                        if (!prev) return prev;
                        const meals = [...prev.meals];
                        meals[i] = { ...meals[i], items: e.target.value.split('\n').filter(Boolean) };
                        return { ...prev, meals };
                      })}
                      rows={3}
                      className="w-full bg-surface border border-white/10 rounded-lg px-2 py-1.5 text-xs text-text-secondary focus:outline-none focus:border-accent/50 resize-none"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="text-xs text-text-secondary mb-1 block">Coach notes</label>
                <textarea
                  value={nutritionDraft.coachNotes ?? ''}
                  onChange={(e) => setNutritionDraft(prev => prev ? { ...prev, coachNotes: e.target.value } : prev)}
                  rows={2}
                  className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm resize-none focus:outline-none focus:border-accent/50"
                />
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" onClick={handleGenerateNutrition} loading={generatingNutrition}>
                  <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                </Button>
                <Button fullWidth onClick={handleAssignNutrition} loading={assigningNutrition}>
                  Assign to Client
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── Client Goal Modal ────────────────────────────────────────────────── */}
      <Modal
        open={!!goalModalUser}
        onClose={() => setGoalModalUser(null)}
        title={`Goals — ${goalModalUser?.displayName || goalModalUser?.email || ''}`}
      >
        <div className="space-y-4">
          <div className="bg-surface-elevated rounded-2xl p-4 space-y-3 border border-accent/30">
            <p className="text-sm font-bold text-white">New Goal</p>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Title</label>
              <input
                value={goalForm.title}
                onChange={e => setGoalForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Bench press 100kg"
                className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Notes (optional)</label>
              <textarea
                value={goalForm.description}
                onChange={e => setGoalForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Any context or instructions for the client…"
                rows={2}
                className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Category</label>
              <select
                value={goalForm.category}
                onChange={e => setGoalForm(f => ({ ...f, category: e.target.value as GoalCategory }))}
                className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
              >
                <option value="strength">Strength</option>
                <option value="weight">Weight</option>
                <option value="workouts">Workouts</option>
                <option value="nutrition">Nutrition</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Target</label>
                <input
                  type="number" step="any"
                  value={goalForm.targetValue}
                  onChange={e => setGoalForm(f => ({ ...f, targetValue: e.target.value }))}
                  placeholder="100"
                  className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Starting</label>
                <input
                  type="number" step="any"
                  value={goalForm.currentValue}
                  onChange={e => setGoalForm(f => ({ ...f, currentValue: e.target.value }))}
                  placeholder="80"
                  className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Unit</label>
                <input
                  value={goalForm.unit}
                  onChange={e => setGoalForm(f => ({ ...f, unit: e.target.value }))}
                  placeholder="kg"
                  className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Target Date (optional)</label>
              <input
                type="date"
                value={goalForm.targetDate}
                onChange={e => setGoalForm(f => ({ ...f, targetDate: e.target.value }))}
                className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
              />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={goalForm.alsoMessage}
                onChange={e => setGoalForm(f => ({ ...f, alsoMessage: e.target.checked }))}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-sm text-white">Also send as a coach message</span>
            </label>
            <Button fullWidth loading={savingGoal} disabled={!goalForm.title.trim()} onClick={handleCreateGoal}>
              <Target className="w-4 h-4" /> Set Goal &amp; Notify Client
            </Button>
          </div>

          <div>
            <p className="text-xs font-medium text-text-secondary mb-2">Existing Goals</p>
            {loadingGoals ? (
              <Skeleton className="h-16 rounded-xl" />
            ) : clientGoals.length === 0 ? (
              <p className="text-text-tertiary text-sm text-center py-3">No goals set yet.</p>
            ) : (
              <div className="space-y-2">
                {clientGoals.map((goal) => (
                  <div key={goal.id} className="p-3 bg-surface-elevated rounded-xl">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-white">{goal.title}</p>
                          <Badge variant={goal.status === 'completed' ? 'success' : goal.status === 'missed' ? 'danger' : 'muted'}>
                            {goal.status}
                          </Badge>
                        </div>
                        {goal.targetValue !== undefined && (
                          <p className="text-xs text-text-secondary mt-0.5">
                            {goal.currentValue ?? 0}{goal.unit ?? ''} → {goal.targetValue}{goal.unit ?? ''}
                          </p>
                        )}
                        {goal.targetDate && <p className="text-[10px] text-text-tertiary mt-0.5">Due {new Date(goal.targetDate).toLocaleDateString()}</p>}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {goal.status === 'active' && (
                          <button onClick={() => handleGoalStatusChange(goal, 'completed')} title="Mark complete" className="p-1.5 rounded-lg hover:bg-success/10 text-text-secondary hover:text-success transition-colors">
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => handleDeleteGoal(goal)} className="p-2.5 rounded-lg hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

    </div>
  );
}
