'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Dumbbell, Timer, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { createPtTestResult, getPtTestResults } from '@/lib/firestore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { PtTestResult } from '@/types';

// Simplified 0-100 benchmark scale per event, loosely modeled on published
// (unclassified) military PT test ranges for a young-adult male baseline —
// NOT an official/exact Army ACFT or Marine PFT score, which are banded by
// age and sex with far more precision. Good enough to track your own
// progress over time and get an honest sense of where you stand.
function scorePushups(reps: number): number {
  return Math.max(0, Math.min(100, Math.round((reps / 80) * 100)));
}
function scoreSitups(reps: number): number {
  return Math.max(0, Math.min(100, Math.round((reps / 100) * 100)));
}
function scoreRun(minutes: number, distance: 1.5 | 2): number {
  // Faster time = higher score. Benchmarks: 1.5mi worst=15:00 best=9:00; 2mi worst=20:00 best=12:00.
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

export default function PtTestPage() {
  const { user } = useAuth();
  const [history, setHistory] = useState<PtTestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushups, setPushups] = useState('');
  const [situps, setSitups] = useState('');
  const [runMin, setRunMin] = useState('');
  const [runSec, setRunSec] = useState('');
  const [distance, setDistance] = useState<1.5 | 2>(1.5);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<PtTestResult | null>(null);

  useEffect(() => {
    if (!user) return;
    getPtTestResults(user.uid).then(setHistory).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  async function handleSubmit() {
    if (!user) return;
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
    setPushups(''); setSitups(''); setRunMin(''); setRunSec('');
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
                <p className="text-lg font-black text-white mt-0.5">{Math.floor(result.runMinutes)}:{String(Math.round((result.runMinutes % 1) * 60)).padStart(2, '0')}</p>
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
        <Card className="p-4">
          <p className="text-xs text-text-tertiary leading-relaxed">
            A classic 3-event military-style fitness test — max push-ups, max sit-ups, and a timed run. Scored on a simplified 0-100-per-event scale for tracking your own progress; not an official Army/Marine score.
          </p>
        </Card>

        <div className="space-y-3">
          <Card className="p-4">
            <label className="text-sm font-bold text-white flex items-center gap-2 mb-2">
              <Dumbbell className="w-4 h-4 text-accent" /> Push-ups (2 min max)
            </label>
            <input
              type="number" min="0" value={pushups} onChange={(e) => setPushups(e.target.value)}
              placeholder="e.g. 45"
              className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-bold focus:outline-none focus:border-accent/50"
            />
          </Card>

          <Card className="p-4">
            <label className="text-sm font-bold text-white flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-accent" /> Sit-ups (2 min max)
            </label>
            <input
              type="number" min="0" value={situps} onChange={(e) => setSitups(e.target.value)}
              placeholder="e.g. 55"
              className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-bold focus:outline-none focus:border-accent/50"
            />
          </Card>

          <Card className="p-4">
            <label className="text-sm font-bold text-white flex items-center gap-2 mb-2">
              <Timer className="w-4 h-4 text-accent" /> Timed Run
            </label>
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
            <div className="flex items-center gap-2">
              <input
                type="number" min="0" value={runMin} onChange={(e) => setRunMin(e.target.value)}
                placeholder="min"
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
        </div>

        <Button fullWidth loading={saving} onClick={handleSubmit}>Submit Test</Button>

        {!loading && history.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-white mb-2">Past Results</h2>
            <div className="space-y-2">
              {history.map((r) => (
                <Card key={r.id} className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-white">{r.totalScore}/300 · {TIER_LABEL[r.tier].label}</p>
                    <p className="text-xs text-text-tertiary">{r.pushups} push-ups · {r.situps} sit-ups · {r.runDistanceMiles}mi run</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
        {loading && <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>}
      </div>
    </div>
  );
}
