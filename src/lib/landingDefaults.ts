import type { LandingPageConfig, B2BLandingConfig } from '@/types';

// Fallback bullet list for the standard membership pricing card (landing
// page + profile), used only until an admin sets MembershipConfig.features.
export const DEFAULT_MEMBERSHIP_FEATURES = [
  'Full access to all training programs',
  'AI food analyzer & barcode scanner',
  'Community & leaderboard access',
  'Direct messaging with your coach',
];

export const DEFAULT_LANDING_CONFIG: LandingPageConfig = {
  badgeText: 'AI-matched. Built to adapt. Actually consistent.',
  headlineLine1: 'Stop training like everyone else.',
  headlineLine2: 'Train like the elite do.',
  // Rewritten to stop implying every plan includes a human coach — 1:1
  // coaching is a separate, application-gated tier (see coachingPlans),
  // not something Conquer/Vanguard members get by default. Claiming it in
  // the hero for plans that don't include it is the kind of promise that
  // gets refund requests once someone actually signs up and looks for it.
  // Also shortened from one 43-word sentence to something scannable in the
  // 2-3 seconds most visitors actually give a hero subheadline.
  subheadline: '{appName} matches you to a program built on real elite-unit training styles — then adjusts your next set based on what you actually lifted last time. No static PDF. No generic chatbot advice.',
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
  socialProof: ['Matched to you, not a template.', 'Adapts as you get stronger.', 'Built to keep you consistent.'],
  quoteText: 'Motivation gets you started. A program that adapts to you keeps you going.',
  quoteAuthor: 'The Warfare Fitness difference',
  finalCtaHeadline: 'Ready to stop guessing and start training?',
  finalCtaSubtext: 'Take the 2-minute quiz, get matched instantly, and try it free for 7 days.',
  showPublicLeaderboard: true,
  testimonials: [],
};

// Recommended starting price points for the white-label/B2B offer — a
// sales-assisted, manually-provisioned instance on your own infrastructure
// (separate domain + Firebase project per client), not a self-serve SaaS
// tier. Priced against the realistic alternative a trainer is comparing
// against (Trainerize/TrueCoach run $50-150/mo per trainer for bare
// client-management tooling with no consumer-grade app, gamification, AI
// nutrition, or community layer) — positioned as a premium "your own
// branded app" product, not competing on being the cheapest option.
export const DEFAULT_B2B_LANDING_CONFIG: B2BLandingConfig = {
  badgeText: 'Your brand. Your app. Zero dev work.',
  headlineLine1: 'Give your clients an app',
  headlineLine2: 'with your name on it.',
  subheadline: 'A fully white-labeled training app for your business — your logo, your programs, your pricing — running on your own domain. We handle the platform. You keep the relationship.',
  ctaPrimaryLabel: 'Book a Demo',
  reasons: [
    { title: 'Fully White-Labeled', desc: 'Your logo, your app name, your colors, your domain — clients never see our branding anywhere in the experience.' },
    { title: 'You Set the Price', desc: 'Charge your clients whatever you want, however you want — we don\'t take a cut of your client revenue.' },
    { title: 'AI Program Matching', desc: 'New clients get quizzed and matched to a program automatically — you can still build and assign programs by hand whenever you want to.' },
    { title: 'Built-In Community', desc: 'Channels, a PR wall, direct messaging — your clients stay engaged with each other, not just with an app icon.' },
    { title: 'AI Nutrition Coaching', desc: 'Food photo analysis, barcode scanning, and calorie/macro targets calculated per client — without you doing the math.' },
    { title: 'Real Retention Tools', desc: 'Streaks, XP, achievements, and a leaderboard keep clients opening the app daily instead of ghosting after week two.' },
    { title: 'Your Own Admin Dashboard', desc: 'Manage clients, review PT tests and PR submissions, message clients directly, and edit every program from one place.' },
    { title: 'Launched For You', desc: 'We set up your domain, your branding, and your first programs — you\'re live in days, not months.' },
  ],
  pricingTiers: [
    {
      name: 'Starter',
      price: '149',
      period: '/month',
      description: 'For solo trainers just getting their own app off the ground.',
      features: ['Up to 25 active clients', 'Full white-label branding', 'AI program + nutrition matching', 'Community & messaging', 'Email support'],
    },
    {
      name: 'Growth',
      price: '299',
      period: '/month',
      description: 'For established coaches and small studios scaling up.',
      features: ['Up to 100 active clients', 'Everything in Starter', 'Custom program library', 'Priority support', 'Onboarding call included'],
      highlighted: true,
    },
    {
      name: 'Agency',
      price: 'Custom',
      period: '',
      description: 'For gyms and multi-trainer businesses with larger rosters.',
      features: ['Unlimited clients', 'Everything in Growth', 'Multiple trainer accounts', 'Custom integrations', 'Dedicated support'],
    },
  ],
  finalCtaHeadline: 'Ready to put your name on it?',
  finalCtaSubtext: 'Book a 15-minute demo — see the app running under your brand before you commit to anything.',
};
