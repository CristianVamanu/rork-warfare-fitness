import type { LandingPageConfig } from '@/types';

// Fallback bullet list for the standard membership pricing card (landing
// page + profile), used only until an admin sets MembershipConfig.features.
export const DEFAULT_MEMBERSHIP_FEATURES = [
  'Full access to all training programs',
  'AI food analyzer & barcode scanner',
  'Community & leaderboard access',
  'Direct messaging with your coach',
];

export const DEFAULT_LANDING_CONFIG: LandingPageConfig = {
  badgeText: 'Your coach. Your plan. Your results.',
  headlineLine1: 'Train harder. Eat smarter.',
  headlineLine2: 'Actually stick with it.',
  subheadline: '{appName} puts a real coach, AI-powered nutrition tools, and a community that keeps you accountable all in one place — so you stop guessing and start progressing.',
  ctaPrimaryLabel: 'Get Started',
  ctaSecondaryLabel: 'Sign In',
  features: [
    { title: 'Programs Built Around You', desc: 'Custom training plans from your coach — or AI-generated on demand, with sets, reps, and coaching cues for every exercise.' },
    { title: 'AI Food Analyzer', desc: 'Snap a photo of your meal and get instant calories, macros, and feedback — no manual logging required.' },
    { title: 'Scan-a-Barcode Health Scores', desc: 'Point your camera at any product for an instant Nutri-Score, processing level, and additive breakdown — Yuka-style.' },
    { title: 'Direct Line to Your Coach', desc: 'Message your trainer, apply for 1:1 coaching, and get personal feedback — not a canned chatbot.' },
    { title: 'Fasting Timer', desc: 'Track intermittent fasts with a live stage-by-stage breakdown, from fed state to fat burning to autophagy.' },
    { title: 'Break Bad Habits', desc: 'Track any habit you\'re quitting with a running streak counter and daily motivation to keep you accountable.' },
    { title: 'Streaks, XP & Leaderboard', desc: 'Every workout earns XP and power level. Climb the leaderboard and keep your streak alive.' },
    { title: 'A Real Community', desc: 'Train alongside people on the same journey — share wins, ask questions, stay motivated together.' },
  ],
  socialProof: ['No fads. Just results.', 'Real coaching, not a chatbot.', 'Built for consistency.'],
  quoteText: "The only bad workout is the one that didn't happen.",
  quoteAuthor: 'Every athlete who showed up anyway',
  finalCtaHeadline: 'Ready to stop starting over?',
  finalCtaSubtext: 'Create your account and get your first plan in minutes.',
};
