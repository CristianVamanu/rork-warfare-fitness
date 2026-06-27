'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Dumbbell, Activity, Settings, Shield, CreditCard, CheckCircle, AlertTriangle,
  MessageSquare, Plus, Edit2, Trash2, Send, ChevronLeft, Ban, UserCheck, X,
  Key, ExternalLink,
} from 'lucide-react';
import { collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  getSystemConfig, setSystemConfig, getAllPrograms, createProgram, updateProgram, deleteProgram,
  enrollInProgram, banUser, unbanUser, getAllUsers,
  getAdminConversations, getOrCreateConversation, getMessages, sendMessage, markConversationRead,
} from '@/lib/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import toast from 'react-hot-toast';
import type { Conversation, Message, Program } from '@/types';

type Tab = 'overview' | 'programs' | 'clients' | 'messages' | 'settings';

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

interface ProgramForm {
  name: string;
  description: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  goal: 'strength' | 'hypertrophy' | 'endurance' | 'weight-loss' | 'general';
  weeks: number;
  daysPerWeek: number;
  isPublic: boolean;
  exercises: { name: string; sets: number; reps: string; restSeconds: number; muscleGroup: string }[];
}

const emptyProgram = (): ProgramForm => ({
  name: '', description: '', level: 'beginner', goal: 'general',
  weeks: 8, daysPerWeek: 3, isPublic: true, exercises: [],
});

