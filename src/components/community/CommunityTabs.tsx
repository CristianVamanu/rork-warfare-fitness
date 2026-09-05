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
    { key: 'channels', href: '/community', label: '# Channels' },
    { key: 'prs', href: '/community/prs', label: '🏅 PR Wall' },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-1 bg-surface rounded-xl p-1" role="tablist">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          role="tab"
          aria-selected={active === t.key}
          aria-current={active === t.key ? 'page' : undefined}
          className={`py-2 text-center text-xs sm:text-sm font-medium rounded-lg transition-all ${
            active === t.key ? 'bg-surface-elevated text-white' : 'text-text-secondary hover:text-white'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
