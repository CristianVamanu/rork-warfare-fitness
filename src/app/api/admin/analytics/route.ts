export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Real visitor analytics pulled straight from Cloudflare's edge — every
 * request to warfarefitness.com passes through Cloudflare before it ever
 * reaches the VPS, so this counts actual traffic server-side, not
 * client-side JS that ad-blockers/privacy tools can suppress.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getSecret } from '@/lib/secrets';

interface DayGroup {
  dimensions: { date: string };
  sum: { requests: number; pageViews: number; bytes: number; threats: number };
  uniq: { uniques: number };
}

export async function GET(req: NextRequest) {
  try {
    const check = await verifyAdmin(req);
    if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

    const [token, zoneId] = await Promise.all([
      getSecret('CLOUDFLARE_API_TOKEN'),
      getSecret('CLOUDFLARE_ZONE_ID'),
    ]);
    if (!token || !zoneId) {
      return NextResponse.json({ error: 'Cloudflare Analytics not configured — add an API token and Zone ID in Admin → Integrations.' }, { status: 400 });
    }

    // "today" and "yesterday" are still resolved against the daily dataset
    // (Cloudflare's httpRequests1dGroups) rather than an hourly one — a
    // single-day chart only ever draws one bar, but the stat tiles above it
    // (unique visits, page views, etc.) still show accurate numbers for
    // that specific day, which is the part that actually matters most.
    const range = req.nextUrl.searchParams.get('range') || '30d';
    const until = new Date();
    let since: Date;
    let limit: number;
    switch (range) {
      case 'today':
        since = new Date(until);
        limit = 1;
        break;
      case 'yesterday':
        since = new Date(until.getTime() - 86_400_000);
        until.setTime(since.getTime());
        limit = 1;
        break;
      case '7d':
        since = new Date(until.getTime() - 7 * 86_400_000);
        limit = 8;
        break;
      case '14d':
        since = new Date(until.getTime() - 14 * 86_400_000);
        limit = 15;
        break;
      case 'all':
        // Cloudflare's Analytics API itself caps how far back it'll return
        // data (varies by plan, commonly far less than a year) — requesting
        // a wide window and letting Cloudflare hand back whatever it
        // actually retains is simpler and more correct than guessing the
        // account's specific retention limit here.
        since = new Date(until.getTime() - 365 * 86_400_000);
        limit = 366;
        break;
      case '30d':
      default:
        since = new Date(until.getTime() - 30 * 86_400_000);
        limit = 31;
        break;
    }
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const query = `
      query ($zoneTag: String!, $since: Date!, $until: Date!, $limit: Int!) {
        viewer {
          zones(filter: { zoneTag: $zoneTag }) {
            httpRequests1dGroups(
              limit: $limit
              filter: { date_geq: $since, date_leq: $until }
              orderBy: [date_ASC]
            ) {
              dimensions { date }
              sum { requests pageViews bytes threats }
              uniq { uniques }
            }
          }
        }
      }
    `;

    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { zoneTag: zoneId, since: fmt(since), until: fmt(until), limit },
      }),
    });

    const data = await res.json();
    if (!res.ok || data.errors) {
      const msg = data.errors?.[0]?.message || `Cloudflare responded ${res.status}`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const days: DayGroup[] = data.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];

    const totals = days.reduce(
      (acc, d) => ({
        requests: acc.requests + (d.sum?.requests ?? 0),
        pageViews: acc.pageViews + (d.sum?.pageViews ?? 0),
        uniques: acc.uniques + (d.uniq?.uniques ?? 0),
        threats: acc.threats + (d.sum?.threats ?? 0),
      }),
      { requests: 0, pageViews: 0, uniques: 0, threats: 0 },
    );

    return NextResponse.json({
      rangeDays: days.length,
      totals,
      daily: days.map((d) => ({
        date: d.dimensions.date,
        requests: d.sum?.requests ?? 0,
        pageViews: d.sum?.pageViews ?? 0,
        uniques: d.uniq?.uniques ?? 0,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
