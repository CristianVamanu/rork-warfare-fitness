'use client';

import { useState, useEffect, useRef } from 'react';
import { MailCheck, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { signOut } from '@/lib/auth';
import { Button } from './Button';
import { Card } from './Card';

// Email confirmation by CODE, not by link.
//
// A link opens in the member's default browser, not the PWA they signed up
// in — a different session, so the app they're looking at never learns the
// address was confirmed. That is the entire cause of "the link opens the site
// but I'm still not verified". A six-digit code never leaves the app.
//
// Two shapes, same behaviour: a slim banner mounted once in the app layout,
// and a full card MembershipGuard renders in place of trial content.
// Mirrors CODE_TTL_MS in lib/verificationCode.ts. Duplicated rather than
// imported: that module pulls in firebase-admin and node crypto, neither of
// which belongs in a client bundle.
const CODE_TTL_MS = 15 * 60 * 1000;
// Requests offered in the UI before it stops asking. Under the server's own
// per-account ceiling on purpose, so the button runs out before the API does.
const MAX_SENDS = 3;
// Long enough that "it hasn't arrived" is about delivery, not impatience.
const RESEND_COOLDOWN_MS = 45 * 1000;

export function VerifyEmailNotice({ variant = 'banner' }: { variant?: 'banner' | 'screen' }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<'send' | 'confirm' | 'email' | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  // How many codes this session has asked for, and when the newest one dies.
  // The server is the real limit (six per fifteen minutes, per account); this
  // is the honest version of it in front of the person, so a third press does
  // not silently become a 429 they cannot interpret.
  const [sends, setSends] = useState(0);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  // Mistyping your address at signup used to be unrecoverable: the code went
  // to an inbox you don't own, and nothing in the app could change it.
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const checking = useRef(false);

  // Kept for accounts mid-migration: anyone who already tapped a verification
  // LINK from the old flow gets picked up when they return to the app, rather
  // than being told to start again with a code.
  useEffect(() => {
    if (!user || user.emailVerified) return;
    const recheck = async () => {
      if (checking.current || document.visibilityState !== 'visible') return;
      checking.current = true;
      try {
        await user.reload();
        if (user.emailVerified) {
          await user.getIdToken(true);
          window.location.reload();
        }
      } catch { /* offline — the next tick retries */ }
      finally { checking.current = false; }
    };
    document.addEventListener('visibilitychange', recheck);
    const poll = setInterval(recheck, 30_000);
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      clearInterval(poll);
    };
  }, [user]);

  // One second tick, and only while there is something counting down.
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  // The full-screen gate sends the first code by itself — nobody should have
  // to ask for the email that unblocks the thing they just signed up for. The
  // banner variant deliberately does NOT, since it's mounted app-wide and
  // would fire on every route. Ref-guarded so a remount can't re-send, with
  // the server's own per-account limit as the real backstop.
  // Holds the latest sendCode so the effect below can call it without being
  // declared after it — hooks have to run before this component's early
  // return, and sendCode needs the non-null `user` that return guarantees.
  const sendCodeRef = useRef<(() => Promise<void>) | null>(null);
  const autoSent = useRef(false);
  useEffect(() => {
    if (variant !== 'screen' || autoSent.current) return;
    if (!user || user.emailVerified) return;
    autoSent.current = true;
    void sendCodeRef.current?.();
  }, [variant, user]);

  if (!user || user.emailVerified) return null;

  const post = async (path: string, body?: unknown) => {
    const idToken = await user.getIdToken();
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => null);
    return { res, data } as { res: Response; data: { error?: string; retryAfter?: number; alreadyVerified?: boolean; codeSent?: boolean } | null };
  };

  const sendCode = async () => {
    setBusy('send');
    try {
      const { res, data } = await post('/api/auth/verify-email/send');
      if (data?.alreadyVerified) {
        await user.reload();
        await user.getIdToken(true);
        window.location.reload();
        return;
      }
      if (res.status === 429) {
        const mins = Math.max(1, Math.ceil((data?.retryAfter ?? 300) / 60));
        toast.error(`Too many codes requested — try again in about ${mins} minute${mins === 1 ? '' : 's'}.`);
        return;
      }
      if (!res.ok) { toast.error(data?.error || 'Could not send the code.'); return; }
      setCodeSent(true);
      setSends((n) => n + 1);
      setExpiresAt(Date.now() + CODE_TTL_MS);
      setLastSentAt(Date.now());
      setCode('');
      toast.success(`Code sent to ${user.email}`);
    } catch {
      toast.error('Could not send the code. Check your connection.');
    } finally {
      setBusy(null);
    }
  };

  // Published for the auto-send effect above, which runs after this render.
  sendCodeRef.current = sendCode;

  const changeEmail = async () => {
    if (!newEmail.trim()) return;
    setBusy('email');
    try {
      const { res, data } = await post('/api/auth/verify-email/change-email', { email: newEmail.trim() });
      if (res.status === 429) {
        const mins = Math.max(1, Math.ceil((data?.retryAfter ?? 3600) / 60));
        toast.error(`Too many changes — try again in about ${mins} minute${mins === 1 ? '' : 's'}.`);
        return;
      }
      if (!res.ok) { toast.error(data?.error || 'Could not change your email.'); return; }

      // Do NOT reload() or getIdToken() here. Changing the address through the
      // Admin SDK invalidates this session's token, so both of those throw —
      // and because they threw inside this try, a change that had ALREADY
      // SUCCEEDED server-side was reported as "check your connection" while
      // Firebase quietly signed the member out. The confusing part was never
      // the sign-out; it was being told the change had failed.
      //
      // The new code is already on its way (the server sends it), so the only
      // honest thing left is to say what happened and hand them to the login
      // screen with their new address.
      toast.success('Email updated. Sign in with your new address to continue.', { duration: 7000 });
      await signOut().catch(() => {});
      // Carry through whether the code actually went out. Promising "your code
      // is on its way" when Resend refused would send them to an inbox to wait
      // for mail that will never arrive.
      const sent = data?.codeSent !== false;
      window.location.href = `/login?emailChanged=1${sent ? '' : '&code=0'}`;
    } catch {
      toast.error('Could not change your email. Check your connection.');
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    if (code.trim().length !== 6) return;
    setBusy('confirm');
    try {
      const { res, data } = await post('/api/auth/verify-email/confirm', { code: code.trim() });
      if (!res.ok) { toast.error(data?.error || 'Verification failed.'); return; }
      // emailVerified lives on the ID token — without a forced refresh every
      // server gate keeps reading the stale value and nothing unlocks.
      await user.reload();
      await user.getIdToken(true);
      toast.success('Email confirmed — welcome in.');
      window.location.reload();
    } catch {
      toast.error('Verification failed. Try again.');
    } finally {
      setBusy(null);
    }
  };

  // Derived, not stored, so they cannot drift from the clock.
  const expired = expiresAt !== null && now >= expiresAt;
  const msLeft = expiresAt ? Math.max(0, expiresAt - now) : 0;
  const mmss = `${Math.floor(msLeft / 60000)}:${String(Math.floor((msLeft % 60000) / 1000)).padStart(2, '0')}`;
  const cooldownLeft = lastSentAt ? Math.max(0, RESEND_COOLDOWN_MS - (now - lastSentAt)) : 0;
  const sendsLeft = MAX_SENDS - sends;
  const canResend = sendsLeft > 0 && cooldownLeft === 0 && busy === null;

  const resendLabel = sendsLeft <= 0
    ? 'No more codes'
    : cooldownLeft > 0
      ? `Send a new code in ${Math.ceil(cooldownLeft / 1000)}s`
      : 'Send a new code';

  // Says which of the three states the person is actually in. Without this the
  // only feedback on a code that quietly aged out was the confirm attempt
  // failing, which reads as "I typed it wrong" rather than "it expired".
  const status = !codeSent ? null : expired ? (
    <p className="text-xs text-amber-400">
      That code has expired.{' '}
      {sendsLeft > 0 ? 'Request a new one below.' : 'Use a different address, or try again in a few minutes.'}
    </p>
  ) : (
    <p className="text-xs text-text-tertiary">
      Expires in <span className="tabular-nums text-text-secondary">{mmss}</span>
      {sendsLeft > 0 && sendsLeft < MAX_SENDS && <> · {sendsLeft} more {sendsLeft === 1 ? 'request' : 'requests'}</>}
    </p>
  );

  const resendButton = (
    <Button fullWidth variant="ghost" onClick={sendCode} loading={busy === 'send'} disabled={!canResend}>
      <RefreshCw className="w-4 h-4" aria-hidden="true" /> {resendLabel}
    </Button>
  );

  const codeInput = (
    <div className="flex gap-2">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={(e) => { if (e.key === 'Enter') confirm(); }}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        aria-label="6-digit confirmation code"
        className="flex-1 min-w-0 bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-center text-lg font-bold tracking-[0.3em] text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
      />
      <Button onClick={confirm} loading={busy === 'confirm'} disabled={code.length !== 6}>Confirm</Button>
    </div>
  );

  if (variant === 'screen') {
    return (
      <div className="px-4 pt-10 max-w-lg mx-auto">
        <Card className="p-6 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center">
            <MailCheck className="w-6 h-6 text-accent" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-black text-white">Confirm your email to start</h2>
          <p className="text-sm text-text-secondary">
            {codeSent
              ? <>We sent a 6-digit code to <span className="text-white font-medium">{user.email}</span>. Enter it below — your trial starts the moment it&apos;s confirmed.</>
              : <>We&apos;ll send a 6-digit code to <span className="text-white font-medium">{user.email}</span>. No links to chase — you confirm right here.</>}
          </p>
          {codeSent ? (
            <div className="space-y-2">
              {codeInput}
              {status}
              {resendButton}
              {sendsLeft <= 0 && (
                <p className="text-[11px] text-text-tertiary">
                  You have requested the most codes we send in one go. If none arrived, check spam, or correct the address below.
                </p>
              )}
            </div>
          ) : (
            <Button fullWidth onClick={sendCode} loading={busy === 'send'}>Send me a code</Button>
          )}

          {/* The way out of a typo. Without this, a wrong address at signup is
              an account that can never be confirmed and therefore never used,
              with nothing in the app able to fix it. */}
          <div className="pt-2 border-t border-white/8">
            {editingEmail ? (
              <div className="space-y-2 text-left">
                <label htmlFor="new-email" className="text-xs text-text-secondary">Correct email address</label>
                <div className="flex gap-2">
                  <input
                    id="new-email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') changeEmail(); }}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="flex-1 min-w-0 bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
                  />
                  <Button onClick={changeEmail} loading={busy === 'email'} disabled={!newEmail.trim()}>Save</Button>
                </div>
                <button
                  type="button"
                  onClick={() => { setEditingEmail(false); setNewEmail(''); }}
                  className="text-xs text-text-tertiary hover:text-white"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setEditingEmail(true); setNewEmail(user.email ?? ''); }}
                className="text-xs text-text-secondary hover:text-white"
              >
                Wrong address? <span className="text-accent font-semibold">Change it</span>
              </button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div role="status" className="mx-4 mt-3 max-w-lg md:max-w-2xl lg:max-w-4xl lg:mx-auto rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-text-secondary">
      <div className="flex items-center gap-3">
        <MailCheck className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
        <span className="flex-1">Confirm <span className="text-white">{user.email}</span> to unlock your trial.</span>
        {!codeSent && (
          <button type="button" onClick={sendCode} disabled={busy !== null} className="font-semibold text-accent hover:underline disabled:opacity-50">
            {busy === 'send' ? 'Sending…' : 'Send code'}
          </button>
        )}
      </div>
      {/* The banner had no way to ask for another code once the first was
          sent: the only recovery from a code that never arrived, or that aged
          out while the person went to find it, was reloading the page. */}
      {codeSent && (
        <div className="mt-2 space-y-1.5">
          {codeInput}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {status}
            <button
              type="button"
              onClick={sendCode}
              disabled={!canResend}
              className="font-semibold text-accent hover:underline disabled:opacity-40 disabled:no-underline whitespace-nowrap"
            >
              {busy === 'send' ? 'Sending…' : resendLabel}
            </button>
          </div>
        </div>
      )}

      {/* Also here, not only on the full-screen gate. Straight after signup a
          member lands on the dashboard — a path MembershipGuard lets through —
          so this banner is the ONLY thing they see. Putting the escape hatch
          solely on the screen variant meant a mistyped address was still a
          dead end for exactly the person who had just mistyped it. */}
      {editingEmail ? (
        <div className="mt-2 space-y-1.5">
          <div className="flex gap-2">
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') changeEmail(); }}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-label="Correct email address"
              className="flex-1 min-w-0 bg-surface border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
            />
            <Button size="sm" onClick={changeEmail} loading={busy === 'email'} disabled={!newEmail.trim()}>Save</Button>
          </div>
          <button
            type="button"
            onClick={() => { setEditingEmail(false); setNewEmail(''); }}
            className="text-[11px] text-text-tertiary hover:text-white"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setEditingEmail(true); setNewEmail(user.email ?? ''); }}
          className="mt-1.5 text-[11px] text-text-secondary hover:text-white"
        >
          Wrong email? <span className="text-accent font-semibold">Change it</span>
        </button>
      )}
    </div>
  );
}
