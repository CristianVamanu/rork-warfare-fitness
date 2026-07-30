'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Camera, Barcode, Flame, Beef, Wheat, Droplets, Trash2, Settings, X, Check, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getTodayMeals, getTodayWaterLogs, deleteWaterLog, deleteMeal, getUserGoals, updateUserGoals, getMealsForDate } from '@/lib/firestore';
import { logWaterAction } from '@/lib/actions';
import toast from 'react-hot-toast';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import type { Meal, UserGoals } from '@/types';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const DEFAULT_GOALS: UserGoals = { calories: 2200, protein: 160, carbs: 250, fat: 70, water: 3000 };

interface WaterLog { id: string; amountMl: number; loggedAt: unknown }

function formatDate(d: Date): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function NutritionPageInner() {
  const { user, profile, loading: authLoading } = useAuth();
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [goals, setGoals] = useState<UserGoals>(DEFAULT_GOALS);
  const [loading, setLoading] = useState(true);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [editGoals, setEditGoals] = useState<UserGoals>(DEFAULT_GOALS);
  const [savingGoals, setSavingGoals] = useState(false);
  const [customWaterMl, setCustomWaterMl] = useState('');
  const [showWaterHistory, setShowWaterHistory] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });

  const isToday = selectedDate.toDateString() === new Date().toDateString();
  const waterMl = waterLogs.reduce((sum, w) => sum + w.amountMl, 0);

  const shiftDate = (delta: number) => {
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta);
      return d;
    });
  };

  const refresh = useCallback(async () => {
    if (!user) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isCurrentDay = selectedDate.toDateString() === today.toDateString();
    const localDateStr = new Date().toLocaleDateString('sv-SE');
    const [m, wLogs, g] = await Promise.all([
      isCurrentDay ? getTodayMeals(user.uid, localDateStr) : getMealsForDate(user.uid, selectedDate),
      isCurrentDay ? getTodayWaterLogs(user.uid, localDateStr) : Promise.resolve([] as WaterLog[]),
      getUserGoals(user.uid),
    ]);
    setMeals(m as Meal[]);
    setWaterLogs(wLogs);
    setGoals(g);
  }, [user, selectedDate]);

  useEffect(() => {
    // Previously bailed out (without ever clearing `loading`) whenever this
    // effect ran before `user` had resolved yet — if auth took a moment,
    // the skeleton loaders under the scanner buttons would spin forever
    // instead of just waiting for the next re-run. Now it explicitly stops
    // waiting once auth itself has settled with no user, instead of only
    // relying on a second `user`-truthy re-run that might not come.
    if (!user) {
      if (!authLoading) setLoading(false);
      return;
    }
    refresh().finally(() => setLoading(false));
  }, [user, authLoading, refresh]);

  useEffect(() => {
    const onFocus = () => { if (!loading) refresh().catch(console.error); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh, loading]);


  // Rounded once here (to 1 decimal for macros, whole kcal for calories)
  // rather than at each render site — summing many meals' decimal grams
  // (e.g. AI-estimated 24.4g + 24.4g + ...) accumulates plain binary
  // floating-point error, showing as "24.400000000000002g" if left raw.
  const rawTotals = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + (m.calories || 0),
      protein: acc.protein + (m.protein || 0),
      carbs: acc.carbs + (m.carbs || 0),
      fat: acc.fat + (m.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const totals = {
    calories: Math.round(rawTotals.calories),
    protein: Math.round(rawTotals.protein * 10) / 10,
    carbs: Math.round(rawTotals.carbs * 10) / 10,
    fat: Math.round(rawTotals.fat * 10) / 10,
  };

  const addWater = async (ml: number) => {
    if (!user) return;
    // Optimistic update — show immediately, revert on failure
    const tempId = `temp-${Date.now()}`;
    setWaterLogs((prev) => [...prev, { id: tempId, amountMl: ml, loggedAt: new Date() }]);
    try {
      await logWaterAction(user.uid, ml);
      toast.success(`+${ml}ml logged`);
      // Background sync to replace temp entry with real Firestore doc
      getTodayWaterLogs(user.uid, new Date().toLocaleDateString('sv-SE')).then(setWaterLogs).catch(console.error);
    } catch (err: unknown) {
      setWaterLogs((prev) => prev.filter((w) => w.id !== tempId));
      const e = err as Error & { code?: string };
      const isPermission = e?.code === 'permission-denied';
      toast.error(isPermission ? 'Save failed: check Firestore rules' : (e?.message || 'Failed to log water'));
    }
  };

  const handleCustomWater = async () => {
    const ml = parseInt(customWaterMl);
    if (!ml || ml <= 0 || ml > 5000) { toast.error('Enter a valid amount (1–5000 ml)'); return; }
    await addWater(ml);
    setCustomWaterMl('');
  };

  const removeWaterLog = async (id: string, amountMl: number) => {
    try {
      await deleteWaterLog(id);
      setWaterLogs((prev) => prev.filter((w) => w.id !== id));
      toast.success(`-${amountMl}ml removed`);
    } catch (err: unknown) {
      toast.error((err as Error)?.message || 'Failed to remove water log');
    }
  };

  const removeMeal = async (meal: Meal) => {
    if (!window.confirm(`Remove "${meal.name}"?`)) return;
    try {
      await deleteMeal(meal.id);
      setMeals((prev) => prev.filter((m) => m.id !== meal.id));
      toast.success('Meal removed');
    } catch (err: unknown) {
      toast.error((err as Error)?.message || 'Failed to remove meal');
    }
  };

  const saveGoals = async () => {
    if (!user) return;
    setSavingGoals(true);
    try {
      await updateUserGoals(user.uid, editGoals);
      setGoals(editGoals);
      setShowGoalsModal(false);
      toast.success('Goals updated');
    } catch (err: unknown) {
      toast.error((err as Error)?.message || 'Failed to save goals');
    } finally {
      setSavingGoals(false);
    }
  };

  const mealsByType = MEAL_TYPES.reduce((acc, type) => {
    acc[type] = meals.filter((m) => m.mealType === type);
    return acc;
  }, {} as Record<string, Meal[]>);

  return (
    <div>
      <Header title="Nutrition" rightElement={
        <button onClick={() => { setEditGoals(goals); setShowGoalsModal(true); }} className="p-2 text-text-secondary hover:text-white">
          <Settings className="w-5 h-5" />
        </button>
      } />

      {/* Date navigator */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/8 bg-surface/50">
        <button
          onClick={() => shiftDate(-1)}
          className="p-1.5 rounded-lg text-text-secondary hover:text-white hover:bg-white/5 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-sm font-semibold text-white">{formatDate(selectedDate)}</p>
        <button
          onClick={() => shiftDate(1)}
          disabled={isToday}
          className="p-1.5 rounded-lg text-text-secondary hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* Coach-assigned nutrition plan banner */}
        {profile?.assignedNutritionPlan && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <button onClick={() => setShowPlanModal(true)} className="w-full text-left">
              <Card className="p-4 border-accent/30 bg-accent/5 flex items-center gap-3">
                <div className="p-2 rounded-xl bg-accent-muted flex-shrink-0">
                  <Beef className="w-4 h-4 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">Your Coach&apos;s Nutrition Plan</p>
                  <p className="text-xs text-text-secondary">
                    {profile.assignedNutritionPlan.calories}kcal · {profile.assignedNutritionPlan.protein}p / {profile.assignedNutritionPlan.carbs}c / {profile.assignedNutritionPlan.fat}f
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-text-tertiary flex-shrink-0" />
              </Card>
            </button>
          </motion.div>
        )}

        {/* Macro Summary */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-text-secondary">CALORIES {isToday ? 'TODAY' : formatDate(selectedDate).toUpperCase()}</p>
                <p className="text-3xl font-black text-white">
                  {totals.calories}
                  <span className="text-sm font-medium text-text-secondary ml-1">/ {goals.calories}</span>
                </p>
                {totals.calories > goals.calories && (
                  <p className="text-xs text-red-400 mt-0.5">⚠ Over by {totals.calories - goals.calories} kcal</p>
                )}
              </div>
              <div className="relative w-16 h-16">
                <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                  <circle cx="18" cy="18" r="15.9155" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.9155" fill="none"
                    stroke={totals.calories > goals.calories ? '#ef4444' : '#F5A623'} strokeWidth="3"
                    strokeDasharray={`${Math.min((totals.calories / goals.calories) * 100, 100)} 100`}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                  {Math.round((totals.calories / goals.calories) * 100)}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Beef, label: 'Protein', value: totals.protein, goal: goals.protein, color: 'text-red-400', bar: 'danger' as const },
                { icon: Wheat, label: 'Carbs', value: totals.carbs, goal: goals.carbs, color: 'text-yellow-400', bar: 'accent' as const },
                { icon: Flame, label: 'Fat', value: totals.fat, goal: goals.fat, color: 'text-orange-400', bar: 'accent' as const },
              ].map(({ icon: Icon, label, value, goal, color, bar }) => (
                <div key={label} className="p-3 bg-surface-elevated rounded-xl">
                  <Icon className={`w-3.5 h-3.5 ${color} mb-1`} />
                  <p className="text-xs text-text-secondary">{label}</p>
                  <p className="text-sm font-bold text-white">{value}g <span className="text-text-tertiary font-normal text-[10px]">/ {goal}g</span></p>
                  <ProgressBar value={value} max={goal} color={bar} size="sm" className="mt-1.5" />
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        {/* Water Tracker — today only */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Droplets className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-white">Water</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">
                  {(waterMl / 1000).toFixed(1)}L
                  <span className="text-text-secondary font-normal"> / {goals.water / 1000}L</span>
                </span>
                {waterLogs.length > 0 && (
                  <button onClick={() => setShowWaterHistory(!showWaterHistory)} className="text-xs text-blue-400 hover:underline">
                    {showWaterHistory ? 'Hide' : 'History'}
                  </button>
                )}
              </div>
            </div>
            <ProgressBar value={waterMl} max={goals.water} color="info" size="md" />
            {isToday && <div className="grid grid-cols-4 gap-2 mt-3">
              {[250, 500, 750, 1000].map((ml) => (
                <button
                  key={ml}
                  onClick={() => addWater(ml)}
                  className="py-2 text-xs font-medium text-blue-400 bg-blue-400/10 rounded-xl hover:bg-blue-400/20 transition-colors"
                >
                  +{ml >= 1000 ? `${ml / 1000}L` : `${ml}ml`}
                </button>
              ))}
            </div>}
            {/* Custom amount — today only */}
            {isToday && <div className="flex gap-2 mt-2">
              <input
                type="number"
                placeholder="Custom ml..."
                value={customWaterMl}
                onChange={(e) => setCustomWaterMl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCustomWater()}
                className="flex-1 bg-surface-elevated text-white text-sm px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-blue-400 placeholder:text-text-tertiary"
              />
              <button onClick={handleCustomWater} className="px-3 py-2 bg-blue-400/20 text-blue-400 rounded-xl hover:bg-blue-400/30 transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>}
            {/* Water history */}
            <AnimatePresence>
              {showWaterHistory && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-3 space-y-1.5 overflow-hidden">
                  {waterLogs.map((w) => (
                    <div key={w.id} className="flex items-center justify-between bg-surface-elevated rounded-xl px-3 py-2">
                      <span className="text-sm text-white">+{w.amountMl}ml</span>
                      <button onClick={() => removeWaterLog(w.id, w.amountMl)} className="text-text-tertiary hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>

        {/* Quick Add Buttons — today only */}
        {isToday && <div className="grid grid-cols-3 gap-2.5">
          <Link href="/nutrition/analyze">
            <motion.div
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="p-3 bg-surface border border-white/8 rounded-2xl flex flex-col items-center gap-2"
            >
              <div className="p-2.5 bg-green-400/10 rounded-xl">
                <Camera className="w-4.5 h-4.5 text-green-400" />
              </div>
              <span className="text-xs font-medium text-white text-center">AI Analyze</span>
            </motion.div>
          </Link>
          <Link href="/nutrition/barcode">
            <motion.div
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="p-3 bg-surface border border-white/8 rounded-2xl flex flex-col items-center gap-2"
            >
              <div className="p-2.5 bg-purple-400/10 rounded-xl">
                <Barcode className="w-4.5 h-4.5 text-purple-400" />
              </div>
              <span className="text-xs font-medium text-white text-center">Scan Barcode</span>
            </motion.div>
          </Link>
          <Link href="/nutrition/meal-planner">
            <motion.div
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="p-3 bg-surface border border-white/8 rounded-2xl flex flex-col items-center gap-2"
            >
              <div className="p-2.5 bg-accent-muted rounded-xl">
                <Sparkles className="w-4.5 h-4.5 text-accent" />
              </div>
              <span className="text-xs font-medium text-white text-center">Meal Ideas</span>
            </motion.div>
          </Link>
        </div>}

        {/* Meals by Type */}
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        ) : (
          <div className="space-y-4">
            {MEAL_TYPES.map((type) => (
              <motion.div key={type} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-white capitalize">{type}</h3>
                  <span className="text-xs text-text-tertiary">
                    {mealsByType[type].reduce((s, m) => s + (m.calories || 0), 0)} kcal
                  </span>
                </div>
                {mealsByType[type].length === 0 ? (
                  <Link href={`/nutrition/analyze?mealType=${type}`}>
                    <Card className="p-3 border-dashed border-white/8 flex items-center gap-2 text-text-tertiary hover:border-accent/30 transition-colors cursor-pointer">
                      <Plus className="w-4 h-4" />
                      <span className="text-xs">Add {type}</span>
                    </Card>
                  </Link>
                ) : (
                  <div className="space-y-2">
                    {mealsByType[type].map((meal) => (
                      <Card key={meal.id} className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-white">{meal.name}</p>
                          <p className="text-xs text-text-secondary">{meal.protein}g P · {meal.carbs}g C · {meal.fat}g F</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="muted">{meal.calories} kcal</Badge>
                          <button onClick={() => removeMeal(meal)} className="text-text-tertiary hover:text-red-400 transition-colors p-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Goals Modal */}
      <Modal open={showGoalsModal} onClose={() => setShowGoalsModal(false)} title="Daily Goals">
        <div className="space-y-4 p-4">
          {([
            { key: 'calories', label: 'Calories', unit: 'kcal', min: 500, max: 10000 },
            { key: 'protein', label: 'Protein', unit: 'g', min: 10, max: 500 },
            { key: 'carbs', label: 'Carbohydrates', unit: 'g', min: 10, max: 1000 },
            { key: 'fat', label: 'Fat', unit: 'g', min: 10, max: 500 },
            { key: 'water', label: 'Water', unit: 'ml', min: 500, max: 10000 },
          ] as Array<{ key: keyof UserGoals; label: string; unit: string; min: number; max: number }>).map(({ key, label, unit, min, max }) => (
            <div key={key}>
              <label className="text-xs text-text-secondary block mb-1.5">{label} ({unit})</label>
              <input
                type="number"
                min={min}
                max={max}
                value={editGoals[key]}
                onChange={(e) => setEditGoals((g) => ({ ...g, [key]: parseInt(e.target.value) || 0 }))}
                className="w-full bg-surface-elevated text-white px-3 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-accent text-sm"
              />
            </div>
          ))}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" fullWidth onClick={() => setShowGoalsModal(false)}>
              <X className="w-4 h-4" /> Cancel
            </Button>
            <Button fullWidth loading={savingGoals} onClick={saveGoals}>
              <Check className="w-4 h-4" /> Save
            </Button>
          </div>
        </div>
      </Modal>

      {profile?.assignedNutritionPlan && (
        <Modal open={showPlanModal} onClose={() => setShowPlanModal(false)} title="Your Nutrition Plan">
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2 text-center">
              {([
                { key: 'calories', label: 'kcal' },
                { key: 'protein', label: 'protein' },
                { key: 'carbs', label: 'carbs' },
                { key: 'fat', label: 'fat' },
              ] as const).map(({ key, label }) => (
                <div key={key} className="p-2 bg-surface-elevated rounded-xl">
                  <p className="text-lg font-black text-white">{profile.assignedNutritionPlan![key]}</p>
                  <p className="text-[10px] text-text-tertiary">{label}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              {profile.assignedNutritionPlan.meals.map((meal, i) => (
                <Card key={i} className="p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-bold text-white">{meal.name}</p>
                    {meal.calories ? <span className="text-xs text-text-tertiary">{meal.calories}kcal</span> : null}
                  </div>
                  <ul className="space-y-1">
                    {meal.items.map((item, j) => (
                      <li key={j} className="text-xs text-text-secondary">• {item}</li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>

            {profile.assignedNutritionPlan.coachNotes && (
              <div className="p-3 bg-accent/5 border border-accent/20 rounded-xl">
                <p className="text-xs text-text-secondary">{profile.assignedNutritionPlan.coachNotes}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function NutritionPage() {
  return <NutritionPageInner />;
}
