'use client';
export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { signOut } from '@/lib/auth';
import { setTrustedDevice } from '@/lib/twoFactor';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

const RESEND_COOLDOWN_SECONDS = 30;

export default function Verify2FAPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleVerify() {
    if (!user || code.trim().length !== 6) return;
    setVerifying(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ code: code.trim(), remember }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Verification failed');
      if (remember && body.deviceId && body.token) {
        setTrustedDevice(user.uid, { deviceId: body.deviceId, token: body.token });
      }
      // AuthContext's live profile subscription picks up the cleared
      // twoFactorPendingSince on its own, but navigating immediately avoids
      // sitting on this screen for a snapshot round-trip.
      router.replace('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (!user || cooldown > 0) return;
    setResending(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/auth/2fa/login-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed to resend code');
      toast.success('New code sent');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      toast.error('Failed to resend code — try again in a moment');
    } finally {
      setResending(false);
    }
  }

  async function handleCancel() {
    await signOut().catch(() => {});
    router.replace('/login');
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-accent-muted flex items-center justify-center mb-5">
        <ShieldCheck className="w-8 h-8 text-accent" />
      </div>
      <h1 className="text-2xl font-black text-white mb-2">Check your email</h1>
      <p className="text-text-secondary text-sm max-w-xs mb-6">
        We sent a 6-digit code to {user?.email || 'your email'}. It expires in 10 minutes.
      </p>

      <Card glass className="p-6 w-full max-w-xs space-y-4">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
          placeholder="••••••"
          className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white text-2xl font-black tracking-[0.4em] text-center focus:outline-none focus:border-accent/50"
        />

        <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="w-4 h-4 rounded accent-accent"
          />
          Remember this device for 30 days
        </label>

        <Button fullWidth size="lg" loading={verifying} disabled={code.length !== 6} onClick={handleVerify}>
          Verify
        </Button>

        <button
          onClick={handleResend}
          disabled={resending || cooldown > 0}
          className="text-xs text-accent hover:underline disabled:opacity-40 disabled:no-underline"
        >
          {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
        </button>
      </Card>

      <button onClick={handleCancel} className="text-xs text-text-tertiary hover:text-white mt-6 transition-colors">
        Cancel and sign out
      </button>
    </div>
  );
}
