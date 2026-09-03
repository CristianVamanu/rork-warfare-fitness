export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One-time installer, performed entirely server-side with the Admin SDK.
 *
 * This route exists to close a hole that was live in production: the
 * installer used to run in the BROWSER, which meant firestore.rules had to
 * grant unauthenticated callers the right to do privileged things while
 * setup was pending —
 *
 *   users/{uid}  create with role:'admin'   if installerNotDone()
 *   system/config write                      if installerNotDone()
 *
 * `installerNotDone()` was true whenever system/installer was missing or
 * its `installed` flag wasn't exactly true. The install flow only wrote
 * that flag as its LAST step, after creating the admin and writing config,
 * so any interruption — a thrown error, a closed tab, an admin created by
 * hand instead of through the wizard — left the flag unwritten and both
 * grants wide open. Anyone who found /install could then register
 * themselves as an admin and overwrite system config. That is exactly what
 * was found on this deployment.
 *
 * Doing the privileged writes here instead means the client never needs
 * those rule exemptions at all, so they have been deleted from
 * firestore.rules. The client cannot write role:'admin' under any
 * circumstance now — this route is the only path, and it refuses to run
 * twice.
 *
 * Three independent guards, checked server-side in order:
 *   1. system/installer.installed === true            -> refuse
 *   2. any existing user with role 'admin'            -> refuse
 *   3. INSTALL_SECRET set in env but not matched      -> refuse
 *
 * Guard 2 is the important one: it is derived from real data rather than a
 * flag someone forgot to write, so it stays correct even if the marker doc
 * is missing. Guard 3 is optional defence in depth for anyone who wants a
 * re-installable environment.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';

interface InstallBody {
  email?: string;
  password?: string;
  name?: string;
  secret?: string;
  config?: {
    appName?: string;
    trainerName?: string;
    themeColor?: string;
    openaiModel?: string;
    stripePublishableKey?: string;
  };
}

export async function POST(req: NextRequest) {
  const app = getAdminApp();
  if (!app) {
    return NextResponse.json({ error: 'Firebase Admin is not configured on the server.' }, { status: 500 });
  }
  const db = getAdminDb(app);
  const auth = getAuth(app);

  let body: InstallBody;
  try {
    body = (await req.json()) as InstallBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const email = body.email?.trim();
  const password = body.password ?? '';
  const name = body.name?.trim();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: 'A valid admin email is required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Admin password must be at least 8 characters' }, { status: 400 });
  }
  if (!name || name.length < 2) {
    return NextResponse.json({ error: 'An admin name is required' }, { status: 400 });
  }

  // ── Guard 3: optional shared secret ──────────────────────────────────────
  const requiredSecret = process.env.INSTALL_SECRET;
  if (requiredSecret && body.secret !== requiredSecret) {
    return NextResponse.json({ error: 'Invalid install secret' }, { status: 403 });
  }

  try {
    // ── Guard 1: explicit marker ───────────────────────────────────────────
    const installerSnap = await db.collection('system').doc('installer').get();
    if (installerSnap.data()?.installed === true) {
      return NextResponse.json({ error: 'This installation is already complete.' }, { status: 409 });
    }

    // ── Guard 2: derived from real data, so a missing marker can't reopen it ─
    const existingAdmin = await db.collection('users').where('role', '==', 'admin').limit(1).get();
    if (!existingAdmin.empty) {
      // Self-heal: an admin exists but the marker was never written — that is
      // precisely the state that left the old rules exemptions open. Write it
      // now so nothing else depends on noticing this again.
      await db.collection('system').doc('installer').set(
        { installed: true, installedAt: FieldValue.serverTimestamp(), sealedBy: 'install-route-guard' },
        { merge: true },
      );
      return NextResponse.json(
        { error: 'An administrator already exists for this installation. Installation has been sealed.' },
        { status: 409 },
      );
    }

    // ── Create the admin account ───────────────────────────────────────────
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
      emailVerified: true, // the installer is the operator; no verification loop
    });
    const uid = userRecord.uid;

    try {
      // Mirrors the old client-side createAdminUser + createTenant +
      // setSystemConfig, but as one server-side sequence.
      await db.collection('users').doc(uid).set({
        displayName: name,
        email,
        photoURL: null,
        weightUnit: 'kg',
        role: 'admin',
        trainerId: uid,
        createdAt: FieldValue.serverTimestamp(),
        lastActive: FieldValue.serverTimestamp(),
        onboardingComplete: true,
        stats: { streak: 0, powerLevel: 100, totalWorkouts: 0, totalWeightLifted: 0 },
      });

      await db.collection('tenants').doc(uid).set({
        trainerId: uid,
        name,
        email,
        createdAt: FieldValue.serverTimestamp(),
        stripe: { subscriptionStatus: 'inactive' },
      });

      const cfg = body.config ?? {};
      await db.collection('system').doc('config').set(
        {
          appName: cfg.appName || 'Warfare Fitness',
          trainerName: cfg.trainerName || name,
          themeColor: cfg.themeColor || '#F5A623',
          openaiModel: cfg.openaiModel || 'gpt-4o-mini',
          stripePublishableKey: cfg.stripePublishableKey || '',
          trainerId: uid,
        },
        { merge: true },
      );

      // Sealed LAST, but guard 2 above means a failure here can no longer
      // leave privileged access open — the admin now exists, so any later
      // attempt is refused and seals the marker itself.
      await db.collection('system').doc('installer').set({
        installed: true,
        installedAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      // Roll the Auth user back so a retry doesn't hit email-already-in-use.
      await auth.deleteUser(uid).catch(() => {});
      throw err;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Installation failed';
    console.error('[install] Failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Whether setup still needs to run — used by /install to decide what to show. */
export async function GET() {
  const app = getAdminApp();
  if (!app) return NextResponse.json({ installed: false, ready: false });
  const db = getAdminDb(app);
  try {
    const [installerSnap, adminSnap] = await Promise.all([
      db.collection('system').doc('installer').get(),
      db.collection('users').where('role', '==', 'admin').limit(1).get(),
    ]);
    const installed = installerSnap.data()?.installed === true || !adminSnap.empty;
    return NextResponse.json({ installed, ready: true });
  } catch {
    // Fail CLOSED: if we can't tell, claim installed so the wizard stays shut.
    return NextResponse.json({ installed: true, ready: false });
  }
}
