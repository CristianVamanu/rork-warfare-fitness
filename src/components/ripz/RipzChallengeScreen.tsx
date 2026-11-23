'use client';

/**
 * The 30-day Ripz challenge screen. One pack a day for thirty days, the reps
 * ramping up week by week. Two rips a day at most: the first, and one retry
 * that may land higher or lower. Once the day is logged the screen says so
 * and sends the member away until tomorrow.
 *
 * The rules are in lib/ripzChallenge. This component only draws the record
 * it is given and reports what happened; where the record is kept is the
 * page's business (the member's profile), which also keeps this testable
 * without an account.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Volume2, VolumeX, Check, RotateCcw, Flame, Trophy, ChevronRight, LogOut, Dices } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { RIPZ_MOVES, RIPZ_TIERS, tierFor, type RipzChallenge, type RipzPackDef } from '@/lib/ripz';
import { challengeView, rollChallengeDay, rangeForDay, recordLevel, CHALLENGE_DAYS, REST_PASSES, RIPS_PER_DAY, type ChallengeRecord } from '@/lib/ripzChallenge';
import { RipzLevelPicker, useRipzLevel } from '@/components/ripz/RipzLevelPicker';
import type { RipzLevel } from '@/lib/ripz';
import { RipzPack } from '@/components/ripz/RipzPack';
import { RipzWheel } from '@/components/ripz/RipzWheel';
import { RipzAudio } from '@/components/ripz/ripzAudio';
import { RipzShare } from '@/components/ripz/RipzShare';

const MUTE_KEY = 'wf.ripz.muted';

function Grid({ grid }: { grid: ('done' | 'missed' | 'today' | 'ahead')[] }) {
  return (
    <div className="grid grid-cols-10 gap-1.5">
      {grid.map((g, i) => (
        <div
          key={i}
          title={`Day ${i + 1}`}
          className={`aspect-square rounded-md flex items-center justify-center text-[10px] font-black tabular-nums ${
            g === 'done' ? 'bg-accent text-black' : g === 'missed' ? 'bg-red-500/15 text-red-400 border border-red-500/30'
            : g === 'today' ? 'border-2 border-accent text-white' : 'bg-white/5 text-text-tertiary'}`}
        >
          {g === 'done' ? <Check className="w-3 h-3" /> : i + 1}
        </div>
      ))}
    </div>
  );
}

/** Hours and minutes left until the local day turns over. */
function useUntilMidnight(): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const d = new Date(now); const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const mins = Math.max(0, Math.round((end - now) / 60_000));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export interface ChallengeStore {
  /** Begin (or begin again) today, carrying how many were finished before. */
  start: (completed: number, level: RipzLevel) => Promise<void>;
  /** Leave the challenge. Finished-before count is kept; the run is dropped. */
  quit: (completed: number) => Promise<void>;
  /** A pack was opened: that rip is spent and its number is on record. */
  savePending: (p: NonNullable<ChallengeRecord['pending']>) => Promise<void>;
  /** The day's reps are done. */
  logDay: (day: number, p: NonNullable<ChallengeRecord['pending']>) => Promise<void>;
  /** The member's referral code for share links, or null. */
  getRef?: () => Promise<string | null>;
}

