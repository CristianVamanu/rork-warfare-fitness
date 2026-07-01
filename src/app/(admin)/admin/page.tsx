'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Users, Dumbbell, Activity, Settings, Shield, CreditCard, CheckCircle, AlertTriangle,
  MessageSquare, Send, ChevronLeft, Ban, UserCheck,
  Key, ExternalLink, Sparkles, Bell, Zap, Flame, Trophy, RefreshCw, Plus, Edit2, Trash2,
  Video, Upload, X as XIcon, Play,
} from 'lucide-react';
import { collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getIdToken } from 'firebase/auth';
import {
  getSystemConfig, setSystemConfig,
  banUser, unbanUser, getAllUsers,
  getAdminConversations, getOrCreateConversation, getMessages, sendMessage, markConversationRead, deleteConversation,
  getMembershipConfig, saveMembershipConfig, setUserMembership,
  sendNotification, sendNotificationToAll, getNotificationConfig, saveNotificationConfig,
  getChannels, createChannel, updateChannel, deleteChannel,
  deleteUserAccount,
  getCoachingPlans, saveCoachingPlans, assignCoachingPlan, revokeCoachingPlan,
  getExerciseVideos, saveExerciseVideo, deleteExerciseVideo,
} from '@/lib/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import toast from 'react-hot-toast';
import type { Conversation, Message, MembershipConfig, NotificationConfig, Channel, CoachingPlan, ExerciseVideo } from '@/types';

