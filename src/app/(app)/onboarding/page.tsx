'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame, Dumbbell, RefreshCw, Zap,
  ChevronRight, ChevronLeft, Loader2, CheckCircle,
  Home, Building2, Package,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { saveOnboardingData, createAIProgram, enrollInProgram, updateUserGoals } from '@/lib/firestore';
import { estimateGoals } from '@/lib/tdee';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { FitnessGoal, ExperienceLevel, EquipmentType, OnboardingData, Program } from '@/types';

// ─── Step data ────────────────────────────────────────────────────────────────

const GOALS: { value: FitnessGoal; label: string; sub: string; icon: React.ElementType; color: string }[] = [
  { value: 'lose-fat',      label: 'Lose Fat',       sub: 'Burn fat, maintain muscle',       icon: Flame,      color: 'text-orange-400 bg-orange-400/10' },
  { value: 'build-muscle',  label: 'Build Muscle',   sub: 'Maximize hypertrophy',            icon: Dumbbell,   color: 'text-purple-400 bg-purple-400/10' },
  { value: 'recomposition', label: 'Recomposition',  sub: 'Build muscle & lose fat',         icon: RefreshCw,  color: 'text-blue-400 bg-blue-400/10' },
  { value: 'strength',      label: 'Get Stronger',   sub: 'Maximal strength & power',        icon: Zap,        color: 'text-accent bg-accent-muted' },
];

const EXPERIENCE: { value: ExperienceLevel; label: string; sub: string }[] = [
  { value: 'beginner',     label: 'Beginner',     sub: 'Less than 1 year of training' },
  { value: 'intermediate', label: 'Intermediate', sub: '1–3 years of consistent training' },
  { value: 'advanced',     label: 'Advanced',     sub: '3+ years, structured periodization' },
];

const EQUIPMENT: { value: EquipmentType; label: string; sub: string; icon: React.ElementType }[] = [
  { value: 'full-gym',  label: 'Full Gym',         sub: 'Barbells, dumbbells, cables, machines', icon: Building2 },
  { value: 'home',      label: 'Home Gym',          sub: 'Dumbbells, bands, bodyweight',          icon: Home },
  { value: 'minimal',   label: 'Minimal Equipment', sub: 'Bodyweight + pull-up bar',              icon: Package },
];

const DAYS = [2, 3, 4, 5, 6];

// ─── Component ────────────────────────────────────────────────────────────────

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.25, ease: 'easeOut' } },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0, transition: { duration: 0.2 } }),
};

