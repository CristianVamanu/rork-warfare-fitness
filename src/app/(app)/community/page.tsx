'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Hash, ChevronRight, Users, Clock, Trophy } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getChannels } from '@/lib/firestore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import Link from 'next/link';
import type { Channel } from '@/types';

const LEADERBOARD = [
  { rank: 1, name: 'Alpha Wolf', streak: 45, points: 1240 },
  { rank: 2, name: 'Iron Mike', streak: 38, points: 980 },
  { rank: 3, name: 'Beast Mode', streak: 30, points: 875 },
  { rank: 4, name: 'Steel Amy', streak: 28, points: 740 },
  { rank: 5, name: 'Max Power', streak: 22, points: 620 },
];

export default function CommunityPage() {
  const { trainerId } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'channels' | 'leaderboard'>('channels');

  useEffect(() => {
    getChannels(trainerId ?? undefined)
      .then(setChannels)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [trainerId]);

  return (
    <div>
      <Header title="Community" />
      <div className="px-4 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-1 bg-surface rounded-xl p-1">
          {(['channels', 'leaderboard'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-2 text-sm font-medium rounded-lg transition-all capitalize ${
                tab === t ? 'bg-surface-elevated text-white' : 'text-text-secondary'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

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

        {tab === 'leaderboard' && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-white">Monthly Leaderboard</h2>
            {LEADERBOARD.map((entry, i) => (
              <motion.div key={entry.rank} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
                <Card className={`p-4 flex items-center gap-3 ${entry.rank <= 3 ? 'border-accent/20' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black ${
                    entry.rank === 1 ? 'bg-yellow-400 text-black' :
                    entry.rank === 2 ? 'bg-gray-300 text-black' :
                    entry.rank === 3 ? 'bg-amber-600 text-white' : 'bg-surface-elevated text-text-secondary'
                  }`}>
                    {entry.rank <= 3 ? ['🥇','🥈','🥉'][entry.rank-1] : entry.rank}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">{entry.name}</p>
                    <p className="text-xs text-text-secondary">🔥 {entry.streak} day streak</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-accent">{entry.points}</p>
                    <p className="text-xs text-text-secondary">pts</p>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
