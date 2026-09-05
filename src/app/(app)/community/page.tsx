'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Hash, ChevronRight, Users, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getChannels, channelScopeFor } from '@/lib/firestore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { PaywallGate } from '@/components/ui/PaywallGate';
import { CommunityTabs } from '@/components/community/CommunityTabs';
import Link from 'next/link';
import type { Channel } from '@/types';

// Channels and the PR Wall are two routes presented as one section — see
// CommunityTabs. The Suspense boundary that used to wrap this page existed
// only for useSearchParams(), which read ?tab=leaderboard; both are gone.
export default function CommunityPage() {
  const { trainerId, user, profile } = useAuth();
  // Shared with the channel detail page — the two used to compute this
  // differently (this one fell back to user.uid for admins, the other
  // didn't), so an admin could see a channel open fine by URL while the
  // list that links to it came back empty. See channelScopeFor.
  const effectiveTrainerId = channelScopeFor(profile?.role, trainerId, user?.uid);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getChannels(effectiveTrainerId)
      .then(setChannels)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [effectiveTrainerId]);

  return (
    <div>
      <Header title="Community" />
      <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
        <CommunityTabs active="channels" />

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
      </div>
    </div>
  );
}
