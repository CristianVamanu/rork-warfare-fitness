'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { signIn, signOut } from '@/lib/auth';
import { getUserDoc } from '@/lib/firestore';
import { getTrustedDevice } from '@/lib/twoFactor';
import { isMfaRequiredError, totpChallengeFrom, resolveTotpSignIn, mfaErrorMessage, type TotpChallenge } from '@/lib/mfa';
import type { User } from 'firebase/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type FormData = z.infer<typeof schema>;

export default function LoginClient({
  initialAppName,
}: {
  initialAppName: string;
  // No longer used — the logo box now always shows the animated brand-mark
  // video (same as the landing page hero), not the admin-configured static
  // logo. Kept in the props type so page.tsx doesn't need touching too.
  initialLogoUrl: string | null;
}) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Native Firebase MFA: when the account has an authenticator app enrolled,
  // signInWithEmailAndPassword throws auth/multi-factor-auth-required and
  // hands back a resolver. The password was correct; we now need the code.
  // Firebase itself refuses to issue a token until it is supplied — this is
  // what makes it unbypassable, unlike the legacy email-code flag.
  const [totpChallenge, setTotpChallenge] = useState<TotpChallenge | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [appName] = useState(initialAppName);

  // Firebase's action handler sends the member here after confirming their
  // address (see generateEmailVerificationLink's continueUrl). It's nearly
  // always the default browser rather than the PWA they signed up in, so
  // there's no session and they land on a plain login form with no sign
  // anything happened — which reads as "the link didn't work". Read from
  // window rather than useSearchParams to keep this page off a Suspense
  // boundary it doesn't otherwise need.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('verified') === '1') {
      toast.success('Email confirmed. Sign in to start your trial.', { duration: 6000 });
    } else if (params.get('emailChanged') === '1') {
      // Changing an address through the Admin SDK invalidates the session, so
      // the member arrives here signed out. Landing on a bare login form with
      // no explanation reads as "something went wrong" — it didn't.
      toast.success(
        params.get('code') === '0'
          ? 'Email updated. Sign in with your new address, then tap “Send code”.'
          : 'Email updated. Sign in with your new address — your code is on its way.',
        { duration: 8000 },
      );
    } else {
      return;
    }
    // Drop the param so a refresh doesn't repeat the toast.
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    console.log('[Login] Sign-in requested');
    setLoading(true);
    try {
      console.log('[Login] Calling signIn...');
      let user: User;
      try {
        user = await signIn(data.email, data.password);
      } catch (signInErr) {
        if (isMfaRequiredError(signInErr)) {
          const challenge = totpChallengeFrom(signInErr);
          if (!challenge) {
            toast.error('This account requires a second factor this app does not support.', { duration: 8000 });
            return;
          }
          setTotpChallenge(challenge);
          return; // the code form below takes over; finishTotp() completes sign-in
        }
        throw signInErr;
      }
      await afterSignIn(user);
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      console.error('[Login] Sign-in FAILED:', {
        code: e?.code,
        message: e?.message,
        stack: e?.stack,
      });
      // Show the real Firebase error code + message — never hide it
      const display = e?.code
        ? `${e.code}: ${e.message}`
        : (e?.message || String(err));
      toast.error(display, { duration: 8000 });
    } finally {
      setLoading(false);
    }
  };

  const finishTotp = async () => {
    if (!totpChallenge) return;
    if (!/^\d{6}$/.test(totpCode.replace(/\s+/g, ''))) { toast.error('Enter the 6-digit code from your app.'); return; }
    setLoading(true);
    try {
      const user = await resolveTotpSignIn(totpChallenge, totpCode);
      setTotpChallenge(null);
      setTotpCode('');
      await afterSignIn(user);
    } catch (err) {
      toast.error(mfaErrorMessage(err), { duration: 7000 });
    } finally {
      setLoading(false);
    }
  };

  // Everything that used to follow signIn() — the legacy email-code check
  // and the dashboard redirect — unchanged, just callable from both paths.
  const afterSignIn = async (user: User) => {
    try {
      console.log('[Login] signIn succeeded — checking 2FA status');
      // Ask the server whether this account needs a code — either it
      // doesn't have 2FA on at all, or this exact browser was already
      // remembered from a previous verification. Either way skips straight
      // to the dashboard; otherwise a code has just been emailed and the
      // verify screen takes over.
      let twoFaCheckFailed = false;
      try {
        const idToken = await user.getIdToken();
        const trusted = getTrustedDevice(user.uid);
        const res = await fetch('/api/auth/2fa/login-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify(trusted ?? {}),
        });
        const body = await res.json().catch(() => ({}));
        // login-check just set (or cleared) this account's tfaPending
        // custom claim server-side — force-refreshing here picks that up
        // before the next Firestore call, which is what actually enforces
        // 2FA (see firestore.rules' notTfaPending()), not just this redirect.
        await user.getIdToken(true).catch(() => {});
        if (res.ok && body.required) {
          router.replace('/verify-2fa');
          return;
        }
        // A non-ok response means we do NOT know whether this account
        // needed a code — login-check sets the tfaPending claim as its last
        // step, so an error anywhere before that leaves 2FA silently
        // skipped with no pending marker for AppLayout to catch either.
        if (!res.ok) twoFaCheckFailed = true;
      } catch (twoFaErr) {
        console.error('[Login] 2FA check failed:', twoFaErr);
        twoFaCheckFailed = true;
      }

      // Failing OPEN here defeated the whole feature: any transient error in
      // the 2FA check handed out a fully-authenticated session with no code
      // ever requested. Fail closed instead — but only for accounts that
      // actually have 2FA enabled, so an outage in this check can't lock out
      // the entire (mostly non-2FA) user base. If we can't even read the
      // profile to tell, assume the stricter case.
      if (twoFaCheckFailed) {
        let requires2fa = true;
        try {
          const snap = await getUserDoc(user.uid) as { twoFactorEnabled?: boolean } | null;
          requires2fa = snap?.twoFactorEnabled === true;
        } catch {
          // Couldn't determine — treat as protected rather than waving through.
        }
        if (requires2fa) {
          await signOut().catch(() => {});
          toast.error("We couldn't send your two-factor code. Please try signing in again.", { duration: 8000 });
          return;
        }
      }
      console.log('[Login] navigating to /dashboard');
      router.replace('/dashboard');
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      console.error('[Login] Sign-in FAILED:', {
        code: e?.code,
        message: e?.message,
        stack: e?.stack,
      });
      // Show the real Firebase error code + message — never hide it
      const display = e?.code
        ? `${e.code}: ${e.message}`
        : (e?.message || String(err));
      toast.error(display, { duration: 8000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Logo — links back to the public homepage. Same animated brand-mark
          video as the landing page hero (logo emerging through smoke into
          flame), at the same size — muted/looped/inline so it autoplays
          everywhere including iOS Safari, same as there. */}
      <Link href="/" className="flex flex-col items-center mb-8">
        <div className="relative w-32 h-32 mb-4">
          <video
            className="relative w-full h-full rounded-2xl object-cover shadow-glow-accent"
            src="/videos/hero-logo.mp4"
            poster="/videos/hero-logo-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
          />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">{appName}</h1>
        <p className="text-text-secondary text-sm mt-1">Welcome back</p>
      </Link>

      <Card glass className="p-6">
        {totpChallenge ? (
          <form onSubmit={(e) => { e.preventDefault(); finishTotp(); }} className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">Enter your authenticator code</h2>
              <p className="text-sm text-text-secondary mt-1">Open your authenticator app and enter the 6-digit code for {appName}.</p>
            </div>
            <label className="block">
              <span className="text-xs text-text-tertiary">6-digit code</span>
              <input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={7}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white text-xl font-bold tracking-[0.3em] text-center focus:outline-none focus:border-accent/50"
                placeholder="000000"
              />
            </label>
            <Button type="submit" fullWidth loading={loading} size="lg" disabled={totpCode.replace(/\s+/g, '').length !== 6}>
              Verify
            </Button>
            <button type="button" onClick={() => { setTotpChallenge(null); setTotpCode(''); }} className="w-full text-xs text-text-secondary hover:text-white">
              Use a different account
            </button>
          </form>
        ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            leftIcon={<Mail className="w-4 h-4" />}
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            leftIcon={<Lock className="w-4 h-4" />}
            rightIcon={
              <button type="button" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
            error={errors.password?.message}
            {...register('password')}
          />

          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-xs text-accent hover:underline">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" fullWidth loading={loading} size="lg">
            Sign In
          </Button>
        </form>
        )}
      </Card>

      <p className="text-center text-sm text-text-secondary mt-6">
        New here?{' '}
        <Link href="/onboarding" className="text-accent font-medium hover:underline">
          Create account
        </Link>
      </p>
    </motion.div>
  );
}
