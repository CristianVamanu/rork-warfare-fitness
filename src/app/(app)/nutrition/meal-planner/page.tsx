'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Sparkles, Flame, Beef, ChevronDown, Plus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getIdToken } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { logMealAction, consumeAiTaste } from '@/lib/actions';
import { useFeatureAccess } from '@/lib/useFeatureAccess';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PaywallGate } from '@/components/ui/PaywallGate';

interface MealIdea {
  name: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  description: string;
  instructions: string[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const EXAMPLE_CHIPS = ['eggs, spinach, cheese', 'chicken, rice, broccoli', 'oats, banana, peanut butter'];

export default function MealPlannerPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { tasteAvailable } = useFeatureAccess('meal-planner');
  const [ingredients, setIngredients] = useState('');
  const [loading, setLoading] = useState(false);
  const [meals, setMeals] = useState<MealIdea[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [logging, setLogging] = useState<number | null>(null);

  async function handleSubmit() {
    if (!ingredients.trim() || !user) return;
    setLoading(true);
    setMeals(null);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/ai/meal-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ingredients }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate ideas');
      setMeals(data.meals);
      if (tasteAvailable) consumeAiTaste(user.uid, 'meal-planner').catch(console.error);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handleLog(meal: MealIdea, i: number) {
    if (!user) return;
    setLogging(i);
    try {
      await logMealAction(user.uid, {
        name: meal.name,
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        mealType: meal.mealType,
      });
      toast.success(`${meal.name} logged!`);
      router.push('/nutrition');
    } catch {
      toast.error('Failed to log meal');
    } finally {
      setLogging(null);
    }
  }

  return (
    <PaywallGate feature="meal-planner">
    <div className="min-h-screen bg-background pb-24">
      <div className="px-4 pt-12 pb-4 max-w-lg mx-auto">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-xl text-text-secondary hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 max-w-lg mx-auto space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-3">
            <Sparkles className="w-7 h-7 text-accent" />
          </div>
          <h1 className="text-xl font-black text-white">Smart Meal Planner</h1>
          <p className="text-text-secondary text-sm mt-1">Tell me what you have, I&apos;ll tell you what to cook.</p>
        </div>

        <Card className="p-4">
          <label className="text-xs font-medium text-text-secondary mb-2 block">I have...</label>
          <textarea
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
            placeholder="e.g. eggs, chicken breast, rice, onions"
            rows={3}
            className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {EXAMPLE_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => setIngredients(chip)}
                className="text-[10px] px-2.5 py-1 rounded-full bg-surface-elevated border border-white/10 text-text-secondary hover:border-accent/40 transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
          <Button fullWidth className="mt-3" onClick={handleSubmit} loading={loading} disabled={!ingredients.trim()}>
            <Sparkles className="w-4 h-4" /> {loading ? 'Thinking…' : 'Get Meal Ideas'}
          </Button>
        </Card>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-accent animate-spin" />
          </div>
        )}

        {meals && (
          <div className="space-y-3">
            {meals.map((meal, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <Card className="overflow-hidden">
                  <button onClick={() => setExpanded(expanded === i ? null : i)} className="w-full text-left p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold text-accent uppercase tracking-wide">{meal.mealType}</span>
                        <h3 className="text-base font-bold text-white mt-0.5">{meal.name}</h3>
                        <p className="text-xs text-text-secondary mt-1">{meal.description}</p>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-text-tertiary flex-shrink-0 transition-transform ${expanded === i ? 'rotate-180' : ''}`} />
                    </div>
                    <div className="flex items-center gap-3 mt-3 text-xs text-text-secondary">
                      <span className="flex items-center gap-1"><Flame className="w-3.5 h-3.5 text-orange-400" /> {meal.calories} kcal</span>
                      <span className="flex items-center gap-1"><Beef className="w-3.5 h-3.5 text-red-400" /> {meal.protein}g protein</span>
                    </div>
                  </button>

                  <AnimatePresence>
                    {expanded === i && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 border-t border-white/5 pt-3">
                          <ol className="space-y-1.5 mb-3">
                            {meal.instructions.map((step, j) => (
                              <li key={j} className="text-xs text-text-secondary flex gap-2">
                                <span className="text-accent font-bold flex-shrink-0">{j + 1}.</span> {step}
                              </li>
                            ))}
                          </ol>
                          <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                            <div className="bg-surface-elevated rounded-lg p-2">
                              <p className="text-xs font-bold text-white">{meal.carbs}g</p>
                              <p className="text-[9px] text-text-tertiary">Carbs</p>
                            </div>
                            <div className="bg-surface-elevated rounded-lg p-2">
                              <p className="text-xs font-bold text-white">{meal.fat}g</p>
                              <p className="text-[9px] text-text-tertiary">Fat</p>
                            </div>
                            <div className="bg-surface-elevated rounded-lg p-2">
                              <p className="text-xs font-bold text-white">{meal.protein}g</p>
                              <p className="text-[9px] text-text-tertiary">Protein</p>
                            </div>
                          </div>
                          <Button size="sm" fullWidth onClick={() => handleLog(meal, i)} loading={logging === i}>
                            <Plus className="w-3.5 h-3.5" /> Log This Meal
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
    </PaywallGate>
  );
}
