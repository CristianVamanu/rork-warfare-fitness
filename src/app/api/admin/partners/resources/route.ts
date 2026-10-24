export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST { items, tips } — what partners see under Resources and Tips. */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/verifyAdmin';

interface Item { title: string; url: string; kind: string; description: string }
interface Tip { title: string; body: string }

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const body = await req.json().catch(() => ({})) as { items?: unknown; tips?: unknown };
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const items: Item[] = Array.isArray(body.items) ? (body.items as Partial<Item>[]).map((i) => ({
    title: str(i.title, 120), url: str(i.url, 1000), kind: ['video', 'image', 'copy', 'link', 'file'].includes(String(i.kind)) ? String(i.kind) : 'link', description: str(i.description, 500),
  })).filter((i) => i.title && (i.url.startsWith('https://') || i.kind === 'copy')).slice(0, 100) : [];
  const tips: Tip[] = Array.isArray(body.tips) ? (body.tips as Partial<Tip>[]).map((t) => ({ title: str(t.title, 120), body: str(t.body, 2000) })).filter((t) => t.title && t.body).slice(0, 100) : [];
  await getAdminDb(app).collection('config').doc('partnerResources').set({ items, tips, updatedAt: FieldValue.serverTimestamp(), updatedBy: check.uid });
  return NextResponse.json({ ok: true, items, tips });
}
