'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Dumbbell, Activity, Settings, Shield, ChevronRight } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getSystemConfig } from '@/lib/firestore';
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
  const [users, setUsers] = useState<UserData[]>([]);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'users')).then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserData))),
      getSystemConfig(),
    ]).then(([u, c]) => {
      setUsers(u);
      setConfig(c);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const stats = [
    { icon: Users, label: 'Total Users', value: users.length, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { icon: Dumbbell, label: 'Active Programs', value: 4, color: 'text-purple-400', bg: 'bg-purple-400/10' },
    { icon: Activity, label: 'Workouts Today', value: 0, color: 'text-green-400', bg: 'bg-green-400/10' },
    { icon: Shield, label: 'System Health', value: '100%', color: 'text-accent', bg: 'bg-accent-muted' },
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
              <p className="text-xl font-black text-white">{value}</p>
              <p className="text-xs text-text-secondary">{label}</p>
            </Card>
          </motion.div>
        ))}
      </div>

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
          <Users className="w-4 h-4 text-accent" /> Users ({users.length})
        </h2>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : users.length === 0 ? (
          <p className="text-text-secondary text-sm text-center py-4">No users yet</p>
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
                <Badge variant={u.role === 'admin' ? 'danger' : 'muted'}>{u.role || 'user'}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
