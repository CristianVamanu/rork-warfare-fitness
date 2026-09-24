'use client';
export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Flame, Dumbbell, RefreshCw, Zap, Shield,
  ChevronRight, ChevronLeft, Loader2, CheckCircle,
  Home, Building2, Package, User, TrendingDown, TrendingUp, PartyPopper,
} from 'lucide-react';
import { getIdToken, type User as FirebaseUser } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { signUp } from '@/lib/auth';
import { startPlanCheckout, startCoachingCheckout } from '@/lib/checkout';
import { saveOnboardingData, enrollInProgram, updateUserGoals, updateUserDoc, resolveProgram, createOnboardingLead } from '@/lib/firestore';
import { trackEvent } from '@/lib/analytics';
import { estimateNutritionTargets, calculateBmi, estimateWeightGoalTimeline, type NutritionTargets, type WeightGoalTimeline } from '@/lib/tdee';
import { lbsToKg, kgToLbs, cmToFtIn, ftInToCm } from '@/lib/utils';
import { MOCK_PROGRAMS, pickBestProgram } from '@/lib/programs';
import { buildProgramMarketing, type ProgramMarketing } from '@/lib/programMarketing';
import type { MatchedProgram } from '@/lib/programMatch';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Medallion } from '@/components/dashboard/Medallion';
import { BrandSplash } from '@/components/ui/BrandSplash';
import type { FitnessGoal, ExperienceLevel, EquipmentType, OnboardingData, BiologicalSex, MedicalHistoryAnswers } from '@/types';
import {
  TRAINING_FOR, OCCUPATIONS, EXPERIENCE_CHOICES, EQUIPMENT_CHOICES, BLOCKERS, PRIORITIES,
  isTrainingFor, isOccupation, isBlocker, isPriority, intelBreakFor, intakePercent,
  type TrainingFor, type Occupation, type Blocker, type Priority, type OfferWords,
} from '@/lib/onboardingIntake';
import { RevealOffer } from './RevealOffer';

// ─── Step data ────────────────────────────────────────────────────────────────

const GOALS: { value: FitnessGoal; label: string; sub: string; icon: React.ElementType }[] = [
  // First, because it is what the name on the door promises. Routes to the
  // endurance programs (SAS, Commando, Legion), which no other goal reaches.
  { value: 'military-prep', label: 'Selection Prep',  sub: 'Pass the PT test — run, ruck, calisthenics', icon: Shield },
  { value: 'lose-fat',      label: 'Lose Fat',       sub: 'Burn fat, maintain muscle',       icon: Flame },
  { value: 'build-muscle',  label: 'Build Muscle',   sub: 'Maximize hypertrophy',            icon: Dumbbell },
  { value: 'recomposition', label: 'Recomposition',  sub: 'Build muscle & lose fat',         icon: RefreshCw },
  { value: 'strength',      label: 'Get Stronger',   sub: 'Maximal strength & power',        icon: Zap },
];

// Same three values the matcher has always scored on; the words are the
// situations people recognise themselves in (see lib/onboardingIntake).
const EXPERIENCE: { value: ExperienceLevel; label: string; sub: string }[] = EXPERIENCE_CHOICES;

const EQUIPMENT_ICON: Record<EquipmentType, React.ElementType> = { 'full-gym': Building2, home: Home, minimal: Package };
const EQUIPMENT: { value: EquipmentType; label: string; sub: string; icon: React.ElementType }[] =
  EQUIPMENT_CHOICES.map((c) => ({ ...c, icon: EQUIPMENT_ICON[c.value] }));

/**
 * The intake, in order. Step numbers are positions in this list, never
 * literals, so adding or moving a screen cannot silently point a step at
 * the wrong component. The matcher's inputs (goal, experience, days,
 * equipment, biometrics) are unchanged; the added screens are saved to the
 * profile and used for the reveal copy only.
 */
type StepId = 'for' | 'goal' | 'occupation' | 'experience' | 'days' | 'equipment' | 'break' | 'blocker' | 'priority' | 'biometrics' | 'analysing' | 'email';
const STEPS_ANON: StepId[] = ['for', 'goal', 'occupation', 'experience', 'days', 'equipment', 'break', 'blocker', 'priority', 'biometrics', 'analysing', 'email'];
// Already signed in (resuming an unfinished quiz): no email step, and the
// program is generated from the last screen exactly as before.
const STEPS_AUTHED: StepId[] = ['for', 'goal', 'occupation', 'experience', 'days', 'equipment', 'break', 'blocker', 'priority', 'biometrics'];

// 2 (and 1) deliberately excluded — zero programs in the catalog are built
// for that few days/week, so offering it just set an expectation the
// matcher could never actually meet exactly. 3 stays: real programs exist
// for it (Beginner Full Body, Alpha Bulk).
const DAYS = [3, 4, 5, 6];

// ─── Component ────────────────────────────────────────────────────────────────


