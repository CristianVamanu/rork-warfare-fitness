import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GATED_FEATURE_IDS, pruneFeatureAccess } from './gatedFeatures';

/**
 * The admin panel can only grant what it has a checkbox for, and
 * MembershipPlan.featureAccess is an ALLOWLIST — a plan naming any feature
 * gets only the ones it names. So a gate enforced in code but missing from
 * the registry is not a cosmetic gap: it is a feature that every restricted
 * plan locks and no plan can ever include. That is exactly what happened to
 * Scan & Go, Coach Chat and the Daily Tip, all three checked by their API
 * routes while the per-plan editor offered no tick for any of them.
 *
 * A convention would have drifted again, so this reads the source tree for
 * the keys actually being enforced and fails if one is not in the registry.
 */

const SRC = join(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === 'node_modules' ? [] : sourceFiles(full);
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    // The registry itself and the test fixtures in it are not call sites.
    if (full.endsWith(join('lib', 'gatedFeatures.ts'))) return [];
    return [full];
  });
}

/** Every feature key passed to a gate, with the file that passes it. */
function enforcedKeys(): { key: string; file: string }[] {
  const patterns = [
    /verifyFeatureAccess\(\s*[^,)]+,\s*[^,)]+,\s*'([a-z0-9-]+)'/g,
    /useFeatureAccess\(\s*'([a-z0-9-]+)'/g,
    // [^>] already spans newlines, so no dotAll flag (which this tsconfig
    // target rejects) is needed for a multi-line JSX tag.
    /<PaywallGate[^>]*?\sfeature=["']([a-z0-9-]+)["']/g,
  ];
  const found: { key: string; file: string }[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const re of patterns) {
      for (const m of text.matchAll(re)) found.push({ key: m[1], file: file.slice(SRC.length + 1) });
    }
  }
  return found;
}

describe('gated feature registry', () => {
  it('covers every feature key the app actually enforces', () => {
    const missing = enforcedKeys().filter(({ key }) => !GATED_FEATURE_IDS.includes(key));
    // Named in the failure so the fix is obvious: add the id to
    // GATED_FEATURES, which puts it on both admin checkbox lists at once.
    expect(missing, `enforced but not grantable in the admin panel: ${missing.map((m) => `${m.key} (${m.file})`).join(', ')}`).toEqual([]);
  });

  it('found the call sites at all — a silent zero would pass the check above', () => {
    expect(enforcedKeys().length).toBeGreaterThan(8);
  });

  it('has no duplicate ids', () => {
    expect(new Set(GATED_FEATURE_IDS).size).toBe(GATED_FEATURE_IDS.length);
  });

  it('still carries premium-programs, which resolvePlanLock keys the library off', () => {
    // resolvePlanLock treats this one id specially (it decides whether a
    // member can switch programs at all), so losing it from the registry
    // would quietly make the library ungrantable.
    expect(GATED_FEATURE_IDS).toContain('premium-programs');
  });
});

describe('pruneFeatureAccess', () => {
  it('drops ids that no longer exist and keeps the real ones', () => {
    // 'leaderboard' was never a real key and 'ai-chat' went away with its
    // route. Both survived in saved plans, and because featureAccess is an
    // allowlist they kept the plan restricted with nothing to untick.
    expect(pruneFeatureAccess(['barcode', 'leaderboard', 'ai-chat', 'premium-programs']))
      .toEqual(['barcode', 'premium-programs']);
  });

  it('turns an all-stale list into an empty one, which means unrestricted', () => {
    expect(pruneFeatureAccess(['leaderboard', 'ai-chat'])).toEqual([]);
  });

  it('handles a plan that never had the field', () => {
    expect(pruneFeatureAccess(undefined)).toEqual([]);
  });

  it('leaves a clean list untouched', () => {
    const clean = ['nutrition-ai', 'community', 'fasting'];
    expect(pruneFeatureAccess(clean)).toEqual(clean);
  });
});
