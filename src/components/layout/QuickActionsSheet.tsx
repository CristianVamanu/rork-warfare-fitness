'use client';

/**
 * The quick actions, as a bottom sheet behind the centre nav button. They
 * used to be an 8-tile grid in the middle of Home; here they are one tap
 * away from every screen, and Home is shorter. Workout leads, full width,
 * because starting a session is what the centre button used to do.
 */
import { useEffect } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Dumbbell, Apple, Camera, CheckSquare, Sparkles, TrendingUp, Trophy, Swords, X, Play } from 'lucide-react';

const ACTIONS = [
  { icon: Apple, label: 'Log food', href: '/nutrition' },
  { icon: Camera, label: 'Scan & Go', href: '/training/scan-go' },
  { icon: CheckSquare, label: 'Habits', href: '/habits' },
  { icon: Sparkles, label: 'Meal ideas', href: '/nutrition/meal-planner' },
  { icon: TrendingUp, label: 'Progress', href: '/progress' },
  { icon: Trophy, label: 'Achievements', href: '/achievements' },
  { icon: Swords, label: 'Quests', href: '/quests' },
  { icon: Dumbbell, label: 'All programs', href: '/programs' },
];

export function QuickActionsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="bg" className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div key="sheet" role="dialog" aria-modal="true" aria-label="Quick actions"
            className="wf-dark fixed inset-x-0 bottom-0 z-[61] mx-auto max-w-lg rounded-t-[28px] px-4 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))]"
            style={{ background: 'linear-gradient(180deg, #17130e, #0b0a09)', borderTop: '1px solid rgba(245,166,35,0.45)', boxShadow: '0 -10px 40px rgba(0,0,0,.6), 0 -2px 24px rgba(245,166,35,0.18)' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />
            <div className="flex items-center justify-between mb-3">
              <p className="text-[15px] font-bold text-white">Quick actions</p>
              <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center border border-white/10 text-white/70"><X className="w-4 h-4" /></button>
            </div>
            <Link href="/training" onClick={onClose} className="flex items-center justify-center gap-2 h-[52px] rounded-2xl text-[14px] font-bold text-black active:scale-[.98] transition-transform"
              style={{ background: 'linear-gradient(180deg, #FFBA4D, #F59A1F)', boxShadow: '0 0 18px rgba(245,150,30,0.55)' }}>
              <Play className="w-4 h-4 fill-black" /> Start workout
            </Link>
            <div className="grid grid-cols-4 gap-2.5 mt-3">
              {ACTIONS.map((a) => (
                <Link key={a.label} href={a.href} onClick={onClose} className="wf-glow rounded-[18px] h-[84px] flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform">
                  <a.icon className="w-6 h-6 text-white" strokeWidth={1.6} style={{ filter: 'drop-shadow(0 0 6px rgba(245,166,35,0.35))' }} />
                  <span className="text-[10px] font-semibold text-white/85 text-center leading-tight px-1">{a.label}</span>
                </Link>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
