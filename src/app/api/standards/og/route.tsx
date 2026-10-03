import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { standardBySlug } from '@/lib/ptStandards';
import { judge, summarise, decodeAnswers, verdictHeadline } from '@/lib/standardsShare';

/**
 * The picture that appears when somebody posts their result.
 *
 * This is the whole point of the share link. A man who has just found out he
 * clears the Marine PFT posts a URL; what his friends see in the feed is this
 * card, with the unit, the verdict and the numbers. Text alone scrolls past.
 *
 * A ROUTE, not the `opengraph-image` file convention, for one blunt reason:
 * that convention is handed the route's params and nothing else, so the
 * scores — which live in the query string — never reach it, and every card
 * came out reading "Could you pass USMC PFT?" with no numbers on it. A route
 * handler gets the full URL, and the result page points its metadata here.
 *
 * Built from the same judging the page uses, so the image can never claim a
 * pass the page does not show.
 */

export const runtime = 'nodejs';

const EMBER = '#F5A623';
const GREEN = '#10B981';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const standard = standardBySlug(q.get('unit') ?? '');

  const answers = decodeAnswers((k) => q.get(k));
  const verdicts = standard ? judge(standard, answers) : [];
  const { passedAll, answered } = summarise(verdicts);
  const headline = standard ? verdictHeadline(standard, verdicts) : 'Could you pass selection?';
  const accent = passedAll ? GREEN : EMBER;
  // Only events the person actually attempted belong on a shared card.
  const rows = verdicts.filter((v) => v.yours !== '—').slice(0, 4);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', backgroundColor: '#0A0A0B', padding: 64,
          // The grid, drawn as two repeating gradients — the app's own surface.
          backgroundImage:
            'linear-gradient(rgba(245,166,35,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(245,166,35,0.07) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: accent, display: 'flex' }} />
            <div style={{ fontSize: 22, fontWeight: 700, color: '#8A8A8A', letterSpacing: 4, textTransform: 'uppercase', display: 'flex' }}>
              {standard ? standard.resultTitle : 'Warfare Fitness'}
            </div>
          </div>
          <div style={{ fontSize: answered === 0 ? 76 : 66, fontWeight: 900, color: '#FFFFFF', lineHeight: 1.1, marginTop: 26, maxWidth: 1020, display: 'flex' }}>
            {headline}
          </div>
        </div>

        {rows.length > 0 && (
          <div style={{ display: 'flex', gap: 18 }}>
            {rows.map((v) => (
              <div
                key={v.key}
                style={{
                  display: 'flex', flexDirection: 'column', flex: 1, padding: '20px 24px',
                  borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.04)',
                  border: `2px solid ${v.passed ? 'rgba(16,185,129,0.45)' : 'rgba(245,166,35,0.45)'}`,
                }}
              >
                <div style={{ fontSize: 19, color: '#8A8A8A', fontWeight: 600, display: 'flex' }}>{v.label}</div>
                <div style={{ fontSize: 42, fontWeight: 900, color: v.passed ? GREEN : EMBER, marginTop: 6, display: 'flex' }}>{v.yours}</div>
                <div style={{ fontSize: 18, color: '#6B6B6B', marginTop: 2, display: 'flex' }}>needs {v.target}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#FFFFFF', display: 'flex' }}>warfarefitness.com</div>
          <div style={{ fontSize: 22, color: accent, fontWeight: 700, display: 'flex' }}>Take the test free</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // Shared links are hit repeatedly by every platform's crawler; the
        // card for a given set of scores never changes.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    },
  );
}
