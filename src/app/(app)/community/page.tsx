'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Hash, ChevronRight, Users, Clock, Trophy, Zap, Dumbbell, Flame } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getChannels, subscribeLeaderboard, type LeaderboardEntry } from '@/lib/firestore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { QuestBadgeRow } from '@/components/ui/QuestBadgeRow';
import Link from 'next/link';
import type { Channel } from '@/types';

export default function CommunityPage() {
  const { trainerId, user, profile } = useAuth();
  // Trainer/admin users don't have trainerId on their own doc — use their uid as the tenant root
  const effectiveTrainerId = trainerId ?? ((profile?.role === 'admin' || profile?.role === 'trainer') ? user?.uid : null) ?? null;
  const [channels, setChannels] = useState<Channel[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lbLoading, setLbLoading] = useState(true);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'channels' | 'leaderboard'>(
    searchParams.get('tab') === 'leaderboard' ? 'leaderboard' : 'channels'
  );

  useEffect(() => {
    getChannels(effectiveTrainerId ?? undefined)
      .then(setChannels)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [effectiveTrainerId]);

  useEffect(() => {
    const unsub = subscribeLeaderboard((entries) => {
      setLeaderboard(entries);
      setLbLoading(false);
    }, 10);
    return unsub;
  }, []);

  const medalColors = [
    'bg-yellow-400 text-black',
    'bg-gray-300 text-black',
    'bg-amber-600 text-white',
  ];
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div>
      <Header title="Community" />
      <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
        {/* Tab switcher */}
        <div className="grid grid-cols-2 gap-1 bg-surface rounded-xl p-1">
          {(['channels', 'leaderboard'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-2 text-sm font-medium rounded-lg transition-all capitalize ${
                tab === t ? 'bg-surface-elevated text-white' : 'text-text-secondary'
              }`}
            >
              {t === 'leaderboard' ? '🏆 Leaderboard' : '# Channels'}
            </button>
          ))}
        </div>

        {/* Channels tab */}
        {tab === 'channels' && (
          <>
            {loading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
            ) : channels.length === 0 ? (
              <Card className="p-10 text-center">
                <Hash className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
                <p className="text-white font-bold">No channels yet</p>
                <p className="text-text-secondary text-sm mt-1">Your trainer will create channels soon.</p>
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
          </>
        )}

        {/* Leaderboard tab */}
        {tab === 'leaderboard' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-accent" />
              <h2 className="text-base font-bold text-white">Top Athletes</h2>
              <span className="text-xs text-text-tertiary ml-auto">Live</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            </div>

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
                  <Card className={`p-4 ${i < 3 ? 'border-accent/20' : ''} ${isMe ? 'border-accent/40 bg-accent/5' : ''}`}>
                    <div className="flex items-center gap-3">
                      {/* Rank badge */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${
                        i < 3 ? medalColors[i] : 'bg-surface-elevated text-text-secondary'
                      }`}>
                        {i < 3 ? medals[i] : i + 1}
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
        )}
      </div>
    </div>
  );
}
