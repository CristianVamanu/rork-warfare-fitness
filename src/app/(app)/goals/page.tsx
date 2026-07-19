'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Target, Dumbbell, Scale, Flame, Apple, CheckCircle, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getClientGoals, updateGoalProgress } from '@/lib/firestore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import type { ClientGoal, GoalCategory } from '@/types';

const CATEGORY_ICON: Record<GoalCategory, React.ElementType> = {
  strength: Dumbbell,
  weight: Scale,
  workouts: Flame,
  nutrition: Apple,
  custom: Target,
};

function GoalCard({ goal, onUpdate }: { goal: ClientGoal; onUpdate: (value: number) => Promise<void> }) {
  const [value, setValue] = useState(String(goal.currentValue ?? ''));
  const [saving, setSaving] = useState(false);
  const Icon = CATEGORY_ICON[goal.category] ?? Target;
  const hasTarget = goal.targetValue !== undefined;
  const pct = hasTarget && goal.targetValue! > 0
    ? Math.min(100, Math.round(((goal.currentValue ?? 0) / goal.targetValue!) * 100))
    : null;

  async function handleSave() {
    const num = parseFloat(value);
    if (isNaN(num)) { toast.error('Enter a number'); return; }
    setSaving(true);
    try {
      await onUpdate(num);
      toast.success('Progress updated');
    } catch {
      toast.error('Failed to update');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={`p-4 ${goal.status === 'completed' ? 'border-success/30 bg-success/5' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center flex-shrink-0">
          {goal.status === 'completed' ? <CheckCircle className="w-5 h-5 text-success" /> : <Icon className="w-5 h-5 text-accent" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white">{goal.title}</p>
          {goal.description && <p className="text-xs text-text-secondary mt-0.5">{goal.description}</p>}
          {goal.targetDate && (
            <p className="text-[10px] text-text-tertiary mt-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Due {new Date(goal.targetDate).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {hasTarget && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-text-secondary">{goal.currentValue ?? 0}{goal.unit ?? ''} of {goal.targetValue}{goal.unit ?? ''}</span>
            {pct !== null && <span className="text-accent font-bold">{pct}%</span>}
          </div>
          <ProgressBar value={goal.currentValue ?? 0} max={goal.targetValue!} size="sm" />
        </div>
      )}

      {goal.status === 'active' && (
        <div className="flex items-center gap-2 mt-3">
          <input
            type="number"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Update progress"
            className="flex-1 bg-surface border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
          />
          <Button size="sm" onClick={handleSave} loading={saving}>Save</Button>
        </div>
      )}
    </Card>
  );
}

export default function GoalsPage() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<ClientGoal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getClientGoals(user.uid).then(setGoals).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  async function handleUpdate(goalId: string, value: number) {
    await updateGoalProgress(goalId, value);
    setGoals((prev) => prev.map((g) => g.id === goalId ? { ...g, currentValue: value } : g));
  }

  const active = goals.filter((g) => g.status === 'active');
  const past = goals.filter((g) => g.status !== 'active');

  return (
    <div>
      <Header title="My Goals" showBack />
      <div className="px-4 py-4 max-w-lg mx-auto space-y-3">
        {loading ? (
          <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        ) : goals.length === 0 ? (
          <Card className="p-10 text-center">
            <Target className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
            <p className="text-white font-bold">No goals yet</p>
            <p className="text-text-secondary text-sm mt-1">Your coach hasn&apos;t set any goals for you yet.</p>
          </Card>
        ) : (
          <>
            {active.map((goal, i) => (
              <motion.div key={goal.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <GoalCard goal={goal} onUpdate={(v) => handleUpdate(goal.id, v)} />
              </motion.div>
            ))}
            {past.length > 0 && (
              <div className="pt-2">
                <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2 px-1">Past Goals</p>
                <div className="space-y-3">
                  {past.map((goal) => (
                    <GoalCard key={goal.id} goal={goal} onUpdate={(v) => handleUpdate(goal.id, v)} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
