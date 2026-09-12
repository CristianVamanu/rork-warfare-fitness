'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Dumbbell, Timer, TrendingUp, Target, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { createPtTestResult, getPtTestResults, deletePtTestResult } from '@/lib/firestore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { PaywallGate } from '@/components/ui/PaywallGate';
import type { PtTestResult } from '@/types';

// Published (unclassified) elite-unit selection PT standards, sourced from
// public reporting on each force's own recruiting/selection material — none
// of this is classified. Every unit only defines the events it actually has
// a clean public number for; the form below only asks for those events, and
// "passed" means every defined event was met. Real selection for most of
// these units also includes non-reps/time gates (timed rucks, open-water
// swims, obstacle courses, medical/psych screening) that this app has no way
// to simulate — the linked program trains toward those too, this page just
// tracks the part that's expressible as reps/time.
interface UnitStandard {
  id: string;
  flag: string;
  label: string;        // short toggle label
  resultTitle: string;  // shown on the result screen
  description: string;
  runLabel?: string;
  events: {
    pullups?: number;
    pushups?: number;   // 2-minute max unless stated in description
    situps?: number;    // 2-minute max
    runMinutes?: number; // max allowed time for runLabel's distance/task
  };
}

const UNIT_STANDARDS: UnitStandard[] = [
  {
    id: 'spetsnaz',
    flag: '🇷🇺',
    label: 'Spetsnaz Selection',
    resultTitle: 'Spetsnaz Selection Standard',
    description: 'The published (unclassified) Spetsnaz selection PT standard: 20 strict pull-ups, 90 push-ups in 2 minutes, and a 3km run under 10:30.',
    runLabel: '3km Run',
    events: { pullups: 20, pushups: 90, runMinutes: 10.5 },
  },
  {
    id: 'ranger',
    flag: '🇺🇸',
    label: 'Ranger Assessment',
    resultTitle: 'Ranger (RASP) Standard',
    description: 'The published pre-RASP entry standard: 53 push-ups, 63 sit-ups, 4 pull-ups, and a 2-mile run under 14:30. RASP itself adds a 6-mile ruck march this app doesn’t track.',
    runLabel: '2-Mile Run',
    events: { pushups: 53, situps: 63, pullups: 4, runMinutes: 14.5 },
  },
  {
    id: 'seal',
    flag: '🇺🇸',
    label: 'SEAL Selection',
    resultTitle: 'Navy SEAL PST Standard',
    description: 'The published Navy SEAL Physical Screening Test minimums: 42 push-ups, 50 sit-ups, 10 pull-ups, and a 1.5-mile run under 10:30. The PST also includes a 500-yard swim this app doesn’t track.',
    runLabel: '1.5-Mile Run',
    events: { pushups: 42, situps: 50, pullups: 10, runMinutes: 10.5 },
  },
  {
    id: 'sas',
    flag: '🇬🇧',
    label: 'SAS Selection',
    resultTitle: 'SAS Combat Fitness Standard',
    description: 'The published SAS Combat Fitness Test run standard: 2 miles under 18:00. Full selection also includes the Fan Dance (a 26km, 40lb march over Pen y Fan) this app doesn’t track.',
    runLabel: '2-Mile Run',
    events: { runMinutes: 18 },
  },
  {
    id: 'ksk',
    flag: '🇩🇪',
    label: 'KSK Selection',
    resultTitle: 'KSK Endurance Standard',
    description: 'The published German KSK field endurance standard: a 7km ruck march with a 20kg pack under 52:00. Selection also includes 1-minute max push-up/sit-up tests and a 500m swim this app doesn’t track.',
    runLabel: '7km Ruck (20kg)',
    events: { runMinutes: 52 },
  },
  {
    id: 'commando',
    flag: '🇬🇧',
    label: 'Commando PT Test',
    resultTitle: 'Royal Marines Commando Standard',
    description: 'The published Royal Marines Candidate Preparation standard: 30 push-ups, 40 sit-ups, 4 pull-ups minimum, and a 1.5-mile run under 11:15.',
    runLabel: '1.5-Mile Run',
    events: { pushups: 30, situps: 40, pullups: 4, runMinutes: 11.25 },
  },
  {
    id: 'commando-endurance',
    flag: '🇬🇧',
    label: 'Commando Endurance',
    resultTitle: 'Royal Marines Endurance Course Standard',
    description: 'The published Royal Marines Endurance Course standard: 6 miles carrying 21lb fighting order under 73:00, immediately followed by a marksmanship test in real selection.',
    runLabel: '6-Mile Load Carry (21lb)',
    events: { runMinutes: 73 },
  },
  {
    id: 'recon',
    flag: '🇺🇸',
    label: 'Force Recon Prep',
    resultTitle: 'USMC Force Recon Standard',
    description: 'A Force Recon-competitive standard: 20 pull-ups and a 3-mile run under 18:00 — well above the standard Marine PFT minimum. Recon screening also includes underwater confidence and rucking events this app doesn’t track.',
    runLabel: '3-Mile Run',
    events: { pullups: 20, runMinutes: 18 },
  },
  {
    id: 'legion',
    flag: '🇫🇷',
    label: 'Legion Selection',
    resultTitle: 'French Foreign Legion Standard',
    description: 'The published French Foreign Legion recruiting-station standard: 7 strict pull-ups from a dead hang. Selection also requires at least level 7 on the Luc Léger beep test, which doesn’t convert cleanly to a loggable time here.',
    events: { pullups: 7 },
  },
  {
    id: 'pj',
    flag: '🇺🇸',
    label: 'PJ Indoc Prep',
    resultTitle: 'Air Force Pararescue Standard',
    description: 'The published Pararescue (PJ) PAST standard: 10 pull-ups. The full PAST also gates on a 25m underwater swim and timed run this app doesn’t track.',
    events: { pullups: 10 },
  },
];

