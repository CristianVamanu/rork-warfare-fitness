'use client';
export const dynamic = 'force-dynamic';

import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { QUEST_DEFS, requirementProgress, isQuestComplete, type QuestProgressInput } from '@/lib/quests';
import { PaywallGate } from '@/components/ui/PaywallGate';

export default function QuestsPage() {
  const { profile } = useAuth();
  const completed = new Set(profile?.questsCompleted ?? []);

  const stats: QuestProgressInput = {
    totalWorkouts: profile?.statsCache?.totalWorkouts ?? profile?.stats?.totalWorkouts ?? 0,
    streak: profile?.statsCache?.streak ?? profile?.stats?.streak ?? 0,
    powerLevel: profile?.powerLevel ?? 0,
    totalWeightLifted: profile?.stats?.totalWeightLifted ?? 0,
    totalMealsLogged: profile?.stats?.totalMealsLogged ?? 0,
  };

  return (
    <div className="min-h-screen pb-24">
      <Header title="Quests" showBack />
      <PaywallGate feature="quests" noTaste>
      <div className="px-4 pt-4 max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto space-y-4">
        <Card className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Missions</p>
            <p className="text-xs text-text-secondary mt-0.5">{completed.size} of {QUEST_DEFS.length} completed</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-accent-muted flex items-center justify-center">
            <span className="text-sm font-black text-accent">{completed.size}/{QUEST_DEFS.length}</span>
          </div>
        </Card>

        {QUEST_DEFS.map((quest, i) => {
          const done = completed.has(quest.id) || isQuestComplete(quest, stats);
          return (
            <motion.div
              key={quest.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className={`p-4 ${done ? 'border-accent/40 bg-accent/5' : ''}`}>
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-3xl flex-shrink-0">{quest.rewardIcon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white">{quest.title}</h3>
                      {done && <CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5">{quest.tagline}</p>
                  </div>
                </div>

                <div className="space-y-2.5 mb-3">
                  {quest.requirements.map((req) => {
                    const pct = requirementProgress(req, stats);
                    const reqDone = pct >= 1;
                    return (
                      <div key={req.label}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className={reqDone ? 'text-accent' : 'text-text-secondary'}>{req.label}</span>
                          <span className="text-text-tertiary">{Math.round(pct * 100)}%</span>
                        </div>
                        <ProgressBar value={pct * 100} max={100} color="accent" size="sm" />
                      </div>
                    );
                  })}
                </div>

                <div className={`text-xs font-bold rounded-lg py-2 text-center ${done ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'}`}>
                  {done ? `🎉 ${quest.rewardTitle} Earned` : `Reward: ${quest.rewardTitle}`}
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
      </PaywallGate>
    </div>
  );
}
