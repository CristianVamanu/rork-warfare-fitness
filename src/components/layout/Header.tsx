'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, MessageCircle } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/contexts/AuthContext';
import { getUserConversations, getUnreadNotificationCount } from '@/lib/firestore';

interface HeaderProps {
  title?: string;
  showActions?: boolean;
  rightElement?: React.ReactNode;
}

export function Header({ title, showActions = true, rightElement }: HeaderProps) {
  const { user, profile } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = () => {
      getUserConversations(user.uid)
        .then(convs => { if (!cancelled) setUnreadMessages(convs.filter(c => c.unreadByUser).length); })
        .catch(() => {});
      getUnreadNotificationCount(user.uid)
        .then(count => { if (!cancelled) setUnreadNotifs(count); })
        .catch(() => {});
    };

    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user]);

  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-white/8">
      <div className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto">
        {title ? (
          <h1 className="text-lg font-bold text-white">{title}</h1>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <span className="text-xs font-black text-black">W</span>
            </div>
            <span className="text-sm font-bold text-white">Warfare</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {rightElement}
          {showActions && (
            <>
              {/* Notifications bell */}
              <Link
                href="/notifications"
                className="relative p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5 transition-colors"
              >
                <Bell className="w-5 h-5" />
                {unreadNotifs > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-danger rounded-full flex items-center justify-center text-[10px] font-bold text-white leading-none">
                    {unreadNotifs > 9 ? '9+' : unreadNotifs}
                  </span>
                )}
              </Link>
              {/* Messages — direct access to coach DMs */}
              <Link
                href="/messages"
                className="relative p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5 transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
                {unreadMessages > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-danger rounded-full flex items-center justify-center text-[10px] font-bold text-white leading-none">
                    {unreadMessages > 9 ? '9+' : unreadMessages}
                  </span>
                )}
              </Link>
              <Link href="/settings">
                <Avatar
                  src={profile?.photoURL}
                  name={profile?.displayName}
                  size="sm"
                />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
