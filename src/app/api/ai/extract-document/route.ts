import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/verifyAdmin';

export const runtime = 'nodejs';

// Capped well under the plan/phase calls' own prompt budget — this text
// gets embedded in every one of those calls (plan + one per phase), so an
// uncapped multi-hundred-page PDF would multiply straight into the token
// ceiling that the whole plan/phase split was built to avoid in the first
// place. 12k characters is roughly enough for a real multi-week program's
// structure and example workouts without dominating the prompt.
const MAX_CHARS = 12_000;

export async function POST(req: NextRequest) {
  const authCheck = await verifyAdmin(req);
  if ('error' in authCheck) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    let text: string;

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      // Dynamic import: pdf-parse pulls in a fair chunk of code that's only
      // needed on this one route — no reason to load it into every other
      // route's cold start. pdf-parse is marked as a serverComponentsExternalPackage
      // in next.config.js so it's a genuine `require('pdf-parse')` from
      // node_modules at runtime, not bundled into this chunk — that's what
      // lets it correctly locate its own worker script relative to its real
      // on-disk location. (An earlier attempt to also resolve that path
      // manually here via require.resolve() backfired: called from inside
      // this bundled route file, require.resolve() gets intercepted by
      // webpack's own resolver and returns its internal numeric module ID
      // instead of a real path — "path must be of type string, received
      // type number" was that module ID, not a bug in pdf-parse itself.)
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buf });
      const parsed = await parser.getText();
      text = parsed.text;
    } else if (file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt')) {
      text = buf.toString('utf-8');
    } else {
      return NextResponse.json({ error: 'Only PDF and plain text files are supported' }, { status: 400 });
    }

    text = text.replace(/\s+/g, ' ').trim();
    if (!text) return NextResponse.json({ error: "Couldn't find any readable text in that file — is it a scanned image PDF?" }, { status: 422 });

    const truncated = text.length > MAX_CHARS;
    return NextResponse.json({
      text: text.slice(0, MAX_CHARS),
      truncated,
      totalChars: text.length,
    });
  } catch (err) {
    console.error('[extract-document]', err);
    // This route is admin-gated (verifyAdmin above), so surfacing the
    // underlying reason is a debugging aid, not a leak — a generic 500 for
    // every failure mode (password-protected PDF, corrupted file, a real
    // server error) made it impossible for an admin to tell "your file is
    // encrypted" from "something's actually broken" without checking logs.
    const name = err instanceof Error ? err.constructor.name : '';
    const message = err instanceof Error ? err.message : String(err);
    const friendly = /password/i.test(name) || /password/i.test(message)
      ? 'This PDF is password-protected — remove the password and try again.'
      : `Failed to read that file${message ? ` (${message})` : ''}`;
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}
