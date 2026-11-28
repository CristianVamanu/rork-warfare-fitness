'use client';

import Link from 'next/link';
import { Bell, MessageCircle, LifeBuoy, Settings, Play, ChevronRight, Flame, CalendarCheck, CalendarDays, Trophy, Beef, Utensils, Droplet, Snowflake, Sparkles, Footprints, Plus, Minus } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useHeaderData } from '@/contexts/HeaderDataContext';

/**
 * Home on a desktop screen (1024px and wider): greeting and actions, a wide
 * hero, the week and the coach side by side, today's numbers, the three
 * shortcuts and the quick log. Same data as the phone layout in HomeCommand,
 * which renders this and passes everything in. Hidden below 1024px by CSS.
 */
export interface HomeDesktopProps {
  name: string; kcal: number; kcalGoal: number; protein: number; proteinGoal: number; waterMl: number; waterGoalMl: number;
  workouts: number; streak: number; startHref: string; sessionsThisWeek: number; daysPerWeek: number; steps: number | null;
  headline: string; sub: string; coachLine: string; challenge: { id: string; title: string } | null;
  onAddWater: () => void; onRemoveWater: () => void; waterBusy: boolean;
  onAddProtein?: () => void; onRemoveProtein?: () => void; proteinBusy?: boolean;
}

const pct = (v: number, of: number) => (of > 0 ? Math.max(0, Math.min(100, (v / of) * 100)) : 0);

function Bar({ value }: { value: number }) {
  return <span className="hd-bar" aria-hidden><i style={{ width: `${value}%` }} /></span>;
}

