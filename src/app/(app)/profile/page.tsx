'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { motion } from 'framer-motion';
import { Edit2, Dumbbell, Flame, Zap, Trophy, MessageSquare, Crown, CheckCircle, XCircle, ExternalLink, Sun, Moon } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { updateUserDoc, getUserConversations, getMembershipConfig, getCoachingPlans } from '@/lib/firestore';
import { startCoachingCheckout } from '@/lib/checkout';
import { useTheme } from '@/contexts/ThemeContext';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import type { MembershipConfig, CoachingPlan } from '@/types';

// Separate component so useSearchParams doesn't block the page render
function SubscribeSuccessHandler({ onSuccess }: { onSuccess: () => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const subscribed = searchParams.get('subscribed');
    if (subscribed === '1') {
      toast.success('Membership activated! Welcome aboard 🎉');
      onSuccess();
    } else if (subscribed === 'coaching') {
      toast.success('Coaching plan activated! Your trainer has been notified 🎉');
      onSuccess();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [editModal, setEditModal] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [saving, setSaving] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [membershipConfig, setMembershipConfig] = useState<MembershipConfig | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [coachingPlans, setCoachingPlans] = useState<CoachingPlan[]>([]);
  const [subscribingPlanId, setSubscribingPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserConversations(user.uid)
      .then(convs => setUnreadMessages(convs.filter(c => c.unreadByUser).length))
      .catch(() => {});
    getMembershipConfig().then(setMembershipConfig).catch(() => {});
    getCoachingPlans().then(plans => setCoachingPlans(plans.filter(p => p.active))).catch(() => {});
  }, [user]);

  const handleSubscribeCoachingPlan = async (planId: string) => {
    if (!user) return;
    setSubscribingPlanId(planId);
    const err = await startCoachingCheckout(user, planId);
    if (err) { toast.error(err); setSubscribingPlanId(null); }
  };

  const handleSave = async () => {
    if (!user || !displayName.trim()) return;
    setSaving(true);
    try {
      await updateUserDoc(user.uid, { displayName: displayName.trim() });
      await refreshProfile();
      setEditModal(false);
      toast.success('Profile updated!');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleSubscribe = async () => {
    if (!user) return;
    setSubscribing(true);
    try {
      const res = await fetch('/api/stripe/member-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, userEmail: user.email }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error ?? 'Failed to open checkout');
      }
    } catch {
      toast.error('Failed to start checkout');
    } finally {
      setSubscribing(false);
    }
  };

  const handleCancelMembership = async () => {
    if (!user) return;
    if (!confirm('Cancel your membership? You will keep access until the end of your current billing period.')) return;
    setCancelling(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        toast.success('Membership cancelled — access continues until your billing period ends');
        await refreshProfile();
      } else {
        toast.error(data.error ?? 'Failed to cancel membership');
      }
    } catch {
      toast.error('Failed to cancel membership');
    } finally {
      setCancelling(false);
    }
  };

  const totalWorkouts = profile?.statsCache?.totalWorkouts ?? profile?.stats?.totalWorkouts ?? 0;
  const streak = profile?.statsCache?.streak ?? profile?.stats?.streak ?? 0;
  const powerLevel = profile?.powerLevel ?? profile?.stats?.powerLevel ?? 0;

  const membershipStatus = profile?.membership?.status ?? 'none';
  const isActive = membershipStatus === 'active';

  const expiresAt = profile?.membership?.expiresAt
    ? (() => {
        const raw = profile.membership!.expiresAt as { toDate?: () => Date } | string | number;
        if (typeof raw === 'object' && raw !== null && 'toDate' in raw) return (raw as { toDate: () => Date }).toDate();
        return new Date(raw as string | number);
      })()
    : null;

  // Check free trial
  const trialDays = (membershipConfig as (MembershipConfig & { trialDays?: number }) | null)?.trialDays ?? 0;
  const inTrial = (() => {
    if (!trialDays || !profile?.createdAt) return false;
    const created = (profile.createdAt as { toDate?: () => Date })?.toDate?.() ?? new Date(profile.createdAt as string);
    return Date.now() - created.getTime() < trialDays * 24 * 60 * 60 * 1000;
  })();

  const trialEndsAt = (() => {
    if (!trialDays || !profile?.createdAt) return null;
    const created = (profile.createdAt as { toDate?: () => Date })?.toDate?.() ?? new Date(profile.createdAt as string);
    return new Date(created.getTime() + trialDays * 24 * 60 * 60 * 1000);
  })();

  const stats = [
    { icon: Dumbbell, label: 'Workouts', value: totalWorkouts, color: 'text-purple-400' },
    { icon: Flame, label: 'Streak', value: `${streak}d`, color: 'text-orange-400' },
    { icon: Zap, label: 'Fitness Level', value: powerLevel, color: 'text-accent' },
    { icon: Trophy, label: 'Total kg', value: profile?.currentWeightKg ?? profile?.stats?.totalWeightLifted ?? 0, color: 'text-yellow-400' },
  ];

  // Show membership to all non-admin/trainer users, and also to admin so they can see what users see
  const showMembershipSection = !!membershipConfig?.enabled;

  return (
    <div>
      <Suspense fallback={null}>
        <SubscribeSuccessHandler onSuccess={refreshProfile} />
      </Suspense>
      <Header title="Profile" />
      <div className="px-4 py-4 space-y-5">
        {/* Profile Card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card glass className="p-6 text-center">
            <div className="relative inline-block mb-4">
              <Avatar name={profile?.displayName} src={profile?.photoURL} size="xl" />
              <button
                onClick={() => setEditModal(true)}
                className="absolute bottom-0 right-0 w-7 h-7 bg-accent rounded-full flex items-center justify-center"
              >
                <Edit2 className="w-3.5 h-3.5 text-black" />
              </button>
            </div>
            <h2 className="text-xl font-black text-white">{profile?.displayName || 'Athlete'}</h2>
            <p className="text-text-secondary text-sm mt-0.5">{user?.email}</p>
            <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
              <Badge variant={profile?.role === 'admin' ? 'danger' : profile?.role === 'trainer' ? 'accent' : 'muted'}>
                {profile?.role || 'user'}
              </Badge>
              <Badge variant="muted">{profile?.weightUnit || 'kg'}</Badge>
              {(isActive || inTrial) && (
                <Badge variant="info"><Crown className="w-3 h-3 inline mr-0.5" />{inTrial && !isActive ? 'Trial' : 'Member'}</Badge>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Membership Section */}
        {showMembershipSection && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2 px-1">Membership</h2>
            <Card className={`p-5 ${isActive || inTrial ? 'border-accent/30' : 'border-white/10'}`}>
              {isActive || inTrial ? (
                /* ── Active / Trial ── */
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center">
                      <Crown className="w-5 h-5 text-accent" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-white">{inTrial && !isActive ? 'Free Trial Active' : 'Membership Active'}</p>
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      </div>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {inTrial && !isActive && trialEndsAt
                          ? `Trial ends ${trialEndsAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                          : expiresAt
                          ? `Renews ${expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                          : 'Full access to all features'}
                      </p>
                    </div>
                  </div>
                  {inTrial && !isActive && membershipConfig && (
                    <div className="p-3 bg-accent/5 border border-accent/20 rounded-xl">
                      <p className="text-xs text-text-secondary">
                        Your free trial gives you full access. After it ends,{' '}
                        <span className="text-white font-medium">
                          ${membershipConfig.fee.toFixed(2)}/month
                        </span>{' '}
                        will be charged to continue.
                      </p>
                      <Button size="sm" className="mt-2 w-full" onClick={handleSubscribe} loading={subscribing}>
                        Add Payment Method
                      </Button>
                    </div>
                  )}
                  {isActive && (
                    profile?.membership?.cancelAtPeriodEnd ? (
                      <p className="text-xs text-text-tertiary text-center">
                        Cancelled — access continues until {expiresAt ? expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'the end of your billing period'}.
                      </p>
                    ) : (
                      <Button size="sm" variant="ghost" fullWidth onClick={handleCancelMembership} loading={cancelling}>
                        Cancel Membership
                      </Button>
                    )
                  )}
                </div>
              ) : (
                /* ── Not subscribed ── */
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-surface-elevated flex items-center justify-center">
                      <XCircle className="w-5 h-5 text-text-tertiary" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">No Active Membership</p>
                      <p className="text-xs text-text-secondary mt-0.5">Subscribe to unlock full access</p>
                    </div>
                  </div>

                  <div className="p-4 bg-surface-elevated rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-black text-white">${membershipConfig?.fee?.toFixed(2)}<span className="text-sm font-normal text-text-secondary">/mo</span></p>
                      {trialDays > 0 && (
                        <p className="text-xs text-accent mt-0.5">{trialDays}-day free trial included</p>
                      )}
                    </div>
                    <Crown className="w-6 h-6 text-accent" />
                  </div>

                  <Button fullWidth onClick={handleSubscribe} loading={subscribing}>
                    <Crown className="w-4 h-4" /> {subscribing ? 'Opening Checkout…' : (trialDays > 0 ? 'Start Free Trial' : 'Subscribe Now')}
                  </Button>

                  <p className="text-xs text-text-tertiary text-center">
                    Secure payment via Stripe. Cancel anytime.
                  </p>
                </div>
              )}
            </Card>
          </motion.div>
        )}

        {/* Coaching Plans — 1:1 personal training available for purchase */}
        {coachingPlans.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}>
            <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2 px-1">1:1 Coaching</h2>
            <div className="space-y-3">
              {coachingPlans.map((plan) => {
                const isCurrentPlan = profile?.membership?.status === 'active' && profile?.membership?.planId === plan.id;
                return (
                  <Card key={plan.id} className={`p-5 ${isCurrentPlan ? 'border-accent/30' : 'border-white/10'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-white">{plan.name}</p>
                          {isCurrentPlan && <Badge variant="success">Active</Badge>}
                        </div>
                        <p className="text-xs text-text-secondary mt-0.5">{plan.description}</p>
                      </div>
                      <p className="text-lg font-black text-white whitespace-nowrap">
                        ${plan.priceMonthly.toFixed(2)}<span className="text-xs font-normal text-text-secondary">/mo</span>
                      </p>
                    </div>
                    {plan.features?.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {plan.features.map((f, i) => (
                          <li key={i} className="flex items-center gap-2 text-xs text-text-secondary">
                            <CheckCircle className="w-3 h-3 text-accent flex-shrink-0" /> {f}
                          </li>
                        ))}
                      </ul>
                    )}
                    {!isCurrentPlan && (
                      <Button
                        fullWidth
                        className="mt-4"
                        onClick={() => handleSubscribeCoachingPlan(plan.id)}
                        loading={subscribingPlanId === plan.id}
                      >
                        <Crown className="w-4 h-4" /> {subscribingPlanId === plan.id ? 'Opening Checkout…' : 'Subscribe'}
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 gap-3"
        >
          {stats.map(({ icon: Icon, label, value, color }) => (
            <Card key={label} className="p-4 text-center">
              <Icon className={`w-5 h-5 ${color} mx-auto mb-2`} />
              <p className="text-xl font-black text-white">{value}</p>
              <p className="text-xs text-text-secondary mt-0.5">{label}</p>
            </Card>
          ))}
        </motion.div>

        {/* Fitness Level Bar */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-white">Fitness Level</span>
              <span className="text-accent font-black">{powerLevel}</span>
            </div>
            <div className="h-3 bg-white/8 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(powerLevel, 100)}%` }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="h-full bg-gradient-to-r from-accent to-amber-400 rounded-full animate-pulse-glow"
              />
            </div>
            <p className="text-xs text-text-secondary mt-2 text-center">
              Complete workouts to increase your power level
            </p>
          </Card>
        </motion.div>

        {/* Messages from Coach */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
          <Link href="/messages">
            <Card className="p-4 flex items-center gap-3 hover:bg-white/5 transition-colors">
              <div className="relative">
                <div className="p-2 bg-accent-muted rounded-lg">
                  <MessageSquare className="w-4 h-4 text-accent" />
                </div>
                {unreadMessages > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger rounded-full flex items-center justify-center text-[10px] font-bold text-white">
                    {unreadMessages}
                  </span>
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Messages from Coach</p>
                <p className="text-xs text-text-secondary">{unreadMessages > 0 ? `${unreadMessages} unread` : 'View your conversations'}</p>
              </div>
            </Card>
          </Link>
        </motion.div>

        {/* Appearance */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.19 }}>
          <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2 px-1">Appearance</h2>
          <Card className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-surface-elevated rounded-lg">
                {theme === 'dark' ? <Moon className="w-4 h-4 text-accent" /> : <Sun className="w-4 h-4 text-accent" />}
              </div>
              <div>
                <p className="text-sm font-medium text-white">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</p>
                <p className="text-xs text-text-secondary">Tap to switch theme</p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${theme === 'light' ? 'bg-accent' : 'bg-white/20'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${theme === 'light' ? 'translate-x-6' : 'translate-x-0'}`}
              />
            </button>
          </Card>
        </motion.div>

        {/* Member Since */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-text-secondary mb-0.5">Member since</p>
              <p className="text-sm font-medium text-white">
                {profile?.createdAt
                  ? new Date(
                      (profile.createdAt as { toDate?: () => Date }).toDate?.()?.getTime() || Date.now()
                    ).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                  : 'Today'}
              </p>
            </div>
            {isActive && (
              <a
                href="https://billing.stripe.com/p/login/test_00g00000000000000"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-accent hover:underline"
              >
                Manage billing <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </Card>
        </motion.div>
      </div>

      {/* Edit Modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit Profile">
        <div className="space-y-4">
          <Input
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={() => setEditModal(false)}>Cancel</Button>
            <Button fullWidth loading={saving} onClick={handleSave}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
