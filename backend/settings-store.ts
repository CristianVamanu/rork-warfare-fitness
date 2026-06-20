// Module-level settings store. Persists across requests on the same Vercel
// function instance. Initialized from env vars as permanent baseline defaults.

export interface ServerSettings {
  aiApiKey: string;
  stripePaymentLink: string;
  monthlyPrice: string;
  appName: string;
  tagline: string;
  supportEmail: string;
  welcomeMessage: string;
  dailyMessage: string;
  heroTitle: string;
  heroSubtitle: string;
  coffeeLink: string;
  updatedAt: number;
}

const defaults: ServerSettings = {
  aiApiKey: process.env.OPENAI_API_KEY ?? '',
  stripePaymentLink: process.env.STRIPE_PAYMENT_LINK ?? '',
  monthlyPrice: process.env.MONTHLY_PRICE ?? '$9.99',
  appName: process.env.APP_NAME ?? 'Warfare Fitness',
  tagline: process.env.APP_TAGLINE ?? 'Forge Strength. Crush Anxiety. Dominate Your Life.',
  supportEmail: process.env.SUPPORT_EMAIL ?? '',
  welcomeMessage: process.env.WELCOME_MESSAGE ?? 'Welcome to Warfare Fitness, Soldier!',
  dailyMessage: process.env.DAILY_MESSAGE ?? 'Today is your day to dominate. No excuses.',
  heroTitle: process.env.HERO_TITLE ?? 'Your Mission Awaits, Soldier',
  heroSubtitle: process.env.HERO_SUBTITLE ?? 'Forge Strength. Crush Anxiety. Dominate Your Life.',
  coffeeLink: process.env.COFFEE_LINK ?? '',
  updatedAt: 0,
};

let store: ServerSettings = { ...defaults };

export function getSettings(): ServerSettings {
  return { ...store };
}

export function updateSettings(updates: Partial<Omit<ServerSettings, 'updatedAt'>>): ServerSettings {
  store = { ...store, ...updates, updatedAt: Date.now() };
  return { ...store };
}
