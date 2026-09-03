'use client';

import { useState } from 'react';
import { MailCheck, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { resendVerificationEmail } from '@/lib/auth';
import { Button } from './Button';
import { Card } from './Card';

// Shown wherever an unverified address is the reason something is gated.
// Two shapes: a slim banner mounted once in the app layout (always visible
// while unverified, never blocks anything), and a full card MembershipGuard
// renders in place of trial content. Both offer the same two actions —
// resend the link, or "I've verified" which reloads the Firebase user so the
// fresh emailVerified flag is picked up without signing out and back in.
export function VerifyEmailNotice({ variant = 'banner' }: { variant?: 'banner' | 'screen' }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<'resend' | 'check' | null>(null);

  if (!user || user.emailVerified) return null;

  const resend = async () => {
    setBusy('resend');
    try {
      await resendVerificationEmail();
      toast.success(`Verification email sent to ${user.email}`);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      toast.error(code === 'auth/too-many-requests'
        ? 'Too many requests — wait a few minutes and try again.'
        : 'Could not send the email. Try again shortly.');
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    setBusy('check');
    try {
      await user.reload();
      // Force a fresh ID token so server gates (which read email_verified
      // off the token) see the change on the very next request.
      await user.getIdToken(true);
      if (user.emailVerified) {
        toast.success('Email verified');
        // AuthContext holds the same User object; a reload of the page is the
        // simplest way to make every consumer re-read emailVerified.
        window.location.reload();
      } else {
        toast('Not verified yet — open the link in the email first.', { icon: '✉️' });
      }
    } finally {
      setBusy(null);
    }
  };

  if (variant === 'screen') {
    return (
      <div className="px-4 pt-10 max-w-lg mx-auto">
        <Card className="p-6 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center">
            <MailCheck className="w-6 h-6 text-accent" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-black text-white">Verify your email to start</h2>
          <p className="text-sm text-text-secondary">
            We sent a link to <span className="text-white font-medium">{user.email}</span>. Open it, then come back here — your trial starts the moment it&apos;s confirmed.
          </p>
          <div className="flex flex-col gap-2">
            <Button fullWidth onClick={check} loading={busy === 'check'}>
              <RefreshCw className="w-4 h-4" aria-hidden="true" /> I&apos;ve verified
            </Button>
            <Button fullWidth variant="ghost" onClick={resend} loading={busy === 'resend'}>Resend email</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div role="status" className="mx-4 mt-3 max-w-lg md:max-w-2xl lg:max-w-4xl lg:mx-auto flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-text-secondary">
      <MailCheck className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
      <span className="flex-1">Verify <span className="text-white">{user.email}</span> to unlock your trial.</span>
      <button type="button" onClick={resend} disabled={busy !== null} className="font-semibold text-accent hover:underline disabled:opacity-50">Resend</button>
      <span aria-hidden="true">·</span>
      <button type="button" onClick={check} disabled={busy !== null} className="font-semibold text-accent hover:underline disabled:opacity-50">I&apos;ve verified</button>
    </div>
  );
}
