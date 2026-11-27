'use client';

import { isNativeApp } from '@/lib/native/health';
import { GooglePlayBadge } from '@/components/ui/GooglePlayBadge';
import { PLAY_STORE_URL, androidStoreUrl } from '@/lib/storeLinks';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { UNIT_STANDARDS, standardFor, formatMinutes } from '@/lib/ptStandards';
import { DataDivider, SectionEyebrow, CornerBrackets } from '@/components/landing/chrome';
import { AppShowcase } from '@/components/landing/AppShowcase';
import { LandingNav } from '@/components/landing/Redesign';
import { WxHero, WxStrip, WxFacts, WxCards, WxCentre, WxRipz, WxSteps, WxFinal, WxFooter, WxGuarantee, WxPlans, WxWhy, WxTrial } from '@/components/landing/Warfare';

import {
  Dumbbell, Apple, ScanLine, Users, MessageCircle, Timer, Ban, Trophy, Camera, Sparkles,
  ArrowRight, CheckCircle2, Crown, Check, Flame, Zap, ShieldCheck, XCircle, ChevronDown,
  Menu, X as XIcon, Clock, BarChart3, Anchor, Compass, Shield, Swords, Footprints, Waves, LifeBuoy, Mountain, PlayCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getSystemConfig, getMembershipConfig, getCoachingPlans, getMembershipPlans, createLandingLead } from '@/lib/firestore';
import { trackEvent } from '@/lib/analytics';
import { funnelHit } from '@/lib/funnel';
import { BrandSplash } from '@/components/ui/BrandSplash';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { DEFAULT_LANDING_CONFIG } from '@/lib/landingDefaults';
import { getActiveDiscountPercent, applyDiscount, getPlanBillingPeriods, buildTrialTerms, getCheapestEntryPrice, formatBillingPeriod } from '@/lib/utils';
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
  { match: /streak|xp|level/i, icon: Trophy, color: 'text-accent', bg: 'bg-accent-muted' },
  { match: /communit/i, icon: Users, color: 'text-orange-400', bg: 'bg-orange-400/10' },
];
const DEFAULT_FEATURE_STYLE = { icon: Sparkles, color: 'text-teal-400', bg: 'bg-teal-400/10' };
function getFeatureStyle(title: string) {
  return FEATURE_STYLE_RULES.find((r) => r.match.test(title)) ?? DEFAULT_FEATURE_STYLE;
}

