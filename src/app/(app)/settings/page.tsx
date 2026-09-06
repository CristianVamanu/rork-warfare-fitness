'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { LogOut, ChevronRight, Scale, Bell, Shield, Info, LayoutDashboard, BellOff, Download, Trash2, Cookie, ShieldCheck, Smartphone } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { getIdToken } from 'firebase/auth';
import { signOut } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { updateUserDoc, getSystemConfig } from '@/lib/firestore';
import { subscribeToPush, unsubscribeFromPush, getCurrentSubscription } from '@/lib/pushNotifications';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TotpEnrollModal } from '@/components/ui/TotpEnrollModal';
import { hasTotp, reauthenticate, unenrolTotp, mfaErrorMessage } from '@/lib/mfa';
import { getStoredConsent, resetCookieConsent, COOKIE_CONSENT_EVENT } from '@/components/ui/CookieConsent';

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  const [signOutModal, setSignOutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [updatingUnit, setUpdatingUnit] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [exportingData, setExportingData] = useState(false);
  const [deleteAccountModal, setDeleteAccountModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [cookieChoice, setCookieChoice] = useState<'accepted' | 'rejected' | null>(null);
  const [updating2FA, setUpdating2FA] = useState(false);
  const [twoFAEmailModal, setTwoFAEmailModal] = useState(false);
  const [twoFAEmailInput, setTwoFAEmailInput] = useState('');
  const [saving2FAEmail, setSaving2FAEmail] = useState(false);
  const [totpModal, setTotpModal] = useState(false);
  const [totpOffModal, setTotpOffModal] = useState(false);
  const [totpOffPassword, setTotpOffPassword] = useState('');
  const [totpBusy, setTotpBusy] = useState(false);
  // multiFactor(user).enrolledFactors is a plain property, not reactive —
  // bump this after enrol/unenrol so the row re-reads it.
  const [totpVersion, setTotpVersion] = useState(0);
  const totpOn = !!user && hasTotp(user) && totpVersion >= 0;
  const [appName, setAppName] = useState('Warfare Fitness');
  useEffect(() => { getSystemConfig().then((c) => { if (c?.appName) setAppName(String(c.appName)); }).catch(() => {}); }, []);

  // Enrolling an authenticator makes the legacy email-code 2FA redundant —
  // Firebase now enforces the second factor at token issuance. Turn the old
  // flag off so the user isn't asked for two different second factors.
  const retireLegacyEmail2fa = async () => {
    if (!user || !profile?.twoFactorEnabled) return;
    try {
      const token = await getIdToken(user);
      await fetch('/api/auth/2fa/settings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
      await refreshProfile();
    } catch { /* non-fatal — the legacy check is harmless alongside TOTP */ }
  };

  const turnOffTotp = async () => {
    if (!user) return;
    setTotpBusy(true);
    try {
      await reauthenticate(user, totpOffPassword);
      await unenrolTotp(user);
      await user.reload();
      setTotpVersion((v) => v + 1);
      setTotpOffModal(false);
      setTotpOffPassword('');
      toast.success('Authenticator app turned off');
    } catch (err) {
      toast.error(mfaErrorMessage(err), { duration: 7000 });
    } finally {
      setTotpBusy(false);
    }
  };

  useEffect(() => {
    setCookieChoice(getStoredConsent());
    const onChange = () => setCookieChoice(getStoredConsent());
    window.addEventListener(COOKIE_CONSENT_EVENT, onChange);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onChange);
  }, []);
  const cookieChoiceLabel = cookieChoice === 'accepted' ? 'Accepted' : cookieChoice === 'rejected' ? 'Rejected' : 'Not set';

  useEffect(() => {
    getCurrentSubscription().then(sub => setPushSubscribed(!!sub));
    getSystemConfig().then(cfg => {
      // Two supported places, and the client could only see one of them.
      // Admin → Integrations writes the key into system/secrets (which
      // firestore.rules correctly hides from clients) and mirrors it to
      // system/config — but an operator who set VAPID in .env.production
      // instead never triggers that mirror, so system/config stayed empty
      // and every user saw "push notifications are not set up yet" while the
      // server was perfectly configured. NEXT_PUBLIC_ vars are inlined into
      // the client bundle at build time, so reading it here costs nothing
      // and covers the env-var case.
      const envKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      const configured = (cfg?.vapidPublicKey as string | undefined) || envKey;
      if (configured) setVapidKey(configured);
    }).catch(() => {});
  }, []);

  async function handlePushToggle() {
    if (!user) return;
    setPushLoading(true);
    try {
      if (pushSubscribed) {
        await unsubscribeFromPush(user.uid);
        setPushSubscribed(false);
        toast.success('Push notifications disabled');
      } else {
        if (!vapidKey) {
          toast.error('Push notifications are not set up yet — add a VAPID public key in Admin → Integrations.', { duration: 8000 });
          return;
        }
        if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
          // Distinguishing this matters: once denied, the browser will never
          // re-prompt, so "try again" is useless advice.
          toast.error('Notifications are blocked for this site. Enable them in your browser settings, then try again.', { duration: 9000 });
          return;
        }
        const ok = await subscribeToPush(user.uid, vapidKey);
        if (ok) { setPushSubscribed(true); toast.success('Push notifications enabled!'); }
        else toast.error('Could not enable push on this device. Check that notifications are allowed for this site.', { duration: 8000 });
      }
    } catch { toast.error('Failed to update push settings'); }
    finally { setPushLoading(false); }
  }

  const handleExportData = async () => {
    if (!user) return;
    setExportingData(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/account/export', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `warfare-fitness-data-${user.uid}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Your data has been downloaded');
    } catch {
      toast.error('Failed to export your data');
    } finally {
      setExportingData(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmText !== 'DELETE') return;
    setDeletingAccount(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Your account has been deleted');
      await signOut();
      router.replace('/login');
    } catch {
      toast.error('Failed to delete your account — please try again or contact support');
      setDeletingAccount(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace('/login');
    } catch {
      toast.error('Failed to sign out');
      setSigningOut(false);
    }
  };

  const toggleWeightUnit = async () => {
    if (!user) return;
    setUpdatingUnit(true);
    const newUnit = profile?.weightUnit === 'kg' ? 'lbs' : 'kg';
    try {
      await updateUserDoc(user.uid, { weightUnit: newUnit });
      await refreshProfile();
      toast.success(`Weight unit changed to ${newUnit}`);
    } catch {
      toast.error('Failed to update');
    } finally {
      setUpdatingUnit(false);
    }
  };

  const toggle2FA = async () => {
    if (!user) return;
    setUpdating2FA(true);
    const enabling = !profile?.twoFactorEnabled;
    try {
      // twoFactorEnabled/twoFactorEmail are no longer plain client writes
      // (see firestore.rules) — this route also emails the account owner
      // whenever either changes, so a hijacked session can't silently
      // disable 2FA without the real owner finding out.
      const token = await getIdToken(user);
      const res = await fetch('/api/auth/2fa/settings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enabling }),
      });
      if (!res.ok) throw new Error();
      await refreshProfile();
      toast.success(enabling ? 'Two-factor authentication enabled' : 'Two-factor authentication disabled');
    } catch {
      toast.error('Failed to update');
    } finally {
      setUpdating2FA(false);
    }
  };

  const saveTwoFAEmail = async () => {
    if (!user) return;
    const trimmed = twoFAEmailInput.trim();
    if (trimmed && !/^\S+@\S+\.\S+$/.test(trimmed)) {
      toast.error('Enter a valid email address');
      return;
    }
    setSaving2FAEmail(true);
    try {
      // Empty input clears the override, falling back to the account's
      // login email again — not every user needs a separate address.
      const token = await getIdToken(user);
      const res = await fetch('/api/auth/2fa/settings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed || null }),
      });
      if (!res.ok) throw new Error();
      await refreshProfile();
      setTwoFAEmailModal(false);
      toast.success('2FA notification email updated');
    } catch {
      toast.error('Failed to update');
    } finally {
      setSaving2FAEmail(false);
    }
  };

  const sections = [
    {
      title: 'Security',
      items: [
        {
          icon: Smartphone,
          label: 'Authenticator App (recommended)',
          description: totpOn
            ? 'On — sign-in needs a code from your authenticator app'
            : 'Off — Google Authenticator, Authy, 1Password or any TOTP app',
          action: () => (totpOn ? setTotpOffModal(true) : setTotpModal(true)),
          rightLabel: totpOn ? 'Turn off' : 'Set up',
        },
        // Legacy email-code 2FA. Kept only for accounts that already have it
        // on, so nobody loses a second factor silently; no new enrolments —
        // it is superseded by the authenticator app above, which Firebase
        // enforces at token issuance rather than in app code.
        ...(profile?.twoFactorEnabled ? [{
          icon: ShieldCheck,
          label: 'Email Codes (legacy)',
          description: totpOn
            ? 'Redundant now that your authenticator app is on — you can turn this off'
            : 'On — a code is emailed to you at login. Switch to the authenticator app above.',
          action: toggle2FA,
          rightLabel: updating2FA ? '...' : 'Turn off',
        }, {
          icon: Bell,
          label: 'Email Code Address',
          description: profile?.twoFactorEmail
            ? `Codes go to ${profile.twoFactorEmail}`
            : `Codes go to your login email (${user?.email || 'not set'})`,
          action: () => { setTwoFAEmailInput(profile?.twoFactorEmail || ''); setTwoFAEmailModal(true); },
          rightLabel: 'Change',
        }] : []),
      ],
    },
    {
      title: 'Preferences',
      items: [
        {
          icon: Scale,
          label: 'Weight Unit',
          description: `Currently: ${profile?.weightUnit || 'kg'}`,
          action: toggleWeightUnit,
          rightLabel: profile?.weightUnit === 'kg' ? 'Switch to lbs' : 'Switch to kg',
        },
      ],
    },
    {
      title: 'Account',
      items: [
        {
          icon: Info,
          label: 'Email',
          description: user?.email || '',
          action: null,
          rightLabel: '',
        },
        {
          icon: Shield,
          label: 'Role',
          description: `Your account type: ${profile?.role || 'user'}`,
          action: null,
          rightLabel: '',
        },
      ],
    },
    {
      title: 'App',
      items: [
        {
          icon: Info,
          label: 'Version',
          description: 'Warfare Fitness PWA',
          action: null,
          rightLabel: `v${process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0'}`,
        },
      ],
    },
  ];

  return (
    <div>
      <Header title="Settings" />
      <div className="px-4 py-4 space-y-5">
        {sections.map(({ title, items }) => (
          <motion.div key={title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2 px-1">{title}</h2>
            <Card className="overflow-hidden">
              {items.map(({ icon: Icon, label, description, action, rightLabel }, i) => (
                <button
                  key={label}
                  onClick={action || undefined}
                  disabled={!action}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors text-left ${
                    i < items.length - 1 ? 'border-b border-white/8' : ''
                  } ${!action ? 'cursor-default' : ''}`}
                >
                  <div className="p-2 bg-surface-elevated rounded-lg">
                    <Icon className="w-4 h-4 text-text-secondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{label}</p>
                    <p className="text-xs text-text-secondary truncate">{description}</p>
                  </div>
                  {action ? (
                    <div className="flex items-center gap-1 text-xs text-accent">
                      {rightLabel}
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  ) : rightLabel ? (
                    <span className="text-xs text-text-tertiary">{rightLabel}</span>
                  ) : null}
                </button>
              ))}
            </Card>
          </motion.div>
        ))}

        {/* Push Notifications */}
        {'Notification' in window || true ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2 px-1">Notifications</h2>
            <Card className="flex items-center gap-3 px-4 py-3.5">
              <div className="p-2 bg-surface-elevated rounded-lg">
                {pushSubscribed ? <Bell className="w-4 h-4 text-accent" /> : <BellOff className="w-4 h-4 text-text-secondary" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Push Notifications</p>
                <p className="text-xs text-text-secondary">{pushSubscribed ? 'Enabled — you will receive alerts' : 'Disabled — tap to enable'}</p>
              </div>
              <button
                onClick={handlePushToggle}
                disabled={pushLoading}
                className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${pushSubscribed ? 'bg-accent' : 'bg-surface-elevated'}`}
              >
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${pushSubscribed ? 'left-6' : 'left-1'}`} />
              </button>
            </Card>
          </motion.div>
        ) : null}

        {/* Privacy & Data — self-service GDPR export/delete */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2 px-1">Privacy &amp; Data</h2>
          <Card className="overflow-hidden">
            <button
              onClick={handleExportData}
              disabled={exportingData}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors text-left border-b border-white/8"
            >
              <div className="p-2 bg-surface-elevated rounded-lg">
                <Download className="w-4 h-4 text-text-secondary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">Export My Data</p>
                <p className="text-xs text-text-secondary">Download everything we have on your account as a file</p>
              </div>
              {exportingData && <span className="text-xs text-text-tertiary">Preparing…</span>}
            </button>
            <button
              onClick={() => setDeleteAccountModal(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-danger/5 transition-colors text-left border-b border-white/8"
            >
              <div className="p-2 bg-danger/10 rounded-lg">
                <Trash2 className="w-4 h-4 text-danger" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-danger">Delete My Account</p>
                <p className="text-xs text-text-secondary">Permanently erase your account and all your data</p>
              </div>
            </button>
            <button
              onClick={() => { resetCookieConsent(); toast.success('Cookie banner will show again — refresh or navigate to see it.'); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors text-left"
            >
              <div className="p-2 bg-surface-elevated rounded-lg">
                <Cookie className="w-4 h-4 text-text-secondary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">Manage Cookies</p>
                <p className="text-xs text-text-secondary">Change your cookie preference (currently: {cookieChoiceLabel})</p>
              </div>
            </button>
          </Card>
        </motion.div>

        {/* Admin Panel link — only visible to admins */}
        {profile?.role === 'admin' && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <Link href="/admin">
              <Card className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors border-danger/30">
                <div className="p-2 bg-danger/10 rounded-lg">
                  <LayoutDashboard className="w-4 h-4 text-danger" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Admin Panel</p>
                  <p className="text-xs text-text-secondary">Manage users, programs & platform</p>
                </div>
                <ChevronRight className="w-4 h-4 text-danger" />
              </Card>
            </Link>
          </motion.div>
        )}

        {/* Sign Out */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Button
            variant="danger"
            fullWidth
            size="lg"
            onClick={() => setSignOutModal(true)}
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </Button>
        </motion.div>

        <p className="text-center text-xs text-text-tertiary pb-4">
          Warfare Fitness · Built with ❤️ for athletes
        </p>
      </div>

      <TotpEnrollModal
        open={totpModal}
        onClose={() => { setTotpModal(false); setTotpVersion((v) => v + 1); }}
        appName={appName}
        onEnrolled={async () => { setTotpVersion((v) => v + 1); await retireLegacyEmail2fa(); }}
      />
      <Modal open={totpOffModal} onClose={() => !totpBusy && setTotpOffModal(false)} title="Turn off authenticator app?">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">Your account will go back to password-only sign-in. Confirm your password to continue.</p>
          <input
            type="password"
            autoComplete="current-password"
            value={totpOffPassword}
            onChange={(e) => setTotpOffPassword(e.target.value)}
            className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white text-base focus:outline-none focus:border-accent/50"
            placeholder="Password"
          />
          <div className="flex gap-2">
            <Button fullWidth variant="ghost" onClick={() => setTotpOffModal(false)} disabled={totpBusy}>Cancel</Button>
            <Button fullWidth variant="danger" onClick={turnOffTotp} loading={totpBusy} disabled={!totpOffPassword}>Turn off</Button>
          </div>
        </div>
      </Modal>
      <Modal open={signOutModal} onClose={() => setSignOutModal(false)} title="Sign Out?">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">Are you sure you want to sign out?</p>
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={() => setSignOutModal(false)}>Cancel</Button>
            <Button variant="danger" fullWidth loading={signingOut} onClick={handleSignOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={twoFAEmailModal} onClose={() => setTwoFAEmailModal(false)} title="2FA Notification Email">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Sign-in codes go here instead of your account&apos;s login email. Leave blank to use your login email again.
          </p>
          <input
            type="email"
            value={twoFAEmailInput}
            onChange={(e) => setTwoFAEmailInput(e.target.value)}
            placeholder={user?.email || 'you@example.com'}
            className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
          />
          <Button fullWidth loading={saving2FAEmail} onClick={saveTwoFAEmail}>Save</Button>
        </div>
      </Modal>

      <Modal open={deleteAccountModal} onClose={() => { setDeleteAccountModal(false); setDeleteConfirmText(''); }} title="Delete Your Account?">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            This permanently deletes your account, every workout, meal, weight entry, message, and photo you've logged, and cannot be undone.
          </p>
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Type <span className="font-bold text-white">DELETE</span> to confirm</label>
            <input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-danger/50"
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={() => { setDeleteAccountModal(false); setDeleteConfirmText(''); }}>Cancel</Button>
            <Button
              variant="danger"
              fullWidth
              loading={deletingAccount}
              disabled={deleteConfirmText !== 'DELETE'}
              onClick={handleDeleteAccount}
            >
              Delete Forever
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
