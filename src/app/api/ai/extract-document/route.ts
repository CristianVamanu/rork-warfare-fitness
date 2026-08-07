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
      // route's cold start.
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
    return NextResponse.json({ error: 'Failed to read that file' }, { status: 500 });
  }
}
