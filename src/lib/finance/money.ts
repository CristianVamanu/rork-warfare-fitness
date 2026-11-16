/**
 * Money helpers. Amounts are integers in the currency's minor unit; nothing
 * here ever adds two currencies together.
 */

// ISO 4217 currencies with no minor unit (Stripe's zero-decimal list).
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
const THREE_DECIMAL = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd']);

export function minorExponent(currency: string): number {
  const c = currency.toLowerCase();
  return ZERO_DECIMAL.has(c) ? 0 : THREE_DECIMAL.has(c) ? 3 : 2;
}

/** A decimal major-unit amount (e.g. RevenueCat's 9.99) to integer minor units. */
export function toMinor(major: number, currency: string): number {
  return Math.round(major * 10 ** minorExponent(currency));
}

export function formatMoney(minor: number, currency: string, opts: { compact?: boolean } = {}): string {
  const exp = minorExponent(currency);
  const v = minor / 10 ** exp;
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency', currency: currency.toUpperCase(),
      notation: opts.compact && Math.abs(v) >= 10_000 ? 'compact' : 'standard',
      minimumFractionDigits: opts.compact ? 0 : exp, maximumFractionDigits: opts.compact && Math.abs(v) >= 10_000 ? 1 : exp,
    }).format(v);
  } catch {
    return `${v.toFixed(exp)} ${currency.toUpperCase()}`;
  }
}

/** Plain decimal string for CSV (no symbol, no grouping): 1234.50 */
export function minorToDecimal(minor: number, currency: string): string {
  const exp = minorExponent(currency);
  return (minor / 10 ** exp).toFixed(exp);
}

/** Sum per currency: { gbp: 1200, usd: 900 }. */
export type ByCurrency = Record<string, number>;
export function addTo(map: ByCurrency, currency: string, minor: number): void {
  const c = currency.toLowerCase();
  map[c] = (map[c] ?? 0) + minor;
}
