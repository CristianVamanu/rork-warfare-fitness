export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin restore — targeted, preview-first.
 *
 *   GET   → the backups available in the private bucket, newest first
 *   POST  → preview (default) or apply a scoped restore
 *
 * Scope is one collection or one member. NOT the whole database, and never
 * Firebase Auth accounts — see src/lib/restore.ts for why both are excluded
 * on purpose. A full rollback stays a deliberate CLI operation
 * (scripts/restore.mjs + RESTORE.md), because Stripe holds state this cannot
 * roll back and a half-restored billing database is worse than a broken one.
 *
 * Applying requires a typed confirmation that names the exact scope, so
 * "restore" is never one mis-click. Every apply is recorded in restoreLog.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { confirmPhraseFor, listBackups, runRestore, type RestoreScope } from '@/lib/restore';

export async function GET(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  try {
    const backups = await listBackups();
    return NextResponse.json({
      backups,
      configured: backups.length > 0 || undefined,
    });
  } catch (err) {
    console.error('[admin/restore] Could not list backups:', err);
    return NextResponse.json({ error: 'Could not list backups. Check R2_BACKUP_BUCKET_NAME.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  const body = await req.json().catch(() => ({})) as {
    key?: string;
    scopeType?: string;
    scopeValue?: string;
    apply?: boolean;
    confirm?: string;
  };

  const { key, scopeType, scopeValue } = body;
  if (!key || !key.startsWith('backups/')) {
    return NextResponse.json({ error: 'A backup key is required' }, { status: 400 });
  }
  if (scopeType !== 'collection' && scopeType !== 'user') {
    return NextResponse.json({ error: 'scopeType must be "collection" or "user"' }, { status: 400 });
  }
  if (!scopeValue || !/^[A-Za-z0-9_-]{1,200}$/.test(scopeValue)) {
    return NextResponse.json({ error: 'A valid scopeValue is required' }, { status: 400 });
  }

  const scope: RestoreScope = { type: scopeType, value: scopeValue };
  const apply = body.apply === true;

  // Typed confirmation, naming the exact scope. A generic "yes" would be
  // muscle memory within a day.
  if (apply && body.confirm?.trim().toLowerCase() !== confirmPhraseFor(scope)) {
    return NextResponse.json(
      { error: `To apply this, type: ${confirmPhraseFor(scope)}`, expected: confirmPhraseFor(scope) },
      { status: 400 },
    );
  }

  try {
    const result = await runRestore({ db, key, scope, apply });

    if (apply) {
      console.warn(`[admin/restore] ${check.uid} restored ${scope.type}:${scope.value} from ${key} — ${result.written} document(s) written`);
      // A restore is the kind of thing you need to be able to reconstruct
      // afterwards: who, what, from which backup, how much.
      await db.collection('restoreLog').add({
        at: FieldValue.serverTimestamp(),
        by: check.uid,
        backupKey: key,
        scopeType: scope.type,
        scopeValue: scope.value,
        documentsWritten: result.written,
        backupCreatedAt: result.manifest?.createdAt ?? null,
      }).catch((err) => console.error('[admin/restore] audit write failed:', err));
    }

    return NextResponse.json({
      ok: true,
      applied: apply,
      manifest: result.manifest,
      counts: result.counts,
      documents: result.documents,
      written: result.written,
      // Surfaced so nobody assumes logins came back with the data.
      skippedAuthAccounts: result.skippedAuthAccounts,
      confirmPhrase: apply ? undefined : confirmPhraseFor(scope),
      // Billing lives in Stripe, not here. If this touched anything
      // membership-shaped, the two can now disagree.
      reconcileAdvised: apply && (scope.type === 'user' || scope.value === 'users'),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Restore failed';
    console.error('[admin/restore] Failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
