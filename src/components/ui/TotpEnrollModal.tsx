'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { Copy, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { reauthenticate, startTotpEnrolment, finishTotpEnrolment, mfaErrorMessage, type TotpEnrolment } from '@/lib/mfa';
import { Modal } from './Modal';
import { Button } from './Button';

interface Props {
  open: boolean;
  onClose: () => void;
  appName: string;
  /** Called after a successful enrolment (e.g. to refresh UI / retire legacy 2FA). */
  onEnrolled?: () => void | Promise<void>;
}

type Step = 'password' | 'scan' | 'done';

// Three steps, in the order Firebase requires them: confirm password
// (enrolment needs a recent sign-in), scan the QR / copy the key, then
// confirm with one code so a mistyped secret can never lock the account.
export function TotpEnrollModal({ open, onClose, appName, onEnrolled }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('password');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [enrolment, setEnrolment] = useState<TotpEnrolment | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep('password'); setPassword(''); setCode(''); setEnrolment(null); setQrDataUrl(null); setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!enrolment) return;
    QRCode.toDataURL(enrolment.otpauthUri, { margin: 1, width: 220, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [enrolment]);

  const begin = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await reauthenticate(user, password);
      const e = await startTotpEnrolment(user, appName);
      setEnrolment(e);
      setStep('scan');
    } catch (err) {
      toast.error(mfaErrorMessage(err), { duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!user || !enrolment) return;
    if (!/^\d{6}$/.test(code.replace(/\s+/g, ''))) { toast.error('Enter the 6-digit code from your app.'); return; }
    setBusy(true);
    try {
      await finishTotpEnrolment(user, enrolment, code);
      setStep('done');
      await onEnrolled?.();
    } catch (err) {
      toast.error(mfaErrorMessage(err), { duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  const copyKey = async () => {
    if (!enrolment) return;
    try { await navigator.clipboard.writeText(enrolment.secretKey); toast.success('Key copied'); }
    catch { toast.error('Could not copy — select the key and copy it manually.'); }
  };

  const inputCls = 'w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white text-base focus:outline-none focus:border-accent/50';

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="Set up authenticator app">
      {step === 'password' && (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Use Google Authenticator, Authy, 1Password or any authenticator app. First, confirm your password.
          </p>
          <label className="block">
            <span className="text-xs text-text-tertiary">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && password) begin(); }}
              className={inputCls}
            />
          </label>
          <Button fullWidth onClick={begin} loading={busy} disabled={!password}>Continue</Button>
        </div>
      )}

      {step === 'scan' && enrolment && (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">Scan this with your authenticator app, then enter the 6-digit code it shows.</p>
          <div className="flex justify-center">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="QR code for your authenticator app" width={220} height={220} className="rounded-xl bg-white p-2" />
            ) : (
              <div className="w-[220px] h-[220px] rounded-xl bg-white/5 animate-pulse" aria-hidden="true" />
            )}
          </div>
          <div className="rounded-xl border border-white/10 p-3">
            <p className="text-[11px] uppercase tracking-wider text-text-tertiary mb-1">Can&apos;t scan? Enter this key</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-white break-all font-mono">{enrolment.secretKey}</code>
              <button type="button" onClick={copyKey} aria-label="Copy key" className="p-2 rounded-lg text-text-secondary hover:text-white">
                <Copy className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <label className="block">
            <span className="text-xs text-text-tertiary">6-digit code</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirm(); }}
              className={`${inputCls} tracking-[0.3em] text-center text-xl font-bold`}
              placeholder="000000"
            />
          </label>
          <Button fullWidth onClick={confirm} loading={busy} disabled={code.replace(/\s+/g, '').length !== 6}>Turn on</Button>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-4 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-success/10 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-success" aria-hidden="true" />
          </div>
          <h3 className="text-lg font-black text-white">Authenticator app is on</h3>
          <p className="text-sm text-text-secondary">
            From now on, signing in needs your password and a code from your app. A password reset does <em>not</em> bypass this — if you lose the device, contact support to have the authenticator removed from your account.
          </p>
          <Button fullWidth onClick={onClose}>Done</Button>
        </div>
      )}
    </Modal>
  );
}
