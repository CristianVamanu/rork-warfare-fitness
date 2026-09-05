'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  subscribeUserConversations,
  subscribeAdminConversations,
  subscribeUserSupportTickets,
  subscribeAllSupportTickets,
  subscribeUnreadNotificationCount,
  getSystemConfig,
} from '@/lib/firestore';

interface HeaderData {
  hasConversation: boolean;
  unreadMessages: number;
  unreadNotifs: number;
  // Support is surfaced as its own header entry rather than being folded into
  // unreadMessages, because the two go to different places: a coach DM opens
  // /messages, a support thread opens /support (and, for staff, the admin
  // Support tab). Merging the counts would have made one badge that couldn't
  // say where to click.
  hasSupportTicket: boolean;
  unreadSupport: number;
  logoUrl: string | null;
  appName: string;
}

const defaultData: HeaderData = {
  hasConversation: false,
  unreadMessages: 0,
  unreadNotifs: 0,
  hasSupportTicket: false,
  unreadSupport: 0,
  logoUrl: null,
  appName: 'Warfare Fitness',
};

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
  const [hasSupportTicket, setHasSupportTicket] = useState(false);
  const [unreadSupport, setUnreadSupport] = useState(0);
  const [{ logoUrl: cachedLogoUrl, appName: cachedAppName }] = useState(readCachedBranding);
  const [logoUrl, setLogoUrl] = useState<string | null>(cachedLogoUrl);
  const [appName, setAppName] = useState<string>(cachedAppName);

  const isAdmin = profile?.role === 'admin';
  // /verify-2fa and /banned both render inside this same (app) layout, and
  // neither one used to mount Header (so these subscriptions never fired
  // there before Header's data-fetching moved into this shared provider).
  // A just-signed-in account's token genuinely still carries tfaPending:
  // true until the code is verified — firestore.rules' notTfaPending()
  // correctly rejects these reads for as long as that's the case — and a
  // just-banned account's token can stay valid for a moment until it's
  // revoked/refreshed. Gate on both explicitly rather than relying on
  // which page happens to mount this provider.
  const blockedFromReads = !!profile?.twoFactorPendingSince || !!profile?.banned;

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
    if (!user || blockedFromReads) { setHasConversation(false); setUnreadMessages(0); return; }
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
  }, [user, isAdmin, blockedFromReads]);

  // Support tickets. An admin watches every ticket in the system (that's the
  // "a user submitted a support request" signal in the header); a member
  // watches only their own, which is what makes the icon appear the moment
  // they submit their first one.
  useEffect(() => {
    if (!user || blockedFromReads) { setHasSupportTicket(false); setUnreadSupport(0); return; }
    if (isAdmin) {
      return subscribeAllSupportTickets((tickets) => {
        setHasSupportTicket(true);
        setUnreadSupport(tickets.filter(t => t.unreadByAdmin && t.status !== 'resolved').length);
      });
    }
    return subscribeUserSupportTickets(user.uid, (tickets) => {
      setHasSupportTicket(tickets.length > 0);
      setUnreadSupport(tickets.filter(t => t.unreadByUser).length);
    });
  }, [user, isAdmin, blockedFromReads]);

  // A listener, not a 30-second poll. The poll re-read Firestore twice a
  // minute from every open tab regardless of whether anything had changed;
  // this costs the unread documents once and then only deltas, and the badge
  // updates the instant a notification lands rather than up to 30s later.
  useEffect(() => {
    if (!user || blockedFromReads) { setUnreadNotifs(0); return; }
    return subscribeUnreadNotificationCount(user.uid, setUnreadNotifs);
  }, [user, blockedFromReads]);

  return (
    <HeaderDataCtx.Provider value={{ hasConversation, unreadMessages, unreadNotifs, hasSupportTicket, unreadSupport, logoUrl, appName }}>
      {children}
    </HeaderDataCtx.Provider>
  );
}
