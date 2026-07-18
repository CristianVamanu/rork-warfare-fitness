'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { LogOut, ChevronRight, Scale, Bell, Shield, Info, LayoutDashboard, BellOff, Download, Trash2, Activity, RefreshCw, Unlink } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { getIdToken } from 'firebase/auth';
import { signOut } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { updateUserDoc, getSystemConfig } from '@/lib/firestore';
import { subscribeToPush, unsubscribeFromPush, getCurrentSubscription } from '@/lib/pushNotifications';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface WhoopSummary {
  recoveryScore?: number;
  hrvMs?: number;
  restingHeartRate?: number;
  sleepPerformancePercent?: number;
  dayStrain?: number;
  syncedAt: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, refreshProfile } = useAuth();
  const [signOutModal, setSignOutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [updatingUnit, setUpdatingUnit] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [exportingData, setExportingData] = useState(false);
  const [deleteAccountModal, setDeleteAccountModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [whoopConnected, setWhoopConnected] = useState(false);
  const [whoopSummary, setWhoopSummary] = useState<WhoopSummary | null>(null);
  const [whoopLoading, setWhoopLoading] = useState(false);
  const [whoopSyncing, setWhoopSyncing] = useState(false);

  useEffect(() => {
    getCurrentSubscription().then(sub => setPushSubscribed(!!sub));
    getSystemConfig().then(cfg => {
      if (cfg?.vapidPublicKey) setVapidKey(cfg.vapidPublicKey as string);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await getIdToken(user);
        const res = await fetch('/api/whoop/status', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        setWhoopConnected(!!data.connected);
        setWhoopSummary(data.summary ?? null);
      } catch { /* ignore */ }
    })();
  }, [user]);

  useEffect(() => {
    const whoopParam = searchParams.get('whoop');
    if (!whoopParam) return;
    if (whoopParam === 'connected') toast.success('WHOOP connected!');
    else if (whoopParam === 'denied') toast.error('WHOOP connection was cancelled');
    else if (whoopParam === 'expired') toast.error('That connection attempt expired — try again');
    else toast.error('Failed to connect WHOOP');
    router.replace('/settings');
  }, [searchParams, router]);

  async function handleWhoopConnect() {
    if (!user) return;
    setWhoopLoading(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/whoop/connect', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Failed to start WHOOP connection');
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to connect WHOOP');
      setWhoopLoading(false);
    }
  }

  async function handleWhoopDisconnect() {
    if (!user) return;
    setWhoopLoading(true);
    try {
      const token = await getIdToken(user);
      await fetch('/api/whoop/disconnect', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      setWhoopConnected(false);
      setWhoopSummary(null);
      toast.success('WHOOP disconnected');
    } catch {
      toast.error('Failed to disconnect WHOOP');
    } finally {
      setWhoopLoading(false);
    }
  }

  async function handleWhoopSync() {
    if (!user) return;
    setWhoopSyncing(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/whoop/sync', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setWhoopSummary(data.summary);
      toast.success('WHOOP data synced');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to sync WHOOP');
    } finally {
      setWhoopSyncing(false);
    }
  }

  async function handlePushToggle() {
    if (!user) return;
    setPushLoading(true);
    try {
      if (pushSubscribed) {
        await unsubscribeFromPush(user.uid);
        setPushSubscribed(false);
        toast.success('Push notifications disabled');
      } else {
        if (!vapidKey) {
          toast.error('Push notifications not configured by your trainer yet.');
          return;
        }
        const ok = await subscribeToPush(user.uid, vapidKey);
        if (ok) { setPushSubscribed(true); toast.success('Push notifications enabled!'); }
        else toast.error('Permission denied or not supported on this device.');
      }
    } catch { toast.error('Failed to update push settings'); }
    finally { setPushLoading(false); }
  }

  const handleExportData = async () => {
    if (!user) return;
    setExportingData(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/account/export', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `warfare-fitness-data-${user.uid}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Your data has been downloaded');
    } catch {
      toast.error('Failed to export your data');
    } finally {
      setExportingData(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmText !== 'DELETE') return;
    setDeletingAccount(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Your account has been deleted');
      await signOut();
      router.replace('/login');
    } catch {
      toast.error('Failed to delete your account — please try again or contact support');
      setDeletingAccount(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace('/login');
    } catch {
      toast.error('Failed to sign out');
      setSigningOut(false);
    }
  };

  const toggleWeightUnit = async () => {
    if (!user) return;
    setUpdatingUnit(true);
    const newUnit = profile?.weightUnit === 'kg' ? 'lbs' : 'kg';
    try {
      await updateUserDoc(user.uid, { weightUnit: newUnit });
      await refreshProfile();
      toast.success(`Weight unit changed to ${newUnit}`);
    } catch {
      toast.error('Failed to update');
    } finally {
      setUpdatingUnit(false);
    }
  };

  const sections = [
    {
      title: 'Preferences',
      items: [
        {
          icon: Scale,
          label: 'Weight Unit',
          description: `Currently: ${profile?.weightUnit || 'kg'}`,
          action: toggleWeightUnit,
          rightLabel: profile?.weightUnit === 'kg' ? 'Switch to lbs' : 'Switch to kg',
        },
      ],
    },
    {
      title: 'Account',
      items: [
        {
          icon: Info,
          label: 'Email',
          description: user?.email || '',
          action: null,
          rightLabel: '',
        },
        {
          icon: Shield,
          label: 'Role',
          description: `Your account type: ${profile?.role || 'user'}`,
          action: null,
          rightLabel: '',
        },
      ],
    },
    {
      title: 'App',
      items: [
        {
          icon: Info,
          label: 'Version',
          description: 'Warfare Fitness PWA',
          action: null,
          rightLabel: `v${process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0'}`,
        },
      ],
    },
  ];

  return (
    <div>
      <Header title="Settings" />
      <div className="px-4 py-4 space-y-5">
        {sections.map(({ title, items }) => (
          <motion.div key={title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2 px-1">{title}</h2>
            <Card className="overflow-hidden">
              {items.map(({ icon: Icon, label, description, action, rightLabel }, i) => (
                <button
                  key={label}
                  onClick={action || undefined}
                  disabled={!action}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors text-left ${
                    i < items.length - 1 ? 'border-b border-white/8' : ''
                  } ${!action ? 'cursor-default' : ''}`}
                >
                  <div className="p-2 bg-surface-elevated rounded-lg">
                    <Icon className="w-4 h-4 text-text-secondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{label}</p>
                    <p className="text-xs text-text-secondary truncate">{description}</p>
                  </div>
                  {action ? (
                    <div className="flex items-center gap-1 text-xs text-accent">
                      {rightLabel}
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  ) : rightLabel ? (
                    <span className="text-xs text-text-tertiary">{rightLabel}</span>
                  ) : null}
                </button>
              ))}
            </Card>
          </motion.div>
        ))}

        {/* Push Notifications */}
        {'Notification' in window || true ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2 px-1">Notifications</h2>
            <Card className="flex items-center gap-3 px-4 py-3.5">
              <div className="p-2 bg-surface-elevated rounded-lg">
                {pushSubscribed ? <Bell className="w-4 h-4 text-accent" /> : <BellOff className="w-4 h-4 text-text-secondary" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Push Notifications</p>
                <p className="text-xs text-text-secondary">{pushSubscribed ? 'Enabled — you will receive coach alerts' : 'Disabled — tap to enable'}</p>
              </div>
              <button
                onClick={handlePushToggle}
                disabled={pushLoading}
                className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${pushSubscribed ? 'bg-accent' : 'bg-surface-elevated'}`}
              >
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${pushSubscribed ? 'left-6' : 'left-1'}`} />
              </button>
            </Card>
          </motion.div>
        ) : null}

        {/* Connected Devices — WHOOP recovery/sleep/strain sync */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2 px-1">Connected Devices</h2>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-surface-elevated rounded-lg">
                <Activity className="w-4 h-4 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">WHOOP</p>
                <p className="text-xs text-text-secondary">
                  {whoopConnected ? 'Connected — recovery, sleep & strain sync automatically' : 'Sync your recovery, sleep & strain data'}
                </p>
              </div>
              {whoopConnected ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleWhoopSync}
                    disabled={whoopSyncing}
                    title="Sync now"
                    className="p-2 rounded-lg text-text-secondary hover:text-white hover:bg-white/8 transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${whoopSyncing ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={handleWhoopDisconnect}
                    disabled={whoopLoading}
                    title="Disconnect"
                    className="p-2 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
                  >
                    <Unlink className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" loading={whoopLoading} onClick={handleWhoopConnect}>
                  Connect
                </Button>
              )}
            </div>

            {whoopConnected && whoopSummary && (
              <div className="grid grid-cols-3 gap-2 mt-4">
                {whoopSummary.recoveryScore !== undefined && (
                  <div className="bg-surface rounded-xl py-2.5 text-center">
                    <p className="text-base font-black text-success">{whoopSummary.recoveryScore}%</p>
                    <p className="text-[10px] text-text-tertiary">Recovery</p>
                  </div>
                )}
                {whoopSummary.sleepPerformancePercent !== undefined && (
                  <div className="bg-surface rounded-xl py-2.5 text-center">
                    <p className="text-base font-black text-blue-400">{whoopSummary.sleepPerformancePercent}%</p>
                    <p className="text-[10px] text-text-tertiary">Sleep</p>
                  </div>
                )}
                {whoopSummary.dayStrain !== undefined && (
                  <div className="bg-surface rounded-xl py-2.5 text-center">
                    <p className="text-base font-black text-accent">{whoopSummary.dayStrain.toFixed(1)}</p>
                    <p className="text-[10px] text-text-tertiary">Strain</p>
                  </div>
                )}
              </div>
            )}
          </Card>
        </motion.div>

        {/* Privacy & Data — self-service GDPR export/delete */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2 px-1">Privacy &amp; Data</h2>
          <Card className="overflow-hidden">
            <button
              onClick={handleExportData}
              disabled={exportingData}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors text-left border-b border-white/8"
            >
              <div className="p-2 bg-surface-elevated rounded-lg">
                <Download className="w-4 h-4 text-text-secondary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">Export My Data</p>
                <p className="text-xs text-text-secondary">Download everything we have on your account as a file</p>
              </div>
              {exportingData && <span className="text-xs text-text-tertiary">Preparing…</span>}
            </button>
            <button
              onClick={() => setDeleteAccountModal(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-danger/5 transition-colors text-left"
            >
              <div className="p-2 bg-danger/10 rounded-lg">
                <Trash2 className="w-4 h-4 text-danger" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-danger">Delete My Account</p>
                <p className="text-xs text-text-secondary">Permanently erase your account and all your data</p>
              </div>
            </button>
          </Card>
        </motion.div>

        {/* Admin Panel link — only visible to admins */}
        {profile?.role === 'admin' && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <Link href="/admin">
              <Card className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors border-danger/30">
                <div className="p-2 bg-danger/10 rounded-lg">
                  <LayoutDashboard className="w-4 h-4 text-danger" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Admin Panel</p>
                  <p className="text-xs text-text-secondary">Manage users, programs & platform</p>
                </div>
                <ChevronRight className="w-4 h-4 text-danger" />
              </Card>
            </Link>
          </motion.div>
        )}

        {/* Sign Out */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Button
            variant="danger"
            fullWidth
            size="lg"
            onClick={() => setSignOutModal(true)}
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </Button>
        </motion.div>

        <p className="text-center text-xs text-text-tertiary pb-4">
          Warfare Fitness · Built with ❤️ for athletes
        </p>
      </div>

      <Modal open={signOutModal} onClose={() => setSignOutModal(false)} title="Sign Out?">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">Are you sure you want to sign out?</p>
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={() => setSignOutModal(false)}>Cancel</Button>
            <Button variant="danger" fullWidth loading={signingOut} onClick={handleSignOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={deleteAccountModal} onClose={() => { setDeleteAccountModal(false); setDeleteConfirmText(''); }} title="Delete Your Account?">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            This permanently deletes your account, every workout, meal, weight entry, message, and photo you've logged, and cannot be undone.
          </p>
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Type <span className="font-bold text-white">DELETE</span> to confirm</label>
            <input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-danger/50"
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={() => { setDeleteAccountModal(false); setDeleteConfirmText(''); }}>Cancel</Button>
            <Button
              variant="danger"
              fullWidth
              loading={deletingAccount}
              disabled={deleteConfirmText !== 'DELETE'}
              onClick={handleDeleteAccount}
            >
              Delete Forever
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
