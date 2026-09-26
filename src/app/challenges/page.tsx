import type { Metadata } from 'next';
import Link from 'next/link';
import { Users, CheckCircle2, ChevronRight } from 'lucide-react';
import { getPublicPrograms } from '@/lib/publicPrograms';
import { getPublicBranding } from '@/lib/publicBranding';
import { PublicNav } from '@/components/public/PublicNav';
import { PublicFooter } from '@/components/public/PublicFooter';
import { TacticalBackdrop } from '@/components/public/TacticalBackdrop';
import { loadPublicChallenges, type PublicChallenge } from '@/lib/challengesPublic';

export const metadata: Metadata = {
  title: 'Challenges — Warfare Fitness',
  description: 'Open challenges from the Warfare Fitness community. Enter, post your result, get it verified, earn the badge.',
  alternates: { canonical: '/challenges' },
};

export const revalidate = 60;

/**
 * The public shelf of challenges. Until now the only public surface was a
 * single share link; a visitor who had not been sent one could not find out
 * challenges existed at all. Live ones first, closed ones below as the
 * record of what people have already done. Each card opens the same share
 * page a member's link opens, and its button goes through onboarding.
 */
export default async function ChallengesIndex() {
  const [items, programs, brand] = await Promise.all([loadPublicChallenges(), getPublicPrograms().catch(() => []), getPublicBranding()]);
  const navPrograms = programs.map((p) => ({ name: p.name, slug: p.slug }));
  const live = items.filter((c) => c.status === 'live');
  const closed = items.filter((c) => c.status !== 'live');

  return (
    <div className="min-h-screen bg-background text-white">
      <div className="relative">
        <TacticalBackdrop className="h-[640px]" />
        <div className="relative z-10">
          <PublicNav programs={navPrograms} logoUrl={brand.logoUrl} appName={brand.appName} />
          <main className="max-w-5xl mx-auto px-5 pt-6 pb-20">
            <header className="mb-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-accent">Warfare Fitness · Challenges</p>
              <h1 className="text-4xl md:text-6xl font-black leading-[0.95] mt-2">Prove it.<br /><span className="text-accent">Then wear it.</span></h1>
              <p className="text-base text-white/70 mt-4 max-w-xl leading-relaxed">
                Enter a challenge, post your result with proof, and an admin checks it before it counts. Finishers earn XP and a badge on their profile.
              </p>
            </header>

            {items.length === 0 ? (
              <div className="rounded-3xl border border-white/10 p-12 text-center" style={{ backgroundColor: 'var(--card-glass-bg)' }}>
                <p className="text-lg font-bold">No challenges yet</p>
                <p className="text-sm text-white/60 mt-1">The first one drops in the app. Join and you will be told the moment it goes live.</p>
                <Link href="/onboarding" className="inline-flex items-center gap-2 mt-6 rounded-2xl bg-accent text-black font-bold px-5 py-3">Join Warfare Fitness <ChevronRight className="w-4 h-4" /></Link>
              </div>
            ) : (
              <>
                {live.length > 0 && <Section title="Live now" items={live} />}
                {closed.length > 0 && <Section title="Closed" items={closed} muted />}
              </>
            )}
          </main>
        </div>
      </div>
      <PublicFooter appName={brand.appName} />
    </div>
  );
}

function Section({ title, items, muted }: { title: string; items: PublicChallenge[]; muted?: boolean }) {
  return (
    <section className="mb-10">
      <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white/60 mb-4">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => <Card key={c.id} c={c} muted={muted} />)}
      </div>
    </section>
  );
}

function Card({ c, muted }: { c: PublicChallenge; muted?: boolean }) {
  const cover = c.cover ? (c.cover.type === 'video' ? c.cover.posterURL : c.cover.url) : null;
  const days = c.endsAt ? Math.ceil((new Date(c.endsAt).getTime() - Date.now()) / 86400000) : null;
  return (
    <Link href={`/challenges/${c.id}`} className={`group rounded-3xl overflow-hidden border border-white/10 bg-black hover:border-accent/50 transition-colors ${muted ? 'opacity-80 hover:opacity-100' : ''}`}>
      <div className="relative aspect-[4/5] bg-black">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500" />
        ) : (
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(245,166,35,0.3), rgba(0,0,0,0.7) 100%)' }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
        <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase ${c.status === 'live' ? 'bg-accent text-black' : 'bg-white/15 text-white'}`}>
          {c.status === 'live' ? 'Live' : 'Closed'}
        </span>
        {c.status === 'live' && days !== null && days >= 0 && (
          <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold bg-black/60 text-white">{days === 0 ? 'Ends today' : `${days}d left`}</span>
        )}
        <div className="absolute bottom-4 left-4 right-4">
          {c.category && <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-accent mb-1">{c.category}</p>}
          <h3 className="text-xl font-black leading-tight">{c.title}</h3>
        </div>
      </div>
      <div className="p-4">
        <p className="text-sm text-white/75 leading-relaxed line-clamp-2">{c.brief}</p>
        <div className="flex items-center gap-4 text-xs text-white/55 mt-3">
          <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {c.entryCount} entered</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> {c.verifiedCount} finished</span>
          <span className="ml-auto text-accent font-semibold inline-flex items-center gap-1">Open <ChevronRight className="w-3.5 h-3.5" /></span>
        </div>
      </div>
    </Link>
  );
}
