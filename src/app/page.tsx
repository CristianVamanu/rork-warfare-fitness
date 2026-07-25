'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  Dumbbell, Apple, ScanLine, Users, MessageCircle, Timer, Ban, Trophy,
  ArrowRight, CheckCircle2, Crown, Check, Flame, Zap, ShieldCheck, XCircle, ChevronDown, User,
  Menu, X as XIcon, Clock, BarChart3, Anchor, Compass, Shield, Swords, Footprints, Waves, LifeBuoy, Mountain,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getSystemConfig, getMembershipConfig, getCoachingPlans, getMembershipPlans } from '@/lib/firestore';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { DEFAULT_LANDING_CONFIG } from '@/lib/landingDefaults';
import { getActiveDiscountPercent, applyDiscount } from '@/lib/utils';
import type { LandingPageConfig, MembershipConfig, CoachingPlan, MembershipPlan } from '@/types';

// Icon + color stay fixed by position — only title/desc are admin-editable.
// If a client adds more feature entries than this list has, extras fall
// back to the last icon/color rather than crashing.
const FEATURE_STYLES = [
  { icon: Dumbbell, color: 'text-purple-400', bg: 'bg-purple-400/10' },
  { icon: Apple, color: 'text-green-400', bg: 'bg-green-400/10' },
  { icon: ScanLine, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  { icon: MessageCircle, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  { icon: Timer, color: 'text-sky-400', bg: 'bg-sky-400/10' },
  { icon: Ban, color: 'text-red-400', bg: 'bg-red-400/10' },
  { icon: Trophy, color: 'text-accent', bg: 'bg-accent-muted' },
  { icon: Users, color: 'text-orange-400', bg: 'bg-orange-400/10' },
];

const FAQ_ITEMS = [
  {
    q: 'Do I need a gym or special equipment?',
    a: 'No — during the quiz you tell us what you have access to (full gym, home dumbbells, or just bodyweight), and your program is built around exactly that.',
  },
  {
    q: "I've never trained before. Is this still for me?",
    a: 'Yes. Your experience level shapes everything — exercise selection, volume, and rep ranges are all calibrated for beginners if that\'s where you are.',
  },
  {
    q: 'How is this different from a generic workout app?',
    a: 'Your program is matched to your specific goal, experience, equipment, and schedule instead of a one-size-fits-all plan — and it adjusts weight/rep suggestions based on your own logged performance as you go.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes, no lock-in contracts — manage or cancel your membership at any time from your account settings.',
  },
];

interface PublicProgram {
  id: string;
  name: string;
  description: string;
  level: string;
  goal: string;
  weeks: number;
  daysPerWeek: number;
  imageUrl: string | null;
  targetGender: string;
}

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '#programs', label: 'Programs' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
];

const GOAL_LABEL: Record<string, string> = {
  strength: 'Strength', hypertrophy: 'Muscle Building', endurance: 'Endurance', 'weight-loss': 'Weight Loss', general: 'General Fitness',
};

// Stylized per-program badges — NOT real military insignia (using actual
// unit crests/emblems would falsely imply an official endorsement that
// doesn't exist, a real trademark/rights issue, not just a style choice).
// Each built-in seed program gets its own distinct icon+color instead, so
// the cards still read as visually distinct without borrowing real emblems.
const PROGRAM_BADGE: Record<string, { icon: React.ElementType; color: string }> = {
  p5: { icon: Anchor, color: 'text-blue-400' },
  p6: { icon: Mountain, color: 'text-green-400' },
  p7: { icon: Compass, color: 'text-orange-400' },
  p8: { icon: Shield, color: 'text-red-400' },
  p9: { icon: Swords, color: 'text-gray-300' },
  p10: { icon: Footprints, color: 'text-yellow-400' },
  p11: { icon: Shield, color: 'text-purple-400' },
  p12: { icon: Waves, color: 'text-sky-400' },
  p13: { icon: Mountain, color: 'text-accent' },
  p14: { icon: LifeBuoy, color: 'text-orange-400' },
};

function FaqItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-white/8 last:border-b-0">
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-4 py-4 text-left">
        <span className="text-sm font-semibold text-white">{q}</span>
        <ChevronDown className={`w-4 h-4 text-text-tertiary flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="text-sm text-text-secondary leading-relaxed pb-4 pr-8"
        >
          {a}
        </motion.p>
      )}
    </div>
  );
}

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [appName, setAppName] = useState('Warfare Fitness');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [landing, setLanding] = useState<LandingPageConfig>(DEFAULT_LANDING_CONFIG);
  const [membership, setMembership] = useState<MembershipConfig | null>(null);
  const [coachingPlans, setCoachingPlans] = useState<CoachingPlan[]>([]);
  const [membershipPlans, setMembershipPlans] = useState<MembershipPlan[]>([]);
  const [leaderboard, setLeaderboard] = useState<{ displayName: string; powerLevel: number; streak: number; totalWorkouts: number }[]>([]);
  const [stats, setStats] = useState<{ totalUsers: number; totalWorkouts: number } | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [quickSex, setQuickSex] = useState<'male' | 'female' | null>(null);
  const [quickAge, setQuickAge] = useState('');
  const [programs, setPrograms] = useState<PublicProgram[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<PublicProgram | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [user, loading, router]);

  useEffect(() => {
    getSystemConfig().then((cfg) => {
      if (cfg?.appName) setAppName(cfg.appName as string);
      if (cfg?.logoUrl) setLogoUrl(cfg.logoUrl as string);
      if (cfg?.landingPage) setLanding({ ...DEFAULT_LANDING_CONFIG, ...(cfg.landingPage as LandingPageConfig) });
    }).catch(() => {});
    getMembershipConfig().then(setMembership).catch(() => {});
    getCoachingPlans().then((plans) => setCoachingPlans(plans.filter((p) => p.active))).catch(() => {});
    getMembershipPlans().then((plans) => setMembershipPlans(plans.filter((p) => p.active))).catch(() => {});
    fetch('/api/public/leaderboard').then((r) => r.json()).then((d) => setLeaderboard(d.entries ?? [])).catch(() => {});
    fetch('/api/public/stats').then((r) => r.json()).then(setStats).catch(() => {});
    fetch('/api/public/programs').then((r) => r.json()).then((d) => setPrograms(d.programs ?? [])).catch(() => {});
  }, []);

  const trialDays = membership?.enabled ? (membership.trialDays ?? 0) : 0;
  const discountPercent = getActiveDiscountPercent(membership);

  if (loading || user) return <FullPageSpinner />;

  const subheadline = landing.subheadline.replace('{appName}', appName);
  // Free trial needs no payment upfront — MembershipGuard grants access
  // automatically for trialDays from account creation, so the CTA can lead
  // straight to registration rather than a paid checkout.
  const primaryCtaLabel = trialDays > 0 ? `Start ${trialDays}-Day Free Trial` : landing.ctaPrimaryLabel;

  return (
    <div className="min-h-screen bg-background overflow-x-hidden relative">
      {/* Ambient glow + grid texture, contained to the hero viewport so it
          doesn't bleed color into the feature/social-proof sections below. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
          }}
        />
        <div className="absolute left-1/2 top-[-120px] -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-accent/20 blur-[120px]" />
        <div className="absolute right-[-100px] top-[80px] w-[500px] h-[240px] rotate-[-20deg] bg-gradient-to-r from-transparent via-accent/25 to-transparent blur-3xl" />
      </div>

      {/* Hero background image — full-bleed behind the entire hero, not
          confined to the narrow text column, so it actually reads as a
          background rather than a sliver hidden behind the copy. */}
      {landing.heroImageUrl && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[820px] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={landing.heroImageUrl}
            alt=""
            className="w-full h-full object-cover object-top sm:object-center opacity-40 sm:opacity-45"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/75 to-background" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-background" />
        </div>
      )}

      {/* Nav */}
      <nav className="relative max-w-5xl mx-auto px-5 py-5">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center overflow-hidden flex-shrink-0">
              {logoUrl ? (
                <Image src={logoUrl} alt={appName} width={36} height={36} className="w-full h-full object-cover" />
              ) : (
                <span className="text-base font-black text-black">{appName[0]}</span>
              )}
            </div>
            <span className="text-base font-black text-white tracking-tight">{appName}</span>
          </Link>

          {/* Desktop links */}
          <div className="hidden sm:flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="text-sm font-medium text-text-secondary hover:text-white transition-colors">
                {link.label}
              </a>
            ))}
            <Link href="/login" className="text-sm font-medium text-white hover:text-accent transition-colors">
              Sign In
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="sm:hidden p-2 -mr-2 text-text-secondary hover:text-white transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <XIcon className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="sm:hidden overflow-hidden"
          >
            <div className="flex flex-col gap-1 mt-4 pb-2 border-t border-white/8 pt-4">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-sm font-medium text-text-secondary hover:text-white transition-colors py-2.5"
                >
                  {link.label}
                </a>
              ))}
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm font-bold text-accent py-2.5"
              >
                Sign In
              </Link>
            </div>
          </motion.div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative max-w-3xl mx-auto px-5 pt-10 pb-16 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {/* Animated brand mark — logo emerging through smoke into flame.
              Muted/looped/inline so it autoplays everywhere including iOS
              Safari; the poster frame paints instantly so there's no blank
              gap while the ~900KB clip loads. */}
          <div className="relative w-32 h-32 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-accent/25 blur-2xl" />
            <video
              className="relative w-full h-full rounded-2xl object-cover shadow-glow-accent"
              src="/videos/hero-logo.mp4"
              poster="/videos/hero-logo-poster.jpg"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
            />
          </div>
          {landing.badgeText && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-muted text-accent text-xs font-bold mb-5 border border-accent/20">
              <Trophy className="w-3.5 h-3.5" /> {landing.badgeText}
            </div>
          )}
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-[1.15] sm:leading-[1.1] text-balance">
            {landing.headlineLine1}<br className="hidden sm:block" />{' '}
            <span className="text-accent">{landing.headlineLine2}</span>
          </h1>
          <p className="text-text-secondary text-base sm:text-lg mt-5 max-w-xl mx-auto leading-relaxed">
            {subheadline}
          </p>
          {/* Quick-start selector — getting a visitor to make one small,
              personal choice (their sex, their age) before they even leave
              the landing page builds investment in the result, the same
              trick quiz-funnel apps use. Answers ride along as query params
              and simply pre-fill the same fields on the biometrics step —
              nothing here is saved or required, it's just a head start. */}
          <div className="max-w-md mx-auto mt-8 p-5 rounded-2xl border border-white/8 bg-surface/60 backdrop-blur-sm">
            <p className="text-xs font-bold text-text-tertiary uppercase tracking-wide mb-3">Start building your program</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {(['male', 'female'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setQuickSex(s)}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-colors ${quickSex === s ? 'border-accent bg-accent/10' : 'border-white/10 hover:border-white/20'}`}
                >
                  <User className={`w-6 h-6 ${quickSex === s ? 'text-accent' : 'text-text-secondary'}`} />
                  <span className={`text-xs font-semibold ${quickSex === s ? 'text-white' : 'text-text-secondary'}`}>{s === 'male' ? 'Male' : 'Female'}</span>
                </button>
              ))}
            </div>
            <input
              type="number"
              inputMode="numeric"
              value={quickAge}
              onChange={(e) => setQuickAge(e.target.value)}
              placeholder="Your age"
              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm text-center placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 mb-3"
            />
            <Link
              href={`/onboarding${quickSex ? `?sex=${quickSex}` : ''}${quickAge ? `${quickSex ? '&' : '?'}age=${quickAge}` : ''}`}
              className="block"
            >
              <Button size="lg" fullWidth>
                {primaryCtaLabel} <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          <div className="flex items-center justify-center gap-4 mt-5">
            <p className="text-xs text-text-tertiary">No credit card required</p>
            <span className="text-text-tertiary">·</span>
            <Link href="/login" className="text-xs text-accent font-medium hover:underline">
              {landing.ctaSecondaryLabel}
            </Link>
          </div>

          {/* Real usage numbers only — hidden below a threshold so a brand
              new install never shows an awkwardly small count. */}
          {stats && stats.totalUsers >= 15 && (
            <div className="flex items-center justify-center gap-6 mt-8 text-sm">
              <div className="text-center">
                <p className="text-xl font-black text-white">{stats.totalUsers.toLocaleString()}+</p>
                <p className="text-xs text-text-tertiary">athletes</p>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="text-center">
                <p className="text-xl font-black text-white">{stats.totalWorkouts.toLocaleString()}+</p>
                <p className="text-xs text-text-tertiary">workouts logged</p>
              </div>
            </div>
          )}
        </motion.div>
      </section>

      {/* Feature grid — bento layout. Width varies by position (wide hero,
          narrower supporting cards, full-width closer) but height is never
          forced — each row's cards stretch to match whichever card in that
          row has the most text, so nothing overflows past its border and
          nothing is left with an oddly empty middle. If an admin adds/
          removes features, extras fall back to a plain 1-column width. */}
      <section className="max-w-5xl mx-auto px-5 pb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-black text-white">Everything you need. Nothing you don&apos;t.</h2>
          <p className="text-text-secondary text-sm mt-2">One app for training, nutrition, accountability, and progress.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-stretch">
          {landing.features.map((f, i) => {
            const style = FEATURE_STYLES[i] ?? FEATURE_STYLES[FEATURE_STYLES.length - 1];
            const colSpan = [
              'col-span-2 sm:col-span-2',
              'col-span-2 sm:col-span-1',
              'col-span-2 sm:col-span-1',
              'col-span-1',
              'col-span-1',
              'col-span-1',
              'col-span-1',
              'col-span-2 sm:col-span-4',
            ][i] ?? 'col-span-2 sm:col-span-1';
            const isHero = i === 0;
            return (
              <motion.div
                key={`${f.title}-${i}`}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.35, delay: (i % 4) * 0.05 }}
                className={`${colSpan} p-5 rounded-2xl border border-white/8 bg-surface hover:border-accent/30 transition-colors flex flex-col items-start relative overflow-hidden`}
              >
                {/* Large faint watermark icon — fills a wide hero tile's
                    extra space without inventing fake content per feature. */}
                {isHero && (
                  <style.icon className="absolute -right-4 -bottom-4 w-28 h-28 text-white/[0.03] pointer-events-none" />
                )}
                <div className={`relative ${isHero ? 'w-12 h-12' : 'w-10 h-10'} rounded-xl flex items-center justify-center mb-3 ${style.bg} flex-shrink-0`}>
                  <style.icon className={`${isHero ? 'w-6 h-6' : 'w-5 h-5'} ${style.color}`} />
                </div>
                <h3 className={`relative font-bold text-white ${isHero ? 'text-base' : 'text-sm'}`}>{f.title}</h3>
                <p className="relative text-xs text-text-secondary mt-1.5 leading-relaxed">{f.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Programs — pulled from /api/public/programs (published Firestore
          programs + built-in seed programs), so this always reflects
          whatever's actually assignable, never hand-maintained copy that
          could drift out of sync with the real program library. */}
      {programs.length > 0 && (
        <section id="programs" className="max-w-5xl mx-auto px-5 pb-16 scroll-mt-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-black text-white">Train Like an Elite Soldier</h2>
            <p className="text-text-secondary text-sm mt-2">Every program is matched to you during onboarding — or pick one yourself below.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {programs.map((p, i) => {
              const badge = PROGRAM_BADGE[p.id];
              return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.35, delay: (i % 6) * 0.05 }}
                onClick={() => setSelectedProgram(p)}
                className="rounded-2xl border border-white/8 bg-surface hover:border-accent/30 transition-colors overflow-hidden flex flex-col cursor-pointer text-left"
              >
                {/* Fixed-aspect image slot, same size for every card — a
                    themed gradient + icon fallback when no admin image is
                    set yet, so the grid never looks unfinished. */}
                <div className="w-full aspect-[4/3] relative bg-gradient-to-br from-accent/20 to-surface-elevated flex-shrink-0">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.name} className="w-full h-full object-contain p-3" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Dumbbell className="w-10 h-10 text-accent/40" />
                    </div>
                  )}
                  <div className="absolute top-2.5 left-2.5">
                    <span className="px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm text-[10px] font-bold text-white uppercase tracking-wide">
                      {p.level}
                    </span>
                  </div>
                  {/* Stylized program badge — not a real unit insignia, see
                      PROGRAM_BADGE comment above. */}
                  {badge && (
                    <div className="absolute top-2.5 right-2.5 w-8 h-8 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center">
                      <badge.icon className={`w-4 h-4 ${badge.color}`} />
                    </div>
                  )}
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="text-sm font-bold text-white">{p.name}</h3>
                  <p className="text-xs text-text-secondary mt-1.5 leading-relaxed line-clamp-2 flex-1">{p.description}</p>
                  <div className="flex items-center gap-3 mt-3 text-[11px] text-text-tertiary">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {p.weeks}wk</span>
                    <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> {p.daysPerWeek}d/wk</span>
                    <span>{GOAL_LABEL[p.goal] ?? p.goal}</span>
                  </div>
                  <Link href="/login" onClick={(e) => e.stopPropagation()} className="block pt-4 mt-auto">
                    <Button fullWidth size="sm">Enroll Now <ArrowRight className="w-3.5 h-3.5" /></Button>
                  </Link>
                </div>
              </motion.div>
              );
            })}
          </div>

          {/* Build Your Own teaser — the real builder is inside the app
              (needs an account), so this just points new visitors to the
              signup funnel with the right expectation set. */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.35 }}
            className="mt-6 rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/[0.08] to-surface p-6 sm:p-8 text-center"
          >
            <h3 className="text-lg sm:text-xl font-black text-white">Don&apos;t see a perfect fit?</h3>
            <p className="text-text-secondary text-sm mt-2 max-w-md mx-auto">
              Build your own fully custom AI-generated program — answer a few questions about your goals, equipment, and schedule, and get a plan made just for you.
            </p>
            <Link href="/login" className="inline-block mt-4">
              <Button size="sm">Get Started <ArrowRight className="w-3.5 h-3.5" /></Button>
            </Link>
          </motion.div>
        </section>
      )}

      {/* Program detail modal — opened from a card click, shows the full
          description instead of the 2-line clamp, without leaving the page. */}
      <Modal open={!!selectedProgram} onClose={() => setSelectedProgram(null)} title={selectedProgram?.name ?? ''}>
        {selectedProgram && (
          <div className="space-y-4">
            {selectedProgram.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedProgram.imageUrl} alt={selectedProgram.name} className="w-full aspect-[16/9] object-contain bg-black/20 rounded-xl p-3" />
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-1 rounded-lg bg-white/8 text-[10px] font-bold text-white uppercase tracking-wide">
                {selectedProgram.level}
              </span>
              <span className="px-2 py-1 rounded-lg bg-white/8 text-[10px] font-bold text-text-secondary uppercase tracking-wide">
                {GOAL_LABEL[selectedProgram.goal] ?? selectedProgram.goal}
              </span>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">{selectedProgram.description}</p>
            <div className="flex items-center gap-4 text-xs text-text-tertiary">
              <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {selectedProgram.weeks} weeks</span>
              <span className="flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> {selectedProgram.daysPerWeek} days/week</span>
            </div>
            <Link href="/login" className="block pt-2">
              <Button fullWidth>Enroll Now <ArrowRight className="w-4 h-4" /></Button>
            </Link>
          </div>
        )}
      </Modal>

      {/* Motivational quote — admin-editable, full-bleed accent treatment */}
      {landing.quoteText && (
        <section className="max-w-4xl mx-auto px-5 pb-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4 }}
            className="relative rounded-3xl border border-accent/20 bg-gradient-to-br from-accent/[0.08] to-surface p-8 sm:p-12 text-center overflow-hidden"
          >
            {/* Fixed-size badge instead of a giant absolutely-positioned glyph
                behind the text — the old version overlapped the quote on
                narrow screens since it never adapted to width or copy length. */}
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-accent-muted text-accent text-lg font-black mb-4">
              &ldquo;
            </span>
            <p className="text-xl sm:text-2xl font-bold text-white leading-snug max-w-2xl mx-auto text-balance">
              {landing.quoteText}
            </p>
            {landing.quoteAuthor && (
              <p className="relative text-sm text-accent font-medium mt-4">— {landing.quoteAuthor}</p>
            )}
          </motion.div>
        </section>
      )}

      {/* Testimonials — admin-editable only, never fabricated. Hidden
          entirely until real ones are added in Admin -> Landing Page. */}
      {landing.testimonials && landing.testimonials.length > 0 && (
        <section className="max-w-5xl mx-auto px-5 pb-16">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-black text-white">What Members Are Saying</h2>
          </div>
          <div className={`grid gap-4 ${landing.testimonials.length > 1 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'max-w-lg mx-auto'}`}>
            {landing.testimonials.map((t, i) => (
              <motion.div
                key={`${t.name}-${i}`}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.35, delay: (i % 3) * 0.05 }}
                className="rounded-2xl border border-white/8 bg-surface p-5"
              >
                <p className="text-sm text-text-secondary leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                <p className="text-sm font-bold text-white mt-3">{t.name}</p>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Pricing */}
      {(membershipPlans.length > 0 || coachingPlans.length > 0) && (
        <section className="max-w-5xl mx-auto px-5 pb-16">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-black text-white">Choose Your Path</h2>
            <p className="text-text-secondary text-sm mt-2">
              {trialDays > 0 ? `Start free — ${trialDays} days on us, no card required.` : 'Simple pricing. Cancel anytime.'}
            </p>
          </div>
          <div className={`grid gap-4 items-stretch ${
            (membershipPlans.length + coachingPlans.length) >= 3 ? 'sm:grid-cols-2 lg:grid-cols-3'
            : (membershipPlans.length + coachingPlans.length) === 2 ? 'sm:grid-cols-2 max-w-2xl mx-auto'
            : 'max-w-sm mx-auto'
          }`}>
            {membershipPlans.map((plan, i) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
                className={`relative rounded-2xl p-5 h-full flex flex-col ${i === 0 ? 'border-2 border-accent bg-accent/[0.03]' : 'border border-white/10 bg-surface'}`}
              >
                {discountPercent > 0 && (
                  <div className="absolute -top-3 right-4 px-2.5 py-0.5 bg-danger rounded-full">
                    <span className="text-[10px] font-bold text-white">{discountPercent}% OFF</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mb-1">
                  <Crown className="w-3.5 h-3.5 text-accent" />
                  <p className="text-xs font-bold text-accent uppercase tracking-wide">{plan.name}</p>
                </div>
                <div className="flex items-baseline gap-1.5 mt-2">
                  {discountPercent > 0 ? (
                    <>
                      <span className="text-3xl font-black text-white">${applyDiscount(plan.priceMonthly, discountPercent).toFixed(2)}</span>
                      <span className="text-sm text-text-tertiary line-through">${plan.priceMonthly.toFixed(2)}</span>
                    </>
                  ) : (
                    <span className="text-3xl font-black text-white">${plan.priceMonthly.toFixed(2)}</span>
                  )}
                  <span className="text-xs text-text-secondary">/month</span>
                </div>
                {trialDays > 0 && (
                  <p className="text-[11px] text-accent mt-1 font-medium">{trialDays}-day free trial, no payment required</p>
                )}
                {plan.description && (
                  <p className="text-xs text-text-secondary mt-2 leading-relaxed">{plan.description}</p>
                )}
                <ul className="mt-4 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-text-secondary">
                      <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Link href="/onboarding" className="block pt-5 mt-auto">
                  <Button fullWidth size="md" variant={i === 0 ? 'primary' : 'secondary'}>
                    {trialDays > 0 ? `Start ${trialDays}-Day Free Trial` : 'Join Now'} <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </motion.div>
            ))}
            {coachingPlans.map((plan) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.35, delay: 0.05 }}
                className="relative rounded-2xl border border-white/10 bg-surface p-5 h-full flex flex-col"
              >
                {discountPercent > 0 && (
                  <div className="absolute -top-3 right-4 px-2.5 py-0.5 bg-danger rounded-full">
                    <span className="text-[10px] font-bold text-white">{discountPercent}% OFF</span>
                  </div>
                )}
                <p className="text-xs font-bold text-text-secondary uppercase tracking-wide mb-1">{plan.name}</p>
                <div className="flex items-baseline gap-1.5 mt-2">
                  {discountPercent > 0 ? (
                    <>
                      <span className="text-3xl font-black text-white">${applyDiscount(plan.priceMonthly, discountPercent).toFixed(2)}</span>
                      <span className="text-sm text-text-tertiary line-through">${plan.priceMonthly?.toFixed(2)}</span>
                    </>
                  ) : (
                    <span className="text-3xl font-black text-white">${plan.priceMonthly?.toFixed(2)}</span>
                  )}
                  <span className="text-xs text-text-secondary">/month</span>
                </div>
                <p className="text-xs text-text-secondary mt-2 leading-relaxed">{plan.description}</p>
                <ul className="mt-4 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-text-secondary">
                      <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Link href="/onboarding" className="block pt-5 mt-auto">
                  <Button fullWidth size="md" variant="secondary">
                    Apply Now <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Social proof strip */}
      {landing.socialProof.length > 0 && (
        <section className="max-w-3xl mx-auto px-5 pb-16">
          <div className="rounded-2xl border border-white/8 bg-surface p-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-8 justify-center">
            {landing.socialProof.map((line) => (
              <div key={line} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0" />
                <span className="text-sm text-text-secondary">{line}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Public leaderboard — social proof; only names + level/streak, never email or PII */}
      {landing.showPublicLeaderboard !== false && leaderboard.length > 0 && (
        <section className="max-w-2xl mx-auto px-5 pb-16">
          <div className="text-center mb-6">
            <h2 className="text-2xl sm:text-3xl font-black text-white">Top Athletes This Season</h2>
            <p className="text-text-secondary text-sm mt-2">Real members. Real progress.</p>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4 }}
            className="rounded-2xl border border-white/8 bg-surface divide-y divide-white/5 overflow-hidden"
          >
            {leaderboard.map((entry, i) => (
              <div key={entry.displayName + i} className="flex items-center gap-3 px-4 py-3">
                <span className={`w-6 text-sm font-black flex-shrink-0 ${i === 0 ? 'text-accent' : 'text-text-tertiary'}`}>
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-white truncate">{entry.displayName}</span>
                <span className="flex items-center gap-1 text-xs text-purple-400 flex-shrink-0">
                  <Zap className="w-3.5 h-3.5" /> Lvl {entry.powerLevel}
                </span>
                {entry.streak > 0 && (
                  <span className="flex items-center gap-1 text-xs text-orange-400 flex-shrink-0">
                    <Flame className="w-3.5 h-3.5" /> {entry.streak}d
                  </span>
                )}
              </div>
            ))}
          </motion.div>
        </section>
      )}

      {/* FAQ — kills objections right before the final ask */}
      <section className="max-w-2xl mx-auto px-5 pb-16">
        <div className="text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-black text-white">Questions? Answered.</h2>
        </div>
        <div className="rounded-2xl border border-white/8 bg-surface px-5">
          {FAQ_ITEMS.map((item, i) => (
            <FaqItem
              key={item.q}
              q={item.q}
              a={item.a}
              open={openFaq === i}
              onToggle={() => setOpenFaq(openFaq === i ? null : i)}
            />
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-2xl mx-auto px-5 pb-20 text-center">
        <h2 className="text-2xl sm:text-3xl font-black text-white">{landing.finalCtaHeadline}</h2>
        <p className="text-text-secondary text-sm mt-2 mb-6">{landing.finalCtaSubtext}</p>
        <Link href="/onboarding">
          <Button size="lg" className="px-10">
            {primaryCtaLabel} <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-5">
          <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
            <ShieldCheck className="w-3.5 h-3.5 text-accent" /> Secure checkout
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
            <XCircle className="w-3.5 h-3.5 text-accent" /> Cancel anytime
          </div>
          {trialDays > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
              <CheckCircle2 className="w-3.5 h-3.5 text-accent" /> No card required for trial
            </div>
          )}
        </div>
      </section>

      <footer className="max-w-5xl mx-auto px-5 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/8">
        <p className="text-xs text-text-tertiary">&copy; {new Date().getFullYear()} {appName}. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="text-xs text-text-tertiary hover:text-white transition-colors">Privacy</Link>
          <Link href="/terms" className="text-xs text-text-tertiary hover:text-white transition-colors">Terms</Link>
        </div>
      </footer>
    </div>
  );
}
