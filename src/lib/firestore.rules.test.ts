import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, type Firestore } from 'firebase/firestore';

/**
 * Firestore rules, exercised against the real rules engine in the emulator.
 *
 * These are the app's actual authorization boundary — every server route
 * re-checks membership, but everything the CLIENT does is governed here
 * alone. The rules had grown to ~700 lines with no test at all, so a wrong
 * character in a deny-list would have silently handed out admin or free
 * membership with nothing to catch it.
 *
 * Requires the emulator: `npm run test:rules` starts it and runs this file.
 */

let env: RulesTestEnvironment;

const ALICE = 'alice';
const BOB = 'bob';
const ADMIN = 'admin1';

/** Seeds documents with rules disabled, so tests start from a real state. */
async function seed(fn: (db: Firestore) => Promise<void>) {
  await env.withSecurityRulesDisabled(async (ctx) => { await fn(ctx.firestore() as unknown as Firestore); });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-warfare',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, 'users', ALICE), { role: 'user', displayName: 'Alice', trainerId: null, stats: { streak: 1 } });
    await setDoc(doc(db, 'users', BOB), { role: 'user', displayName: 'Bob', trainerId: null });
    await setDoc(doc(db, 'users', ADMIN), { role: 'admin', displayName: 'Admin' });
    // The installer marker is irrelevant now — the bootstrap exemption it
    // used to unlock has been deleted. Seeded absent on purpose so these
    // tests prove that, rather than passing only because it happens to be set.
    await setDoc(doc(db, 'system', 'config'), { appName: 'Warfare' });
  });
});

const asAlice = () => env.authenticatedContext(ALICE).firestore();
const asBob = () => env.authenticatedContext(BOB).firestore();
const asAdmin = () => env.authenticatedContext(ADMIN).firestore();
const asAnon = () => env.unauthenticatedContext().firestore();

// ── The privilege escalation surface ────────────────────────────────────────

describe('users/{uid} — privileged fields', () => {
  it('lets a user update their own harmless profile fields', async () => {
    await assertSucceeds(updateDoc(doc(asAlice(), 'users', ALICE), { displayName: 'Alice A' }));
  });

  it.each([
    ['role', { role: 'admin' }],
    ['membership', { membership: { status: 'active' } }],
    ['coaching', { coaching: { status: 'active' } }],
    ['purchasedProgramIds', { purchasedProgramIds: ['prog1'] }],
    ['trainerId', { trainerId: 'someone' }],
    ['banned', { banned: false }],
    ['trialUsedAt', { trialUsedAt: null }],
    ['twoFactorEnabled', { twoFactorEnabled: false }],
    ['twoFactorEmail', { twoFactorEmail: 'attacker@evil.com' }],
  ])('refuses a self-write to %s', async (_name, patch) => {
    await assertFails(updateDoc(doc(asAlice(), 'users', ALICE), patch));
  });

  it('refuses to grant membership even alongside a legitimate field', async () => {
    await assertFails(updateDoc(doc(asAlice(), 'users', ALICE), {
      displayName: 'Alice', membership: { status: 'active' },
    }));
  });

  it('lets an admin write those fields', async () => {
    await assertSucceeds(updateDoc(doc(asAdmin(), 'users', ALICE), { membership: { status: 'active' } }));
  });
});

describe('users/{uid} — creation', () => {
  it('allows a normal signup', async () => {
    const db = env.authenticatedContext('newbie').firestore();
    await assertSucceeds(setDoc(doc(db, 'users', 'newbie'), { role: 'user', displayName: 'New', trainerId: null }));
  });

  it('REFUSES self-signup as admin even with no installer marker present', async () => {
    // The regression that mattered: this was permitted for as long as
    // system/installer.installed wasn't exactly true, and that flag was only
    // written at the very end of a browser-side install. Setup is server-side
    // now and this must never be allowed again.
    const db = env.authenticatedContext('attacker').firestore();
    await assertFails(setDoc(doc(db, 'users', 'attacker'), { role: 'admin', displayName: 'Evil', trainerId: null }));
  });

  it('refuses a signup that pre-loads paid state', async () => {
    const db = env.authenticatedContext('n2').firestore();
    await assertFails(setDoc(doc(db, 'users', 'n2'), { role: 'user', membership: { status: 'active' } }));
    await assertFails(setDoc(doc(db, 'users', 'n2'), { role: 'user', purchasedProgramIds: ['p'] }));
  });

  it('refuses creating a doc under someone else\'s uid', async () => {
    await assertFails(setDoc(doc(asAlice(), 'users', 'victim'), { role: 'user' }));
  });
});

