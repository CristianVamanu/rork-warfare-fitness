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
  badgeText: 'AI-matched. Coach-backed. Built to adapt.',
  headlineLine1: 'Stop training like everyone else.',
  headlineLine2: 'Train like the elite do.',
  subheadline: '{appName} matches you to a program built on real elite-unit training styles, adjusts your next set based on what you actually lifted last time, and puts a real coach behind every rep — not a static PDF, not a chatbot.',
  ctaPrimaryLabel: 'Get Matched Free',
  ctaSecondaryLabel: 'Sign In',
  features: [
    { title: 'A Program That Actually Adapts', desc: 'Matched to your goal, experience, and equipment from day one — then it adjusts your next set based on what you actually lifted last time, not a generic script.' },
    { title: 'AI Food Analyzer', desc: 'Snap a photo of your meal and get instant calories, macros, and feedback — no manual logging, no guesswork.' },
    { title: 'Scan-a-Barcode Health Scores', desc: 'Point your camera at any product for an instant Nutri-Score, processing level, and additive breakdown — Yuka-style, built in.' },
    { title: 'Train Like An Elite Unit', desc: 'Ten programs built around real elite-unit training styles — SAS, Rangers, SEALs, and more — matched to your own goals and experience.' },
    { title: 'Fasting Timer', desc: 'Track intermittent fasts with a live stage-by-stage breakdown, from fed state to fat burning to autophagy.' },
    { title: 'Break Bad Habits', desc: 'Track any habit you\'re quitting with a running streak counter and daily motivation to keep you accountable.' },
    { title: 'Streaks, XP & Leaderboard', desc: 'Every workout earns XP and power level. Climb the leaderboard and keep your streak alive.' },
    { title: 'A Real Community', desc: 'Train alongside people on the same journey — share wins, ask questions, stay motivated together.' },
  ],
  socialProof: ['Matched to you, not a template.', 'A real coach, not a chatbot.', 'Built to keep you consistent.'],
  quoteText: 'Motivation gets you started. A program that adapts to you keeps you going.',
  quoteAuthor: 'The Warfare Fitness difference',
  finalCtaHeadline: 'Ready to stop guessing and start training?',
  finalCtaSubtext: 'Take the 2-minute quiz, get matched instantly, and try it free for 7 days.',
  showPublicLeaderboard: true,
  testimonials: [],
};
