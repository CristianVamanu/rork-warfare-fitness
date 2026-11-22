'use client';

/**
 * The admin Overview, laid out like a product analytics board: revenue with
 * a curve, a sign-up calendar, a weekly bar chart, the most-used programs,
 * the members' age spread and the funnel. Every number is real — Stripe
 * mirror (finance), the funnel counters and the users collection. A card
 * with no data says so instead of drawing a pretend chart.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getIdToken } from 'firebase/auth';
import { ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getAllUsers, countUsers } from '@/lib/firestore';

type U = { createdAt?: unknown; age?: number; sex?: string; gender?: string; activeProgram?: { programName?: string } };
type Funnel = { daily: { day: string; visit: number; q1: number; account: number; paid: number }[]; totals: Record<string, number> };
type Fin = { currency: string; kpis?: { revenue: { gross: number; prevGross: number }; customers: { paying: number; trialing: number; atStart: number } }; revenue?: { key: string; gross: number }[] };

const DAY = 86_400_000;
const ms = (v: unknown): number | null => {
  if (!v) return null;
  const o = v as { toMillis?: () => number; seconds?: number };
  if (typeof o.toMillis === 'function') return o.toMillis();
  if (typeof o.seconds === 'number') return o.seconds * 1000;
  const n = new Date(v as string).getTime();
  return Number.isFinite(n) ? n : null;
};
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const money = (minor: number, cur: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency: cur.toUpperCase(), maximumFractionDigits: 0 }).format(minor / 100);
const delta = (a: number, b: number) => (b ? (a - b) / Math.abs(b) : null);

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="ov-seg">
      {options.map(([v, l]) => <button key={v} type="button" className={v === value ? 'is-on' : ''} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}
function Change({ v }: { v: number | null }) {
  if (v == null || !Number.isFinite(v)) return null;
  const up = v >= 0;
  return <span className={`ov-chg ${up ? 'up' : 'down'}`}>{up ? <ArrowUpRight /> : <ArrowDownRight />}{Math.abs(v * 100).toFixed(1)}%</span>;
}

/** Smooth line through points, as an SVG path. */
function curve(pts: [number, number][]) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i]; const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

