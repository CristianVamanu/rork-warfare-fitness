'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Dumbbell, Home as HomeIcon, Building2, Package, Loader2, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from 'firebase/auth';
import { enrollInProgram } from '@/lib/firestore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { FitnessGoal, ExperienceLevel, EquipmentType } from '@/types';

const GOALS: { value: FitnessGoal; label: string }[] = [
  { value: 'lose-fat', label: 'Lose Fat' },
  { value: 'build-muscle', label: 'Build Muscle' },
  { value: 'recomposition', label: 'Build Muscle & Lose Fat' },
  { value: 'strength', label: 'Get Stronger' },
];

const EXPERIENCE: { value: ExperienceLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const EQUIPMENT: { value: EquipmentType; label: string; icon: React.ElementType }[] = [
  { value: 'full-gym', label: 'Full Gym', icon: Building2 },
  { value: 'home', label: 'Home Equipment', icon: HomeIcon },
  { value: 'minimal', label: 'Bodyweight Only', icon: Package },
];

const FOCUS_OPTIONS = ['full-body', 'upper-body', 'lower-body', 'core'] as const;
const SESSION_OPTIONS = [30, 45, 60, 90] as const;

const STEPS = ['goal', 'experience', 'equipment', 'days', 'focus', 'limitations'] as const;

export default function BuildProgramPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<FitnessGoal | null>(null);
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [equipment, setEquipment] = useState<EquipmentType | null>(null);
  const [trainingDays, setTrainingDays] = useState<number | null>(null);
  const [targetFocus, setTargetFocus] = useState<typeof FOCUS_OPTIONS[number] | null>(null);
  const [sessionMinutes, setSessionMinutes] = useState<typeof SESSION_OPTIONS[number] | null>(null);
  const [limitations, setLimitations] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ id: string; name: string; description: string; weeks: number; daysPerWeek: number } | null>(null);

  const canNext = [
    !!goal, !!experience, !!equipment, !!trainingDays, !!targetFocus, true,
  ][step];

  async function handleGenerate() {
    if (!user || !goal || !experience || !equipment || !trainingDays) return;
    setGenerating(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/ai/build-my-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          goal, experience, trainingDays, equipment,
          targetFocus: targetFocus ?? undefined,
          sessionMinutes: sessionMinutes ? `${sessionMinutes} minutes` : undefined,
          limitations: limitations.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to build your program');
      setResult(data.program);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to build your program');
    } finally {
      setGenerating(false);
    }
  }

  async function handleEnroll() {
    if (!user || !result) return;
    try {
      await enrollInProgram(user.uid, result);
      toast.success(`Enrolled in "${result.name}"!`);
      router.push('/training');
    } catch {
      toast.error('Failed to enroll');
    }
  }

  if (result) {
    return (
      <div>
        <Header title="Your Custom Program" showBack />
        <div className="px-4 py-8 max-w-lg mx-auto text-center">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="w-16 h-16 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-accent" />
            </div>
            <h1 className="text-xl font-black text-white">{result.name}</h1>
            <p className="text-text-secondary text-sm mt-2 leading-relaxed">{result.description}</p>
            <p className="text-xs text-text-tertiary mt-3">{result.weeks} weeks · {result.daysPerWeek} days/week</p>
            <Button fullWidth className="mt-6" onClick={handleEnroll}>Start This Program</Button>
            <Button fullWidth variant="ghost" className="mt-2" onClick={() => { setResult(null); setStep(0); }}>
              Build a Different One
            </Button>
          </motion.div>
        </div>
      </div>
    );
  }

  if (generating) {
    return (
      <div>
        <Header title="Building Your Program" showBack={false} />
        <div className="px-4 py-16 max-w-lg mx-auto text-center">
          <Loader2 className="w-10 h-10 text-accent mx-auto mb-4 animate-spin" />
          <p className="text-white font-bold">Building your custom program…</p>
          <p className="text-text-secondary text-sm mt-1">Tailoring every exercise to your goals and equipment.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Build Your Own Program" showBack />
      <div className="px-4 py-4 max-w-lg mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-1.5 text-xs text-text-secondary mb-2">
            <Sparkles className="w-3.5 h-3.5 text-accent" /> Step {step + 1} of {STEPS.length}
          </div>
          <ProgressBar value={step + 1} max={STEPS.length} color="accent" size="sm" />
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
            {step === 0 && (
              <>
                <h2 className="text-lg font-bold text-white mb-4">What's your main goal?</h2>
                <div className="space-y-2">
                  {GOALS.map((g) => (
                    <Card
                      key={g.value}
                      className={`p-4 cursor-pointer transition-colors ${goal === g.value ? 'border-accent bg-accent/10' : 'hover:border-white/20'}`}
                      onClick={() => setGoal(g.value)}
                    >
                      <p className="text-sm font-bold text-white">{g.label}</p>
                    </Card>
                  ))}
                </div>
              </>
            )}
            {step === 1 && (
              <>
                <h2 className="text-lg font-bold text-white mb-4">Your experience level?</h2>
                <div className="space-y-2">
                  {EXPERIENCE.map((e) => (
                    <Card
                      key={e.value}
                      className={`p-4 cursor-pointer transition-colors ${experience === e.value ? 'border-accent bg-accent/10' : 'hover:border-white/20'}`}
                      onClick={() => setExperience(e.value)}
                    >
                      <p className="text-sm font-bold text-white">{e.label}</p>
                    </Card>
                  ))}
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <h2 className="text-lg font-bold text-white mb-4">What equipment do you have?</h2>
                <div className="grid grid-cols-3 gap-2">
                  {EQUIPMENT.map((e) => (
                    <Card
                      key={e.value}
                      className={`p-4 text-center cursor-pointer transition-colors ${equipment === e.value ? 'border-accent bg-accent/10' : 'hover:border-white/20'}`}
                      onClick={() => setEquipment(e.value)}
                    >
                      <e.icon className={`w-6 h-6 mx-auto mb-2 ${equipment === e.value ? 'text-accent' : 'text-text-secondary'}`} />
                      <p className="text-xs font-bold text-white">{e.label}</p>
                    </Card>
                  ))}
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <h2 className="text-lg font-bold text-white mb-4">Training days per week?</h2>
                <div className="grid grid-cols-3 gap-2">
                  {[2, 3, 4, 5, 6].map((d) => (
                    <Card
                      key={d}
                      className={`p-4 text-center cursor-pointer transition-colors ${trainingDays === d ? 'border-accent bg-accent/10' : 'hover:border-white/20'}`}
                      onClick={() => setTrainingDays(d)}
                    >
                      <p className="text-lg font-black text-white">{d}</p>
                    </Card>
                  ))}
                </div>
                <p className="text-xs text-text-tertiary mt-3">Preferred session length (optional)</p>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {SESSION_OPTIONS.map((m) => (
                    <button
                      key={m}
                      onClick={() => setSessionMinutes(m === sessionMinutes ? null : m)}
                      className={`py-2 rounded-xl text-xs font-bold border transition-colors ${sessionMinutes === m ? 'bg-accent text-black border-accent' : 'border-white/10 text-text-secondary'}`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </>
            )}
            {step === 4 && (
              <>
                <h2 className="text-lg font-bold text-white mb-4">Any focus area?</h2>
                <div className="grid grid-cols-2 gap-2">
                  {FOCUS_OPTIONS.map((f) => (
                    <Card
                      key={f}
                      className={`p-4 text-center cursor-pointer transition-colors ${targetFocus === f ? 'border-accent bg-accent/10' : 'hover:border-white/20'}`}
                      onClick={() => setTargetFocus(f)}
                    >
                      <p className="text-xs font-bold text-white capitalize">{f.replace('-', ' ')}</p>
                    </Card>
                  ))}
                </div>
              </>
            )}
            {step === 5 && (
              <>
                <h2 className="text-lg font-bold text-white mb-2">Any injuries or limitations?</h2>
                <p className="text-xs text-text-tertiary mb-4">Optional — we'll avoid risky movements for anything you mention.</p>
                <textarea
                  value={limitations}
                  onChange={(e) => setLimitations(e.target.value)}
                  placeholder="e.g. bad left knee, lower back pain..."
                  rows={4}
                  className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none"
                />
              </>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center gap-2 mt-6">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>Back</Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button fullWidth disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next</Button>
          ) : (
            <Button fullWidth onClick={handleGenerate}>
              <Sparkles className="w-4 h-4" /> Build My Program
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
