import React, { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  CheckCircle,
  XCircle,
  ChevronRight,
  ChevronLeft,
  Shield,
  CreditCard,
  Cpu,
  Settings,
  User,
  Eye,
  EyeOff,
} from 'lucide-react-native';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

import Colors from '@/constants/colors';
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebase-client';
import { completeSetup } from '@/lib/system-config';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: Record<Step, string> = {
  1: 'App Setup',
  2: 'Admin Account',
  3: 'AI Setup',
  4: 'Billing',
  5: 'Finish',
};

const STEP_ICONS: Record<Step, React.ComponentType<{ size: number; color: string }>> = {
  1: Settings,
  2: User,
  3: Cpu,
  4: CreditCard,
  5: Shield,
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function InstallScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Step 1 — App Setup
  const [appName, setAppName] = useState('Warfare Fitness');
  const [trainerName, setTrainerName] = useState('');
  const [trainerEmail, setTrainerEmail] = useState('');
  const [logoUri, setLogoUri] = useState('');

  // Step 2 — Admin Account
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [adminUid, setAdminUid] = useState('');

  // Step 3 — AI Setup
  const [openAiKey, setOpenAiKey] = useState('');
  const [aiTestStatus, setAiTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [aiTestMsg, setAiTestMsg] = useState('');

  // Step 4 — Billing
  const [stripePublishable, setStripePublishable] = useState('');
  const [stripeSecret, setStripeSecret] = useState('');
  const [stripeWebhook, setStripeWebhook] = useState('');

  // Step 5 — Done
  const [done, setDone] = useState(false);

  const scrollTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });

  const go = useCallback((next: Step) => {
    setError('');
    setStep(next);
    scrollTop();
  }, []);

  // ── Step 1 validation ──
  const handleStep1 = useCallback(() => {
    if (!appName.trim()) { setError('App name is required'); return; }
    if (!trainerName.trim()) { setError('Trainer name is required'); return; }
    if (!trainerEmail.trim() || !trainerEmail.includes('@')) { setError('Valid trainer email is required'); return; }
    go(2);
  }, [appName, trainerName, trainerEmail, go]);

  // ── Step 2: create Firebase Auth user ──
  const handleStep2 = useCallback(async () => {
    setError('');
    if (!adminEmail.trim() || !adminEmail.includes('@')) { setError('Valid admin email required'); return; }
    if (adminPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (adminPassword !== adminPasswordConfirm) { setError('Passwords do not match'); return; }
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error('Firebase Auth is not configured. Check EXPO_PUBLIC_FIREBASE_* env vars.');
      const cred = await createUserWithEmailAndPassword(auth, adminEmail.trim().toLowerCase(), adminPassword);
      await updateProfile(cred.user, { displayName: trainerName });
      setAdminUid(cred.user.uid);
      go(3);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('email-already-in-use')) {
        setError('An account with this email already exists. Use a different email or log in instead.');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [adminEmail, adminPassword, adminPasswordConfirm, trainerName, go]);

  // ── Step 3: test OpenAI key ──
  const handleTestAi = useCallback(async () => {
    if (!openAiKey.trim()) { setAiTestMsg('Enter an API key first'); setAiTestStatus('fail'); return; }
    setAiTestStatus('testing');
    setAiTestMsg('');
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${openAiKey.trim()}` },
      });
      if (res.ok) {
        setAiTestStatus('ok');
        setAiTestMsg('Connection successful');
      } else {
        const body = await res.json().catch(() => ({}));
        setAiTestStatus('fail');
        setAiTestMsg(body?.error?.message ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setAiTestStatus('fail');
      setAiTestMsg(e instanceof Error ? e.message : 'Network error');
    }
  }, [openAiKey]);

  // ── Step 5: write system/config and finish ──
  const handleFinalize = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      if (!adminUid) throw new Error('Admin account not created — go back to step 2');

      await completeSetup({
        adminUid,
        appName: appName.trim(),
        trainerName: trainerName.trim(),
        trainerEmail: trainerEmail.trim().toLowerCase(),
        openAiKey: openAiKey.trim(),
        stripeConfig: {
          publishableKey: stripePublishable.trim(),
          secretKey: stripeSecret.trim(),
          webhookSecret: stripeWebhook.trim(),
        },
      });

      // Write trainer's user profile to Firestore
      const db = getFirebaseDb();
      if (db) {
        await setDoc(doc(db, 'users', adminUid), {
          id: adminUid,
          name: trainerName.trim(),
          email: adminEmail.trim().toLowerCase(),
          registrationDate: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }

      setDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [adminUid, appName, trainerName, trainerEmail, adminEmail, openAiKey, stripePublishable, stripeSecret, stripeWebhook]);

  if (done) {
    return <DoneScreen appName={appName} trainerName={trainerName} onEnter={() => router.replace('/login')} />;
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Header */}
          <View style={styles.header}>
            <Shield size={36} color={Colors.accent} />
            <Text style={styles.title}>Warfare Fitness Installer</Text>
            <Text style={styles.subtitle}>Configure your installation — takes about 2 minutes</Text>
          </View>

          {/* Step indicator */}
          <StepBar current={step} />

          {/* Step content */}
          {step === 1 && (
            <Step1
              appName={appName} trainerName={trainerName} trainerEmail={trainerEmail} logoUri={logoUri}
              onAppName={setAppName} onTrainerName={setTrainerName} onTrainerEmail={setTrainerEmail}
              onLogoUri={setLogoUri} onNext={handleStep1} error={error}
            />
          )}
          {step === 2 && (
            <Step2
              email={adminEmail} password={adminPassword} passwordConfirm={adminPasswordConfirm}
              showPass={showPass}
              onEmail={setAdminEmail} onPassword={setAdminPassword} onPasswordConfirm={setAdminPasswordConfirm}
              onTogglePass={() => setShowPass(p => !p)}
              onBack={() => go(1)} onNext={handleStep2} busy={busy} error={error}
            />
          )}
          {step === 3 && (
            <Step3
              apiKey={openAiKey} testStatus={aiTestStatus} testMsg={aiTestMsg}
              onApiKey={setOpenAiKey} onTest={handleTestAi}
              onBack={() => go(2)} onNext={() => go(4)} error={error}
            />
          )}
          {step === 4 && (
            <Step4
              publishable={stripePublishable} secret={stripeSecret} webhook={stripeWebhook}
              onPublishable={setStripePublishable} onSecret={setStripeSecret} onWebhook={setStripeWebhook}
              onBack={() => go(3)} onNext={() => go(5)} error={error}
            />
          )}
          {step === 5 && (
            <Step5
              appName={appName} trainerName={trainerName} trainerEmail={trainerEmail}
              adminEmail={adminEmail}
              hasAi={!!openAiKey.trim()} hasStripe={!!stripePublishable.trim()}
              onBack={() => go(4)} onFinalize={handleFinalize} busy={busy} error={error}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

// ─── Step indicator bar ───────────────────────────────────────────────────────

function StepBar({ current }: { current: Step }) {
  const steps: Step[] = [1, 2, 3, 4, 5];
  return (
    <View style={styles.stepBar}>
      {steps.map((s, i) => {
        const Icon = STEP_ICONS[s];
        const active = s <= current;
        return (
          <React.Fragment key={s}>
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, active && styles.stepCircleActive]}>
                <Icon size={14} color={active ? '#000' : Colors.textTertiary} />
              </View>
              <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{STEP_LABELS[s]}</Text>
            </View>
            {i < steps.length - 1 && (
              <View style={[styles.stepLine, s < current && styles.stepLineActive]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ─── Step 1 — App Setup ───────────────────────────────────────────────────────

function Step1({ appName, trainerName, trainerEmail, logoUri, onAppName, onTrainerName, onTrainerEmail, onLogoUri, onNext, error }: {
  appName: string; trainerName: string; trainerEmail: string; logoUri: string;
  onAppName(v: string): void; onTrainerName(v: string): void; onTrainerEmail(v: string): void; onLogoUri(v: string): void;
  onNext(): void; error: string;
}) {
  return (
    <Card title="App Setup" desc="Brand your installation with your gym's name and your details.">
      <Label>App Name *</Label>
      <Input value={appName} onChange={onAppName} placeholder="Warfare Fitness" />

      <Label>Trainer / Gym Name *</Label>
      <Input value={trainerName} onChange={onTrainerName} placeholder="John Smith" />

      <Label>Trainer Email *</Label>
      <Input value={trainerEmail} onChange={onTrainerEmail} placeholder="coach@mygym.com" keyboard="email-address" />

      <Label>Logo URL (optional)</Label>
      <Input value={logoUri} onChange={onLogoUri} placeholder="https://example.com/logo.png" />
      {!!logoUri && (
        <Image source={{ uri: logoUri }} style={styles.logoPreview} resizeMode="contain" onError={() => {}} />
      )}

      {!!error && <ErrorText>{error}</ErrorText>}
      <NextBtn onPress={onNext} label="Next: Admin Account" />
    </Card>
  );
}

// ─── Step 2 — Admin Account ───────────────────────────────────────────────────

function Step2({ email, password, passwordConfirm, showPass, onEmail, onPassword, onPasswordConfirm, onTogglePass, onBack, onNext, busy, error }: {
  email: string; password: string; passwordConfirm: string; showPass: boolean;
  onEmail(v: string): void; onPassword(v: string): void; onPasswordConfirm(v: string): void;
  onTogglePass(): void; onBack(): void; onNext(): void; busy: boolean; error: string;
}) {
  return (
    <Card title="Admin Account" desc="This account will be the permanent system administrator. It cannot be changed without direct database access.">
      <Label>Admin Email *</Label>
      <Input value={email} onChange={onEmail} placeholder="admin@mygym.com" keyboard="email-address" />

      <Label>Password * (min 6 characters)</Label>
      <View style={styles.passwordRow}>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          value={password}
          onChangeText={onPassword}
          placeholder="••••••••"
          placeholderTextColor={Colors.textTertiary}
          secureTextEntry={!showPass}
        />
        <TouchableOpacity onPress={onTogglePass} style={styles.eyeBtn}>
          {showPass ? <EyeOff size={18} color={Colors.textSecondary} /> : <Eye size={18} color={Colors.textSecondary} />}
        </TouchableOpacity>
      </View>

      <Label>Confirm Password *</Label>
      <Input value={passwordConfirm} onChange={onPasswordConfirm} placeholder="••••••••" secure />

      <View style={styles.notice}>
        <Shield size={14} color={Colors.accent} />
        <Text style={styles.noticeText}>
          Your UID will be stored as <Text style={styles.mono}>adminUid</Text> in Firestore. This is the single source of truth for admin access.
        </Text>
      </View>

      {!!error && <ErrorText>{error}</ErrorText>}
      <NavRow onBack={onBack} onNext={onNext} nextLabel="Create Account" busy={busy} />
    </Card>
  );
}

// ─── Step 3 — AI Setup ───────────────────────────────────────────────────────

function Step3({ apiKey, testStatus, testMsg, onApiKey, onTest, onBack, onNext, error }: {
  apiKey: string; testStatus: 'idle' | 'testing' | 'ok' | 'fail'; testMsg: string;
  onApiKey(v: string): void; onTest(): void; onBack(): void; onNext(): void; error: string;
}) {
  return (
    <Card title="AI Setup" desc="Enables the AI Trainer feature. You can skip this and add the key later from Admin Settings.">
      <Label>OpenAI API Key (optional)</Label>
      <Input value={apiKey} onChange={onApiKey} placeholder="sk-..." secure />

      <TouchableOpacity
        style={[styles.testBtn, testStatus === 'testing' && styles.testBtnDisabled]}
        onPress={onTest}
        disabled={testStatus === 'testing'}
      >
        {testStatus === 'testing' ? (
          <ActivityIndicator size="small" color={Colors.accent} />
        ) : testStatus === 'ok' ? (
          <CheckCircle size={16} color={Colors.success} />
        ) : testStatus === 'fail' ? (
          <XCircle size={16} color={Colors.danger} />
        ) : (
          <Cpu size={16} color={Colors.accent} />
        )}
        <Text style={[
          styles.testBtnText,
          testStatus === 'ok' && { color: Colors.success },
          testStatus === 'fail' && { color: Colors.danger },
        ]}>
          {testStatus === 'testing' ? 'Testing…' : testStatus === 'ok' ? 'Connection OK' : testStatus === 'fail' ? 'Test Failed' : 'Test Connection'}
        </Text>
      </TouchableOpacity>

      {!!testMsg && (
        <Text style={[styles.testMsg, testStatus === 'fail' && { color: Colors.danger }]}>{testMsg}</Text>
      )}

      {!!error && <ErrorText>{error}</ErrorText>}
      <NavRow onBack={onBack} onNext={onNext} nextLabel="Next: Billing" />
    </Card>
  );
}

// ─── Step 4 — Billing ─────────────────────────────────────────────────────────

function Step4({ publishable, secret, webhook, onPublishable, onSecret, onWebhook, onBack, onNext, error }: {
  publishable: string; secret: string; webhook: string;
  onPublishable(v: string): void; onSecret(v: string): void; onWebhook(v: string): void;
  onBack(): void; onNext(): void; error: string;
}) {
  return (
    <Card title="Billing Setup" desc="Optional. Connect Stripe to enable paid memberships. Leave blank to use the free tier only.">
      <Label>Stripe Publishable Key (optional)</Label>
      <Input value={publishable} onChange={onPublishable} placeholder="pk_live_..." />

      <Label>Stripe Secret Key (optional)</Label>
      <Input value={secret} onChange={onSecret} placeholder="sk_live_..." secure />

      <Label>Webhook Secret (optional)</Label>
      <Input value={webhook} onChange={onWebhook} placeholder="whsec_..." secure />

      <View style={styles.notice}>
        <CreditCard size={14} color={Colors.accent} />
        <Text style={styles.noticeText}>
          Keys are stored in system/config (admin-only Firestore document). They are never exposed to regular users.
        </Text>
      </View>

      {!!error && <ErrorText>{error}</ErrorText>}
      <NavRow onBack={onBack} onNext={onNext} nextLabel="Next: Finalize" />
    </Card>
  );
}

// ─── Step 5 — Finalization ────────────────────────────────────────────────────

function Step5({ appName, trainerName, trainerEmail, adminEmail, hasAi, hasStripe, onBack, onFinalize, busy, error }: {
  appName: string; trainerName: string; trainerEmail: string; adminEmail: string;
  hasAi: boolean; hasStripe: boolean;
  onBack(): void; onFinalize(): void; busy: boolean; error: string;
}) {
  const rows: [string, string][] = [
    ['App Name', appName],
    ['Trainer', trainerName],
    ['Trainer Email', trainerEmail],
    ['Admin Account', adminEmail],
    ['AI Trainer', hasAi ? '✓ Configured' : '— Skipped'],
    ['Billing', hasStripe ? '✓ Configured' : '— Skipped'],
  ];
  return (
    <Card title="Review & Finalize" desc="Check the details below, then click Finalize to create your installation.">
      {rows.map(([label, value]) => (
        <View key={label} style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>{label}</Text>
          <Text style={styles.reviewValue}>{value}</Text>
        </View>
      ))}

      <View style={styles.notice}>
        <Shield size={14} color={Colors.warning} />
        <Text style={styles.noticeText}>
          This will create the <Text style={styles.mono}>system/config</Text> document in Firestore and lock the installer permanently.
        </Text>
      </View>

      {!!error && <ErrorText>{error}</ErrorText>}
      <NavRow onBack={onBack} onNext={onFinalize} nextLabel="Finalize Installation" busy={busy} nextColor={Colors.success} />
    </Card>
  );
}

// ─── Done screen ──────────────────────────────────────────────────────────────

function DoneScreen({ appName, trainerName, onEnter }: { appName: string; trainerName: string; onEnter(): void }) {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.doneRoot}>
        <CheckCircle size={72} color={Colors.success} />
        <Text style={styles.doneTitle}>Installation Complete!</Text>
        <Text style={styles.doneMsg}>
          {appName} is ready. Welcome, {trainerName}!{'\n'}
          The installer is now permanently locked.
        </Text>
        <TouchableOpacity style={styles.doneBtn} onPress={onEnter}>
          <Text style={styles.doneBtnText}>Go to Login</Text>
          <ChevronRight size={18} color="#000" />
        </TouchableOpacity>
      </View>
    </>
  );
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function Card({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardDesc}>{desc}</Text>
      {children}
    </View>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

function Input({ value, onChange, placeholder, keyboard, secure }: {
  value: string; onChange(v: string): void; placeholder?: string;
  keyboard?: 'default' | 'email-address'; secure?: boolean;
}) {
  return (
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={Colors.textTertiary}
      keyboardType={keyboard ?? 'default'}
      autoCapitalize="none"
      secureTextEntry={secure}
    />
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <Text style={styles.errorText}>{children}</Text>;
}

function NextBtn({ onPress, label }: { onPress(): void; label: string }) {
  return (
    <TouchableOpacity style={styles.nextBtn} onPress={onPress}>
      <Text style={styles.nextBtnText}>{label}</Text>
      <ChevronRight size={18} color="#000" />
    </TouchableOpacity>
  );
}

function NavRow({ onBack, onNext, nextLabel, busy, nextColor }: {
  onBack(): void; onNext(): void; nextLabel: string; busy?: boolean; nextColor?: string;
}) {
  return (
    <View style={styles.navRow}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <ChevronLeft size={18} color={Colors.textSecondary} />
        <Text style={styles.backBtnText}>Back</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.nextBtn, { flex: 1 }, nextColor ? { backgroundColor: nextColor } : {}]}
        onPress={onNext}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <>
            <Text style={styles.nextBtnText}>{nextLabel}</Text>
            <ChevronRight size={18} color="#000" />
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, padding: 20, paddingTop: 56, gap: 20 },

  header: { alignItems: 'center', gap: 8 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  subtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },

  // Step bar
  stepBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stepItem: { alignItems: 'center', gap: 4, width: 52 },
  stepCircle: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepCircleActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  stepLabel: { fontSize: 9, color: Colors.textTertiary, textAlign: 'center' },
  stepLabelActive: { color: Colors.accent },
  stepLine: { flex: 1, height: 1, backgroundColor: Colors.border, marginBottom: 18 },
  stepLineActive: { backgroundColor: Colors.accent },

  // Card
  card: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: Colors.border, gap: 10,
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  cardDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },

  // Form
  label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: -4 },
  input: {
    backgroundColor: Colors.surfaceLight, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, color: Colors.text, marginBottom: 2,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: { padding: 10 },

  logoPreview: { width: '100%', height: 60, borderRadius: 8, backgroundColor: Colors.surfaceLight },

  // Buttons
  nextBtn: {
    backgroundColor: Colors.accent, borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  nextBtnText: { fontSize: 14, fontWeight: '700', color: '#000' },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 13, paddingHorizontal: 10,
  },
  backBtnText: { fontSize: 14, color: Colors.textSecondary },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },

  // AI test
  testBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingVertical: 11, paddingHorizontal: 14,
    backgroundColor: Colors.surfaceLight,
  },
  testBtnDisabled: { opacity: 0.5 },
  testBtnText: { fontSize: 14, color: Colors.accent },
  testMsg: { fontSize: 12, color: Colors.textSecondary },

  // Notice box
  notice: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.surfaceElevated, borderRadius: 8,
    padding: 12, borderWidth: 1, borderColor: Colors.borderLight,
  },
  noticeText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: Colors.accent },

  // Review
  reviewRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  reviewLabel: { fontSize: 13, color: Colors.textSecondary },
  reviewValue: { fontSize: 13, color: Colors.text, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },

  // Error
  errorText: { fontSize: 13, color: Colors.danger, lineHeight: 18 },

  // Done
  doneRoot: {
    flex: 1, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
    padding: 32, gap: 16,
  },
  doneTitle: { fontSize: 26, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  doneMsg: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  doneBtn: {
    backgroundColor: Colors.accent, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 28,
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
  },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },
});
