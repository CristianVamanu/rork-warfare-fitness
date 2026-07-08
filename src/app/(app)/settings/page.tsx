'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { LogOut, ChevronRight, Scale, Bell, Shield, Info, LayoutDashboard, BellOff, Globe } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { signOut } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { updateUserDoc, getSystemConfig } from '@/lib/firestore';
import { subscribeToPush, unsubscribeFromPush, getCurrentSubscription } from '@/lib/pushNotifications';
import { useLanguage, LANGUAGE_LABELS, type Language } from '@/contexts/LanguageContext';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const [signOutModal, setSignOutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [updatingUnit, setUpdatingUnit] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [languageModal, setLanguageModal] = useState(false);

  useEffect(() => {
    getCurrentSubscription().then(sub => setPushSubscribed(!!sub));
    getSystemConfig().then(cfg => {
      if (cfg?.vapidPublicKey) setVapidKey(cfg.vapidPublicKey as string);
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
          toast.error('Push notifications not configured by your trainer yet.');
          return;
        }
        const ok = await subscribeToPush(user.uid, vapidKey);
        if (ok) { setPushSubscribed(true); toast.success('Push notifications enabled!'); }
        else toast.error('Permission denied or not supported on this device.');
      }
    } catch { toast.error('Failed to update push settings'); }
    finally { setPushLoading(false); }
  }

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

  const sections = [
    {
      title: t('settings.section.preferences'),
      items: [
        {
          icon: Scale,
          label: t('settings.weightUnit'),
          description: t('settings.weightUnit.current', { unit: profile?.weightUnit || 'kg' }),
          action: toggleWeightUnit,
          rightLabel: t('settings.weightUnit.switchTo', { unit: profile?.weightUnit === 'kg' ? 'lbs' : 'kg' }),
        },
        {
          icon: Globe,
          label: t('settings.language'),
          description: t('settings.language.description', { language: LANGUAGE_LABELS[language] }),
          action: () => setLanguageModal(true),
          rightLabel: t('settings.language.change'),
        },
      ],
    },
    {
      title: t('settings.section.account'),
      items: [
        {
          icon: Info,
          label: t('settings.email'),
          description: user?.email || '',
          action: null,
          rightLabel: '',
        },
        {
          icon: Shield,
          label: t('settings.role'),
          description: t('settings.role.description', { role: profile?.role || 'user' }),
          action: null,
          rightLabel: '',
        },
      ],
    },
    {
      title: t('settings.section.app'),
      items: [
        {
          icon: Info,
          label: t('settings.version'),
          description: 'Warfare Fitness PWA',
          action: null,
          rightLabel: 'v1.0.0',
        },
      ],
    },
  ];

  return (
    <div>
      <Header title={t('settings.title')} />
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
            <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2 px-1">{t('settings.section.notifications')}</h2>
            <Card className="flex items-center gap-3 px-4 py-3.5">
              <div className="p-2 bg-surface-elevated rounded-lg">
                {pushSubscribed ? <Bell className="w-4 h-4 text-accent" /> : <BellOff className="w-4 h-4 text-text-secondary" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{t('settings.pushNotifications')}</p>
                <p className="text-xs text-text-secondary">{pushSubscribed ? t('settings.pushNotifications.enabled') : t('settings.pushNotifications.disabled')}</p>
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

        {/* Admin Panel link — only visible to admins */}
        {profile?.role === 'admin' && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <Link href="/admin">
              <Card className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors border-danger/30">
                <div className="p-2 bg-danger/10 rounded-lg">
                  <LayoutDashboard className="w-4 h-4 text-danger" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{t('settings.adminPanel')}</p>
                  <p className="text-xs text-text-secondary">{t('settings.adminPanel.description')}</p>
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
            <LogOut className="w-4 h-4" /> {t('settings.signOut')}
          </Button>
        </motion.div>

        <p className="text-center text-xs text-text-tertiary pb-4">
          Warfare Fitness · {t('settings.footer')}
        </p>
      </div>

      <Modal open={signOutModal} onClose={() => setSignOutModal(false)} title={t('settings.signOut.confirmTitle')}>
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">{t('settings.signOut.confirmBody')}</p>
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={() => setSignOutModal(false)}>{t('settings.cancel')}</Button>
            <Button variant="danger" fullWidth loading={signingOut} onClick={handleSignOut}>
              {t('settings.signOut')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={languageModal} onClose={() => setLanguageModal(false)} title={t('settings.language')}>
        <div className="space-y-2">
          {(Object.keys(LANGUAGE_LABELS) as Language[]).map((lang) => (
            <button
              key={lang}
              onClick={() => { setLanguage(lang); setLanguageModal(false); }}
              className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-colors ${
                language === lang ? 'border-accent bg-accent/5' : 'border-white/10 bg-surface hover:border-white/20'
              }`}
            >
              <span className="text-sm font-medium text-white">{LANGUAGE_LABELS[lang]}</span>
              {language === lang && <ChevronRight className="w-4 h-4 text-accent" />}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
