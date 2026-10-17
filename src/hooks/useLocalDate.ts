'use client';

import { useEffect, useState } from 'react';

/**
 * Today's date as 'YYYY-MM-DD' in the viewer's own timezone — and, unlike a
 * bare `new Date().toLocaleDateString('sv-SE')` inside render, it changes
 * when the calendar day does.
 *
 * Every "is it a rest day / did I train today" decision in the app is
 * derived from the local date at RENDER time. A PWA left resident overnight
 * (which is exactly how people use it: open it once, leave it on the home
 * screen) never re-rendered on its own, so the training card kept showing
 * yesterday's rest day well into the next afternoon. The date logic was
 * right; nothing ever asked it again. The same pattern already lived in
 * DailyTip for the same reason — this is that fix, shared.
 *
 * Re-checks on visibility/focus (the moment the app is brought back) and
 * once a minute while it is in the foreground, so the flip happens at
 * midnight itself if it is on screen.
 */
export function useLocalDate(): string {
  const [day, setDay] = useState(() => new Date().toLocaleDateString('sv-SE'));
  useEffect(() => {
    const check = () => {
      const now = new Date().toLocaleDateString('sv-SE');
      setDay((d) => (d === now ? d : now));
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    const t = setInterval(check, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      clearInterval(t);
    };
  }, []);
  return day;
}