type Tab = 'overview' | 'programs' | 'clients' | 'messages' | 'community' | 'notifications' | 'membership' | 'library' | 'settings';

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
  banned?: boolean;
  statsCache?: { totalWorkouts?: number; streak?: number };
  stats?: { totalWorkouts?: number };
  activeProgram?: { programName?: string; completedWorkouts?: number; totalWorkouts?: number };
  createdAt?: unknown;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, profile, tenant } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');

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

  // ── Settings state ─────────────────────────────────────────────────────────
  const [settingsForm, setSettingsForm] = useState({ appName: '', trainerName: '', trainerEmail: '', openaiModel: 'gpt-4o-mini', videoGreetingUrl: '', stripePublishableKey: '', logoUrl: '', pwaInstallBannerEnabled: true, vapidPublicKey: '' });
  const [savingSettings, setSavingSettings] = useState(false);

  // ── Membership state ───────────────────────────────────────────────────────
  const [membership, setMembership] = useState<MembershipConfig>({
    enabled: false, fee: 0, currency: 'USD', fullLock: false, lockedFeatures: [], lockedProgramIds: [], trialDays: 0,
  });
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [savingMembership, setSavingMembership] = useState(false);
  const [togglingMember, setTogglingMember] = useState<string | null>(null);

  // ── Notifications state ────────────────────────────────────────────────────
  const DEFAULT_NOTIF_CONFIG: NotificationConfig = {
    rules: { missed_workout: false, streak_reminder: false },
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
  const [planForm, setPlanForm] = useState({ name: '', description: '', priceMonthly: '', currency: 'USD', features: '', active: true });
  const [assigningPlan, setAssigningPlan] = useState<string | null>(null);

  // ── Exercise library state ────────────────────────────────────────────────
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseVideo[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [showExForm, setShowExForm] = useState(false);
  const [editingEx, setEditingEx] = useState<ExerciseVideo | null>(null);
  const [exForm, setExForm] = useState({ name: '', aliases: '', muscleGroups: '', equipment: '' });
  const [exFile, setExFile] = useState<File | null>(null);
  const [exUploadProgress, setExUploadProgress] = useState(0);
  const [savingEx, setSavingEx] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);
  // Bulk upload
  const [bulkCategory, setBulkCategory] = useState('Abs');
  const [bulkEquipment, setBulkEquipment] = useState('Bodyweight');
  const [bulkFiles, setBulkFiles] = useState<BulkFile[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<Record<string, number>>({});
  const bulkDropRef = useRef<HTMLDivElement>(null);

  // ── Community channels state ───────────────────────────────────────────────
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelForm, setChannelForm] = useState({ name: '', description: '', emoji: '', photoUploadEnabled: true, slowModeDays: 0 as 0|7|21|30 });
  const [savingChannel, setSavingChannel] = useState(false);
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    const trainerId = profile?.trainerId;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    Promise.all([
      getAllUsers().catch(() => [] as UserData[]),
      getSystemConfig(),
      Promise.resolve([]), // programs count loaded separately
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
        });
      }
    }).catch(console.error).finally(() => setOverviewLoading(false));
  }, [profile?.trainerId]);

  // ── Tab loaders ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'clients' && users.length === 0) loadUsers();
    if (tab === 'messages' && conversations.length === 0) loadConversations();
    if (tab === 'membership') { loadMembership(); loadCoachingPlans(); }
    if (tab === 'notifications') loadNotifConfig();
    if (tab === 'community') loadChannels();
    if (tab === 'library' && exerciseLibrary.length === 0) loadExerciseLibrary();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadUsers() {
    setClientsLoading(true);
    try { setUsers(await getAllUsers() as UserData[]); }
    catch { toast.error('Failed to load users'); }
    finally { setClientsLoading(false); }
  }

  async function loadConversations() {
    if (!user) return;
    setConvsLoading(true);
    try { setConversations(await getAdminConversations(user.uid)); }
    catch { toast.error('Failed to load conversations'); }
    finally { setConvsLoading(false); }
  }

  async function openConversation(conv: Conversation) {
    setActiveConv(conv);
    setMsgLoading(true);
    try {
      const msgs = await getMessages(conv.id);
      setMessages(msgs);
      if (conv.unreadByAdmin) await markConversationRead(conv.id, true);
    } catch { toast.error('Failed to load messages'); }
    finally { setMsgLoading(false); }
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
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
      const msgs = await getMessages(activeConv.id);
      setMessages(msgs);
      setConversations(prev => prev.map(c => c.id === activeConv.id ? { ...c, lastMessage: text, unreadByUser: true } : c));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch { toast.error('Failed to send message'); setMsgText(text); }
    finally { setSendingMsg(false); }
  }

  async function handleBanToggle(u: UserData) {
    setBanningUser(u.id);
    try {
      if (u.banned) {
        await unbanUser(u.id);
        toast.success(`${u.displayName} unbanned`);
      } else {
        if (!confirm(`Ban ${u.displayName}? They will be locked out of the app.`)) { setBanningUser(null); return; }
        await banUser(u.id);
        toast.success(`${u.displayName} banned`);
      }
      await loadUsers();
    } catch { toast.error('Failed to update user'); }
    finally { setBanningUser(null); }
  }

  async function handleDeleteUser(u: UserData) {
    if (!confirm(`Permanently delete ${u.displayName || u.email}? This cannot be undone.`)) return;
    try {
      await deleteUserAccount(u.id);
      toast.success(`${u.displayName || 'User'} deleted`);
      await loadUsers();
    } catch { toast.error('Failed to delete user'); }
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
      };
      const updated = editingPlan
        ? coachingPlans.map(p => p.id === plan.id ? plan : p)
        : [...coachingPlans, plan];
      await saveCoachingPlans(updated);
      setCoachingPlans(updated);
      setShowPlanForm(false);
      setEditingPlan(null);
      setPlanForm({ name: '', description: '', priceMonthly: '', currency: 'USD', features: '', active: true });
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
    });
    setShowPlanForm(true);
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

  async function handleToggleMember(u: UserData) {
    setTogglingMember(u.id);
    const currentStatus = (u as UserData & { membership?: { status?: string } }).membership?.status ?? 'none';
    const newStatus = currentStatus === 'active' ? 'none' : 'active';
    try {
      await setUserMembership(u.id, newStatus);
      toast.success(newStatus === 'active' ? `${u.displayName} is now a member` : `${u.displayName}'s membership revoked`);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, membership: { status: newStatus } } : x));
    } catch { toast.error('Failed to update membership'); }
    finally { setTogglingMember(null); }
  }

  function toggleLockedFeature(f: string) {
    setMembership(m => ({
      ...m,
      lockedFeatures: m.lockedFeatures.includes(f) ? m.lockedFeatures.filter(x => x !== f) : [...m.lockedFeatures, f],
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
      setChannelForm({ name: '', description: '', emoji: '', photoUploadEnabled: true, slowModeDays: 0 });
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
    });
    setShowChannelForm(true);
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
      const data = await res.json();
      if (res.ok) {
        toast.success(`Auto-notifications processed — ${data.sent?.length ?? 0} sent`);
      } else {
        toast.error(data.error || 'Processing failed');
      }
    } catch { toast.error('Failed to run'); }
    finally { setProcessingCron(false); }
  }

  // ── Exercise Library ────────────────────────────────────────────────────────
  async function loadExerciseLibrary() {
    setLibraryLoading(true);
    try { setExerciseLibrary(await getExerciseVideos()); } catch { /* noop */ }
    finally { setLibraryLoading(false); }
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

  async function handleSaveEx() {
    if (!user || !exForm.name.trim()) { toast.error('Exercise name required'); return; }
    if (!editingEx && !exFile) { toast.error('Please select a video file'); return; }
    setSavingEx(true);
    try {
      let videoUrl = editingEx?.videoUrl ?? '';
      if (exFile) {
        const path = `exerciseLibrary/${Date.now()}_${exFile.name.replace(/\s+/g, '_')}`;
        const storageRef = ref(storage!, path);
        await new Promise<void>((resolve, reject) => {
          const task = uploadBytesResumable(storageRef, exFile);
          task.on('state_changed',
            (snap) => setExUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
            reject,
            async () => { videoUrl = await getDownloadURL(task.snapshot.ref); resolve(); }
          );
        });
      }
      const payload = {
        name: exForm.name.trim(),
        aliases: exForm.aliases.split(',').map(s => s.trim()).filter(Boolean),
        muscleGroups: exForm.muscleGroups.split(',').map(s => s.trim()).filter(Boolean),
        equipment: exForm.equipment.split(',').map(s => s.trim()).filter(Boolean),
        videoUrl,
        uploadedBy: user.uid,
      };
      await saveExerciseVideo(payload, editingEx?.id);
      toast.success(editingEx ? 'Exercise updated' : 'Exercise added to library');
      setShowExForm(false);
      await loadExerciseLibrary();
    } catch (err) {
      toast.error('Failed to save exercise');
      console.error(err);
    } finally {
      setSavingEx(false);
      setExUploadProgress(0);
    }
  }

  async function handleDeleteEx(id: string) {
    if (!confirm('Delete this exercise from the library?')) return;
    try {
      await deleteExerciseVideo(id);
      setExerciseLibrary(prev => prev.filter(e => e.id !== id));
      toast.success('Deleted');
    } catch { toast.error('Failed to delete'); }
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
        const path = `exerciseLibrary/${Date.now()}_${item.file.name.replace(/\s+/g, '_')}`;
        const storageRef = ref(storage!, path);
        const videoUrl = await new Promise<string>((resolve, reject) => {
          const task = uploadBytesResumable(storageRef, item.file);
          task.on('state_changed',
            (snap) => {
              const pct = Math.round(snap.bytesTransferred / snap.totalBytes * 100);
              setBulkProgress(prev => ({ ...prev, [item.id]: pct }));
            },
            reject,
            async () => resolve(await getDownloadURL(task.snapshot.ref))
          );
        });
        await saveExerciseVideo({
          name: item.name.trim(),
          aliases: item.aliases.split(',').map(s => s.trim()).filter(Boolean),
          muscleGroups: [bulkCategory],
          equipment: [bulkEquipment],
          videoUrl,
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

  const stripeStatus = tenant?.stripe?.subscriptionStatus ?? 'inactive';
  const clients = users.filter(u => u.role !== 'admin');

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'programs', label: 'Programs', icon: Dumbbell },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'community', label: 'Community', icon: Users },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'membership', label: 'Membership', icon: CreditCard },
    { id: 'library', label: 'Library', icon: Video },
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
              <CreditCard className="w-4 h-4 text-accent" /> Subscription
            </h2>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {stripeStatus === 'active' ? <CheckCircle className="w-5 h-5 text-success" /> :
                 stripeStatus === 'past_due' || stripeStatus === 'canceled' ? <AlertTriangle className="w-5 h-5 text-danger" /> :
                 <CreditCard className="w-5 h-5 text-text-tertiary" />}
                <span className={`text-sm font-medium ${
                  stripeStatus === 'active' ? 'text-success' :
                  stripeStatus === 'trialing' ? 'text-yellow-400' :
                  stripeStatus === 'past_due' || stripeStatus === 'canceled' ? 'text-danger' : 'text-text-tertiary'
                }`}>
                  {stripeStatus === 'active' ? 'Active' : stripeStatus === 'trialing' ? 'Trial' :
                   stripeStatus === 'past_due' ? 'Past Due' : stripeStatus === 'canceled' ? 'Canceled' : 'Not set up'}
                </span>
              </div>
              {tenant?.stripe?.currentPeriodEnd != null && stripeStatus !== 'inactive' && (
                <p className="text-xs text-text-secondary">
                  Renews {new Date(String(tenant.stripe.currentPeriodEnd)).toLocaleDateString()}
                </p>
              )}
            </div>
            {stripeStatus === 'inactive' && (
              <p className="text-xs text-text-secondary mt-2">
                Set STRIPE_SECRET_KEY in your Vercel environment variables to enable billing.
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
            <div className="flex gap-3 justify-center">
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
          <p className="text-text-secondary text-sm">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
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
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-accent-muted flex items-center justify-center text-accent text-sm font-bold flex-shrink-0">
                      {u.displayName?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white truncate">{u.displayName || 'Unknown'}</p>
                        {u.banned && <Badge variant="danger">Banned</Badge>}
                      </div>
                      <p className="text-xs text-text-secondary truncate">{u.email}</p>
                      {u.activeProgram && (
                        <p className="text-xs text-text-tertiary mt-0.5">
                          {u.activeProgram.programName} · {u.activeProgram.completedWorkouts}/{u.activeProgram.totalWorkouts} sessions
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
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
          <div className="flex items-center justify-between">
            <p className="text-text-secondary text-sm">{channels.length} channel{channels.length !== 1 ? 's' : ''}</p>
            <Button size="sm" onClick={() => { setEditingChannel(null); setChannelForm({ name: '', description: '', emoji: '', photoUploadEnabled: true, slowModeDays: 0 }); setShowChannelForm(true); }}>
              <Plus className="w-4 h-4" /> New Channel
            </Button>
          </div>

          {showChannelForm && (
            <Card className="p-5 space-y-3 border-accent/30">
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
              <div className="flex gap-2">
                <Button variant="ghost" fullWidth onClick={() => { setShowChannelForm(false); setEditingChannel(null); }}>Cancel</Button>
                <Button fullWidth loading={savingChannel} disabled={!channelForm.name.trim()} onClick={handleSaveChannel}>
                  {editingChannel ? 'Save' : 'Create'}
                </Button>
              </div>
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
                <Card key={ch.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{ch.emoji || '#'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white"># {ch.name}</p>
                      <div className="flex gap-3 text-xs text-text-tertiary mt-0.5">
                        <span>{ch.postCount} posts</span>
                        {ch.slowModeDays > 0 && <span>Slow: {ch.slowModeDays}d</span>}
                        {ch.photoUploadEnabled && <span>📷 photos on</span>}
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
                    <div>
                      <label className="text-xs text-text-secondary mb-1 block">Monthly Fee (USD)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={membership.fee}
                          onChange={e => setMembership(m => ({ ...m, fee: parseFloat(e.target.value) || 0 }))}
                          className="w-full bg-surface border border-white/10 rounded-xl pl-7 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
                        />
                      </div>
                    </div>
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
                      <p className="text-xs text-text-tertiary mt-1.5">New members get this many days free before being charged.</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-white">Full Platform Lock</p>
                        <p className="text-xs text-text-secondary mt-0.5">Non-members can only see the dashboard</p>
                      </div>
                      <button
                        onClick={() => setMembership(m => ({ ...m, fullLock: !m.fullLock }))}
                        className={`w-11 h-6 rounded-full transition-colors relative ${membership.fullLock ? 'bg-danger' : 'bg-surface-elevated'}`}
                      >
                        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${membership.fullLock ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>
                  </>
                )}
              </Card>

              {/* Locked features */}
              {membership.enabled && !membership.fullLock && (
                <Card className="p-5 space-y-3">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Shield className="w-4 h-4 text-accent" /> Lockable Features
                  </h2>
                  <p className="text-xs text-text-secondary">Non-members see a paywall on these features.</p>
                  {[
                    { id: 'barcode', label: 'Barcode Scanner', desc: 'Nutrition lookup via product barcode' },
                    { id: 'nutrition-ai', label: 'AI Food Analyzer', desc: 'Photo-based nutrition analysis' },
                    { id: 'premium-programs', label: 'Premium Training Plans', desc: 'Programs marked as Premium require membership' },
                  ].map(({ id, label, desc }) => (
                    <div key={id} className="flex items-center justify-between py-1">
                      <div>
                        <p className="text-sm font-medium text-white">{label}</p>
                        <p className="text-xs text-text-secondary">{desc}</p>
                      </div>
                      <button
                        onClick={() => toggleLockedFeature(id)}
                        className={`w-11 h-6 rounded-full transition-colors relative ${membership.lockedFeatures.includes(id) ? 'bg-accent' : 'bg-surface-elevated'}`}
                      >
                        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${membership.lockedFeatures.includes(id) ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>
                  ))}
                </Card>
              )}

              <Button onClick={handleSaveMembership} loading={savingMembership} fullWidth>
                Save Membership Settings
              </Button>

              {/* ── Coaching Plans ── */}
              <Card className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-accent" /> Coaching Plans
                  </h2>
                  <Button size="sm" onClick={() => { setEditingPlan(null); setPlanForm({ name: '', description: '', priceMonthly: '', currency: 'USD', features: '', active: true }); setShowPlanForm(true); }}>
                    <Plus className="w-3.5 h-3.5" /> New Plan
                  </Button>
                </div>
                <p className="text-xs text-text-secondary">Create tiered coaching plans that clients can subscribe to. Coaching programs (marked 1:1) are unlocked by any active plan.</p>

                {showPlanForm && (
                  <div className="bg-surface-elevated rounded-2xl p-4 space-y-3 border border-accent/30">
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
                  </div>
                )}

                {coachingPlans.length === 0 && !showPlanForm ? (
                  <p className="text-text-tertiary text-sm text-center py-3">No coaching plans yet. Create one above.</p>
                ) : (
                  <div className="space-y-3">
                    {coachingPlans.map((plan) => (
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
                            <button onClick={() => startEditPlan(plan)} className="p-1.5 rounded-lg hover:bg-white/5 text-text-secondary hover:text-white transition-colors">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeletePlan(plan)} className="p-1.5 rounded-lg hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
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
                      {coachingPlans.filter(p => p.active).length > 0 && (
                        <div className="flex items-center gap-2 pl-11">
                          <select
                            className="flex-1 bg-surface border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-accent/50"
                            defaultValue=""
                            onChange={async (e) => {
                              const pid = e.target.value;
                              if (!pid) return;
                              const plan = coachingPlans.find(p => p.id === pid);
                              if (plan) await handleAssignPlan(u, plan.id, plan.name);
                              e.target.value = '';
                            }}
                          >
                            <option value="">Assign coaching plan…</option>
                            {coachingPlans.filter(p => p.active).map(p => (
                              <option key={p.id} value={p.id}>{p.name} — {p.currency} {p.priceMonthly}/mo</option>
                            ))}
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
                    </div>
                  );
                })}
              </Card>
            </>
          )}
        </div>
      )}

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
                  {MUSCLE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block">Equipment</label>
                <select
                  value={bulkEquipment}
                  onChange={e => setBulkEquipment(e.target.value)}
                  className="w-full bg-surface-elevated border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50"
                >
                  {EQUIPMENT_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
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
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-secondary">Library ({exerciseLibrary.length})</p>
            <Button size="sm" variant="ghost" onClick={() => startEditEx()}>
              <Plus className="w-4 h-4" /> Add Single
            </Button>
          </div>

          {showExForm && (
            <Card className="p-4 space-y-3 border border-accent/30">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">{editingEx ? 'Edit Exercise' : 'New Exercise'}</h3>
                <button onClick={() => setShowExForm(false)}><XIcon className="w-4 h-4 text-text-secondary" /></button>
              </div>
              <Input placeholder="Exercise name (e.g. Barbell Back Squat)" value={exForm.name} onChange={e => setExForm(f => ({ ...f, name: e.target.value }))} />
              <Input placeholder="Aliases — comma separated (e.g. squat, back squat, bb squat)" value={exForm.aliases} onChange={e => setExForm(f => ({ ...f, aliases: e.target.value }))} />
              <Input placeholder="Muscle groups — comma separated (e.g. Quadriceps, Glutes)" value={exForm.muscleGroups} onChange={e => setExForm(f => ({ ...f, muscleGroups: e.target.value }))} />
              <Input placeholder="Equipment — comma separated (e.g. Barbell, Rack)" value={exForm.equipment} onChange={e => setExForm(f => ({ ...f, equipment: e.target.value }))} />
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Video file (MP4, MOV, WebM)</label>
                <input
                  type="file"
                  accept="video/*"
                  className="text-sm text-text-secondary w-full"
                  onChange={e => setExFile(e.target.files?.[0] ?? null)}
                />
                {editingEx?.videoUrl && !exFile && (
                  <p className="text-xs text-text-tertiary mt-1">Current video on file — upload a new one to replace it.</p>
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
            </Card>
          )}

          {/* ── Library list ─────────────────────────────────────────────────── */}
          {previewVideo && (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setPreviewVideo(null)}>
              <div className="relative w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <button className="absolute -top-8 right-0 text-white" onClick={() => setPreviewVideo(null)}><XIcon className="w-5 h-5" /></button>
                <video src={previewVideo} controls autoPlay className="w-full rounded-xl" />
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
          ) : (
            <div className="space-y-2">
              {exerciseLibrary.map(ex => (
                <Card key={ex.id} className="p-3 flex items-center gap-3">
                  <button
                    onClick={() => setPreviewVideo(ex.videoUrl)}
                    className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 hover:bg-accent/20 transition-colors"
                  >
                    <Play className="w-5 h-5 text-accent" />
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
                    <button onClick={() => startEditEx(ex)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                      <Edit2 className="w-4 h-4 text-text-secondary" />
                    </button>
                    <button onClick={() => handleDeleteEx(ex.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </Card>
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
                <Input value={settingsForm.videoGreetingUrl} onChange={e => setSettingsForm(s => ({ ...s, videoGreetingUrl: e.target.value }))} placeholder="https://… (MP4 or hosted video link)" />
                <p className="text-xs text-text-tertiary mt-1">Plays automatically after a new user completes onboarding. Leave blank to skip.</p>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Logo / Brand Image URL</label>
                <Input value={settingsForm.logoUrl} onChange={e => setSettingsForm(s => ({ ...s, logoUrl: e.target.value }))} placeholder="https://… (PNG or JPG, square recommended)" />
                <p className="text-xs text-text-tertiary mt-1">Replaces the default &quot;W&quot; icon in the header and login screen. Upload to any public CDN/host and paste the link.</p>
                {settingsForm.logoUrl && (
                  <img src={settingsForm.logoUrl} alt="Logo preview" className="mt-2 w-12 h-12 rounded-xl object-cover border border-white/10" />
                )}
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
            </div>
            <Button onClick={handleSaveSettings} loading={savingSettings} fullWidth>Save Configuration</Button>
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
                <p className="text-xs text-text-tertiary">The Stripe secret key must be set as an environment variable in Vercel, never stored here. Go to Vercel → Settings → Environment Variables → add <code className="bg-black/30 px-1 rounded">STRIPE_SECRET_KEY</code>.</p>
              </div>
            </div>
            <Button onClick={handleSaveSettings} loading={savingSettings} fullWidth>Save Stripe Config</Button>
            <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-accent hover:underline">
              <ExternalLink className="w-3.5 h-3.5" /> Stripe API Keys Dashboard
            </a>
          </Card>

          <Card className="p-5 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-yellow-400" /> Other API Keys & Secrets
            </h2>
            <p className="text-xs text-text-secondary">Must be set as Vercel environment variables.</p>
            <div className="space-y-3">
              <div className="p-3 bg-surface-elevated rounded-xl border border-white/5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-white">OPENAI_API_KEY</p>
                  <Badge variant="muted">AI features</Badge>
                </div>
                <p className="text-xs text-text-tertiary">Food analyzer, AI program builder, AI notifications.</p>
              </div>
              <div className="p-3 bg-surface-elevated rounded-xl border border-white/5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-white">FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY</p>
                  <Badge variant="muted">Cron jobs</Badge>
                </div>
                <p className="text-xs text-text-tertiary">Required for the auto-notification cron processor (Firebase Admin SDK).</p>
              </div>
              <div className="p-3 bg-surface-elevated rounded-xl border border-blue-400/20">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-white">Push Notifications (VAPID)</p>
                  <Badge variant="info">PWA</Badge>
                </div>
                <p className="text-xs text-text-tertiary mb-2">Generate VAPID keys once with: <code className="bg-black/30 px-1 rounded">npx web-push generate-vapid-keys</code>. Then set in Vercel:</p>
                <ul className="text-xs text-text-tertiary space-y-0.5 list-disc pl-4">
                  <li><code className="bg-black/30 px-1 rounded">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> — also paste below</li>
                  <li><code className="bg-black/30 px-1 rounded">VAPID_PRIVATE_KEY</code> — env var only, never here</li>
                </ul>
                <div className="mt-2">
                  <label className="text-xs text-text-secondary mb-1 block">VAPID Public Key (saved to Firestore for clients)</label>
                  <Input
                    value={settingsForm.vapidPublicKey || ''}
                    onChange={e => setSettingsForm(s => ({ ...s, vapidPublicKey: e.target.value }))}
                    placeholder="Bxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  />
                  <Button onClick={handleSaveSettings} loading={savingSettings} size="sm" className="mt-2">Save VAPID Public Key</Button>
                </div>
              </div>
            </div>
            <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-accent hover:underline">
              <ExternalLink className="w-3.5 h-3.5" /> Open Vercel Dashboard
            </a>
          </Card>
        </div>
      )}

    </div>
  );
}
