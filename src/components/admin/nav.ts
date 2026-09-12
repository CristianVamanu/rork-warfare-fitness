import {
  Activity, Dumbbell, Users, MessageSquare, LifeBuoy, Bell, CreditCard,
  UserCheck, Video, TrendingUp, Key, Mail, Settings, RotateCcw,
} from 'lucide-react';
import type { AdminTabGroup } from './AdminShell';

/**
 * The admin rail, in one place.
 *
 * The dashboard's tabs are page state, but Programs and the program builder
 * are their own routes — and they used to render with no rail at all, so
 * opening a program dropped you out of the admin frame entirely and left you
 * with a back arrow as the only way home. They render the same nav now, which
 * means the list of tabs cannot live inside the dashboard component any more.
 *
 * Selecting a tab from one of those routes navigates to /admin?tab=<id>, which
 * the dashboard already reads on mount.
 */
export type AdminTabId =
  | 'overview' | 'programs' | 'clients' | 'messages' | 'support' | 'community'
  | 'notifications' | 'membership' | 'coaching' | 'library' | 'analytics'
  | 'integrations' | 'leads' | 'settings' | 'restore';

export const ADMIN_TABS: { id: AdminTabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'programs', label: 'Programs', icon: Dumbbell },
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'support', label: 'Support', icon: LifeBuoy },
  { id: 'community', label: 'Community', icon: Users },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'membership', label: 'Membership', icon: CreditCard },
  { id: 'coaching', label: 'Coaching Apps', icon: UserCheck },
  { id: 'library', label: 'Library', icon: Video },
  { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  { id: 'integrations', label: 'Integrations', icon: Key },
  { id: 'leads', label: 'Leads', icon: Mail },
  { id: 'settings', label: 'Settings', icon: Settings },
  // Last in the list, but a tab of its own: disaster recovery buried at the
  // bottom of a settings page is not findable by someone who needs it now.
  { id: 'restore', label: 'Restore', icon: RotateCcw },
];

export const ADMIN_TAB_BY_ID = Object.fromEntries(
  ADMIN_TABS.map((t) => [t.id, t]),
) as Record<AdminTabId, typeof ADMIN_TABS[number]>;

/** Grouped by what the admin is doing. Order within a group is unchanged. */
export const ADMIN_GROUP_IDS: { label: string; ids: AdminTabId[] }[] = [
  { label: 'Operate', ids: ['overview', 'clients', 'messages', 'support', 'community', 'notifications'] },
  { label: 'Product', ids: ['programs', 'library', 'membership', 'coaching'] },
  { label: 'Growth', ids: ['analytics', 'leads'] },
  { label: 'System', ids: ['integrations', 'settings', 'restore'] },
];

/** `badges` decorates individual tabs, e.g. the unresolved support count. */
export function adminGroups(badges: Partial<Record<AdminTabId, number>> = {}): AdminTabGroup<AdminTabId>[] {
  return ADMIN_GROUP_IDS.map((g) => ({
    label: g.label,
    tabs: g.ids.map((id) => ({ ...ADMIN_TAB_BY_ID[id], badge: badges[id] })),
  }));
}