// ── Isolation between users ─────────────────────────────────────────────────

describe('user data isolation', () => {
  it('refuses reading another user\'s profile', async () => {
    await assertFails(getDoc(doc(asBob(), 'users', ALICE)));
  });

  it('allows reading your own, and allows an admin to read anyone', async () => {
    await assertSucceeds(getDoc(doc(asAlice(), 'users', ALICE)));
    await assertSucceeds(getDoc(doc(asAdmin(), 'users', ALICE)));
  });

  it('refuses deleting another user', async () => {
    await assertFails(deleteDoc(doc(asBob(), 'users', ALICE)));
  });

  it('scopes events to their owner', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'events', 'e1'), { userId: ALICE, type: 'WORKOUT_COMPLETED', trainerId: null, payload: {}, createdAt: new Date() });
    });
    await assertSucceeds(getDoc(doc(asAlice(), 'events', 'e1')));
    await assertFails(getDoc(doc(asBob(), 'events', 'e1')));
  });

  it('refuses writing an event attributed to someone else', async () => {
    await assertFails(setDoc(doc(asBob(), 'events', 'e2'), {
      userId: ALICE, type: 'WORKOUT_COMPLETED', trainerId: null, payload: {}, createdAt: new Date(),
    }));
  });

  it('makes events immutable once written', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'events', 'e3'), { userId: ALICE, type: 'WORKOUT_COMPLETED', trainerId: null, payload: {}, createdAt: new Date() });
    });
    await assertFails(updateDoc(doc(asAlice(), 'events', 'e3'), { payload: { calories: 99999 } }));
  });
});

// ── System configuration ────────────────────────────────────────────────────

describe('system/config', () => {
  it('refuses an anonymous write even with no installer marker', async () => {
    // Same deleted exemption as the admin-signup case above.
    await assertFails(setDoc(doc(asAnon(), 'system', 'config'), { appName: 'Pwned' }));
  });

  it('refuses a signed-in non-admin write', async () => {
    await assertFails(setDoc(doc(asAlice(), 'system', 'config'), { appName: 'Pwned' }));
  });

  it('allows an admin write', async () => {
    await assertSucceeds(setDoc(doc(asAdmin(), 'system', 'config'), { appName: 'Warfare' }, { merge: true }));
  });

  it('keeps secrets unreadable by regular users', async () => {
    await seed(async (db) => { await setDoc(doc(db, 'system', 'secrets'), { OPENAI_API_KEY: { ciphertext: 'x' } }); });
    await assertFails(getDoc(doc(asAlice(), 'system', 'secrets')));
  });
});

// ── Leaderboard ─────────────────────────────────────────────────────────────

describe('leaderboardPublic — retired, admin-only', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'leaderboardPublic', ALICE), { displayName: 'Alice', xp: 10 });
      await setDoc(doc(db, 'users', ALICE), { xp: 500 }, { merge: true });
    });
  });

  // The public leaderboard was removed from the product. Existing rows are
  // left in place (reversible, and account deletion still clears them via the
  // Admin SDK), but no client may write one — so it cannot quietly come back
  // to life as a rankable surface without a rules change.

  it('refuses a user writing their own row at all', async () => {
    await assertFails(setDoc(doc(asAlice(), 'leaderboardPublic', ALICE), { xp: 500 }, { merge: true }));
  });

  it('refuses writing to someone else\'s row', async () => {
    await assertFails(setDoc(doc(asBob(), 'leaderboardPublic', ALICE), { xp: 0 }, { merge: true }));
  });

  it('still allows an admin to write (account deletion, cleanup)', async () => {
    await assertSucceeds(setDoc(doc(asAdmin(), 'leaderboardPublic', ALICE), { xp: 0 }, { merge: true }));
  });
});

// ── XP bounds on the user document ──────────────────────────────────────────
// XP survives the leaderboard's removal as personal progression, and is still
// computed in the browser — so the per-write cap stays as a sanity bound.

describe('users/{uid} — xp growth', () => {
  beforeEach(async () => {
    await seed(async (db) => { await setDoc(doc(db, 'users', ALICE), { xp: 500 }, { merge: true }); });
  });

  it('refuses inflating xp far beyond one workout', async () => {
    await assertFails(updateDoc(doc(asAlice(), 'users', ALICE), { xp: 9_999_999 }));
  });

  it('allows one plausible workout of xp growth', async () => {
    await assertSucceeds(updateDoc(doc(asAlice(), 'users', ALICE), { xp: 500 + 3000 }));
  });

  it('leaves writes that do not touch xp alone', async () => {
    await assertSucceeds(updateDoc(doc(asAlice(), 'users', ALICE), { displayName: 'Alice B' }));
  });
});

