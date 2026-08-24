'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, MessageCircle, ChevronLeft } from 'lucide-react';
import Image from 'next/image';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeUserConversations, getUnreadNotificationCount, getSystemConfig } from '@/lib/firestore';

interface HeaderProps {
  title?: string;
  showActions?: boolean;
  rightElement?: React.ReactNode;
  showBack?: boolean;
}

// Cached in localStorage so every load after the first paints the real
// logo/name immediately instead of the fallback letter flashing for a
// beat while getSystemConfig() resolves — this header renders on nearly
// every in-app screen, so that flash was constant, not a one-off.
function readCachedBranding(): { logoUrl: string | null; appName: string } {
  if (typeof window === 'undefined') return { logoUrl: null, appName: 'Warfare Fitness' };
  try {
    const cached = window.localStorage.getItem('branding');
    if (cached) return JSON.parse(cached);
  } catch { /* ignore — fall through to defaults */ }
  return { logoUrl: null, appName: 'Warfare Fitness' };
}

export function Header({ title, showActions = true, rightElement, showBack = false }: HeaderProps) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [hasConversation, setHasConversation] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [{ logoUrl: cachedLogoUrl, appName: cachedAppName }] = useState(readCachedBranding);
  const [logoUrl, setLogoUrl] = useState<string | null>(cachedLogoUrl);
  const [appName, setAppName] = useState<string>(cachedAppName);

  useEffect(() => {
    // system/config is publicly readable (branding needs to render before
    // sign-in too), so no need to wait on auth here. It previously read
    // isAuthed()-gated and this effect fired before Firebase Auth finished
    // initializing, so the read got permission-denied and silently never
    // retried, leaving the logo/name stuck on their fallback forever.
    getSystemConfig().then(cfg => {
      const nextLogoUrl = (cfg?.logoUrl as string) || null;
      const nextAppName = (cfg?.appName as string) || 'Warfare Fitness';
      setLogoUrl(nextLogoUrl);
      setAppName(nextAppName);
      try {
        window.localStorage.setItem('branding', JSON.stringify({ logoUrl: nextLogoUrl, appName: nextAppName }));
      } catch { /* localStorage unavailable (private mode, quota) — not worth failing over */ }
    }).catch(() => {});
  }, []);

  // Live — the Messages icon itself must appear the moment staff sends a
  // first message, not just its unread badge, so this can't be the old
  // 30s-poll getUserConversations() (a member sitting on a screen when
  // staff messages them for the first time would otherwise not see the
  // icon appear until the next poll or a reload).
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeUserConversations(user.uid, (convs) => {
      setHasConversation(convs.length > 0);
      setUnreadMessages(convs.filter(c => c.unreadByUser).length);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = () => {
      getUnreadNotificationCount(user.uid)
        .then(count => { if (!cancelled) setUnreadNotifs(count); })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user]);

  return (
    <header
      // Transparent instead of an opaque --header-bg fill — lets
      // AppBackground's grid/orbs show through instead of the header
      // reading as a separate solid block sitting on top of it. Still
      // sticky + backdrop-blur, so scrolled content underneath stays
      // legible (frosted-glass, not a hard-edged bar) without a border
      // to draw a line between "header" and "background."
      className="sticky top-0 z-30 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between px-4 py-3 max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto">
        {title ? (
          <div className="flex items-center gap-1">
            {showBack && (
              <button
                onClick={() => router.back()}
                className="p-1.5 -ml-1.5 rounded-xl text-text-secondary hover:text-foreground transition-colors"
                aria-label="Back"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className="text-lg font-bold text-foreground">{title}</h1>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden ${logoUrl ? '' : 'bg-accent'}`}>
              {logoUrl ? (
                <Image src={logoUrl} alt="Logo" width={40} height={40} className="w-full h-full object-cover" onError={() => setLogoUrl(null)} />
              ) : (
                <span className="text-sm font-black" style={{ color: 'var(--btn-primary-text)' }}>W</span>
              )}
            </div>
            <span className="text-sm font-bold text-foreground whitespace-nowrap">{appName}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {rightElement}
          {showActions && (
            <>
              <Link
                href="/notifications"
                className="relative p-2 rounded-xl text-text-secondary transition-colors"
              >
                <Bell className="w-5 h-5" />
                {unreadNotifs > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-danger rounded-full flex items-center justify-center text-[10px] font-bold text-white leading-none">
                    {unreadNotifs > 9 ? '9+' : unreadNotifs}
                  </span>
                )}
              </Link>
              {hasConversation && (
                <Link
                  href="/messages"
                  className="relative p-2 rounded-xl text-text-secondary transition-colors"
                >
                  <MessageCircle className="w-5 h-5" />
                  {unreadMessages > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-danger rounded-full flex items-center justify-center text-[10px] font-bold text-white leading-none">
                      {unreadMessages > 9 ? '9+' : unreadMessages}
                    </span>
                  )}
                </Link>
              )}
              <Link href="/settings">
                <Avatar src={profile?.photoURL} name={profile?.displayName} size="sm" />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
