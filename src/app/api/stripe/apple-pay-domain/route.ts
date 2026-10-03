export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Apple Pay domain verification.
 *
 * Apple fetches /.well-known/apple-developer-merchantid-domain-association
 * once, when the domain is registered in the Stripe Dashboard, and again
 * from time to time. Stripe supplies the file; it is the same for every
 * Stripe account. next.config.js rewrites that path here.
 *
 * Why a route and not a file in public/: the VPS is deployed from git, and
 * a dot-folder dropped into public/ by hand was 404ing anyway. Served from
 * disk when the file is there (an operator can pin a copy), otherwise
 * fetched from Stripe once per process and kept in memory.
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

const STRIPE_FILE_URL = 'https://stripe.com/files/apple-pay/apple-developer-merchantid-domain-association';
const LOCAL_FILE = path.join(process.cwd(), 'public', '.well-known', 'apple-developer-merchantid-domain-association');

let cached: string | null = null;

async function loadAssociationFile(): Promise<string | null> {
  if (cached) return cached;
  try {
    const local = await readFile(LOCAL_FILE, 'utf8');
    if (local.trim()) { cached = local; return cached; }
  } catch { /* not pinned locally — ask Stripe */ }
  try {
    const res = await fetch(STRIPE_FILE_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.text();
    if (!body.trim()) return null;
    cached = body;
    return cached;
  } catch {
    return null;
  }
}

export async function GET() {
  const body = await loadAssociationFile();
  if (!body) {
    return new NextResponse('Apple Pay domain association file unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
