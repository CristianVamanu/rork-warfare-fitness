'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, MessageCircle, ChevronLeft } from 'lucide-react';
import Image from 'next/image';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useHeaderData } from '@/contexts/HeaderDataContext';

interface HeaderProps {
  title?: string;
  showActions?: boolean;
  rightElement?: React.ReactNode;
  showBack?: boolean;
}

export function Header({ title, showActions = true, rightElement, showBack = false }: HeaderProps) {
  const { profile } = useAuth();
  const router = useRouter();
  // Shared conversations/notifications/branding data lives in
  // HeaderDataProvider (mounted once in (app)/layout.tsx) instead of being
  // fetched here — Header itself is rendered per-page across ~19 screens,
  // so subscribing here used to tear down and re-open those listeners
  // (and re-fetch branding config) on every single tab navigation.
  const { hasConversation, unreadMessages, unreadNotifs, logoUrl, appName } = useHeaderData();

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
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden ${logoUrl && !logoErrored ? '' : 'bg-accent'}`}>
              {logoUrl && !logoErrored ? (
                <Image src={logoUrl} alt="Logo" width={40} height={40} className="w-full h-full object-cover" onError={() => setLogoErrored(true)} />
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
                  href={isAdmin ? '/admin?tab=messages' : '/messages'}
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
