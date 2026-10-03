import { NextRequest, NextResponse } from 'next/server';
import { getSecret } from '@/lib/secrets';
import { storageHostOf } from '@/lib/storageHost';

/**
 * Same-origin passthrough for the breathing soundtracks.
 *
 * The files live in R2. Playing them straight from the bucket works, but
 * the browser then treats them as cross-origin media, and cross-origin
 * media cannot be routed through the Web Audio API: the gain node that
 * gives the member a volume slider receives silence. Serving the bytes
 * from our own origin removes that restriction. Range requests are passed
 * through because iOS refuses to play media from a server that ignores
 * them.
 *
 * Only URLs on the R2 bucket (or its configured public domain) are fetched,
 * so this cannot be used to relay arbitrary hosts.
 */
export const dynamic = 'force-dynamic';

async function isAllowed(src: string): Promise<boolean> {
  if (storageHostOf(src) === 'r2') return true;
  const base = (await getSecret('R2_PUBLIC_URL').catch(() => '')) || '';
  if (!base) return false;
  try {
    const a = new URL(src), b = new URL(base);
    return a.protocol === 'https:' && a.hostname === b.hostname;
  } catch { return false; }
}

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get('src') || '';
  if (!src || !(await isAllowed(src))) return NextResponse.json({ error: 'Not an allowed source' }, { status: 400 });

  const headers: Record<string, string> = {};
  const range = req.headers.get('range');
  if (range) headers.Range = range;
  const upstream = await fetch(src, { headers, cache: 'no-store' }).catch(() => null);
  if (!upstream || !upstream.ok && upstream.status !== 206) {
    return NextResponse.json({ error: 'Audio not reachable' }, { status: 502 });
  }

  const out = new Headers();
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  if (!out.has('accept-ranges')) out.set('accept-ranges', 'bytes');
  if (!out.has('content-type')) out.set('content-type', 'audio/mpeg');
  out.set('cache-control', 'public, max-age=86400, immutable');
  return new NextResponse(upstream.body, { status: upstream.status, headers: out });
}
