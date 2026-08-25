'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Swords, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { StrengthInputs, StrengthResult } from '@/lib/strengthScore';
import { saveStrengthScoreResult } from '@/lib/strengthScoreStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StrengthScoreResultView } from '@/components/strength-score/StrengthScoreResultView';
import { StrengthScoreShareCard } from '@/components/strength-score/StrengthScoreShareCard';
import { StrengthTestForm } from '@/components/strength-score/StrengthTestForm';

export function StrengthScoreClient() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [entry, setEntry] = useState<{ inputs: StrengthInputs; result: StrengthResult } | null>(null);
  const [showName, setShowName] = useState(true);
  const [saving, setSaving] = useState<'result' | 'challenge' | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedAsChallenge, setSavedAsChallenge] = useState(false);

  async function handleSave(asChallenge: boolean) {
    if (!entry) return;
    setSaving(asChallenge ? 'challenge' : 'result');
    try {
      const displayName = showName ? (profile?.displayName || null) : null;
      const id = await saveStrengthScoreResult(entry.inputs, entry.result, {
        displayName, userId: user?.uid ?? null, isChallenge: false,
      });
      setSavedId(id);
      setSavedAsChallenge(asChallenge);
    } catch {
      toast.error('Could not save result — try again');
    } finally {
      setSaving(null);
    }
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com').replace(/\/$/, '');
  const resultUrl = savedId ? `${appUrl}/strength-score/result/${savedId}` : '';
  const challengeUrl = savedId ? `${appUrl}/strength-score/challenge/${savedId}` : '';

  if (entry && savedId) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <StrengthScoreResultView result={entry.result} displayName={showName ? profile?.displayName : null} sex={entry.inputs.sex} />
        <StrengthScoreShareCard
          result={entry.result}
          displayName={showName ? profile?.displayName : null}
          shareUrl={savedAsChallenge ? challengeUrl : resultUrl}
          shareText={`I just scored ${entry.result.score}/100 on the Warfare Strength Test — think you can beat me?`}
        />
        <Card className="p-4 space-y-2">
          <Button variant="secondary" fullWidth onClick={() => handleSave(true)} loading={saving === 'challenge'}>
            <Swords className="w-4 h-4" /> Challenge a Friend
          </Button>
          {savedAsChallenge && challengeUrl && (
            <p className="text-xs text-text-tertiary text-center break-all">{challengeUrl}</p>
          )}
        </Card>
        <Card className="p-5 text-center space-y-3">
          <p className="text-sm font-bold text-white">Want to actually increase this score?</p>
          <p className="text-xs text-text-secondary">Get an AI-powered training plan built around your body, goals and current strength.</p>
          <Button fullWidth size="lg" onClick={() => router.push('/register')}>
            Build My Plan <ArrowRight className="w-4 h-4" />
          </Button>
        </Card>
        <button
          onClick={() => { setEntry(null); setSavedId(null); }}
          className="w-full text-center text-xs text-text-tertiary hover:text-white transition-colors py-2"
        >
          Take the test again
        </button>
      </div>
    );
  }

  if (entry) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <StrengthScoreResultView result={entry.result} displayName={showName ? profile?.displayName : null} sex={entry.inputs.sex} />
        <Card className="p-4 space-y-3">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} className="rounded" />
            Show my name on the shared result
          </label>
          <Button fullWidth size="lg" onClick={() => handleSave(false)} loading={saving === 'result'}>
            Save &amp; Get Shareable Link
          </Button>
        </Card>
        <button
          onClick={() => setEntry(null)}
          className="w-full text-center text-xs text-text-tertiary hover:text-white transition-colors py-2"
        >
          ← Back to edit
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
        <h1 className="text-3xl font-black text-white tracking-tight">HOW STRONG ARE YOU?</h1>
        <p className="text-sm text-text-secondary mt-2">
          Find out how you compare to people your age, weight and experience level.
        </p>
      </motion.div>

      <StrengthTestForm onCalculate={(inputs, result) => setEntry({ inputs, result })} />

      <p className="text-center text-xs text-text-tertiary mt-6">
        Already have an account? <Link href="/login" className="text-accent font-medium">Sign in</Link> to track your score over time.
      </p>
    </div>
  );
}
