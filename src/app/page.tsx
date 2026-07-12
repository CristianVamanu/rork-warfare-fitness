'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  Dumbbell, Apple, ScanLine, Users, MessageCircle, Timer, Ban, Trophy,
  ArrowRight, CheckCircle2, Crown, Check,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getSystemConfig, getMembershipConfig, getCoachingPlans } from '@/lib/firestore';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { DEFAULT_LANDING_CONFIG } from '@/lib/landingDefaults';
import type { LandingPageConfig, MembershipConfig, CoachingPlan } from '@/types';

const MEMBERSHIP_FEATURES = [
  'Full access to all training programs',
  'AI food analyzer & barcode scanner',
  'Community & leaderboard access',
  'Direct messaging with your coach',
];

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

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [appName, setAppName] = useState('Warfare Fitness');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [landing, setLanding] = useState<LandingPageConfig>(DEFAULT_LANDING_CONFIG);
  const [membership, setMembership] = useState<MembershipConfig | null>(null);
  const [coachingPlans, setCoachingPlans] = useState<CoachingPlan[]>([]);

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
  }, []);

  const trialDays = membership?.enabled ? (membership.trialDays ?? 0) : 0;

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

      {/* Nav */}
      <nav className="relative max-w-5xl mx-auto flex items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center overflow-hidden flex-shrink-0">
            {logoUrl ? (
              <Image src={logoUrl} alt={appName} width={36} height={36} className="w-full h-full object-cover" />
            ) : (
              <span className="text-base font-black text-black">{appName[0]}</span>
            )}
          </div>
          <span className="text-base font-black text-white tracking-tight">{appName}</span>
        </div>
        <Link href="/login" className="text-sm font-medium text-text-secondary hover:text-white transition-colors">
          Sign In
        </Link>
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
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-[1.1]">
            {landing.headlineLine1}<br />
            <span className="text-accent">{landing.headlineLine2}</span>
          </h1>
          <p className="text-text-secondary text-base sm:text-lg mt-5 max-w-xl mx-auto leading-relaxed">
            {subheadline}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <Link href="/register" className="w-full sm:w-auto">
              <Button size="lg" fullWidth className="sm:w-auto sm:px-8">
                {primaryCtaLabel} <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/login" className="w-full sm:w-auto">
              <Button size="lg" variant="secondary" fullWidth className="sm:w-auto sm:px-8">
                {landing.ctaSecondaryLabel}
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Feature grid — bento layout. Sizes are hand-placed by position so
          the first feature reads as the hero, the next two as mid-weight,
          the middle four as a compact row, and the last spans full-width
          as a closer — same visual language as the in-app dashboard bento
          grid. If an admin adds/removes features, extra ones fall back to
          plain 1x1 tiles rather than breaking the layout. */}
      <section className="max-w-5xl mx-auto px-5 pb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-black text-white">Everything you need. Nothing you don&apos;t.</h2>
          <p className="text-text-secondary text-sm mt-2">One app for training, nutrition, accountability, and progress.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 auto-rows-[120px] sm:auto-rows-[130px] gap-4">
          {landing.features.map((f, i) => {
            const style = FEATURE_STYLES[i] ?? FEATURE_STYLES[FEATURE_STYLES.length - 1];
            const span = [
              'col-span-2 row-span-2',
              'col-span-2 row-span-1',
              'col-span-2 row-span-1',
              'col-span-1 row-span-1',
              'col-span-1 row-span-1',
              'col-span-1 row-span-1',
              'col-span-1 row-span-1',
              'col-span-2 sm:col-span-4 row-span-1',
            ][i] ?? 'col-span-2 sm:col-span-1 row-span-1';
            const isHero = i === 0;
            return (
              <motion.div
                key={`${f.title}-${i}`}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.35, delay: (i % 4) * 0.05 }}
                className={`${span} p-5 rounded-2xl border border-white/8 bg-surface hover:border-accent/30 transition-colors flex flex-col ${isHero ? 'justify-between' : 'justify-center'}`}
              >
                <div className={`${isHero ? 'w-12 h-12' : 'w-10 h-10'} rounded-xl flex items-center justify-center mb-3 ${style.bg} flex-shrink-0`}>
                  <style.icon className={`${isHero ? 'w-6 h-6' : 'w-5 h-5'} ${style.color}`} />
                </div>
                <div>
                  <h3 className={`font-bold text-white ${isHero ? 'text-base' : 'text-sm'}`}>{f.title}</h3>
                  <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">{f.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

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
            <span className="absolute top-3 left-5 text-[90px] leading-none font-black text-accent/10 select-none pointer-events-none">&ldquo;</span>
            <p className="relative text-xl sm:text-2xl font-bold text-white leading-snug max-w-2xl mx-auto">
              {landing.quoteText}
            </p>
            {landing.quoteAuthor && (
              <p className="relative text-sm text-accent font-medium mt-4">— {landing.quoteAuthor}</p>
            )}
          </motion.div>
        </section>
      )}

      {/* Pricing */}
      {(membership?.enabled || coachingPlans.length > 0) && (
        <section className="max-w-4xl mx-auto px-5 pb-16">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-black text-white">Choose Your Path</h2>
            <p className="text-text-secondary text-sm mt-2">
              {trialDays > 0 ? `Start free — ${trialDays} days on us, no card required.` : 'Simple pricing. Cancel anytime.'}
            </p>
          </div>
          <div className={`grid gap-5 ${coachingPlans.length > 0 ? 'sm:grid-cols-2' : 'max-w-sm mx-auto'}`}>
            {membership?.enabled && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.35 }}
                className="relative rounded-2xl border-2 border-accent bg-accent/[0.03] p-6"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Crown className="w-4 h-4 text-accent" />
                  <p className="text-xs font-bold text-accent uppercase tracking-wide">{membership.planName?.trim() || 'Membership'}</p>
                </div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-4xl font-black text-white">${membership.fee?.toFixed(2)}</span>
                  <span className="text-sm text-text-secondary">/month</span>
                </div>
                {trialDays > 0 && (
                  <p className="text-xs text-accent mt-1 font-medium">{trialDays}-day free trial, no payment required</p>
                )}
                <ul className="mt-5 space-y-2.5">
                  {MEMBERSHIP_FEATURES.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-text-secondary">
                      <Check className="w-4 h-4 text-accent flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Link href="/register" className="block mt-6">
                  <Button fullWidth size="lg">
                    {trialDays > 0 ? `Start ${trialDays}-Day Free Trial` : 'Join Now'} <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </motion.div>
            )}
            {coachingPlans.map((plan) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.35, delay: 0.05 }}
                className="rounded-2xl border border-white/10 bg-surface p-6"
              >
                <p className="text-xs font-bold text-text-secondary uppercase tracking-wide mb-1">{plan.name}</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-4xl font-black text-white">${plan.priceMonthly?.toFixed(2)}</span>
                  <span className="text-sm text-text-secondary">/month</span>
                </div>
                <p className="text-xs text-text-secondary mt-2 leading-relaxed">{plan.description}</p>
                <ul className="mt-5 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-text-secondary">
                      <Check className="w-4 h-4 text-accent flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Link href="/register" className="block mt-6">
                  <Button fullWidth size="lg" variant="secondary">
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

      {/* Final CTA */}
      <section className="max-w-2xl mx-auto px-5 pb-20 text-center">
        <h2 className="text-2xl sm:text-3xl font-black text-white">{landing.finalCtaHeadline}</h2>
        <p className="text-text-secondary text-sm mt-2 mb-6">{landing.finalCtaSubtext}</p>
        <Link href="/register">
          <Button size="lg" className="px-10">
            {primaryCtaLabel} <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
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
