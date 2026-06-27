'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Dumbbell, Activity, Settings, Shield, CreditCard, CheckCircle, AlertTriangle,
} from 'lucide-react';
import {
  collection, getDocs, query, where, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getSystemConfig, getPrograms } from '@/lib/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

interface UserData {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
  stats?: { totalWorkouts?: number; streak?: number };
  createdAt?: unknown;
}

export default function AdminPage() {
  const { tenant, profile } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [programCount, setProgramCount] = useState(0);
  const [workoutsToday, setWorkoutsToday] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const trainerId = profile?.trainerId;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    Promise.all([
      // Users scoped to this trainer
      trainerId
        ? getDocs(
            query(collection(db, 'users'), where('trainerId', '==', trainerId))
          ).then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserData)))
        : getDocs(collection(db, 'users')).then((snap) =>
            snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserData))
          ),
      getSystemConfig(),
      // Programs scoped to trainer
      getPrograms(trainerId).catch(() => []),
      // Workouts today — count WORKOUT_COMPLETED events
      getDocs(
        query(
          collection(db, 'events'),
          where('type', '==', 'WORKOUT_COMPLETED'),
          ...(trainerId ? [where('trainerId', '==', trainerId)] : []),
          where('createdAt', '>=', Timestamp.fromDate(todayStart))
        )
      ).then((s) => s.size).catch(() => 0),
    ])
      .then(([u, c, programs, wToday]) => {
        setUsers(u as UserData[]);
        setConfig(c);
        setProgramCount((programs as unknown[]).length);
        setWorkoutsToday(wToday as number);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [profile?.trainerId]);

  const stripeStatus = tenant?.stripe?.subscriptionStatus ?? 'inactive';
  const stripeLabel =
    stripeStatus === 'active' ? 'Active' :
    stripeStatus === 'trialing' ? 'Trial' :
    stripeStatus === 'past_due' ? 'Past Due' :
    stripeStatus === 'canceled' ? 'Canceled' : 'Not set up';
  const stripeColor =
    stripeStatus === 'active' ? 'text-success' :
    stripeStatus === 'trialing' ? 'text-yellow-400' :
    stripeStatus === 'past_due' || stripeStatus === 'canceled' ? 'text-danger' :
    'text-text-tertiary';

  const stats = [
    { icon: Users, label: 'Total Clients', value: users.filter(u => u.role !== 'admin').length, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { icon: Dumbbell, label: 'Programs', value: programCount, color: 'text-purple-400', bg: 'bg-purple-400/10' },
    { icon: Activity, label: 'Workouts Today', value: workoutsToday, color: 'text-green-400', bg: 'bg-green-400/10' },
    { icon: Shield, label: 'System Health', value: '✓', color: 'text-accent', bg: 'bg-accent-muted' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">Admin Dashboard</h1>
        <p className="text-text-secondary text-sm mt-1">Manage your Warfare Fitness platform</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(({ icon: Icon, label, value, color, bg }) => (
          <motion.div key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="p-4">
              <div className={`inline-flex p-2 rounded-lg ${bg} mb-2`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="text-xl font-black text-white">{loading ? '—' : value}</p>
              <p className="text-xs text-text-secondary">{label}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Subscription status */}
      <Card className="p-5">
        <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-accent" /> Subscription
        </h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {stripeStatus === 'active' ? (
              <CheckCircle className="w-5 h-5 text-success" />
            ) : stripeStatus === 'past_due' || stripeStatus === 'canceled' ? (
              <AlertTriangle className="w-5 h-5 text-danger" />
            ) : (
              <CreditCard className="w-5 h-5 text-text-tertiary" />
            )}
            <span className={`text-sm font-medium ${stripeColor}`}>{stripeLabel}</span>
          </div>
          {tenant?.stripe?.currentPeriodEnd != null && stripeStatus !== 'inactive' ? (
            <p className="text-xs text-text-secondary">
              Renews {new Date(String(tenant.stripe.currentPeriodEnd)).toLocaleDateString()}
            </p>
          ) : null}
        </div>
        {stripeStatus === 'inactive' && (
          <p className="text-xs text-text-secondary mt-2">
            Set STRIPE_SECRET_KEY env var and configure a subscription price to enable billing.
          </p>
        )}
      </Card>

      {/* System Config */}
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

      {/* Users Table */}
      <Card className="p-5">
        <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-accent" /> Clients ({users.filter(u => u.role !== 'admin').length})
        </h2>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : users.length === 0 ? (
          <p className="text-text-secondary text-sm text-center py-4">No clients yet</p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 p-3 bg-surface-elevated rounded-xl">
                <div className="w-8 h-8 rounded-full bg-accent-muted flex items-center justify-center text-accent text-xs font-bold">
                  {u.displayName?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{u.displayName || 'Unknown'}</p>
                  <p className="text-xs text-text-secondary truncate">{u.email}</p>
                </div>
                <div className="text-right">
                  <Badge variant={u.role === 'admin' ? 'danger' : 'muted'}>{u.role || 'user'}</Badge>
                  {u.stats?.totalWorkouts != null && (
                    <p className="text-[10px] text-text-tertiary mt-0.5">{u.stats.totalWorkouts} workouts</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
