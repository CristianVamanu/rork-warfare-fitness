'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Activity, Clock } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { logActivityAction } from '@/lib/actions';
import { ACTIVITY_TYPES, ACTIVITY_NOTE_MAX, validateActivity, type ActivityTypeId } from '@/lib/activity';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a successful log so the caller can refresh what it shows. */
  onLogged?: () => void;
}

const QUICK_MINUTES = [20, 30, 45, 60, 90];

/**
 * "I did something else today." Five seconds to fill: pick what, how long,
 * optionally a note and a date. It counts toward the streak and earns a
 * little XP; it never touches the program pointer (see src/lib/activity.ts).
 */
export function LogActivitySheet({ open, onClose, onLogged }: Props) {
  const { user, refreshProfile } = useAuth();
  const today = new Date().toLocaleDateString('sv-SE');
  const [type, setType] = useState<ActivityTypeId>('run');
  const [minutes, setMinutes] = useState<string>('45');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);

  const reset = () => { setType('run'); setMinutes('45'); setNote(''); setDate(today); };

  const submit = async () => {
    if (!user) return;
    const check = validateActivity({ type, minutes: Number(minutes), note, date }, today);
    if (!check.ok) { toast.error(check.error); return; }
    setSaving(true);
    try {
      const res = await logActivityAction(user.uid, check.value);
      toast.success(`Logged · +${res.xpEarned} XP`);
      reset();
      onClose();
      onLogged?.();
      refreshProfile?.();
    } catch (err) {
      console.error('[LogActivity] failed:', err);
      toast.error('Could not save that. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log an activity"
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="flex-1" onClick={submit} loading={saving}>
            <Activity className="w-4 h-4" /> Log it
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-text-secondary">
          A run, a class, a match — anything outside your program. It counts toward your streak and does not move your program day.
        </p>

        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-text-tertiary mb-2">What</p>
          <div className="flex flex-wrap gap-1.5">
            {ACTIVITY_TYPES.map((t) => {
              const on = t.id === type;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  aria-pressed={on}
                  className={`h-9 px-3.5 rounded-full text-xs font-semibold transition-all ${
                    on ? 'bg-accent text-black shadow-glow-sm' : 'text-text-secondary hover:text-white backdrop-blur-xl'
                  }`}
                  style={on ? undefined : { backgroundColor: 'var(--card-glass-bg)', border: '1px solid var(--card-glass-border)' }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-text-tertiary mb-2">How long</p>
          <div className="flex gap-1.5 mb-2">
            {QUICK_MINUTES.map((m) => {
              const on = String(m) === minutes;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMinutes(String(m))}
                  className={`flex-1 h-9 rounded-xl text-xs font-bold tabular-nums transition-colors ${
                    on ? 'bg-accent/15 border border-accent/40 text-accent' : 'bg-white/5 border border-white/8 text-text-secondary hover:text-white'
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Clock className="w-4 h-4 text-text-tertiary absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={600}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-full h-11 pl-10 pr-16 rounded-xl bg-white/5 border border-white/10 text-sm text-white tabular-nums focus:outline-none focus:border-accent/50"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-text-tertiary">minutes</span>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-text-tertiary mb-2">When</p>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="w-full h-11 px-3.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-accent/50 [color-scheme:dark]"
          />
        </div>

        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-text-tertiary mb-2">Note <span className="normal-case tracking-normal font-semibold text-text-tertiary/70">(optional)</span></p>
          <input
            type="text"
            value={note}
            maxLength={ACTIVITY_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Open mat, 5 rounds"
            className="w-full h-11 px-3.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
          />
        </div>
      </div>
    </Modal>
  );
}