const FAQ_ITEMS = [
  {
    q: "I'm overweight and can't do a push-up. Can I still start?",
    a: "Yes. That is exactly who the beginner programs are for. You start with easier versions of each move, every exercise has a demo video, and the weights and reps only go up when your logged sessions show you're ready.",
  },
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
    q: "What if I don't like the program I'm matched with?",
    a: "Switch it. The quiz picks a starting point, not a sentence — every program in the library is open to you, and you can change from your training screen whenever you like. Your progress on the old one is saved, so you can come back to it.",
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

// The readout on the standards card. Pulled from the same data the test
// scores against, so the landing page can never quote a number the test
// itself disagrees with — the one drift that would undermine the whole
// "real published standards" claim on the page that makes it.
const RECON_STANDARD = standardFor('recon');
const RECON_SAMPLE = {
  label: RECON_STANDARD?.label ?? 'Marine Recon',
  rows: [
    { label: 'Pull-ups', value: String(RECON_STANDARD?.events.pullups ?? 15) },
    { label: 'Push-ups', value: String(RECON_STANDARD?.events.pushups ?? 60) },
    { label: '3-mile run', value: formatMinutes(RECON_STANDARD?.events.runMinutes ?? 19.5) },
  ],
};

// Terms and Privacy are footer links, not header ones; with them out the
// row fits on one line at desktop widths.
const HEADER_LINKS = ['/', '/programs', '/standards', '/challenges', '/download', '/trainers', '/partners'];
const NAV_LINKS = [
  { href: '/', label: 'Home' },
  // Points at the real, indexable pages rather than an anchor on this one.
  // The anchor scrolled to a teaser; /programs is eleven pages of actual
  // content a search engine can read and a visitor can dig into.
  { href: '/programs', label: 'Programs' },
  // One entry, not eleven. The individual unit pages hang off /standards and
  // are reached from that page or from search, never from the menu.
  { href: '/standards', label: 'Standards' },
  { href: '/challenges', label: 'Challenges' },
  { href: '/ripz', label: 'Ripz' },
  { href: '/download', label: 'Download App' },
  { href: '/trainers', label: 'For Trainers' },
  { href: '/partners', label: 'Partners' },
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
  'Train Like The Elite', 'Matched To You From Day One', 'Adapts To Every Rep',
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

/** "Monthly", "Yearly", or "Every 3 months" for a billing period length. */
function billingLabel(months?: number): string {
  if (!months || months === 1) return 'Monthly';
  if (months === 12) return 'Yearly';
  return `Every ${months} months`;
}

export default function LandingPage({
  initialAppName,
  initialLogoUrl,
  initialLanding,
  initialMembership,
  initialMembershipPlans,
}: {
  initialAppName: string;
  initialLogoUrl: string | null;
  initialLanding: LandingPageConfig;
  initialMembership: MembershipConfig | null;
  initialMembershipPlans: MembershipPlan[];
}) {
  const navLinks = NAV_LINKS;
  const { user, loading } = useAuth();
  const router = useRouter();
  // Top of the funnel: one count per browser session, cookie-free.
  useEffect(() => { funnelHit('visit'); }, []);
  // Seeded from a server-side fetch of the same admin-configured Firestore
  // doc this effect below re-fetches — so the very first paint already
  // shows the real headline instead of DEFAULT_LANDING_CONFIG's copy
  // flashing for a second before the client fetch resolves. Same reasoning
  // for membership: without seeding it, primaryCtaLabel below always
  // computed off trialDays=0 first (membership starts null) and visibly
  // swapped labels ("Get Matched Free" -> "Start N-Day Free Trial") the
  // moment the client-side getMembershipConfig() call resolved.
  const [appName, setAppName] = useState(initialAppName);
  // Phones show one plan at a time, chosen with the selector above it.
  const [pickedPlan, setPickedPlan] = useState<number | null>(null);
  // Store listings, shown in the footer once the admin enters them (Settings).
  // Shown to every visitor, iPhone included: it is proof the app is real as
  // much as a download link. Hidden only inside the app itself, which is
  // decided after mount so server and client HTML agree.
  const [showPlayBadge, setShowPlayBadge] = useState(true);
  useEffect(() => { if (isNativeApp()) setShowPlayBadge(false); }, []);
  const [storeUrls, setStoreUrls] = useState<{ android: string; ios: string }>({ android: PLAY_STORE_URL, ios: '' });
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [landing, setLanding] = useState<LandingPageConfig>(initialLanding);
  const [membership, setMembership] = useState<MembershipConfig | null>(initialMembership);
  const [coachingPlans, setCoachingPlans] = useState<CoachingPlan[]>([]);
  const [membershipPlans, setMembershipPlans] = useState<MembershipPlan[]>(
    () => initialMembershipPlans.filter((p) => p.active && getPlanBillingPeriods(p).length > 0)
  );
  const [stats, setStats] = useState<{ totalUsers: number; totalWorkouts: number } | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [programs, setPrograms] = useState<PublicProgram[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<PublicProgram | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [exitIntentOpen, setExitIntentOpen] = useState(false);
  const [exitEmail, setExitEmail] = useState('');
  const [exitSubmitting, setExitSubmitting] = useState(false);
  const [exitSubmitted, setExitSubmitted] = useState(false);

  useEffect(() => {
    if (loading) return;
    // Keep the pre-paint decision honest once auth has actually answered.
    // A signed-in user: make sure the splash is up (covers a device with no
    // flag yet) and go to the dashboard. No user: drop the attribute so a
    // stale flag — signed out on another tab, storage cleared — cannot
    // leave a stranger staring at the logo forever.
    try {
      if (user) document.documentElement.setAttribute('data-wf-session', '1');
      else document.documentElement.removeAttribute('data-wf-session');
    } catch { /* not in a browser */ }
    if (user) router.replace('/dashboard');
  }, [user, loading, router]);

  useEffect(() => {
    getSystemConfig().then((cfg) => {
      if (cfg?.appName) setAppName(cfg.appName as string);
      if (cfg?.logoUrl) setLogoUrl(cfg.logoUrl as string);
      setStoreUrls({ android: androidStoreUrl(cfg?.androidAppUrl), ios: ((cfg?.iosAppUrl as string) || '').trim() });
      if (cfg?.landingPage) setLanding({ ...DEFAULT_LANDING_CONFIG, ...(cfg.landingPage as LandingPageConfig) });
    }).catch(() => {});
    getMembershipConfig().then(setMembership).catch(() => {});
    getCoachingPlans().then((plans) => setCoachingPlans(plans.filter((p) => p.active))).catch(() => {});
    getMembershipPlans().then((plans) => setMembershipPlans(plans.filter((p) => p.active && getPlanBillingPeriods(p).length > 0))).catch(() => {});
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

  const anyPlanMarkedPopular = membershipPlans.some((p) => p.mostPopular);
  const trialDays = membership?.enabled ? (membership.trialDays ?? 0) : 0;
  const paidTrialEnabled = !!membership?.paidTrialEnabled;
  // Card-up-front trial: still free for trialDays, but a card IS taken at
  // checkout, so every 'no credit card required' claim on this page has to
  // stop making it.
  const cardUpFrontTrial = !paidTrialEnabled && !!membership?.cardUpFrontTrial;
  const trialPrice = ((membership?.trialPriceCents ?? 100) / 100).toFixed(2);
  const discountPercent = getActiveDiscountPercent(membership);
  // The hero used to spell out the post-trial price using the FEATURED plan,
  // on the reasoning that the hero CTA isn't tied to any plan the visitor has
  // picked. But "featured" is the plan the admin wants to sell, not the one
  // the visitor will necessarily buy — with a $19 tier on the page it printed
  // "then $49.00/mo" under the $1 button and misquoted everyone who chose the
  // cheaper plan. buildTrialTerms quotes the entry price instead.

  // No early return any more. The landing renders on the server for
  // everyone — strangers, crawlers, paid traffic — and a device that has a
  // session hides it behind the brand splash via CSS from before first paint
  // (layout.tsx sets the attribute; globals.css does the hiding) until the
  // redirect above lands. Returning a spinner here used to mean the server
  // sent an empty page to every visitor to spare members a flash.

  // Admin-editable landing copy can reference the live trial settings with
  // {appName} / {trialDays} / {trialPrice} placeholders, so changing Trial
  // Days from 7 to 14 (or switching on Paid Trial) updates the marketing
  // copy too instead of leaving it claiming "free for 7 days" forever.
  const fillPlaceholders = (text: string) => text
    .replace(/\{appName\}/g, appName)
    .replace(/\{trialDays\}/g, String(trialDays))
    .replace(/\{trialPrice\}/g, `$${trialPrice}`);
  const subheadline = fillPlaceholders(landing.subheadline);
  // A free trial needs no payment upfront — MembershipGuard grants access
  // automatically for trialDays from account creation, so the CTA can lead
  // straight to registration rather than a paid checkout. A paid trial
  // (MembershipConfig.paidTrialEnabled) is the opposite: it only exists to
  // get a card on file immediately, so both the label and every "no card
  // required" claim on this page have to say so honestly instead of
  // copy-pasting the free-trial promise onto a flow that now requires one.
  //
  // Both the label and the terms under it now come from buildTrialTerms, so
  // the hero cannot quote a price the pricing section below it contradicts.
  const trialTerms = buildTrialTerms({
    trialDays,
    paidTrialEnabled,
    cardUpFrontTrial,
    trialPriceCents: membership?.trialPriceCents,
    plans: membershipPlans,
    noTrialCtaLabel: landing.ctaPrimaryLabel,
  });
  const primaryCtaLabel = trialTerms.ctaLabel;

  // "Start for $1.00" states a price without stating that it renews, which is
  // the single most complaint-generating shape a paid-trial CTA can take — so
  // wherever that button appears, this line appears under it.
  //
  // It used to render in the hero only, and only when featuredPlanPrice was
  // non-null. Both halves were wrong. The final CTA at the bottom of the page
  // carried the same "$1" button with no renewal terms at all, and page.tsx
  // fetches plans with `.catch(() => [])` — so any Firestore hiccup emptied
  // membershipPlans, made featuredPlanPrice null, and silently dropped the
  // disclosure from the hero too while leaving the price on the button.
  // Disclosure now degrades to naming the term without the amount rather than
  // disappearing, and is never conditional on a fetch succeeding.
  // Shown for EVERY trial mode now, not just the paid one. A free trial that
  // takes a card still converts into a real charge, and saying so is what
  // stops the charge being a surprise.
  const paidTrialDisclosure = trialTerms.disclosure;
  // The admin's own demo video when set, otherwise the built-in app walkthrough.
  const demoUrl = landing.heroDemoVideoUrl || '/videos/demo.mp4';
  // The price, stated up front. Visitors who want the number scroll past
  // everything to find it; most of them leave first. Only real plan prices.
  const cheapestPlan = getCheapestEntryPrice(membershipPlans);
  const priceLine = (trialDays > 0 && !paidTrialEnabled && !cardUpFrontTrial) && cheapestPlan
    ? `No card needed. ${trialDays} days free, then ${membershipPlans.length > 1 ? "from " : ""}${formatBillingPeriod(cheapestPlan)}. Cancel anytime.`
    : null;

  // The anchors in the bar. Pricing is only offered when there are plans.
  const hasPricing = membershipPlans.length > 0 || coachingPlans.length > 0;
  const sectionLinks = [
    { href: '#top', label: 'Home' },
    { href: '#features', label: 'Features' },
    { href: '#screens', label: 'App Screens' },
    ...(hasPricing ? [{ href: '#pricing', label: 'Pricing' }] : []),
    { href: '#faq', label: 'FAQ' },
  ];
  // "No credit card required" only when that is true of the trial as configured.
  const noCardTrial = trialDays > 0 && !paidTrialEnabled && !cardUpFrontTrial;
  const ctaNote = noCardTrial ? 'No credit card required' : 'Cancel anytime';
  const finalNote = noCardTrial ? 'No credit card required. Cancel anytime.' : 'Cancel anytime.';
  // Facts, not claims: the program count is the live library, the video
  // count is the exercise library, and member numbers appear only once
  // there are enough of them to be worth stating.
  const facts = [
    // Shown straight away (last known library size) so the card never
    // renders half-empty while the live count loads, then corrected.
    { value: String(programs.length > 0 ? programs.length : 14), label: 'Training programs' },
    { value: '600+', label: 'Exercise demo videos' },
    ...(stats && stats.totalUsers >= 15
      ? [{ value: `${stats.totalWorkouts.toLocaleString()}+`, label: 'Workouts logged' }]
      : [{ value: trialDays > 0 ? `${trialDays} days` : '2 min', label: trialDays > 0 ? 'Free to try' : 'To get your program' }]),
  ];

  return (
    <>
      {/* Both are always in the HTML. Which one is visible is decided by CSS
          from the html[data-wf-session] attribute — see BrandSplash. */}
      <BrandSplash gated />
    <div data-landing-body className="min-h-screen bg-background overflow-x-hidden relative">
      <LandingNav sections={sectionLinks} pages={navLinks} appName={appName} showIos={!!storeUrls.ios} />

      {/* The owner's reference design. The button label, its note and the
          renewal terms all come from buildTrialTerms, so nothing here can
          promise "no card" on a trial that takes one. */}
      <WxHero
        ctaLabel={primaryCtaLabel}
        ctaNote={ctaNote}
        disclosure={noCardTrial ? null : paidTrialDisclosure}
        priceLine={priceLine}
        facts={facts}
        onDemo={() => setDemoOpen(true)}
      />
      <div className="wx-mid">
        <WxStrip />
        <WxFacts facts={facts} />
        <WxCards />
      </div>
      <WxRipz />
      {/* An admin who has uploaded their own screenshots still gets them shown. */}
      {landing.screenshotUrls && landing.screenshotUrls.length >= 3 && (
        <section className="relative max-w-5xl mx-auto px-5 pb-14">
          <AppShowcase items={landing.screenshotUrls.map((src, i) => ({ src, title: `Screen ${i + 1}`, caption: '' }))} />
        </section>
      )}
      {/* Order follows the proven pattern: promise, how it works, who it's
          for, the product, proof, price with risk removed, objections, and
          one last ask. The comparison table, feature grid, ticker, quote and
          partner panel were cut: they repeated what is above and pushed the
          price and the final ask two screens further down. Partners stays in
          the footer. */}
      <WxCentre playUrl={storeUrls.android} iosUrl={storeUrls.ios || undefined} />
      <WxSteps />
      <WxPlans programs={programs} onOpen={(id) => { const p = programs.find((x) => x.id === id); if (p) setSelectedProgram(p); }} />
      <WxWhy ctaLabel={primaryCtaLabel} />
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
              <div key={p.imageUrl + i} className="rounded-2xl overflow-hidden border border-white/8 bg-surface wf-rise" style={{ animationDelay: `${(i % 4) * 0.05}s` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imageUrl} alt={p.caption ?? 'Member transformation'} className="w-full aspect-[3/4] object-cover" />
                {p.caption && (
                  <p className="text-xs text-text-secondary p-3 leading-relaxed">{p.caption}</p>
                )}
              </div>
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
              <div key={`${t.name}-${i}`} className="rounded-2xl border border-white/8 bg-surface p-5 wf-rise" style={{ animationDelay: `${(i % 3) * 0.05}s` }}>
                <p className="text-sm text-text-secondary leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                <p className="text-sm font-bold text-white mt-3">{t.name}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Social proof strip */}
      {landing.socialProof.length > 0 && (
        <section className="wx-xtra max-w-3xl mx-auto px-5 pb-16">
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

      {/* Pricing */}
      {(membershipPlans.length > 0 || coachingPlans.length > 0) && <DataDivider />}
      {(membershipPlans.length > 0 || coachingPlans.length > 0) && (
        <section id="pricing" className="relative overflow-hidden max-w-5xl mx-auto px-5 pb-16 pt-10">
          <div className="text-center mb-8">
            <p className="text-accent text-xs font-bold tracking-[0.3em] uppercase mb-2">Pricing</p>
            <h2 className="text-3xl sm:text-5xl font-black italic uppercase text-white leading-none">Choose your <span className="text-accent">path</span></h2>
            <WxGuarantee trialDays={trialDays} noCard={noCardTrial} />
            <p className="text-text-secondary text-sm mt-2">
              {trialDays <= 0 ? 'Simple pricing. Cancel anytime.'
                : paidTrialEnabled ? `Try it for $${trialPrice} — ${trialDays} days, then your plan's price.`
                : cardUpFrontTrial ? `Free for ${trialDays} days. Card required, nothing charged until day ${trialDays + 1}. Cancel anytime.`
                : `Start free — ${trialDays} days on us, no card required.`}
            </p>
          </div>
          {(() => {
            const all = [...membershipPlans.map((p) => p.name), ...coachingPlans.map((p) => p.name)];
            // Billing cadence under each tab, so a yearly price is never read as monthly.
            const cadence = [...membershipPlans.map((p) => billingLabel(getPlanBillingPeriods(p)[0]?.months)), ...coachingPlans.map(() => 'Monthly')];
            if (all.length < 2) return null;
            const featured = Math.max(0, anyPlanMarkedPopular ? membershipPlans.findIndex((p) => p.mostPopular) : 0);
            const on = pickedPlan ?? featured;
            return (
              <div role="tablist" aria-label="Choose a plan" className="wx-psel sm:hidden" style={{ ['--n' as string]: all.length, ['--i' as string]: on }}>
                <span className="wx-psel-thumb" aria-hidden />
                {all.map((name, i) => (
                  <button key={name + i} type="button" role="tab" aria-selected={on === i} onClick={() => setPickedPlan(i)}>
                    <span className="block leading-tight">{name}</span>
                    {cadence[i] && <span className="block text-[10px] font-semibold tracking-[0.14em] opacity-75 leading-tight mt-0.5">{cadence[i].toUpperCase()}</span>}
                  </button>
                ))}
              </div>
            );
          })()}
          <div data-picked={pickedPlan ?? Math.max(0, anyPlanMarkedPopular ? membershipPlans.findIndex((p) => p.mostPopular) : 0)} className={`wx-pgrid grid gap-4 items-stretch ${
            (membershipPlans.length + coachingPlans.length) >= 3 ? 'sm:grid-cols-2 lg:grid-cols-3'
            : (membershipPlans.length + coachingPlans.length) === 2 ? 'sm:grid-cols-2 max-w-2xl lg:max-w-4xl mx-auto'
            : 'max-w-sm mx-auto'
          }`}>
            {membershipPlans.map((plan, i) => {
              const displayPeriod = getPlanBillingPeriods(plan)[0];
              // mostPopular is admin-set (Admin -> Membership -> the star
              // button on a plan); falls back to "just badge the first
              // plan" only when no admin has ever explicitly chosen one, so
              // existing installs that never touched this keep behaving
              // exactly as before.
              const isFeatured = anyPlanMarkedPopular ? !!plan.mostPopular : i === 0;
              return (
              // The panel classes here were lost when this card stopped
              // being a motion.div: the rewrite kept the animation and
              // dropped the className with it. Every one of them is
              // load-bearing — `relative` is what the "Most Popular" badge
              // is positioned against, and `h-full flex flex-col` is what
              // lets the CTA's `mt-auto` push it to the bottom so the two
              // cards' buttons line up regardless of how many features each
              // plan lists.
              <div
                key={plan.id}
                data-on={i === (pickedPlan ?? Math.max(0, anyPlanMarkedPopular ? membershipPlans.findIndex((p) => p.mostPopular) : 0))}
                className={`relative rounded-2xl p-5 h-full flex flex-col bg-surface wf-rise ${
                  isFeatured ? 'border-2 border-accent' : 'border border-white/10'
                }`}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                {/* Text label, not just the border color — a color-only cue
                    is easy to miss when someone's quickly scanning prices. */}
                {isFeatured && (
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
                  <span className="ml-auto px-2 py-0.5 rounded-full border border-white/15 text-[10px] font-bold text-white uppercase tracking-wide">
                    Billed {billingLabel(displayPeriod.months).toLowerCase()}
                  </span>
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
                  <span className="text-xs text-text-secondary">{displayPeriod.months === 1 ? '/month' : displayPeriod.months === 12 ? '/year' : ` / ${displayPeriod.months} months`}</span>
                </div>
                {displayPeriod.months > 1 && (() => {
                  const perMonth = displayPeriod.price / displayPeriod.months;
                  const monthly = membershipPlans.map((p) => p.priceMonthly).filter((n): n is number => typeof n === 'number' && n > 0).sort((a, b) => a - b)[0];
                  const saved = monthly ? monthly * displayPeriod.months - displayPeriod.price : 0;
                  return (
                    <p className="text-sm text-white mt-1 font-semibold">
                      That&apos;s ${perMonth.toFixed(2)}/month
                      {saved > 0 && <span className="ml-2 px-2 py-0.5 rounded-full bg-accent text-black text-[11px] font-bold">Save ${Math.round(saved)}</span>}
                    </p>
                  );
                })()}
                {/* Discount coupon is duration:'once' (see
                    plan-checkout/route.ts) — this is the first payment, not
                    the ongoing rate. Advertising it as the recurring price
                    on the public landing page is exactly how a customer
                    ends up disputing their second charge. */}
                {discountPercent > 0 && (
                  <p className="text-[11px] text-text-tertiary mt-1">
                    First payment only — renews at ${displayPeriod.price.toFixed(2)}{displayPeriod.months === 1 ? '/month' : ` / ${displayPeriod.months}mo`}
                  </p>
                )}
                {trialDays > 0 && (
                  <p className="text-[11px] text-accent mt-1 font-medium">
                    {paidTrialEnabled
                      ? `$${trialPrice} for ${trialDays} days, then this price applies`
                      : cardUpFrontTrial
                        ? `Free for ${trialDays} days — card required, cancel anytime`
                        : `${trialDays}-day free trial, no payment required`}
                  </p>
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
                  <Button fullWidth size="md" variant="primary">
                    {trialDays <= 0 ? 'Join Now' : paidTrialEnabled ? `Start for $${trialPrice}` : `Start ${trialDays}-Day Free Trial`} <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
              );
            })}
            {coachingPlans.map((plan, ci) => (
              <div key={plan.id} data-on={membershipPlans.length + ci === (pickedPlan ?? Math.max(0, anyPlanMarkedPopular ? membershipPlans.findIndex((p) => p.mostPopular) : 0))} className="relative rounded-2xl border border-white/10 bg-surface p-5 h-full flex flex-col wf-rise" style={{ animationDelay: `${0.05}s` }}>
                {discountPercent > 0 && (
                  <div className="absolute -top-3 right-4 px-2.5 py-0.5 bg-danger rounded-full">
                    <span className="text-[10px] font-bold text-white">{discountPercent}% OFF 1ST</span>
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
                {/* First-payment-only discount — same as above. */}
                {discountPercent > 0 && (
                  <p className="text-[11px] text-text-tertiary mt-1">
                    First payment only — renews at ${plan.priceMonthly?.toFixed(2)}/month
                  </p>
                )}
                <p className="text-xs text-text-secondary mt-2 leading-relaxed">{plan.description}</p>
                <ul className="mt-4 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-text-secondary">
                      <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Link href={`/onboarding?coachingPlanId=${plan.id}`} className="block pt-5 mt-auto">
                  <Button fullWidth size="md" variant={pickedPlan === membershipPlans.length + ci ? 'primary' : 'secondary'}>
                    Apply Now <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <WxTrial trialDays={trialDays} ctaLabel={primaryCtaLabel} note={noCardTrial ? 'No credit card required. Cancel anytime.' : (paidTrialDisclosure || 'Cancel anytime.')} />

      {/* FAQ — kills objections right before the final ask */}
      <section id="faq" className="wx-faq max-w-2xl lg:max-w-4xl mx-auto px-5 pb-16 pt-10">
        <div className="text-center mb-6 lg:mb-10">
          <h2 className="wx-h3">Questions? <span className="wx-o">Answered.</span></h2>
        </div>
        <div className="rounded-2xl border border-white/8 bg-surface px-5">
          {FAQ_ITEMS.map((item, i) => ({
            ...item,
            // The static FAQ copy promises a no-card free trial, which is
            // the opposite of what a paid trial actually is — overridden
            // here rather than duplicating the whole FAQ list per mode.
            a: paidTrialEnabled && i === FAQ_ITEMS.length - 1
              ? `Try it for $${trialPrice} — that gets you ${trialDays} full days before your plan's real price kicks in. Cancel anytime from your account before then and you won't be charged again.`
              : cardUpFrontTrial && trialDays > 0 && i === FAQ_ITEMS.length - 1
              ? `Start with the ${trialDays}-day free trial. A card is required to start it, but nothing is charged until the trial ends. Cancel anytime from your account before then and you pay nothing.`
              : item.a,
          })).map((item, i) => (
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

      {/* The free thing, first under the hero and asking for nothing.
          It is the only block on this page a stranger can act on without
          handing over an email or a card, and it is the one thing here no
          other fitness app offers — so it goes before the feature grid, not
          after it. Everything below this point asks for something.

          Dressed as an instrument rather than a marketing card: corner
          brackets, a slow readout sweep, and the numbers in a labelled panel.
          The point it makes visually is the point the product makes, which is
          that these are measurements, not motivation. */}
      <section id="selection" className="relative max-w-5xl mx-auto px-5 pt-14 pb-14">
        <Link
          href="/standards"
          className="group relative block overflow-hidden rounded-2xl border border-accent/25 bg-[#0B0B0C] p-6 sm:p-8 transition-all duration-300 hover:border-accent/60 hover:shadow-[0_0_60px_-18px_rgba(245,166,35,0.55)]"
        >
          {/* Instrument grid, fading toward the readout on the right. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                'linear-gradient(rgb(var(--accent-rgb) / 0.07) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--accent-rgb) / 0.07) 1px, transparent 1px)',
              backgroundSize: '34px 34px',
              maskImage: 'radial-gradient(ellipse 75% 85% at 88% 50%, black, transparent 72%)',
              WebkitMaskImage: 'radial-gradient(ellipse 75% 85% at 88% 50%, black, transparent 72%)',
            }}
          />
          {/* Ember wash from the corner the readout sits in. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(120% 130% at 100% 0%, rgb(var(--accent-rgb) / 0.16) 0%, transparent 58%)' }}
          />
          {/* Hairline along the top edge — brightest in the middle. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--accent-rgb) / 0.65), transparent)' }}
          />
          {/* Corner brackets. */}
          {[
            'left-3 top-3 border-l-2 border-t-2',
            'right-3 top-3 border-r-2 border-t-2',
            'left-3 bottom-3 border-l-2 border-b-2',
            'right-3 bottom-3 border-r-2 border-b-2',
          ].map((pos) => (
            <span
              key={pos}
              aria-hidden
              className={`pointer-events-none absolute w-5 h-5 border-accent/40 group-hover:border-accent/80 transition-colors duration-300 ${pos}`}
            />
          ))}

          <div className="relative flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.22em] text-accent">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-accent opacity-60 animate-ping motion-reduce:hidden" />
                  <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-accent" />
                </span>
                Free · no account
              </p>
              <h2 className="text-2xl sm:text-[34px] font-black text-white tracking-tight mt-3 leading-[1.08]">
                Could you pass selection?
              </h2>
              <p className="text-sm text-text-secondary mt-3 max-w-md leading-relaxed">
                The real published standards for Marine Recon, the SEALs, the Royal Marines, UKSF and more.
                Put your numbers in and find out which ones you would clear today.
              </p>
              <span className="inline-flex items-center gap-2 mt-5 h-10 px-4 rounded-xl bg-accent text-black text-sm font-extrabold transition-transform group-hover:translate-x-0.5">
                Test yourself <ArrowRight className="w-4 h-4" />
              </span>
            </div>

            {/* A readout, not three pills. Every figure is pulled from the
                same standards data the test scores against, so the landing
                page can never quote a number the test disagrees with. */}
            <div className="hidden sm:block flex-shrink-0 w-[13.5rem] rounded-xl border border-accent/20 bg-black/50 backdrop-blur-sm overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-accent/15 bg-accent/[0.06]">
                <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-accent">
                  {RECON_SAMPLE.label}
                </span>
                <span className="text-[9px] uppercase tracking-[0.14em] text-text-tertiary">Entry</span>
              </div>
              <div className="divide-y divide-white/[0.06]">
                {RECON_SAMPLE.rows.map((r) => (
                  <div key={r.label} className="flex items-baseline justify-between px-3 py-2">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-text-tertiary">{r.label}</span>
                    <span className="text-[15px] font-bold tabular-nums text-white">{r.value}</span>
                  </div>
                ))}
              </div>
              <div className="px-3 py-2 border-t border-accent/15 text-[9px] uppercase tracking-[0.14em] text-text-tertiary">
                + {UNIT_STANDARDS.length - 1} more standards
              </div>
            </div>
          </div>
        </Link>
      </section>

      <WxFinal ctaLabel={primaryCtaLabel} note={noCardTrial ? finalNote : (paidTrialDisclosure || finalNote)} />

      {/* Demo video modal — admin-uploaded product walkthrough, only shown
          once landing.heroDemoVideoUrl is set (Admin → Landing Page). Not
          autoplaying/looping like the small hero logo clip — this is a real
          demo the visitor chose to watch, so normal video controls apply. */}
      <Modal open={demoOpen} onClose={() => setDemoOpen(false)} title="See it in action" className="lg:max-w-5xl">
        {demoUrl && (
          <video
            key={demoUrl}
            className="w-full rounded-xl bg-black"
            src={demoUrl}
            poster={landing.heroDemoVideoUrl ? (landing.heroDemoPosterUrl || undefined) : '/videos/demo-poster.jpg'}
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
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 rounded-xl border border-white/10 bg-surface-elevated overflow-hidden flex-shrink-0 flex items-center justify-center">
                {selectedProgram.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedProgram.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Dumbbell className="w-7 h-7 text-accent/40" />
                )}
              </div>
              <div className="min-w-0">
                <p className="wf-readout text-[10px] font-bold text-accent">{GOAL_LABEL[selectedProgram.goal] ?? selectedProgram.goal}</p>
                <p className="text-[12px] text-text-tertiary mt-1">
                  {selectedProgram.weeks} weeks · {selectedProgram.daysPerWeek} days a week · {selectedProgram.level.charAt(0).toUpperCase() + selectedProgram.level.slice(1)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Duration', `${selectedProgram.weeks} weeks`],
                ['Sessions', `${selectedProgram.daysPerWeek} a week`],
                ['Total', `${selectedProgram.weeks * selectedProgram.daysPerWeek} workouts`],
              ].map(([t, sub]) => (
                <div key={t} className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <p className="text-[12px] font-bold text-white leading-tight">{t}</p>
                  <p className="text-[11px] text-text-tertiary leading-snug mt-1">{sub}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{selectedProgram.description}</p>
            <Link href={`/onboarding?programId=${selectedProgram.id}`} className="block pt-2">
              <Button fullWidth>Enroll Now <ArrowRight className="w-4 h-4" /></Button>
            </Link>
          </div>
        )}
      </Modal>

      <WxFooter appName={appName} playUrl={storeUrls.android} iosUrl={storeUrls.ios || undefined} />
    </div>
    </>
  );
}
