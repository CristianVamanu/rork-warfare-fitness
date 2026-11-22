import type { LandingPageConfig, B2BLandingConfig } from '@/types';

// DEFAULT_MEMBERSHIP_FEATURES was removed rather than reworded. It was a
// hardcoded bullet list for the membership pricing card, and every line in
// it had stopped being true: "Full access to all training programs" and
// "AI food analyzer & barcode scanner" describe the top tier, not the entry
// one, and "Direct messaging with your coach" describes 1:1 coaching, which
// is a separate application-gated tier. Nothing imported it, so it rendered
// nowhere — but it sat in the one file a future pricing card would reach
// for, ready to promise all of that to an entry-plan buyer. The pricing
// cards read each plan's own `features` from Firestore (set per plan in
// Admin → Membership), which is the only list that can stay in step with
// what a plan actually unlocks.

// POSITIONING. Two problems, fixed in order.
//
// The original copy ("Stop training like everyone else / Train like the elite
// do", over a paragraph about adaptive programs and food photos) described a
// category, not a difference. Every fitness app claims a version of it.
//
// The replacement went too far the other way: "Could you pass selection?"
// only speaks to someone who wants to enlist, and most of this audience is a
// 45-year-old who simply does not want to be soft. The standards are the
// MEASURING STICK, not the destination — "train like the elite" means an
// ordinary person reaching an extraordinary standard, on an ordinary
// schedule. The copy below keeps the measurement, which is the one thing no
// other app offers, and drops the assumption that you want a career in it.
export const DEFAULT_LANDING_CONFIG: LandingPageConfig = {
  badgeText: 'Every session written. Every meal logged.',
  headlineLine1: 'Stop guessing what to lift.',
  headlineLine2: 'Show up. It does the rest.',
  // Rewritten to stop implying every plan includes a human coach — 1:1
  // coaching is a separate, application-gated tier (see coachingPlans),
  // not something Conquer/Vanguard members get by default. Claiming it in
  // the hero for plans that don't include it is the kind of promise that
  // gets refund requests once someone actually signs up and looks for it.
  // Also shortened from one 43-word sentence to something scannable in the
  // 2-3 seconds most visitors actually give a hero subheadline.
  subheadline: 'Two minutes of questions and {appName} hands you a real program: today\'s session written out, the weight to beat from last time, meals logged from a photo. No plan to make, no spreadsheet, no guessing. Just turn up.',
  ctaPrimaryLabel: 'Build my program',
  ctaSecondaryLabel: 'Sign In',
  features: [
    { title: 'A Program That Actually Adapts', desc: 'Matched to your goal, experience, and equipment from day one — then it adjusts your next set based on what you actually lifted last time, not a generic script.' },
    { title: 'Instant Food Analyzer', desc: 'Snap a photo of your meal and get instant calories, macros, and feedback — no manual logging, no guesswork.' },
    // tierNote: barcode scanning is not included in the entry plan, so the
    // card says so where it is sold rather than after someone has paid.
    { title: 'Scan-a-Barcode Health Scores', desc: 'Point your camera at any product for an instant Nutri-Score, processing level, and additive breakdown — Yuka-style, built in.', tierNote: 'Vanguard' },
    { title: 'Train Like An Elite Unit', desc: 'Programs built around real elite-unit training styles — SAS, Rangers, SEALs, and more — matched to your own goals and experience.' },
    { title: 'Fasting Timer', desc: 'Track intermittent fasts with a live stage-by-stage breakdown, from fed state to fat burning to autophagy.' },
    { title: 'Break Bad Habits', desc: 'Track any habit you\'re quitting with a running streak counter and daily motivation to keep you accountable.' },
    { title: 'Streaks, XP & Levels', desc: 'Every workout earns XP and power level. Keep your streak alive and watch your level climb.' },
    { title: 'Scan & Go', desc: 'Photograph any gym — a hotel, a friend\'s garage, wherever — and get a workout built around exactly the equipment you can see. No commitment beyond today.' },
    { title: 'A Real Community', desc: 'Train alongside people on the same journey — share wins, ask questions, stay motivated together.' },
  ],
  // The separate apps a member would otherwise pay for, at the monthly price
  // each vendor lists. These are claims about other companies' prices, so
  // every figure below was checked against a published source on the date
  // in `asOf`, and the admin panel exists so they can be corrected the day
  // a vendor changes one. Only apps with a PAID tier for the matching
  // feature are listed — Yuka scans barcodes for free, so it is not here,
  // and putting it here would be a lie the first reader with Yuka installed
  // would catch.
  //
  //   MyFitnessPal Premium  $19.99/mo  (recurdash.com/subscription-pricing/myfitnesspal)
  //   Fitbod                $15.99/mo  (fitbod.me/faqs)
  //   Cal AI                 $9.99/mo  (trackcalai.com/pricing — most-advertised tier)
  //   Zero Plus              $9.99/mo  (zerofasting.zendesk.com pricing article)
  //
  // Coaching is deliberately NOT a row: it is a separate paid add-on here,
  // so counting a human PT's fee as "replaced" by the base plan would be
  // claiming something the base plan does not include.
  stackComparison: {
    enabled: true,
    heading: 'Four subscriptions. Or one.',
    subheading: 'The apps people stack to get what is already in here — at the prices they list today.',
    rows: [
      { name: 'MyFitnessPal Premium', replaces: 'Calorie & macro tracking', pricePerMonth: 19.99, currency: 'USD' },
      { name: 'Fitbod', replaces: 'Adaptive workout programs', pricePerMonth: 15.99, currency: 'USD' },
      { name: 'Cal AI', replaces: 'Photo food analyser', pricePerMonth: 9.99, currency: 'USD' },
      { name: 'Zero Plus', replaces: 'Fasting timer & stages', pricePerMonth: 9.99, currency: 'USD' },
    ],
    asOf: 'Vendor list prices as of September 2026. They change; check before you rely on them.',
  },
  socialProof: ['Measured against published standards.', 'A program built to close your gap.', 'Built for men with jobs and families.'],
  quoteText: 'The standard does not care how old you are. It just tells you the truth.',
  quoteAuthor: 'The Warfare Fitness difference',
  finalCtaHeadline: 'Find out where you actually stand.',
  // {trialDays} is substituted from the live membership config at render
  // time (see fillPlaceholders in LandingClient) — this used to hardcode
  // "free for 7 days", which silently lied the moment an admin changed the
  // trial length or switched to a paid trial.
  finalCtaSubtext: 'Take the free test, see the gap, then get the program that closes it. Whatever your age, whatever your schedule — {trialDays} days to try it.',
  programsToShow: 0,
  testimonials: [],
  transformationPhotos: [],
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
  subheadline: 'A fully white-labelled training app — web, Android and iPhone — with your logo, your name and your pricing. Live in days. You pay once, you own it, and we never take a cut of your business.',
  ctaPrimaryLabel: 'Claim Your Branded App',
  reasons: [
    { title: 'You Own It. Period.', desc: 'This isn\'t a subscription that vanishes the moment you miss a payment. It\'s installed on your own server, under your own domain — permanently yours.' },
    { title: 'Zero Recurring Fees', desc: 'One price, paid once. No monthly platform fee, no per-client tax, no percentage of what you charge — ever.' },
    { title: 'Launch Under Your Own Name', desc: 'Your logo, your colors, your app name, your domain. Clients never see anything but your brand — because it is your brand.' },
    { title: 'An AI Coach Built In', desc: 'New clients get quizzed and instantly matched to a program and nutrition targets — like having a coach on staff 24/7, without you lifting a finger.' },
    { title: 'A Community That Keeps Clients Paying', desc: 'Channels, a PR wall, direct messaging — clients stick around for each other, not just for you. That\'s the difference between a 2-month client and a 2-year client.' },
    { title: 'Retention Baked In, Not Bolted On', desc: 'Streaks, XP, levels, achievements — the exact mechanics that make people open an app every single day, already built and tuned.' },
    { title: 'Your Own Command Center', desc: 'One dashboard to manage every client, review PR submissions and PT tests, message clients directly, and edit every program — no spreadsheets, no juggling five different tools.' },
    { title: 'We Do The Heavy Lifting', desc: 'Domain setup, branding, your first programs, and the Google Play and App Store submissions — all done and handed to you ready to sell. You focus on clients, not deployment.' },
  ],
  pwaHeadline: 'Web, Android and iPhone. All under your name.',
  pwaSubheadline: 'Your clients get the app however they like: straight from your website, or from Google Play and the App Store, listed under your brand.',
  pwaPoints: [
    { label: 'Where it lives', native: 'Your own domain, works on any phone or laptop', pwa: 'Google Play and the App Store, under your name' },
    { label: 'Getting it', native: 'One tap “Add to Home Screen” from your site', pwa: 'Clients search your name in the store' },
    { label: 'Your brand', native: 'Your logo, colours and app name everywhere', pwa: 'Your icon, name, screenshots and store listing' },
    { label: 'Updates', native: 'Instant: change something and every client has it', pwa: 'Content updates are instant; we handle store resubmissions' },
    { label: 'Accounts you need', native: 'A domain and hosting (we set it up)', pwa: 'Your own Google Play ($25 once) and Apple ($99/year) developer accounts' },
    { label: 'Payments', native: 'Clients pay you directly. 0% to us', pwa: 'Store billing rules apply to in-app subscriptions; 0% to us' },
  ],
  comparisonHeadline: 'What this actually replaces',
  comparisonPoints: [
    { label: 'Cost', diy: '$25,000–$80,000+ to custom-build', us: 'A fraction of that, paid once' },
    { label: 'Time to launch', diy: '6–12 months with a dev team', us: 'Days (store apps: plus store review)' },
    { label: 'Platforms', diy: 'Web, Android and iOS built separately', us: 'Web + Android + iPhone, one package' },
    { label: 'Ongoing cost', diy: 'Dev/maintenance salary or retainer', us: '$0/month required. Optional care plan $149/month' },
    { label: 'Generic SaaS tools (Trainerize, TrueCoach)', diy: '$50–150/month, forever, never owned', us: 'Paid once, no cap on how long you use it' },
    { label: 'Branding', diy: 'Stuck with their logo/app name', us: '100% your brand, everywhere' },
  ],
  pricingTiers: [
    {
      name: 'Launch',
      price: '1,997',
      period: 'one-time',
      description: 'Your branded web app on your own domain, ready to hand your clients.',
      features: ['Web app on your own domain', 'Full white-label branding (logo, colours, name)', 'AI program + nutrition matching', 'Up to 3 programs configured', '14 days of setup support'],
    },
    {
      name: 'Pro',
      price: '3,997',
      period: 'one-time',
      description: 'The full package: web, Android and iPhone apps under your name.',
      features: ['Everything in Launch', 'Android app on Google Play', 'iPhone app on the App Store', 'Store listings and submissions done for you', 'Up to 5 programs built to your specs', 'Onboarding call + 30 days of support'],
      highlighted: true,
    },
    {
      name: 'Agency',
      price: 'From 6,500',
      period: 'one-time',
      description: 'For gyms, franchises and multi-location businesses.',
      features: ['Everything in Pro', 'Multiple trainer/staff accounts', 'Up to 8 programs built to your specs', 'Custom integrations on request', 'Extended support window'],
    },
  ],
  carePlanText: 'Optional care plan: $149/month for hosting checks, updates, store resubmissions and small changes. Never required.',
  guaranteeText: "If it's not running exactly as promised on your domain within the agreed timeline, you don't pay the remainder — simple as that.",
  faqs: [
    { q: 'Do I really own it, or is this a subscription?', a: 'You own it. It runs on your own VPS and your own domain. There is no recurring fee to us and nothing that stops working if you don\'t pay us again after setup.' },
    { q: 'How long does setup actually take?', a: 'Most installs are live within days once your domain and hosting are ready — branding, your programs, and your first admin account are all configured before handoff.' },
    { q: 'Can I change the branding or programs myself later?', a: 'Yes — your own admin dashboard lets you edit branding, programs, pricing, and everything else any time, with no code and no help from us required.' },
    { q: 'What if I want changes after the initial setup?', a: 'The setup itself is a one-time fee. If you want ongoing changes, new features, or hands-on support later, that\'s available separately as an optional add-on — never required.' },
    { q: 'Do I get real iPhone and Android apps?', a: 'Yes, on the Pro and Agency packages. They are published on Google Play and the App Store under your own developer accounts (Google $25 once, Apple $99 a year), with your name, icon and store listing. We build and submit them for you.' },
    { q: 'Do my clients pay you anything?', a: 'No. You set your own pricing and collect payment from your clients however you choose — we\'re not in that loop at all.' },
  ],
  finalCtaHeadline: 'Stop paying rent on software you\'ll never own.',
  finalCtaSubtext: 'Book a 15-minute call, see your brand running in the app, and get a fixed one-time price — no subscription, ever.',
};

