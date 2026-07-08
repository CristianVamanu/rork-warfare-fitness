'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame, Dumbbell, RefreshCw, Zap,
  ChevronRight, ChevronLeft, Loader2, CheckCircle,
  Home, Building2, Package, User, Users, AlertCircle, TrendingDown, TrendingUp, PartyPopper,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { saveOnboardingData, enrollInProgram, updateUserGoals, updateUserDoc, getSystemConfig } from '@/lib/firestore';
import { estimateGoals, calculateBmi, estimateBmiTimeline } from '@/lib/tdee';
import { MOCK_PROGRAMS } from '@/lib/programs';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Modal } from '@/components/ui/Modal';
import type { FitnessGoal, ExperienceLevel, EquipmentType, OnboardingData, BiologicalSex, MedicalHistoryAnswers } from '@/types';

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
  const { t } = useLanguage();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [goal, setGoal] = useState<FitnessGoal | null>(null);
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [trainingDays, setTrainingDays] = useState<number | null>(null);
  const [equipment, setEquipment] = useState<EquipmentType | null>(null);
  const [limitations, setLimitations] = useState('');
  const [sex, setSex] = useState<BiologicalSex | null>(null);
  const [age, setAge] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [medicalHistory, setMedicalHistory] = useState<MedicalHistoryAnswers>({});
  const [status, setStatus] = useState<'idle' | 'generating' | 'saving' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [videoGreetingUrl, setVideoGreetingUrl] = useState<string | null>(null);
  const [showVideoModal, setShowVideoModal] = useState(false);

  function updateMedical(patch: Partial<MedicalHistoryAnswers>) {
    setMedicalHistory((m) => ({ ...m, ...patch }));
  }

  const TOTAL_STEPS = 9;

  const ageNum = parseInt(age, 10);
  const heightNum = parseFloat(heightCm);
  const weightNum = parseFloat(weightKg);
  const biometricsValid = !!sex && ageNum >= 13 && ageNum <= 100 && heightNum >= 100 && heightNum <= 250 && weightNum >= 30 && weightNum <= 300;

  const canAdvance = [
    !!goal,
    !!experience,
    !!trainingDays,
    !!equipment,
    biometricsValid,
    true, // BMI result step is informational only
    true, // limitations is optional
    true, // medical history is optional
    true, // lifestyle habits is optional
  ][step];

  function go(delta: number) {
    setDir(delta);
    setStep((s) => Math.max(0, Math.min(TOTAL_STEPS - 1, s + delta)));
  }

  function recommendProgram(): typeof MOCK_PROGRAMS[0] {
    // Goal → program goal mapping
    const goalMap: Record<FitnessGoal, string> = {
      'lose-fat': 'weight-loss',
      'build-muscle': 'hypertrophy',
      'recomposition': 'hypertrophy',
      'strength': 'strength',
    };
    const targetGoal = goalMap[goal!];

    // Score each program by how well it matches
    const scored = MOCK_PROGRAMS.map((p) => {
      let score = 0;
      if (p.goal === targetGoal) score += 10;
      if (p.level === experience) score += 5;
      // Prefer programs whose daysPerWeek is close to what the user chose
      score -= Math.abs(p.daysPerWeek - (trainingDays ?? 3));
      return { p, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0].p;
  }

  async function handleFinish() {
    if (!user || !goal || !experience || !trainingDays || !equipment) return;
    setError(null);
    setStatus('generating');

    try {
      setStatus('saving');

      // 1. Pick the best matching existing program
      const program = recommendProgram();

      // 2. Enroll user in the program
      await enrollInProgram(user.uid, {
        id: program.id,
        name: program.name,
        weeks: program.weeks,
        daysPerWeek: program.daysPerWeek,
      });

      // 3. Auto-set nutrition goals from TDEE estimate (uses real biometrics when available)
      const estimatedGoals = estimateGoals(
        goal, experience, trainingDays,
        biometricsValid ? { sex: sex!, age: ageNum, heightCm: heightNum, weightKg: weightNum } : undefined
      );
      await updateUserGoals(user.uid, estimatedGoals);

      // 4. Save onboarding answers + mark complete
      const cleanedMedicalHistory = Object.fromEntries(
        Object.entries(medicalHistory).filter(([, v]) => v !== undefined && v !== '')
      ) as MedicalHistoryAnswers;
      const onboardingData: OnboardingData = {
        fitnessGoal: goal,
        experience,
        trainingDays,
        equipment,
        ...(limitations.trim() ? { limitations: limitations.trim() } : {}),
        ...(biometricsValid ? { sex: sex!, age: ageNum, heightCm: heightNum } : {}),
        ...(Object.keys(cleanedMedicalHistory).length > 0 ? { medicalHistory: cleanedMedicalHistory } : {}),
      };
      await saveOnboardingData(user.uid, { ...onboardingData, onboardingComplete: true });
      if (biometricsValid) {
        await updateUserDoc(user.uid, { currentWeightKg: weightNum });
      }

      // 5. Refresh profile so layout no longer redirects here
      setStatus('done');
      await refreshProfile();

      // 6. Check for video greeting
      try {
        const cfg = await getSystemConfig();
        if (cfg?.videoGreetingUrl) {
          setVideoGreetingUrl(cfg.videoGreetingUrl as string);
          setShowVideoModal(true);
          return; // navigation happens when user dismisses video
        }
      } catch { /* ignore */ }

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
          <span className="text-xs text-text-secondary">{t('onboarding.step', { current: step + 1, total: TOTAL_STEPS })}</span>
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
              <StepBiometrics
                sex={sex} onSex={setSex}
                age={age} onAge={setAge}
                heightCm={heightCm} onHeight={setHeightCm}
                weightKg={weightKg} onWeight={setWeightKg}
              />
            )}
            {step === 5 && (
              <StepBmiResult heightCm={heightNum} weightKg={weightNum} />
            )}
            {step === 6 && (
              <StepLimitations value={limitations} onChange={setLimitations} />
            )}
            {step === 7 && (
              <StepMedicalHistory data={medicalHistory} onChange={updateMedical} />
            )}
            {step === 8 && (
              <StepLifestyleHabits data={medicalHistory} onChange={updateMedical} />
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
            {t('onboarding.continue')} <ChevronRight className="w-4 h-4" />
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
                {t('onboarding.settingUp')}
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                {t('onboarding.generateProgram')}
              </>
            )}
          </Button>
        )}
      </div>

      {/* Video Greeting Modal */}
      <Modal open={showVideoModal} onClose={() => { setShowVideoModal(false); router.replace('/dashboard'); }} title="Welcome to the Team! 🎉">
        <div className="space-y-4">
          {videoGreetingUrl && (
            <div className="rounded-xl overflow-hidden bg-black aspect-video">
              <video
                src={videoGreetingUrl}
                controls
                autoPlay
                playsInline
                webkit-playsinline="true"
                className="w-full h-full object-contain"
              />
            </div>
          )}
          <p className="text-sm text-text-secondary text-center">A personal welcome from your coach.</p>
          <Button fullWidth onClick={() => { setShowVideoModal(false); router.replace('/dashboard'); }}>
            Let&apos;s Go! →
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Step components ───────────────────────────────────────────────────────────

