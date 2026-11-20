export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET  — audit of 1-to-1 coaching programs (visibility: 'coaching').
 * POST — clears a stale isPublic flag on any coaching program the audit found.
 *
 * Answers one question with evidence instead of reasoning: can a coaching
 * program reach a member by any route other than a trainer or admin
 * assigning it? It checks the stored data, runs the real quiz matcher over
 * every answer combination, and then proves the PUBLISHED security rules by
 * signing in as a throwaway member and attempting each forbidden action
 * against the live database. The throwaway member, its profile and the two
 * test programs are removed afterwards whatever happens.
 *
 * Admin only. Nothing a member has is changed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { isCoachingProgram } from '@/lib/coachingPrograms';
import { programPool, pickAlternatives } from '@/lib/programMatch';
import { rankPrograms } from '@/lib/programs';
import { ONBOARDING_GOALS, PROGRAM_LEVELS, EQUIPMENT_OPTIONS } from '@/lib/onboardingGoals';
import { getPublicPrograms } from '@/lib/publicPrograms';
import { freePlanConfig } from '@/lib/freePlan';

type Status = 'pass' | 'fail' | 'unknown';
interface Check { id: string; label: string; status: Status; detail: string }

const DAYS = [2, 3, 4, 5, 6, 7];
const SEXES = ['male', 'female'];
const AGES = [22, 35, 45, 60];