/**
 * A saved trainers-page config written before the offer included the store
 * apps still carries the old "skip the app stores" table and the old prices.
 * Those parts are replaced with the current defaults; anything the admin
 * changed to something else is kept.
 */
export function freshB2b(c: B2BLandingConfig): B2BLandingConfig {
  const d = DEFAULT_B2B_LANDING_CONFIG;
  const out = { ...c };
  if (c.pricingTiers?.[0]?.price === '1,697') out.pricingTiers = d.pricingTiers;
  if (/real app|Progressive|PWA|isn\'t a website/i.test(c.pwaHeadline ?? '') || c.pwaPoints?.some((p) => /Store fees/.test(p.label))) {
    out.pwaHeadline = d.pwaHeadline; out.pwaSubheadline = d.pwaSubheadline; out.pwaPoints = d.pwaPoints;
  }
  if (c.subheadline?.startsWith('A fully white-labeled training app')) out.subheadline = d.subheadline;
  if (!c.faqs?.some((f) => /iPhone and Android/.test(f.q))) out.faqs = [...(c.faqs ?? []).slice(0, 4), d.faqs[4], ...(c.faqs ?? []).slice(4)];
  if (c.comparisonPoints?.some((p) => p.us === '$0/month — you own it')) out.comparisonPoints = d.comparisonPoints;
  if (c.reasons?.some((r) => r.title === 'We Do The Heavy Lifting' && !/App Store/.test(r.desc))) out.reasons = c.reasons.map((r) => (r.title === 'We Do The Heavy Lifting' ? d.reasons[7] : r));
  out.carePlanText = c.carePlanText ?? d.carePlanText;
  return out;
}