function StepGoal({ selected, onSelect }: { selected: FitnessGoal | null; onSelect: (v: FitnessGoal) => void }) {
  const { t } = useLanguage();
  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">{t('onboarding.goal.title')}</h1>
      <p className="text-text-secondary text-sm mb-5">{t('onboarding.goal.subtitle')}</p>
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
  const { t } = useLanguage();
  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">{t('onboarding.experience.title')}</h1>
      <p className="text-text-secondary text-sm mb-5">{t('onboarding.experience.subtitle')}</p>
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
  const { t } = useLanguage();
  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">{t('onboarding.days.title')}</h1>
      <p className="text-text-secondary text-sm mb-5">{t('onboarding.days.subtitle')}</p>
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
  const { t } = useLanguage();
  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">{t('onboarding.equipment.title')}</h1>
      <p className="text-text-secondary text-sm mb-5">{t('onboarding.equipment.subtitle')}</p>
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
  const { t } = useLanguage();
  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">{t('onboarding.limitations.title')}</h1>
      <p className="text-text-secondary text-sm mb-5">
        {t('onboarding.limitations.subtitle')}
        <span className="text-text-tertiary"> {t('onboarding.optional')}</span>
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

function YesNoField({
  label, value, onChange, detail, onDetailChange, detailPlaceholder,
}: {
  label: string;
  value: boolean | null | undefined;
  onChange: (v: boolean) => void;
  detail?: string;
  onDetailChange?: (v: string) => void;
  detailPlaceholder?: string;
}) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-white flex-1">{label}</p>
        <div className="flex gap-1.5 flex-shrink-0">
          <button
            onClick={() => onChange(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${value === false ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'}`}
          >
            No
          </button>
          <button
            onClick={() => onChange(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${value === true ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'}`}
          >
            Yes
          </button>
        </div>
      </div>
      {value === true && onDetailChange && (
        <input
          value={detail ?? ''}
          onChange={(e) => onDetailChange(e.target.value)}
          placeholder={detailPlaceholder ?? 'Please specify (optional)'}
          className="w-full mt-2 bg-surface border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
        />
      )}
    </div>
  );
}

function StepMedicalHistory({ data, onChange }: { data: MedicalHistoryAnswers; onChange: (patch: Partial<MedicalHistoryAnswers>) => void }) {
  const { t } = useLanguage();
  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">{t('onboarding.medical.title')}</h1>
      <p className="text-text-secondary text-sm mb-5">
        {t('onboarding.medical.subtitle')}
        <span className="text-text-tertiary"> {t('onboarding.optional')}</span>
      </p>
      <Card className="p-4 divide-y divide-white/5">
        <YesNoField label="Do you practice sports/exercise?" value={data.practicesSports} onChange={(v) => onChange({ practicesSports: v })} detail={data.sportsDetail} onDetailChange={(v) => onChange({ sportsDetail: v })} detailPlaceholder="Which sport(s)?" />
        <YesNoField label="Movement or coordination disorders?" value={data.movementDisorders} onChange={(v) => onChange({ movementDisorders: v })} detail={data.movementDisordersDetail} onDetailChange={(v) => onChange({ movementDisordersDetail: v })} />
        <YesNoField label="Previous surgeries?" value={data.previousSurgeries} onChange={(v) => onChange({ previousSurgeries: v })} detail={data.previousSurgeriesDetail} onDetailChange={(v) => onChange({ previousSurgeriesDetail: v })} />
        <YesNoField label="Sports injuries?" value={data.sportsInjuries} onChange={(v) => onChange({ sportsInjuries: v })} detail={data.sportsInjuriesDetail} onDetailChange={(v) => onChange({ sportsInjuriesDetail: v })} />
        <YesNoField label="Other musculoskeletal problems?" value={data.musculoskeletalProblems} onChange={(v) => onChange({ musculoskeletalProblems: v })} detail={data.musculoskeletalProblemsDetail} onDetailChange={(v) => onChange({ musculoskeletalProblemsDetail: v })} />
        <YesNoField label="Heart disease?" value={data.heartDisease} onChange={(v) => onChange({ heartDisease: v })} detail={data.heartDiseaseDetail} onDetailChange={(v) => onChange({ heartDiseaseDetail: v })} />
        <YesNoField label="Other medical conditions?" value={data.otherMedicalConditions} onChange={(v) => onChange({ otherMedicalConditions: v })} detail={data.otherMedicalConditionsDetail} onDetailChange={(v) => onChange({ otherMedicalConditionsDetail: v })} />
      </Card>
      <div className="grid grid-cols-3 gap-3 mt-4">
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">Body Fat %</label>
          <input
            type="number" inputMode="decimal"
            value={data.bodyFatPercent ?? ''}
            onChange={(e) => onChange({ bodyFatPercent: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="18"
            className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">Blood Pressure</label>
          <input
            type="text"
            value={data.bloodPressure ?? ''}
            onChange={(e) => onChange({ bloodPressure: e.target.value })}
            placeholder="120/80"
            className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">Resting HR</label>
          <input
            type="number" inputMode="numeric"
            value={data.restingHeartRate ?? ''}
            onChange={(e) => onChange({ restingHeartRate: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="65"
            className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
          />
        </div>
      </div>
    </div>
  );
}

function StepLifestyleHabits({ data, onChange }: { data: MedicalHistoryAnswers; onChange: (patch: Partial<MedicalHistoryAnswers>) => void }) {
  const { t } = useLanguage();
  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">{t('onboarding.lifestyle.title')}</h1>
      <p className="text-text-secondary text-sm mb-5">
        {t('onboarding.lifestyle.subtitle')}
        <span className="text-text-tertiary"> {t('onboarding.optional')}</span>
      </p>
      <Card className="p-4 divide-y divide-white/5">
        <YesNoField label="Do you smoke?" value={data.smokes} onChange={(v) => onChange({ smokes: v })} />
        <YesNoField label="Drink alcohol regularly?" value={data.drinksAlcoholRegularly} onChange={(v) => onChange({ drinksAlcoholRegularly: v })} detail={data.alcoholFrequency} onDetailChange={(v) => onChange({ alcoholFrequency: v })} detailPlaceholder="How often?" />
        <YesNoField label="Suffer from stress?" value={data.suffersFromStress} onChange={(v) => onChange({ suffersFromStress: v })} />
        <YesNoField label="Sleeping pills or sedatives?" value={data.takesSleepingPills} onChange={(v) => onChange({ takesSleepingPills: v })} />
        <YesNoField label="Pain medication?" value={data.takesPainMedication} onChange={(v) => onChange({ takesPainMedication: v })} />
        <YesNoField label="Beta blockers?" value={data.takesBetaBlockers} onChange={(v) => onChange({ takesBetaBlockers: v })} />
        <YesNoField label="Frequently eat very fatty/sweet foods?" value={data.eatsFattyOrSweetFoodsOften} onChange={(v) => onChange({ eatsFattyOrSweetFoodsOften: v })} />
        <YesNoField label="Often experience food cravings?" value={data.experiencesFoodCravings} onChange={(v) => onChange({ experiencesFoodCravings: v })} />
      </Card>
      <div className="mt-4">
        <label className="text-xs font-medium text-text-secondary mb-1.5 block">Daily fluid intake</label>
        <input
          type="text"
          value={data.dailyFluidIntake ?? ''}
          onChange={(e) => onChange({ dailyFluidIntake: e.target.value })}
          placeholder="e.g. 2 liters"
          className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
        />
      </div>
    </div>
  );
}

const SEX_OPTIONS: { value: BiologicalSex; label: string; icon: React.ElementType }[] = [
  { value: 'male', label: 'Male', icon: User },
  { value: 'female', label: 'Female', icon: User },
  { value: 'prefer-not-to-say', label: 'Prefer not to say', icon: Users },
];

function StepBiometrics({
  sex, onSex, age, onAge, heightCm, onHeight, weightKg, onWeight,
}: {
  sex: BiologicalSex | null; onSex: (v: BiologicalSex) => void;
  age: string; onAge: (v: string) => void;
  heightCm: string; onHeight: (v: string) => void;
  weightKg: string; onWeight: (v: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">{t('onboarding.biometrics.title')}</h1>
      <p className="text-text-secondary text-sm mb-5">
        {t('onboarding.biometrics.subtitle')}
      </p>

      <p className="text-xs font-medium text-text-secondary mb-2">Sex</p>
      <div className="grid grid-cols-3 gap-2 mb-5">
        {SEX_OPTIONS.map(({ value, label, icon: Icon }) => (
          <button key={value} onClick={() => onSex(value)}>
            <Card className={`p-3 text-center transition-colors ${sex === value ? 'border-accent bg-accent/5' : ''}`}>
              <Icon className="w-4 h-4 mx-auto mb-1 text-text-secondary" />
              <p className="text-xs font-medium text-white">{label}</p>
            </Card>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">Age</label>
          <input
            type="number"
            inputMode="numeric"
            value={age}
            onChange={(e) => onAge(e.target.value)}
            placeholder="28"
            className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">Height (cm)</label>
          <input
            type="number"
            inputMode="decimal"
            value={heightCm}
            onChange={(e) => onHeight(e.target.value)}
            placeholder="178"
            className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">Weight (kg)</label>
          <input
            type="number"
            inputMode="decimal"
            value={weightKg}
            onChange={(e) => onWeight(e.target.value)}
            placeholder="80"
            className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
          />
        </div>
      </div>
    </div>
  );
}

function StepBmiResult({ heightCm, weightKg }: { heightCm: number; weightKg: number }) {
  const { t } = useLanguage();
  const { bmi, category, healthyWeightRangeKg } = calculateBmi(heightCm, weightKg);
  const { weeksToHealthy, weightChangeKg } = estimateBmiTimeline(heightCm, weightKg);

  const categoryColor = {
    Underweight: 'text-blue-400',
    Healthy: 'text-success',
    Overweight: 'text-amber-400',
    Obese: 'text-red-400',
  }[category];

  const months = weeksToHealthy ? Math.round((weeksToHealthy / 4.345) * 10) / 10 : null;

  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">{t('onboarding.bmi.title')}</h1>
      <p className="text-text-secondary text-sm mb-5">
        {t('onboarding.bmi.subtitle')}
      </p>

      <Card className="p-6 text-center border-accent/20">
        <p className="text-5xl font-black text-white">{bmi}</p>
        <p className={`text-sm font-bold mt-1 ${categoryColor}`}>{category}</p>
        <p className="text-xs text-text-tertiary mt-2">
          Healthy range for your height: {healthyWeightRangeKg[0]}–{healthyWeightRangeKg[1]} kg
        </p>
      </Card>

      {category === 'Healthy' ? (
        <div className="mt-4 p-4 bg-success/10 border border-success/20 rounded-2xl flex items-start gap-3">
          <PartyPopper className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
          <p className="text-sm text-text-secondary">
            You&apos;re already in a healthy BMI range! Your program will focus on building strength and performance from here.
          </p>
        </div>
      ) : (
        <div className="mt-4 p-4 bg-accent/5 border border-accent/20 rounded-2xl flex items-start gap-3">
          {weightChangeKg < 0 ? (
            <TrendingDown className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          ) : (
            <TrendingUp className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          )}
          <p className="text-sm text-text-secondary">
            Following your program consistently, a realistic estimate is{' '}
            <span className="text-white font-medium">
              ~{months} month{months !== 1 ? 's' : ''}
            </span>{' '}
            to reach a healthy BMI range ({weightChangeKg < 0 ? 'losing' : 'gaining'} ~{Math.abs(Math.round(weightChangeKg))}kg
            at a safe, sustainable pace).
          </p>
        </div>
      )}

      <div className="mt-3 p-3 bg-surface-elevated rounded-xl flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-text-tertiary flex-shrink-0 mt-0.5" />
        <p className="text-xs text-text-tertiary leading-relaxed">
          BMI doesn&apos;t distinguish muscle from fat — very muscular individuals often score
          &quot;overweight&quot; or higher on BMI while being perfectly healthy. Treat this as a rough
          starting reference, not a diagnosis. Consult a professional for a full body composition assessment.
        </p>
      </div>
    </div>
  );
}
