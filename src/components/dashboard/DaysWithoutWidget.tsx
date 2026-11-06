'use client';

import { useState, useEffect, useMemo } from 'react';
import { ShieldOff, RotateCcw, Trash2, Flame, Quote } from 'lucide-react';
import { Medallion } from '@/components/dashboard/Medallion';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { addDaysWithoutGoal, resetDaysWithoutGoal, deleteDaysWithoutGoal } from '@/lib/firestore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { HABIT_QUOTES, pickQuote } from '@/lib/motivationalQuotes';
import type { DaysWithoutGoal } from '@/types';
import type { Timestamp } from 'firebase/firestore';

const PRESET_GOALS = ['Quit Smoking', 'Quit Alcohol', 'Quit Porn', 'Quit Junk Food', 'Quit Social Media'];

function toMillis(ts: unknown): number {
  const t = ts as Timestamp | undefined;
  return t?.toMillis?.() ?? Date.now();
}

function formatElapsed(ms: number): string {
  ms = Math.max(0, ms);
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

export function DaysWithoutWidget() {
  const { user, profile } = useAuth();
  const [now, setNow] = useState(Date.now());
  const [addModal, setAddModal] = useState(false);
  const [customGoal, setCustomGoal] = useState('');
  const [adding, setAdding] = useState(false);
  const [detailGoal, setDetailGoal] = useState<DaysWithoutGoal | null>(null);
  const [busy, setBusy] = useState(false);

  const goals = profile?.daysWithoutGoals ?? [];
  const quote = useMemo(() => pickQuote(HABIT_QUOTES), [detailGoal?.id, detailGoal?.startedAt]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const handleAdd = async (label: string) => {
    if (!user || !label.trim()) return;
    setAdding(true);
    try {
      await addDaysWithoutGoal(user.uid, label);
      setAddModal(false);
      setCustomGoal('');
      toast.success(`Tracking "${label.trim()}" started`);
    } catch {
      toast.error('Failed to add goal');
    } finally {
      setAdding(false);
    }
  };

  const handleReset = async () => {
    if (!user || !detailGoal) return;
    setBusy(true);
    try {
      await resetDaysWithoutGoal(user.uid, detailGoal.id);
      setDetailGoal(null);
      toast.success('Timer reset — you got this');
    } catch {
      toast.error('Failed to reset');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !detailGoal) return;
    setBusy(true);
    try {
      await deleteDaysWithoutGoal(user.uid, detailGoal.id);
      setDetailGoal(null);
    } catch {
      toast.error('Failed to delete');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card glass className="wf-art p-4 space-y-3 cursor-pointer active:scale-[.99] transition-transform" onClick={() => setAddModal(true)} style={{ '--art': "url('/home/cards/without.webp')" } as React.CSSProperties}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div>
              <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Days without</span>
              <p className="text-[15px] font-extrabold text-white leading-tight">Habits you are quitting</p>
            </div>
          </div>
        </div>

        {goals.length === 0 ? (
          <button onClick={() => setAddModal(true)} className="w-full text-left">
            <p className="text-xs text-text-secondary">Track a habit you&apos;re quitting. Tap to add one.</p>
          </button>
        ) : (
          <div className="space-y-2">
            {goals.map((g) => {
              const elapsedMs = Math.max(0, now - toMillis(g.startedAt));
              const days = Math.floor(elapsedMs / 86400000);
              return (
                <button
                  key={g.id}
                  onClick={(e) => { e.stopPropagation(); setDetailGoal(g); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[18px] wf-glow active:scale-[.99] transition-transform"
                >
                  <div className="w-11 h-11 rounded-full wf-round flex flex-col items-center justify-center flex-shrink-0">
                    <span className="text-[15px] font-black italic text-white leading-none">{days}</span><span className="text-[7px] font-bold tracking-wider text-accent uppercase">{days === 1 ? 'day' : 'days'}</span>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[13px] font-bold text-white truncate">{g.label}</p>
                    <p className="text-[11px] text-accent/90">{formatElapsed(elapsedMs)} clean</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Modal open={addModal} onClose={() => setAddModal(false)} title="Start a New Goal">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5">
            {PRESET_GOALS.map((p) => (
              <button
                key={p}
                onClick={() => handleAdd(p)}
                disabled={adding}
                className="w-full px-3 py-3 rounded-full wf-glow text-[13px] font-semibold text-white text-center truncate active:scale-95 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 last:odd:col-span-2"
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex-1 min-w-0"><Input
              value={customGoal}
              onChange={(e) => setCustomGoal(e.target.value)}
              placeholder="Custom goal (a few words)"
              maxLength={40}
              className="!rounded-full !px-5 wf-glow"
            /></div>
            <Button disabled={!customGoal.trim()} loading={adding} onClick={() => handleAdd(customGoal)} className="!rounded-full !px-7 wf-cta">
              Add
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!detailGoal} onClose={() => setDetailGoal(null)} title={detailGoal?.label ?? ''}>
        {detailGoal && (
          <div className="space-y-4">
            <div className="flex flex-col items-center py-4">
              <div className="w-28 h-28 rounded-full wf-round flex flex-col items-center justify-center">
                <Flame className="w-5 h-5 text-accent mb-1" />
                <span className="text-2xl font-black text-white">{Math.floor(Math.max(0, now - toMillis(detailGoal.startedAt)) / 86400000)}</span>
                <span className="text-[9px] text-text-tertiary uppercase tracking-wide">days</span>
              </div>
              <p className="text-xs text-text-tertiary mt-3">{formatElapsed(now - toMillis(detailGoal.startedAt))} and counting</p>
            </div>
            <div className="p-3 rounded-2xl wf-glow flex items-start gap-2">
              <Quote className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
              <p className="text-xs text-text-secondary italic leading-relaxed">{quote}</p>
            </div>
            <Button fullWidth variant="secondary" loading={busy} onClick={handleReset}>
              <RotateCcw className="w-4 h-4" /> Reset Timer
            </Button>
            <Button fullWidth variant="ghost" loading={busy} onClick={handleDelete}>
              <Trash2 className="w-4 h-4" /> Delete Goal
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
