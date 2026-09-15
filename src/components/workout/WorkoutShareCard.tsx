'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Share2, ArrowRight, Zap, Flame, Star } from 'lucide-react';
import { toBlob } from 'html-to-image';
import { Button } from '@/components/ui/Button';
import { getLevelTitle } from '@/lib/xp';
import { ACHIEVEMENT_DEFS } from '@/lib/achievements';
import { QUEST_DEFS } from '@/lib/quests';
import { pickWeightComparison, comparisonPhrase, comparisonImageUrl } from '@/lib/weightComparison';
import toast from 'react-hot-toast';

interface Props {
  duration: number;
  completedSets: number;
  exerciseCount: number;
  xpEarned: number;
  newPowerLevel: number;
  streak: number;
  newAchievements: string[];
  newQuests?: string[];
  /** Always kilograms — see actions.ts. Undefined only for a call site that
   * predates this prop; the comparison line simply doesn't render then. */
  totalWeightLifted?: number;
  onContinue: () => void;
}

export function WorkoutShareCard({
  duration,
  completedSets,
  exerciseCount,
  xpEarned,
  newPowerLevel,
  streak,
  newAchievements,
  newQuests = [],
  totalWeightLifted,
  onContinue,
}: Props) {
  const levelTitle = getLevelTitle(newPowerLevel);
  const [sharing, setSharing] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Seeded on the weight itself (see weightComparison.ts) rather than
  // re-rolled on every render — the on-screen card and the rasterized share
  // image must agree, and a fresh random pick on each paint could make them
  // diverge if the component re-renders between "shown" and "shared".
  const comparison = totalWeightLifted ? pickWeightComparison(totalWeightLifted) : null;
  const useImage = !!comparison && !imageFailed;

  /** "Sports Car" -> "Sports Cars", "School Bus" -> "School Buses". Same rule
   * as comparisonPhrase's, applied to the display-cased label. */
  function pluralLabel(label: string): string {
    return /[sxz]$|[cs]h$/i.test(label) ? `${label}es` : `${label}s`;
  }

  // NEXT_PUBLIC_ env vars are inlined at build time, so this is safe to read
  // client-side too — matches the same fallback used in the root layout.
  // The old hardcoded "warfare.fit" was simply the wrong domain (the real
  // site is warfarefitness.com), so every shared card linked nowhere.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com').replace(/^https?:\/\//, '');

  const shareText =
    `💪 Just finished a ${duration}-min workout!\n` +
    `${exerciseCount} exercises · ${completedSets} sets · ${xpEarned} XP earned\n` +
    `${comparison ? `That's ${comparisonPhrase(comparison)} 💥\n` : ''}` +
    `${streak > 0 ? `🔥 ${streak}-day streak\n` : ''}` +
    `Fitness Level ${newPowerLevel} · ${levelTitle}\n\n` +
    `Join me on Warfare Fitness → ${appUrl}`;

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      // Render the branded card itself to an image — a real image is what
      // actually gets reposted to a story/feed, unlike a plain text blob.
      const blob = cardRef.current ? await toBlob(cardRef.current, { pixelRatio: 2 }).catch(() => null) : null;
      const file = blob ? new File([blob], 'warfare-fitness-workout.png', { type: 'image/png' }) : null;

      // navigator.share exists in some in-app/PWA webviews but throws
      // synchronously (not just rejects) when the platform doesn't actually
      // support sharing — wrap the whole thing, not just the promise.
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          if (file && navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], text: shareText });
          } else {
            await navigator.share({ text: shareText });
          }
          return;
        } catch (err) {
          // User cancelling the native share sheet throws AbortError — not a
          // real failure, so don't fall through to the clipboard/error path.
          if (err instanceof Error && err.name === 'AbortError') return;
        }
      }

      // No native share sheet (most desktop browsers) — download the image
      // so the user can still post it manually, since a plain-text clipboard
      // paste doesn't carry the branded card.
      if (file) {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Image saved — share it anywhere!');
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        toast.success('Copied to clipboard!');
        return;
      }
      throw new Error('Sharing not supported on this device');
    } catch {
      toast.error("Couldn't share — try copying manually");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Card */}
      <motion.div
        ref={cardRef}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.4 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] border border-accent/30 p-5"
      >
        {/* Background glow */}
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-accent/10 rounded-full blur-2xl" />

        {/* Branding — the burning-logo still frame, the same mark used on
            the landing page and every loading screen. A plain <img>, not
            next/image: this element gets rasterized by html-to-image on
            share, and the optimizer's proxied URL plus its lazy-load timing
            is exactly the kind of thing that captures as blank when the
            export fires before the image has actually painted. A small
            static file loaded eagerly has no such race. */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold text-accent tracking-widest uppercase">Warfare Fitness</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/videos/hero-logo-poster.jpg" alt="" loading="eager" className="w-6 h-6 rounded-md object-cover flex-shrink-0" />
        </div>

        {/* Headline */}
        <p className="text-2xl font-black text-white mb-1">Workout Done. ✓</p>
        <p className="text-text-secondary text-sm mb-4">{duration} minute session complete</p>

        {/* "I lifted the weight of a grizzly bear" — the whole point of this
            card existing as a distinct feature. Absent entirely below the
            comparable floor (a bodyweight-only session) rather than showing
            a broken or silly-small comparison; see weightComparison.ts. */}
        {comparison && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="relative rounded-xl border border-accent/[0.18] mb-4 overflow-hidden text-center px-3.5 pt-3.5 pb-2.5"
            /* The fire-lit well: light thrown up from the bottom edge, same
               amber the burning logo is lit with, so the glyph sits INSIDE
               the brand's world rather than on top of it. Inline rather than
               a Tailwind arbitrary value because html-to-image rasterizes
               computed styles — a multi-layer background belongs somewhere
               it can't be purged or reordered. */
            style={{
              background:
                'radial-gradient(ellipse 70% 90% at 50% 105%, rgba(245,166,35,0.42), transparent 62%),' +
                'radial-gradient(ellipse 120% 80% at 50% 120%, rgba(200,60,0,0.30), transparent 70%),' +
                '#0b0b0b',
            }}
          >
            <p className="text-[9.5px] uppercase tracking-[0.2em] text-white/50">I lifted the weight of</p>

            {/* Real artwork when it exists, the lit glyph until then. onError
                covers both "file not added yet" and a broken/renamed file, so
                a missing PNG degrades to the emoji rather than to a broken
                image icon in the middle of something about to be posted. */}
            {useImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={comparisonImageUrl(comparison.object.id)}
                alt={comparison.object.label}
                loading="eager"
                onError={() => setImageFailed(true)}
                className="mx-auto mt-1 max-h-[72px] w-auto object-contain"
                style={{ filter: 'drop-shadow(0 0 18px rgba(245,166,35,0.55)) drop-shadow(0 3px 4px rgba(0,0,0,0.8))' }}
              />
            ) : (
              <motion.p
                className="text-[58px] leading-[1.05] mt-0.5 mb-0"
                style={{ filter: 'drop-shadow(0 0 18px rgba(245,166,35,0.75)) drop-shadow(0 2px 3px rgba(0,0,0,0.8))' }}
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' }}
              >
                {comparison.object.emoji}
              </motion.p>
            )}

            <p className="text-[27px] font-black uppercase leading-none mt-0.5 text-white">
              {comparison.count} {comparison.count === 1 ? comparison.object.label : pluralLabel(comparison.object.label)}
            </p>
            <p className="text-[11px] text-accent tabular-nums mt-1.5">
              {Math.round(totalWeightLifted ?? 0).toLocaleString()} KG MOVED
            </p>
          </motion.div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'Exercises', value: exerciseCount },
            { label: 'Sets Done', value: completedSets },
            { label: 'XP Earned', value: `+${xpEarned}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-lg font-black text-white">{value}</p>
              <p className="text-[10px] text-text-tertiary">{label}</p>
            </div>
          ))}
        </div>

        {/* Power Level */}
        <div className="flex items-center gap-3 p-3 bg-accent/10 border border-accent/20 rounded-xl">
          <Zap className="w-5 h-5 text-accent flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-white">Fitness Level {newPowerLevel}</p>
            <p className="text-xs text-accent">{levelTitle}</p>
          </div>
          {streak > 0 && (
            <div className="ml-auto flex items-center gap-1 text-orange-400">
              <Flame className="w-4 h-4" />
              <span className="text-sm font-bold">{streak}d</span>
            </div>
          )}
        </div>
      </motion.div>

      {/* New achievements */}
      {newAchievements.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-2"
        >
          <p className="text-xs font-bold text-accent tracking-wider uppercase">
            🎉 Achievement{newAchievements.length > 1 ? 's' : ''} Unlocked
          </p>
          {newAchievements.map((id) => {
            const def = ACHIEVEMENT_DEFS.find((d) => d.id === id);
            if (!def) return null;
            return (
              <div key={id} className="flex items-center gap-3 p-3 bg-yellow-400/10 border border-yellow-400/20 rounded-xl">
                <span className="text-2xl">{def.icon}</span>
                <div>
                  <p className="text-sm font-bold text-white">{def.title}</p>
                  <p className="text-xs text-text-secondary">{def.desc}</p>
                </div>
                <Star className="w-4 h-4 text-yellow-400 ml-auto flex-shrink-0" />
              </div>
            );
          })}
        </motion.div>
      )}

      {/* New quests completed */}
      {newQuests.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="space-y-2"
        >
          <p className="text-xs font-bold text-purple-400 tracking-wider uppercase">
            ⚔️ Quest{newQuests.length > 1 ? 's' : ''} Complete
          </p>
          {newQuests.map((id) => {
            const quest = QUEST_DEFS.find((q) => q.id === id);
            if (!quest) return null;
            return (
              <div key={id} className="flex items-center gap-3 p-3 bg-purple-400/10 border border-purple-400/20 rounded-xl">
                <span className="text-2xl">{quest.rewardIcon}</span>
                <div>
                  <p className="text-sm font-bold text-white">{quest.title}</p>
                  <p className="text-xs text-text-secondary">{quest.rewardTitle} earned</p>
                </div>
              </div>
            );
          })}
        </motion.div>
      )}

      {/* Actions — sticky at the bottom of the modal's own scroll area
          (Modal.tsx wraps children in overflow-y-auto) rather than flowing
          after however many achievement/quest cards stacked up. 2+
          achievements previously pushed this off the bottom of the screen
          on mobile with nothing indicating there was more to scroll to —
          effectively stranding the user on this screen with no way to
          continue past it. */}
      <div className="sticky bottom-0 -mx-5 -mb-5 px-5 pb-5 pt-3 flex gap-3 bg-surface-elevated">
        <Button variant="secondary" fullWidth loading={sharing} onClick={handleShare}>
          <Share2 className="w-4 h-4" /> Share
        </Button>
        <Button fullWidth onClick={onContinue}>
          Continue <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
