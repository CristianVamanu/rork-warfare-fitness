'use client';

import { useState, useEffect } from 'react';
import { Timer, Flame, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { startFasting, stopFasting } from '@/lib/firestore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Timestamp } from 'firebase/firestore';

const PRESETS: { label: string; hours: number; desc: string }[] = [
  { label: '16:8', hours: 16, desc: 'Beginner friendly' },
  { label: '18:6', hours: 18, desc: 'Intermediate' },
  { label: '20:4', hours: 20, desc: 'Warrior diet' },
  { label: 'OMAD', hours: 23, desc: 'One meal a day' },
];

interface Stage {
  label: string;
  desc: string;
}

function getStage(hoursElapsed: number): Stage {
  if (hoursElapsed < 4) return { label: 'Fed State', desc: 'Your body is digesting and absorbing your last meal.' };
  if (hoursElapsed < 12) return { label: 'Blood Sugar Drops', desc: 'Insulin is falling as your body shifts toward burning stored glycogen.' };
  if (hoursElapsed < 18) return { label: 'Fat Burning', desc: 'Glycogen stores are low — your body is starting to burn fat for fuel.' };
  if (hoursElapsed < 24) return { label: 'Ketosis', desc: 'Ketone production is rising, giving you steady energy and mental clarity.' };
  return { label: 'Autophagy', desc: 'Deep cellular repair — your body is recycling damaged cells.' };
}

function toMillis(ts: unknown): number {
  const t = ts as Timestamp | undefined;
  return t?.toMillis?.() ?? 0;
}

function formatDuration(ms: number): string {
  const totalMins = Math.floor(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}h ${m}m`;
}

export function FastingWidget() {
  const { user, profile } = useAuth();
  const [now, setNow] = useState(Date.now());
  const [startModal, setStartModal] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [customHours, setCustomHours] = useState('');
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const fasting = profile?.fasting ?? null;

  useEffect(() => {
    if (!fasting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fasting]);

  const handleStart = async (hours: number) => {
    if (!user) return;
    setStarting(true);
    try {
      await startFasting(user.uid, hours);
      setStartModal(false);
      toast.success(`Fast started — goal ${hours}h`);
    } catch {
      toast.error('Failed to start fast');
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    if (!user) return;
    setStopping(true);
    try {
      await stopFasting(user.uid);
      setDetailModal(false);
      toast.success('Fast ended — nice work!');
    } catch {
      toast.error('Failed to end fast');
    } finally {
      setStopping(false);
    }
  };

  if (!fasting) {
    return (
      <>
        <button onClick={() => setStartModal(true)} className="w-full text-left">
          <Card className="p-4 flex items-center gap-3 hover:bg-white/5 transition-colors">
            <div className="p-2.5 rounded-xl bg-blue-400/10">
              <Timer className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Fasting</p>
              <p className="text-xs text-text-secondary">Tap to start a fast</p>
            </div>
          </Card>
        </button>

        <Modal open={startModal} onClose={() => setStartModal(false)} title="Start a Fast">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => handleStart(p.hours)}
                  disabled={starting}
                  className="p-3 rounded-xl border border-white/10 bg-surface hover:border-accent/40 transition-colors text-left"
                >
                  <p className="text-sm font-bold text-white">{p.label}</p>
                  <p className="text-[10px] text-text-secondary">{p.desc}</p>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={72}
                value={customHours}
                onChange={(e) => setCustomHours(e.target.value)}
                placeholder="Custom hours"
                style={{ backgroundColor: 'var(--surface-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--foreground)' }}
                className="flex-1 border rounded-xl px-4 py-2.5 text-sm placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
              <Button
                disabled={!customHours || Number(customHours) <= 0}
                loading={starting}
                onClick={() => handleStart(Number(customHours))}
              >
                Start
              </Button>
            </div>
          </div>
        </Modal>
      </>
    );
  }

  const startedAtMs = toMillis(fasting.startedAt) || now;
  const elapsedMs = Math.max(0, now - startedAtMs);
  const elapsedHours = elapsedMs / 3600000;
  const goalMs = fasting.goalHours * 3600000;
  const pct = Math.min(100, Math.round((elapsedMs / goalMs) * 100));
  const stage = getStage(elapsedHours);
  const goalReached = elapsedMs >= goalMs;

  return (
    <>
      <button onClick={() => setDetailModal(true)} className="w-full text-left">
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-400/10">
              <Timer className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{formatDuration(elapsedMs)}</p>
              <p className="text-xs text-text-secondary truncate">{goalReached ? 'Goal reached! 🎉' : stage.label}</p>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-surface-elevated overflow-hidden">
            <div className="h-full bg-blue-400 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </Card>
      </button>

      <Modal open={detailModal} onClose={() => setDetailModal(false)} title="Fasting Progress">
        <div className="space-y-4">
          <div className="text-center py-3">
            <p className="text-3xl font-black text-white">{formatDuration(elapsedMs)}</p>
            <p className="text-xs text-text-tertiary mt-1">Goal: {fasting.goalHours}h {goalReached ? '— reached!' : `(${formatDuration(Math.max(0, goalMs - elapsedMs))} left)`}</p>
          </div>
          <div className="h-2 rounded-full bg-surface-elevated overflow-hidden">
            <div className="h-full bg-blue-400 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="p-3 bg-blue-400/5 border border-blue-400/20 rounded-xl flex items-start gap-2">
            <Flame className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-white">{stage.label}</p>
              <p className="text-xs text-text-secondary mt-0.5">{stage.desc}</p>
            </div>
          </div>
          <Button fullWidth variant="secondary" loading={stopping} onClick={handleStop}>
            <X className="w-4 h-4" /> End Fast
          </Button>
        </div>
      </Modal>
    </>
  );
}
