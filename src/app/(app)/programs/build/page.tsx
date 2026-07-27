'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Self-serve "Build Your Own Program" was removed — too many variables
// (AI output quality, missing safety review, edge cases in equipment/
// injury handling) to leave unsupervised for regular users. Existing
// programs users already built are untouched (still enrollable from the
// "My Built Programs" section on /training) — this only removes the
// ability to create new ones. Redirects instead of a hard 404 in case the
// old URL is still bookmarked or linked anywhere.
export default function BuildProgramRemovedPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/training');
  }, [router]);
  return null;
}
