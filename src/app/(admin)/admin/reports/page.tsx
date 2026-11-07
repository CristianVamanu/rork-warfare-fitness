'use client';
export const dynamic = 'force-dynamic';

/**
 * Admin → Reports: posts and replies members reported (lib/moderation).
 * Remove the content, or dismiss the report. Several reports of the same
 * post are grouped into one row.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Trash2, Check, ExternalLink, Flag } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { REPORT_REASONS, subscribeOpenReports, setReportStatus, deleteReportedContent, reportLink, type ContentReport } from '@/lib/moderation';

const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
const keyOf = (r: ContentReport) => JSON.stringify(r.target);

export default function AdminReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ContentReport[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => subscribeOpenReports(setReports, () => { setReports([]); toast.error('Could not load reports'); }), []);

  const groups = useMemo(() => {
    const m = new Map<string, ContentReport[]>();
    for (const r of reports ?? []) m.set(keyOf(r), [...(m.get(keyOf(r)) ?? []), r]);
    return [...m.values()];
  }, [reports]);

  async function act(group: ContentReport[], remove: boolean) {
    const k = keyOf(group[0]);
    setBusy(k);
    try {
      if (remove) await deleteReportedContent(group[0].target).catch(() => { /* already gone */ });
      await Promise.all(group.map((r) => setReportStatus(r.id, remove ? 'resolved' : 'dismissed')));
      toast.success(remove ? 'Removed' : 'Dismissed');
    } catch {
      toast.error('Something went wrong, try again');
    } finally { setBusy(null); }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <button onClick={() => router.push('/admin')} className="flex items-center gap-1 text-sm text-text-secondary hover:text-white"><ChevronLeft className="w-4 h-4" /> Admin</button>
      <div>
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Flag className="w-5 h-5 text-accent" /> Reports</h1>
        <p className="text-sm text-text-secondary mt-1">Posts and replies members reported. Remove the content, or dismiss if it&apos;s fine.</p>
      </div>
      {reports === null ? (
        <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      ) : groups.length === 0 ? (
        <Card className="p-8 text-center"><p className="text-white font-bold">Nothing to review</p><p className="text-text-secondary text-sm mt-1">New reports show up here straight away.</p></Card>
      ) : groups.map((g) => {
        const r = g[0];
        const k = keyOf(r);
        const reasons = [...new Set(g.map((x) => reasonLabel(x.reason)))];
        return (
          <Card key={k} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">{r.reportedUserName}</p>
                <p className="text-[11px] text-text-tertiary">{r.target.kind === 'channelReply' ? 'Reply' : r.target.kind === 'prPost' ? 'PR wall post' : r.target.kind === 'challengePost' ? 'Challenge chat' : 'Channel post'} · {g.length} {g.length === 1 ? 'report' : 'reports'}</p>
              </div>
              <Link href={reportLink(r.target)} className="text-xs text-accent flex items-center gap-1 flex-shrink-0">Open <ExternalLink className="w-3 h-3" /></Link>
            </div>
            <p className="text-sm text-white whitespace-pre-wrap break-words rounded-xl bg-white/[0.04] px-3 py-2">{r.excerpt || <span className="text-text-tertiary italic">(photo or video only)</span>}</p>
            <div className="flex flex-wrap gap-1.5">{reasons.map((x) => <span key={x} className="text-[11px] px-2 py-0.5 rounded-full bg-danger/10 text-danger">{x}</span>)}</div>
            {g.filter((x) => x.note).map((x) => <p key={x.id} className="text-xs text-text-secondary italic">&ldquo;{x.note}&rdquo;</p>)}
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" fullWidth loading={busy === k} onClick={() => act(g, false)}><Check className="w-3.5 h-3.5" /> Dismiss</Button>
              <Button size="sm" fullWidth loading={busy === k} onClick={() => { if (confirm('Remove this content for everyone?')) act(g, true); }} className="!bg-danger !text-white"><Trash2 className="w-3.5 h-3.5" /> Remove</Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
