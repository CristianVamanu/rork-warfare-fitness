'use client';

import { useState, useEffect } from 'react';
import { Ban, Plus, RotateCcw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { addDaysWithoutGoal, resetDaysWithoutGoal, deleteDaysWithoutGoal } from '@/lib/firestore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import type { DaysWithoutGoal } from '@/types';
import type { Timestamp } from 'firebase/firestore';

const PRESET_GOALS = ['Smoking', 'Alcohol', 'Porn', 'Junk Food', 'Social Media'];

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
          <div className="space-y-1.5">
            {goals.map((g) => (
              <button
                key={g.id}
                onClick={() => setDetailGoal(g)}
                className="w-full flex items-center justify-between p-2.5 bg-surface-elevated rounded-xl hover:bg-white/5 transition-colors"
              >
                <span className="text-xs text-text-secondary truncate">{g.label}</span>
                <span className="text-sm font-bold text-white flex-shrink-0">{formatElapsed(now - toMillis(g.startedAt))}</span>
              </button>
            ))}
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
            <div className="text-center py-4">
              <p className="text-3xl font-black text-white">{formatElapsed(now - toMillis(detailGoal.startedAt))}</p>
              <p className="text-xs text-text-tertiary mt-1">and counting</p>
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
