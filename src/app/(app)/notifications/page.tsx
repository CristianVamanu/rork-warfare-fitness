'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bell, BellOff, CheckCheck, Zap, Dumbbell, Flame, Trophy, MessageSquare, Crown, XCircle, Trash2, BadgeCheck } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import {
  getUserNotifications, markNotificationRead, markAllNotificationsRead,
  deleteNotification, deleteAllReadNotifications,
} from '@/lib/firestore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { AppNotification } from '@/types';

const TYPE_ICON: Record<string, React.ElementType> = {
  manual: MessageSquare,
  auto_missed_workout: Dumbbell,
  auto_streak: Flame,
  auto_milestone: Trophy,
  ai_motivation: Zap,
  coaching_approved: Crown,
  coaching_rejected: XCircle,
  pr_approved: BadgeCheck,
  pr_rejected: XCircle,
  message: MessageSquare,
};

const TYPE_COLOR: Record<string, string> = {
  manual: 'text-blue-400 bg-blue-400/10',
  auto_missed_workout: 'text-yellow-400 bg-yellow-400/10',
  auto_streak: 'text-orange-400 bg-orange-400/10',
  auto_milestone: 'text-accent bg-accent-muted',
  ai_motivation: 'text-purple-400 bg-purple-400/10',
  coaching_approved: 'text-success bg-success/10',
  coaching_rejected: 'text-danger bg-danger/10',
  pr_approved: 'text-accent bg-accent-muted',
  pr_rejected: 'text-danger bg-danger/10',
  message: 'text-blue-400 bg-blue-400/10',
};

function timeAgo(ts: unknown): string {
  if (!ts) return '';
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [clearingRead, setClearingRead] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    if (!user) return;
    getUserNotifications(user.uid)
      .then(setNotifs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  async function handleMarkRead(n: AppNotification) {
    if (n.read) return;
    await markNotificationRead(n.id).catch(() => {});
    setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
  }

  async function handleMarkAllRead() {
    if (!user) return;
    setMarkingAll(true);
    await markAllNotificationsRead(user.uid).catch(() => {});
    setNotifs(prev => prev.map(x => ({ ...x, read: true })));
    setMarkingAll(false);
  }

  async function handleDelete(n: AppNotification, e: React.MouseEvent) {
    e.stopPropagation();
    setNotifs(prev => prev.filter(x => x.id !== n.id));
    await deleteNotification(n.id).catch(() => {});
  }

  async function handleClearRead() {
    if (!user) return;
    setClearingRead(true);
    await deleteAllReadNotifications(user.uid).catch(() => {});
    setNotifs(prev => prev.filter(n => !n.read));
    setClearingRead(false);
  }

  const unreadCount = notifs.filter(n => !n.read).length;
  const readCount = notifs.length - unreadCount;
  const visibleNotifs = filter === 'unread' ? notifs.filter(n => !n.read) : notifs;

  return (
    <div>
      <Header title="Notifications" />
      <div className="px-4 py-4 space-y-4">
        {/* Filter + actions bar */}
        {notifs.length > 0 && (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1.5">
              {([
                { key: 'all' as const, label: `All (${notifs.length})` },
                { key: 'unread' as const, label: `Unread (${unreadCount})` },
              ]).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                    filter === f.key ? 'bg-accent text-black' : 'bg-surface text-text-secondary'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {readCount > 0 && (
                <Button size="sm" variant="ghost" onClick={handleClearRead} loading={clearingRead}>
                  <Trash2 className="w-3.5 h-3.5" /> Clear read
                </Button>
              )}
              {unreadCount > 0 && (
                <Button size="sm" variant="ghost" onClick={handleMarkAllRead} loading={markingAll}>
                  <CheckCheck className="w-4 h-4" /> Mark all read
                </Button>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          </div>
        ) : notifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <BellOff className="w-12 h-12 text-text-tertiary mb-4" />
            <p className="text-white font-bold">No notifications yet</p>
            <p className="text-text-secondary text-sm mt-1">Updates will appear here.</p>
          </div>
        ) : visibleNotifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <CheckCheck className="w-12 h-12 text-text-tertiary mb-4" />
            <p className="text-white font-bold">All caught up</p>
            <p className="text-text-secondary text-sm mt-1">No unread notifications.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleNotifs.map((n, i) => {
              const Icon = TYPE_ICON[n.type] ?? Bell;
              const colorClass = TYPE_COLOR[n.type] ?? 'text-text-secondary bg-surface-elevated';
              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Card
                    className={`p-4 cursor-pointer transition-colors hover:bg-white/5 ${!n.read ? 'border-accent/30' : 'opacity-70'}`}
                    onClick={() => handleMarkRead(n)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-white flex-1">{n.title}</p>
                          {!n.read && <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />}
                          <button
                            onClick={(e) => handleDelete(n, e)}
                            className="p-1 -m-1 text-text-tertiary hover:text-danger transition-colors flex-shrink-0"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-sm text-text-secondary mt-0.5 leading-relaxed">{n.body}</p>
                        <p className="text-xs text-text-tertiary mt-1">{timeAgo(n.createdAt)}</p>
                        {n.actionUrl && n.actionLabel && (
                          <Link href={n.actionUrl} onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" className="mt-2">{n.actionLabel}</Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