export default function AdminPage() {
  const { user, profile, tenant } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');

  // ── Overview state ──────────────────────────────────────────────────────────
  const [users, setUsers] = useState<UserData[]>([]);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [programCount, setProgramCount] = useState(0);
  const [workoutsToday, setWorkoutsToday] = useState(0);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // ── Programs state ─────────────────────────────────────────────────────────
  const [programs, setPrograms] = useState<(Program & { _firestoreId?: string })[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [programModal, setProgramModal] = useState<'create' | 'edit' | null>(null);
  const [editingProgram, setEditingProgram] = useState<(Program & { _firestoreId?: string }) | null>(null);
  const [programForm, setProgramForm] = useState<ProgramForm>(emptyProgram());
  const [savingProgram, setSavingProgram] = useState(false);

  // ── Clients state ──────────────────────────────────────────────────────────
  const [clientsLoading, setClientsLoading] = useState(false);
  const [assignModal, setAssignModal] = useState<UserData | null>(null);
  const [assigningProgram, setAssigningProgram] = useState(false);
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
  const [settingsForm, setSettingsForm] = useState({ appName: '', trainerName: '', trainerEmail: '', openaiModel: 'gpt-4o-mini' });
  const [savingSettings, setSavingSettings] = useState(false);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    const trainerId = profile?.trainerId;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    Promise.all([
      getAllUsers().catch(() => [] as UserData[]),
      getSystemConfig(),
      getAllPrograms().catch(() => []),
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
        });
      }
    }).catch(console.error).finally(() => setOverviewLoading(false));
  }, [profile?.trainerId]);

  // ── Tab loaders ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'programs' && programs.length === 0) loadPrograms();
    if (tab === 'clients' && users.length === 0) loadUsers();
    if (tab === 'messages' && conversations.length === 0) loadConversations();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPrograms() {
    setProgramsLoading(true);
    try {
      const progs = await getAllPrograms();
      setPrograms(progs as (Program & { _firestoreId?: string })[]);
    } catch { toast.error('Failed to load programs'); }
    finally { setProgramsLoading(false); }
  }

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

  async function handleSaveProgram() {
    if (!user || !programForm.name.trim()) return;
    setSavingProgram(true);
    try {
      const data = {
        ...programForm,
        exercises: programForm.exercises.map((e, i) => ({ ...e, id: `ex-${i}` })),
        createdBy: user.uid,
        trainerId: user.uid,
      };
      if (programModal === 'create') {
        await createProgram(data);
        toast.success('Program created');
      } else if (editingProgram?.id) {
        await updateProgram(editingProgram.id, data);
        toast.success('Program updated');
      }
      await loadPrograms();
      setProgramModal(null);
    } catch { toast.error('Failed to save program'); }
    finally { setSavingProgram(false); }
  }

  async function handleDeleteProgram(p: Program) {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      await deleteProgram(p.id);
      toast.success('Program deleted');
      await loadPrograms();
    } catch { toast.error('Failed to delete program'); }
  }

  async function handleAssignProgram(p: Program) {
    if (!assignModal) return;
    setAssigningProgram(true);
    try {
      await enrollInProgram(assignModal.id, { id: p.id, name: p.name, weeks: p.weeks, daysPerWeek: p.daysPerWeek });
      toast.success(`Assigned "${p.name}" to ${assignModal.displayName}`);
      setAssignModal(null);
      await loadUsers();
    } catch { toast.error('Failed to assign program'); }
    finally { setAssigningProgram(false); }
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
          <div className="flex items-center justify-between">
            <p className="text-text-secondary text-sm">{programs.length} program{programs.length !== 1 ? 's' : ''}</p>
            <Button size="sm" onClick={() => { setProgramForm(emptyProgram()); setEditingProgram(null); setProgramModal('create'); }}>
              <Plus className="w-3.5 h-3.5" /> New Program
            </Button>
          </div>

          {programsLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          ) : programs.length === 0 ? (
            <Card className="p-8 text-center">
              <Dumbbell className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
              <p className="text-text-secondary text-sm">No programs yet. Create one to get started.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {programs.map((p) => (
                <Card key={p.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-white">{p.name}</p>
                        <Badge variant="muted">{p.level}</Badge>
                        <Badge variant="muted">{p.goal}</Badge>
                        {p.isPublic && <Badge variant="accent">Public</Badge>}
                      </div>
                      <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{p.description}</p>
                      <p className="text-xs text-text-tertiary mt-1">{p.weeks}w · {p.daysPerWeek}d/wk · {p.exercises?.length ?? 0} exercises</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => { setEditingProgram(p); setProgramForm({ name: p.name, description: p.description, level: p.level, goal: p.goal, weeks: p.weeks, daysPerWeek: p.daysPerWeek, isPublic: p.isPublic, exercises: p.exercises?.map(e => ({ name: e.name, sets: e.sets, reps: String(e.reps), restSeconds: e.restSeconds, muscleGroup: e.muscleGroup || '' })) || [] }); setProgramModal('edit'); }}
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors text-text-secondary hover:text-white"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteProgram(p)}
                        className="p-2 rounded-lg hover:bg-danger/10 transition-colors text-text-secondary hover:text-danger"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
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
                        onClick={() => { setProgramForm(emptyProgram()); setAssignModal(u); }}
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
                  <Plus className="w-3.5 h-3.5" /> Start new (via Clients tab)
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
                      className={`p-4 cursor-pointer hover:bg-white/5 transition-colors ${conv.unreadByAdmin ? 'border-accent/40' : ''}`}
                      onClick={() => openConversation(conv)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-accent-muted flex items-center justify-center text-accent text-sm font-bold flex-shrink-0">
                          {conv.userDisplayName?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-white">{conv.userDisplayName}</p>
                            {conv.unreadByAdmin && <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />}
                          </div>
                          <p className="text-xs text-text-secondary truncate">{conv.lastMessage || 'No messages yet'}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
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
            </div>
            <Button onClick={handleSaveSettings} loading={savingSettings} fullWidth>Save Configuration</Button>
          </Card>

          <Card className="p-5 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-yellow-400" /> API Keys & Secrets
            </h2>
            <p className="text-xs text-text-secondary">These keys must be set as environment variables in Vercel — never stored in Firestore.</p>
            <div className="space-y-3">
              <div className="p-3 bg-surface-elevated rounded-xl border border-white/5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-white">OPENAI_API_KEY</p>
                  <Badge variant="muted">Required for AI features</Badge>
                </div>
                <p className="text-xs text-text-tertiary">Used for food analyzer and AI coaching. Set in Vercel → Settings → Environment Variables.</p>
              </div>
              <div className="p-3 bg-surface-elevated rounded-xl border border-white/5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-white">STRIPE_SECRET_KEY</p>
                  <Badge variant="muted">Required for billing</Badge>
                </div>
                <p className="text-xs text-text-tertiary">Enables subscription management. Get it from your Stripe dashboard.</p>
              </div>
            </div>
            <a
              href="https://vercel.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-accent hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open Vercel Dashboard
            </a>
          </Card>
        </div>
      )}

      {/* ── Program create/edit modal ─────────────────────────────────────────── */}
      <Modal open={!!programModal} onClose={() => setProgramModal(null)} title={programModal === 'create' ? 'New Program' : 'Edit Program'}>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="text-xs text-text-secondary mb-1 block">Program Name *</label>
            <Input value={programForm.name} onChange={e => setProgramForm(s => ({ ...s, name: e.target.value }))} placeholder="e.g. 12-Week Strength Builder" />
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1 block">Description</label>
            <textarea
              value={programForm.description}
              onChange={e => setProgramForm(s => ({ ...s, description: e.target.value }))}
              placeholder="What this program is about…"
              rows={2}
              className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Level</label>
              <select value={programForm.level} onChange={e => setProgramForm(s => ({ ...s, level: e.target.value as ProgramForm['level'] }))} className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50">
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Goal</label>
              <select value={programForm.goal} onChange={e => setProgramForm(s => ({ ...s, goal: e.target.value as ProgramForm['goal'] }))} className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50">
                <option value="general">General</option>
                <option value="strength">Strength</option>
                <option value="hypertrophy">Hypertrophy</option>
                <option value="weight-loss">Weight Loss</option>
                <option value="endurance">Endurance</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Weeks</label>
              <Input type="number" value={programForm.weeks} onChange={e => setProgramForm(s => ({ ...s, weeks: Number(e.target.value) }))} min={1} max={52} />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Days/Week</label>
              <Input type="number" value={programForm.daysPerWeek} onChange={e => setProgramForm(s => ({ ...s, daysPerWeek: Number(e.target.value) }))} min={1} max={7} />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={programForm.isPublic} onChange={e => setProgramForm(s => ({ ...s, isPublic: e.target.checked }))} className="rounded" />
            <span className="text-sm text-white">Public (visible to all users)</span>
          </label>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-text-secondary">Exercises ({programForm.exercises.length})</label>
              <button
                onClick={() => setProgramForm(s => ({ ...s, exercises: [...s.exercises, { name: '', sets: 3, reps: '8-12', restSeconds: 60, muscleGroup: '' }] }))}
                className="text-xs text-accent hover:underline"
              >
                + Add Exercise
              </button>
            </div>
            <div className="space-y-2">
              {programForm.exercises.map((ex, i) => (
                <div key={i} className="p-3 bg-surface-elevated rounded-xl space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={ex.name} onChange={e => setProgramForm(s => ({ ...s, exercises: s.exercises.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))} placeholder="Exercise name" className="flex-1" />
                    <button onClick={() => setProgramForm(s => ({ ...s, exercises: s.exercises.filter((_, j) => j !== i) }))} className="p-1.5 text-danger hover:bg-danger/10 rounded-lg">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-text-tertiary">Sets</label>
                      <Input type="number" value={ex.sets} onChange={e => setProgramForm(s => ({ ...s, exercises: s.exercises.map((x, j) => j === i ? { ...x, sets: Number(e.target.value) } : x) }))} min={1} />
                    </div>
                    <div>
                      <label className="text-[10px] text-text-tertiary">Reps</label>
                      <Input value={ex.reps} onChange={e => setProgramForm(s => ({ ...s, exercises: s.exercises.map((x, j) => j === i ? { ...x, reps: e.target.value } : x) }))} placeholder="8-12" />
                    </div>
                    <div>
                      <label className="text-[10px] text-text-tertiary">Rest (s)</label>
                      <Input type="number" value={ex.restSeconds} onChange={e => setProgramForm(s => ({ ...s, exercises: s.exercises.map((x, j) => j === i ? { ...x, restSeconds: Number(e.target.value) } : x) }))} min={0} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button fullWidth onClick={handleSaveProgram} loading={savingProgram} disabled={!programForm.name.trim()}>
            {programModal === 'create' ? 'Create Program' : 'Save Changes'}
          </Button>
        </div>
      </Modal>

      {/* ── Assign program modal ──────────────────────────────────────────────── */}
      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title={`Assign Program — ${assignModal?.displayName}`}>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {programs.length === 0 && (
            <p className="text-text-secondary text-sm text-center py-4">No programs available. Create one first.</p>
          )}
          {programs.map((p) => (
            <button
              key={p.id}
              onClick={() => handleAssignProgram(p)}
              disabled={assigningProgram}
              className="w-full text-left p-3 bg-surface-elevated rounded-xl hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{p.name}</p>
                  <p className="text-xs text-text-secondary">{p.level} · {p.goal} · {p.weeks}w · {p.daysPerWeek}d/wk</p>
                </div>
                <CheckCircle className="w-4 h-4 text-text-tertiary" />
              </div>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
