import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, writeBatch, serverTimestamp, type Firestore } from 'firebase/firestore';

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

  // The exact sequence signUp() and AuthContext run for a brand-new account:
  // the profile listener reads the doc before it exists, then signUp writes
  // the full payload with a server timestamp and null photo.
  it('allows the real signup sequence: read own missing doc, then write the full payload', async () => {
    const db = env.authenticatedContext('fresh').firestore();
    await assertSucceeds(getDoc(doc(db, 'users', 'fresh')));
    await assertSucceeds(setDoc(doc(db, 'users', 'fresh'), {
      displayName: 'Fresh', email: 'fresh@example.com', photoURL: null, weightUnit: 'kg',
      role: 'user', trainerId: null, createdAt: serverTimestamp(), lastActive: serverTimestamp(),
      onboardingComplete: false, stats: { streak: 0, powerLevel: 1, totalWorkouts: 0, totalWeightLifted: 0 },
      timezone: 'Europe/London',
    }));
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

  it('bounds post content and refuses non-https media', async () => {
    const base = { userId: BOB, likes: [], replyCount: 0, createdAt: new Date() };
    // A real upload URL is fine.
    await assertSucceeds(setDoc(doc(asBob(), 'channels', 'c1', 'posts', 'p4'), {
      ...base, content: 'PR day', imageURL: 'https://pub-123.r2.dev/community/bob/x.jpg',
    }));
    // javascript: / data: schemes are refused outright.
    await assertFails(setDoc(doc(asBob(), 'channels', 'c1', 'posts', 'p5'), {
      ...base, content: 'x', imageURL: 'javascript:alert(1)',
    }));
    await assertFails(setDoc(doc(asBob(), 'channels', 'c1', 'posts', 'p6'), {
      ...base, content: 'x', imageURL: 'data:image/png;base64,AAAA',
    }));
    // Text is bounded — 5000 chars is a post, 50000 is storage abuse.
    await assertFails(setDoc(doc(asBob(), 'channels', 'c1', 'posts', 'p7'), {
      ...base, content: 'a'.repeat(50_000),
    }));
    // And content must actually be a string.
    await assertFails(setDoc(doc(asBob(), 'channels', 'c1', 'posts', 'p8'), {
      ...base, content: 12345,
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

// ── PR wall media ────────────────────────────────────────────────────────────

describe('prPosts media', () => {
  const base = { userId: BOB, moderationStatus: 'pending', likedBy: [], likeCount: 0, createdAt: new Date() };
  it('accepts https media of a known type', async () => {
    await assertSucceeds(setDoc(doc(asBob(), 'prPosts', 'pr-ok'), {
      ...base, mediaUrl: 'https://pub-123.r2.dev/prPosts/bob/lift.mp4', mediaType: 'video',
    }));
  });
  it('refuses a non-https mediaUrl and an unknown mediaType', async () => {
    await assertFails(setDoc(doc(asBob(), 'prPosts', 'pr-bad1'), { ...base, mediaUrl: 'javascript:alert(1)', mediaType: 'image' }));
    await assertFails(setDoc(doc(asBob(), 'prPosts', 'pr-bad2'), { ...base, mediaUrl: 'https://x.r2.dev/a.gif', mediaType: 'gif' }));
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

// ── The plan paywall, enforced server-side ──────────────────────────────────
//
// The client decides what to SHOW; these rules decide what may actually be
// written. Before this, any active subscription satisfied the program gate,
// so a member on the entry plan could switch into any premium program by
// writing to Firestore directly and the tier existed only in the UI.

describe('program access by plan', () => {
  const CONQUER = ['nutrition-ai'];                   // no 'premium-programs'
  const VANGUARD = ['nutrition-ai', 'premium-programs'];

  const enrol = (programId: string) => ({
    activeProgram: {
      programId, programName: programId, enrolledAt: new Date(),
      completedWorkouts: 0, totalWorkouts: 36,
    },
  });

  /**
   * Alice, paying on `planId`, already training `on`, with the entitlement
   * map published exactly as saveMembershipPlans() writes it.
   */
  async function member(
    planId: string | undefined,
    entitlements: Record<string, string[]> | undefined,
    on = 'sas',
  ) {
    await seed(async (db) => {
      await setDoc(doc(db, 'users', ALICE), {
        role: 'user', displayName: 'Alice',
        membership: { status: 'active', ...(planId ? { planId } : {}) },
        ...enrol(on),
      });
      // Premium, and free of charge — so only the members-only gate is in play.
      await setDoc(doc(db, 'programs', 'sas'), { name: 'SAS', isPremium: true, price: 0 });
      await setDoc(doc(db, 'programs', 'alpha'), { name: 'Alpha Bulk', isPremium: true, price: 0 });
      await setDoc(doc(db, 'programs', 'free'), { name: 'Freebie', isPremium: false, price: 0 });
      if (entitlements) {
        await setDoc(doc(db, 'config', 'planEntitlements'), { membership: entitlements });
      }
      // Trial off, so nothing passes on the trial branch by accident.
      await setDoc(doc(db, 'config', 'membership'), { enabled: true, trialDays: 0 });
    });
  }

  it('entry plan: may keep training the program they were assigned', async () => {
    await member('conquer', { conquer: CONQUER });
    await assertSucceeds(updateDoc(doc(asAlice(), 'users', ALICE), {
      'activeProgram.completedWorkouts': 1,
      'activeProgram.lastCompletedDayIndex': 0,
    }));
  });

  it('entry plan: may NOT switch into another premium program', async () => {
    // The hole this closes. The app shows "Upgrade to unlock"; this is what
    // happens when someone skips the app and writes the document themselves.
    await member('conquer', { conquer: CONQUER });
    await assertFails(updateDoc(doc(asAlice(), 'users', ALICE), enrol('alpha')));
  });

  it('entry plan: may still switch to a non-premium program', async () => {
    await member('conquer', { conquer: CONQUER });
    await assertSucceeds(updateDoc(doc(asAlice(), 'users', ALICE), enrol('free')));
  });

  it('full plan: may switch into any premium program', async () => {
    await member('vanguard', { conquer: CONQUER, vanguard: VANGUARD });
    await assertSucceeds(updateDoc(doc(asAlice(), 'users', ALICE), enrol('alpha')));
  });

  it('a plan configured with no restrictions is unrestricted', async () => {
    await member('openplan', { openplan: [] });
    await assertSucceeds(updateDoc(doc(asAlice(), 'users', ALICE), enrol('alpha')));
  });

  it('fails OPEN when the map has not been published yet', async () => {
    // Nobody already paying may be locked out the moment this ships, before
    // the plans have been saved once.
    await member('conquer', undefined);
    await assertSucceeds(updateDoc(doc(asAlice(), 'users', ALICE), enrol('alpha')));
  });

  it('fails OPEN for a plan missing from the map', async () => {
    await member('renamed-plan', { conquer: CONQUER });
    await assertSucceeds(updateDoc(doc(asAlice(), 'users', ALICE), enrol('alpha')));
  });

  it('an admin comp with no plan id keeps full access', async () => {
    await member(undefined, { conquer: CONQUER });
    await assertSucceeds(updateDoc(doc(asAlice(), 'users', ALICE), enrol('alpha')));
  });

  it('a purchased program is allowed whatever the plan says', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users', ALICE), {
        role: 'user', displayName: 'Alice',
        membership: { status: 'active', planId: 'conquer' },
        purchasedProgramIds: ['alpha'],
        ...enrol('sas'),
      });
      await setDoc(doc(db, 'programs', 'alpha'), { name: 'Alpha Bulk', isPremium: true, price: 0 });
      await setDoc(doc(db, 'config', 'planEntitlements'), { membership: { conquer: CONQUER } });
      await setDoc(doc(db, 'config', 'membership'), { enabled: true, trialDays: 0 });
    });
    await assertSucceeds(updateDoc(doc(asAlice(), 'users', ALICE), enrol('alpha')));
  });

  it('a member cannot publish entitlements for themselves', async () => {
    // The map is only trustworthy because config is admin-write-only.
    await member('conquer', { conquer: CONQUER });
    await assertFails(setDoc(doc(asAlice(), 'config', 'planEntitlements'), {
      membership: { conquer: VANGUARD },
    }));
    await assertFails(updateDoc(doc(asAlice(), 'users', ALICE), {
      'membership.planId': 'vanguard',
    }));
  });
});

describe('support tickets', () => {
  /**
   * A new ticket and its first message are written in ONE batch, so that a
   * failure between them cannot leave a ticket with no message in it. Rules
   * evaluate each write in a batch against the state BEFORE the batch, so
   * when the message rule reached for its parent ticket to check
   * status != 'resolved', the ticket did not exist yet and the whole batch
   * was denied. Every support request from a member failed with "Could not
   * send your request", and nothing reached staff.
   */
  it('a member can open a ticket and post its first message in one batch', async () => {
    const db = asAlice();
    const ticket = doc(collection(db, 'supportTickets'));
    const batch = writeBatch(db as never);
    batch.set(ticket, {
      userId: ALICE, userDisplayName: 'Alice', userEmail: 'a@x.com',
      subject: 'Test', status: 'pending', lastMessage: 'This is a test',
      lastMessageAt: serverTimestamp(), createdAt: serverTimestamp(),
      unreadByUser: false, unreadByAdmin: true,
    });
    batch.set(doc(collection(db, 'supportTickets', ticket.id, 'messages')), {
      senderId: ALICE, senderName: 'Alice', content: 'This is a test',
      isFromAdmin: false, createdAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
  });

  it('a member cannot post into someone else\'s existing ticket', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'supportTickets', 't1'), { userId: BOB, status: 'pending' });
    });
    await assertFails(setDoc(doc(asAlice(), 'supportTickets', 't1', 'messages', 'm1'), {
      senderId: ALICE, senderName: 'Alice', content: 'let me in', isFromAdmin: false,
    }));
  });

  it('nobody can post into a resolved ticket', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'supportTickets', 't2'), { userId: ALICE, status: 'resolved' });
    });
    await assertFails(setDoc(doc(asAlice(), 'supportTickets', 't2', 'messages', 'm1'), {
      senderId: ALICE, senderName: 'Alice', content: 'reopen please', isFromAdmin: false,
    }));
  });

  it('a member cannot forge a message as staff', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'supportTickets', 't3'), { userId: ALICE, status: 'pending' });
    });
    await assertFails(setDoc(doc(asAlice(), 'supportTickets', 't3', 'messages', 'm1'), {
      senderId: ALICE, senderName: 'Alice', content: 'official reply', isFromAdmin: true,
    }));
  });
});

