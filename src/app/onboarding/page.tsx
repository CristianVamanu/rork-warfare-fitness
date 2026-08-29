'use client';
export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame, Dumbbell, RefreshCw, Zap,
  ChevronRight, ChevronLeft, Loader2, CheckCircle,
  Home, Building2, Package, User, AlertCircle, TrendingDown, TrendingUp, PartyPopper,
} from 'lucide-react';
import { getIdToken, type User as FirebaseUser } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { signUp } from '@/lib/auth';
import { startPlanCheckout, startCoachingCheckout } from '@/lib/checkout';
import { saveOnboardingData, enrollInProgram, updateUserGoals, updateUserDoc, getSystemConfig, resolveProgram } from '@/lib/firestore';
import { trackEvent } from '@/lib/analytics';
import { estimateNutritionTargets, calculateBmi, estimateWeightGoalTimeline, type NutritionTargets, type WeightGoalTimeline } from '@/lib/tdee';
import { lbsToKg, kgToLbs } from '@/lib/utils';
import { MOCK_PROGRAMS } from '@/lib/programs';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { FullPageSpinner } from '@/components/ui/Spinner';
import type { FitnessGoal, ExperienceLevel, EquipmentType, OnboardingData, BiologicalSex, MedicalHistoryAnswers } from '@/types';

// A plain <video> tag can only play a direct file (mp4/webm/etc) — a
// youtube.com/youtu.be URL isn't one, so it fails to load silently with no
// error the admin or user would ever see. Detect those and embed via
// iframe instead so pasting a YouTube link actually works.
function getYouTubeEmbedUrl(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return `https://www.youtube.com/embed/${m[1]}?autoplay=1&playsinline=1`;
  }
  return null;
}

// ─── Step data ────────────────────────────────────────────────────────────────

const GOALS: { value: FitnessGoal; label: string; sub: string; icon: React.ElementType }[] = [
  { value: 'lose-fat',      label: 'Lose Fat',       sub: 'Burn fat, maintain muscle',       icon: Flame },
  { value: 'build-muscle',  label: 'Build Muscle',   sub: 'Maximize hypertrophy',            icon: Dumbbell },
  { value: 'recomposition', label: 'Recomposition',  sub: 'Build muscle & lose fat',         icon: RefreshCw },
  { value: 'strength',      label: 'Get Stronger',   sub: 'Maximal strength & power',        icon: Zap },
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

// 2 (and 1) deliberately excluded — zero programs in the catalog are built
// for that few days/week, so offering it just set an expectation the
// matcher could never actually meet exactly. 3 stays: real programs exist
// for it (Beginner Full Body, Alpha Bulk).
const DAYS = [3, 4, 5, 6];

// ─── Component ────────────────────────────────────────────────────────────────

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.25, ease: 'easeOut' } },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0, transition: { duration: 0.2 } }),
};

export default function OnboardingPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <OnboardingPageInner />
    </Suspense>
  );
}

// Auto-saved so an interrupted quiz (tab closed, connection dropped, app
// backgrounded) can resume where it left off instead of forcing a full
// redo — losing everything already answered (including the health
// screening) is exactly what made an abandoned mid-flow account look like
// a data-loss bug rather than an incomplete signup. Password/
// confirmPassword are deliberately never included — a plaintext password
// has no business sitting in localStorage.
const ONBOARDING_DRAFT_KEY = 'wf_onboarding_draft';

interface OnboardingDraft {
  step: number;
  goal: FitnessGoal | null;
  experience: ExperienceLevel | null;
  trainingDays: number | null;
  equipment: EquipmentType | null;
  limitations: string;
  sex: BiologicalSex | null;
  age: string;
  heightCm: string;
  weightKg: string;
  targetWeightKg: string;
  weightUnit: 'kg' | 'lbs';
  medicalHistory: MedicalHistoryAnswers;
  targetFocus: OnboardingData['targetFocus'] | null;
  sessionMinutes: OnboardingData['sessionMinutes'] | null;
  trainingStyle: OnboardingData['trainingStyle'] | null;
  name: string;
  email: string;
}

