'use client';
export const dynamic = 'force-dynamic';

import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { ACHIEVEMENT_DEFS, type AchievementDef } from '@/lib/achievements';

const CATEGORY_LABELS: Record<AchievementDef['category'], string> = {
  workouts: 'Workout Milestones',
  streak: 'Streaks',
  power: 'Power Level',
  time: 'Time of Day',
  nutrition: 'Nutrition',
};

export default function AchievementsPage() {
  const { profile } = useAuth();
  const earned = new Set(profile?.achievements ?? []);

  const categories = Array.from(new Set(ACHIEVEMENT_DEFS.map((d) => d.category)));

  return (
    <div className="min-h-screen bg-background pb-24">
      <Header title="Achievements" />
      <div className="px-4 pt-4 max-w-lg mx-auto space-y-5">
        <Card className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Your Collection</p>
            <p className="text-xs text-text-secondary mt-0.5">{earned.size} of {ACHIEVEMENT_DEFS.length} unlocked</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-accent-muted flex items-center justify-center">
            <span className="text-sm font-black text-accent">{earned.size}/{ACHIEVEMENT_DEFS.length}</span>
          </div>
        </Card>

        {categories.map((cat) => (
          <div key={cat}>
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-2">
              {CATEGORY_LABELS[cat]}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {ACHIEVEMENT_DEFS.filter((d) => d.category === cat).map((def, i) => {
                const unlocked = earned.has(def.id);
                return (
                  <motion.div
                    key={def.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <Card className={`p-3.5 text-center ${unlocked ? 'border-accent/30 bg-accent/5' : 'opacity-50'}`}>
                      <div className="relative w-10 h-10 mx-auto mb-2 flex items-center justify-center">
                        {unlocked ? (
                          <span className="text-3xl">{def.icon}</span>
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-surface-elevated flex items-center justify-center">
                            <Lock className="w-4 h-4 text-text-tertiary" />
                          </div>
                        )}
                      </div>
                      <p className="text-xs font-bold text-white">{def.title}</p>
                      <p className="text-[10px] text-text-secondary mt-0.5 leading-snug">{def.desc}</p>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
