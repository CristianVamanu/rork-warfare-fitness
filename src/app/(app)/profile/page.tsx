'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Edit2, Dumbbell, Flame, Zap, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { updateUserDoc } from '@/lib/firestore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const [editModal, setEditModal] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [saving, setSaving] = useState(false);

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

  const stats = [
    { icon: Dumbbell, label: 'Workouts', value: profile?.stats?.totalWorkouts ?? 0, color: 'text-purple-400' },
    { icon: Flame, label: 'Streak', value: `${profile?.stats?.streak ?? 0}d`, color: 'text-orange-400' },
    { icon: Zap, label: 'Fitness Level', value: profile?.stats?.powerLevel ?? 1, color: 'text-accent' },
    { icon: Trophy, label: 'Total kg', value: profile?.stats?.totalWeightLifted ?? 0, color: 'text-yellow-400' },
  ];

  return (
    <div>
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
            <div className="flex items-center justify-center gap-2 mt-2">
              <Badge variant={profile?.role === 'admin' ? 'danger' : profile?.role === 'trainer' ? 'accent' : 'muted'}>
                {profile?.role || 'user'}
              </Badge>
              <Badge variant="muted">{profile?.weightUnit || 'kg'}</Badge>
            </div>
          </Card>
        </motion.div>

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
              <span className="text-accent font-black">{profile?.stats?.powerLevel ?? 1}</span>
            </div>
            <div className="h-3 bg-white/8 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((profile?.stats?.powerLevel ?? 1) / 100 * 100, 100)}%` }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="h-full bg-gradient-to-r from-accent to-amber-400 rounded-full animate-pulse-glow"
              />
            </div>
            <p className="text-xs text-text-secondary mt-2 text-center">
              Complete workouts to increase your power level
            </p>
          </Card>
        </motion.div>

        {/* Member Since */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="p-4">
            <p className="text-xs text-text-secondary mb-1">Member since</p>
            <p className="text-sm font-medium text-white">
              {profile?.createdAt
                ? new Date(
                    (profile.createdAt as { toDate?: () => Date }).toDate?.()?.getTime() || Date.now()
                  ).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                : 'Today'}
            </p>
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
