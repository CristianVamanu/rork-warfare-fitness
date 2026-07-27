import { NextResponse } from 'next/server';

// Self-serve "Build Your Own Program" was removed — too many uncontrolled
// variables (AI output quality/safety review, equipment/injury edge cases)
// to leave unsupervised for regular users. The UI entry points are gone;
// this keeps the endpoint itself from doing anything if it's still called
// directly (an old bookmark, a replayed network request, etc). Programs
// users already built remain enrollable as-is — nothing here touches them.
export async function POST() {
  return NextResponse.json(
    { error: 'Building your own program is no longer available. Pick one of our existing programs instead.' },
    { status: 410 },
  );
}
