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
import { getSystemConfig } from '@/lib/firestore';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';

const FEATURES = [
  {
    icon: Dumbbell,
    color: 'text-purple-400',
    bg: 'bg-purple-400/10',
    title: 'Programs Built Around You',
    desc: 'Custom training plans from your coach — or AI-generated on demand, with sets, reps, and coaching cues for every exercise.',
  },
  {
    icon: Apple,
    color: 'text-green-400',
    bg: 'bg-green-400/10',
    title: 'AI Food Analyzer',
    desc: 'Snap a photo of your meal and get instant calories, macros, and feedback — no manual logging required.',
  },
  {
    icon: ScanLine,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    title: 'Scan-a-Barcode Health Scores',
    desc: 'Point your camera at any product for an instant Nutri-Score, processing level, and additive breakdown — Yuka-style.',
  },
  {
    icon: MessageCircle,
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
    title: 'Direct Line to Your Coach',
    desc: 'Message your trainer, apply for 1:1 coaching, and get personal feedback — not a canned chatbot.',
  },
  {
    icon: Timer,
    color: 'text-sky-400',
    bg: 'bg-sky-400/10',
    title: 'Fasting Timer',
    desc: 'Track intermittent fasts with a live stage-by-stage breakdown, from fed state to fat burning to autophagy.',
  },
  {
    icon: Ban,
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    title: 'Break Bad Habits',
    desc: 'Track any habit you\'re quitting with a running streak counter and daily motivation to keep you accountable.',
  },
  {
    icon: Trophy,
    color: 'text-accent',
    bg: 'bg-accent-muted',
    title: 'Streaks, XP & Leaderboard',
    desc: 'Every workout earns XP and power level. Climb the leaderboard and keep your streak alive.',
  },
  {
    icon: Users,
    color: 'text-orange-400',
    bg: 'bg-orange-400/10',
    title: 'A Real Community',
    desc: 'Train alongside people on the same journey — share wins, ask questions, stay motivated together.',
  },
];

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [appName, setAppName] = useState('Warfare Fitness');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [user, loading, router]);

  useEffect(() => {
    getSystemConfig().then((cfg) => {
      if (cfg?.appName) setAppName(cfg.appName as string);
      if (cfg?.logoUrl) setLogoUrl(cfg.logoUrl as string);
    }).catch(() => {});
  }, []);

  if (loading || user) return <FullPageSpinner />;

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
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-muted text-accent text-xs font-bold mb-5">
            <Trophy className="w-3.5 h-3.5" /> Your coach. Your plan. Your results.
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-[1.1]">
            Train harder. Eat smarter.<br />
            <span className="text-accent">Actually stick with it.</span>
          </h1>
          <p className="text-text-secondary text-base sm:text-lg mt-5 max-w-xl mx-auto leading-relaxed">
            {appName} puts a real coach, AI-powered nutrition tools, and a community that keeps you accountable
            all in one place — so you stop guessing and start progressing.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <Link href="/register" className="w-full sm:w-auto">
              <Button size="lg" fullWidth className="sm:w-auto sm:px-8">
                Get Started <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/login" className="w-full sm:w-auto">
              <Button size="lg" variant="secondary" fullWidth className="sm:w-auto sm:px-8">
                Sign In
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
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.35, delay: (i % 4) * 0.05 }}
              className="p-5 rounded-2xl border border-white/8 bg-surface"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${f.bg}`}>
                <f.icon className={`w-5 h-5 ${f.color}`} />
              </div>
              <h3 className="text-sm font-bold text-white">{f.title}</h3>
              <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Social proof strip */}
      <section className="max-w-3xl mx-auto px-5 pb-16">
        <div className="rounded-2xl border border-white/8 bg-surface p-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-8 justify-center">
          {['No fads. Just results.', 'Real coaching, not a chatbot.', 'Built for consistency.'].map((line) => (
            <div key={line} className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0" />
              <span className="text-sm text-text-secondary">{line}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-2xl mx-auto px-5 pb-20 text-center">
        <h2 className="text-2xl sm:text-3xl font-black text-white">Ready to stop starting over?</h2>
        <p className="text-text-secondary text-sm mt-2 mb-6">Create your account and get your first plan in minutes.</p>
        <Link href="/register">
          <Button size="lg" className="px-10">
            Get Started <ArrowRight className="w-4 h-4" />
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
