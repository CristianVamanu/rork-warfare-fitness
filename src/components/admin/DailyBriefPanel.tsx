'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIdToken } from 'firebase/auth';
import toast from 'react-hot-toast';
import { Lightbulb, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Today's daily brief, and a way to replace it.
 *
 * The brief still writes itself: the first dashboard opened on a new day
 * creates the one everybody sees, and nothing here has to run for that to
 * happen. This is for the morning it comes out badly, and for reading what
 * members are currently being shown without opening Firestore.
 */
export function DailyBriefPanel() {
  const { user } = useAuth();
  const [tip, setTip] = useState<string | null>(null);
  const [topic, setTopic] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const call = useCallback(async (method: 'GET' | 'POST') => {
    if (!user) throw new Error('Not signed in');
    const token = await getIdToken(user);
    const res = await fetch('/api/admin/daily-tip', {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    call('GET')
      .then((d) => { setTip(d.tip ?? null); setTopic(d.topic ?? ''); })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [user, call]);

  async function regenerate() {
    setBusy(true);
    try {
      const d = await call('POST');
      setTip(d.tip);
      toast.success('New brief written');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not write a new brief');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 lg:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-accent" /> Today&apos;s brief
          </h2>
          <p className="text-xs text-text-secondary mt-1">
            Written automatically each morning and shown on every member&apos;s dashboard.
            {topic && <> Today&apos;s subject is {topic}.</>}
          </p>
        </div>
        <Button size="sm" variant="secondary" loading={busy} onClick={regenerate}>
          <RefreshCw className="w-4 h-4" /> Write a new one
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-12 rounded-xl" />
      ) : tip ? (
        <p className="text-sm text-white bg-surface border border-white/8 rounded-xl px-3.5 py-3 leading-relaxed">
          {tip}
        </p>
      ) : (
        // Not an error. The brief is written on demand, so before anyone has
        // opened the dashboard today there is genuinely nothing to show.
        <p className="text-sm text-text-tertiary bg-surface border border-white/8 rounded-xl px-3.5 py-3">
          Nothing yet today. It gets written the first time a member opens their dashboard, or you
          can write one now.
        </p>
      )}

      <p className="text-[11px] text-text-tertiary leading-relaxed">
        A new one avoids the wording of the last few days, and of the one it replaces. Members who
        already loaded the dashboard pick it up within half an hour rather than at midnight.
      </p>
    </Card>
  );
}
