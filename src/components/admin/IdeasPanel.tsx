'use client';

import { useCallback, useEffect, useState } from 'react';
import { Lightbulb, RefreshCw, ArrowBigUp, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { getTopIdeas, setIdeaStatus } from '@/lib/firestore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { IdeaStatusBadge } from '@/components/community/IdeaStatusBadge';
import { IDEA_STATUSES, IDEA_STATUS_LABEL, type Channel, type ChannelPost, type IdeaStatus } from '@/types';

type Idea = ChannelPost & { channelName: string };

/**
 * Admin → Community: what members are asking for, most voted first, across
 * every ideas board. The status picker writes straight to the post, so the
 * badge changes for every member the moment it is set. Shown only when at
 * least one ideas board exists.
 */
export function IdeasPanel({ channels }: { channels: Channel[] }) {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const load = useCallback(async () => {
    setLoading(true);
    try { setIdeas(await getTopIdeas(50)); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Could not load ideas'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load, channels.length]);

  async function setStatus(idea: Idea, status: IdeaStatus | null) {
    const before = idea.status;
    setIdeas((prev) => prev?.map((i) => (i.id === idea.id ? { ...i, status: status ?? undefined } : i)) ?? prev);
    try {
      await setIdeaStatus(idea.channelId, idea.id, status);
      toast.success(status ? `Marked ${IDEA_STATUS_LABEL[status]}` : 'Back to open');
    } catch {
      setIdeas((prev) => prev?.map((i) => (i.id === idea.id ? { ...i, status: before } : i)) ?? prev);
      toast.error('Could not update');
    }
  }

  const boards = channels.filter((c) => c.kind === 'ideas');
  const shown = (ideas ?? []).filter((i) => filter === 'all' || !i.status || i.status === 'planned' || i.status === 'building');

  return (
    <Card className="p-4 lg:p-5">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent-muted flex items-center justify-center flex-shrink-0">
            <Lightbulb className="w-4 h-4 text-accent" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Feature requests</p>
            <p className="text-xs text-text-secondary">Most voted first, from {boards.map((b) => `#${b.name}`).join(', ')}. Set a status and every member sees it.</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {(['open', 'all'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === f ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'}`}>{f === 'open' ? 'Open' : 'All'}</button>
          ))}
          <Button size="sm" variant="secondary" onClick={load} loading={loading}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>

      {ideas === null ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : shown.length === 0 ? (
        <p className="text-sm text-text-tertiary py-4 text-center">{filter === 'open' ? 'Nothing open. Members have not suggested anything yet, or everything is shipped.' : 'No ideas yet.'}</p>
      ) : (
        <div className="divide-y divide-white/8">
          {shown.map((idea) => (
            <div key={`${idea.channelId}/${idea.id}`} className="py-3 flex items-start gap-3">
              <div className="flex flex-col items-center w-11 flex-shrink-0 rounded-lg bg-white/5 py-1.5">
                <ArrowBigUp className="w-4 h-4 text-accent" />
                <span className="text-sm font-black text-white tabular-nums leading-none mt-0.5">{idea.likes?.length ?? 0}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white leading-snug whitespace-pre-wrap break-words line-clamp-3">{idea.content}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-text-tertiary">
                  <span>{idea.userDisplayName}</span>
                  <span>·</span>
                  <span>#{idea.channelName}</span>
                  <span>·</span>
                  <span>{idea.replyCount ?? 0} {idea.replyCount === 1 ? 'reply' : 'replies'}</span>
                  <IdeaStatusBadge status={idea.status} />
                  <Link href={`/community/${idea.channelId}#post-${idea.id}`} className="inline-flex items-center gap-1 text-accent hover:underline">
                    Open <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
              <select
                value={idea.status ?? ''}
                onChange={(e) => setStatus(idea, (e.target.value || null) as IdeaStatus | null)}
                aria-label="Idea status"
                className="flex-shrink-0 bg-surface border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent/50"
              >
                <option value="">Open</option>
                {IDEA_STATUSES.map((s) => <option key={s} value={s}>{IDEA_STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
