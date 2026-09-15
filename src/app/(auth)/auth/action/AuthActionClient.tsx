'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { Lock, Eye, EyeOff, CheckCircle, AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { AuthBrandMark } from '@/components/auth/AuthBrandMark';

/**
 * Handles Firebase Auth's email action links on OUR domain.
 *
 * Firebase's own handler lives at `<project>.firebaseapp.com/__/auth/action`,
 * and that is where every reset and verification link pointed. A password
 * reset email that sends someone to a domain which is not the one they signed
 * up on, to type a new password into an unbranded Google form, is the exact
 * shape of a phishing flow — the people most careful about security are the
 * ones most likely not to click it. This page is the same contract on
 * warfarefitness.com, so the whole journey stays on one domain and looks like
 * the app throughout.
 *
 * Firebase sends four things in the query string: `mode` (which action),
 * `oobCode` (the one-time code), `continueUrl` and `lang`. The code is
 * single-use and expires, which is the case Firebase's default page handles
 * worst — it shows a bare error string — so each failure here says what
 * actually happened and offers the one action that fixes it.
 */
type Mode = 'resetPassword' | 'verifyEmail' | 'recoverEmail';
type Phase = 'checking' | 'form' | 'working' | 'done' | 'error';

export default function AuthActionClient() {
  const router = useRouter();
  const params = useSearchParams();

  const mode = params.get('mode') as Mode | null;
  const oobCode = params.get('oobCode');
  // Firebase appends continueUrl from the actionCodeSettings the server sent.
  // Only ever used for a same-origin redirect — see safeContinue below.
  const continueUrl = params.get('continueUrl');

  const [phase, setPhase] = useState<Phase>('checking');
  const [errorMsg, setErrorMsg] = useState('');
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  /**
   * An attacker who can get someone to open a link controls continueUrl, so an
   * unchecked redirect here would be an open redirect on the one page a user
   * has just been taught to trust. Only our own origin is ever followed.
   */
  const safeContinue = useCallback((fallback: string): string => {
    if (!continueUrl) return fallback;
    try {
      const url = new URL(continueUrl, window.location.origin);
      return url.origin === window.location.origin ? url.pathname + url.search : fallback;
    } catch {
      return fallback;
    }
  }, [continueUrl]);

  /** Firebase's error codes, in words a person can act on. */
  const describe = useCallback((err: unknown, action: string): string => {
    const code = (err as { code?: string })?.code ?? '';
    if (code === 'auth/expired-action-code') {
      return `That link has expired. ${action} links are only valid for an hour — request a new one below.`;
    }
    if (code === 'auth/invalid-action-code') {
      return `That link has already been used, or it was only partly copied. Request a new one below.`;
    }
    if (code === 'auth/user-disabled') {
      return 'This account has been disabled. Contact support if you think that is a mistake.';
    }
    if (code === 'auth/user-not-found') {
      return 'That account no longer exists.';
    }
    if (code === 'auth/weak-password') {
      return 'Choose a longer password — at least 8 characters.';
    }
    return (err as Error)?.message || 'Something went wrong. Please request a new link.';
  }, []);

  // Validate the code up front. Doing it before showing the password form
  // means an expired link says so immediately, rather than after someone has
  // chosen and typed a new password twice.
  useEffect(() => {
    if (!mode || !oobCode) {
      setErrorMsg('This link is incomplete. Open it directly from the email rather than copying part of it.');
      setPhase('error');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        if (mode === 'resetPassword') {
          const addr = await verifyPasswordResetCode(auth, oobCode);
          if (cancelled) return;
          setEmail(addr);
          setPhase('form');
          return;
        }

        if (mode === 'verifyEmail') {
          await applyActionCode(auth, oobCode);
          if (cancelled) return;
          // The signed-in user's token still says emailVerified:false until it
          // refreshes — reload so anything gating on it (the trial, in
          // MembershipGuard) sees the new state without a sign-out.
          await auth.currentUser?.reload().catch(() => {});
          setPhase('done');
          setTimeout(() => router.replace(safeContinue('/login?verified=1')), 1600);
          return;
        }

        if (mode === 'recoverEmail') {
          const info = await checkActionCode(auth, oobCode);
          await applyActionCode(auth, oobCode);
          if (cancelled) return;
          setEmail(info.data.email ?? null);
          setPhase('done');
          return;
        }

        setErrorMsg('This type of link is not supported.');
        setPhase('error');
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(describe(err, mode === 'verifyEmail' ? 'Verification' : 'Reset'));
        setPhase('error');
      }
    })();

    return () => { cancelled = true; };
  }, [mode, oobCode, router, safeContinue, describe]);

  async function submitNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (password !== confirm) { toast.error('Passwords do not match'); return; }
    if (!oobCode) return;

    setPhase('working');
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setPhase('done');
      toast.success('Password updated');
      setTimeout(() => router.replace(safeContinue('/login')), 1600);
    } catch (err) {
      setErrorMsg(describe(err, 'Reset'));
      setPhase('error');
    }
  }

  const title = mode === 'verifyEmail' ? 'Confirm Your Email'
    : mode === 'recoverEmail' ? 'Restore Your Email'
    : 'Choose a New Password';

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <AuthBrandMark title={title} subtitle={email ?? undefined} />

      <Card glass className="p-6">
        {phase === 'checking' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="w-6 h-6 text-accent animate-spin" />
            <p className="text-sm text-text-secondary">Checking your link…</p>
          </div>
        )}

        {phase === 'form' && (
          <form onSubmit={submitNewPassword} className="space-y-4">
            <p className="text-sm text-text-secondary">
              Pick something you haven&apos;t used before. At least 8 characters.
            </p>
            <Input
              label="New Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="new-password"
              autoFocus
              leftIcon={<Lock className="w-4 h-4" />}
              rightIcon={
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Input
              label="Confirm New Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="new-password"
              leftIcon={<Lock className="w-4 h-4" />}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <Button type="submit" fullWidth size="lg">Update Password</Button>
          </form>
        )}

        {phase === 'working' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="w-6 h-6 text-accent animate-spin" />
            <p className="text-sm text-text-secondary">Updating your password…</p>
          </div>
        )}

        {phase === 'done' && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle className="w-10 h-10 text-accent" />
            <p className="text-sm text-white font-semibold">
              {mode === 'verifyEmail' ? 'Email confirmed.' : mode === 'recoverEmail' ? 'Email restored.' : 'Password updated.'}
            </p>
            <p className="text-xs text-text-secondary">
              {mode === 'recoverEmail'
                ? 'Your sign-in address has been changed back. Reset your password too if you did not make that change.'
                : 'Taking you to sign in…'}
            </p>
            <Link href="/login" className="text-sm text-accent font-medium hover:underline mt-1">Go to sign in</Link>
          </motion.div>
        )}

        {phase === 'error' && (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <AlertTriangle className="w-9 h-9 text-danger" />
            <p className="text-sm text-white font-semibold">This link didn&apos;t work</p>
            <p className="text-xs text-text-secondary leading-relaxed">{errorMsg}</p>
            <div className="w-full pt-2 space-y-2">
              {mode === 'verifyEmail' ? (
                <Link href="/login" className="block">
                  <Button fullWidth>Sign in to resend</Button>
                </Link>
              ) : (
                <Link href="/forgot-password" className="block">
                  <Button fullWidth>Request a new link</Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </Card>

      <div className="mt-6 text-center">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back to login
        </Link>
      </div>
    </motion.div>
  );
}
