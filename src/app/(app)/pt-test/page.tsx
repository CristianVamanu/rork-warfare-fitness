'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Dumbbell, Timer, TrendingUp, Target, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { createPtTestResult, getPtTestResults } from '@/lib/firestore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
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

export default function PtTestPage() {
  const { user } = useAuth();
  const [history, setHistory] = useState<PtTestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [standardId, setStandardId] = useState<string>('generic');
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
          <div className="px-4 py-6 max-w-lg mx-auto text-center">
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
        <div className="px-4 py-6 max-w-lg mx-auto text-center">
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
      <div className="px-4 py-4 max-w-lg mx-auto space-y-5">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStandardId('generic')}
            className={`py-2.5 px-3 rounded-xl text-sm font-bold border transition-colors ${standardId === 'generic' ? 'bg-accent text-black border-accent' : 'border-white/10 text-text-secondary'}`}
          >
            Generic PT Test
          </button>
          {UNIT_STANDARDS.map((s) => (
            <button
              key={s.id}
              onClick={() => setStandardId(s.id)}
              className={`py-2.5 px-3 rounded-xl text-sm font-bold border transition-colors ${standardId === s.id ? 'bg-accent text-black border-accent' : 'border-white/10 text-text-secondary'}`}
            >
              {s.flag} {s.label}
            </button>
          ))}
        </div>

        <Card className="p-4">
          <p className="text-xs text-text-tertiary leading-relaxed">
            {active
              ? active.description
              : 'A classic 3-event military-style fitness test — max push-ups, max sit-ups, and a timed run. Scored on a simplified 0-100-per-event scale for tracking your own progress; not an official Army/Marine score.'}
          </p>
        </Card>

        <div className="space-y-3">
          {(active ? active.events.pullups !== undefined : false) && (
            <Card className="p-4">
              <label className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                <Dumbbell className="w-4 h-4 text-accent" /> Pull-ups (strict, max reps)
              </label>
              <input
                type="number" min="0" value={pullups} onChange={(e) => setPullups(e.target.value)}
                placeholder={`Target: ${active?.events.pullups}+`}
                className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-bold focus:outline-none focus:border-accent/50"
              />
            </Card>
          )}

          {(active ? active.events.pushups !== undefined : true) && (
            <Card className="p-4">
              <label className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                <Dumbbell className="w-4 h-4 text-accent" /> Push-ups (2 min max)
              </label>
              <input
                type="number" min="0" value={pushups} onChange={(e) => setPushups(e.target.value)}
                placeholder={active ? `Target: ${active.events.pushups}+` : 'e.g. 45'}
                className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-bold focus:outline-none focus:border-accent/50"
              />
            </Card>
          )}

          {(active ? active.events.situps !== undefined : true) && (
            <Card className="p-4">
              <label className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-accent" /> Sit-ups (2 min max)
              </label>
              <input
                type="number" min="0" value={situps} onChange={(e) => setSitups(e.target.value)}
                placeholder={active ? `Target: ${active.events.situps}+` : 'e.g. 55'}
                className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-bold focus:outline-none focus:border-accent/50"
              />
            </Card>
          )}

          {(active ? active.events.runMinutes !== undefined : true) && (
            <Card className="p-4">
              <label className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                <Timer className="w-4 h-4 text-accent" /> {active?.runLabel ?? 'Timed Run'}
              </label>
              {!active && (
                <div className="flex gap-2 mb-3">
                  {([1.5, 2] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDistance(d)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${distance === d ? 'bg-accent text-black border-accent' : 'border-white/10 text-text-secondary'}`}
                    >
                      {d} miles
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="number" min="0" value={runMin} onChange={(e) => setRunMin(e.target.value)}
                  placeholder={active ? `Target: <${Math.floor(active.events.runMinutes!)}` : 'min'}
                  className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-bold text-center focus:outline-none focus:border-accent/50"
                />
                <span className="text-text-tertiary font-bold">:</span>
                <input
                  type="number" min="0" max="59" value={runSec} onChange={(e) => setRunSec(e.target.value)}
                  placeholder="sec"
                  className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-bold text-center focus:outline-none focus:border-accent/50"
                />
              </div>
            </Card>
          )}
        </div>

        <Button fullWidth loading={saving} onClick={handleSubmit}>Submit Test</Button>

        {!loading && history.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-white mb-2">Past Results</h2>
            <div className="space-y-2">
              {history.map((r) => {
                const std = r.standard && r.standard !== 'generic' ? standardFor(r.standard) : undefined;
                return (
                  <Card key={r.id} className="p-3 flex items-center justify-between">
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
                  </Card>
                );
              })}
            </div>
          </div>
        )}
        {loading && <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>}
      </div>
    </div>
  );
}
