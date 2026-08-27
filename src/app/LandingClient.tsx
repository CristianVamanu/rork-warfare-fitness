'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  Dumbbell, Apple, ScanLine, Users, MessageCircle, Timer, Ban, Trophy, Camera, Sparkles,
  ArrowRight, CheckCircle2, Crown, Check, Flame, Zap, ShieldCheck, XCircle, ChevronDown, User,
  Menu, X as XIcon, Clock, BarChart3, Anchor, Compass, Shield, Swords, Footprints, Waves, LifeBuoy, Mountain, PlayCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getSystemConfig, getMembershipConfig, getCoachingPlans, getMembershipPlans, createLandingLead } from '@/lib/firestore';
import { trackEvent } from '@/lib/analytics';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { DEFAULT_LANDING_CONFIG } from '@/lib/landingDefaults';
import { getActiveDiscountPercent, applyDiscount, getPlanBillingPeriods } from '@/lib/utils';
import type { LandingPageConfig, MembershipConfig, CoachingPlan, MembershipPlan } from '@/types';

// Icon/color is matched by keyword in the feature's title rather than by
// array position — an admin adding/reordering/removing feature entries in
// the landing-page editor used to desync every icon and the hero/
// full-width special-casing below it (both were keyed to a fixed index,
// assuming a specific save order that a real edit broke immediately).
// Keyword matching survives any order or count; anything unrecognized
// (a brand-new custom feature) falls back to the generic Sparkles icon.
const FEATURE_STYLE_RULES: { match: RegExp; icon: typeof Dumbbell; color: string; bg: string }[] = [
  { match: /program|adapt/i, icon: Dumbbell, color: 'text-purple-400', bg: 'bg-purple-400/10' },
  { match: /food|meal|nutrition/i, icon: Apple, color: 'text-green-400', bg: 'bg-green-400/10' },
  { match: /barcode|scan-a/i, icon: ScanLine, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  { match: /scan\s*&?\s*go/i, icon: Camera, color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
  { match: /elite|unit|train like/i, icon: MessageCircle, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  { match: /fast/i, icon: Timer, color: 'text-sky-400', bg: 'bg-sky-400/10' },
  { match: /habit/i, icon: Ban, color: 'text-red-400', bg: 'bg-red-400/10' },
  { match: /streak|xp|leaderboard/i, icon: Trophy, color: 'text-accent', bg: 'bg-accent-muted' },
  { match: /communit/i, icon: Users, color: 'text-orange-400', bg: 'bg-orange-400/10' },
];
const DEFAULT_FEATURE_STYLE = { icon: Sparkles, color: 'text-teal-400', bg: 'bg-teal-400/10' };
function getFeatureStyle(title: string) {
  return FEATURE_STYLE_RULES.find((r) => r.match.test(title)) ?? DEFAULT_FEATURE_STYLE;
}

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
  {
    q: "What if it's not for me?",
    a: "Start with the free trial — no card required, so there's nothing to refund if it's not a fit. Once you're a paying member, cancel anytime from your account and you won't be billed again; you keep access through the end of the period you already paid for.",
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
  { href: '/download', label: 'Download App' },
  { href: '/trainers', label: 'For Trainers' },
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

const TICKER_ITEMS = [
  'Train Like The Elite', 'AI-Matched From Day One', 'Adapts To Every Rep',
  'No Generic Plans', 'Built To Adapt', 'Consistency Over Motivation',
];

// Infinite scrolling ticker — two identical copies of the same content
// back to back, animated translateX(-50%) so the loop seam is invisible.
// Purely decorative momentum between the feature grid and the rest of the
// page, which previously went flat straight into plain stacked sections.
function TacticalTicker() {
  return (
    <div className="relative overflow-hidden border-y border-accent/15 bg-gradient-to-r from-accent/[0.06] via-accent/[0.03] to-accent/[0.06] py-3">
      <div className="landing-marquee flex whitespace-nowrap">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex gap-10 pr-10 flex-shrink-0">
            {TICKER_ITEMS.map((t, i) => (
              <span key={i} className="flex items-center gap-2.5 text-accent font-black text-xs sm:text-sm tracking-widest uppercase">
                {t} <span className="text-white/15">✦</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Diagonal hazard-stripe divider — a cheap, thematic (tactical/warfare)
// section break that reads as far more "designed" than a plain border.
function TacticalStripe() {
  return (
    <div
      className="h-2 w-full opacity-40"
      style={{
        backgroundImage: 'repeating-linear-gradient(-45deg, var(--accent, #F5A623) 0 10px, transparent 10px 20px)',
      }}
      aria-hidden="true"
    />
  );
}

// Slow-drifting blurred glow orb, scoped to whatever section wraps it
// (that section must be `relative overflow-hidden`) so it scales with
// content instead of needing a fixed pixel offset down a page whose total
// height varies by admin-configured content.
function GlowOrb({ className }: { className: string }) {
  return <div className={`orb-drift pointer-events-none absolute rounded-full blur-3xl ${className}`} aria-hidden="true" />;
}

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

export default function LandingPage({
  initialAppName,
  initialLogoUrl,
  initialLanding,
  initialMembership,
}: {
  initialAppName: string;
  initialLogoUrl: string | null;
  initialLanding: LandingPageConfig;
  initialMembership: MembershipConfig | null;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  // Seeded from a server-side fetch of the same admin-configured Firestore
  // doc this effect below re-fetches — so the very first paint already
  // shows the real headline instead of DEFAULT_LANDING_CONFIG's copy
  // flashing for a second before the client fetch resolves. Same reasoning
  // for membership: without seeding it, primaryCtaLabel below always
  // computed off trialDays=0 first (membership starts null) and visibly
  // swapped labels ("Get Matched Free" -> "Start N-Day Free Trial") the
  // moment the client-side getMembershipConfig() call resolved.
  const [appName, setAppName] = useState(initialAppName);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [landing, setLanding] = useState<LandingPageConfig>(initialLanding);
  const [membership, setMembership] = useState<MembershipConfig | null>(initialMembership);
  const [coachingPlans, setCoachingPlans] = useState<CoachingPlan[]>([]);
  const [membershipPlans, setMembershipPlans] = useState<MembershipPlan[]>([]);
  const [leaderboard, setLeaderboard] = useState<{ displayName: string; powerLevel: number; streak: number; totalWorkouts: number }[]>([]);
  const [stats, setStats] = useState<{ totalUsers: number; totalWorkouts: number } | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [quickSex, setQuickSex] = useState<'male' | 'female' | null>(null);
  const [programs, setPrograms] = useState<PublicProgram[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<PublicProgram | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [exitIntentOpen, setExitIntentOpen] = useState(false);
  const [exitEmail, setExitEmail] = useState('');
  const [exitSubmitting, setExitSubmitting] = useState(false);
  const [exitSubmitted, setExitSubmitted] = useState(false);

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
    getMembershipPlans().then((plans) => setMembershipPlans(plans.filter((p) => p.active && getPlanBillingPeriods(p).length > 0))).catch(() => {});
    fetch('/api/public/leaderboard').then((r) => r.json()).then((d) => setLeaderboard(d.entries ?? [])).catch(() => {});
    fetch('/api/public/stats').then((r) => r.json()).then(setStats).catch(() => {});
    fetch('/api/public/programs').then((r) => r.json()).then((d) => setPrograms(d.programs ?? [])).catch(() => {});
  }, []);

  // Exit-intent lead capture — catches a visitor about to leave without
  // converting, instead of losing them with nothing to retarget/nurture.
  // Desktop: fires the instant the cursor exits through the TOP of the
  // viewport (the classic "moving toward the tab bar/back button" motion) —
  // that's not available on touch devices, so mobile instead gets a
  // fallback: shown once the visitor has genuinely engaged (scrolled past
  // the hero) and then been idle-on-page for a while, rather than never
  // showing at all. Shown at most once per session either way.
  const SHOWN_KEY = 'wf_exit_intent_shown';
  useEffect(() => {
    if (loading || user) return;
    try {
      if (sessionStorage.getItem(SHOWN_KEY)) return;
    } catch { /* private browsing — just skip the session cap */ }

    // The sessionStorage check above only runs once, when this effect first
    // attaches its listeners — it does NOT stop the listeners themselves
    // from firing again afterward. Without this in-memory guard checked
    // INSIDE trigger() itself, the very first exit-intent correctly opened
    // the modal and wrote the session flag, but the mouseleave listener
    // stayed attached and re-opened the modal on every single subsequent
    // cursor-exit-through-the-top for the rest of the visit — reported live
    // as the popup reappearing on every cursor move near the top of the
    // page. Removing the listeners immediately after the first trigger
    // (not just on unmount) closes both the "keeps reappearing" bug and
    // the "reappears after dismissing" case, since dismissing the modal
    // (onClose) doesn't re-run this effect at all.
    let shown = false;
    const trigger = () => {
      if (shown) return;
      shown = true;
      setExitIntentOpen(true);
      try { sessionStorage.setItem(SHOWN_KEY, '1'); } catch { /* ignore */ }
      cleanup();
    };

    const onMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) trigger();
    };
    document.addEventListener('mouseleave', onMouseLeave);

    let mobileTimer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (mobileTimer || window.scrollY <= window.innerHeight * 0.5) return;
      mobileTimer = setTimeout(trigger, 20000);
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    function cleanup() {
      document.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('scroll', onScroll);
      if (mobileTimer) clearTimeout(mobileTimer);
    }
    return cleanup;
  }, [loading, user]);

  async function handleExitEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(exitEmail)) {
      toast.error('Enter a valid email address.');
      return;
    }
    setExitSubmitting(true);
    try {
      const email = exitEmail.trim();
      await createLandingLead(email);
      trackEvent('Lead');
      setExitSubmitted(true);
      // Best-effort — the popup already promises "we'll send you a link",
      // so this actually has to fire, not just the Firestore write. Never
      // blocks the success state on it: a failed send here shouldn't make
      // an already-captured lead look like the whole thing failed.
      fetch('/api/email/landing-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }).catch(() => {});
    } catch {
      toast.error('Something went wrong — try again.');
    } finally {
      setExitSubmitting(false);
    }
  }

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
            <div className={`w-[4.5rem] h-[4.5rem] rounded-2xl flex items-center justify-center overflow-hidden flex-shrink-0 ${logoUrl ? '' : 'bg-accent'}`}>
              {logoUrl ? (
                <Image src={logoUrl} alt={appName} width={72} height={72} className="w-full h-full object-cover" onError={() => setLogoUrl(null)} />
              ) : (
                <span className="text-xl font-black text-black">{appName[0]}</span>
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
              personal choice (their sex) before they even leave the landing
              page builds investment in the result, the same trick
              quiz-funnel apps use. Age used to be asked here too, but it's
              the less important of the two to front-load — it's asked in
              onboarding instead (still right at the start there, just not
              on the landing page itself). Rides along as a query param and
              pre-fills the same field on the biometrics step. */}
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
            {/* Mandatory — an unset sex used to just skip straight to
                asking again in onboarding, making this box pointless
                busywork instead of an actual head start. Disabled instead
                of letting a blank value silently pass through as before. */}
            <Link
              href={quickSex ? `/onboarding?sex=${quickSex}` : '#'}
              onClick={(e) => { if (!quickSex) e.preventDefault(); }}
              className="block"
              aria-disabled={!quickSex}
            >
              <Button size="lg" fullWidth disabled={!quickSex}>
                {primaryCtaLabel} <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            {!quickSex && (
              <p className="text-[11px] text-text-tertiary text-center mt-2">Select your gender to continue.</p>
            )}
          </div>

          <div className="flex items-center justify-center gap-4 mt-5 flex-wrap">
            <p className="text-xs text-text-tertiary">No credit card required</p>
            <span className="text-text-tertiary">·</span>
            <Link href="/login" className="text-xs text-accent font-medium hover:underline">
              {landing.ctaSecondaryLabel}
            </Link>
            {landing.heroDemoVideoUrl && (
              <>
                <span className="text-text-tertiary">·</span>
                <button
                  onClick={() => setDemoOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-accent font-medium hover:underline"
                >
                  <PlayCircle className="w-3.5 h-3.5" /> Watch Demo
                </button>
              </>
            )}
          </div>

          {/* Verifiable trust signals about the product itself — shown
              unconditionally, unlike the real-usage stats/testimonials below
              which are correctly gated behind having real data. A brand-new
              install with zero users yet would otherwise show NO trust
              signal at all above the fold, right when a cold visitor needs
              one most. These claims are true regardless of user count, so
              there's nothing fabricated about showing them from day one. */}
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-6">
            <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
              <ShieldCheck className="w-3.5 h-3.5 text-accent" /> Secure checkout
            </div>
            <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
              <XCircle className="w-3.5 h-3.5 text-accent" /> Cancel anytime
            </div>
            <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
              <CheckCircle2 className="w-3.5 h-3.5 text-accent" /> Matched to you in 2 minutes
            </div>
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

      {/* Feature grid — uniform equal-size cards. Deliberately NOT a
          position-dependent bento layout (a wide "hero" first tile, a
          full-width last tile) — that broke the moment an admin added,
          removed, or reordered a feature in the landing-page editor, since
          the hero/full-width slots and icon assignment were both keyed to
          a fixed index that only matched one specific save order. A plain
          uniform grid always looks right regardless of count or order. */}
      <TacticalStripe />

      <section className="relative overflow-hidden max-w-5xl mx-auto px-5 pt-16 pb-16">
        <GlowOrb className="w-80 h-80 bg-accent/[0.08] -top-20 -left-20 -z-10" />
        <GlowOrb className="w-72 h-72 bg-accent/[0.06] bottom-0 -right-16 -z-10" />
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-black text-white">Everything you need. Nothing you don&apos;t.</h2>
          <p className="text-text-secondary text-sm mt-2">One app for training, nutrition, accountability, and progress.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
          {landing.features.map((f, i) => {
            const style = getFeatureStyle(f.title);
            return (
              <motion.div
                key={`${f.title}-${i}`}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.35, delay: (i % 3) * 0.05 }}
                className="p-5 rounded-2xl border border-white/8 bg-surface hover:border-accent/30 transition-colors flex flex-col items-start"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${style.bg} flex-shrink-0`}>
                  <style.icon className={`w-5 h-5 ${style.color}`} />
                </div>
                <h3 className="font-bold text-white text-sm">{f.title}</h3>
                <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">{f.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      <TacticalTicker />

      {/* Programs — pulled from /api/public/programs (published Firestore
          programs + built-in seed programs), so this always reflects
          whatever's actually assignable, never hand-maintained copy that
          could drift out of sync with the real program library. */}
      {programs.length > 0 && (
        <section id="programs" className="relative overflow-hidden max-w-5xl mx-auto px-5 pb-16 scroll-mt-6">
          <GlowOrb className="w-72 h-72 bg-accent/10 -top-10 -left-16 -z-10" />
          <GlowOrb className="w-80 h-80 bg-accent/[0.07] bottom-0 -right-20 -z-10" />
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
                className="rounded-2xl border border-white/8 bg-surface hover:border-accent/30 hover:shadow-glow-accent transition-all overflow-hidden flex flex-col cursor-pointer text-left"
              >
                {/* Fixed-aspect image slot, same size for every card — a
                    themed gradient + icon fallback when no admin image is
                    set yet, so the grid never looks unfinished. */}
                <div className="w-full aspect-square relative bg-surface-elevated flex-shrink-0">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.name} className="w-full h-full object-contain p-2" />
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
                  {/* Straight to onboarding with the chosen program attached
                      (see onboarding/page.tsx's `programId` handling) — this
                      used to go to /login with no memory of which program
                      was clicked, so a visitor who picked, say, SEAL
                      Selection would sign up and get handed whatever the AI
                      matcher picked instead, silently ignoring their choice. */}
                  <Link href={`/onboarding?programId=${p.id}`} onClick={(e) => e.stopPropagation()} className="block pt-4 mt-auto">
                    <Button fullWidth size="sm">Enroll Now <ArrowRight className="w-3.5 h-3.5" /></Button>
                  </Link>
                </div>
              </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* Demo video modal — admin-uploaded product walkthrough, only shown
          once landing.heroDemoVideoUrl is set (Admin → Landing Page). Not
          autoplaying/looping like the small hero logo clip — this is a real
          demo the visitor chose to watch, so normal video controls apply. */}
      <Modal open={demoOpen} onClose={() => setDemoOpen(false)} title="See it in action">
        {landing.heroDemoVideoUrl && (
          <video
            key={landing.heroDemoVideoUrl}
            className="w-full rounded-xl bg-black"
            src={landing.heroDemoVideoUrl}
            poster={landing.heroDemoPosterUrl || undefined}
            controls
            autoPlay
            playsInline
            crossOrigin="anonymous"
          />
        )}
      </Modal>

      {/* Exit-intent email capture — see the effect above for trigger logic. */}
      <Modal open={exitIntentOpen} onClose={() => setExitIntentOpen(false)} title="Not ready yet?">
        {exitSubmitted ? (
          <div className="text-center py-2">
            <CheckCircle2 className="w-10 h-10 text-accent mx-auto mb-3" />
            <p className="text-sm text-text-secondary">You&apos;re all set — we&apos;ll send you a link to jump back in anytime.</p>
          </div>
        ) : (
          <form onSubmit={handleExitEmailSubmit} className="space-y-4">
            <p className="text-sm text-text-secondary leading-relaxed">
              Leave your email and we&apos;ll send you a link to pick up your program right where you left off. No spam, ever.
            </p>
            <input
              type="email"
              value={exitEmail}
              onChange={(e) => setExitEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
            />
            <Button type="submit" fullWidth loading={exitSubmitting}>
              Send Me The Link
            </Button>
          </form>
        )}
      </Modal>

      {/* Program detail modal — opened from a card click, shows the full
          description instead of the 2-line clamp, without leaving the page. */}
      <Modal open={!!selectedProgram} onClose={() => setSelectedProgram(null)} title={selectedProgram?.name ?? ''}>
        {selectedProgram && (
          <div className="space-y-4">
            {selectedProgram.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedProgram.imageUrl} alt={selectedProgram.name} className="w-full aspect-square object-contain bg-black/20 rounded-xl p-3" />
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-1 rounded-lg bg-white/8 text-[10px] font-bold text-white uppercase tracking-wide">
                {selectedProgram.level}
              </span>
              <span className="px-2 py-1 rounded-lg bg-white/8 text-[10px] font-bold text-text-secondary uppercase tracking-wide">
                {GOAL_LABEL[selectedProgram.goal] ?? selectedProgram.goal}
              </span>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{selectedProgram.description}</p>
            <div className="flex items-center gap-4 text-xs text-text-tertiary">
              <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {selectedProgram.weeks} weeks</span>
              <span className="flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> {selectedProgram.daysPerWeek} days/week</span>
            </div>
            <Link href={`/onboarding?programId=${selectedProgram.id}`} className="block pt-2">
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
            className="relative rounded-3xl border border-white/10 bg-surface p-8 sm:p-12 text-center overflow-hidden"
          >
            <GlowOrb className="w-64 h-64 bg-accent/[0.08] -top-20 -right-20 -z-10" />
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

      {/* Real member transformation photos — admin-editable only, never
          fabricated (see LandingPageConfig.transformationPhotos), hidden
          entirely until real ones are added in Admin -> Landing Page.
          Visual, not text, proof — the single highest-converting element in
          this niche and the one thing pure copy can't substitute for. */}
      {landing.transformationPhotos && landing.transformationPhotos.length > 0 && (
        <section className="max-w-5xl mx-auto px-5 pb-16">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-black text-white">Real Results</h2>
            <p className="text-text-secondary text-sm mt-2">Real members, real progress — no stock photos.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {landing.transformationPhotos.map((p, i) => (
              <motion.div
                key={p.imageUrl + i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.35, delay: (i % 4) * 0.05 }}
                className="rounded-2xl overflow-hidden border border-white/8 bg-surface"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imageUrl} alt={p.caption ?? 'Member transformation'} className="w-full aspect-[3/4] object-cover" />
                {p.caption && (
                  <p className="text-xs text-text-secondary p-3 leading-relaxed">{p.caption}</p>
                )}
              </motion.div>
            ))}
          </div>
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
      {(membershipPlans.length > 0 || coachingPlans.length > 0) && <TacticalStripe />}
      {(membershipPlans.length > 0 || coachingPlans.length > 0) && (
        <section className="relative overflow-hidden max-w-5xl mx-auto px-5 pb-16">
          <GlowOrb className="w-96 h-96 bg-accent/[0.08] -top-16 left-1/2 -translate-x-1/2 -z-10" />
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
            {membershipPlans.map((plan, i) => {
              const displayPeriod = getPlanBillingPeriods(plan)[0];
              return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
                className={`relative rounded-2xl p-5 h-full flex flex-col bg-surface ${i === 0 ? 'border-2 border-accent' : 'border border-white/10'}`}
              >
                {/* Text label, not just the border color — a color-only cue
                    is easy to miss when someone's quickly scanning prices. */}
                {i === 0 && (
                  <div className="absolute -top-3 left-4 px-2.5 py-0.5 bg-accent rounded-full">
                    <span className="text-[10px] font-bold text-black uppercase tracking-wide">Most Popular</span>
                  </div>
                )}
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
                      <span className="text-3xl font-black text-white">${applyDiscount(displayPeriod.price, discountPercent).toFixed(2)}</span>
                      <span className="text-sm text-text-tertiary line-through">${displayPeriod.price.toFixed(2)}</span>
                    </>
                  ) : (
                    <span className="text-3xl font-black text-white">${displayPeriod.price.toFixed(2)}</span>
                  )}
                  <span className="text-xs text-text-secondary">{displayPeriod.months === 1 ? '/month' : ` / ${displayPeriod.months}mo`}</span>
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
                <Link href={`/onboarding?planId=${plan.id}`} className="block pt-5 mt-auto">
                  <Button fullWidth size="md" variant={i === 0 ? 'primary' : 'secondary'}>
                    {trialDays > 0 ? `Start ${trialDays}-Day Free Trial` : 'Join Now'} <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </motion.div>
              );
            })}
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
                <Link href={`/onboarding?coachingPlanId=${plan.id}`} className="block pt-5 mt-auto">
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

      <TacticalStripe />

      {/* Final CTA */}
      <section className="relative overflow-hidden max-w-2xl mx-auto px-5 pt-16 pb-20 text-center">
        <GlowOrb className="w-[420px] h-[420px] bg-accent/[0.1] top-0 left-1/2 -translate-x-1/2 -translate-y-1/3 -z-10" />
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
