'use client';

import React from 'react';
import Link from 'next/link';
import { Bell, Settings } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/contexts/AuthContext';

interface HeaderProps {
  title?: string;
  showActions?: boolean;
  rightElement?: React.ReactNode;
}

export function Header({ title, showActions = true, rightElement }: HeaderProps) {
  const { profile } = useAuth();

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
              <button className="p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5 transition-colors">
                <Bell className="w-5 h-5" />
              </button>
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
