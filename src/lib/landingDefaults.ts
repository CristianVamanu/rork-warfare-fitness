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
// ONE-TIME sale, not a hosted SaaS: install + brand the app on the client's
// own VPS and domain, hand it off, done. No ongoing per-client fee to us,
// no multi-tenant hosting to manage, no recurring revenue built into the
// core price (an optional maintenance retainer is offered separately as an
// upsell, never required). Priced as a "buy your own branded app outright"
// product against the realistic alternative — building something like this
// from scratch runs tens of thousands of dollars in dev time, and ongoing
// SaaS tools like Trainerize/TrueCoach cost $50-150/month forever and the
// trainer never owns anything. A one-time price well under "build it
// yourself" and cheaper than a few years of a recurring tool is the right
// anchor here.
export const DEFAULT_B2B_LANDING_CONFIG: B2BLandingConfig = {
  badgeText: 'One-time setup. Yours forever. No recurring fee.',
  headlineLine1: 'Own your own branded app —',
  headlineLine2: 'installed once, yours for good.',
  subheadline: 'We install a fully white-labeled training app on your own domain and server — your logo, your programs, your pricing. One-time setup fee, no monthly platform fee, no ongoing cut of your revenue.',
  ctaPrimaryLabel: 'Get Your Branded App',
  reasons: [
    { title: 'You Own It Outright', desc: 'Installed on your own VPS and domain — this isn\'t a rented subscription you lose access to if you stop paying us.' },
    { title: 'No Recurring Platform Fee', desc: 'One-time setup cost. No monthly fee to us, no per-client fee, no cut of what you charge your own clients.' },
    { title: 'Fully White-Labeled', desc: 'Your logo, your app name, your colors, your domain — clients never see our branding anywhere in the experience.' },
    { title: 'AI Program Matching', desc: 'New clients get quizzed and matched to a program automatically — you can still build and assign programs by hand whenever you want to.' },
    { title: 'Built-In Community', desc: 'Channels, a PR wall, direct messaging — your clients stay engaged with each other, not just with an app icon.' },
    { title: 'AI Nutrition Coaching', desc: 'Food photo analysis, barcode scanning, and calorie/macro targets calculated per client — without you doing the math.' },
    { title: 'Real Retention Tools', desc: 'Streaks, XP, achievements, and a leaderboard keep clients opening the app daily instead of ghosting after week two.' },
    { title: 'Set Up And Handed Off', desc: 'We install it on your domain, brand it to you, and load your first programs — then it\'s yours to run.' },
  ],
  pricingTiers: [
    {
      name: 'Launch',
      price: '1,497',
      period: 'one-time',
      description: 'Full setup on your own domain, ready to hand your clients.',
      features: ['Installed on your own VPS/domain', 'Full white-label branding (logo, colors, name)', 'AI program + nutrition matching', 'Up to 3 programs configured', '14 days of setup support'],
    },
    {
      name: 'Pro',
      price: '2,997',
      period: 'one-time',
      description: 'For coaches who want their program library built out, not just installed.',
      features: ['Everything in Launch', 'Custom program library built to your specs', 'Priority setup & onboarding call', '30 days of support', 'Community channels pre-configured'],
      highlighted: true,
    },
    {
      name: 'Agency',
      price: 'Custom',
      period: '',
      description: 'For gyms, franchises, or multi-location businesses.',
      features: ['Everything in Pro', 'Multiple trainer/staff accounts', 'Custom integrations on request', 'Extended support window', 'Optional ongoing maintenance plan available'],
    },
  ],
  finalCtaHeadline: 'Ready to own your own branded app?',
  finalCtaSubtext: 'Book a 15-minute call — see it running under your brand, get a fixed one-time price, no subscription.',
};