export function RipzChallengeScreen({ rec, today, store }: { rec: ChallengeRecord | null; today: string; store: ChallengeStore }) {
  const audio = useMemo(() => new RipzAudio(), []);
  const [muted, setMuted] = useState(false);
  const [pack, setPack] = useState<RipzPackDef | null>(null);
  const [live, setLive] = useState<RipzChallenge | null>(null);
  const [packKey, setPackKey] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  // Back on the wheel for the one retry, instead of looking at the first number.
  const [retrying, setRetrying] = useState(false);
  const actions = useRef<HTMLDivElement>(null);
  const untilMidnight = useUntilMidnight();
  // Level for a NEW run (picked before starting). A running challenge keeps the level it started at.
  const [newLevel, setNewLevel] = useRipzLevel();
  const level = recordLevel(rec);
  const [confirm, setConfirm] = useState<null | 'quit' | 'restart'>(null);

  const view = challengeView(rec, today);
  // Today's pack, once ripped. Survives a reload, so the number cannot be re-dealt.
  const pending = rec?.pending && rec.pending.day === view.day && view.state === 'active' && !view.doneToday ? rec.pending : null;
  const ripsUsed = pending?.rips ?? 0;

  useEffect(() => {
    try { const m = localStorage.getItem(MUTE_KEY) === '1'; setMuted(m); audio.muted = m; } catch { /* private mode */ }
    return () => audio.close();
  }, [audio]);
  useEffect(() => { if (revealed) actions.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [revealed]);

  function toggleMute() {
    const m = !muted; setMuted(m); audio.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* private mode */ }
  }

  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      await store.start((rec?.completed ?? 0) + (view.state === 'complete' ? 1 : 0), newLevel);
      setConfirm(null);
      setPack(null); setLive(null); setRevealed(false); setRetrying(false);
    } catch (err) { console.error(err); toast.error('Could not start. Try again.'); }
    finally { setBusy(false); }
  }

  async function quit() {
    if (busy) return;
    setBusy(true);
    try {
      await store.quit(rec?.completed ?? 0);
      setPack(null); setLive(null); setRevealed(false); setRetrying(false); setConfirm(null);
      toast.success('You left the challenge. Start again whenever you like.');
    } catch (err) { console.error(err); toast.error('Could not leave. Try again.'); }
    finally { setBusy(false); }
  }

  function pick(p: RipzPackDef) {
    if (ripsUsed >= RIPS_PER_DAY) return;
    const next = rollChallengeDay(view.day, p.moveId, pending?.count ?? null, Math.random, level);
    setPack(p); setLive(next); setRevealed(false); setPackKey((k) => k + 1);
  }

  // The pack is opened: that rip is spent and the number is on record.
  async function onRevealed() {
    setRevealed(true); setRetrying(false);
    if (!pack || !live) return;
    await store.savePending({ day: view.day, packId: pack.id, moveId: live.move.id, move: live.move.name, count: live.count, rips: ripsUsed + 1 })
      .catch((err) => console.error('[ripz challenge] save failed', err));
  }

  async function done() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      await store.logDay(view.day, pending);
      setPack(null); setLive(null); setRevealed(false);
    } catch (err) { console.error(err); toast.error('Could not save that. Try again.'); }
    finally { setBusy(false); }
  }
  const referralCode = store.getRef;

  const todayDone = rec?.days?.[String(view.day)];
  const shareOf = (count: number, moveName: string): RipzChallenge => {
    const move = RIPZ_MOVES.find((m) => m.name === moveName) ?? RIPZ_MOVES[0];
    return { move, count: Math.min(count, 200), tier: tierFor(count) };
  };
  // Showing the pack being torn (this visit), or the stored result (after a reload).
  const showingPack = !!pack && !!live;
  const staticPending = !!pending && !showingPack && !retrying;
  const tomorrow = view.day < CHALLENGE_DAYS ? rangeForDay(view.day + 1, level) : null;

  return (
      <div className="px-4 pt-2 max-w-md mx-auto">
        <div className="flex items-start justify-between">
          <div>
            <p className="wf-readout text-[10px] font-bold text-accent">30 days · one pack a day</p>
            <h1 className="text-3xl font-black italic text-white">RIPZ CHALLENGE</h1>
          </div>
          <button type="button" onClick={toggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} className="p-2 rounded-xl border border-white/10 text-text-secondary hover:text-white">
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>

        {/* ── Not started ─────────────────────────────────────────────── */}
        {view.state === 'none' && (
          <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-accent/30 bg-accent/[0.07] p-4">
              <h2 className="text-xl font-black text-white">Thirty days. One pack a day.</h2>
              <ul className="text-sm text-text-secondary mt-2 space-y-1.5">
                <li>Pick any pack each day, rip it, do the reps.</li>
                <li>One retry a day. It can land higher or lower, and then it is final.</li>
                <li>{REST_PASSES} rest passes. Miss a fourth day and the challenge is over.</li>
                <li>If the day is still open at 6pm, we send you a reminder.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-white/8 bg-surface p-3">
              <p className="wf-readout text-[10px] font-bold text-text-tertiary mb-2">It gets harder</p>
              {[['Days 1–7', 1], ['Days 8–14', 8], ['Days 15–21', 15], ['Days 22–29', 22], ['Day 30', 30]].map(([label, d]) => {
                const r = rangeForDay(d as number, newLevel);
                return (
                  <div key={label} className="flex items-center gap-2 text-xs py-0.5">
                    <span className="w-24 font-bold text-white">{label}</span>
                    <span className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden"><span className="block h-full rounded-full bg-accent" style={{ width: `${(r.max / rangeForDay(30, newLevel).max) * 100}%` }} /></span>
                    <span className="w-24 text-right text-text-secondary tabular-nums">{r.min}–{r.max} reps</span>
                  </div>
                );
              })}
            </div>
            <div className="rounded-2xl border border-white/8 bg-surface px-3 pb-3">
              <RipzLevelPicker level={newLevel} onChange={setNewLevel} />
              <p className="text-[11px] text-text-tertiary mt-1">The whole challenge uses this level. You can restart at another level any time.</p>
            </div>
            <Button fullWidth onClick={start} disabled={busy}><Flame className="w-4 h-4" /> Start day 1 today</Button>
            {!!rec?.completed && <p className="text-center text-xs text-text-secondary">Finished {rec.completed} time{rec.completed === 1 ? '' : 's'} before.</p>}
          </div>
        )}

        {/* ── Over: missed too many ───────────────────────────────────── */}
        {view.state === 'failed' && (
          <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-5 text-center">
              <p className="wf-readout text-[10px] font-bold text-red-400">Challenge over</p>
              <h2 className="text-2xl font-black text-white mt-2">{view.missed} days missed</h2>
              <p className="text-sm text-text-secondary mt-2">You got {view.doneCount} {view.doneCount === 1 ? 'day' : 'days'} in and {view.totalReps.toLocaleString()} reps done. That work still counts. Day 1 is waiting when you are.</p>
            </div>
            <Grid grid={view.grid} />
            <div className="rounded-2xl border border-white/8 bg-surface px-3 pb-3"><RipzLevelPicker level={newLevel} onChange={setNewLevel} /></div>
            <Button fullWidth onClick={start} disabled={busy}><RotateCcw className="w-4 h-4" /> Start again from day 1</Button>
          </div>
        )}

        {/* ── Finished all thirty ─────────────────────────────────────── */}
        {view.state === 'complete' && (
          <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-accent/50 bg-accent/[0.09] p-6 text-center ripz-card-in" style={{ boxShadow: '0 0 60px rgb(var(--accent-rgb) / 0.25)' }}>
              <Trophy className="w-12 h-12 text-accent mx-auto" />
              <p className="wf-readout text-[10px] font-bold text-accent mt-3">30-day Ripz challenge</p>
              <h2 className="text-3xl font-black text-white mt-1">Complete.</h2>
              <p className="text-5xl font-black text-white tabular-nums mt-4">{view.totalReps.toLocaleString()}</p>
              <p className="text-sm text-text-secondary">reps over {view.doneCount} days</p>
            </div>
            <Grid grid={view.grid} />
            <RipzShare challenge={shareOf(100, 'Push-ups')} getRef={referralCode} label="Share that I finished" text={`I finished the 30-day Ripz challenge: ${view.totalReps.toLocaleString()} reps. Your turn.`} />
            <div className="rounded-2xl border border-white/8 bg-surface px-3 pb-3"><RipzLevelPicker level={newLevel} onChange={setNewLevel} /></div>
            <Button fullWidth variant="ghost" onClick={start} disabled={busy}><RotateCcw className="w-4 h-4" /> Go again from day 1</Button>
          </div>
        )}

        {/* ── Running ─────────────────────────────────────────────────── */}
        {view.state === 'active' && (
          <>
            <div className="flex items-end justify-between mt-4">
              <div>
                <p className="text-4xl font-black text-white leading-none">Day {view.day}<span className="text-lg text-text-tertiary font-bold"> of {CHALLENGE_DAYS}</span></p>
                <p className="text-xs text-text-secondary mt-1">Today: {view.range.min}–{view.range.max} reps · {view.totalReps.toLocaleString()} done so far</p>
                <p className="text-[11px] text-text-tertiary mt-0.5 capitalize">{level} level</p>
              </div>
              <p className="text-xs text-text-tertiary text-right">{view.passesLeft} rest {view.passesLeft === 1 ? 'pass' : 'passes'} left</p>
            </div>
            <div className="mt-3"><Grid grid={view.grid} /></div>

            {view.doneToday && todayDone ? (
              /* Logged: nothing more to do until the calendar turns. */
              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-accent/50 bg-accent/[0.09] p-6 text-center ripz-card-in" style={{ boxShadow: '0 0 60px rgb(var(--accent-rgb) / 0.22)' }}>
                  <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center mx-auto"><Check className="w-9 h-9 text-black" strokeWidth={3} /></div>
                  <p className="wf-readout text-[10px] font-bold text-accent mt-4">Day {view.day} complete</p>
                  <p className="text-5xl font-black text-white tabular-nums mt-1">{todayDone.count}</p>
                  <p className="text-base font-black text-white uppercase">{todayDone.move}</p>
                  <p className="text-sm text-text-secondary mt-4">
                    {view.day < CHALLENGE_DAYS ? 'That is today done. Rest, eat, sleep. Come back tomorrow.' : 'That was the last one.'}
                  </p>
                  {tomorrow && (
                    <p className="text-xs text-text-tertiary mt-2">Day {view.day + 1} opens in {untilMidnight} · {tomorrow.min}–{tomorrow.max} reps</p>
                  )}
                </div>
                <RipzShare challenge={shareOf(todayDone.count, todayDone.move)} getRef={referralCode} label={`Share day ${view.day}`} text={`Day ${view.day} of the 30-day Ripz challenge: ${todayDone.count} ${todayDone.move.toLowerCase()} done.`} />
              </div>
            ) : (
              <>
                <div className={`mt-5 ${showingPack || staticPending ? (showingPack && !revealed ? 'mb-28' : 'mb-16') + ' min-h-[380px]' : 'mb-4'}`}>
                  {showingPack ? (
                    <RipzPack pack={pack!} challenge={live!} audio={audio} packKey={packKey} onRevealed={onRevealed} onBack={() => { setPack(null); setLive(null); setRevealed(false); }} />
                  ) : staticPending ? (
                    /* Came back after ripping: the number stands, shown without the pack. */
                    <div className="mx-auto w-[216px] h-[346px] mt-6 rounded-2xl border bg-surface flex flex-col items-center justify-center text-center px-3" style={{ borderColor: RIPZ_TIERS[tierFor(pending!.count)].color, boxShadow: `0 0 46px ${RIPZ_TIERS[tierFor(pending!.count)].color}55` }}>
                      <p className="wf-readout text-[10px] font-bold" style={{ color: RIPZ_TIERS[tierFor(pending!.count)].color }}>Today&apos;s pull</p>
                      <p className="text-[84px] leading-none font-black text-white tabular-nums mt-2">{pending!.count}</p>
                      <p className="text-xl font-black text-white uppercase mt-2">{pending!.move}</p>
                    </div>
                  ) : (
                    <RipzWheel audio={audio} onPick={pick} />
                  )}
                </div>
                {!showingPack && !staticPending && ripsUsed === 1 && (
                  <p className="text-center text-xs font-bold text-accent -mt-1 mb-2">This is your retry. It could be higher or lower, and it is final.</p>
                )}
                {pending && (revealed || staticPending) && (
                  <div ref={actions} className="space-y-2 wf-rise scroll-mb-28">
                    <Button fullWidth onClick={done} disabled={busy}><Check className="w-4 h-4" /> Done. Log day {view.day}</Button>
                    {ripsUsed < RIPS_PER_DAY ? (
                      <Button fullWidth variant="ghost" onClick={() => { setPack(null); setLive(null); setRevealed(false); setRetrying(true); }}><RotateCcw className="w-4 h-4" /> Use my one retry</Button>
                    ) : (
                      <p className="text-center text-[11px] text-text-tertiary">Retry used. That is your number for day {view.day}.</p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Always available while a challenge runs: normal Ripz, and a way out. */}
            <div className="mt-6 space-y-2">
              <Link href="/ripz/play" className="flex items-center gap-3 rounded-2xl border border-white/8 bg-surface p-3">
                <Dices className="w-5 h-5 text-accent flex-shrink-0" />
                <span className="flex-1"><span className="block text-sm font-black text-white">Free play</span><span className="block text-xs text-text-secondary">Spin the wheel as normal. It does not count toward the challenge.</span></span>
                <ChevronRight className="w-4 h-4 text-accent" />
              </Link>
              {confirm ? (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-4">
                  <p className="text-sm font-black text-white">{confirm === 'quit' ? 'Leave the challenge?' : 'Restart from day 1?'}</p>
                  <p className="text-xs text-text-secondary mt-1">
                    {confirm === 'quit' ? 'Your 30-day run ends here.' : 'Your current run is wiped and day 1 starts today.'} The {view.totalReps.toLocaleString()} reps you logged stay in your Ripz totals.
                  </p>
                  {confirm === 'restart' && <div className="mt-1"><RipzLevelPicker level={newLevel} onChange={setNewLevel} /></div>}
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>Keep going</Button>
                    <Button onClick={confirm === 'quit' ? quit : start} disabled={busy}>{confirm === 'quit' ? 'Leave' : 'Restart'}</Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setNewLevel(level); setConfirm('restart'); }} className="flex items-center justify-center gap-1.5 h-10 rounded-xl border border-white/10 text-xs font-bold text-text-secondary hover:text-white"><RotateCcw className="w-3.5 h-3.5" /> Restart / change level</button>
                  <button type="button" onClick={() => setConfirm('quit')} className="flex items-center justify-center gap-1.5 h-10 rounded-xl border border-white/10 text-xs font-bold text-text-secondary hover:text-white"><LogOut className="w-3.5 h-3.5" /> Leave challenge</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
  );
}
