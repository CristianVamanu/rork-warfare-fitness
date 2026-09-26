'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Flame, Users, CheckCircle2, ChevronRight, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { PaywallGate } from '@/components/ui/PaywallGate';
import { CommunityTabs } from '@/components/community/CommunityTabs';
import { getChallenges } from '@/lib/challenges';
import { bucket, timeline, DIFFICULTY } from '@/components/community/challengeFormat';
import type { Challenge } from '@/types';

/**
 * The Challenges tab: live first, then upcoming, then the archive. Each card
 * is the cover frame of the challenge's carousel with the numbers that make
 * people tap — how many are in, how many have finished.
 */
export default function ChallengesPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'trainer';
  const [all, setAll] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getChallenges().then(setAll).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const groups = {
    live: all.filter((c) => bucket(c) === 'live'),
    upcoming: all.filter((c) => bucket(c) === 'upcoming'),
    completed: all.filter((c) => bucket(c) === 'completed'),
    draft: isAdmin ? all.filter((c) => bucket(c) === 'draft') : [],
  };

  return (
    <div className="min-h-screen pb-24">
      <Header title="Community" />
      <div className="px-4 pt-4 max-w-2xl mx-auto w-full">
        <CommunityTabs active="challenges" />
      </div>
      <PaywallGate feature="community" noTaste>
        <div className="px-4 py-4 max-w-2xl mx-auto space-y-6">
          {loading ? (
            <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}</div>
          ) : all.length === 0 ? (
            <Card className="p-10 text-center">
              <Flame className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
              <p className="text-white font-bold">No challenges yet</p>
              <p className="text-text-secondary text-sm mt-1">The first one drops soon. Be ready.</p>
            </Card>
          ) : (
            <>
              <Section title="Live now" items={groups.live} emphasis />
              <Section title="Coming up" items={groups.upcoming} />
              <Section title="Completed" items={groups.completed} />
              {isAdmin && <Section title="Drafts (only you see these)" items={groups.draft} />}
            </>
          )}
        </div>
      </PaywallGate>
    </div>
  );
}

function Section({ title, items, emphasis = false }: { title: string; items: Challenge[]; emphasis?: boolean }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className={`text-xs font-bold uppercase tracking-[0.18em] mb-2.5 ${emphasis ? 'text-accent' : 'text-text-tertiary'}`}>{title}</h2>
      <div className="space-y-3">
        {items.map((c, i) => <ChallengeCard key={c.id} c={c} index={i} />)}
      </div>
    </section>
  );
}

function ChallengeCard({ c, index }: { c: Challenge; index: number }) {
  const cover = c.media?.[0];
  const when = timeline(c);
  const state = bucket(c);
  const diff = DIFFICULTY[c.difficulty] ?? DIFFICULTY.standard;
  return (
    <div className="wf-rise" style={{ animationDelay: `${index * 0.05}s` }}>
      <Link href={`/community/challenges/${c.id}`}>
        <Card className="overflow-hidden hover:border-accent/30 transition-colors card-float">
          {/* Cover: the first carousel frame, cropped to a wide band so the
              list stays a list. The full 4:5 shows on the detail page. */}
          <div className="relative aspect-[16/9] bg-black">
            {cover ? (
              cover.type === 'video'
                ? <video src={cover.url} poster={cover.posterURL} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={cover.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(var(--accent-rgb) / 0.3), rgba(0,0,0,0.6) 100%)' }} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
            <div className="absolute top-3 left-3 flex items-center gap-2">
              {state === 'live' && (
                <span className="px-2 py-0.5 rounded-full bg-accent text-black text-[10px] font-black tracking-wider uppercase shadow-glow-sm">Live</span>
              )}
              {state === 'upcoming' && <span className="px-2 py-0.5 rounded-full bg-white/15 backdrop-blur text-white text-[10px] font-bold tracking-wider uppercase">Soon</span>}
              {state === 'completed' && <span className="px-2 py-0.5 rounded-full bg-white/10 backdrop-blur text-text-secondary text-[10px] font-bold tracking-wider uppercase">Closed</span>}
              {state === 'draft' && <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-bold tracking-wider uppercase flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Draft</span>}
            </div>
            <div className="absolute top-3 right-3 flex items-center gap-0.5" aria-label={diff.label} title={diff.label}>
              {[1, 2, 3].map((n) => <span key={n} className={`w-1.5 h-3 rounded-sm ${n <= diff.bars ? 'bg-accent' : 'bg-white/20'}`} />)}
            </div>
            <div className="absolute bottom-3 left-4 right-4">
              {c.category && <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent mb-0.5">{c.category}</p>}
              <p className="text-xl font-black text-white leading-tight">{c.title}</p>
            </div>
          </div>
          <div className="px-4 py-3 flex items-center gap-4 text-xs text-text-secondary">
            <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {c.entryCount ?? 0} entered</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> {c.verifiedCount ?? 0} finished</span>
            {when && <span className="ml-auto text-text-tertiary">{when}</span>}
            <ChevronRight className="w-4 h-4 text-text-tertiary" />
          </div>
        </Card>
      </Link>
    </div>
  );
}