function loadOnboardingDraft(): Partial<OnboardingDraft> {
  try {
    const raw = localStorage.getItem(ONBOARDING_DRAFT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function clearOnboardingDraft() {
  try { localStorage.removeItem(ONBOARDING_DRAFT_KEY); } catch { /* ignore */ }
}

function OnboardingPageInner() {
  const { user, loading: authLoading, refreshProfile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read once per mount — every field below seeds its initial value from
  // this instead of each calling localStorage separately.
  const [draft] = useState(loadOnboardingDraft);

  const [step, setStep] = useState(draft.step ?? 0);
  const [dir, setDir] = useState(1);
  const [goal, setGoal] = useState<FitnessGoal | null>(draft.goal ?? null);
  const [experience, setExperience] = useState<ExperienceLevel | null>(draft.experience ?? null);
  const [trainingDays, setTrainingDays] = useState<number | null>(draft.trainingDays ?? null);
  const [equipment, setEquipment] = useState<EquipmentType | null>(draft.equipment ?? null);
  const [limitations, setLimitations] = useState(draft.limitations ?? '');
  const [sex, setSex] = useState<BiologicalSex | null>(draft.sex ?? null);
  const [age, setAge] = useState(draft.age ?? '');
  const [heightCm, setHeightCm] = useState(draft.heightCm ?? '');
  const [weightKg, setWeightKg] = useState(draft.weightKg ?? '');
  const [targetWeightKg, setTargetWeightKg] = useState(draft.targetWeightKg ?? '');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>(draft.weightUnit ?? 'kg');
  const [medicalHistory, setMedicalHistory] = useState<MedicalHistoryAnswers>(draft.medicalHistory ?? {});
  const [targetFocus, setTargetFocus] = useState<OnboardingData['targetFocus'] | null>(draft.targetFocus ?? null);
  const [sessionMinutes, setSessionMinutes] = useState<OnboardingData['sessionMinutes'] | null>(draft.sessionMinutes ?? null);
  const [trainingStyle, setTrainingStyle] = useState<OnboardingData['trainingStyle'] | null>(draft.trainingStyle ?? null);
  const [name, setName] = useState(draft.name ?? '');
  const [email, setEmail] = useState(draft.email ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'generating' | 'saving' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [videoGreetingUrl, setVideoGreetingUrl] = useState<string | null>(null);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [revealProgram, setRevealProgram] = useState<{ name: string; description: string; weeks: number; daysPerWeek: number } | null>(null);
  const [revealNutrition, setRevealNutrition] = useState<(NutritionTargets & { goalLabel: string; rationale: string }) | null>(null);
  const [revealTimeline, setRevealTimeline] = useState<WeightGoalTimeline | null>(null);
  // Snapshots taken once, at mount — whether this visitor already answered
  // sex and/or age (the landing page's quick-start box only asks sex now;
  // age is asked here instead — but /register's own form still sends both,
  // and either can arrive independently). Deliberately NOT reactive to the
  // live sex/age state: step 0's quick picker below uses these (not
  // sexAgeAnswered) to decide which parts of itself to render, so it
  // doesn't vanish out from under someone mid-keystroke the instant their
  // typed age crosses into the valid 13-100 range.
  const [hadPrefilledSex] = useState(() => {
    const qSex = searchParams.get('sex');
    return qSex === 'male' || qSex === 'female';
  });
  const [hadPrefilledAge] = useState(() => {
    const qAge = searchParams.get('age');
    return !!qAge && /^\d+$/.test(qAge) && +qAge >= 13 && +qAge <= 100;
  });

  function updateMedical(patch: Partial<MedicalHistoryAnswers>) {
    setMedicalHistory((m) => ({ ...m, ...patch }));
  }

  // Persists every answer as it changes — cheap (localStorage writes are
  // synchronous and tiny) and means a tab close/crash/lost connection at
  // any point loses at most the current keystroke, not the whole quiz.
  // Never includes password/confirmPassword (see loadOnboardingDraft above).
  useEffect(() => {
    try {
      const draftToSave: OnboardingDraft = {
        step, goal, experience, trainingDays, equipment, limitations,
        sex, age, heightCm, weightKg, targetWeightKg, weightUnit, medicalHistory,
        targetFocus, sessionMinutes, trainingStyle, name, email,
      };
      localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draftToSave));
    } catch { /* ignore — e.g. private browsing storage quota */ }
  }, [step, goal, experience, trainingDays, equipment, limitations, sex, age, heightCm, weightKg, targetWeightKg, weightUnit, medicalHistory, targetFocus, sessionMinutes, trainingStyle, name, email]);

  // Pre-fills sex/age from the landing page's quick-start selector (now
  // mandatory there — see LandingClient.tsx). Visitors who didn't come
  // through that box (e.g. "New here? Create account" straight from
  // /login) get asked the same quick question here instead, right at step
  // 0 — see StepGoal below — rather than only much later on the full
  // "About You" step. Either way, once sex/age are answered they're never
  // asked again (sexAgeAnswered, derived below) — asking the same question
  // twice read as the app not listening, not as thoroughness.
  useEffect(() => {
    const qSex = searchParams.get('sex');
    const qAge = searchParams.get('age');
    const validSex = qSex === 'male' || qSex === 'female';
    const validAge = !!qAge && /^\d+$/.test(qAge) && +qAge >= 13 && +qAge <= 100;
    if (validSex) setSex(qSex);
    if (validAge) setAge(qAge!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A program picked directly on the landing page's catalog (via
  // ?programId=X) — honored as-is instead of being silently overridden by
  // the AI matcher below. The quiz still runs and still saves goal/
  // biometrics/equipment for nutrition targets and other features; it just
  // doesn't get to pick a *different* program than the one this visitor
  // deliberately chose.
  const preselectedProgramId = searchParams.get('programId');
  // Carries the pricing-card the visitor actually clicked on the landing
  // page through signup + the quiz, so "Let's Go" lands them in the
  // checkout they picked instead of forgetting it and dropping them on the
  // free dashboard with no prompt to ever pay.
  const preselectedPlanId = searchParams.get('planId');
  const preselectedCoachingPlanId = searchParams.get('coachingPlanId');

  // Quiz runs fully anonymously — no account required to start. The account
  // is only created at the very last step, once someone has already
  // invested the time answering everything else (the same order most
  // high-converting fitness quiz funnels use, since asking for an email
  // after real engagement converts far better than gating the quiz behind
  // signup). If someone arrives here already logged in (e.g. redirected by
  // the app because their onboarding was left incomplete), the account step
  // is skipped entirely since there's nothing left to create.
  //
  // Frozen once auth state is actually known, not recomputed live from
  // `user` on every render — the account gets created at ACCOUNT_STEP (the
  // last step), and the instant that signup succeeds, `user` flips from
  // null to truthy mid-flow, which flipped `needsAccount` false and shrank
  // TOTAL_STEPS from 11 to 10 without `step` (still 10, i.e. "step 11")
  // ever adjusting — showing "Step 11 of 10" for the rest of that render.
  //
  // Can't just capture `!user` in a useState initializer on first render:
  // Firebase's onAuthStateChanged is always async, so `user` is guaranteed
  // null on this component's very first render even for an ALREADY signed-in
  // visitor (e.g. redirected here mid-onboarding) — that would permanently
  // lock needsAccount to true and make handleFinish() call signUp() again
  // for an already-authenticated user instead of reusing them, creating a
  // second account. Resolved once via effect, gated on authLoading having
  // actually finished (the `authLoading` early-return below also blocks
  // rendering the real quiz body until this has a value, so there's no
  // visible flash defaulting to the wrong step count either).
  const [needsAccount, setNeedsAccount] = useState<boolean | null>(null);
  useEffect(() => {
    if (!authLoading && needsAccount === null) setNeedsAccount(!user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);
  const TOTAL_STEPS = needsAccount ? 11 : 10;
  const ACCOUNT_STEP = 10;

  // Set the instant signUp() succeeds inside handleFinish, never cleared —
  // `needsAccount` itself is frozen once determined (see its own comment
  // above) and doesn't flip false just because `user` changed mid-flow. If
  // ANYTHING after account creation threw (a peripheral write failing, a
  // network blip) and the user hit "Create Account" again, handleFinish
  // would otherwise call signUp() a second time with the same email/
  // password — which fails with auth/email-already-in-use for an account
  // that already exists and already has every answer this quiz collected,
  // turning a recoverable hiccup into a dead end. Checked first thing in
  // handleFinish to reuse the already-created account instead.
  const createdUserRef = useRef<FirebaseUser | null>(null);

  const ageNum = parseInt(age, 10);
  const heightNum = parseFloat(heightCm);
  const weightNum = parseFloat(weightKg);
  const targetWeightNum = parseFloat(targetWeightKg);
  // Purely reactive — true the moment both are validly set, regardless of
  // whether that happened via the landing page's query params or the quick
  // picker on step 0 below. Drives both "hide the redundant question on the
  // About You step" and "don't block step 0 on it once it's answered."
  const sexAgeAnswered = !!sex && ageNum >= 13 && ageNum <= 100;
  // Goal weight is mandatory alongside current weight — without both there's
  // no timeline to estimate and no accurate program-duration match, which
  // was the whole point of asking (see estimateWeightGoalTimeline in
  // lib/tdee.ts and the weight-goal scoring bonus in pickBestProgram).
  const biometricsValid = sexAgeAnswered && heightNum >= 100 && heightNum <= 250
    && weightNum >= 30 && weightNum <= 300 && targetWeightNum >= 30 && targetWeightNum <= 300;
  const accountValid = name.trim().length >= 2 && /^\S+@\S+\.\S+$/.test(email) && password.length >= 6 && password === confirmPassword;

  // Every yes/no screening question must be explicitly answered (true or
  // false — undefined means "skipped") before either step can advance.
  // The free-text/numeric fields alongside them (body fat %, blood
  // pressure, daily fluid intake, etc) stay optional — most people
  // genuinely don't know their resting heart rate off-hand, and forcing a
  // made-up number in would make the data worse, not better.
  const medicalHistoryAnswered = [
    medicalHistory.practicesSports, medicalHistory.movementDisorders, medicalHistory.previousSurgeries,
    medicalHistory.sportsInjuries, medicalHistory.musculoskeletalProblems, medicalHistory.heartDisease,
    medicalHistory.otherMedicalConditions,
  ].every((v) => v !== undefined);
  const lifestyleHabitsAnswered = [
    medicalHistory.smokes, medicalHistory.drinksAlcoholRegularly, medicalHistory.suffersFromStress,
    medicalHistory.takesSleepingPills, medicalHistory.takesPainMedication, medicalHistory.takesBetaBlockers,
    medicalHistory.eatsFattyOrSweetFoodsOften, medicalHistory.experiencesFoodCravings,
  ].every((v) => v !== undefined);

  const canAdvance = [
    !!goal && sexAgeAnswered,
    !!experience,
    !!trainingDays,
    !!equipment,
    biometricsValid,
    true, // BMI result step is informational only
    true, // limitations is optional
    medicalHistoryAnswered,
    lifestyleHabitsAnswered,
    true, // focus/session/style preferences are optional
    accountValid, // only reached when needsAccount is true
  ][step];

  function go(delta: number) {
    setDir(delta);
    setStep((s) => Math.max(0, Math.min(TOTAL_STEPS - 1, s + delta)));
  }

  // Combines the free-text limitations field with any "Yes"-flagged medical
  // history answers into one summary string for the AI prompt — the
  // medical questionnaire was previously collected but never actually
  // reached program generation.
  function buildLimitationsSummary(): string {
    const parts: string[] = [];
    if (limitations.trim()) parts.push(limitations.trim());
    const flags: [boolean | undefined, string, string | undefined][] = [
      [medicalHistory.movementDisorders, 'movement disorder', medicalHistory.movementDisordersDetail],
      [medicalHistory.previousSurgeries, 'previous surgery', medicalHistory.previousSurgeriesDetail],
      [medicalHistory.sportsInjuries, 'sports injury', medicalHistory.sportsInjuriesDetail],
      [medicalHistory.musculoskeletalProblems, 'musculoskeletal problem', medicalHistory.musculoskeletalProblemsDetail],
      [medicalHistory.heartDisease, 'heart condition', medicalHistory.heartDiseaseDetail],
      [medicalHistory.otherMedicalConditions, 'other medical condition', medicalHistory.otherMedicalConditionsDetail],
    ];
    for (const [flag, label, detail] of flags) {
      if (flag) parts.push(detail ? `${label} (${detail})` : label);
    }
    return parts.join('; ');
  }

  function fallbackRecommendProgram(estimatedWeeksToGoal?: number): typeof MOCK_PROGRAMS[0] {
    // Goal → program goal mapping
    const goalMap: Record<FitnessGoal, string> = {
      'lose-fat': 'weight-loss',
      'build-muscle': 'hypertrophy',
      'recomposition': 'hypertrophy',
      'strength': 'strength',
    };
    const targetGoal = goalMap[goal!];

    // Score each program by how well it matches — mirrors pickBestProgram's
    // weighting (lib/programs.ts) so the local fallback never disagrees
    // wildly with the real matcher when it's used.
    const scored = MOCK_PROGRAMS.map((p) => {
      let score = 0;
      if (p.goal === targetGoal) score += 10;
      if (p.level === experience) score += 5;
      // Prefer programs whose daysPerWeek is close to what the user chose
      score -= Math.abs(p.daysPerWeek - (trainingDays ?? 3));
      if (estimatedWeeksToGoal && estimatedWeeksToGoal > 0) {
        score -= Math.min(10, Math.abs(p.weeks - estimatedWeeksToGoal) * 0.3);
      }
      return { p, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0].p;
  }

  async function handleFinish() {
    // These early-return guards used to fail completely silently — no error
    // shown, button just did nothing. If a user hit this state (e.g. left
    // Confirm password empty, which alone makes accountValid false with no
    // visible field error since the mismatch warning only fires once both
    // fields have something typed), it looked exactly like a broken button.
    if (!goal || !experience || !trainingDays || !equipment) {
      setError('Something went missing earlier in the quiz — please go back and check every step.');
      return;
    }
    if (needsAccount && !accountValid) {
      setError(
        !name.trim() || name.trim().length < 2 ? 'Enter your name (at least 2 characters).' :
        !/^\S+@\S+\.\S+$/.test(email) ? 'Enter a valid email address.' :
        password.length < 6 ? 'Password must be at least 6 characters.' :
        'Passwords don’t match — check both password fields.'
      );
      return;
    }
    setError(null);
    setStatus('generating');

    try {
      // Account is created right here — the last possible moment — so
      // nothing above this point has ever required signing up. If this
      // throws (e.g. email already registered), status resets to idle and
      // the user lands back on the account step with every other answer
      // still intact, not a blank quiz.
      let activeUser: FirebaseUser;
      if (createdUserRef.current) {
        activeUser = createdUserRef.current;
      } else if (needsAccount) {
        activeUser = await signUp(email.trim(), password, name.trim(), weightUnit);
        createdUserRef.current = activeUser;
        trackEvent('CompleteRegistration');
      } else {
        activeUser = user!;
      }

      const biometricsPayload = biometricsValid ? { sex: sex!, age: ageNum, heightCm: heightNum, weightKg: weightNum } : undefined;
      const authToken = await getIdToken(activeUser);

      // Weight-goal timeline — drives both the program-duration match below
      // and the "you'll reach your goal in X months" reveal message. Only
      // computable when biometrics passed validation (both weights present).
      const timeline = biometricsValid ? estimateWeightGoalTimeline(weightNum, targetWeightNum) : null;
      if (timeline) setRevealTimeline(timeline);

      // Everything below is independent — none of these depend on each
      // other's result — so they run concurrently instead of one after
      // another. The old sequential version (AI program call, then wait,
      // then a second AI call for nutrition, then wait, then save, then
      // wait...) is exactly what made onboarding feel like it took 30
      // seconds: network + LLM latency stacking up serially instead of
      // overlapping.

      // Program: assign the best-fit existing program (admin-created, or
      // the seed library if none exist yet) rather than generating one from
      // scratch — see /api/ai/recommend-program. Falls back to a local
      // match against the seed library if the request itself fails, so
      // onboarding never blocks a new user from finishing.
      const programTask = (async () => {
        let program: { id: string; name: string; description: string; weeks: number; daysPerWeek: number } | null = null;

        // If this visitor picked a specific program on the landing page's
        // catalog, honor that choice as-is instead of letting the AI matcher
        // below silently override it with a different program.
        if (preselectedProgramId) {
          try {
            const resolved = await resolveProgram(preselectedProgramId);
            if (resolved) {
              program = { id: resolved.id, name: resolved.name, description: resolved.description, weeks: resolved.weeks, daysPerWeek: resolved.daysPerWeek };
            }
          } catch {
            // fall through to AI matching / local fallback below
          }
        }

        if (!program) {
          try {
            const res = await fetch('/api/ai/recommend-program', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
              body: JSON.stringify({
                goal, experience, trainingDays,
                sex: sex ?? undefined,
                hasLimitations: !!buildLimitationsSummary(),
                equipment: equipment ?? undefined,
                estimatedWeeksToGoal: timeline?.weeksToGoal ?? undefined,
              }),
            });
            if (!res.ok) throw new Error('Program assignment unavailable');
            const { program: matched } = await res.json();
            program = matched;
          } catch {
            program = fallbackRecommendProgram(timeline?.weeksToGoal ?? undefined);
          }
        }
        const finalProgram = program!;
        try {
          await enrollInProgram(activeUser.uid, {
            id: finalProgram.id, name: finalProgram.name, weeks: finalProgram.weeks, daysPerWeek: finalProgram.daysPerWeek,
          });
          setRevealProgram(finalProgram);
        } catch (err) {
          // A preselected (or matched) program can legitimately be
          // members-only/priced — firestore.rules correctly refuses to
          // enroll a brand-new, non-paying account into one. That's
          // expected, not a bug, but it used to take the ENTIRE
          // Promise.all below down with it: nutritionTask/saveTask/
          // weightTask have nothing to do with program access and
          // shouldn't fail just because this one did. Onboarding now
          // finishes without a program instead of leaving the account
          // half-set-up (no goals, onboardingComplete still false) — the
          // user can subscribe/purchase and pick one from /training after.
          console.error('[Onboarding] Program enrollment failed — continuing without one:', err);
        }
      })();

      // Nutrition targets: deterministic math server-side (near-instant,
      // no AI call), falling back to the same calculation done locally if
      // the request itself fails for any reason.
      const nutritionTask = (async () => {
        let nutritionTargets: NutritionTargets & { goalLabel: string; rationale: string };
        try {
          const res = await fetch('/api/ai/nutrition-targets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goal, experience, trainingDays, biometrics: biometricsPayload }),
          });
          if (!res.ok) throw new Error('Nutrition target calculation unavailable');
          nutritionTargets = await res.json();
        } catch {
          const local = estimateNutritionTargets(goal, experience, trainingDays, biometricsPayload);
          const goalLabels: Record<FitnessGoal, string> = {
            'lose-fat': 'Fat Loss', 'build-muscle': 'Muscle Gain', recomposition: 'Body Recomposition', strength: 'Strength',
          };
          nutritionTargets = { ...local, goalLabel: goalLabels[goal], rationale: '' };
        }
        try {
          await updateUserGoals(activeUser.uid, {
            calories: nutritionTargets.calories,
            protein: nutritionTargets.protein,
            carbs: nutritionTargets.carbs,
            fat: nutritionTargets.fat,
            water: nutritionTargets.water,
          });
          setRevealNutrition(nutritionTargets);
        } catch (err) {
          // Same reasoning as programTask below: a brand-new account should
          // never fail signup entirely over one non-essential write — the
          // user can set nutrition targets from Settings after the fact.
          console.error('[Onboarding] Saving nutrition targets failed — continuing without them:', err);
        }
      })();

      // Save onboarding answers + mark complete — doesn't depend on either
      // AI call above, so it doesn't need to wait for them either.
      const cleanedMedicalHistory = Object.fromEntries(
        Object.entries(medicalHistory).filter(([, v]) => v !== undefined && v !== '')
      ) as MedicalHistoryAnswers;
      const onboardingData: OnboardingData = {
        fitnessGoal: goal,
        experience,
        trainingDays,
        equipment,
        ...(limitations.trim() ? { limitations: limitations.trim() } : {}),
        ...(biometricsValid ? { sex: sex!, age: ageNum, heightCm: heightNum, targetWeightKg: targetWeightNum } : {}),
        ...(Object.keys(cleanedMedicalHistory).length > 0 ? { medicalHistory: cleanedMedicalHistory } : {}),
        ...(targetFocus ? { targetFocus } : {}),
        ...(sessionMinutes ? { sessionMinutes } : {}),
        ...(trainingStyle ? { trainingStyle } : {}),
      };
      // onboardingComplete has to actually land, or the account gets stuck
      // in a redirect loop back to /onboarding forever (see AppLayout) — if
      // the full write throws for any reason, fall back to writing just
      // that one boolean by itself (far less likely to hit the same issue,
      // whatever it was) so the account can still reach the app; the rest
      // of the quiz answers can be re-entered from Settings if truly lost,
      // being stuck unable to sign up at all cannot.
      const saveTask = (async () => {
        try {
          await saveOnboardingData(activeUser.uid, { ...onboardingData, onboardingComplete: true });
        } catch (err) {
          console.error('[Onboarding] Saving full onboarding data failed — writing onboardingComplete only:', err);
          await updateUserDoc(activeUser.uid, { onboardingComplete: true }).catch((fallbackErr) => {
            console.error('[Onboarding] onboardingComplete fallback write also failed:', fallbackErr);
          });
        }
      })();
      // Weight goal is set once, here, at signup — startedAt/estimatedTargetDate
      // are the fixed reference points the goals page measures ongoing
      // progress against, not recomputed every time weight is logged. Never
      // fatal — a brand-new account shouldn't fail signup entirely over this
      // one non-essential write; weight can be logged from Progress after.
      const nowIso = new Date().toISOString().slice(0, 10);
      const weightTask = !biometricsValid ? Promise.resolve() : updateUserDoc(activeUser.uid, {
        currentWeightKg: weightNum,
        // Already set by signUp() itself for a brand-new account (via the
        // weightUnit arg above) — repeated here too for the needsAccount
        // false path (an already-authenticated user resuming onboarding),
        // whose profile could otherwise be stuck on whatever unit was
        // picked at their ORIGINAL signup, ignoring the choice made here.
        weightUnit,
        weightGoal: {
          startWeightKg: weightNum,
          targetWeightKg: targetWeightNum,
          startedAt: nowIso,
          estimatedTargetDate: timeline && timeline.weeksToGoal > 0
            ? new Date(Date.now() + timeline.weeksToGoal * 7 * 86400000).toISOString().slice(0, 10)
            : nowIso,
          direction: timeline?.direction ?? 'maintain',
        },
      }).catch((err) => {
        console.error('[Onboarding] Saving weight goal failed — continuing without it:', err);
      });

      setStatus('saving');
      await Promise.all([programTask, nutritionTask, saveTask, weightTask]);

      // Everything is safely persisted now (saveTask above just completed) —
      // the draft has done its job and would otherwise linger and prefill
      // stale answers if this browser/device ever starts onboarding again.
      clearOnboardingDraft();

      // Refresh profile so layout no longer redirects here, then show the
      // plan reveal — proceedToApp() (triggered by its "Let's Go" button)
      // handles the video-greeting check and final navigation.
      setStatus('done');
      await refreshProfile();
    } catch (err: unknown) {
      console.error('[Onboarding] failed:', err);
      const code = (err as { code?: string })?.code;
      const FRIENDLY: Record<string, string> = {
        'auth/email-already-in-use': 'That email already has an account — sign in instead.',
        'auth/weak-password': 'Password is too weak — use at least 6 characters.',
        'auth/invalid-email': 'That email address looks invalid.',
      };
      setError(code && FRIENDLY[code] ? FRIENDLY[code] : (err instanceof Error ? err.message : 'Something went wrong. Please try again.'));
      // If account creation itself failed, jump back to the account step so
      // the error is visible right next to the field that needs fixing
      // rather than wherever the user happened to be scrolled to.
      if (code?.startsWith('auth/')) { setStep(ACCOUNT_STEP); setDir(-1); }
      setStatus('idle');
    }
  }

  // Guards against a fast double-tap on "Let's Go" firing this twice — on
  // touch devices a quick double-press can fire two click events before the
  // first async fetch resolves, which was opening the video modal twice in
  // a row and made the greeting look like it restarted/played twice.
  const proceedingRef = useRef(false);

  async function proceedToApp() {
    if (proceedingRef.current) return;
    proceedingRef.current = true;
    // Honor whichever pricing card the visitor actually clicked on the
    // landing page — send them straight into that checkout instead of
    // dropping them on the dashboard having forgotten the price they saw.
    if (user && (preselectedPlanId || preselectedCoachingPlanId)) {
      const err = preselectedCoachingPlanId
        ? await startCoachingCheckout(user, preselectedCoachingPlanId)
        : await startPlanCheckout(user, preselectedPlanId!);
      if (!err) return; // navigated to Stripe
      setError(err);
    }
    try {
      const cfg = await getSystemConfig();
      if (cfg?.videoGreetingUrl) {
        setVideoGreetingUrl(cfg.videoGreetingUrl as string);
        setShowVideoModal(true);
        return; // navigation happens when user dismisses video
      }
    } catch { /* ignore */ }
    router.replace('/dashboard');
  }

  const isGenerating = status === 'generating' || status === 'saving';

  // Was previously `&& !showVideoModal`, which hid this whole reveal screen
  // the instant the welcome-video modal opened — with nothing else to fall
  // back on, the component then rendered the raw step-1 onboarding form
  // underneath the (modal) video, looking exactly like onboarding had reset
  // back to the start. The reveal screen should stay put as the backdrop
  // while the video modal sits on top of it, same as any other modal here.
  if (status === 'done' && revealProgram) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="max-w-sm w-full">
          <div className="w-16 h-16 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-5">
            <PartyPopper className="w-8 h-8 text-accent" />
          </div>
          <p className="text-xs font-bold text-accent uppercase tracking-wide mb-2">Your Personalized Plan</p>
          <h1 className="text-2xl font-black text-white mb-2">{revealProgram.name}</h1>
          <p className="text-text-secondary text-sm mb-5 leading-relaxed whitespace-pre-line">{revealProgram.description}</p>
          <div className="flex items-center justify-center gap-6 mb-6">
            <div>
              <p className="text-2xl font-black text-white">{revealProgram.weeks}</p>
              <p className="text-xs text-text-secondary">weeks</p>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div>
              <p className="text-2xl font-black text-white">{revealProgram.daysPerWeek}</p>
              <p className="text-xs text-text-secondary">days/week</p>
            </div>
          </div>

          {/* The core promise of the whole goal-weight question: a concrete,
              personalized timeline tied to the specific program just
              assigned — not a generic "results vary" hand-wave. */}
          {revealTimeline && revealTimeline.weeksToGoal > 0 && (
            <div className="mb-6 p-4 bg-accent/5 border border-accent/20 rounded-2xl text-left flex items-start gap-3">
              {revealTimeline.direction === 'lose'
                ? <TrendingDown className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                : <TrendingUp className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />}
              <p className="text-sm text-text-secondary leading-relaxed">
                Based on this information, you&apos;ll reach your goal weight in{' '}
                <span className="text-white font-bold">
                  ~{revealTimeline.monthsToGoal} month{revealTimeline.monthsToGoal !== 1 ? 's' : ''}
                </span>{' '}
                by following <span className="text-white font-bold">{revealProgram.name}</span>
                {' '}({revealTimeline.direction === 'lose' ? 'losing' : 'gaining'} ~{Math.abs(Math.round(weightUnit === 'lbs' ? kgToLbs(revealTimeline.weightChangeKg) : revealTimeline.weightChangeKg))}{weightUnit} at a safe, sustainable pace).
              </p>
            </div>
          )}

          {revealNutrition && (
            <Card className="p-5 mb-6 text-left">
              <p className="text-xs font-bold text-accent uppercase tracking-wide mb-3 text-center">Your Nutrition Targets</p>
              <div className="flex items-end justify-center gap-2 mb-1">
                <p className="text-3xl font-black text-white leading-none">{revealNutrition.calories.toLocaleString()}</p>
                <p className="text-sm text-text-secondary mb-0.5">cal / day</p>
              </div>
              <p className="text-xs text-text-tertiary text-center mb-4">
                {revealNutrition.calorieAdjustment === 0
                  ? `Maintenance (${revealNutrition.maintenanceCalories.toLocaleString()} cal)`
                  : `${revealNutrition.maintenanceCalories.toLocaleString()} cal maintenance ${revealNutrition.calorieAdjustment > 0 ? '+' : '−'} ${Math.abs(revealNutrition.calorieAdjustment)} for ${revealNutrition.goalLabel}`}
              </p>

              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: 'Protein', value: revealNutrition.protein, color: 'text-red-400' },
                  { label: 'Carbs', value: revealNutrition.carbs, color: 'text-blue-400' },
                  { label: 'Fat', value: revealNutrition.fat, color: 'text-yellow-400' },
                ].map((m) => (
                  <div key={m.label} className="bg-surface rounded-xl py-2.5 text-center">
                    <p className={`text-base font-black ${m.color}`}>{m.value}g</p>
                    <p className="text-[10px] text-text-tertiary">{m.label}</p>
                  </div>
                ))}
              </div>

              {revealNutrition.rationale && (
                <p className="text-xs text-text-secondary leading-relaxed">{revealNutrition.rationale}</p>
              )}
              {!revealNutrition.usedRealBiometrics && (
                <p className="text-[10px] text-text-tertiary mt-2">
                  Estimated from your training frequency — add your height/weight in Profile for a more precise target.
                </p>
              )}
            </Card>
          )}

          <Button fullWidth size="lg" onClick={proceedToApp}>
            Let&apos;s Go <ChevronRight className="w-4 h-4" />
          </Button>
        </motion.div>

        {/* Video Greeting Modal — lives here (not the step-form return
            below) since this reveal screen is now the backdrop while it's
            open, not swapped out for the raw onboarding form. */}
        <Modal open={showVideoModal} onClose={() => { setShowVideoModal(false); router.replace('/dashboard'); }} title="Welcome to the Team! 🎉">
          <div className="space-y-4">
            {videoGreetingUrl && (
              <div className="rounded-xl overflow-hidden bg-black aspect-video">
                {(() => {
                  const embedUrl = getYouTubeEmbedUrl(videoGreetingUrl);
                  return embedUrl ? (
                    <iframe
                      src={embedUrl}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <video
                      src={videoGreetingUrl}
                      controls
                      autoPlay
                      playsInline
                      webkit-playsinline="true"
                      crossOrigin="anonymous"
                      className="w-full h-full object-contain"
                    />
                  );
                })()}
              </div>
            )}
            <p className="text-sm text-text-secondary text-center">A personal welcome to get you started.</p>
            <Button fullWidth onClick={() => { setShowVideoModal(false); router.replace('/dashboard'); }}>
              Let&apos;s Go! →
            </Button>
          </div>
        </Modal>
      </div>
    );
  }

  if (authLoading || needsAccount === null) return <FullPageSpinner />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="px-4 pt-12 pb-4 max-w-lg mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          {step === 0 ? (
            <Link
              href="/"
              className="p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5 transition-colors"
              title="Back to homepage"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
          ) : (
            <button
              onClick={() => go(-1)}
              disabled={isGenerating}
              className="p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <span className="text-xs text-text-secondary">Step {step + 1} of {TOTAL_STEPS}</span>
          <div className="w-9" />
        </div>
        {/* Segmented — one dash per step, filled solid through the current
            one — reads as "how far into the mission" at a glance instead of
            a single continuous bar that doesn't communicate step count. */}
        <div className="flex gap-1">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i < step ? 'bg-accent' : i === step ? 'bg-accent/45' : 'bg-white/10'
              }`}
            />
          ))}
        </div>
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
              <StepGoal
                selected={goal} onSelect={setGoal}
                sex={sex} onSex={setSex} age={age} onAge={setAge}
                showSexPicker={!hadPrefilledSex} showAgeInput={!hadPrefilledAge}
              />
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
                targetWeightKg={targetWeightKg} onTargetWeight={setTargetWeightKg}
                weightUnit={weightUnit} onWeightUnit={setWeightUnit}
                sexAgeAnswered={sexAgeAnswered} onEditSexAge={() => { setSex(null); setAge(''); }}
              />
            )}
            {step === 5 && (
              <StepBmiResult heightCm={heightNum} weightKg={weightNum} weightUnit={weightUnit} />
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
            {step === 9 && (
              <StepPreferences
                targetFocus={targetFocus} onTargetFocus={setTargetFocus}
                sessionMinutes={sessionMinutes} onSessionMinutes={setSessionMinutes}
                trainingStyle={trainingStyle} onTrainingStyle={setTrainingStyle}
              />
            )}
            {step === ACCOUNT_STEP && needsAccount && (
              <StepAccount
                name={name} onName={setName}
                email={email} onEmail={setEmail}
                password={password} onPassword={setPassword}
                confirmPassword={confirmPassword} onConfirmPassword={setConfirmPassword}
              />
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
            disabled={isGenerating || !canAdvance}
            onClick={handleFinish}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {needsAccount ? 'Creating your account…' : 'Setting up your program…'}
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                {needsAccount ? 'Create Account & Get My Plan' : 'Generate My Program'}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Step components ───────────────────────────────────────────────────────────

// Shared selection-tile language across Goal/Experience/Equipment — icon
// badge, bold label, a real checkmark badge instead of a bare icon on
// select, and a stronger glow on the active state. `layout="grid"` stacks
// icon-above-label for short single-line options (Goal); `layout="row"`
// keeps icon-beside-text for options that carry a longer description
// (Experience, Equipment) where stacking would force awkward line wraps.
function OptionTile({
  selected, onClick, icon: Icon, label, sub, layout = 'row',
}: {
  selected: boolean;
  onClick: () => void;
  icon?: React.ElementType;
  label: string;
  sub?: string;
  layout?: 'row' | 'grid';
}) {
  const base = `w-full text-left rounded-2xl border transition-all ${
    selected
      ? 'border-accent bg-gradient-to-br from-accent/15 to-transparent shadow-[0_0_0_1px_rgba(245,166,35,0.15)]'
      : 'border-white/8 bg-surface hover:border-white/20'
  }`;

  if (layout === 'grid') {
    return (
      <button onClick={onClick} className={`${base} p-4 flex flex-col gap-3 min-h-[104px]`}>
        {Icon && (
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${selected ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'}`}>
            <Icon className="w-[18px] h-[18px]" />
          </div>
        )}
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="font-bold text-white text-sm leading-tight">{label}</p>
            {sub && <p className="text-[11px] text-text-secondary mt-0.5 leading-snug">{sub}</p>}
          </div>
          {selected && (
            <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-3.5 h-3.5 text-black" strokeWidth={3} />
            </div>
          )}
        </div>
      </button>
    );
  }

  return (
    <button onClick={onClick} className={`${base} p-4 flex items-center gap-4`}>
      {Icon && (
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${selected ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'}`}>
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-white text-sm">{label}</p>
        {sub && <p className="text-xs text-text-secondary mt-0.5">{sub}</p>}
      </div>
      {selected ? (
        <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
          <CheckCircle className="w-4 h-4 text-black" strokeWidth={3} />
        </div>
      ) : (
        <div className="w-6 h-6 rounded-full border-2 border-white/15 flex-shrink-0" />
      )}
    </button>
  );
}

function StepGoal({
  selected, onSelect, sex, onSex, age, onAge, showSexPicker, showAgeInput,
}: {
  selected: FitnessGoal | null; onSelect: (v: FitnessGoal) => void;
  sex: BiologicalSex | null; onSex: (v: BiologicalSex) => void;
  age: string; onAge: (v: string) => void;
  showSexPicker: boolean; showAgeInput: boolean;
}) {
  return (
    <div>
      {/* Asked right here, first, for anyone who didn't already answer it
          elsewhere — the landing page's quick-start box only asks sex now
          (age is asked here instead, since it's the less important of the
          two to front-load), and /register's own form still asks both.
          Whichever of sex/age wasn't already answered shows here; previously
          this was asked much later on the "About You" step, and visitors
          who started from "New here? Create account" on /login never got
          asked early at all. */}
      {(showSexPicker || showAgeInput) && (
        <div className="mb-6 p-4 bg-surface rounded-2xl border border-white/8">
          <p className="text-xs font-bold text-text-tertiary uppercase tracking-wide mb-3">Quick — before we start</p>
          {showSexPicker && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              {SEX_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => onSex(value)}
                  className={`p-3 text-center rounded-xl border transition-all ${
                    sex === value ? 'border-accent bg-accent/10' : 'border-white/8 bg-surface-elevated hover:border-white/20'
                  }`}
                >
                  <Icon className={`w-4 h-4 mx-auto mb-1 ${sex === value ? 'text-accent' : 'text-text-secondary'}`} />
                  <p className="text-xs font-medium text-white">{label}</p>
                </button>
              ))}
            </div>
          )}
          {showAgeInput && (
            <input
              type="number"
              inputMode="numeric"
              value={age}
              onChange={(e) => onAge(e.target.value)}
              placeholder="Your age"
              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm text-center placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
            />
          )}
        </div>
      )}

      <h1 className="text-2xl font-black text-white mb-1">What&apos;s your goal?</h1>
      <p className="text-text-secondary text-sm mb-5">This determines your program structure and intensity.</p>
      <div className="grid grid-cols-2 gap-3">
        {GOALS.map(({ value, label, sub, icon: Icon }) => (
          <OptionTile
            key={value}
            layout="grid"
            icon={Icon}
            label={label}
            sub={sub}
            selected={selected === value}
            onClick={() => onSelect(value)}
          />
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
          <OptionTile
            key={value}
            label={label}
            sub={sub}
            selected={selected === value}
            onClick={() => onSelect(value)}
          />
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
      <div className="grid grid-cols-4 gap-2">
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
          <OptionTile
            key={value}
            icon={Icon}
            label={label}
            sub={sub}
            selected={selected === value}
            onClick={() => onSelect(value)}
          />
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
  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">Health screening</h1>
      <p className="text-text-secondary text-sm mb-5">
        Answer every question below (Yes/No) so your program can work around any medical considerations — kept private to your account.
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
  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">Lifestyle habits</h1>
      <p className="text-text-secondary text-sm mb-5">
        Answer every question below (Yes/No) to help tailor your nutrition and recovery guidance.
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

const TARGET_FOCUS: { value: NonNullable<OnboardingData['targetFocus']>; label: string }[] = [
  { value: 'full-body', label: 'Full Body' },
  { value: 'upper-body', label: 'Upper Body' },
  { value: 'lower-body', label: 'Lower Body' },
  { value: 'core', label: 'Core Focus' },
];

const SESSION_MINUTES: NonNullable<OnboardingData['sessionMinutes']>[] = [30, 45, 60, 90];

const TRAINING_STYLE: { value: NonNullable<OnboardingData['trainingStyle']>; label: string; sub: string }[] = [
  { value: 'free-weights', label: 'Free Weights', sub: 'Barbells & dumbbells' },
  { value: 'machines', label: 'Machines', sub: 'Guided, joint-friendly' },
  { value: 'bodyweight', label: 'Bodyweight', sub: 'Calisthenics-style' },
  { value: 'mixed', label: 'No Preference', sub: 'Whatever fits the program' },
];

function StepPreferences({
  targetFocus, onTargetFocus, sessionMinutes, onSessionMinutes, trainingStyle, onTrainingStyle,
}: {
  targetFocus: OnboardingData['targetFocus'] | null;
  onTargetFocus: (v: NonNullable<OnboardingData['targetFocus']>) => void;
  sessionMinutes: OnboardingData['sessionMinutes'] | null;
  onSessionMinutes: (v: NonNullable<OnboardingData['sessionMinutes']>) => void;
  trainingStyle: OnboardingData['trainingStyle'] | null;
  onTrainingStyle: (v: NonNullable<OnboardingData['trainingStyle']>) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">Dial it in</h1>
      <p className="text-text-secondary text-sm mb-5">A few more details so your AI-generated program fits exactly how you train.</p>

      <p className="text-xs font-medium text-text-secondary mb-2">Focus area</p>
      <div className="grid grid-cols-2 gap-2 mb-5">
        {TARGET_FOCUS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onTargetFocus(value)}
            className={`py-3 rounded-xl text-sm font-bold transition-all border ${
              targetFocus === value ? 'bg-accent text-black border-accent' : 'border-white/10 text-white bg-surface-elevated hover:border-accent/40'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="text-xs font-medium text-text-secondary mb-2">Time per session</p>
      <div className="grid grid-cols-4 gap-2 mb-5">
        {SESSION_MINUTES.map((m) => (
          <button
            key={m}
            onClick={() => onSessionMinutes(m)}
            className={`py-3 rounded-xl text-sm font-bold transition-all border ${
              sessionMinutes === m ? 'bg-accent text-black border-accent' : 'border-white/10 text-white bg-surface-elevated hover:border-accent/40'
            }`}
          >
            {m}m
          </button>
        ))}
      </div>

      <p className="text-xs font-medium text-text-secondary mb-2">Training style</p>
      <div className="space-y-2">
        {TRAINING_STYLE.map(({ value, label, sub }) => (
          <button key={value} onClick={() => onTrainingStyle(value)} className="w-full text-left">
            <Card className={`p-3.5 flex items-center gap-3 transition-colors ${trainingStyle === value ? 'border-accent bg-accent/5' : ''}`}>
              <div>
                <p className="font-bold text-white text-sm">{label}</p>
                <p className="text-xs text-text-secondary">{sub}</p>
              </div>
              {trainingStyle === value && <CheckCircle className="w-4 h-4 text-accent ml-auto flex-shrink-0" />}
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

const SEX_OPTIONS: { value: BiologicalSex; label: string; icon: React.ElementType }[] = [
  { value: 'male', label: 'Male', icon: User },
  { value: 'female', label: 'Female', icon: User },
];

function StepBiometrics({
  sex, onSex, age, onAge, heightCm, onHeight, weightKg, onWeight, targetWeightKg, onTargetWeight,
  weightUnit, onWeightUnit, sexAgeAnswered, onEditSexAge,
}: {
  sex: BiologicalSex | null; onSex: (v: BiologicalSex) => void;
  age: string; onAge: (v: string) => void;
  heightCm: string; onHeight: (v: string) => void;
  weightKg: string; onWeight: (v: string) => void;
  targetWeightKg: string; onTargetWeight: (v: string) => void;
  weightUnit: 'kg' | 'lbs'; onWeightUnit: (v: 'kg' | 'lbs') => void;
  sexAgeAnswered: boolean; onEditSexAge: () => void;
}) {
  // weightKg/targetWeightKg (the parent's canonical state, used everywhere
  // downstream — BMI, nutrition targets, program matching) always stay in
  // kg regardless of what unit is displayed here. These two hold the RAW
  // text the user is actually typing, in whichever unit is currently
  // selected — kept separate from a value reactively re-derived from the
  // canonical kg on every render, which would fight the user mid-keystroke
  // (e.g. typing "180" redrawing itself as "180.0" after the "8",
  // corrupting whatever they type next) every time the round-trip
  // kg->lbs->kg conversion didn't land on an exact decimal.
  const [weightText, setWeightText] = useState(() => weightKg ? (weightUnit === 'lbs' ? kgToLbs(parseFloat(weightKg)).toFixed(1) : weightKg) : '');
  const [targetWeightText, setTargetWeightText] = useState(() => targetWeightKg ? (weightUnit === 'lbs' ? kgToLbs(parseFloat(targetWeightKg)).toFixed(1) : targetWeightKg) : '');

  function handleWeightChange(raw: string) {
    setWeightText(raw);
    const num = parseFloat(raw);
    onWeight(raw === '' ? '' : isNaN(num) ? '' : String(weightUnit === 'lbs' ? lbsToKg(num) : num));
  }
  function handleTargetWeightChange(raw: string) {
    setTargetWeightText(raw);
    const num = parseFloat(raw);
    onTargetWeight(raw === '' ? '' : isNaN(num) ? '' : String(weightUnit === 'lbs' ? lbsToKg(num) : num));
  }
  // Re-express whatever's already been typed in the newly-selected unit —
  // the canonical kg values themselves don't change, only how they're
  // displayed/entered here.
  function handleUnitChange(unit: 'kg' | 'lbs') {
    if (unit === weightUnit) return;
    const convert = (kgStr: string, currentText: string) => {
      const kgNum = kgStr ? parseFloat(kgStr) : NaN;
      if (isNaN(kgNum)) return currentText;
      return unit === 'lbs' ? kgToLbs(kgNum).toFixed(1) : kgNum.toFixed(1);
    };
    setWeightText(convert(weightKg, weightText));
    setTargetWeightText(convert(targetWeightKg, targetWeightText));
    onWeightUnit(unit);
  }

  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">About you</h1>
      <p className="text-text-secondary text-sm mb-5">
        Used to calculate your calorie needs accurately and calibrate your program — not shared with anyone.
      </p>

      {sexAgeAnswered ? (
        // Already answered on the landing page seconds ago — re-asking the
        // exact same question here read as the app not listening. Shown as
        // a confirmation instead, with an escape hatch in case the landing
        // page tap was a mistake.
        <div className="flex items-center justify-between mb-5 p-3 bg-surface rounded-xl border border-white/8">
          <p className="text-sm text-white">
            <span className="font-bold">{sex === 'male' ? 'Male' : 'Female'}</span>, age <span className="font-bold">{age}</span>
          </p>
          <button onClick={onEditSexAge} className="text-xs text-accent font-medium hover:underline">Not you?</button>
        </div>
      ) : (
        <>
          <p className="text-xs font-medium text-text-secondary mb-2">Sex</p>
          <div className="grid grid-cols-2 gap-2 mb-5">
            {SEX_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button key={value} onClick={() => onSex(value)} className="w-full">
                <Card className={`p-3 text-center transition-colors ${sex === value ? 'border-accent bg-accent/5' : ''}`}>
                  <Icon className="w-4 h-4 mx-auto mb-1 text-text-secondary" />
                  <p className="text-xs font-medium text-white">{label}</p>
                </Card>
              </button>
            ))}
          </div>
        </>
      )}

      <div className={`grid ${sexAgeAnswered ? 'grid-cols-2' : 'grid-cols-3'} gap-3 mb-5`}>
        {!sexAgeAnswered && (
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
        )}
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
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-text-secondary">Weight</label>
            {/* Defaults to kg, but plenty of users (US especially) think in
                lbs and were previously stuck converting in their head —
                this toggle applies to both weight fields at once and
                converts whatever's already typed, not just future input. */}
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              {(['kg', 'lbs'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => handleUnitChange(u)}
                  className={`px-2 py-0.5 text-[10px] font-bold uppercase transition-colors ${weightUnit === u ? 'bg-accent text-black' : 'text-text-tertiary hover:text-white'}`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <input
            type="number"
            inputMode="decimal"
            value={weightText}
            onChange={(e) => handleWeightChange(e.target.value)}
            placeholder={weightUnit === 'lbs' ? '176' : '80'}
            className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
          />
        </div>
      </div>

      {/* Goal weight — mandatory alongside current weight. Without it there's
          no timeline to estimate ("reach your goal in X months") and no way
          to match program duration to how long that goal actually takes. */}
      <div>
        <label className="text-xs font-medium text-text-secondary mb-1.5 block">Goal weight ({weightUnit})</label>
        <input
          type="number"
          inputMode="decimal"
          value={targetWeightText}
          onChange={(e) => handleTargetWeightChange(e.target.value)}
          placeholder={weightUnit === 'lbs' ? 'e.g. 165' : 'e.g. 75'}
          className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
        />
        <p className="text-[11px] text-text-tertiary mt-1.5">
          We&apos;ll use this to estimate your timeline and pick a program matched to it — not just your current weight.
        </p>
      </div>
    </div>
  );
}

function StepAccount({
  name, onName, email, onEmail, password, onPassword, confirmPassword, onConfirmPassword,
}: {
  name: string; onName: (v: string) => void;
  email: string; onEmail: (v: string) => void;
  password: string; onPassword: (v: string) => void;
  confirmPassword: string; onConfirmPassword: (v: string) => void;
}) {
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">Almost there</h1>
      <p className="text-text-secondary text-sm mb-5">
        Create your account to save this plan and get your dashboard.
      </p>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => onName(e.target.value)}
            placeholder="Your name"
            className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => onEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => onPassword(e.target.value)}
              placeholder="6+ characters"
              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Confirm</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => onConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              className={`w-full bg-surface border rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-text-tertiary focus:outline-none ${passwordsMismatch ? 'border-danger/60' : 'border-white/10 focus:border-accent/50'}`}
            />
          </div>
        </div>
        {passwordsMismatch && <p className="text-xs text-danger">Passwords don&apos;t match.</p>}
      </div>
      <p className="text-xs text-text-tertiary mt-4 text-center">
        By continuing you agree to our{' '}
        <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-accent underline">Terms</a>
        {' '}and{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-accent underline">Privacy Policy</a>.
      </p>
    </div>
  );
}

function StepBmiResult({ heightCm, weightKg, weightUnit }: { heightCm: number; weightKg: number; weightUnit: 'kg' | 'lbs' }) {
  const { bmi, category, healthyWeightRangeKg } = calculateBmi(heightCm, weightKg);

  const categoryColor = {
    Underweight: 'text-blue-400',
    Healthy: 'text-success',
    Overweight: 'text-amber-400',
    Obese: 'text-red-400',
  }[category];

  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">Your BMI</h1>
      <p className="text-text-secondary text-sm mb-5">
        A starting reference point — your program will track real progress from here.
      </p>

      <Card className="p-6 text-center border-accent/20">
        <p className="text-5xl font-black text-white">{bmi}</p>
        <p className={`text-sm font-bold mt-1 ${categoryColor}`}>{category}</p>
        <p className="text-xs text-text-tertiary mt-2">
          Healthy range for your height: {weightUnit === 'lbs' ? kgToLbs(healthyWeightRangeKg[0]) : healthyWeightRangeKg[0]}–{weightUnit === 'lbs' ? kgToLbs(healthyWeightRangeKg[1]) : healthyWeightRangeKg[1]} {weightUnit}
        </p>
      </Card>

      {/* Used to also show its own "X months to a healthy BMI range"
          estimate here — but the goal-weight question a few steps later
          produces a second, different timeline (to the weight the user
          actually asked for, not a generic BMI band), and showing two
          different "months to X" numbers back-to-back read as the app
          contradicting itself. The real, personalized one now only ever
          appears once, on the final reveal screen. */}
      {category === 'Healthy' ? (
        <div className="mt-4 p-4 bg-success/10 border border-success/20 rounded-2xl flex items-start gap-3">
          <PartyPopper className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
          <p className="text-sm text-text-secondary">
            You&apos;re already in a healthy BMI range! Your program will focus on building strength and performance from here.
          </p>
        </div>
      ) : (
        <div className="mt-4 p-4 bg-accent/5 border border-accent/20 rounded-2xl flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <p className="text-sm text-text-secondary">
            Your goal weight (next up) will drive your program and your personalized timeline — this is just a reference point, not a target.
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
