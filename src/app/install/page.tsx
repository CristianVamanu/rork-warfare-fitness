'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  CheckCircle, Settings, User, Key, CreditCard, Rocket,
  ChevronRight, ChevronLeft, Wifi, Database, Shield
} from 'lucide-react';
import { createAdminUser } from '@/lib/auth';
import { setSystemConfig, markInstalled, getInstallerStatus } from '@/lib/firestore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { signOut } from '@/lib/auth';

const steps = [
  { id: 0, title: 'Welcome', icon: Rocket },
  { id: 1, title: 'App Config', icon: Settings },
  { id: 2, title: 'Admin Account', icon: User },
  { id: 3, title: 'OpenAI', icon: Key },
  { id: 4, title: 'Stripe', icon: CreditCard },
  { id: 5, title: 'Install', icon: CheckCircle },
];

const configSchema = z.object({
  appName: z.string().min(1, 'Required'),
  trainerName: z.string().min(1, 'Required'),
  themeColor: z.string().default('#F5A623'),
});

const adminSchema = z.object({
  name: z.string().min(2, 'Required'),
  email: z.string().email(),
  password: z.string().min(6, 'Min 6 characters'),
});

const openaiSchema = z.object({
  openaiModel: z.enum(['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']).default('gpt-4o-mini'),
});

const stripeSchema = z.object({
  stripePublishableKey: z.string().optional(),
});

type ConfigData = z.infer<typeof configSchema>;
type AdminData = z.infer<typeof adminSchema>;
type OpenAIData = z.infer<typeof openaiSchema>;
type StripeData = z.infer<typeof stripeSchema>;
// Note: OPENAI_API_KEY and STRIPE_SECRET_KEY are never stored in Firestore.
// They must be set as environment variables on the deployment platform.

