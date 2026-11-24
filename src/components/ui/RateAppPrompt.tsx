'use client';

/**
 * "Enjoying Warfare Fitness?" Asked once per account, on Home, after a few
 * finished workouts (never mid-session, never to brand-new members).
 *
 * Happy members are sent to the Play Store to rate. Unhappy ones get a
 * private box instead, which lands in Admin → Support, so a problem reaches
 * us before it becomes a public one-star review. Everyone is free to review
 * on the store either way; this only decides which door is shown first.
 */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ThumbsUp, ThumbsDown, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { createSupportTicket } from '@/lib/firestore';
import { PLAY_STORE_URL } from '@/lib/storeLinks';
import { Modal } from './Modal';
import { Button } from './Button';

/** Finished workouts before we ask. */
const MIN_WORKOUTS = 3;

type Step = 'ask' | 'happy' | 'unhappy' | 'sent';

export function RateAppPrompt() {
  const { user, profile } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('ask');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const p = profile as unknown as {
    role?: string; ratingPromptAt?: unknown; welcomeVideoSeenAt?: unknown;
    statsCache?: { totalWorkouts?: number }; displayName?: string; email?: string;
  } | null;
  const workouts = p?.statsCache?.totalWorkouts ?? 0;
  const eligible = !!user && !!p && p.role !== 'admin' && p.role !== 'trainer'
    && !p.ratingPromptAt && workouts >= MIN_WORKOUTS && pathname === '/dashboard';

  // A short pause so it never lands on top of the page still loading.
  useEffect(() => {
    if (!eligible || open) return;
    const t = setTimeout(() => setOpen(true), 2500);
    return () => clearTimeout(t);
  }, [eligible, open]);

  async function markAsked(answer: string) {
    if (!user) return;
    try { await updateDoc(doc(db, 'users', user.uid), { ratingPromptAt: serverTimestamp(), ratingPromptAnswer: answer }); }
    catch { /* worst case it asks once more */ }
  }

  function close(answer = 'dismissed') { setOpen(false); void markAsked(answer); }

  async function sendFeedback() {
    if (!user || !text.trim() || busy) return;
    setBusy(true);
    try {
      await createSupportTicket(user.uid, p?.displayName || 'Member', user.email || p?.email || '', 'App feedback', text.trim().slice(0, 2000));
      setStep('sent'); void markAsked('feedback');
    } catch {
      toast.error('Could not send that. Try again.');
    } finally { setBusy(false); }
  }

  if (!open) return null;

  return (
    <Modal open={open} onClose={() => close(step === 'ask' ? 'dismissed' : step)} title={step === 'ask' ? 'Enjoying Warfare Fitness?' : step === 'happy' ? 'That means a lot' : step === 'unhappy' ? 'Tell us what is wrong' : 'Thank you'}>
      {step === 'ask' && (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">You have finished {workouts} workouts. How is the app working for you so far?</p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => { setStep('happy'); void markAsked('happy'); }} className="rounded-2xl border border-accent/40 bg-accent/10 p-4 flex flex-col items-center gap-2 text-white font-bold text-sm hover:bg-accent/15">
              <ThumbsUp className="w-6 h-6 text-accent" /> Loving it
            </button>
            <button type="button" onClick={() => setStep('unhappy')} className="rounded-2xl border border-white/10 bg-surface p-4 flex flex-col items-center gap-2 text-white font-bold text-sm hover:bg-white/5">
              <ThumbsDown className="w-6 h-6 text-text-secondary" /> Could be better
            </button>
          </div>
          <button type="button" onClick={() => close()} className="w-full text-xs text-text-tertiary hover:text-white">Not now</button>
        </div>
      )}
      {step === 'happy' && (
        <div className="space-y-4 text-center">
          <div className="flex justify-center gap-1">{[0, 1, 2, 3, 4].map((i) => <Star key={i} className="w-7 h-7 text-accent fill-accent" />)}</div>
          <p className="text-sm text-text-secondary">A quick rating on Google Play is the single biggest thing that helps a small app get found. It takes 20 seconds.</p>
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="block">
            <Button fullWidth>Rate on Google Play</Button>
          </a>
          <button type="button" onClick={() => setOpen(false)} className="w-full text-xs text-text-tertiary hover:text-white">Maybe later</button>
        </div>
      )}
      {step === 'unhappy' && (
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">What is getting in your way? This goes straight to the person who builds the app, and we read every one.</p>
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={2000} autoFocus
            placeholder="What went wrong, or what is missing?"
            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
          />
          <Button fullWidth onClick={sendFeedback} loading={busy} disabled={!text.trim()}>Send feedback</Button>
          <button type="button" onClick={() => close('unhappy-skipped')} className="w-full text-xs text-text-tertiary hover:text-white">Skip</button>
        </div>
      )}
      {step === 'sent' && (
        <div className="space-y-4 text-center">
          <p className="text-sm text-text-secondary">Got it. You will find our reply under Support in your profile.</p>
          <Button fullWidth onClick={() => setOpen(false)}>Back to training</Button>
        </div>
      )}
    </Modal>
  );
}
