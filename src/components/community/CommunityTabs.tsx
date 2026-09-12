'use client';

import Link from 'next/link';

/**
 * The two halves of Community, as one segmented control.
 *
 * Channels and the PR Wall are separate routes, and for a while the PR Wall
 * was only reachable from a link card sitting above the channel list — which
 * gave no sense that these are two peers, or that a second place existed at
 * all. This is the same switcher the page already had when it was Channels vs
 * Leaderboard, so it reads as one section with two views rather than a page
 * with a stray shortcut on it.
 *
 * Links rather than local state, because each half owns its own route, data
 * and paywall gate — the PR Wall's upload form, moderation state and feed
 * subscription have no business mounting when someone is reading channels.
 */
export function CommunityTabs({ active }: { active: 'channels' | 'prs' }) {
  const tabs = [
    { key: 'channels', href: '/community', label: 'Channels' },
    { key: 'prs', href: '/community/prs', label: 'PR wall' },
  ] as const;

  return (
    <div className="flex gap-2" role="tablist">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          role="tab"
          aria-selected={active === t.key}
          aria-current={active === t.key ? 'page' : undefined}
          className={`h-9 px-4 rounded-full text-xs sm:text-sm font-semibold transition-all flex items-center ${
            active === t.key ? 'bg-accent text-black shadow-glow-sm' : 'text-text-secondary hover:text-white backdrop-blur-xl'
          }`}
          style={active === t.key ? undefined : { backgroundColor: 'var(--card-glass-bg)', border: '1px solid var(--card-glass-border)' }}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