export function HomeDesktop(p: HomeDesktopProps) {
  const { profile } = useAuth();
  const { hasConversation, unreadMessages, unreadNotifs, hasSupportTicket, unreadSupport, openChat } = useHeaderData();
  const isAdmin = profile?.role === 'admin';
  const badge = (n: number) => (n > 0 ? <span className="wf-icon-badge tabular-nums">{n > 9 ? '9+' : n}</span> : null);
  const litres = (p.waterMl / 1000).toFixed(p.waterMl % 1000 ? 1 : 0);

  return (
    <div className="hd wf-only-desktop">
      <div className="hd-top">
        <div>
          <h1>Hello {p.name} <span aria-hidden>👑</span></h1>
          <p>Discipline builds freedom.</p>
          <i aria-hidden />
        </div>
        <div className="hd-actions">
          <Link href="/notifications" aria-label={unreadNotifs > 0 ? `Notifications, ${unreadNotifs} unread` : 'Notifications'}><Bell strokeWidth={1.75} />{badge(unreadNotifs)}</Link>
          {hasConversation && <button type="button" onClick={openChat} aria-label={unreadMessages > 0 ? `Messages, ${unreadMessages} unread` : 'Messages'}><MessageCircle strokeWidth={1.75} />{badge(unreadMessages)}</button>}
          {hasSupportTicket && <Link href={isAdmin ? '/admin?tab=support' : '/support'} aria-label={unreadSupport > 0 ? `Support, ${unreadSupport} unread` : 'Support'}><LifeBuoy strokeWidth={1.75} />{badge(unreadSupport)}</Link>}
          <Link href="/settings" aria-label="Settings"><Settings strokeWidth={1.75} /></Link>
          <Link href="/profile" aria-label="Profile" className="hd-avatar"><Avatar src={profile?.photoURL} name={profile?.displayName} size="sm" /></Link>
        </div>
      </div>

      <section className="hd-hero wf-dark">
        <h2>Let&apos;s <span>get stronger.</span></h2>
        <p>Train today. Build a better you.</p>
        <Link href={p.startHref} className="hd-cta"><Play aria-hidden /> Start workout <ChevronRight aria-hidden strokeWidth={2.6} /></Link>
      </section>

      <div className="hd-row2">
        <section className="hd-card hd-week" data-tour="week">
          <div className="hd-flame" data-on={p.streak > 0 ? '1' : '0'}>
            <b>{p.streak}</b><small>{p.streak === 1 ? 'day' : 'days'}</small>
          </div>
          <div className="hd-week-body">
            <Link href="/training" className="hd-pill"><CalendarDays aria-hidden /> View plan <ChevronRight aria-hidden strokeWidth={2.4} /></Link>
            <h3>{p.headline}</h3>
            <p>{p.sub}</p>
            <Bar value={pct(p.sessionsThisWeek, p.daysPerWeek)} />
          </div>
        </section>
        <section className="hd-card hd-coach">
          <span className="hd-eyebrow"><Sparkles aria-hidden /> AI Coach</span>
          <h3>Your next move.</h3>
          <p>{p.coachLine}</p>
          <a href="#weekly-report" className="hd-pill">Weekly report <ChevronRight aria-hidden strokeWidth={2.4} /></a>
        </section>
      </div>

      <div className="hd-stats" data-tour="today">
        <Link href="/nutrition" className="hd-card hd-stat">
          <span className="hd-eyebrow"><Flame aria-hidden /> Calories</span>
          <b>{p.kcal.toLocaleString()}</b><small>/{p.kcalGoal.toLocaleString()} kcal</small>
          <Bar value={pct(p.kcal, p.kcalGoal)} />
        </Link>
        {p.steps != null ? (
          <div className="hd-card hd-stat">
            <span className="hd-eyebrow"><Footprints aria-hidden /> Steps</span>
            <b>{p.steps.toLocaleString()}</b><small>/10,000 today</small>
            <Bar value={pct(p.steps, 10000)} />
          </div>
        ) : (
          <Link href="/training" className="hd-card hd-stat">
            <span className="hd-eyebrow"><CalendarCheck aria-hidden /> This week</span>
            <b>{p.sessionsThisWeek} / {p.daysPerWeek || '–'}</b><small>sessions</small>
            <Bar value={pct(p.sessionsThisWeek, p.daysPerWeek)} />
          </Link>
        )}
        <Link href="/progress" className="hd-card hd-stat">
          <span className="hd-eyebrow"><Trophy aria-hidden /> Workouts</span>
          <b>{p.workouts}</b><small>total</small>
        </Link>
        <Link href="/nutrition" className="hd-card hd-stat">
          <span className="hd-eyebrow"><Beef aria-hidden style={{ color: '#F87171' }} /> Protein</span>
          <b>{p.protein}</b><small>{p.proteinGoal ? `/${p.proteinGoal} g` : 'g'}</small>
          <Bar value={pct(p.protein, p.proteinGoal)} />
        </Link>
      </div>

      <div className="hd-tiles" data-tour="tiles">
        {[
          { href: '/nutrition', img: '/home/nutrition.webp', Icon: Utensils, title: 'Nutrition', sub: 'Fuel your goals', color: undefined },
          { href: '/nutrition#water', img: '/home/hydration.webp', Icon: Droplet, title: 'Hydration', sub: 'Stay optimal', color: '#3B9BFF' },
          { href: '/breathing', img: '/home/recovery.webp', Icon: Snowflake, title: 'Recovery', sub: 'Recharge stronger', color: undefined },
        ].map((t) => (
          <Link key={t.title} href={t.href} className="hd-card hd-tile">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.img} alt="" aria-hidden />
            <span className="hd-tile-ic"><t.Icon aria-hidden style={t.color ? { color: t.color } : undefined} /></span>
            <b>{t.title}</b><small>{t.sub}</small>
            <span className="hd-go" aria-hidden><ChevronRight strokeWidth={2.4} /></span>
          </Link>
        ))}
      </div>

      <div className="hd-quick" data-tour="quick">
        <Link href={p.challenge ? `/community/challenges/${p.challenge.id}` : '/community/challenges'} className="hd-card hd-stat">
          <span className="hd-eyebrow"><Trophy aria-hidden /> Today&apos;s challenge</span>
          <b className="hd-title">{p.challenge?.title ?? 'Pick a challenge'}</b>
          <small>{p.challenge ? 'Live now' : 'Browse challenges'}</small>
          <span className="hd-go" aria-hidden><ChevronRight strokeWidth={2.4} /></span>
        </Link>
        <div className="hd-card hd-stat">
          <span className="hd-eyebrow"><Beef aria-hidden style={{ color: '#F87171' }} /> Quick add protein</span>
          <b>{p.protein}<em> {p.proteinGoal ? `/${p.proteinGoal} g` : 'g'}</em></b>
          <span className="hd-pm">
            {p.onRemoveProtein && <button type="button" onClick={p.onRemoveProtein} disabled={p.proteinBusy || !p.protein} aria-label="Remove 10 g protein"><Minus /></button>}
            {p.onAddProtein && <button type="button" onClick={p.onAddProtein} disabled={p.proteinBusy} aria-label="Add 10 g protein" className="plus"><Plus /></button>}
          </span>
          <Bar value={pct(p.protein, p.proteinGoal)} />
        </div>
        <div className="hd-card hd-stat">
          <span className="hd-eyebrow"><Droplet aria-hidden style={{ color: '#3B9BFF' }} /> Quick add water</span>
          <b>{litres}<em> /{(p.waterGoalMl / 1000).toFixed(1)} L</em></b>
          <span className="hd-pm">
            <button type="button" onClick={p.onRemoveWater} disabled={p.waterBusy || !p.waterMl} aria-label="Remove water"><Minus /></button>
            <button type="button" onClick={p.onAddWater} disabled={p.waterBusy} aria-label="Add water" className="plus blue"><Plus /></button>
          </span>
          <Bar value={pct(p.waterMl, p.waterGoalMl)} />
        </div>
      </div>
    </div>
  );
}
