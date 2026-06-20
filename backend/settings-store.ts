// Settings are read from environment variables on every call.
// Dynamic overrides (from admin UI save) are stored in module-level cache as a
// best-effort same-instance optimization — they are NOT reliable across Vercel
// instances or cold starts. For cross-device persistence, the client uses
// Firebase Firestore directly.

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

let cache: Partial<ServerSettings> = {};

export function getSettings(): ServerSettings {
  return {
    aiApiKey: cache.aiApiKey || process.env.OPENAI_API_KEY || '',
    stripePaymentLink: cache.stripePaymentLink || process.env.STRIPE_PAYMENT_LINK || '',
    monthlyPrice: cache.monthlyPrice || process.env.MONTHLY_PRICE || '$9.99',
    appName: cache.appName || process.env.APP_NAME || 'Warfare Fitness',
    tagline: cache.tagline || process.env.APP_TAGLINE || 'Forge Strength. Crush Anxiety. Dominate Your Life.',
    supportEmail: cache.supportEmail || process.env.SUPPORT_EMAIL || '',
    welcomeMessage: cache.welcomeMessage || process.env.WELCOME_MESSAGE || 'Welcome to Warfare Fitness, Soldier!',
    dailyMessage: cache.dailyMessage || process.env.DAILY_MESSAGE || 'Today is your day to dominate. No excuses.',
    heroTitle: cache.heroTitle || process.env.HERO_TITLE || 'Your Mission Awaits, Soldier',
    heroSubtitle: cache.heroSubtitle || process.env.HERO_SUBTITLE || 'Forge Strength. Crush Anxiety. Dominate Your Life.',
    coffeeLink: cache.coffeeLink || process.env.COFFEE_LINK || '',
    updatedAt: cache.updatedAt ?? 0,
  };
}

export function updateSettings(updates: Partial<Omit<ServerSettings, 'updatedAt'>>): ServerSettings {
  cache = { ...cache, ...updates, updatedAt: Date.now() };
  return getSettings();
}
