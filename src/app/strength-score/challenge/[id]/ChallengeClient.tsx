'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Swords, ArrowRight, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { calculateStrengthScore, type StrengthInputs, type StrengthResult } from '@/lib/strengthScore';
import { saveStrengthScoreResult, type StrengthScoreDoc } from '@/lib/strengthScoreStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StrengthScoreResultView } from '@/components/strength-score/StrengthScoreResultView';
import { StrengthScoreShareCard } from '@/components/strength-score/StrengthScoreShareCard';
import { StrengthTestForm } from '@/components/strength-score/StrengthTestForm';

export function ChallengeClient({ challenger }: { challenger: StrengthScoreDoc }) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<'intro' | 'form' | 'reveal'>('intro');
  const [entry, setEntry] = useState<{ inputs: StrengthInputs; result: StrengthResult } | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const challengerName = challenger.displayName || 'This Warrior';

  async function handleCalculate(inputs: StrengthInputs, result: StrengthResult) {
    setEntry({ inputs, result });
    try {
      const id = await saveStrengthScoreResult(inputs, result, {
        displayName: profile?.displayName || null,
        userId: user?.uid ?? null,
        isChallenge: true,
        challengedResultId: challenger.id,
      });
      setSavedId(id);
    } catch {
      toast.error('Could not save your result — showing it anyway');
    } finally {
      setStep('reveal');
    }
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com').replace(/\/$/, '');
  const resultUrl = savedId ? `${appUrl}/strength-score/result/${savedId}` : `${appUrl}/strength-score`;

  if (step === 'intro') {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-6 text-center relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-accent/10 rounded-full blur-3xl" />
            <Swords className="w-8 h-8 text-accent mx-auto mb-3" />
            <p className="text-lg font-black text-white uppercase">{challengerName} thinks they&apos;re strong.</p>
            <p className="text-xs font-bold text-text-tertiary tracking-widest uppercase mt-4 mb-1">Warfare Score</p>
            <p className="text-6xl font-black text-accent leading-none">{challenger.score}</p>
            <p className="text-sm text-text-secondary mt-3">{challenger.classification}</p>
          </Card>
        </motion.div>
        <p className="text-center text-2xl font-black text-white">CAN YOU BEAT THEM?</p>
        <Button fullWidth size="lg" onClick={() => setStep('form')}>
          ACCEPT CHALLENGE
        </Button>
      </div>
    );
  }

  if (step === 'form') {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-2xl font-black text-white text-center mb-6">ENTER YOUR LIFTS</h1>
        <StrengthTestForm onCalculate={handleCalculate} submitLabel="SEE IF YOU WIN" />
      </div>
    );
  }

  // step === 'reveal'
  const won = entry!.result.score > challenger.score;
  const tied = entry!.result.score === challenger.score;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="p-6 text-center relative overflow-hidden">
          {won && <div className="absolute -right-10 -top-10 w-40 h-40 bg-accent/20 rounded-full blur-3xl" />}
          {won && <Trophy className="w-8 h-8 text-yellow-400 mx-auto mb-2" />}
          <p className="text-xs font-bold text-text-tertiary tracking-widest uppercase mb-2">Your Score</p>
          <p className="text-6xl font-black text-white leading-none">{entry!.result.score}</p>

          <div className="flex items-center justify-center gap-6 mt-5 pt-4 border-t border-white/10">
            <div>
              <p className="text-xs text-text-tertiary">{challengerName}</p>
              <p className="text-2xl font-black text-text-secondary">{challenger.score}</p>
            </div>
            <span className="text-text-tertiary text-sm">vs</span>
            <div>
              <p className="text-xs text-text-tertiary">You</p>
              <p className="text-2xl font-black text-white">{entry!.result.score}</p>
            </div>
          </div>

          <p className="text-lg font-black mt-4 uppercase">
            {tied ? "IT'S A TIE." : won ? 'YOU WIN 🏆' : "YOU'VE GOT WORK TO DO."}
          </p>
        </Card>
      </motion.div>

      <StrengthScoreResultView result={entry!.result} displayName={profile?.displayName} sex={entry!.inputs.sex} />

      <StrengthScoreShareCard
        result={entry!.result}
        displayName={profile?.displayName}
        shareUrl={resultUrl}
        shareText={won
          ? `I just beat ${challengerName} on the Warfare Strength Test — ${entry!.result.score} vs ${challenger.score}!`
          : `I just took the Warfare Strength Test and scored ${entry!.result.score} — think you can beat me?`}
      />

      <Card className="p-5 text-center space-y-3">
        <p className="text-sm font-bold text-white">Build your strength with Warfare Fitness</p>
        <p className="text-xs text-text-secondary">Get an AI-powered training plan built around your body, goals and current strength.</p>
        <Button fullWidth size="lg" onClick={() => router.push('/register')}>
          Build My Plan <ArrowRight className="w-4 h-4" />
        </Button>
      </Card>
    </div>
  );
}
