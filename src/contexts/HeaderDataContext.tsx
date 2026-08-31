'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeUserConversations, subscribeAdminConversations, getUnreadNotificationCount, getSystemConfig } from '@/lib/firestore';

interface HeaderData {
  hasConversation: boolean;
  unreadMessages: number;
  unreadNotifs: number;
  logoUrl: string | null;
  appName: string;
}

const defaultData: HeaderData = { hasConversation: false, unreadMessages: 0, unreadNotifs: 0, logoUrl: null, appName: 'Warfare Fitness' };

const HeaderDataCtx = createContext<HeaderData>(defaultData);

export function useHeaderData() {
  return useContext(HeaderDataCtx);
}

// Cached in localStorage so every load after the first paints the real
// logo/name immediately instead of the fallback letter flashing for a
// beat while getSystemConfig() resolves.
function readCachedBranding(): { logoUrl: string | null; appName: string } {
  if (typeof window === 'undefined') return { logoUrl: null, appName: 'Warfare Fitness' };
  try {
    const cached = window.localStorage.getItem('branding');
    if (cached) return JSON.parse(cached);
  } catch { /* ignore — fall through to defaults */ }
  return { logoUrl: null, appName: 'Warfare Fitness' };
}

// Header used to run these subscriptions itself, which meant every tab
// navigation (Header is rendered directly in ~19 page files, not once in
// a shared layout) tore down and re-opened the conversations/notifications
// listeners and re-fetched branding config. Hoisting the actual data
// fetching up to this provider — mounted once in (app)/layout.tsx — means
// the listeners live for the whole authenticated session instead of being
// restarted on every click, while Header itself stays a per-page component
// with unchanged props/behavior (title, back button, etc. are still its
// own local concerns, only the shared data moved).
export function HeaderDataProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const [hasConversation, setHasConversation] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [{ logoUrl: cachedLogoUrl, appName: cachedAppName }] = useState(readCachedBranding);
  const [logoUrl, setLogoUrl] = useState<string | null>(cachedLogoUrl);
  const [appName, setAppName] = useState<string>(cachedAppName);

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
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

  useEffect(() => {
    if (!user) { setHasConversation(false); setUnreadMessages(0); return; }
    if (isAdmin) {
      const unsub = subscribeAdminConversations(user.uid, (convs) => {
        setHasConversation(true);
        setUnreadMessages(convs.filter(c => c.unreadByAdmin).length);
      });
      return unsub;
    }
    const unsub = subscribeUserConversations(user.uid, (convs) => {
      setHasConversation(convs.length > 0);
      setUnreadMessages(convs.filter(c => c.unreadByUser).length);
    });
    return unsub;
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user) { setUnreadNotifs(0); return; }
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
    <HeaderDataCtx.Provider value={{ hasConversation, unreadMessages, unreadNotifs, logoUrl, appName }}>
      {children}
    </HeaderDataCtx.Provider>
  );
}
