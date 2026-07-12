import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Firestore rejects any field whose value is `undefined`, even nested deep
 * inside arrays/objects — strip those out recursively before a write rather
 * than trusting every call site to remember. */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatWeight(value: number, unit: 'kg' | 'lbs'): string {
  return `${value}${unit}`;
}

/** Returns the live discount percent (0 if none/expired) for a config that
 * carries `discountPercent` + `discountExpiresAt` — the same rule the
 * Stripe checkout routes already apply server-side, so the UI can show the
 * exact same "is it active right now" state instead of just trusting
 * whatever percent is stored regardless of expiry. */
export function getActiveDiscountPercent(cfg: { discountPercent?: number; discountExpiresAt?: string } | null | undefined): number {
  if (!cfg?.discountPercent || cfg.discountPercent <= 0 || !cfg.discountExpiresAt) return 0;
  return new Date(cfg.discountExpiresAt).getTime() > Date.now() ? cfg.discountPercent : 0;
}

export function applyDiscount(price: number, percent: number): number {
  return Math.round(price * (1 - percent / 100) * 100) / 100;
}

export function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

export function lbsToKg(lbs: number): number {
  return Math.round(lbs / 2.20462 * 10) / 10;
}
