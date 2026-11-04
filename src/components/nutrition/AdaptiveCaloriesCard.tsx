'use client';

/**
 * Adaptive calories on the Nutrition page: the member's real maintenance
 * from the last 4 weeks of food logs and weigh-ins (lib/adaptiveCalories),
 * and a suggested target they can apply with one tap. Nothing changes until
 * they do; "Use the standard formula" switches back.
 */
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Activity } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getRecentEvents, updateUserGoals } from '@/lib/firestore';
import { estimateAdaptive, type AdaptiveResult } from '@/lib/adaptiveCalories';
import { kgToLbs } from '@/lib/utils';
import type { FitnessGoal, UserGoals } from '@/types';

export function AdaptiveCaloriesCard() {
  const { user, profile, refreshProfile } = useAuth();
  const [res, setRes] = useState<AdaptiveResult | { needs: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const mode = (profile as { nutritionTargetMode?: string } | null)?.nutritionTargetMode;
  const goals = profile?.goals as UserGoals | undefined;

  useEffect(() => {
    if (!user) return;
    let alive = true;
    Promise.all([getRecentEvents(user.uid, 'MEAL_LOGGED', 28), getRecentEvents(user.uid, 'WEIGHT_RECORDED', 28, 60)])
      .then(([meals, weights]) => {
        if (!alive) return;
        setRes(estimateAdaptive(
          meals.map((m) => ({ at: m.at, kcal: Number(m.payload.calories) || 0 })),
          weights.map((w) => ({ at: w.at, kg: Number(w.payload.weightKg) || 0 })),
          profile?.fitnessGoal as FitnessGoal | undefined,
        ));
      })
      .catch(() => { if (alive) setRes(null); });
    return () => { alive = false; };
  }, [user, profile?.fitnessGoal]);

  if (!res) return null;

  if ('needs' in res) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-accent" /><span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Adaptive calories</span></div>
        <p className="text-sm text-white mt-1.5 leading-snug">Your real maintenance calories, worked out from what you eat and how your weight moves.</p>
        <p className="text-xs text-text-secondary mt-1">Needs {res.needs} in the last 4 weeks.</p>
      </Card>
    );
  }

  const lbs = profile?.weightUnit === 'lbs';
  const trend = lbs ? Math.round(kgToLbs(res.kgPerWeek) * 10) / 10 : res.kgPerWeek;
  const current = goals?.calories ?? 0;
  const applied = mode === 'adaptive' && Math.abs(current - res.target) < 30;

  const apply = async () => {
    if (!user || !goals) return;
    setBusy(true);
    try {
      await updateUserGoals(user.uid, { ...goals, calories: res.target });
      await setDoc(doc(db, 'users', user.uid), { nutritionTargetMode: 'adaptive' }, { merge: true });
      await refreshProfile().catch(() => {});
      toast.success(`Daily target set to ${res.target.toLocaleString()} kcal`);
    } catch { toast.error('Could not update your target'); }
    finally { setBusy(false); }
  };
  const useFormula = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await setDoc(doc(db, 'users', user.uid), { nutritionTargetMode: 'formula' }, { merge: true });
      await refreshProfile().catch(() => {});
      toast.success('Back to the standard formula. It updates with your next weigh-in.');
    } catch { toast.error('Could not switch'); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-4 space-y-2.5">
      <div className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-accent" /><span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Adaptive calories · last 4 weeks</span></div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-surface-elevated p-3">
          <p className="text-[10px] text-text-tertiary uppercase tracking-wide">Your maintenance</p>
          <p className="text-xl font-black text-white tabular-nums">{res.maintenance.toLocaleString()}<span className="text-xs text-text-secondary ml-1">kcal</span></p>
        </div>
        <div className="rounded-xl bg-accent-muted p-3">
          <p className="text-[10px] text-accent uppercase tracking-wide font-bold">Suggested target</p>
          <p className="text-xl font-black text-white tabular-nums">{res.target.toLocaleString()}<span className="text-xs text-text-secondary ml-1">kcal</span></p>
        </div>
      </div>
      <p className="text-xs text-text-secondary leading-snug">
        From {res.loggedDays} logged days and {res.weighIns} weigh-ins: your weight is {trend === 0 ? 'flat' : `${trend > 0 ? 'up' : 'down'} ${Math.abs(trend)} ${lbs ? 'lb' : 'kg'} a week`}.
        {current ? ` Your target now: ${current.toLocaleString()} kcal.` : ''}
      </p>
      {applied ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-success">Adaptive target in use</span>
          <button onClick={useFormula} disabled={busy} className="text-xs text-text-tertiary underline underline-offset-2">Use the standard formula</button>
        </div>
      ) : (
        <Button size="sm" onClick={apply} disabled={busy || !goals}>Use {res.target.toLocaleString()} kcal as my daily target</Button>
      )}
      <p className="text-[11px] text-text-tertiary">An estimate from your own logs. Log food honestly and weigh in at the same time of day for the best number.</p>
    </Card>
  );
}
