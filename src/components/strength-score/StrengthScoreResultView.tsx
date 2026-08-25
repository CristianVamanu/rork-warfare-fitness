'use client';

import { motion } from 'framer-motion';
import { Trophy, TrendingUp, TrendingDown, Target } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { StrengthResult } from '@/lib/strengthScore';

const CLASSIFICATION_BLURB: Record<string, string> = {
  'THE POWERHOUSE': 'Elite and balanced across every lift — a genuinely rare profile.',
  'THE ATHLETE': 'Bodyweight strength leads the way — built to move, not just move weight.',
  'THE ENGINE': 'Posterior-chain dominant — your deadlift carries the whole profile.',
  'THE TANK': 'Leg-dominant — your squat is doing the heavy lifting, literally.',
  'THE BUILDER': 'Well-rounded and steadily climbing — no glaring weak point.',
  'THE GRINDER': 'Early in the climb — every session from here compounds.',
};

export function StrengthScoreResultView({
  result, displayName, sex,
}: {
  result: StrengthResult;
  displayName?: string | null;
  sex: 'male' | 'female';
}) {
  const genderWord = sex === 'male' ? 'men' : 'women';
  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="p-6 text-center relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-accent/10 rounded-full blur-3xl" />
          <p className="text-xs font-bold text-text-tertiary tracking-widest uppercase mb-2">
            {displayName ? `${displayName}'s Warfare Score` : 'Your Warfare Score'}
          </p>
          <p className="text-6xl font-black text-white leading-none">
            {result.score}<span className="text-2xl text-text-tertiary">/100</span>
          </p>
          <p className="text-sm text-text-secondary mt-3">
            Stronger than <span className="text-accent font-bold">{result.percentile}%</span> of {genderWord} your age
          </p>
          <div className="mt-4 inline-flex">
            <Badge variant="accent" className="text-sm px-4 py-1.5">{result.classification}</Badge>
          </div>
          {CLASSIFICATION_BLURB[result.classification] && (
            <p className="text-xs text-text-tertiary mt-2 max-w-xs mx-auto">{CLASSIFICATION_BLURB[result.classification]}</p>
          )}
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="space-y-2">
        {result.liftScores.map((l) => (
          <Card key={l.key} className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">{l.label}</p>
              <p className="text-xs text-text-tertiary">
                {l.valueKg !== undefined ? `${l.valueKg}kg` : `${l.reps} reps`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black text-accent">{Math.round(l.percentile)}<span className="text-xs text-text-tertiary">th</span></p>
              <p className="text-[10px] text-text-tertiary">percentile</p>
            </div>
          </Card>
        ))}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className="grid grid-cols-2 gap-2">
        <Card className="p-3.5">
          <div className="flex items-center gap-1.5 text-green-400 mb-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wide">Strongest Lift</span>
          </div>
          <p className="text-sm font-bold text-white">{result.strongestLift.label}</p>
        </Card>
        <Card className="p-3.5">
          <div className="flex items-center gap-1.5 text-orange-400 mb-1">
            <TrendingDown className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wide">Biggest Opportunity</span>
          </div>
          <p className="text-sm font-bold text-white">{result.weakestLift.label}</p>
        </Card>
      </motion.div>

      {result.nextMilestone && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent-muted flex items-center justify-center flex-shrink-0">
              <Target className="w-4.5 h-4.5 text-accent" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Next Milestone</p>
              <p className="text-sm font-bold text-white">
                {result.nextMilestone.targetKg}kg {result.nextMilestone.label}
                <span className="text-text-tertiary font-normal"> — {result.nextMilestone.remainingKg}kg away</span>
              </p>
            </div>
            <Trophy className="w-4 h-4 text-yellow-400 ml-auto flex-shrink-0" />
          </Card>
        </motion.div>
      )}
    </div>
  );
}
