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

// Self-serve weight goal set at onboarding (UserProfile.weightGoal) — kept
// separate from ClientGoal below since those are coach/admin-authored only
// (firestore.rules: allow create: if isStaff()). Progress reads straight
// from profile.currentWeightKg, which the progress/profile weigh-in flows
// already keep updated — no separate check-in mechanism needed here.
function WeightGoalCard({ startWeightKg, targetWeightKg, currentWeightKg, estimatedTargetDate, direction }: {
  startWeightKg: number; targetWeightKg: number; currentWeightKg: number; estimatedTargetDate: string; direction: 'lose' | 'gain' | 'maintain';
}) {
  const totalChange = Math.abs(targetWeightKg - startWeightKg);
  const progressSoFar = direction === 'lose' ? startWeightKg - currentWeightKg : currentWeightKg - startWeightKg;
  const pct = totalChange > 0 ? Math.min(100, Math.max(0, Math.round((progressSoFar / totalChange) * 100))) : 100;
  const reached = direction === 'lose' ? currentWeightKg <= targetWeightKg : direction === 'gain' ? currentWeightKg >= targetWeightKg : true;

  return (
    <Card className={`p-4 ${reached ? 'border-success/30 bg-success/5' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center flex-shrink-0">
          {reached ? <CheckCircle className="w-5 h-5 text-success" /> : <Scale className="w-5 h-5 text-accent" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white">Weight Goal</p>
          <p className="text-xs text-text-secondary mt-0.5">
            {reached ? 'Goal reached!' : `${direction === 'lose' ? 'Lose' : 'Gain'} to ${targetWeightKg}kg`}
          </p>
          <p className="text-[10px] text-text-tertiary mt-1 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Estimated {new Date(estimatedTargetDate).toLocaleDateString()}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-text-secondary">{currentWeightKg}kg of {targetWeightKg}kg (started at {startWeightKg}kg)</span>
          {!reached && <span className="text-accent font-bold">{pct}%</span>}
        </div>
        <ProgressBar value={pct} max={100} size="sm" />
      </div>
    </Card>
  );
}

export default function GoalsPage() {
  const { user, profile } = useAuth();
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
  const weightGoal = profile?.weightGoal;

  return (
    <div>
      <Header title="My Goals" showBack />
      <div className="px-4 py-4 max-w-lg mx-auto space-y-3">
        {weightGoal && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <WeightGoalCard
              startWeightKg={weightGoal.startWeightKg}
              targetWeightKg={weightGoal.targetWeightKg}
              currentWeightKg={profile?.currentWeightKg ?? weightGoal.startWeightKg}
              estimatedTargetDate={weightGoal.estimatedTargetDate}
              direction={weightGoal.direction}
            />
          </motion.div>
        )}
        {loading ? (
          <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        ) : goals.length === 0 ? (
          !weightGoal && (
            <Card className="p-10 text-center">
              <Target className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
              <p className="text-white font-bold">No goals yet</p>
              <p className="text-text-secondary text-sm mt-1">No goals have been set for you yet.</p>
            </Card>
          )
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
