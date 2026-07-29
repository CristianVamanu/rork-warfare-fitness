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
    { title: 'Scan & Go', desc: 'Photograph any gym — a hotel, a friend\'s garage, wherever — and get a workout built around exactly the equipment you can see. No commitment beyond today.' },
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
  badgeText: 'One-time investment. Yours forever. Zero monthly fees.',
  headlineLine1: 'Stop renting software.',
  headlineLine2: 'Own your app outright.',
  subheadline: 'A fully white-labeled training app — your logo, your name, your pricing — installed on your own domain in days. You pay once. You own it forever. We never take a cut of your business again.',
  ctaPrimaryLabel: 'Claim Your Branded App',
  reasons: [
    { title: 'You Own It. Period.', desc: 'This isn\'t a subscription that vanishes the moment you miss a payment. It\'s installed on your own server, under your own domain — permanently yours.' },
    { title: 'Zero Recurring Fees', desc: 'One price, paid once. No monthly platform fee, no per-client tax, no percentage of what you charge — ever.' },
    { title: 'Launch Under Your Own Name', desc: 'Your logo, your colors, your app name, your domain. Clients never see anything but your brand — because it is your brand.' },
    { title: 'An AI Coach Built In', desc: 'New clients get quizzed and instantly matched to a program and nutrition targets — like having a coach on staff 24/7, without you lifting a finger.' },
    { title: 'A Community That Keeps Clients Paying', desc: 'Channels, a PR wall, direct messaging — clients stick around for each other, not just for you. That\'s the difference between a 2-month client and a 2-year client.' },
    { title: 'Retention Baked In, Not Bolted On', desc: 'Streaks, XP, levels, achievements, a leaderboard — the exact mechanics that make people open an app every single day, already built and tuned.' },
    { title: 'Your Own Command Center', desc: 'One dashboard to manage every client, review PR submissions and PT tests, message clients directly, and edit every program — no spreadsheets, no juggling five different tools.' },
    { title: 'We Do The Heavy Lifting', desc: 'Domain setup, branding, your first programs — all configured and handed to you ready to sell. You focus on clients, not deployment.' },
  ],
  pwaHeadline: 'This isn\'t a website. It\'s a real app.',
  pwaSubheadline: 'Your clients install it straight to their home screen, exactly like an app from the App Store — because that\'s exactly what it is. It just skips everything that makes app stores painful.',
  pwaPoints: [
    { label: 'Store fees', native: 'Apple/Google take 15–30% of every in-app payment', pwa: '$0 — you keep 100% of what your clients pay' },
    { label: 'Update wait time', native: 'Every update sits in review for days, sometimes gets rejected', pwa: 'Instant — push an update and every client has it immediately' },
    { label: 'Getting listed at all', native: 'App Store review can reject or delay your launch for weeks', pwa: 'No review process — it\'s live the moment we install it' },
    { label: 'Developer account costs', native: '$99/year (Apple) + $25 one-time (Google), plus compliance overhead', pwa: '$0' },
    { label: 'Install experience', native: 'Client has to find it in a store, download, wait', pwa: 'One tap "Add to Home Screen" from your own site — no store, no search' },
    { label: 'Platform lock-in', native: 'Separate iOS and Android codebases/approvals to maintain', pwa: 'One app, works identically on iPhone and Android' },
  ],
  comparisonHeadline: 'What this actually replaces',
  comparisonPoints: [
    { label: 'Cost', diy: '$25,000–$80,000+ to custom-build', us: 'A fraction of that, paid once' },
    { label: 'Time to launch', diy: '6–12 months with a dev team', us: 'Days' },
    { label: 'Ongoing cost', diy: 'Dev/maintenance salary or retainer', us: '$0/month — you own it' },
    { label: 'Generic SaaS tools (Trainerize, TrueCoach)', diy: '$50–150/month, forever, never owned', us: 'Paid once, no cap on how long you use it' },
    { label: 'Branding', diy: 'Stuck with their logo/app name', us: '100% your brand, everywhere' },
  ],
  pricingTiers: [
    {
      name: 'Launch',
      price: '1,697',
      period: 'one-time',
      description: 'Full setup on your own domain, ready to hand your clients.',
      features: ['Installed on your own VPS/domain', 'Full white-label branding (logo, colors, name)', 'AI program + nutrition matching', 'Up to 3 programs configured', '14 days of setup support'],
    },
    {
      name: 'Pro',
      price: '3,197',
      period: 'one-time',
      description: 'For coaches who want their program library built out, not just installed.',
      features: ['Everything in Launch', 'Up to 5 programs built to your specs', 'Priority setup & onboarding call', '30 days of support', 'Community channels pre-configured'],
      highlighted: true,
    },
    {
      name: 'Agency',
      price: 'Custom',
      period: '',
      description: 'For gyms, franchises, or multi-location businesses.',
      features: ['Everything in Pro', 'Up to 8 programs built to your specs', 'Multiple trainer/staff accounts', 'Custom integrations on request', 'Extended support window', 'Optional ongoing maintenance plan available'],
    },
  ],
  guaranteeText: "If it's not running exactly as promised on your domain within the agreed timeline, you don't pay the remainder — simple as that.",
  faqs: [
    { q: 'Do I really own it, or is this a subscription?', a: 'You own it. It runs on your own VPS and your own domain. There is no recurring fee to us and nothing that stops working if you don\'t pay us again after setup.' },
    { q: 'How long does setup actually take?', a: 'Most installs are live within days once your domain and hosting are ready — branding, your programs, and your first admin account are all configured before handoff.' },
    { q: 'Can I change the branding or programs myself later?', a: 'Yes — your own admin dashboard lets you edit branding, programs, pricing, and everything else any time, with no code and no help from us required.' },
    { q: 'What if I want changes after the initial setup?', a: 'The setup itself is a one-time fee. If you want ongoing changes, new features, or hands-on support later, that\'s available separately as an optional add-on — never required.' },
    { q: 'Do my clients pay you anything?', a: 'No. You set your own pricing and collect payment from your clients however you choose — we\'re not in that loop at all.' },
  ],
  finalCtaHeadline: 'Stop paying rent on software you\'ll never own.',
  finalCtaSubtext: 'Book a 15-minute call, see your brand running in the app, and get a fixed one-time price — no subscription, ever.',
};
