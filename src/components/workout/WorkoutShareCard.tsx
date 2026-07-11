'use client';

import { motion } from 'framer-motion';
import { Share2, ArrowRight, Zap, Flame, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getLevelTitle } from '@/lib/xp';
import { ACHIEVEMENT_DEFS } from '@/lib/achievements';
import { QUEST_DEFS } from '@/lib/quests';

interface Props {
  duration: number;
  completedSets: number;
  exerciseCount: number;
  xpEarned: number;
  newPowerLevel: number;
  streak: number;
  newAchievements: string[];
  newQuests?: string[];
  onContinue: () => void;
}

export function WorkoutShareCard({
  duration,
  completedSets,
  exerciseCount,
  xpEarned,
  newPowerLevel,
  streak,
  newAchievements,
  newQuests = [],
  onContinue,
}: Props) {
  const levelTitle = getLevelTitle(newPowerLevel);

  const shareText =
    `💪 Just finished a ${duration}-min workout!\n` +
    `${exerciseCount} exercises · ${completedSets} sets · ${xpEarned} XP earned\n` +
    `${streak > 0 ? `🔥 ${streak}-day streak\n` : ''}` +
    `Fitness Level ${newPowerLevel} · ${levelTitle}\n\n` +
    `Join me on Warfare Fitness → warfare.fit`;

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ text: shareText }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(shareText).catch(() => {});
    }
  };

  return (
    <div className="space-y-4">
      {/* Card */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.4 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] border border-accent/30 p-5"
      >
        {/* Background glow */}
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-accent/10 rounded-full blur-2xl" />

        {/* Branding */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold text-accent tracking-widest uppercase">Warfare Fitness</span>
          <span className="text-xs text-text-tertiary">💪</span>
        </div>

        {/* Headline */}
        <p className="text-2xl font-black text-white mb-1">Workout Done. ✓</p>
        <p className="text-text-secondary text-sm mb-4">{duration} minute session complete</p>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'Exercises', value: exerciseCount },
            { label: 'Sets Done', value: completedSets },
            { label: 'XP Earned', value: `+${xpEarned}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-lg font-black text-white">{value}</p>
              <p className="text-[10px] text-text-tertiary">{label}</p>
            </div>
          ))}
        </div>

        {/* Power Level */}
        <div className="flex items-center gap-3 p-3 bg-accent/10 border border-accent/20 rounded-xl">
          <Zap className="w-5 h-5 text-accent flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-white">Fitness Level {newPowerLevel}</p>
            <p className="text-xs text-accent">{levelTitle}</p>
          </div>
          {streak > 0 && (
            <div className="ml-auto flex items-center gap-1 text-orange-400">
              <Flame className="w-4 h-4" />
              <span className="text-sm font-bold">{streak}d</span>
            </div>
          )}
        </div>
      </motion.div>

      {/* New achievements */}
      {newAchievements.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-2"
        >
          <p className="text-xs font-bold text-accent tracking-wider uppercase">
            🎉 Achievement{newAchievements.length > 1 ? 's' : ''} Unlocked
          </p>
          {newAchievements.map((id) => {
            const def = ACHIEVEMENT_DEFS.find((d) => d.id === id);
            if (!def) return null;
            return (
              <div key={id} className="flex items-center gap-3 p-3 bg-yellow-400/10 border border-yellow-400/20 rounded-xl">
                <span className="text-2xl">{def.icon}</span>
                <div>
                  <p className="text-sm font-bold text-white">{def.title}</p>
                  <p className="text-xs text-text-secondary">{def.desc}</p>
                </div>
                <Star className="w-4 h-4 text-yellow-400 ml-auto flex-shrink-0" />
              </div>
            );
          })}
        </motion.div>
      )}

      {/* New quests completed */}
      {newQuests.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="space-y-2"
        >
          <p className="text-xs font-bold text-purple-400 tracking-wider uppercase">
            ⚔️ Quest{newQuests.length > 1 ? 's' : ''} Complete
          </p>
          {newQuests.map((id) => {
            const quest = QUEST_DEFS.find((q) => q.id === id);
            if (!quest) return null;
            return (
              <div key={id} className="flex items-center gap-3 p-3 bg-purple-400/10 border border-purple-400/20 rounded-xl">
                <span className="text-2xl">{quest.rewardIcon}</span>
                <div>
                  <p className="text-sm font-bold text-white">{quest.title}</p>
                  <p className="text-xs text-text-secondary">{quest.rewardTitle} earned</p>
                </div>
              </div>
            );
          })}
        </motion.div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={handleShare}>
          <Share2 className="w-4 h-4" /> Share
        </Button>
        <Button fullWidth onClick={onContinue}>
          Continue <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