function standardFor(id?: string): UnitStandard | undefined {
  return UNIT_STANDARDS.find((s) => s.id === id);
}

/**
 * The standard a member's own program trains toward.
 *
 * The two lists were unconnected: someone running Commando Prep opened this
 * page, saw ten unit names in no particular order with the generic test
 * preselected, and had to know which one their own program was for. Matching
 * on the program NAME rather than its id on purpose — the built-in ids (p5,
 * p8, …) stop applying the moment an admin edits a program into Firestore or
 * writes a new one, and the name is what survives.
 */
const PROGRAM_STANDARD: { test: RegExp; standard: string }[] = [
  { test: /commando\s*endurance/i, standard: 'commando-endurance' },
  { test: /commando/i, standard: 'commando' },
  { test: /spetsnaz/i, standard: 'spetsnaz' },
  { test: /\bsas\b|special air service/i, standard: 'sas' },
  { test: /\bksk\b/i, standard: 'ksk' },
  { test: /ranger|rasp/i, standard: 'ranger' },
  { test: /\bseal\b|bud\/?s/i, standard: 'seal' },
  { test: /recon/i, standard: 'recon' },
  { test: /legion/i, standard: 'legion' },
  { test: /\bpj\b|pararescue|indoc/i, standard: 'pj' },
];

function standardForProgram(programName?: string): string | undefined {
  if (!programName) return undefined;
  return PROGRAM_STANDARD.find((m) => m.test.test(programName))?.standard;
}

// Simplified 0-100 benchmark scale per event, loosely modeled on published
// (unclassified) military PT test ranges for a young-adult male baseline —
// NOT an official/exact Army ACFT or Marine PFT score, which are banded by
// age and sex with far more precision. Good enough to track your own
// progress over time and get an honest sense of where you stand. Only used
// for the "Generic PT Test" mode; unit-standard mode compares directly
// against that unit's real published numbers instead.
function scorePushups(reps: number): number {
  return Math.max(0, Math.min(100, Math.round((reps / 80) * 100)));
}
function scoreSitups(reps: number): number {
  return Math.max(0, Math.min(100, Math.round((reps / 100) * 100)));
}
function scoreRun(minutes: number, distance: 1.5 | 2): number {
  const worst = distance === 1.5 ? 15 : 20;
  const best = distance === 1.5 ? 9 : 12;
  const pct = (worst - minutes) / (worst - best);
  return Math.max(0, Math.min(100, Math.round(pct * 100)));
}
function tierFor(total: number): PtTestResult['tier'] {
  if (total >= 275) return 'elite';
  if (total >= 225) return 'strong';
  if (total >= 150) return 'solid';
  return 'needs-work';
}
const TIER_LABEL: Record<PtTestResult['tier'], { label: string; color: string }> = {
  elite: { label: 'Elite', color: 'text-accent' },
  strong: { label: 'Strong', color: 'text-green-400' },
  solid: { label: 'Solid', color: 'text-blue-400' },
  'needs-work': { label: 'Needs Work', color: 'text-yellow-400' },
};

