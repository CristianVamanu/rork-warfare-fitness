'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Share2 } from 'lucide-react';
import { toBlob } from 'html-to-image';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import type { StrengthResult } from '@/lib/strengthScore';

// Same share-image approach as WorkoutShareCard.tsx (html-to-image, already
// a project dependency) — deliberately not introducing a server-side image
// generation service just for this.
export function StrengthScoreShareCard({
  result, displayName, shareUrl, shareText,
}: {
  result: StrengthResult;
  displayName?: string | null;
  shareUrl: string;
  shareText: string;
}) {
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const blob = cardRef.current ? await toBlob(cardRef.current, { pixelRatio: 2 }).catch(() => null) : null;
      const file = blob ? new File([blob], 'warfare-strength-score.png', { type: 'image/png' }) : null;

      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          if (file && navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], text: shareText, url: shareUrl });
          } else {
            await navigator.share({ text: shareText, url: shareUrl });
          }
          return;
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return;
        }
      }

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
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
        toast.success('Copied to clipboard!');
        return;
      }
      throw new Error('Sharing not supported on this device');
    } catch {
      toast.error("Couldn't share — try copying the link instead");
    } finally {
      setSharing(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied!');
    } catch {
      toast.error('Could not copy link');
    }
  };

  const liftLine = (label: string, kg?: number) => kg ? `${label.toUpperCase()} ${kg}KG` : null;
  const liftLines = [
    liftLine('Squat', result.liftScores.find((l) => l.key === 'squat')?.valueKg),
    liftLine('Bench', result.liftScores.find((l) => l.key === 'bench')?.valueKg),
    liftLine('Deadlift', result.liftScores.find((l) => l.key === 'deadlift')?.valueKg),
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-3">
      <motion.div
        ref={cardRef}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.35 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] border border-accent/30 p-6 text-center"
      >
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-accent/10 rounded-full blur-2xl" />
        <p className="text-xs font-bold text-accent tracking-[0.2em] uppercase mb-4">Warfare Fitness</p>
        <p className="text-xs text-text-tertiary tracking-widest uppercase mb-1">
          {displayName ? `${displayName}'s Warfare Score` : 'My Warfare Score'}
        </p>
        <p className="text-7xl font-black text-white leading-none mb-2">{result.score}</p>
        <p className="text-sm text-white/80 mb-4">
          Stronger than <span className="text-accent font-bold">{result.percentile}%</span> of people my age
        </p>
        <div className="flex flex-col gap-1 mb-4">
          {liftLines.map((line) => (
            <p key={line} className="text-xs font-bold text-white/90 tracking-wide">{line}</p>
          ))}
        </div>
        <p className="text-sm font-black text-accent tracking-wide">{result.classification}</p>
        <div className="mt-5 pt-3 border-t border-white/10">
          <p className="text-[10px] text-text-tertiary tracking-wide">TAKE THE TEST → warfarefitness.com/strength-score</p>
        </div>
      </motion.div>

      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={copyLink}>Copy Link</Button>
        <Button fullWidth loading={sharing} onClick={handleShare}>
          <Share2 className="w-4 h-4" /> Share Result
        </Button>
      </div>
    </div>
  );
}
