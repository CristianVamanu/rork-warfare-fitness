'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Hash, ChevronRight, Users, Clock, Trophy, Zap, Dumbbell, Flame, Medal, Radio, Sparkles, Award, Target } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getChannels, subscribeLeaderboard, subscribeNearbyLeaderboard, subscribeCommunityActivity, type LeaderboardEntry, type CommunityActivity, type CommunityActivityType } from '@/lib/firestore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { QuestBadgeRow } from '@/components/ui/QuestBadgeRow';
import { PaywallGate } from '@/components/ui/PaywallGate';
import Link from 'next/link';
import type { Channel } from '@/types';

export default function CommunityPage() {
  return (
    <Suspense fallback={null}>
      <CommunityPageInner />
    </Suspense>
  );
}

function CommunityPageInner() {
  const { trainerId, user, profile } = useAuth();
  // Trainer/admin users don't have trainerId on their own doc — use their uid as the tenant root
  const effectiveTrainerId = trainerId ?? ((profile?.role === 'admin' || profile?.role === 'trainer') ? user?.uid : null) ?? null;
  const [channels, setChannels] = useState<Channel[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lbLoading, setLbLoading] = useState(true);
  // Default to "Near You" for anyone who's actually trained — a global
  // top-10 dominated by outliers motivates less than seeing people at a
  // similar level. Brand-new users (powerLevel 0) start on Global since
  // "near you" at level 0 is meaningless.
  const [lbScope, setLbScope] = useState<'global' | 'nearby'>('nearby');
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'channels' | 'leaderboard' | 'live'>(
    searchParams.get('tab') === 'leaderboard' ? 'leaderboard' : searchParams.get('tab') === 'live' ? 'live' : 'channels'
  );

  // Live Activity — "what's happening right now" across the whole
  // community, distinct from the Leaderboard's "who's ranked where".
  // Deliberately NOT auto-scrolling the list as new items arrive while
  // someone's reading — new items queue behind a "N new" banner instead,
  // same as the spec's "don't make the page constantly jump" requirement.
  const [liveItems, setLiveItems] = useState<CommunityActivity[]>([]);
  const [liveLoading, setLiveLoading] = useState(true);
  const [visibleLiveIds, setVisibleLiveIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (tab !== 'live') return;
    setLiveLoading(true);
    const unsub = subscribeCommunityActivity((items) => {
      setLiveItems(items);
      setLiveLoading(false);
      // First load for this tab visit: show everything immediately, no banner.
      setVisibleLiveIds((prev) => prev ?? new Set(items.map((i) => i.id)));
    }, 30);
    return unsub;
  }, [tab]);
  const newLiveCount = visibleLiveIds ? liveItems.filter((i) => !visibleLiveIds.has(i.id)).length : 0;
  useEffect(() => {
    getChannels(effectiveTrainerId ?? undefined)
      .then(setChannels)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [effectiveTrainerId]);

  useEffect(() => {
    if (lbScope === 'global' || !(profile?.powerLevel ?? 0)) {
      setLbLoading(true);
      const unsub = subscribeLeaderboard((entries) => {
        setLeaderboard(entries);
        setLbLoading(false);
      }, 10);
      return unsub;
    }
    setLbLoading(true);
    const unsub = subscribeNearbyLeaderboard(profile?.powerLevel ?? 0, (entries) => {
      setLeaderboard(entries);
      setLbLoading(false);
    }, 10);
    return unsub;
  }, [lbScope, profile?.powerLevel]);

  const medalColors = [
    'bg-yellow-400 text-black',
    'bg-gray-300 text-black',
    'bg-amber-600 text-white',
  ];
  const medals = ['🥇', '🥈', '🥉'];

  const ACTIVITY_ICON: Record<CommunityActivityType, typeof Flame> = {
    workout: Flame, program_day: Flame, program_completed: Award,
    pr: Dumbbell, achievement: Trophy, quest: Target, streak: Flame,
  };
  function timeAgo(ts: unknown): string {
    const d = (ts as { toDate?: () => Date })?.toDate?.();
    if (!d) return 'just now';
    const m = Math.floor((Date.now() - d.getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  return (
    <div>
      <Header title="Community" />
      <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
        {/* Tab switcher */}
        <div className="grid grid-cols-3 gap-1 bg-surface rounded-xl p-1">
          {(['channels', 'live', 'leaderboard'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-2 text-xs sm:text-sm font-medium rounded-lg transition-all ${
                tab === t ? 'bg-surface-elevated text-white' : 'text-text-secondary'
              }`}
            >
              {t === 'leaderboard' ? '🏆 Leaderboard' : t === 'live' ? '📡 Live' : '# Channels'}
            </button>
          ))}
        </div>

        <Link href="/community/prs">
          <Card className="p-3.5 flex items-center gap-3 hover:border-accent/30 transition-colors">
            <div className="w-9 h-9 rounded-xl bg-accent-muted flex items-center justify-center flex-shrink-0">
              <Medal className="w-4.5 h-4.5 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">PR Wall</p>
              <p className="text-xs text-text-secondary">Post proof of your lifts, get verified</p>
            </div>
            <ChevronRight className="w-4 h-4 text-text-tertiary flex-shrink-0" />
          </Card>
        </Link>

        {/* Channels tab */}
        {tab === 'channels' && (
          <PaywallGate feature="community" noTaste>
            {loading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
            ) : channels.length === 0 ? (
              <Card className="p-10 text-center">
                <Hash className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
                <p className="text-white font-bold">No channels yet</p>
                <p className="text-text-secondary text-sm mt-1">Channels will appear here soon.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {channels.map((ch, i) => (
                  <motion.div key={ch.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <Link href={`/community/${ch.id}`}>
                      <Card className="p-4 hover:border-accent/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center text-xl flex-shrink-0">
                            {ch.emoji || '#'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white"># {ch.name}</p>
                            {ch.description && <p className="text-xs text-text-secondary truncate mt-0.5">{ch.description}</p>}
                            <div className="flex items-center gap-3 mt-1">
                              <span className="flex items-center gap-1 text-xs text-text-tertiary">
                                <Users className="w-3 h-3" /> {ch.postCount} posts
                              </span>
                              {ch.slowModeDays > 0 && (
                                <span className="flex items-center gap-1 text-xs text-text-tertiary">
                                  <Clock className="w-3 h-3" /> Slow mode: {ch.slowModeDays}d
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                        </div>
                      </Card>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </PaywallGate>
        )}

        {/* Live Activity tab — "what's happening right now" across the
            community, chronological, distinct from the Leaderboard's
            ranking view. Public, minimal (name + activity + relative time
            only) — never anything beyond what src/lib/firestore.ts's
            postCommunityActivity itself writes. */}
        {tab === 'live' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-accent" />
              <h2 className="text-base font-bold text-white">Live Activity</h2>
              <span className="text-xs text-text-tertiary ml-auto">Live</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            </div>

            {newLiveCount > 0 && (
              <button
                onClick={() => setVisibleLiveIds(new Set(liveItems.map((i) => i.id)))}
                className="w-full py-2 rounded-xl bg-accent/15 text-accent text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-accent/20 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" /> {newLiveCount} new activit{newLiveCount === 1 ? 'y' : 'ies'} — tap to show
              </button>
            )}

            {liveLoading ? (
              <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
            ) : liveItems.filter((i) => visibleLiveIds?.has(i.id)).length === 0 ? (
              <Card className="p-10 text-center">
                <Radio className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
                <p className="text-white font-bold">Nothing yet</p>
                <p className="text-text-secondary text-sm mt-1">Your community activity will appear here as Warriors complete workouts, challenges and achievements.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {liveItems.filter((i) => visibleLiveIds?.has(i.id)).map((item, i) => {
                  const Icon = ACTIVITY_ICON[item.type];
                  return (
                    <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                      <Card className="p-3.5 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-accent-muted flex items-center justify-center flex-shrink-0">
                          <Icon className="w-4 h-4 text-accent" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white">
                            <span className="font-bold">{item.displayName}</span> {item.label}
                          </p>
                          <p className="text-xs text-text-tertiary mt-0.5">{timeAgo(item.createdAt)}</p>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Leaderboard tab */}
        {tab === 'leaderboard' && (
          <PaywallGate feature="leaderboard" noTaste>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-accent" />
              <h2 className="text-base font-bold text-white">{lbScope === 'nearby' && (profile?.powerLevel ?? 0) > 0 ? 'Near You' : 'Top Athletes'}</h2>
              <span className="text-xs text-text-tertiary ml-auto">Live</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            </div>

            {(profile?.powerLevel ?? 0) > 0 && (
              <div className="flex gap-1.5">
                {([['nearby', 'Near You'], ['global', 'Global']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setLbScope(value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      lbScope === value ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {lbLoading ? (
              <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
            ) : leaderboard.length === 0 ? (
              <Card className="p-10 text-center">
                <Trophy className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
                <p className="text-white font-bold">No data yet</p>
                <p className="text-text-secondary text-sm mt-1">Complete workouts to appear on the leaderboard.</p>
              </Card>
            ) : leaderboard.map((entry, i) => {
              const isMe = entry.id === user?.uid;
              return (
                <motion.div key={entry.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
                  <Card className={`p-4 ${lbScope === 'global' && i < 3 ? 'border-accent/20' : ''} ${isMe ? 'border-accent/40 bg-accent/5' : ''}`}>
                    <div className="flex items-center gap-3">
                      {/* Rank badge — "Near You" is proximity-sorted, not rank-sorted, so
                          medals (which claim "this is the actual #1/2/3") would be misleading */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${
                        lbScope === 'global' && i < 3 ? medalColors[i] : 'bg-surface-elevated text-text-secondary'
                      }`}>
                        {lbScope === 'global' && i < 3 ? medals[i] : i + 1}
                      </div>

                      {/* Name + stats */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold text-white truncate">{entry.displayName}</p>
                          {isMe && <span className="text-xs text-accent font-medium">(you)</span>}
                          <QuestBadgeRow questIds={entry.questsCompleted} />
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {entry.streak > 0 && (
                            <span className="flex items-center gap-1 text-xs text-text-tertiary">
                              <Flame className="w-3 h-3 text-orange-400" /> {entry.streak}d streak
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-xs text-text-tertiary">
                            <Dumbbell className="w-3 h-3 text-purple-400" /> {entry.totalWorkouts} workouts
                          </span>
                          <span className="flex items-center gap-1 text-xs text-text-tertiary">
                            {entry.totalWeightLifted.toLocaleString()}kg
                          </span>
                        </div>
                      </div>

                      {/* XP */}
                      <div className="text-right flex-shrink-0">
                        <div className="flex items-center gap-1 justify-end">
                          <Zap className="w-3.5 h-3.5 text-accent" />
                          <p className="text-sm font-black text-accent">{entry.xp.toLocaleString()}</p>
                        </div>
                        <p className="text-xs text-text-tertiary">XP · Lvl {entry.powerLevel}</p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
          </PaywallGate>
        )}
      </div>
    </div>
  );
}
