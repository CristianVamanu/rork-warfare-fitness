'use client';

import { useState } from 'react';
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
  const [appName] = useState(initialAppName);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    console.log('[Login] Sign-in requested for:', data.email);
    setLoading(true);
    try {
      console.log('[Login] Calling signIn...');
      const user = await signIn(data.email, data.password);
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