export default function OnboardingPage() {
  return (
    <Suspense fallback={<BrandSplash />}>
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
  heightUnit: 'cm' | 'ftin';
  medicalHistory: MedicalHistoryAnswers;
  name: string;
  email: string;
  trainingFor: TrainingFor | null;
  occupation: Occupation | null;
  blocker: Blocker | null;
  priority: Priority | null;
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

  // Clamped, never trusted raw. A draft is a localStorage value written by an
  // OLDER build of this page, and the step count here has shrunk twice now
  // (11 -> 9 when health screening and lifestyle habits moved to the coaching
  // application, 9 -> 8 when "Any limitations?" was removed). A visitor who
  // was part-way through when either shipped comes back holding a step index
  // that no longer has a matching render block — a blank card under a
  // "Step 9 of 8" counter, with Continue doing nothing. Clamping on restore
  // drops them on the last real step instead. MAX_STEP_INDEX is the highest
  // index any configuration can reach (the email step); the effect below
  // tightens it once needsAccount resolves and the true TOTAL_STEPS is known.
  const MAX_STEP_INDEX = STEPS_ANON.length - 1;
  const [step, setStep] = useState(() =>
    Math.max(0, Math.min(MAX_STEP_INDEX, draft.step ?? 0))
  );
  const [goal, setGoal] = useState<FitnessGoal | null>(draft.goal ?? null);
  const [experience, setExperience] = useState<ExperienceLevel | null>(draft.experience ?? null);
  const [trainingDays, setTrainingDays] = useState<number | null>(draft.trainingDays ?? null);
  const [equipment, setEquipment] = useState<EquipmentType | null>(draft.equipment ?? null);
  // Read-only now that the "Any limitations?" step is gone — nothing in this
  // flow sets it any more. Kept (rather than deleted) so a draft saved before
  // that step was removed still carries its answer through to the profile
  // instead of silently dropping it on resume.
  const [limitations] = useState(draft.limitations ?? '');
  const [sex, setSex] = useState<BiologicalSex | null>(draft.sex ?? null);
  const [age, setAge] = useState(draft.age ?? '');
  const [heightCm, setHeightCm] = useState(draft.heightCm ?? '');
  const [weightKg, setWeightKg] = useState(draft.weightKg ?? '');
  const [targetWeightKg, setTargetWeightKg] = useState(draft.targetWeightKg ?? '');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>(draft.weightUnit ?? 'kg');
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ftin'>(draft.heightUnit ?? 'cm');
  const [medicalHistory, setMedicalHistory] = useState<MedicalHistoryAnswers>(draft.medicalHistory ?? {});
  const [name, setName] = useState(draft.name ?? '');
  const [email, setEmail] = useState(draft.email ?? '');
  const [password, setPassword] = useState('');
  const [trainingFor, setTrainingFor] = useState<TrainingFor | null>(isTrainingFor(draft.trainingFor) ? draft.trainingFor : null);
  const [occupation, setOccupation] = useState<Occupation | null>(isOccupation(draft.occupation) ? draft.occupation : null);
  const [blocker, setBlocker] = useState<Blocker | null>(isBlocker(draft.blocker) ? draft.blocker : null);
  const [priority, setPriority] = useState<Priority | null>(isPriority(draft.priority) ? draft.priority : null);
  // 'quiz' is the steps; 'reveal' is the match-and-offer page shown after
  // the email step and before any account exists. A reload lands back on
  // the email step with every answer intact.
  const [phase, setPhase] = useState<'quiz' | 'reveal'>('quiz');
  // What the reveal's button asked for. Read after the account is created
  // so the person goes straight to the checkout they pressed, not the
  // dashboard.
  const pendingCheckoutRef = useRef<{ planId: string; months: 1 | 3 | 6 | 12 } | null>(null);
  // One account creation at a time: a second press while signUp is in
  // flight would call signUp again and fail with email-already-in-use for
  // the account the first press is still creating.
  const finishingRef = useRef(false);
  // OnboardingComplete fires once per person, whichever exit they take.
  const completeTrackedRef = useRef(false);
  // The email step writes a lead; backing out and pressing again must not
  // write a second row for the same address.
  const leadSentForRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'generating' | 'saving' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [revealProgram, setRevealProgram] = useState<{ name: string; description: string; weeks: number; daysPerWeek: number; marketing?: ProgramMarketing } | null>(null);
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

  // Persists every answer as it changes — cheap (localStorage writes are
  // synchronous and tiny) and means a tab close/crash/lost connection at
  // any point loses at most the current keystroke, not the whole quiz.
  // Never includes password/confirmPassword (see loadOnboardingDraft above).
  useEffect(() => {
    try {
      const draftToSave: OnboardingDraft = {
        step, goal, experience, trainingDays, equipment, limitations,
        sex, age, heightCm, weightKg, targetWeightKg, weightUnit, heightUnit, medicalHistory,
        name, email, trainingFor, occupation, blocker, priority,
      };
      localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draftToSave));
    } catch { /* ignore — e.g. private browsing storage quota */ }
  }, [step, goal, experience, trainingDays, equipment, limitations, sex, age, heightCm, weightKg, targetWeightKg, weightUnit, heightUnit, medicalHistory, name, email, trainingFor, occupation, blocker, priority]);

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
  // From a shared program link (?ref=CODE) — see ShareProgramButton and
  // /api/referral/join. Read once here alongside the other preselected
  // params for the same reason preselectedProgramId is: captured from the
  // URL at mount, not re-read live, so it survives however many steps and
  // re-renders happen between landing here and finishing the quiz.
  const referralCode = searchParams.get('ref');
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
  // Health screening and lifestyle habits used to sit at steps 7 and 8 —
  // fifteen mandatory Yes/No medical questions between signup and the app,
  // and by far the heaviest part of this flow. They've moved to the 1:1
  // coaching application, where a human trainer actually reads them.
  //
  // The free-text "Any limitations?" screen that followed them is gone too:
  // it was optional, so the overwhelming majority of users tapped straight
  // past it, and an empty screen between the BMI result and the preferences
  // step is pure drop-off. The `limitations` value itself is still part of
  // the profile and still saved when present (a draft started before this
  // change can carry one) — it just isn't asked for here any more.
  //
  // The BMI result had a whole step to itself and asked nothing. Worse, it
  // was the screen immediately before the account ask, and for a good share
  // of the people this product is for — the forty-somethings the landing
  // page now speaks to — it opened with a red "Obese" label before they had
  // been shown a single thing they were getting. The step even carried its
  // own disclaimer explaining that BMI cannot tell muscle from fat, which is
  // a screen admitting it is not worth a screen. The number is now one quiet
  // line on the biometrics step, where it costs no extra tap.
  const STEPS = needsAccount === false ? STEPS_AUTHED : STEPS_ANON;
  const TOTAL_STEPS = STEPS.length;
  const stepId: StepId = STEPS[Math.min(step, TOTAL_STEPS - 1)];
  const EMAIL_STEP = STEPS_ANON.indexOf('email');

  // Second half of the draft clamp above. An already-signed-in visitor has
  // fewer steps (no analysing or email step), so a restored draft sitting on
  // one of those is out of range for them — but needsAccount is null on
  // first render and only resolves after Firebase reports auth state, so the
  // initializer can't know that yet. Runs once needsAccount is known.
  useEffect(() => {
    if (needsAccount === null) return;
    setStep((s) => Math.min(s, TOTAL_STEPS - 1));
  }, [needsAccount, TOTAL_STEPS]);

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
  const emailValid = name.trim().length >= 2 && /^\S+@\S+\.\S+$/.test(email);
  const accountValidWith = (pw: string) => emailValid && pw.length >= 8;

  const canAdvanceById: Record<StepId, boolean> = {
    for: !!trainingFor,
    goal: !!goal && sexAgeAnswered,
    occupation: !!occupation,
    experience: !!experience,
    days: !!trainingDays,
    equipment: !!equipment,
    break: true,
    blocker: !!blocker,
    priority: !!priority,
    biometrics: biometricsValid,
    analysing: true,
    email: emailValid,
  };
  const canAdvance = canAdvanceById[stepId];

  // One event per step reached. Until this existed the funnel had exactly
  // one signal between landing and dashboard (sign_up), so "where does
  // onboarding lose people" was unanswerable.
  useEffect(() => {
    trackEvent('OnboardingStep', { step: step + 1, of: TOTAL_STEPS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /**
   * The matched program, fetched BEFORE the account exists.
   *
   * This flow used to ask for a name, an email and a password and only then
   * say which program the answers had earned. That is the hardest ask in the
   * funnel placed before anything has been given back — the visitor is
   * paying a price for something they have not been shown.
   *
   * So the match is now fetched the moment the questions are done and shown
   * on the account step itself. Same number of screens, same fields; the
   * difference is that the ask is now "save this" rather than "sign up to
   * find out".
   *
   * /api/public/match-program shares its matcher with the authenticated
   * assignment route, and handleFinish enrolls THIS id rather than matching
   * a second time, so the program named here is the program that lands.
   */
  const [previewProgram, setPreviewProgram] = useState<MatchedProgram | null>(null);
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  // The match plus its runners-up, best first. previewProgram is whichever
  // of these the visitor currently has selected — the top one unless they
  // tapped an alternative — and it is what gets enrolled.
  const [previewOptions, setPreviewOptions] = useState<MatchedProgram[]>([]);
  // Guards against the fetch firing again on every keystroke in the account
  // form, and against a second run when someone steps back and forward.
  const previewKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // From the analysing screen onward, and only when there is something to
    // match — so the reveal already has its answer when it opens.
    if (!needsAccount) return;
    if (stepId !== 'analysing' && stepId !== 'email' && phase !== 'reveal') return;
    if (!goal || !experience || !trainingDays || !equipment) return;
    // Someone who picked a specific program on the landing page already
    // knows what they are getting; re-announcing a different match would be
    // the opposite of reassuring.
    if (preselectedProgramId) return;

    const timeline = biometricsValid ? estimateWeightGoalTimeline(weightNum, targetWeightNum) : null;
    const payload = {
      goal, experience, trainingDays,
      sex: sex ?? undefined,
      equipment: equipment ?? undefined,
      estimatedWeeksToGoal: timeline?.weeksToGoal ?? undefined,
      age: Number.isFinite(ageNum) ? ageNum : undefined,
    };
    const key = JSON.stringify(payload);
    if (previewKeyRef.current === key) return;
    previewKeyRef.current = key;

    let alive = true;
    setPreviewState('loading');
    // New answers, new match. Clear the old one now rather than on success:
    // if this request fails, or the visitor finishes before it returns, the
    // enrolment path below must not fall back to a program matched for
    // answers they have since changed.
    setPreviewProgram(null);
    setPreviewOptions([]);
    fetch('/api/public/match-program', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { program?: MatchedProgram }) => {
        if (!alive) return;
        if (d.program) {
          // alternatives is split off here so it never travels with the
          // selected program into enrolment.
          const { alternatives = [], ...top } = d.program;
          setPreviewProgram(top);
          setPreviewOptions([top, ...alternatives]);
          setPreviewState('ready');
        }
        else { setPreviewState('failed'); setPreviewProgram(null); setPreviewOptions([]); }
      })
      .catch(() => {
        // Never fatal. The account form stands on its own; it just loses the
        // headline above it, which is exactly how this screen worked before.
        if (alive) { setPreviewState('failed'); setPreviewProgram(null); setPreviewOptions([]); previewKeyRef.current = null; }
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId, phase, needsAccount, goal, experience, trainingDays, equipment, sex, biometricsValid, weightNum, targetWeightNum]);

  // The analysing screen holds for a few seconds while the match request
  // above runs, then moves on by itself. It shows what is being done with
  // the answers; it does not pretend to compute anything it is not.
  useEffect(() => {
    if (stepId !== 'analysing') return;
    const t = setTimeout(() => setStep((s) => (STEPS[s] === 'analysing' ? Math.min(TOTAL_STEPS - 1, s + 1) : s)), 4200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  function go(delta: number) {
    setStep((s) => {
      let next = Math.max(0, Math.min(TOTAL_STEPS - 1, s + delta));
      // The analysing screen moves itself forward; stepping back onto it
      // would bounce the person straight to where they came from.
      if (delta < 0 && STEPS[next] === 'analysing') next = Math.max(0, next - 1);
      return next;
    });
  }

  // Auto-advance for the single-choice steps (goal, experience, days,
  // equipment): picking an option IS the answer, so making the user then
  // reach for a Continue button is a redundant second tap on every one of
  // them. Deliberately NOT applied to the multi-field steps (biometrics,
  // preferences, account) — those aren't finished just
  // because one field changed, and auto-advancing out of them would be
  // actively wrong.
  //
  // The short delay lets the selected state paint before the slide
  // transition starts, so the user sees WHAT they picked rather than the
  // screen leaving instantly; the guard makes a fast double-tap or a
  // change-of-mind before it fires a no-op rather than skipping two steps.
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current); }, []);

  function selectAndAdvance(fromStep: number, apply: () => void) {
    apply();
    if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    autoAdvanceRef.current = setTimeout(() => {
      autoAdvanceRef.current = null;
      setStep((s) => (s === fromStep ? Math.min(TOTAL_STEPS - 1, s + 1) : s));
    }, 260);
  }

  /**
   * The offline path, when /api/ai/recommend-program cannot be reached.
   *
   * Calls pickBestProgram — the SAME function the API route calls — rather
   * than a local re-implementation of it. There used to be a copy here that
   * claimed to mirror it and had silently fallen behind: it scored on goal,
   * level, days and duration only, with no sex and no equipment handling.
   * pickBestProgram hard-excludes a program whose targetGender
   * contradicts the member's, because without that filter every man who
   * picked Build Muscle as a beginner training 4-5 days was handed Valkyrie,
   * the women's program, in 8 of 96 onboarding combinations.
   *
   * So the copy put people in the wrong program precisely when something else
   * had already gone wrong — and on the entry tier a wrong program is not a
   * tap to fix, it is a paywall. One matcher, no drift.
   */
  function fallbackRecommendProgram(estimatedWeeksToGoal?: number): typeof MOCK_PROGRAMS[0] {
    // Returns null only for an empty pool, which MOCK_PROGRAMS never is —
    // the coalesce is for the type, not for a case that can happen.
    return pickBestProgram(
      MOCK_PROGRAMS,
      goal!,
      experience!,
      trainingDays ?? 3,
      sex ?? undefined,
      equipment ?? undefined,
      estimatedWeeksToGoal,
      Number.isFinite(ageNum) ? ageNum : undefined,
    ) ?? MOCK_PROGRAMS[0];
  }

  async function handleFinish(pwOverride?: string) {
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      await handleFinishInner(pwOverride);
    } finally {
      finishingRef.current = false;
    }
  }

  async function handleFinishInner(pwOverride?: string) {
    const pw = pwOverride ?? password;
    // These early-return guards used to fail completely silently — no error
    // shown, button just did nothing. If a user hit this state (e.g. left
    // Confirm password empty, which alone makes accountValid false with no
    // visible field error since the mismatch warning only fires once both
    // fields have something typed), it looked exactly like a broken button.
    if (!goal || !experience || !trainingDays || !equipment) {
      setError('Something went missing earlier in the quiz — please go back and check every step.');
      return;
    }
    if (needsAccount && !accountValidWith(pw)) {
      setError(
        !name.trim() || name.trim().length < 2 ? 'Enter your name (at least 2 characters).' :
        !/^\S+@\S+\.\S+$/.test(email) ? 'Enter a valid email address.' :
        'Password must be at least 8 characters.'
      );
      return;
    }
    setError(null);
    setErrorCode(null);
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
        activeUser = await signUp(email.trim(), pw, name.trim(), weightUnit);
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
        let program: { id: string; name: string; description: string; weeks: number; daysPerWeek: number; marketing?: ProgramMarketing } | null = null;

        // If this visitor picked a specific program on the landing page's
        // catalog, honor that choice as-is instead of letting the AI matcher
        // below silently override it with a different program.
        if (preselectedProgramId) {
          try {
            const resolved = await resolveProgram(preselectedProgramId);
            if (resolved) {
              program = { id: resolved.id, name: resolved.name, description: resolved.description, weeks: resolved.weeks, daysPerWeek: resolved.daysPerWeek, marketing: buildProgramMarketing(resolved) };
            }
          } catch {
            // fall through to AI matching / local fallback below
          }
        }

        // The program already shown on the account step, enrolled as-is.
        // Matching a second time here would risk naming one program on the
        // signup screen and handing over another — the answers are the same,
        // but a program published or unpublished in between is all it would
        // take. What they were shown is what they get.
        if (!program && previewProgram) {
          program = previewProgram;
        }

        if (!program) {
          try {
            const res = await fetch('/api/ai/recommend-program', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
              body: JSON.stringify({
                goal, experience, trainingDays,
                sex: sex ?? undefined,
                equipment: equipment ?? undefined,
                estimatedWeeksToGoal: timeline?.weeksToGoal ?? undefined,
                age: Number.isFinite(ageNum) ? ageNum : undefined,
              }),
            });
            if (!res.ok) throw new Error('Program assignment unavailable');
            const { program: matched } = await res.json();
            const { alternatives: _alts, ...top } = matched as MatchedProgram;
            void _alts;
            program = top;
          } catch {
            const seed = fallbackRecommendProgram(timeline?.weeksToGoal ?? undefined);
            program = { id: seed.id, name: seed.name, description: seed.description, weeks: seed.weeks, daysPerWeek: seed.daysPerWeek, marketing: buildProgramMarketing(seed) };
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
            'military-prep': 'Selection Prep', 'lose-fat': 'Fat Loss', 'build-muscle': 'Muscle Gain', recomposition: 'Body Recomposition', strength: 'Strength',
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
        ...(trainingFor ? { trainingFor } : {}),
        ...(occupation ? { occupation } : {}),
        ...(blocker ? { blocker } : {}),
        ...(priority ? { priority } : {}),
        ...(biometricsValid ? { sex: sex!, age: ageNum, heightCm: heightNum, targetWeightKg: targetWeightNum } : {}),
        ...(Object.keys(cleanedMedicalHistory).length > 0 ? { medicalHistory: cleanedMedicalHistory } : {}),
      };
      // onboardingComplete has to actually land, or the account gets stuck
      // in a redirect loop back to /onboarding forever (see AppLayout) — if
      // the full write throws for any reason, fall back to writing just
      // that one boolean by itself (far less likely to hit the same issue,
      // whatever it was) so the account can still reach the app; the rest
      // of the quiz answers can be re-entered from Settings if truly lost,
      // being stuck unable to sign up at all cannot.
      const saveTask = (async (): Promise<boolean> => {
        try {
          await saveOnboardingData(activeUser.uid, { ...onboardingData, onboardingComplete: true });
          return true;
        } catch (err) {
          console.error('[Onboarding] Saving full onboarding data failed — writing onboardingComplete only:', err);
          try {
            await updateUserDoc(activeUser.uid, { onboardingComplete: true });
            return true;
          } catch (fallbackErr) {
            console.error('[Onboarding] onboardingComplete fallback write also failed:', fallbackErr);
            return false;
          }
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
      // Credits whoever shared this link, if this visitor arrived via one.
      // Independent of every other task here on purpose — a failed credit
      // must never hold up or fail the rest of account creation, so it is
      // wrapped down to `undefined` rather than left to throw into
      // Promise.all. See /api/referral/join for why this is safe to call
      // more than once (idempotent by the joining member's own uid) and why
      // it always resolves 200 even when nothing gets credited.
      const referralTask = !referralCode ? Promise.resolve() : fetch('/api/referral/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ code: referralCode, programId: preselectedProgramId ?? undefined }),
      }).catch(() => {});

      const [, , onboardingSaved] = await Promise.all([programTask, nutritionTask, saveTask, weightTask, referralTask]);

      // ONLY clear the draft once onboardingComplete actually landed. Both
      // the primary write and its fallback swallow their errors so one
      // failure can't abort signup — which meant this used to run
      // unconditionally, wiping every answer even when nothing persisted.
      // AppLayout then bounced the user straight back to /onboarding with a
      // blank quiz and an account that already exists, so retrying the
      // account step gave auth/email-already-in-use: a total dead end.
      // Keeping the draft lets them resume with their answers intact.
      if (onboardingSaved) clearOnboardingDraft();

      // Refresh profile so layout no longer redirects here, then show the
      // plan reveal — proceedToApp() (triggered by its "Let's Go" button)
      // handles the video-greeting check and final navigation.
      setStatus('done');
      await refreshProfile();
      // The reveal's button was an offer with a price. Honour it now that
      // the account exists: straight to that checkout, program already
      // enrolled. A failure here falls through to the completion screen
      // below with the error shown, never a dead end.
      // A plan or coaching card clicked on the landing page wins over the
      // reveal's default choice: that is the price the person was shown.
      const pending = pendingCheckoutRef.current;
      if (pending || preselectedCoachingPlanId) {
        if (!completeTrackedRef.current) {
          completeTrackedRef.current = true;
          trackEvent('OnboardingComplete', { steps: TOTAL_STEPS, checkout: true });
        }
        const err = preselectedCoachingPlanId
          ? await startCoachingCheckout(activeUser, preselectedCoachingPlanId)
          : await startPlanCheckout(activeUser, pending!.planId, pending!.months);
        if (!err) return;
        pendingCheckoutRef.current = null;
        setError(err);
      }
    } catch (err: unknown) {
      console.error('[Onboarding] failed:', err);
      const code = (err as { code?: string })?.code;
      const FRIENDLY: Record<string, string> = {
        'auth/email-already-in-use': 'That email already has an account.',
        'auth/weak-password': 'Password is too weak — use at least 8 characters.',
        'auth/invalid-email': 'That email address looks invalid.',
      };
      setErrorCode(code ?? null);
      setError(code && FRIENDLY[code] ? FRIENDLY[code] : (err instanceof Error ? err.message : 'Something went wrong. Please try again.'));
      // If account creation itself failed, jump back to the account step so
      // the error is visible right next to the field that needs fixing
      // rather than wherever the user happened to be scrolled to.
      if (code?.startsWith('auth/')) { setPhase('quiz'); setStep(EMAIL_STEP); }
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
    // Onboarding is complete here regardless of which exit follows — Stripe
    // checkout, the welcome video, or straight to the dashboard — so this is
    // the one place the event can fire exactly once for everyone.
    if (!completeTrackedRef.current) {
      completeTrackedRef.current = true;
      trackEvent('OnboardingComplete', { steps: TOTAL_STEPS });
    }
    // Honor whichever pricing card the visitor actually clicked on the
    // landing page — send them straight into that checkout instead of
    // dropping them on the dashboard having forgotten the price they saw.
    if (user && (preselectedPlanId || preselectedCoachingPlanId)) {
      const err = preselectedCoachingPlanId
        ? await startCoachingCheckout(user, preselectedCoachingPlanId)
        : await startPlanCheckout(user, preselectedPlanId!);
      if (!err) return; // navigated to Stripe
      // Reset the double-tap guard — without this, a failed checkout showed
      // the error but left proceedingRef stuck true, so every later tap on
      // "Let's Go" returned at the guard and the button did nothing.
      proceedingRef.current = false;
      setError(err);
      return;
    }
    // The welcome video used to play here. It now fires on entitlement
    // instead (components/ui/WelcomeVideo), because anyone arriving with a
    // plan selected returns from Stripe to /profile and never came back to
    // this screen — the one place it played was the one place paying members
    // skipped. Onboarding just hands over to the app now.
    router.replace('/dashboard');
  }

  const isGenerating = status === 'generating' || status === 'saving';

  // Deliberately gated on `status` ALONE, not `status && revealProgram`.
  // revealProgram is only set once enrollInProgram SUCCEEDS, and that call
  // failing is an expected, documented case (a members-only or priced
  // program legitimately refuses a brand-new non-paying account — see the
  // catch in programTask above). With the old `&& revealProgram` gate, that
  // expected failure fell through to the raw step form with status already
  // 'done' and the draft cleared — no "Let's Go" button, no way forward
  // short of hand-editing the URL, on an account that had already been
  // created. The program-specific blocks below are conditional instead, so
  // the completion screen (nutrition targets, "Let's Go") always renders.
  if (status === 'done') {
    const stats = revealProgram?.marketing?.stats ?? [];
    return (
      <div className="relative isolate min-h-screen bg-background overflow-hidden">
        {/* Same wash the app itself opens on, so the first screen after signup
            already looks like the product rather than a success dialog. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[560px] h-[560px] max-w-[140vw] rounded-full bg-accent/[0.10] blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage:
                'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
              backgroundSize: '56px 56px',
            }}
          />
        </div>

        <div className="mx-auto w-full max-w-md lg:max-w-4xl px-4 py-10 lg:py-14 wf-rise">
          {/* Header. Centered, because it is one short announcement — the
              body below is left-aligned, since centred paragraphs give the
              eye no consistent left edge to return to. */}
          <div className="text-center">
            <Medallion className="mx-auto mb-4 w-14 h-14">
              <PartyPopper className="w-7 h-7" />
            </Medallion>
            <p className="text-[11px] font-bold text-accent uppercase tracking-[0.18em]">
              {revealProgram ? 'Your personalized plan' : "You're all set"}
            </p>
            <h1 className="text-[26px] lg:text-4xl font-black text-white tracking-tight mt-2 text-balance">
              {revealProgram ? revealProgram.name : 'Welcome aboard'}
            </h1>
            {revealProgram?.marketing && (
              <p className="text-white/85 text-[15px] lg:text-base font-medium leading-snug mt-3 max-w-xl mx-auto text-balance">
                {revealProgram.marketing.hook}
              </p>
            )}
            {!revealProgram && (
              <p className="text-text-secondary text-sm leading-relaxed mt-3 max-w-md mx-auto">
                Your profile is ready. Pick the training program you want from the Training tab whenever you&apos;re ready to start.
              </p>
            )}
          </div>

          {/* Two columns from lg up. On a wide screen a single 384px ribbon
              of centred text was most of the problem; on a phone this is the
              same single column it always was. */}
          {/* Two columns of equal height. The timeline used to live inside
              the left one, which made it taller than the right and left the
              pair looking lopsided; it is full width underneath now. */}
          <div className="mt-7 grid gap-4 lg:grid-cols-2">

            {revealProgram && (
              <div className="flex">
                {revealProgram.marketing ? (
                  <Card glass className="p-5 w-full">
                    {/* Two across on a phone. Four across inside a 384px
                        column gave each stat about 80px, so the longer
                        values wrapped or ran off the edge entirely. */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2.5">
                      {stats.map((st) => (
                        <div key={st.label} className="rounded-xl bg-white/[0.04] border border-white/8 px-3 py-2.5">
                          <p className="text-[17px] font-black text-white leading-tight tabular-nums">{st.value}</p>
                          <p className="text-[10px] uppercase tracking-[0.12em] text-text-tertiary mt-1">{st.label}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-text-secondary text-sm leading-relaxed mt-4">
                      {revealProgram.marketing.whoFor.split('\n')[0]}
                    </p>
                    <details className="group mt-3">
                      <summary className="cursor-pointer list-none inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
                        Read the full brief
                        <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                      </summary>
                      <p className="text-text-secondary text-sm leading-relaxed whitespace-pre-line mt-3 max-h-56 overflow-y-auto pr-1">
                        {revealProgram.description}
                      </p>
                    </details>
                  </Card>
                ) : (
                  <Card glass className="p-5 w-full">
                    <p className="text-text-secondary text-sm leading-relaxed">{revealProgram.description.split('\n')[0]}</p>
                    <div className="grid grid-cols-2 gap-2.5 mt-4">
                      <div className="rounded-xl bg-white/[0.04] border border-white/8 px-3 py-2.5">
                        <p className="text-[17px] font-black text-white tabular-nums">{revealProgram.weeks}</p>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-text-tertiary mt-1">Weeks</p>
                      </div>
                      <div className="rounded-xl bg-white/[0.04] border border-white/8 px-3 py-2.5">
                        <p className="text-[17px] font-black text-white tabular-nums">{revealProgram.daysPerWeek}</p>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-text-tertiary mt-1">Days / week</p>
                      </div>
                    </div>
                  </Card>
                )}

              </div>
            )}

            {revealNutrition && (
              <Card glass className="p-5 w-full">
                <p className="text-[10px] font-bold text-accent uppercase tracking-[0.16em]">Your nutrition targets</p>
                <div className="flex items-baseline gap-2 mt-2">
                  <p className="text-[38px] font-black text-white leading-none tracking-tight tabular-nums">
                    {revealNutrition.calories.toLocaleString()}
                  </p>
                  <p className="text-sm text-text-secondary">cal / day</p>
                </div>
                <p className="text-xs text-text-tertiary mt-1.5">
                  {revealNutrition.calorieAdjustment === 0
                    ? `Maintenance (${revealNutrition.maintenanceCalories.toLocaleString()} cal)`
                    : `${revealNutrition.maintenanceCalories.toLocaleString()} cal maintenance ${revealNutrition.calorieAdjustment > 0 ? '+' : '−'} ${Math.abs(revealNutrition.calorieAdjustment)} for ${revealNutrition.goalLabel}`}
                </p>

                {/* A bar per macro rather than three number tiles: the split
                    between them is the thing worth seeing, and three equal
                    boxes hide it. */}
                <div className="mt-4 space-y-2.5">
                  {[
                    { label: 'Protein', value: revealNutrition.protein, cals: revealNutrition.protein * 4, bar: 'bg-red-400', text: 'text-red-400' },
                    { label: 'Carbs', value: revealNutrition.carbs, cals: revealNutrition.carbs * 4, bar: 'bg-blue-400', text: 'text-blue-400' },
                    { label: 'Fat', value: revealNutrition.fat, cals: revealNutrition.fat * 9, bar: 'bg-yellow-400', text: 'text-yellow-400' },
                  ].map((m) => {
                    const total = revealNutrition.protein * 4 + revealNutrition.carbs * 4 + revealNutrition.fat * 9;
                    const pct = total > 0 ? Math.round((m.cals / total) * 100) : 0;
                    return (
                      <div key={m.label}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs text-text-secondary">{m.label}</span>
                          <span className={`text-sm font-black tabular-nums ${m.text}`}>
                            {m.value}g <span className="text-[10px] font-bold text-text-tertiary">{pct}%</span>
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/[0.07] mt-1.5 overflow-hidden">
                          <div className={`h-full rounded-full ${m.bar}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {revealNutrition.rationale && (
                  <p className="text-xs text-text-secondary leading-relaxed mt-4">{revealNutrition.rationale}</p>
                )}
                {!revealNutrition.usedRealBiometrics && (
                  <p className="text-[10px] text-text-tertiary mt-2">
                    Estimated from your training frequency — add your height and weight in Profile for a more precise target.
                  </p>
                )}
              </Card>
            )}
          </div>

          {/* The core promise of the whole goal-weight question: a concrete,
              personalized timeline tied to the specific program just
              assigned, not a "results vary" hand-wave. Full width under both
              columns, so neither is stretched by it. */}
          {revealProgram && revealTimeline && revealTimeline.weeksToGoal > 0 && (
            <div className="mt-4 rounded-2xl border border-accent/25 bg-accent/[0.07] p-4 flex items-start gap-3">
              {revealTimeline.direction === 'lose'
                ? <TrendingDown className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                : <TrendingUp className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />}
              <p className="text-sm text-text-secondary leading-relaxed">
                You&apos;ll reach your goal weight in{' '}
                <span className="text-white font-bold">
                  ~{revealTimeline.monthsToGoal} month{revealTimeline.monthsToGoal !== 1 ? 's' : ''}
                </span>{' '}
                on this program, {revealTimeline.direction === 'lose' ? 'losing' : 'gaining'}{' '}
                ~{Math.abs(Math.round(weightUnit === 'lbs' ? kgToLbs(revealTimeline.weightChangeKg) : revealTimeline.weightChangeKg))}{weightUnit} at a safe, sustainable pace.
              </p>
            </div>
          )}

          <div className="mt-7 lg:max-w-sm lg:mx-auto">
            <Button fullWidth size="lg" onClick={proceedToApp}>
              Let&apos;s Go <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (authLoading || needsAccount === null) return <BrandSplash />;

  if (phase === 'reveal' && needsAccount) {
    return (
      <div className="relative isolate min-h-screen bg-background overflow-x-hidden">
        <div aria-hidden className="wf-field" />
        <div className="relative mx-auto w-full max-w-lg px-4 pt-4">
          <button
            onClick={() => { setPhase('quiz'); setError(null); }}
            disabled={isGenerating}
            className="p-2 -ml-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
            aria-label="Back to your answers"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
        <RevealOffer
          name={name}
          goal={goal} equipment={equipment} experience={experience} trainingDays={trainingDays}
          blocker={blocker} trainingFor={trainingFor}
          match={previewProgram} matchState={previewState} options={previewOptions} onPick={setPreviewProgram}
          timeline={biometricsValid ? estimateWeightGoalTimeline(weightNum, targetWeightNum) : null}
          weightUnit={weightUnit}
          busy={isGenerating}
          error={error}
          preferredPlanId={preselectedPlanId}
          onStart={(pw: string, plan: { id: string; months: 1 | 3 | 6 | 12 } | null, offer: OfferWords) => {
            setPassword(pw);
            pendingCheckoutRef.current = offer.checkout && plan ? { planId: plan.id, months: plan.months } : null;
            trackEvent('OnboardingStartPressed', { offer: offer.kind });
            void handleFinish(pw);
          }}
        />
      </div>
    );
  }

  const percent = intakePercent(step, TOTAL_STEPS);
  const isBreak = stepId === 'break';

  return (
    <div className="relative isolate min-h-screen bg-background flex flex-col overflow-hidden">
      {/* Same treatment as the login screen — full-bleed and dimmed rather
          than a masked patch, which showed its own edge on a black page.
          `isolate` on the parent plus -z-10 here puts this behind every
          sibling without needing to lift each one onto its own z-index; the
          new stacking context also keeps it above the parent's background
          rather than disappearing behind it. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '56px 56px',
          }}
        />
        <div className="absolute inset-0 bg-background/40" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_35%,transparent_0%,rgba(0,0,0,0.55)_100%)]" />
        <div className="absolute left-1/2 top-[30%] -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full bg-accent/[0.06] blur-3xl" />
      </div>
      {/* Header */}
      <div className="px-4 pt-4 pb-4 max-w-lg mx-auto w-full">
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
          <span className="wf-readout text-[10px] font-bold text-accent">{isBreak ? 'Intel break' : stepId === 'analysing' ? 'Building' : 'The intake'}</span>
          <span className="wf-readout text-[10px] font-bold text-text-tertiary tabular-nums w-9 text-right">{percent}%</span>
        </div>
        {/* One bar with a percentage: "how far into the intake", not "which
            of N screens". Never reaches 100 before the reveal. */}
        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-accent transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 max-w-lg mx-auto w-full overflow-hidden">
        {/* key={step} remounts on every step change, which is what replays
            the CSS animation. See .wf-step for why this is no longer
            framer-motion. */}
        <div key={step} className="wf-step space-y-4">
            {stepId === 'for' && (
              <StepChoice
                title="What are you training for?"
                sub="Tap one to start. This shapes how we talk to you, not which program you get — that comes from your answers next."
                choices={TRAINING_FOR}
                selected={trainingFor}
                onSelect={(v) => selectAndAdvance(step, () => setTrainingFor(v))}
              />
            )}
            {stepId === 'goal' && (
              <StepGoal
                // Only auto-advances once sex/age are actually answered —
                // this step carries those extra fields, so picking a goal
                // isn't necessarily finishing the step.
                selected={goal}
                onSelect={(v) => (sexAgeAnswered ? selectAndAdvance(step, () => setGoal(v)) : setGoal(v))}
                sex={sex} onSex={setSex} age={age} onAge={setAge}
                showSexPicker={!hadPrefilledSex} showAgeInput={!hadPrefilledAge}
              />
            )}
            {stepId === 'occupation' && (
              <StepChoice
                title="What's your current occupation?"
                sub="Your program does not change with this. Your reveal does."
                choices={OCCUPATIONS}
                selected={occupation}
                onSelect={(v) => selectAndAdvance(step, () => setOccupation(v))}
              />
            )}
            {stepId === 'experience' && (
              <StepExperience selected={experience} onSelect={(v) => selectAndAdvance(step, () => setExperience(v))} />
            )}
            {stepId === 'days' && (
              <StepDays selected={trainingDays} onSelect={(v) => selectAndAdvance(step, () => setTrainingDays(v))} />
            )}
            {stepId === 'equipment' && (
              <StepEquipment selected={equipment} onSelect={(v) => selectAndAdvance(step, () => setEquipment(v))} />
            )}
            {stepId === 'break' && <StepIntelBreak trainingFor={trainingFor} goal={goal} />}
            {stepId === 'blocker' && (
              <StepChoice
                title="What's actually stopped you before?"
                sub="Be honest. The program is built around the answer."
                choices={BLOCKERS}
                selected={blocker}
                onSelect={(v) => selectAndAdvance(step, () => setBlocker(v))}
              />
            )}
            {stepId === 'priority' && (
              <StepChoice
                title="If one thing had to be your priority, what would it be?"
                sub="Everything gets trained. One thing gets the emphasis."
                choices={PRIORITIES}
                selected={priority}
                onSelect={(v) => selectAndAdvance(step, () => setPriority(v))}
              />
            )}
            {stepId === 'analysing' && <StepAnalysing />}
            {stepId === 'biometrics' && (
              <StepBiometrics
                sex={sex} onSex={setSex}
                age={age} onAge={setAge}
                heightCm={heightCm} onHeight={setHeightCm}
                weightKg={weightKg} onWeight={setWeightKg}
                targetWeightKg={targetWeightKg} onTargetWeight={setTargetWeightKg}
                weightUnit={weightUnit} onWeightUnit={setWeightUnit}
                heightUnit={heightUnit} onHeightUnit={setHeightUnit}
                sexAgeAnswered={sexAgeAnswered} onEditSexAge={() => { setSex(null); setAge(''); }}
              />
            )}
            {stepId === 'email' && needsAccount && (
              <StepEmail name={name} onName={setName} email={email} onEmail={setEmail} matchState={previewState} />
            )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 max-w-lg mx-auto w-full mt-3">
          <div className="text-sm text-red-400 text-center bg-red-400/10 border border-red-400/20 rounded-xl p-3">
            <p>{error}</p>
            {/* The one error a visitor cannot fix on this page. Give them the
                two doors out right here, instead of a message that says
                "sign in" on a screen with no sign-in button. */}
            {errorCode === 'auth/email-already-in-use' && (
              <div className="flex items-center justify-center gap-4 mt-2.5">
                <Link href="/login" className="font-bold text-accent hover:underline">Sign in</Link>
                <span className="text-red-400/40">·</span>
                <Link href="/forgot-password" className="font-bold text-accent hover:underline">Reset password</Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="px-4 py-6 max-w-lg mx-auto w-full">
        {stepId === 'analysing' ? null : stepId === 'email' ? (
          <Button
            fullWidth
            size="lg"
            disabled={!canAdvance}
            onClick={() => {
              // Captured now, before the reveal and long before a password:
              // someone who stops at the price is still reachable. Never
              // blocks the flow.
              const key = email.trim().toLowerCase();
              if (leadSentForRef.current !== key) {
                leadSentForRef.current = key;
                createOnboardingLead(email, name).catch(() => { leadSentForRef.current = null; });
              }
              trackEvent('OnboardingRevealViewed');
              setError(null);
              setPhase('reveal');
            }}
          >
            See my program <ChevronRight className="w-4 h-4" />
          </Button>
        ) : step < TOTAL_STEPS - 1 ? (
          <Button
            fullWidth
            size="lg"
            disabled={!canAdvance}
            onClick={() => go(1)}
          >
            {isBreak ? 'Keep going' : 'Continue'} <ChevronRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            fullWidth
            size="lg"
            disabled={isGenerating || !canAdvance}
            onClick={() => handleFinish()}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {needsAccount ? 'Creating your account…' : 'Setting up your program…'}
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                {/* "Get My Plan" was a promise about something unseen. Once
                    the match is on the screen above, the button is claiming
                    a named thing, so it says so. */}
                Generate My Program
              </>
            )}
          </Button>
        )}
        <p className="text-[10px] text-text-tertiary leading-relaxed text-center mt-4">
          Programs are general fitness programs inspired by military training. Not affiliated with, endorsed by, or connected to any armed force or government.
        </p>
      </div>
    </div>
  );
}

// ─── Step components ───────────────────────────────────────────────────────────

/** One question, one tap. Used by every added single-choice screen. */
function StepChoice<T extends string>({ title, sub, choices, selected, onSelect }: {
  title: string; sub: string;
  choices: { value: T; label: string; sub: string }[];
  selected: T | null; onSelect: (v: T) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-1">{title}</h1>
      <p className="text-text-secondary text-sm mb-5">{sub}</p>
      <div className="space-y-3">
        {choices.map((c) => (
          <OptionTile key={c.value} label={c.label} sub={c.sub} selected={selected === c.value} onClick={() => onSelect(c.value)} />
        ))}
      </div>
    </div>
  );
}

/**
 * The break between questions: a published standard, not a testimonial.
 * Real numbers from the same table the standards test scores against.
 */
function StepIntelBreak({ trainingFor, goal }: { trainingFor: TrainingFor | null; goal: FitnessGoal | null }) {
  const b = intelBreakFor(trainingFor, goal);
  return (
    <div>
      <p className="wf-readout text-[10px] font-bold text-accent">{b.eyebrow}</p>
      <h1 className="text-2xl font-black text-white mt-2 text-balance">{b.title}</h1>
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-surface mt-5 p-4">
        <div aria-hidden className="wf-ember pointer-events-none absolute inset-0" />
        <div className="relative divide-y divide-white/8">
          {b.rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between py-3">
              <span className="text-sm text-text-secondary">{r.label}</span>
              <span className="text-2xl font-black text-white tabular-nums">{r.value}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-text-tertiary leading-relaxed mt-3">{b.note}</p>
      <div className="mt-6 space-y-2">
        {[
          ['Your answers set the start point', 'The program starts where you actually are, not at week one of someone else\'s plan.'],
          ['Phased blocks force adaptation', 'Each block builds on the last: strength, engine, durability, in the order the goal demands.'],
          ['The loads move with your logs', 'Every set is one tap. Next week\'s weight is decided from this week\'s, by the app, not by guesswork.'],
        ].map(([t, d], i) => (
          <div key={t} className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
            <span className="w-7 h-7 rounded-lg border border-accent/50 text-accent text-xs font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
            <div><p className="text-sm font-bold text-white leading-tight">{t}</p><p className="text-[12px] text-text-secondary leading-relaxed mt-0.5">{d}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A few seconds of honest status while the match request runs. */
function StepAnalysing() {
  const lines = ['Reading your answers…', 'Matching your goal and level…', 'Checking your equipment and days…', 'Setting nutrition targets…'];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(lines.length - 1, n + 1)), 1000);
    return () => clearInterval(t);
  }, [lines.length]);
  return (
    <div className="pt-10 text-center">
      <div className="h-1 rounded-full bg-white/10 overflow-hidden max-w-xs mx-auto">
        <div className="h-full bg-gradient-accent rounded-full transition-[width] duration-1000" style={{ width: `${((i + 1) / lines.length) * 100}%` }} />
      </div>
      <h1 className="text-2xl font-black text-white mt-6 text-balance">{lines[i]}</h1>
      <p className="text-sm text-text-secondary mt-3">Real programs, matched to what you told us. Nothing generated on the spot.</p>
    </div>
  );
}

/** Name and email. No password here: that is asked on the reveal, once the person has seen what it keeps. */
function StepEmail({ name, onName, email, onEmail, matchState }: {
  name: string; onName: (v: string) => void; email: string; onEmail: (v: string) => void;
  matchState: 'idle' | 'loading' | 'ready' | 'failed';
}) {
  return (
    <div>
      <p className="wf-readout text-[10px] font-bold text-accent flex items-center gap-1.5">
        {matchState === 'ready' ? <><CheckCircle className="w-3 h-3" /> Program matched</>
          : matchState === 'loading' ? <><Loader2 className="w-3 h-3 animate-spin" /> Matching</>
          : <><CheckCircle className="w-3 h-3" /> Almost there</>}
      </p>
      <h1 className="text-2xl font-black text-white mt-2">Your program is ready.</h1>
      <p className="text-text-secondary text-sm mb-5 mt-1">Where should we send it?</p>
      <div className="space-y-3">
        <input
          type="text" value={name} onChange={(e) => onName(e.target.value)} placeholder="Full name" autoComplete="name"
          className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3.5 text-white text-base placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
        />
        <input
          type="email" value={email} onChange={(e) => onEmail(e.target.value)} placeholder="Email" autoComplete="email" inputMode="email"
          className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3.5 text-white text-base placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
        />
      </div>
      <p className="text-xs text-text-tertiary mt-4 text-center leading-relaxed">Your program and your login when you start. No spam, no games.</p>
    </div>
  );
}

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
      {/* Five options. The first is the one the product is named for, so it
          takes the full width as a featured row and the other four sit in
          an even 2x2 below — rather than a 2-column grid leaving one tile
          orphaned at the bottom. */}
      <div className="grid grid-cols-2 gap-3">
        {GOALS.map(({ value, label, sub, icon: Icon }, i) => (
          <div key={value} className={i === 0 ? 'col-span-2' : ''}>
            <OptionTile
              layout={i === 0 ? 'row' : 'grid'}
              icon={Icon}
              label={label}
              sub={sub}
              selected={selected === value}
              onClick={() => onSelect(value)}
            />
          </div>
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

const SEX_OPTIONS: { value: BiologicalSex; label: string; icon: React.ElementType }[] = [
  { value: 'male', label: 'Male', icon: User },
  { value: 'female', label: 'Female', icon: User },
];

// The drawn BMI scale. 15–40 covers the range real readings land in, and
// the healthy band matches calculateBmi's own thresholds exactly — a bar
// that disagreed with the number printed above it would be worse than no
// bar at all.
const SCALE_MIN = 15;
const SCALE_MAX = 40;
const HEALTHY_LOW = 18.5;
const HEALTHY_HIGH = 25;

function StepBiometrics({
  sex, onSex, age, onAge, heightCm, onHeight, weightKg, onWeight, targetWeightKg, onTargetWeight,
  weightUnit, onWeightUnit, heightUnit, onHeightUnit, sexAgeAnswered, onEditSexAge,
}: {
  sex: BiologicalSex | null; onSex: (v: BiologicalSex) => void;
  age: string; onAge: (v: string) => void;
  heightCm: string; onHeight: (v: string) => void;
  weightKg: string; onWeight: (v: string) => void;
  targetWeightKg: string; onTargetWeight: (v: string) => void;
  weightUnit: 'kg' | 'lbs'; onWeightUnit: (v: 'kg' | 'lbs') => void;
  heightUnit: 'cm' | 'ftin'; onHeightUnit: (v: 'cm' | 'ftin') => void;
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

  // Same canonical-vs-display split as weight: heightCm (the parent's state,
  // used for BMI/TDEE/program matching) always stays in cm; these hold the
  // raw ft/in the user is typing.
  const initialFtIn = heightCm ? cmToFtIn(parseFloat(heightCm)) : null;
  const [feetText, setFeetText] = useState(initialFtIn ? String(initialFtIn.ft) : '');
  const [inchesText, setInchesText] = useState(initialFtIn ? String(initialFtIn.inches) : '');

  // The reference line at the bottom of this step. Computed here rather than
  // passed in, because it is derived entirely from two fields this component
  // already owns. Null until both are in a plausible range — a half-typed
  // height would otherwise flash a nonsense BMI on every keystroke.
  const bmiHeight = parseFloat(heightCm);
  const bmiWeight = parseFloat(weightKg);
  const bmiTarget = parseFloat(targetWeightKg);
  const bmiReading = (bmiHeight >= 100 && bmiHeight <= 250 && bmiWeight >= 30 && bmiWeight <= 300)
    ? (() => {
        const { bmi, healthyWeightRangeKg } = calculateBmi(bmiHeight, bmiWeight);
        const show = (kg: number) => (weightUnit === 'lbs' ? kgToLbs(kg) : kg);
        // Where a BMI sits on the drawn scale, as a percentage. The scale
        // runs 15–40 because that is the range real readings fall in;
        // anchoring it at zero would squash every human being into the
        // middle third of the bar.
        const pos = (v: number) => Math.min(100, Math.max(0, ((v - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100));
        // The goal weight, on the same scale. This is the reason the panel
        // is worth its space: a bare number tells a heavier man something he
        // already knows, whereas two marks and the distance between them
        // show him where he is going. Only drawn once the goal is plausible.
        const goalBmi = (bmiTarget >= 30 && bmiTarget <= 300)
          ? Math.round((bmiTarget / ((bmiHeight / 100) ** 2)) * 10) / 10
          : null;
        return {
          bmi,
          low: show(healthyWeightRangeKg[0]),
          high: show(healthyWeightRangeKg[1]),
          pct: pos(bmi),
          goalBmi,
          goalPct: goalBmi === null ? null : pos(goalBmi),
          bandLeft: pos(HEALTHY_LOW),
          bandWidth: pos(HEALTHY_HIGH) - pos(HEALTHY_LOW),
        };
      })()
    : null;

  function pushFtIn(ftRaw: string, inRaw: string) {
    const ft = parseFloat(ftRaw);
    const inches = inRaw === '' ? 0 : parseFloat(inRaw);
    if (isNaN(ft) || isNaN(inches)) { onHeight(''); return; }
    onHeight(String(ftInToCm(ft, inches)));
  }
  function handleFeetChange(raw: string) { setFeetText(raw); pushFtIn(raw, inchesText); }
  function handleInchesChange(raw: string) { setInchesText(raw); pushFtIn(feetText, raw); }
  function handleHeightUnitChange(unit: 'cm' | 'ftin') {
    if (unit === heightUnit) return;
    if (unit === 'ftin') {
      const cm = parseFloat(heightCm);
      if (!isNaN(cm)) { const { ft, inches } = cmToFtIn(cm); setFeetText(String(ft)); setInchesText(String(inches)); }
    }
    onHeightUnit(unit);
  }

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
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-text-secondary">Height</label>
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              {([['cm', 'CM'], ['ftin', 'FT']] as const).map(([u, label]) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => handleHeightUnitChange(u)}
                  className={`px-2 py-0.5 text-[10px] font-bold uppercase transition-colors ${heightUnit === u ? 'bg-accent text-black' : 'text-text-tertiary hover:text-white'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {heightUnit === 'cm' ? (
            <input
              type="number"
              inputMode="decimal"
              value={heightCm}
              onChange={(e) => onHeight(e.target.value)}
              placeholder="178"
              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
            />
          ) : (
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <input
                  type="number"
                  inputMode="numeric"
                  value={feetText}
                  onChange={(e) => handleFeetChange(e.target.value)}
                  placeholder="5"
                  className="w-full bg-surface border border-white/10 rounded-xl pl-3 pr-6 py-2.5 text-white text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-tertiary pointer-events-none">ft</span>
              </div>
              <div className="relative flex-1">
                <input
                  type="number"
                  inputMode="numeric"
                  value={inchesText}
                  onChange={(e) => handleInchesChange(e.target.value)}
                  placeholder="10"
                  className="w-full bg-surface border border-white/10 rounded-xl pl-3 pr-6 py-2.5 text-white text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-tertiary pointer-events-none">in</span>
              </div>
            </div>
          )}
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

      {/* What is left of the BMI step. It used to be a screen of its own,
          opening with a large coloured category label — which for a lot of
          people meant being told they were "Obese" in red immediately before
          being asked to create an account, having been shown nothing in
          return yet. As a reference figure it is worth a line; the category
          judgement is not worth a screen, and BMI cannot tell muscle from
          fat anyway. Appears only once both numbers are actually valid. */}
      {bmiReading && (
        <div className="relative overflow-hidden rounded-2xl border border-accent/20 bg-surface/60 px-4 py-4 mt-7">
          {/* The same faint grid the landing page uses, so a readout inside
              the product looks like it came from the same instrument. Static
              background-image on an element that already exists — no extra
              node, no animation, no filter. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.5]"
            style={{
              backgroundImage:
                'radial-gradient(90% 70% at 100% 0%, rgb(var(--accent-rgb) / 0.10), transparent 62%),' +
                'linear-gradient(rgb(var(--accent-rgb) / 0.045) 1px, transparent 1px),' +
                'linear-gradient(90deg, rgb(var(--accent-rgb) / 0.045) 1px, transparent 1px)',
              backgroundSize: '100% 100%, 26px 26px, 26px 26px',
            }}
          />
          <div className="relative">
            <div className="flex items-baseline justify-between">
              <p className="wf-readout text-[10px] font-bold text-accent">Body mass index</p>
              <p className="text-[10px] text-text-tertiary tabular-nums">
                healthy {bmiReading.low}–{bmiReading.high} {weightUnit}
              </p>
            </div>

            <p className="text-3xl font-black text-white tabular-nums leading-none mt-2">
              {bmiReading.bmi}
            </p>

            {/* The scale. The healthy band is drawn as a lit section rather
                than stated as a verdict — no "Obese" label, which is what
                made the old full-screen version worth deleting. */}
            <div className="relative h-8 mt-3">
              {/* The unlit part of the track has to be clearly visible or
                  the healthy band reads as a bar that simply ends, not as a
                  section of a scale — which loses the only thing the scale
                  is for: seeing where you sit ALONG it. */}
              <div className="absolute inset-x-0 top-3 h-1.5 rounded-full bg-white/[0.14] overflow-hidden">
                <div
                  className="absolute inset-y-0 bg-success/55"
                  style={{ left: `${bmiReading.bandLeft}%`, width: `${bmiReading.bandWidth}%` }}
                />
              </div>

              {/* Goal weight, hollow — where they are heading. Drawn first so
                  the solid current marker wins if the two overlap. */}
              {bmiReading.goalPct !== null && (
                <span
                  aria-hidden
                  className="absolute top-[7px] w-3 h-3 -ml-1.5 rounded-full border-2 border-white/55 bg-background"
                  style={{ left: `${bmiReading.goalPct}%` }}
                />
              )}
              {/* Where they are now. */}
              <span
                aria-hidden
                className="absolute top-[5px] w-4 h-4 -ml-2 rounded-full bg-accent ring-4 ring-accent/20"
                style={{ left: `${bmiReading.pct}%` }}
              />

              <div className="absolute inset-x-0 bottom-0 flex justify-between text-[9px] text-text-tertiary tabular-nums">
                <span>{SCALE_MIN}</span>
                <span>{SCALE_MAX}</span>
              </div>
            </div>

            <p className="text-[11px] text-text-tertiary leading-relaxed mt-2">
              {bmiReading.goalBmi !== null
                ? <>Your goal weight puts you at <span className="text-white font-semibold tabular-nums">{bmiReading.goalBmi}</span>. A reference point only — it can&apos;t tell muscle from fat.</>
                : <>A reference point only — it can&apos;t tell muscle from fat.</>}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