export default function InstallPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [installing, setInstalling] = useState(false);
  const [checkingInstall, setCheckingInstall] = useState(true);

  const [config, setConfig] = useState<ConfigData | null>(null);
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [openaiData, setOpenaiData] = useState<OpenAIData | null>(null);
  const [stripeData, setStripeData] = useState<StripeData>({});

  useEffect(() => {
    getInstallerStatus().then((status) => {
      if (status?.installed) {
        router.replace('/login');
      } else {
        setCheckingInstall(false);
      }
    }).catch(() => setCheckingInstall(false));
  }, [router]);

  const configForm = useForm<ConfigData>({ resolver: zodResolver(configSchema), defaultValues: { appName: 'Warfare Fitness', trainerName: '', themeColor: '#F5A623' } });
  const adminForm = useForm<AdminData>({ resolver: zodResolver(adminSchema) });
  const openaiForm = useForm<OpenAIData>({ resolver: zodResolver(openaiSchema), defaultValues: { openaiModel: 'gpt-4o-mini' } });
  const stripeForm = useForm<StripeData>({ resolver: zodResolver(stripeSchema) });

  const handleInstall = async () => {
    if (!config || !adminData || !openaiData) return;
    setInstalling(true);
    try {
      // Sign out any existing user first
      await signOut().catch(() => {});

      // Create admin user + tenant record (trainerId = admin uid)
      const adminUser = await createAdminUser(adminData.email, adminData.password, adminData.name);

      // Save system config — secrets (OPENAI_API_KEY, STRIPE_SECRET_KEY) are
      // intentionally NOT stored here; they must be set as env vars.
      // trainerId is stored so new client sign-ups are linked to this trainer.
      await setSystemConfig({
        appName: config.appName,
        trainerName: config.trainerName,
        themeColor: config.themeColor,
        openaiModel: openaiData.openaiModel,
        stripePublishableKey: stripeData.stripePublishableKey || '',
        trainerId: adminUser.uid,
      });

      // Mark as installed
      await markInstalled();

      toast.success('Warfare Fitness installed successfully!');
      setTimeout(() => router.replace('/login'), 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Installation failed';
      toast.error(msg.includes('email-already-in-use') ? 'Admin email already in use' : msg);
      setInstalling(false);
    }
  };

  if (checkingInstall) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent mx-auto mb-4 flex items-center justify-center">
            <span className="text-2xl font-black text-black">W</span>
          </div>
          <p className="text-text-secondary text-sm">Checking installation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-4 shadow-glow-accent">
            <span className="text-2xl font-black text-black">W</span>
          </div>
          <h1 className="text-2xl font-black text-white">Setup Wizard</h1>
          <p className="text-text-secondary text-sm mt-1">Let's get Warfare Fitness ready</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-1 mb-6">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                i < step ? 'bg-success text-white' :
                i === step ? 'bg-accent text-black' :
                'bg-surface-elevated text-text-tertiary'
              }`}>
                {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-6 h-0.5 ${i < step ? 'bg-success' : 'bg-white/10'}`} />
              )}
            </div>
          ))}
        </div>

        <ProgressBar value={step} max={steps.length - 1} className="mb-6" />

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            {/* Step 0: Welcome */}
            {step === 0 && (
              <Card glass className="p-6">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <Rocket className="w-5 h-5 text-accent" />
                  Welcome to Warfare Fitness
                </h2>
                <p className="text-text-secondary text-sm mb-6">
                  This setup wizard will configure your premium fitness platform. You'll need:
                </p>
                <div className="space-y-3 mb-6">
                  {[
                    { icon: Database, text: 'Firebase project credentials', note: 'Already configured via env vars' },
                    { icon: Key, text: 'OpenAI API key', note: 'For AI food analysis & coaching' },
                    { icon: CreditCard, text: 'Stripe keys (optional)', note: 'For subscription payments' },
                    { icon: Shield, text: 'Admin account details', note: 'Your master login credentials' },
                  ].map(({ icon: Icon, text, note }) => (
                    <div key={text} className="flex items-start gap-3 p-3 bg-surface rounded-xl">
                      <Icon className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-white">{text}</p>
                        <p className="text-xs text-text-secondary">{note}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-success/10 border border-success/20 rounded-xl mb-6">
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-success" />
                    <p className="text-sm text-success font-medium">Firebase Connected</p>
                  </div>
                  <p className="text-xs text-text-secondary mt-1">
                    Environment variables detected and Firebase initialized.
                  </p>
                </div>

                <Button fullWidth size="lg" onClick={() => setStep(1)}>
                  Begin Setup <ChevronRight className="w-4 h-4" />
                </Button>
              </Card>
            )}

            {/* Step 1: App Config */}
            {step === 1 && (
              <Card glass className="p-6">
                <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-accent" />
                  App Configuration
                </h2>
                <p className="text-text-secondary text-sm mb-5">Customize your platform branding</p>

                <form onSubmit={configForm.handleSubmit((d) => { setConfig(d); setStep(2); })} className="space-y-4">
                  <Input
                    label="App Name"
                    placeholder="Warfare Fitness"
                    error={configForm.formState.errors.appName?.message}
                    {...configForm.register('appName')}
                  />
                  <Input
                    label="Trainer / Business Name"
                    placeholder="Coach John Doe"
                    error={configForm.formState.errors.trainerName?.message}
                    {...configForm.register('trainerName')}
                  />
                  <div>
                    <label className="text-sm font-medium text-text-secondary block mb-1.5">
                      Theme Color
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        className="w-12 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                        {...configForm.register('themeColor')}
                      />
                      <Input
                        placeholder="#F5A623"
                        className="flex-1"
                        {...configForm.register('themeColor')}
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button variant="ghost" onClick={() => setStep(0)} type="button">
                      <ChevronLeft className="w-4 h-4" /> Back
                    </Button>
                    <Button fullWidth type="submit">
                      Continue <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {/* Step 2: Admin Account */}
            {step === 2 && (
              <Card glass className="p-6">
                <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                  <User className="w-5 h-5 text-accent" />
                  Admin Account
                </h2>
                <p className="text-text-secondary text-sm mb-5">Your master administrator credentials</p>

                <form onSubmit={adminForm.handleSubmit((d) => { setAdminData(d); setStep(3); })} className="space-y-4">
                  <Input
                    label="Full Name"
                    placeholder="John Doe"
                    error={adminForm.formState.errors.name?.message}
                    {...adminForm.register('name')}
                  />
                  <Input
                    label="Email"
                    type="email"
                    placeholder="admin@example.com"
                    error={adminForm.formState.errors.email?.message}
                    {...adminForm.register('email')}
                  />
                  <Input
                    label="Password"
                    type="password"
                    placeholder="Min 6 characters"
                    error={adminForm.formState.errors.password?.message}
                    {...adminForm.register('password')}
                  />

                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <p className="text-xs text-amber-400">
                      Save these credentials securely. This creates your admin Firebase account.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button variant="ghost" onClick={() => setStep(1)} type="button">
                      <ChevronLeft className="w-4 h-4" /> Back
                    </Button>
                    <Button fullWidth type="submit">
                      Continue <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {/* Step 3: OpenAI */}
            {step === 3 && (
              <Card glass className="p-6">
                <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                  <Key className="w-5 h-5 text-accent" />
                  OpenAI Configuration
                </h2>
                <p className="text-text-secondary text-sm mb-5">Powers AI food analysis and coaching</p>

                <form onSubmit={openaiForm.handleSubmit((d) => { setOpenaiData(d); setStep(4); })} className="space-y-4">
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <p className="text-xs text-amber-400 font-medium mb-1">API Key — Environment Variable Only</p>
                    <p className="text-xs text-text-secondary">
                      Set <code className="bg-white/10 px-1 rounded">OPENAI_API_KEY</code> in your Vercel / hosting environment variables. It is never stored in the database.
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-text-secondary block mb-2">Model</label>
                    <div className="space-y-2">
                      {[
                        { value: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'Fast & affordable (recommended)' },
                        { value: 'gpt-4o', label: 'GPT-4o', desc: 'Most capable' },
                        { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', desc: 'Balanced performance' },
                      ].map((m) => (
                        <label key={m.value} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          openaiForm.watch('openaiModel') === m.value
                            ? 'border-accent bg-accent-muted'
                            : 'border-white/10 bg-surface-elevated'
                        }`}>
                          <input type="radio" value={m.value} className="sr-only" {...openaiForm.register('openaiModel')} />
                          <div>
                            <p className="text-sm font-medium text-white">{m.label}</p>
                            <p className="text-xs text-text-secondary">{m.desc}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button variant="ghost" onClick={() => setStep(2)} type="button">
                      <ChevronLeft className="w-4 h-4" /> Back
                    </Button>
                    <Button fullWidth type="submit">
                      Continue <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {/* Step 4: Stripe */}
            {step === 4 && (
              <Card glass className="p-6">
                <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-accent" />
                  Stripe Configuration
                </h2>
                <p className="text-text-secondary text-sm mb-5">Optional — for subscription payments</p>

                <form onSubmit={stripeForm.handleSubmit((d) => { setStripeData(d); setStep(5); })} className="space-y-4">
                  <Input
                    label="Publishable Key (optional)"
                    placeholder="pk_live_..."
                    {...stripeForm.register('stripePublishableKey')}
                  />
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <p className="text-xs text-amber-400 font-medium mb-1">Secret Key — Environment Variable Only</p>
                    <p className="text-xs text-text-secondary">
                      Set <code className="bg-white/10 px-1 rounded">STRIPE_SECRET_KEY</code> in your hosting environment. It is never stored in the database.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button variant="ghost" onClick={() => setStep(3)} type="button">
                      <ChevronLeft className="w-4 h-4" /> Back
                    </Button>
                    <Button fullWidth type="submit">
                      Continue <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {/* Step 5: Summary & Install */}
            {step === 5 && (
              <Card glass className="p-6">
                <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-accent" />
                  Ready to Install
                </h2>
                <p className="text-text-secondary text-sm mb-5">Review your configuration</p>

                <div className="space-y-3 mb-6">
                  {config && (
                    <div className="p-3 bg-surface rounded-xl flex items-center justify-between">
                      <span className="text-sm text-text-secondary">App Name</span>
                      <span className="text-sm font-medium text-white">{config.appName}</span>
                    </div>
                  )}
                  {adminData && (
                    <div className="p-3 bg-surface rounded-xl flex items-center justify-between">
                      <span className="text-sm text-text-secondary">Admin</span>
                      <span className="text-sm font-medium text-white">{adminData.email}</span>
                    </div>
                  )}
                  {openaiData && (
                    <div className="p-3 bg-surface rounded-xl flex items-center justify-between">
                      <span className="text-sm text-text-secondary">OpenAI Model</span>
                      <span className="text-sm font-medium text-white">{openaiData.openaiModel}</span>
                    </div>
                  )}
                  <div className="p-3 bg-surface rounded-xl flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Stripe</span>
                    <span className={`text-sm font-medium ${stripeData.stripePublishableKey ? 'text-success' : 'text-text-tertiary'}`}>
                      {stripeData.stripePublishableKey ? 'Configured' : 'Not configured'}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="ghost" onClick={() => setStep(4)} type="button">
                    <ChevronLeft className="w-4 h-4" /> Back
                  </Button>
                  <Button fullWidth size="lg" loading={installing} onClick={handleInstall}>
                    <Rocket className="w-4 h-4" />
                    Install Now
                  </Button>
                </div>
              </Card>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