export function OverviewDash() {
  const { user } = useAuth();
  const [users, setUsers] = useState<U[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [fin, setFin] = useState<Fin | null>(null);
  const [finErr, setFinErr] = useState(false);
  const [range, setRange] = useState<'week' | 'month' | 'year'>('month');
  const [barRange, setBarRange] = useState<'visit' | 'account'>('visit');
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); });

  useEffect(() => {
    getAllUsers(500).then((u) => setUsers(u as U[])).catch(() => setUsers([]));
    countUsers().then(setTotal).catch(() => setTotal(null));
  }, []);
  useEffect(() => {
    if (!user) return;
    (async () => {
      const h = { Authorization: `Bearer ${await getIdToken(user)}` };
      fetch('/api/admin/funnel?days=60', { headers: h }).then((r) => r.ok ? r.json() : null).then(setFunnel).catch(() => setFunnel(null));
    })();
  }, [user]);
  useEffect(() => {
    if (!user) return;
    const days = range === 'week' ? 7 : range === 'month' ? 30 : 365;
    const to = Math.floor(Date.now() / 1000); const from = to - days * 86400;
    const gran = range === 'year' ? 'month' : 'day';
    (async () => {
      try {
        const r = await fetch(`/api/admin/finance?view=overview&from=${from}&to=${to}&gran=${gran}&tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`, { headers: { Authorization: `Bearer ${await getIdToken(user)}` } });
        if (!r.ok) throw new Error();
        setFin(await r.json()); setFinErr(false);
      } catch { setFinErr(true); }
    })();
  }, [user, range]);

  // ── derived ──
  const signupsByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of users ?? []) { const t = ms(u.createdAt); if (t) m.set(ymd(t), (m.get(ymd(t)) ?? 0) + 1); }
    return m;
  }, [users]);
  const newThisMonth = useMemo(() => {
    const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
    return (users ?? []).filter((u) => (ms(u.createdAt) ?? 0) >= start.getTime()).length;
  }, [users]);
  const ages = useMemo(() => {
    const b = { '18–29': 0, '30–44': 0, '45+': 0 } as Record<string, number>;
    let n = 0;
    for (const u of users ?? []) { const a = u.age; if (!a || a < 13 || a > 100) continue; n++; b[a < 30 ? '18–29' : a < 45 ? '30–44' : '45+']++; }
    return { n, rows: Object.entries(b).map(([k, v]) => ({ k, pct: n ? Math.round((v / n) * 100) : 0 })) };
  }, [users]);
  const programs = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of users ?? []) { const p = u.activeProgram?.programName; if (p) m.set(p, (m.get(p) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [users]);
  const week = useMemo(() => {
    const out: { label: string; v: number }[] = [];
    const by = new Map((funnel?.daily ?? []).map((d) => [d.day, d]));
    for (let i = 6; i >= 0; i--) {
      const t = Date.now() - i * DAY; const d = by.get(ymd(t));
      out.push({ label: new Date(t).toLocaleDateString(undefined, { weekday: 'short' }), v: d ? d[barRange] : 0 });
    }
    return out;
  }, [funnel, barRange]);
  const weekTotal = week.reduce((a, b) => a + b.v, 0);

  // Revenue curve
  const series = fin?.revenue ?? [];
  const max = Math.max(1, ...series.map((s) => s.gross));
  const W = 600, H = 190;
  const pts: [number, number][] = series.map((s, i) => [series.length > 1 ? (i / (series.length - 1)) * W : W / 2, H - 12 - (s.gross / max) * (H - 30)]);
  const path = curve(pts);
  const cur = fin?.currency || 'usd';

  // Calendar
  const cal = useMemo(() => {
    const d = new Date(month); const first = (d.getDay() + 6) % 7; const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const cells: { day: number | null; n: number; today: boolean }[] = [];
    for (let i = 0; i < first; i++) cells.push({ day: null, n: 0, today: false });
    for (let i = 1; i <= days; i++) {
      const t = new Date(d.getFullYear(), d.getMonth(), i);
      cells.push({ day: i, n: signupsByDay.get(ymd(t.getTime() - t.getTimezoneOffset() * 60000)) ?? 0, today: ymd(Date.now()) === ymd(t.getTime() - t.getTimezoneOffset() * 60000) });
    }
    return cells;
  }, [month, signupsByDay]);
  const monthSignups = cal.reduce((a, c) => a + c.n, 0);
  const t = funnel?.totals ?? {};
  const steps = [['Visits', t.visit ?? 0], ['Started quiz', t.q1 ?? 0], ['Accounts', t.account ?? 0], ['Paid', t.paid ?? 0]] as const;

  return (
    <div className="ov">
      {/* Revenue */}
      <section className="ov-card ov-rev">
        <header><h3>Revenue</h3><Seg value={range} onChange={setRange} options={[['week', 'Week'], ['month', 'Month'], ['year', 'Year']]} /></header>
        {finErr ? (
          <p className="ov-empty">Revenue needs Stripe connected and synced. <Link href="/admin/finance">Open Finance</Link></p>
        ) : (
          <>
            <div className="ov-kpis">
              <div><b>{fin?.kpis ? money(fin.kpis.revenue.gross, cur) : '—'}</b><Change v={fin?.kpis ? delta(fin.kpis.revenue.gross, fin.kpis.revenue.prevGross) : null} /><small>This {range}</small></div>
              <div><b>{fin?.kpis ? fin.kpis.customers.paying : '—'}</b><Change v={fin?.kpis ? delta(fin.kpis.customers.paying, fin.kpis.customers.atStart) : null} /><small>Paying members</small></div>
              <div><b>{fin?.kpis ? fin.kpis.customers.trialing : '—'}</b><small>On trial</small></div>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="ov-chart" preserveAspectRatio="none" aria-label="Revenue over time">
              <defs>
                <linearGradient id="ovf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F5A623" stopOpacity=".35" /><stop offset="1" stopColor="#F5A623" stopOpacity="0" /></linearGradient>
                <pattern id="ovl" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M3 0V6" stroke="rgba(245,166,35,.18)" strokeWidth="1" /></pattern>
              </defs>
              {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgba(255,255,255,.05)" />)}
              {path && <path d={`${path} L${W},${H} L0,${H} Z`} fill="url(#ovl)" />}
              {path && <path d={`${path} L${W},${H} L0,${H} Z`} fill="url(#ovf)" />}
              {path && <path d={path} fill="none" stroke="#F5A623" strokeWidth="2.5" />}
            </svg>
            {series.length === 0 && <p className="ov-empty">No payments in this period yet.</p>}
          </>
        )}
      </section>

      {/* Calendar */}
      <section className="ov-card ov-cal">
        <header>
          <div className="ov-month">
            <button type="button" aria-label="Previous month" onClick={() => setMonth((m) => { const d = new Date(m); return new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(); })}><ChevronLeft /></button>
            <span>{new Date(month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
            <button type="button" aria-label="Next month" onClick={() => setMonth((m) => { const d = new Date(m); return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(); })}><ChevronRight /></button>
          </div>
        </header>
        <div className="ov-grid">
          {cal.map((c, i) => c.day ? (
            <span key={i} className={`${c.n > 0 ? 'has' : ''} ${c.n > 2 ? 'hot' : ''} ${c.today ? 'today' : ''}`} title={`${c.n} sign-up${c.n === 1 ? '' : 's'}`}>{c.day}{c.n > 0 && <i />}</span>
          ) : <span key={i} className="blank" />)}
        </div>
        <div className="ov-total"><b>{monthSignups}</b><small>new members this month</small></div>
      </section>

      {/* Weekly bars */}
      <section className="ov-card ov-bars">
        <header><h3>This week</h3><Seg value={barRange} onChange={setBarRange} options={[['visit', 'Visits'], ['account', 'Sign-ups']]} /></header>
        <div className="ov-kpis"><div><b>{weekTotal.toLocaleString()}</b><small>{barRange === 'visit' ? 'site visits' : 'new accounts'} in 7 days</small></div>
          <div className="ov-pills"><span><small>Members</small><b>{total ?? '—'}</b></span><span><small>New this month</small><b>{users ? newThisMonth : '—'}</b></span></div></div>
        <div className="ov-barwrap">
          {week.map((d, i) => {
            const m = Math.max(1, ...week.map((x) => x.v)); const h = Math.max(6, (d.v / m) * 100); const top = d.v === m && d.v > 0;
            return (
              <div key={i} className="ov-bar">
                <div className="ov-col"><span className={top ? 'top' : ''} style={{ height: `${h}%` }}>{d.v > 0 && <em>{d.v}</em>}</span></div>
                <small>{d.label}</small>
              </div>
            );
          })}
        </div>
      </section>

      {/* Popular programs */}
      <section className="ov-card ov-prog">
        <header><h3>Popular programs</h3></header>
        {programs.length === 0 ? <p className="ov-empty">{users ? 'No one has started a program yet.' : 'Loading…'}</p> : (
          <ul>{programs.map(([name, n], i) => (
            <li key={name}><span className="ov-rank">{i + 1}</span><span className="ov-pn">{name}</span><b>{n}</b></li>
          ))}</ul>
        )}
      </section>

      {/* Age range */}
      <section className="ov-card ov-age">
        <header><h3>Age range</h3></header>
        {ages.n === 0 ? <p className="ov-empty">{users ? 'No ages recorded yet.' : 'Loading…'}</p> : (
          <div className="ov-bubbles">
            {ages.rows.map((r, i) => (
              <span key={r.k} className={`b${i}`} style={{ ['--s' as string]: `${46 + r.pct * 1.1}px` }}><b>{r.pct}%</b><small>{r.k}</small></span>
            ))}
          </div>
        )}
      </section>

      {/* Funnel */}
      <section className="ov-card ov-fun">
        <header><h3>Funnel · last 60 days</h3><Link href="/admin?tab=funnel" className="ov-go" aria-label="Open funnel"><ArrowUpRight /></Link></header>
        <div className="ov-big"><b>{(t.visit ?? 0).toLocaleString()}</b><small>visits</small></div>
        <ul>{steps.map(([k, v], i) => {
          const pct = steps[0][1] ? (v / steps[0][1]) * 100 : 0;
          return <li key={k}><span>{k}</span><div className="ov-meter"><i style={{ width: `${Math.max(i === 0 ? 100 : 2, pct)}%` }} /></div><b>{v.toLocaleString()}</b></li>;
        })}</ul>
      </section>
    </div>
  );
}
