'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, MessageCircle, LifeBuoy, ChevronLeft, Settings } from 'lucide-react';
import Image from 'next/image';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useHeaderData } from '@/contexts/HeaderDataContext';

interface HeaderProps {
  title?: string;
  showActions?: boolean;
  rightElement?: React.ReactNode;
  showBack?: boolean;
  /** Home: transparent, sits over the hero art; round icon buttons and a settings cog. */
  overlay?: boolean;
}

export function Header({ title, showActions = true, rightElement, showBack = false, overlay = false }: HeaderProps) {
  const { profile } = useAuth();
  const router = useRouter();
  // Shared conversations/notifications/branding data lives in
  // HeaderDataProvider (mounted once in (app)/layout.tsx) instead of being
  // fetched here — Header itself is rendered per-page across ~19 screens,
  // so subscribing here used to tear down and re-open those listeners
  // (and re-fetch branding config) on every single tab navigation.
  const { hasConversation, unreadMessages, unreadNotifs, hasSupportTicket, unreadSupport, logoUrl, appName, openChat } = useHeaderData();

  const isAdmin = profile?.role === 'admin';

  const [logoErrored, setLogoErrored] = React.useState(false);
  React.useEffect(() => { setLogoErrored(false); }, [logoUrl]);

  return (
    <header
      // Transparent instead of an opaque --header-bg fill — lets
      // AppBackground's grid/orbs show through instead of the header
      // reading as a separate solid block sitting on top of it. Still
      // sticky + backdrop-blur, so scrolled content underneath stays
      // legible (frosted-glass, not a hard-edged bar) without a border
      // to draw a line between "header" and "background."
      className={overlay ? 'absolute inset-x-0 top-0 z-30' : 'sticky top-0 z-30 backdrop-blur-xl'}
    >
      <div className={`flex items-center justify-between px-4 ${overlay ? 'pt-3 pb-3 pl-5' : 'py-3'} max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto`}>
        {title ? (
          <div className="flex items-center gap-1">
            {showBack && (
              <button
                onClick={() => router.back()}
                className="wf-icon-tile -ml-1 mr-1"
                aria-label="Back"
              >
                <ChevronLeft className="w-[19px] h-[19px]" strokeWidth={1.75} />
              </button>
            )}
            <h1 className="text-lg font-bold text-foreground">{title}</h1>
          </div>
        ) : (
          <div className="flex items-center">
            {/* The Warfare Fitness wordmark (W mark + name), transparent PNG/WebP. */}
            <Image src="/brand/logo-wf.webp" alt={appName || 'Warfare Fitness'} width={740} height={125} priority
              className={overlay ? 'h-[25px] w-auto' : 'h-[28px] w-auto'} />
          </div>
        )}

        <div className={`flex items-center ${overlay ? 'gap-[10px] [&_.wf-icon-tile]:!w-[35px] [&_.wf-icon-tile]:!h-[35px] [&_.wf-icon-tile]:!rounded-full [&_.wf-icon-tile]:!bg-black/45 [&_.wf-icon-tile]:!border-white/20 [&_.wf-icon-tile]:!text-white' : 'gap-2'}`}>
          {rightElement}
          {showActions && (
            <>
              <Link
                href="/notifications"
                aria-label={unreadNotifs > 0 ? `Notifications, ${unreadNotifs} unread` : 'Notifications'}
                className="wf-icon-tile"
              >
                <Bell className="w-[19px] h-[19px]" strokeWidth={1.75} />
                {unreadNotifs > 0 && (
                  <span className="wf-icon-badge tabular-nums">
                    {unreadNotifs > 9 ? '9+' : unreadNotifs}
                  </span>
                )}
              </Link>
              {/* Opens the chat panel over the current screen — no navigation,
                  for staff or members. The full pages still exist for deep
                  links and for the drawer's own "Full inbox" link. */}
              {hasConversation && (
                <button
                  type="button"
                  onClick={openChat}
                  aria-label={unreadMessages > 0 ? `Messages, ${unreadMessages} unread` : 'Messages'}
                  className="wf-icon-tile"
                >
                  <MessageCircle className="w-[19px] h-[19px]" strokeWidth={1.75} />
                  {unreadMessages > 0 && (
                    <span className="wf-icon-badge tabular-nums">
                      {unreadMessages > 9 ? '9+' : unreadMessages}
                    </span>
                  )}
                </button>
              )}
              {/* Appears for a member the moment they open their first
                  support request, and permanently for staff (who always have
                  an inbox to check). Separate from the message icon above so
                  each one goes somewhere unambiguous. */}
              {hasSupportTicket && !overlay && (
                <Link
                  href={isAdmin ? '/admin?tab=support' : '/support'}
                  aria-label={unreadSupport > 0 ? `Support, ${unreadSupport} unread` : 'Support'}
                  className="wf-icon-tile"
                >
                  <LifeBuoy className="w-[19px] h-[19px]" strokeWidth={1.75} />
                  {unreadSupport > 0 && (
                    <span className="wf-icon-badge tabular-nums">
                      {unreadSupport > 9 ? '9+' : unreadSupport}
                    </span>
                  )}
                </Link>
              )}
              {/* The avatar keeps its photo but sits in the same tile as the
                  rest of the row, so the four actions read as one set. */}
              {overlay ? (
                <Link href="/settings" aria-label="Settings" className="wf-icon-tile">
                  <Settings className="w-[18px] h-[18px]" strokeWidth={1.75} />
                </Link>
              ) : (
                <Link
                  href="/settings"
                  aria-label="Settings"
                  className="wf-icon-tile overflow-hidden p-[3px]"
                >
                  <Avatar src={profile?.photoURL} name={profile?.displayName} size="sm" />
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
