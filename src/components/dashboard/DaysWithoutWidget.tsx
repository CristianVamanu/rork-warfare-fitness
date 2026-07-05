'use client';

import { useState, useEffect, useMemo } from 'react';
import { Ban, Plus, RotateCcw, Trash2, Flame, Quote } from 'lucide-react';
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
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-danger/10">
              <Ban className="w-4 h-4 text-danger" />
            </div>
            <p className="text-sm font-bold text-white">Days Without</p>
          </div>
          <button onClick={() => setAddModal(true)} className="p-1.5 rounded-lg hover:bg-white/5 text-text-secondary hover:text-white transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {goals.length === 0 ? (
          <button onClick={() => setAddModal(true)} className="w-full text-left">
            <p className="text-xs text-text-secondary">Track a habit you&apos;re quitting — tap + to add one.</p>
          </button>
        ) : (
          <div className="space-y-2">
            {goals.map((g) => {
              const elapsedMs = now - toMillis(g.startedAt);
              const days = Math.floor(elapsedMs / 86400000);
              return (
                <button
                  key={g.id}
                  onClick={() => setDetailGoal(g)}
                  className="w-full flex items-center gap-3 p-3 bg-gradient-to-br from-danger/5 via-surface-elevated to-surface-elevated rounded-xl hover:bg-white/5 transition-colors"
                >
                  <div className="w-11 h-11 rounded-full bg-danger/10 border-2 border-danger/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-black text-danger">{days}</span>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-bold text-white truncate">{g.label}</p>
                    <p className="text-[10px] text-text-tertiary">{formatElapsed(elapsedMs)} clean</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Modal open={addModal} onClose={() => setAddModal(false)} title="Start a New Goal">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESET_GOALS.map((p) => (
              <button
                key={p}
                onClick={() => handleAdd(p)}
                disabled={adding}
                className="px-3 py-2 rounded-full border border-white/10 bg-surface hover:border-accent/40 text-xs text-white transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={customGoal}
              onChange={(e) => setCustomGoal(e.target.value)}
              placeholder="Custom goal (a few words)"
              maxLength={40}
            />
            <Button disabled={!customGoal.trim()} loading={adding} onClick={() => handleAdd(customGoal)}>
              Add
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!detailGoal} onClose={() => setDetailGoal(null)} title={detailGoal?.label ?? ''}>
        {detailGoal && (
          <div className="space-y-4">
            <div className="flex flex-col items-center py-4">
              <div className="w-28 h-28 rounded-full bg-danger/10 border-4 border-danger/30 flex flex-col items-center justify-center">
                <Flame className="w-5 h-5 text-danger mb-1" />
                <span className="text-2xl font-black text-white">{Math.floor((now - toMillis(detailGoal.startedAt)) / 86400000)}</span>
                <span className="text-[9px] text-text-tertiary uppercase tracking-wide">days</span>
              </div>
              <p className="text-xs text-text-tertiary mt-3">{formatElapsed(now - toMillis(detailGoal.startedAt))} and counting</p>
            </div>
            <div className="p-3 bg-surface-elevated rounded-xl flex items-start gap-2">
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