function formatMinutes(mins: number): string {
  return `${Math.floor(mins)}:${String(Math.round((mins % 1) * 60)).padStart(2, '0')}`;
}

/**
 * One event of the test: icon, name, what it asks for, and the input, on a
 * single line. Rows sit inside one panel divided by hairlines — the form used
 * a separate Card per event, which gave four inputs the same visual weight as
 * the whole rest of the page.
 */
function EventRow({ icon: Icon, label, hint, target, children }: {
  icon: React.ElementType;
  label: string;
  hint: string;
  /** The number to beat, shown once per row instead of as placeholder text
   *  inside the input — a placeholder disappears the moment you type, which
   *  is exactly when you want to still see it. */
  target?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5">
      <div className="flex items-start gap-2.5 min-w-0">
        <Icon className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-white leading-tight">{label}</p>
          <p className="text-[11px] text-text-tertiary mt-0.5">
            {hint}
            {target && <span className="text-accent font-semibold"> · {target}</span>}
          </p>
        </div>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function NumberField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="number"
      min="0"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="0"
      className="w-20 bg-surface border border-white/10 rounded-lg px-3 py-2 text-white text-lg font-bold text-right tabular-nums focus:outline-none focus:border-accent/50"
    />
  );
}

export default function PtTestPage() {
  const { user, profile } = useAuth();
  // The standard this member's own program trains toward, if any — used to
  // preselect it and to mark it in the list.
  const ownStandard = standardForProgram(profile?.activeProgram?.programName);
  const [history, setHistory] = useState<PtTestResult[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  async function handleDeleteResult(id: string) {
    if (!confirm('Delete this result? It cannot be restored.')) return;
    setDeletingId(id);
    try {
      await deletePtTestResult(id);
      setHistory((prev) => prev.filter((r) => r.id !== id));
      toast.success('Result deleted');
    } catch {
      toast.error('Could not delete that result');
    } finally {
      setDeletingId(null);
    }
  }
  const [loading, setLoading] = useState(true);
  const [standardId, setStandardId] = useState<string>('generic');
  // Opens on the member's own standard rather than the generic test. Runs
  // once the profile has loaded, and never fights a choice already made.
  const [standardTouched, setStandardTouched] = useState(false);
  useEffect(() => {
    if (!standardTouched && ownStandard) setStandardId(ownStandard);
  }, [ownStandard, standardTouched]);
  const [pushups, setPushups] = useState('');
  const [situps, setSitups] = useState('');
  const [pullups, setPullups] = useState('');
  const [runMin, setRunMin] = useState('');
  const [runSec, setRunSec] = useState('');
  const [distance, setDistance] = useState<1.5 | 2>(1.5);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<PtTestResult | null>(null);

  const active = useMemo(() => standardFor(standardId), [standardId]);

  useEffect(() => {
    if (!user) return;
    getPtTestResults(user.uid).then(setHistory).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  async function handleSubmit() {
    if (!user) return;

    if (active) {
      const { events } = active;
      const pu = events.pushups !== undefined ? parseInt(pushups) : undefined;
      const su = events.situps !== undefined ? parseInt(situps) : undefined;
      const pull = events.pullups !== undefined ? parseInt(pullups) : undefined;
      const mins = events.runMinutes !== undefined ? (parseInt(runMin) || 0) + (parseInt(runSec) || 0) / 60 : undefined;

      const missing = (events.pushups !== undefined && isNaN(pu as number))
        || (events.situps !== undefined && isNaN(su as number))
        || (events.pullups !== undefined && isNaN(pull as number))
        || (events.runMinutes !== undefined && (!mins || mins <= 0));
      if (missing) {
        toast.error('Fill in every event for this standard');
        return;
      }

      setSaving(true);
      try {
        const standardPassed = (events.pullups === undefined || (pull ?? 0) >= events.pullups)
          && (events.pushups === undefined || (pu ?? 0) >= events.pushups)
          && (events.situps === undefined || (su ?? 0) >= events.situps)
          && (events.runMinutes === undefined || (mins ?? Infinity) <= events.runMinutes);

        // Unused core fields are kept populated at 0 since PtTestResult's
        // legacy fields aren't optional — only unit-standard fields
        // (standard/pullups/standardPassed) and this unit's own events are
        // ever read back for display in this mode.
        const data = {
          userId: user.uid,
          pushups: pu ?? 0,
          situps: su ?? 0,
          pullups: pull,
          runMinutes: mins ?? 0,
          runDistanceMiles: 2 as const,
          pushupsScore: 0, situpsScore: 0, runScore: 0, totalScore: 0,
          tier: 'solid' as PtTestResult['tier'],
          standard: active.id as PtTestResult['standard'],
          standardPassed,
        };
        const id = await createPtTestResult(data);
        const saved = { id, createdAt: new Date(), ...data };
        setResult(saved);
        setHistory((prev) => [saved, ...prev]);
        toast.success(standardPassed ? `You'd pass ${active.label} today!` : 'PT test logged!');
      } catch {
        toast.error('Failed to save result');
      } finally {
        setSaving(false);
      }
      return;
    }

    const pu = parseInt(pushups), su = parseInt(situps);
    const mins = (parseInt(runMin) || 0) + (parseInt(runSec) || 0) / 60;
    if (isNaN(pu) || isNaN(su) || mins <= 0) {
      toast.error('Fill in all three events');
      return;
    }
    setSaving(true);
    try {
      const pushupsScore = scorePushups(pu);
      const situpsScore = scoreSitups(su);
      const runScore = scoreRun(mins, distance);
      const totalScore = pushupsScore + situpsScore + runScore;
      const data = {
        userId: user.uid,
        pushups: pu,
        situps: su,
        runMinutes: mins,
        runDistanceMiles: distance,
        pushupsScore, situpsScore, runScore, totalScore,
        tier: tierFor(totalScore),
        standard: 'generic' as const,
      };
      const id = await createPtTestResult(data);
      const saved = { id, createdAt: new Date(), ...data };
      setResult(saved);
      setHistory((prev) => [saved, ...prev]);
      toast.success('PT test logged!');
    } catch {
      toast.error('Failed to save result');
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setResult(null);
    setPushups(''); setSitups(''); setPullups(''); setRunMin(''); setRunSec('');
  }

  if (result && result.standard && result.standard !== 'generic') {
    const std = standardFor(result.standard);
    if (std) {
      const events = [
        std.events.pullups !== undefined && { label: 'Pull-ups', value: `${result.pullups}`, target: `${std.events.pullups}+`, passed: (result.pullups ?? 0) >= std.events.pullups },
        std.events.pushups !== undefined && { label: 'Push-ups (2min)', value: `${result.pushups}`, target: `${std.events.pushups}+`, passed: result.pushups >= std.events.pushups },
        std.events.situps !== undefined && { label: 'Sit-ups (2min)', value: `${result.situps}`, target: `${std.events.situps}+`, passed: result.situps >= std.events.situps },
        std.events.runMinutes !== undefined && { label: std.runLabel ?? 'Run', value: formatMinutes(result.runMinutes), target: formatMinutes(std.events.runMinutes), passed: result.runMinutes <= std.events.runMinutes },
      ].filter(Boolean) as { label: string; value: string; target: string; passed: boolean }[];

      return (
        <div>
          <Header title={`${std.label} Result`} showBack />
          <div className="px-4 py-6 max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto text-center">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${result.standardPassed ? 'bg-accent-muted' : 'bg-white/5'}`}>
                <Target className={`w-8 h-8 ${result.standardPassed ? 'text-accent' : 'text-text-secondary'}`} />
              </div>
              <p className="text-2xl font-black text-white">{result.standardPassed ? "You'd pass selection today" : 'Not there yet'}</p>
              <p className="text-sm text-text-secondary mt-1">{std.resultTitle}</p>

              <div className="space-y-2 mt-6">
                {events.map((e) => (
                  <Card key={e.label} className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {e.passed ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                      <p className="text-sm font-bold text-white">{e.label}</p>
                    </div>
                    <p className="text-sm text-text-secondary">{e.value} <span className="text-text-tertiary">/ {e.target}</span></p>
                  </Card>
                ))}
              </div>

              <Button fullWidth className="mt-6" onClick={reset}>Log Another Test</Button>
            </motion.div>
          </div>
        </div>
      );
    }
  }

  if (result) {
    const tier = TIER_LABEL[result.tier];
    return (
      <div>
        <Header title="PT Test Result" showBack />
        <div className="px-4 py-6 max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="w-16 h-16 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-8 h-8 text-accent" />
            </div>
            <p className="text-4xl font-black text-white">{result.totalScore}<span className="text-lg text-text-secondary">/300</span></p>
            <p className={`text-sm font-bold uppercase tracking-wide mt-1 ${tier.color}`}>{tier.label}</p>

            <div className="grid grid-cols-3 gap-2 mt-6">
              <Card className="p-3 text-center">
                <p className="text-xs text-text-tertiary">Push-ups</p>
                <p className="text-lg font-black text-white mt-0.5">{result.pushups}</p>
                <p className="text-[10px] text-text-tertiary">{result.pushupsScore}/100</p>
              </Card>
              <Card className="p-3 text-center">
                <p className="text-xs text-text-tertiary">Sit-ups</p>
                <p className="text-lg font-black text-white mt-0.5">{result.situps}</p>
                <p className="text-[10px] text-text-tertiary">{result.situpsScore}/100</p>
              </Card>
              <Card className="p-3 text-center">
                <p className="text-xs text-text-tertiary">{result.runDistanceMiles}mi Run</p>
                <p className="text-lg font-black text-white mt-0.5">{formatMinutes(result.runMinutes)}</p>
                <p className="text-[10px] text-text-tertiary">{result.runScore}/100</p>
              </Card>
            </div>

            <Button fullWidth className="mt-6" onClick={reset}>Log Another Test</Button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="PT Test" showBack />
      {/* See the habits page for why noTaste is set here. */}
      <PaywallGate feature="pt-test" noTaste>
      <div className="px-4 py-4 max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto space-y-5">
        {/* Standard picker — one horizontally scrolling rail rather than a
            wrapping block. Eleven chips wrapped into four ragged rows and
            pushed the form itself off the screen, which is what made this
            page read as scattered. */}
        <div className="-mx-4 px-4 overflow-x-auto">
          <div className="flex gap-2 w-max pb-1">
            <button
              onClick={() => { setStandardTouched(true); setStandardId('generic'); }}
              className={`whitespace-nowrap py-2 px-3.5 rounded-lg text-xs font-bold border transition-colors ${standardId === 'generic' ? 'bg-accent text-black border-accent' : 'border-white/10 text-text-secondary'}`}
            >
              Generic
            </button>
            {/* The member's own standard is pulled to the front, so the rail
                starts with the one that applies to them instead of whichever
                unit happened to be first in the array. */}
            {[...UNIT_STANDARDS]
              .sort((a, b) => (a.id === ownStandard ? -1 : b.id === ownStandard ? 1 : 0))
              .map((s) => (
              <button
                key={s.id}
                onClick={() => { setStandardTouched(true); setStandardId(s.id); }}
                className={`whitespace-nowrap py-2 px-3.5 rounded-lg text-xs font-bold border transition-colors ${standardId === s.id ? 'bg-accent text-black border-accent' : 'border-white/10 text-text-secondary'}`}
              >
                {s.flag} {s.label}
                {s.id === ownStandard && (
                  <span className={`ml-1.5 text-[9px] font-bold uppercase tracking-wide ${standardId === s.id ? 'text-black/70' : 'text-accent'}`}>
                    yours
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Standard briefing: what it is, and what it asks of you, above the
            form rather than repeated as placeholder text inside every input. */}
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <span className="w-1 h-3.5 bg-accent rounded-full" />
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">
              {active ? 'Standard' : 'Benchmark'}
            </p>
          </div>
          <p className="text-sm font-bold text-white mt-2">{active ? active.resultTitle : 'Generic 3-event PT test'}</p>
          <p className="text-xs text-text-secondary leading-relaxed mt-1.5">
            {active
              ? active.description
              : 'A classic 3-event military-style fitness test — max push-ups, max sit-ups, and a timed run. Scored on a simplified 0-100-per-event scale for tracking your own progress; not an official Army/Marine score.'}
          </p>
          <p className="text-xs text-text-tertiary leading-relaxed mt-3 pt-3 border-t border-white/8">
            Enter your numbers and they are scored against this standard straight away, then kept in
            your history. Nothing is uploaded and nobody reviews it.
          </p>
        </Card>

        {/* Every event in ONE panel, separated by hairlines. Five stacked
            cards each with its own border, padding and shadow gave equal
            visual weight to four inputs and a paragraph, with no sense of
            them belonging to the same test. */}
        <Card className="p-0 overflow-hidden">
          <div className="divide-y divide-white/8">
            {(active ? active.events.pullups !== undefined : false) && (
              <EventRow
                icon={Dumbbell}
                label="Pull-ups"
                hint="Strict, max reps"
                target={`${active?.events.pullups}+`}
              >
                <NumberField value={pullups} onChange={setPullups} />
              </EventRow>
            )}

            {(active ? active.events.pushups !== undefined : true) && (
              <EventRow
                icon={Dumbbell}
                label="Push-ups"
                hint="2 minute max"
                target={active ? `${active.events.pushups}+` : undefined}
              >
                <NumberField value={pushups} onChange={setPushups} />
              </EventRow>
            )}

            {(active ? active.events.situps !== undefined : true) && (
              <EventRow
                icon={TrendingUp}
                label="Sit-ups"
                hint="2 minute max"
                target={active ? `${active.events.situps}+` : undefined}
              >
                <NumberField value={situps} onChange={setSitups} />
              </EventRow>
            )}

            {(active ? active.events.runMinutes !== undefined : true) && (
              <EventRow
                icon={Timer}
                label={active?.runLabel ?? 'Timed run'}
                hint={active ? 'Time to beat' : 'Pick a distance'}
                target={active ? `under ${formatMinutes(active.events.runMinutes!)}` : undefined}
              >
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" min="0" inputMode="numeric" value={runMin} onChange={(e) => setRunMin(e.target.value)}
                    placeholder="00"
                    aria-label="Run minutes"
                    className="w-14 bg-surface border border-white/10 rounded-lg px-2 py-2 text-white text-lg font-bold text-center tabular-nums focus:outline-none focus:border-accent/50"
                  />
                  <span className="text-text-tertiary font-bold">:</span>
                  <input
                    type="number" min="0" max="59" inputMode="numeric" value={runSec} onChange={(e) => setRunSec(e.target.value)}
                    placeholder="00"
                    aria-label="Run seconds"
                    className="w-14 bg-surface border border-white/10 rounded-lg px-2 py-2 text-white text-lg font-bold text-center tabular-nums focus:outline-none focus:border-accent/50"
                  />
                </div>
              </EventRow>
            )}

            {!active && (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <p className="text-xs text-text-secondary">Run distance</p>
                <div className="flex gap-2">
                  {([1.5, 2] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDistance(d)}
                      className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-colors tabular-nums ${distance === d ? 'bg-accent text-black border-accent' : 'border-white/10 text-text-secondary'}`}
                    >
                      {d} mi
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Button fullWidth loading={saving} onClick={handleSubmit}>Submit Test</Button>

        {!loading && history.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1 h-3 bg-accent rounded-full" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-tertiary">Past results</h2>
            </div>
            <div className="space-y-2">
              {history.map((r) => {
                const std = r.standard && r.standard !== 'generic' ? standardFor(r.standard) : undefined;
                return (
                  <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
                    {std ? (
                      <div>
                        <p className={`text-sm font-bold ${r.standardPassed ? 'text-green-400' : 'text-white'}`}>
                          {r.standardPassed ? `Passed ${std.label}` : std.label}
                        </p>
                        <p className="text-xs text-text-tertiary">
                          {[
                            std.events.pullups !== undefined && `${r.pullups} pull-ups`,
                            std.events.pushups !== undefined && `${r.pushups} push-ups`,
                            std.events.situps !== undefined && `${r.situps} sit-ups`,
                            std.events.runMinutes !== undefined && `${formatMinutes(r.runMinutes)} ${std.runLabel ?? 'run'}`,
                          ].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-bold text-white">{r.totalScore}/300 · {TIER_LABEL[r.tier].label}</p>
                        <p className="text-xs text-text-tertiary">{r.pushups} push-ups · {r.situps} sit-ups · {r.runDistanceMiles}mi run</p>
                      </div>
                    )}
                    <button
                      onClick={() => handleDeleteResult(r.id)}
                      disabled={deletingId === r.id}
                      aria-label="Delete this result"
                      className="p-2 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
        {loading && <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>}
      </div>
      </PaywallGate>
    </div>
  );
}
