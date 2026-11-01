'use client';

/**
 * Inside the native apps: opens the page a tapped notification points at, and
 * shows a toast for one that arrives while the app is in the foreground.
 * Renders nothing; a no-op on the web.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { nativePushListen } from '@/lib/native/push';

export function NativePushListener() {
  const router = useRouter();
  useEffect(() => nativePushListen(
    (url) => { try { router.push(new URL(url, window.location.origin).pathname + new URL(url, window.location.origin).search); } catch { router.push(url); } },
    (title, body) => toast(`${title}${body ? ' — ' + body : ''}`, { duration: 6000 }),
  ), [router]);
  return null;
}
