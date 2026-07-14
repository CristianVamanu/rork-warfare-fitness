'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Swords, Trophy, Calendar } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getActiveChallenges, joinChallenge, getChallengeLeaderboard } from '@/lib/firestore';
import type { Challenge } from '@/types';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import toast from 'react-hot-toast';

function daysLeft(endDate: string): number {
  return Math.max(0, Math.ceil((new Date(endDate + 'T23:59:59').getTime() - Date.now()) / 86400000));
}

export default function ChallengesPage() {
  const { user, profile } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaderboards, setLeaderboards] = useState<Record<string, { userId: string; displayName: string; workoutsDuring: number }[]>>({});
  const [joining, setJoining] = useState<string | null>(null);

  const totalWorkouts = profile?.statsCache?.totalWorkouts ?? profile?.stats?.totalWorkouts ?? 0;

  const load = () => {
    getActiveChallenges()
      .then(async (list) => {
        setChallenges(list);
        const boards = await Promise.all(list.map(async (c) => [c.id, await getChallengeLeaderboard(c)] as const));
        setLeaderboards(Object.fromEntries(boards));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleJoin = async (challenge: Challenge) => {
    if (!user) return;
    setJoining(challenge.id);
    try {
      await joinChallenge(challenge.id, user.uid, totalWorkouts);
      toast.success(`Joined "${challenge.title}"!`);
      load();
    } catch {
      toast.error('Failed to join challenge');
    } finally {
      setJoining(null);
    }
  };

  return (
    <div>
      <Header title="Challenges" showBack />
      <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
        <p className="text-xs text-text-tertiary">
          Time-boxed contests you opt into — workout with your friends, compete for the top spot, and see who shows up the most before the clock runs out. Rankings are based on workouts logged <span className="text-white font-medium">during</span> the challenge window, so joining late doesn&rsquo;t put you at a disadvantage.
        </p>

        {loading ? (
          <>
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </>
        ) : challenges.length === 0 ? (
          <Card className="p-6 text-center">
            <Swords className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
            <p className="text-text-secondary text-sm">No active challenges right now</p>
            <p className="text-text-tertiary text-xs mt-1">Check back soon — new contests drop regularly.</p>
          </Card>
        ) : (
          challenges.map((c) => {
            const joined = !!user && c.participantIds.includes(user.uid);
            const board = leaderboards[c.id] ?? [];
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-lg font-black text-white">{c.title}</p>
                      <p className="text-xs text-text-secondary mt-0.5">{c.description}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-accent flex-shrink-0">
                      <Calendar className="w-3.5 h-3.5" /> {daysLeft(c.endDate)}d left
                    </div>
                  </div>

                  {!joined ? (
                    <Button size="sm" className="mt-3" loading={joining === c.id} onClick={() => handleJoin(c)}>
                      Join Challenge
                    </Button>
                  ) : (
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Trophy className="w-3.5 h-3.5 text-accent" />
                        <p className="text-xs font-bold text-text-tertiary uppercase tracking-wide">Leaderboard</p>
                      </div>
                      {board.slice(0, 5).map((entry, i) => (
                        <div
                          key={entry.userId}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg ${entry.userId === user?.uid ? 'bg-accent/10 border border-accent/20' : 'bg-white/5'}`}
                        >
                          <span className={`w-5 text-xs font-black ${i === 0 ? 'text-accent' : 'text-text-tertiary'}`}>{i + 1}</span>
                          <span className="flex-1 text-sm text-white truncate">{entry.displayName}</span>
                          <span className="text-xs text-text-secondary">{entry.workoutsDuring} workouts</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
