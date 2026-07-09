'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  Dumbbell, Apple, ScanLine, Users, MessageCircle, Timer, Ban, Trophy,
  ArrowRight, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getSystemConfig, getMembershipConfig } from '@/lib/firestore';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { DEFAULT_LANDING_CONFIG } from '@/lib/landingDefaults';
import type { LandingPageConfig } from '@/types';

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
  const [trialDays, setTrialDays] = useState(0);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [user, loading, router]);

  useEffect(() => {
    getSystemConfig().then((cfg) => {
      if (cfg?.appName) setAppName(cfg.appName as string);
      if (cfg?.logoUrl) setLogoUrl(cfg.logoUrl as string);
      if (cfg?.landingPage) setLanding({ ...DEFAULT_LANDING_CONFIG, ...(cfg.landingPage as LandingPageConfig) });
    }).catch(() => {});
    getMembershipConfig().then((cfg) => {
      if (cfg?.enabled && (cfg.trialDays ?? 0) > 0) setTrialDays(cfg.trialDays as number);
    }).catch(() => {});
  }, []);

  if (loading || user) return <FullPageSpinner />;

  const subheadline = landing.subheadline.replace('{appName}', appName);
  // Free trial needs no payment upfront — MembershipGuard grants access
  // automatically for trialDays from account creation, so the CTA can lead
  // straight to registration rather than a paid checkout.
  const primaryCtaLabel = trialDays > 0 ? `Start ${trialDays}-Day Free Trial` : landing.ctaPrimaryLabel;

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Nav */}
      <nav className="max-w-5xl mx-auto flex items-center justify-between px-5 py-5">
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
      <section className="max-w-3xl mx-auto px-5 pt-10 pb-16 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {landing.badgeText && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-muted text-accent text-xs font-bold mb-5">
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

      {/* Feature grid */}
      <section className="max-w-5xl mx-auto px-5 pb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-black text-white">Everything you need. Nothing you don&apos;t.</h2>
          <p className="text-text-secondary text-sm mt-2">One app for training, nutrition, accountability, and progress.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {landing.features.map((f, i) => {
            const style = FEATURE_STYLES[i] ?? FEATURE_STYLES[FEATURE_STYLES.length - 1];
            return (
              <motion.div
                key={`${f.title}-${i}`}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.35, delay: (i % 4) * 0.05 }}
                className="p-5 rounded-2xl border border-white/8 bg-surface"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${style.bg}`}>
                  <style.icon className={`w-5 h-5 ${style.color}`} />
                </div>
                <h3 className="text-sm font-bold text-white">{f.title}</h3>
                <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">{f.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

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
