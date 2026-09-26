import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Users, CheckCircle2, Flame } from 'lucide-react';
import { getPublicPrograms } from '@/lib/publicPrograms';
import { getPublicBranding } from '@/lib/publicBranding';
import { PublicNav } from '@/components/public/PublicNav';
import { PublicFooter } from '@/components/public/PublicFooter';
import { TacticalBackdrop } from '@/components/public/TacticalBackdrop';
import { ChallengeJoinCTA } from '@/components/community/ChallengeJoinCTA';
import { loadPublicChallenge, loadReferrerName } from '@/lib/challengesPublic';

/**
 * The page a shared challenge link lands on. Public, so a friend with no
 * account sees what they were sent — the cover, the title, the brief, how
 * many are in — and one button. Signed in, the button opens the challenge
 * in the app; signed out, it goes to onboarding with ?next= pointing back
 * here so the first thing they see after joining is the challenge, and
 * ?ref= so the sharer is credited exactly as a shared program credits them.
 */

export const revalidate = 60;

const getChallenge = loadPublicChallenge;

export async function generateMetadata({ params }: { params: Promise<{ challengeId: string }> }): Promise<Metadata> {
  const { challengeId } = await params;
  const c = await getChallenge(challengeId);
  if (!c) return { title: 'Challenge not found' };
  const image = c.cover ? (c.cover.type === 'video' ? c.cover.posterURL : c.cover.url) : null;
  const title = `${c.title} — Warfare Fitness challenge`;
  return {
    title,
    description: c.brief,
    alternates: { canonical: `/challenges/${challengeId}` },
    openGraph: { title, description: c.brief, type: 'article', ...(image ? { images: [{ url: image }] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description: c.brief, ...(image ? { images: [image] } : {}) },
  };
}

export default async function PublicChallengePage({ params, searchParams }: {
  params: Promise<{ challengeId: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { challengeId } = await params;
  const { ref } = await searchParams;
  const c = await getChallenge(challengeId);
  if (!c) notFound();

  const referrerName = await loadReferrerName(ref);

  const [programs, brand] = await Promise.all([getPublicPrograms().catch(() => []), getPublicBranding()]);
  // Only what the nav renders. The full program documents carry Firestore
  // Timestamps, which cannot cross into a client component: a public page was
  // 500 ("Only plain objects... can be passed to Client Components") on
  // exactly that, while the prerendered programs pages never hit it.
  const navPrograms = programs.map((p) => ({ name: p.name, slug: p.slug }));
  const cover = c.cover;
  const coverImg = cover ? (cover.type === 'video' ? cover.posterURL : cover.url) : null;
  const days = c.endsAt ? Math.ceil((new Date(c.endsAt).getTime() - Date.now()) / 86400000) : null;

  return (
    <div className="min-h-screen bg-background text-white">
      <div className="relative">
        <TacticalBackdrop className="h-[640px]" />
        <div className="relative z-10">
          <PublicNav programs={navPrograms} logoUrl={brand.logoUrl} appName={brand.appName} />
          <main className="max-w-lg mx-auto px-4 pt-6 pb-20">
            <div className="rounded-3xl overflow-hidden border border-white/10 bg-black shadow-2xl">
              <div className="relative aspect-[4/5] bg-black">
                {cover?.type === 'video' ? (
                  <video src={cover.url} poster={cover.posterURL ?? undefined} muted autoPlay loop playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
                ) : coverImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverImg} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(245,166,35,0.3), rgba(0,0,0,0.7) 100%)' }} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                <div className="absolute top-4 left-4 flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase ${c.status === 'live' ? 'bg-accent text-black' : 'bg-white/15 text-white'}`}>
                    {c.status === 'live' ? 'Live challenge' : 'Closed'}
                  </span>
                </div>
                <div className="absolute bottom-5 left-5 right-5">
                  {c.category && <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent mb-1">{c.category}</p>}
                  <h1 className="text-3xl font-black leading-tight">{c.title}</h1>
                </div>
              </div>
              <div className="p-5 space-y-4">
                {referrerName && (
                  <p className="text-sm text-accent font-semibold flex items-center gap-2"><Flame className="w-4 h-4" /> {referrerName} entered this and sent it to you.</p>
                )}
                <p className="text-base text-white/85 leading-relaxed">{c.brief}</p>
                <div className="flex items-center gap-4 text-xs text-white/60">
                  <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {c.entryCount} entered</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> {c.verifiedCount} finished</span>
                  {days !== null && days >= 0 && <span className="ml-auto">{days === 0 ? 'Ends today' : `${days}d left`}</span>}
                </div>
                <ChallengeJoinCTA challengeId={c.id} live={c.status === 'live'} refCode={ref ?? null} />
                <p className="text-[11px] text-white/40 leading-relaxed">Every result is checked by an admin before it counts. Rules, loadouts and the board are inside the app.</p>
              </div>
            </div>
          </main>
        </div>
      </div>
      <PublicFooter appName={brand.appName} />
    </div>
  );
}