export async function GET(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);
  const checks: Check[] = [];
  const add = (id: string, label: string, status: Status, detail: string) => checks.push({ id, label, status, detail });

  // ── The data
  const progSnap = await db.collection('programs').get();
  const all: ({ id: string } & Record<string, unknown>)[] = progSnap.docs.map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }));
  const coaching = all.filter((p) => isCoachingProgram(p));
  const coachingIds = new Set(coaching.map((p) => p.id));
  const nameOf = (id: string) => String(all.find((p) => p.id === id)?.name ?? id);

  const flagged = coaching.filter((p) => p.isPublic === true);
  add('flag', 'No 1-to-1 program is flagged public in the database', flagged.length ? 'fail' : 'pass',
    flagged.length ? `${flagged.length} still carry the old public flag: ${flagged.map((p) => String(p.name)).join(', ')}. The app ignores the flag now, but clear it with "Fix flags".` : `${coaching.length} 1-to-1 program${coaching.length === 1 ? '' : 's'} found, none flagged public.`);

  // ── What the quiz can assign
  const pool = await programPool();
  const inPool = pool.filter((p) => coachingIds.has(p.id) || isCoachingProgram(p));
  add('pool', 'The quiz matcher cannot see any 1-to-1 program', inPool.length ? 'fail' : 'pass',
    inPool.length ? `In the matcher's pool: ${inPool.map((p) => p.name).join(', ')}` : `Matcher pool is ${pool.length} programs, none 1-to-1.`);

  // The matcher is rankPrograms() over this pool; ranking the one pool for
  // every answer is the same computation as matchProgram() per answer,
  // without two thousand identical database reads.
  let combos = 0; const leaked = new Set<string>(); let unmatched = 0;
  for (const { v: goal } of ONBOARDING_GOALS) for (const { v: experience } of PROGRAM_LEVELS) for (const trainingDays of DAYS)
    for (const sex of SEXES) for (const { v: equipment } of EQUIPMENT_OPTIONS) for (const age of AGES) {
      combos++;
      const ranked = rankPrograms(pool, goal, experience, trainingDays, sex, equipment, undefined, age);
      if (!ranked[0]) { unmatched++; continue; }
      for (const p of [ranked[0], ...pickAlternatives(ranked)]) if (coachingIds.has(p.id) || isCoachingProgram(p)) leaked.add(p.name);
    }
  add('sweep', 'Every quiz answer combination assigns a library program', leaked.size ? 'fail' : 'pass',
    leaked.size ? `1-to-1 programs offered by the quiz: ${[...leaked].join(', ')}` : `${combos} answer combinations ranked by the real matcher (first pick and both alternatives): none was a 1-to-1 program${unmatched ? `; ${unmatched} returned no match at all` : ''}.`);

  const publicList = await getPublicPrograms().catch(() => []);
  const inPublic = publicList.filter((p) => coachingIds.has(p.id));
  add('public', 'The public website lists no 1-to-1 program', inPublic.length ? 'fail' : 'pass',
    inPublic.length ? `On the public site: ${inPublic.map((p) => p.name).join(', ')}` : `${publicList.length} programs on the public site, none 1-to-1.`);

  const sys = (await db.collection('system').doc('config').get()).data() ?? {};
  const offers = freePlanConfig(sys as Parameters<typeof freePlanConfig>[0]).offers.filter((o) => coachingIds.has(o.id));
  add('freeplan', 'No free-plan offer points at a 1-to-1 program', offers.length ? 'fail' : 'pass',
    offers.length ? `Free-plan offers using one: ${offers.map((o) => o.name).join(', ')}. Remove them in Admin; the sign-up for them is already refused.` : 'None.');

  // ── Who is on one (information for the admin, not a pass/fail)
  const onCoaching: { uid: string; name: string; email: string; program: string }[] = []; const suggested: string[] = [];
  let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  for (;;) {
    let q = db.collection('users').orderBy('__name__').limit(400);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    if (page.empty) break;
    for (const d of page.docs) {
      const u = d.data();
      const pid = u.activeProgram?.programId as string | undefined;
      if (pid && coachingIds.has(pid)) onCoaching.push({ uid: d.id, name: String(u.displayName ?? ''), email: String(u.email ?? ''), program: nameOf(pid) });
      const np = u.nextProgram?.programId as string | undefined;
      if (np && coachingIds.has(np)) suggested.push(`${u.displayName ?? d.id} → ${nameOf(np)}`);
    }
    last = page.docs[page.docs.length - 1];
    if (page.size < 400) break;
  }
  add('next', 'No member has a 1-to-1 program queued as their suggested next program', suggested.length ? 'fail' : 'pass',
    suggested.length ? suggested.join('; ') : 'None.');

  // ── The published rules, tried for real as a member
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY; const projectId = process.env.FIREBASE_PROJECT_ID;
  const tag = `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const uid = `${tag}-member`; const coachId = `${tag}-coaching`; const libId = `${tag}-library`;
  const auth = getAuth(app);
  const live = (id: string, label: string, ok: boolean | null, pass: string, fail: string) =>
    add(id, label, ok === null ? 'unknown' : ok ? 'pass' : 'fail', ok === null ? 'Could not be tested (see the first rules check).' : ok ? pass : fail);
  try {
    if (!apiKey || !projectId) throw new Error('NEXT_PUBLIC_FIREBASE_API_KEY or FIREBASE_PROJECT_ID is not set on the server');
    await auth.createUser({ uid });
    // The member owns both programs outright, so every OTHER gate (plan,
    // price, members-only, trial day cap) is open for both. Whatever is
    // refused below is refused by the coaching rule alone, and the library
    // program is the control that proves an ordinary enrolment still works.
    await db.collection('programs').doc(coachId).set({ name: 'Audit (temporary 1-to-1)', visibility: 'coaching', isPublic: false, _audit: true });
    await db.collection('programs').doc(libId).set({ name: 'Audit (temporary library)', visibility: 'personal', ownerId: uid, isPublic: false, _audit: true });
    await db.collection('users').doc(uid).set({ role: 'user', displayName: 'Rules audit', purchasedProgramIds: [coachId, libId], _audit: true });
    const custom = await auth.createCustomToken(uid);
    const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: custom, returnSecureToken: true }),
    });
    const idToken = ((await signIn.json()) as { idToken?: string }).idToken;
    if (!idToken) throw new Error(`Could not sign the test member in (HTTP ${signIn.status})`);
    const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    const H = { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };
    const enrol = (programId: string) => fetch(`${base}/users/${uid}?updateMask.fieldPaths=activeProgram`, {
      method: 'PATCH', headers: H,
      body: JSON.stringify({ fields: { activeProgram: { mapValue: { fields: { programId: { stringValue: programId }, programName: { stringValue: 'audit' }, lastCompletedDayIndex: { integerValue: '-1' } } } } } }),
    }).then((r) => r.status);
    const read = (path: string) => fetch(`${base}/${path}`, { headers: H }).then((r) => r.status);

    const sEnrolCoach = await enrol(coachId);
    const sReadCoach = await read(`programs/${coachId}`);
    const sList = await read('programs?pageSize=1');
    const sReadLib = await read(`programs/${libId}`);
    const sEnrolLib = await enrol(libId);
    // An admin assignment, then the member logging on it: the legitimate path.
    await db.collection('users').doc(uid).set({ activeProgram: { programId: coachId, programName: 'audit', lastCompletedDayIndex: -1 } }, { merge: true });
    const sReadAssigned = await read(`programs/${coachId}`);
    const sProgress = await fetch(`${base}/users/${uid}?updateMask.fieldPaths=activeProgram`, {
      method: 'PATCH', headers: H,
      body: JSON.stringify({ fields: { activeProgram: { mapValue: { fields: { programId: { stringValue: coachId }, programName: { stringValue: 'audit' }, lastCompletedDayIndex: { integerValue: '0' }, completedWorkouts: { integerValue: '1' } } } } } }),
    }).then((r) => r.status);

    add('rules-run', 'The live security rules were tested as a real member', 'pass', 'Signed in as a temporary member and tried each action against the live database.');
    live('rules-enrol', 'A member cannot put themselves on a 1-to-1 program', sEnrolCoach === 403, 'Refused by the live rules.', `NOT refused (HTTP ${sEnrolCoach}). The published rules are out of date: publish firestore.rules.`);
    live('rules-read', "A member cannot read someone else's 1-to-1 program", sReadCoach === 403, 'Refused by the live rules.', `NOT refused (HTTP ${sReadCoach}). The published rules are out of date.`);
    live('rules-list', 'A member cannot list the program collection', sList === 403, 'Refused by the live rules.', `NOT refused (HTTP ${sList}). The published rules are out of date.`);
    live('rules-lib', 'A member can still open and enrol in a library program', sReadLib === 200 && sEnrolLib === 200, 'Read and enrolment both allowed.', `Read HTTP ${sReadLib}, enrol HTTP ${sEnrolLib}: ordinary enrolment is being blocked.`);
    live('rules-assigned', 'After an admin assigns it, the member can open it and log progress', sReadAssigned === 200 && sProgress === 200, 'Read and progress write both allowed.', `Read HTTP ${sReadAssigned}, progress HTTP ${sProgress}.`);
  } catch (err) {
    add('rules-run', 'The live security rules were tested as a real member', 'unknown', `Could not run: ${err instanceof Error ? err.message : String(err)}`);
    for (const [id, label] of [['rules-enrol', 'A member cannot put themselves on a 1-to-1 program'], ['rules-read', "A member cannot read someone else's 1-to-1 program"], ['rules-list', 'A member cannot list the program collection']] as const) live(id, label, null, '', '');
  } finally {
    await Promise.allSettled([
      db.collection('programs').doc(coachId).delete(), db.collection('programs').doc(libId).delete(),
      db.collection('users').doc(uid).delete(), auth.deleteUser(uid),
    ]);
  }

  const failed = checks.filter((c) => c.status === 'fail').length; const unknown = checks.filter((c) => c.status === 'unknown').length;
  return NextResponse.json({
    verdict: failed ? 'fail' : unknown ? 'incomplete' : 'pass',
    summary: failed ? `${failed} check${failed === 1 ? '' : 's'} failed` : unknown ? `No failures, but ${unknown} check${unknown === 1 ? '' : 's'} could not be run` : `All ${checks.length} checks passed`,
    checks,
    coachingPrograms: coaching.map((p) => ({ id: p.id, name: String(p.name ?? ''), flaggedPublic: p.isPublic === true, status: String(p.status ?? '') })),
    membersOnCoaching: onCoaching,
    ranAt: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);
  const snap = await db.collection('programs').where('visibility', '==', 'coaching').get();
  const stale = snap.docs.filter((d) => d.data().isPublic === true);
  const batch = db.batch();
  for (const d of stale) batch.update(d.ref, { isPublic: false });
  if (stale.length) await batch.commit();
  return NextResponse.json({ ok: true, fixed: stale.length });
}