describe('channel replies — editable and deletable', () => {
  /**
   * Replies were write-once (allow update, delete: if false), so a typo stood
   * forever and nobody — not even an admin — could remove one.
   */
  const seedThread = () => seed(async (db) => {
    await setDoc(doc(db, 'channels', 'c1'), { name: 'Start Here', allowUserPosts: true });
    await setDoc(doc(db, 'channels', 'c1', 'posts', 'p1'), { userId: BOB, content: 'welcome' });
    await setDoc(doc(db, 'channels', 'c1', 'posts', 'p1', 'replies', 'r1'), { userId: ALICE, content: 'hi', userIsAdmin: false });
  });

  it('refuses a channel post whose poster frame is not an https URL', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'channels', 'c1'), { name: 'General', allowUserPosts: true });
    });
    const db = asAlice();
    await assertFails(setDoc(doc(db, 'channels', 'c1', 'posts', 'bad'), {
      userId: ALICE, content: 'clip', imageURL: 'https://cdn.example.com/a.mp4',
      mediaType: 'video', posterURL: 'javascript:alert(1)',
    }));
    await assertSucceeds(setDoc(doc(db, 'channels', 'c1', 'posts', 'good'), {
      userId: ALICE, content: 'clip', imageURL: 'https://cdn.example.com/a.mp4',
      mediaType: 'video', posterURL: 'https://cdn.example.com/a.jpg',
    }));
  });

  it('the author can fix their own reply', async () => {
    await seedThread();
    await assertSucceeds(updateDoc(doc(asAlice(), 'channels', 'c1', 'posts', 'p1', 'replies', 'r1'), {
      content: 'hi, fixed', editedAt: new Date(),
    }));
  });

  it('nobody else can rewrite it — not another member, not an admin', async () => {
    await seedThread();
    await assertFails(updateDoc(doc(asBob(), 'channels', 'c1', 'posts', 'p1', 'replies', 'r1'), { content: 'words I never wrote' }));
    await assertFails(updateDoc(doc(asAdmin(), 'channels', 'c1', 'posts', 'p1', 'replies', 'r1'), { content: 'words I never wrote' }));
  });

  it('an edit cannot change who wrote it or forge the admin badge', async () => {
    await seedThread();
    await assertFails(updateDoc(doc(asAlice(), 'channels', 'c1', 'posts', 'p1', 'replies', 'r1'), { content: 'x', userId: BOB }));
    await assertFails(updateDoc(doc(asAlice(), 'channels', 'c1', 'posts', 'p1', 'replies', 'r1'), { content: 'x', userIsAdmin: true }));
  });

  it('the author and an admin can delete a reply, a bystander cannot', async () => {
    await seedThread();
    await assertFails(deleteDoc(doc(asBob(), 'channels', 'c1', 'posts', 'p1', 'replies', 'r1')));
    await assertSucceeds(deleteDoc(doc(asAlice(), 'channels', 'c1', 'posts', 'p1', 'replies', 'r1')));
    await seedThread();
    await assertSucceeds(deleteDoc(doc(asAdmin(), 'channels', 'c1', 'posts', 'p1', 'replies', 'r1')));
  });

  it('the author can delete their own post, which the menu already offered', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'channels', 'c2'), { name: 'Wins', allowUserPosts: true });
      await setDoc(doc(db, 'channels', 'c2', 'posts', 'p9'), { userId: ALICE, content: 'mine' });
    });
    await assertFails(deleteDoc(doc(asBob(), 'channels', 'c2', 'posts', 'p9')));
    await assertSucceeds(deleteDoc(doc(asAlice(), 'channels', 'c2', 'posts', 'p9')));
  });
});
