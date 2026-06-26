'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Camera, Barcode, Flame, Beef, Wheat, Droplets } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getTodayMeals, logWater, getTodayWater } from '@/lib/firestore';
import toast from 'react-hot-toast';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Meal } from '@/types';

const GOALS = { calories: 2200, protein: 160, carbs: 250, fat: 70, water: 3000 };
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export default function NutritionPage() {
  const { user } = useAuth();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [waterMl, setWaterMl] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) return;
    const [m, w] = await Promise.all([getTodayMeals(user.uid), getTodayWater(user.uid)]);
    setMeals(m as Meal[]);
    setWaterMl(w);
  };

  useEffect(() => {
    if (!user) return;
    refresh().finally(() => setLoading(false));
  }, [user]);

  const totals = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + (m.calories || 0),
      protein: acc.protein + (m.protein || 0),
      carbs: acc.carbs + (m.carbs || 0),
      fat: acc.fat + (m.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const addWater = async (ml: number) => {
    if (!user) return;
    await logWater(user.uid, ml);
    setWaterMl((w) => w + ml);
    toast.success(`+${ml}ml water logged`);
  };

  const mealsByType = MEAL_TYPES.reduce((acc, type) => {
    acc[type] = meals.filter((m) => m.mealType === type);
    return acc;
  }, {} as Record<string, Meal[]>);

  return (
    <div>
      <Header title="Nutrition" />
      <div className="px-4 py-4 space-y-5">
        {/* Macro Summary Ring */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-text-secondary">CALORIES TODAY</p>
                <p className="text-3xl font-black text-white">
                  {totals.calories}
                  <span className="text-sm font-medium text-text-secondary ml-1">/ {GOALS.calories}</span>
                </p>
              </div>
              <div className="relative w-16 h-16">
                <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                  <circle cx="18" cy="18" r="15.9155" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.9155" fill="none"
                    stroke="#F5A623" strokeWidth="3"
                    strokeDasharray={`${Math.min((totals.calories / GOALS.calories) * 100, 100)} 100`}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                  {Math.round((totals.calories / GOALS.calories) * 100)}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Beef, label: 'Protein', value: totals.protein, goal: GOALS.protein, color: 'text-red-400', bar: 'danger' },
                { icon: Wheat, label: 'Carbs', value: totals.carbs, goal: GOALS.carbs, color: 'text-yellow-400', bar: 'accent' },
                { icon: Flame, label: 'Fat', value: totals.fat, goal: GOALS.fat, color: 'text-orange-400', bar: 'accent' },
              ].map(({ icon: Icon, label, value, goal, color, bar }) => (
                <div key={label} className="p-3 bg-surface-elevated rounded-xl">
                  <Icon className={`w-3.5 h-3.5 ${color} mb-1`} />
                  <p className="text-xs text-text-secondary">{label}</p>
                  <p className="text-sm font-bold text-white">{value}g</p>
                  <ProgressBar value={value} max={goal} color={bar as 'accent' | 'success' | 'info' | 'danger'} size="sm" className="mt-1.5" />
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        {/* Water Tracker */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Droplets className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-white">Water</span>
              </div>
              <span className="text-sm font-bold text-white">
                {(waterMl / 1000).toFixed(1)}L
                <span className="text-text-secondary font-normal"> / {GOALS.water / 1000}L</span>
              </span>
            </div>
            <ProgressBar value={waterMl} max={GOALS.water} color="info" size="md" />
            <div className="flex gap-2 mt-3">
              {[150, 250, 500].map((ml) => (
                <button
                  key={ml}
                  onClick={() => addWater(ml)}
                  className="flex-1 py-2 text-xs font-medium text-blue-400 bg-blue-400/10 rounded-xl hover:bg-blue-400/20 transition-colors"
                >
                  +{ml}ml
                </button>
              ))}
            </div>
          </Card>
        </motion.div>

        {/* Quick Add Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/nutrition/analyze">
            <motion.div
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="p-4 bg-surface border border-white/8 rounded-2xl flex flex-col items-center gap-2"
            >
              <div className="p-3 bg-green-400/10 rounded-xl">
                <Camera className="w-5 h-5 text-green-400" />
              </div>
              <span className="text-sm font-medium text-white">AI Analyze</span>
              <span className="text-xs text-text-secondary text-center">Snap a photo</span>
            </motion.div>
          </Link>
          <Link href="/nutrition/barcode">
            <motion.div
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="p-4 bg-surface border border-white/8 rounded-2xl flex flex-col items-center gap-2"
            >
              <div className="p-3 bg-purple-400/10 rounded-xl">
                <Barcode className="w-5 h-5 text-purple-400" />
              </div>
              <span className="text-sm font-medium text-white">Scan Barcode</span>
              <span className="text-xs text-text-secondary text-center">Scan product</span>
            </motion.div>
          </Link>
        </div>

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
                    {mealsByType[type].reduce((s, m) => s + m.calories, 0)} kcal
                  </span>
                </div>
                {mealsByType[type].length === 0 ? (
                  <Card className="p-3 border-dashed border-white/8 flex items-center gap-2 text-text-tertiary">
                    <Plus className="w-4 h-4" />
                    <span className="text-xs">Add {type}</span>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {mealsByType[type].map((meal) => (
                      <Card key={meal.id} className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-white">{meal.name}</p>
                          <p className="text-xs text-text-secondary">{meal.protein}g P · {meal.carbs}g C · {meal.fat}g F</p>
                        </div>
                        <Badge variant="muted">{meal.calories} kcal</Badge>
                      </Card>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