// ── Event payload bounds ────────────────────────────────────────────────────
// streak and totalWorkouts are recomputed from this ledger, so an unbounded
// payload meant those numbers were only as honest as the client chose to be.

describe('events — WORKOUT_COMPLETED payload bounds', () => {
  const evt = (payload: Record<string, unknown>) => ({
    type: 'WORKOUT_COMPLETED', userId: ALICE, trainerId: null, createdAt: new Date(), payload,
  });

  it('accepts a normal session', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), 'events', 'e1'),
      evt({ duration: 62, exerciseCount: 6, totalWeightLifted: 4200, calories: 496, xpEarned: 810 })));
  });

  it('accepts a legacy import with no xpEarned at all', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), 'events', 'e2'),
      evt({ workoutLogId: 'old1', duration: 45, exerciseCount: 4, totalWeightLifted: 0, calories: 360 })));
  });

  it('refuses an impossible duration', async () => {
    await assertFails(setDoc(doc(asAlice(), 'events', 'e3'), evt({ duration: 100_000 })));
  });

  it('refuses a fabricated xpEarned', async () => {
    await assertFails(setDoc(doc(asAlice(), 'events', 'e4'), evt({ duration: 60, xpEarned: 9_999_999 })));
  });

  it('refuses an absurd exercise count', async () => {
    await assertFails(setDoc(doc(asAlice(), 'events', 'e5'), evt({ duration: 60, exerciseCount: 50_000 })));
  });

  it('still accepts other event types unchanged', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), 'events', 'e6'), {
      type: 'WATER_LOGGED', userId: ALICE, trainerId: null, createdAt: new Date(), payload: { amountMl: 500 },
    }));
  });
});

// ── Channels ────────────────────────────────────────────────────────────────

describe('channels', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'channels', 'c1'), { name: 'General', trainerId: null, postCount: 0 });
      await setDoc(doc(db, 'channels', 'c1', 'posts', 'p1'), { userId: ALICE, content: 'hi', likes: [], replyCount: 0, createdAt: new Date() });
    });
  });

  it('is readable by members but only writable by admins', async () => {
    await assertSucceeds(getDoc(doc(asAlice(), 'channels', 'c1')));
    await assertFails(setDoc(doc(asAlice(), 'channels', 'c1'), { name: 'Hijacked' }, { merge: true }));
    await assertSucceeds(setDoc(doc(asAdmin(), 'channels', 'c1'), { name: 'General 2' }, { merge: true }));
  });

  it('refuses posting under another member\'s name', async () => {
    await assertFails(setDoc(doc(asBob(), 'channels', 'c1', 'posts', 'p2'), {
      userId: ALICE, content: 'impersonated', likes: [], replyCount: 0, createdAt: new Date(),
    }));
  });

  it('refuses claiming the admin badge on a post', async () => {
    await assertFails(setDoc(doc(asBob(), 'channels', 'c1', 'posts', 'p3'), {
      userId: BOB, userIsAdmin: true, content: 'fake badge', likes: [], replyCount: 0, createdAt: new Date(),
    }));
  });

  it('allows a genuine reply, including a threaded one', async () => {
    await assertSucceeds(setDoc(doc(asBob(), 'channels', 'c1', 'posts', 'p1', 'replies', 'r1'), {
      userId: BOB, userDisplayName: 'Bob', content: 'nice', likes: [], replyCount: 0, replyTo: 'p1', createdAt: new Date(),
    }));
    await assertSucceeds(setDoc(doc(asAlice(), 'channels', 'c1', 'posts', 'p1', 'replies', 'r2'), {
      userId: ALICE, userDisplayName: 'Alice', content: 'thanks', likes: [], replyCount: 0, replyTo: 'p1', parentReplyId: 'r1', createdAt: new Date(),
    }));
  });
});

// ── Anonymous access ────────────────────────────────────────────────────────

describe('unauthenticated access', () => {
  it('is refused across user data', async () => {
    await assertFails(getDoc(doc(asAnon(), 'users', ALICE)));
    await assertFails(setDoc(doc(asAnon(), 'users', 'anon'), { role: 'user' }));
    await assertFails(getDoc(doc(asAnon(), 'leaderboardPublic', ALICE)));
  });
});