export default function OnboardingPage() {
  const { user, trainerId, refreshProfile } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [goal, setGoal] = useState<FitnessGoal | null>(null);
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [trainingDays, setTrainingDays] = useState<number | null>(null);
  const [equipment, setEquipment] = useState<EquipmentType | null>(null);
  const [limitations, setLimitations] = useState('');
  const [status, setStatus] = useState<'idle' | 'generating' | 'saving' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const TOTAL_STEPS = 5;

  const canAdvance = [
    !!goal,
    !!experience,
    !!trainingDays,
    !!equipment,
    true, // limitations is optional
  ][step];

  function go(delta: number) {
    setDir(delta);
    setStep((s) => Math.max(0, Math.min(TOTAL_STEPS - 1, s + delta)));
  }

  async function handleFinish() {
    if (!user || !goal || !experience || !trainingDays || !equipment) return;
    setError(null);
    setStatus('generating');

    try {
      // 1. Call AI to generate program
      const res = await fetch('/api/ai/recommend-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal,
          experience,
          trainingDays,
          equipment,
          limitations: limitations.trim(),
          trainerId: trainerId ?? user.uid,
        }),
      });

      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? 'Program generation failed');
      }

      const { program } = await res.json() as { program: Omit<Program, 'id'> };

      setStatus('saving');

      // 2. Save program to Firestore
      const programId = await createAIProgram(program);

      // 3. Enroll user in the program
      await enrollInProgram(user.uid, {
        id: programId,
        name: program.name,
        weeks: program.weeks,
        daysPerWeek: program.daysPerWeek,
      });

      // 4. Auto-set nutrition goals from TDEE estimate
      const estimatedGoals = estimateGoals(goal, experience, trainingDays);
      await updateUserGoals(user.uid, estimatedGoals);

      // 5. Save onboarding answers + mark complete
      const onboardingData: OnboardingData = {
        fitnessGoal: goal,
        experience,
        trainingDays,
        equipment,
        limitations: limitations.trim() || undefined,
      };
      await saveOnboardingData(user.uid, { ...onboardingData, onboardingComplete: true });

      // 6. Refresh profile so layout no longer redirects here
      setStatus('done');
      await refreshProfile();
      router.replace('/dashboard');
    } catch (err) {
      console.error('[Onboarding] failed:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStatus('idle');
    }
  }

  const isGenerating = status === 'generating' || status === 'saving';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="px-4 pt-12 pb-4 max-w-lg mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => go(-1)}
            disabled={step === 0 || isGenerating}
            className="p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5 transition-colors disabled:opacity-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-xs text-text-secondary">Step {step + 1} of {TOTAL_STEPS}</span>
          <div className="w-9" />
        </div>
        <ProgressBar value={step + 1} max={TOTAL_STEPS} color="accent" size="sm" />
      </div>

      {/* Content */}
      <div className="flex-1 px-4 max-w-lg mx-auto w-full overflow-hidden">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="space-y-4"
          >
            {step === 0 && (
              <StepGoal selected={goal} onSelect={setGoal} />
            )}
            {step === 1 && (
              <StepExperience selected={experience} onSelect={setExperience} />
            )}
            {step === 2 && (
              <StepDays selected={trainingDays} onSelect={setTrainingDays} />
            )}
            {step === 3 && (
              <StepEquipment selected={equipment} onSelect={setEquipment} />
            )}
            {step === 4 && (
              <StepLimitations value={limitations} onChange={setLimitations} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 max-w-lg mx-auto w-full mt-3">
          <p className="text-sm text-red-400 text-center bg-red-400/10 border border-red-400/20 rounded-xl p-3">{error}</p>
        </div>
      )}

      {/* CTA */}
      <div className="px-4 py-6 max-w-lg mx-auto w-full">
        {step < TOTAL_STEPS - 1 ? (
          <Button
            fullWidth
            size="lg"
            disabled={!canAdvance}
            onClick={() => go(1)}
          >
            Continue <ChevronRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            fullWidth
            size="lg"
            disabled={isGenerating}
            onClick={handleFinish}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {status === 'generating' ? 'Building your program…' : 'Saving…'}
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Generate My Program
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Step components ───────────────────────────────────────────────────────────

function StepGoal({ selected, onSelect }: { selected: FitnessGoal | null; onSelect: (v: FitnessGoal) => void }) {
  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">What&apos;s your goal?</h1>
      <p className="text-text-secondary text-sm mb-5">This determines your program structure and intensity.</p>
      <div className="space-y-3">
        {GOALS.map(({ value, label, sub, icon: Icon, color }) => (
          <button key={value} onClick={() => onSelect(value)} className="w-full text-left">
            <Card className={`p-4 flex items-center gap-4 transition-colors ${selected === value ? 'border-accent bg-accent/5' : ''}`}>
              <div className={`p-2.5 rounded-xl ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-white">{label}</p>
                <p className="text-xs text-text-secondary">{sub}</p>
              </div>
              {selected === value && <CheckCircle className="w-5 h-5 text-accent ml-auto flex-shrink-0" />}
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepExperience({ selected, onSelect }: { selected: ExperienceLevel | null; onSelect: (v: ExperienceLevel) => void }) {
  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">Training experience</h1>
      <p className="text-text-secondary text-sm mb-5">Be honest — this shapes your rep schemes and exercise complexity.</p>
      <div className="space-y-3">
        {EXPERIENCE.map(({ value, label, sub }) => (
          <button key={value} onClick={() => onSelect(value)} className="w-full text-left">
            <Card className={`p-4 flex items-center justify-between transition-colors ${selected === value ? 'border-accent bg-accent/5' : ''}`}>
              <div>
                <p className="font-bold text-white">{label}</p>
                <p className="text-xs text-text-secondary">{sub}</p>
              </div>
              {selected === value && <CheckCircle className="w-5 h-5 text-accent flex-shrink-0" />}
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepDays({ selected, onSelect }: { selected: number | null; onSelect: (v: number) => void }) {
  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">Days per week</h1>
      <p className="text-text-secondary text-sm mb-5">How many days can you commit to training?</p>
      <div className="grid grid-cols-5 gap-2">
        {DAYS.map((d) => (
          <button
            key={d}
            onClick={() => onSelect(d)}
            className={`aspect-square rounded-2xl flex items-center justify-center text-xl font-black transition-all ${
              selected === d
                ? 'bg-accent text-black scale-105'
                : 'bg-surface-elevated border border-white/10 text-white hover:border-accent/40'
            }`}
          >
            {d}
          </button>
        ))}
      </div>
      {selected && (
        <p className="text-center text-text-secondary text-sm mt-4">
          {selected} training days · {7 - selected} rest days per week
        </p>
      )}
    </div>
  );
}

function StepEquipment({ selected, onSelect }: { selected: EquipmentType | null; onSelect: (v: EquipmentType) => void }) {
  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">Equipment access</h1>
      <p className="text-text-secondary text-sm mb-5">Your program will only use what you have available.</p>
      <div className="space-y-3">
        {EQUIPMENT.map(({ value, label, sub, icon: Icon }) => (
          <button key={value} onClick={() => onSelect(value)} className="w-full text-left">
            <Card className={`p-4 flex items-center gap-4 transition-colors ${selected === value ? 'border-accent bg-accent/5' : ''}`}>
              <div className="p-2.5 rounded-xl bg-surface-elevated">
                <Icon className="w-5 h-5 text-text-secondary" />
              </div>
              <div>
                <p className="font-bold text-white">{label}</p>
                <p className="text-xs text-text-secondary">{sub}</p>
              </div>
              {selected === value && <CheckCircle className="w-5 h-5 text-accent ml-auto flex-shrink-0" />}
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepLimitations({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">Any limitations?</h1>
      <p className="text-text-secondary text-sm mb-5">
        Injuries, pain points, or exercises to avoid. Your AI coach will work around them.
        <span className="text-text-tertiary"> (optional)</span>
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. bad left knee, no overhead pressing, lower back pain…"
        rows={5}
        className="w-full bg-surface border border-white/10 rounded-2xl px-4 py-3 text-white text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none"
      />
      <p className="text-xs text-text-tertiary mt-2 text-center">
        Leave blank if you have no limitations.
      </p>
    </div>
  );
}
