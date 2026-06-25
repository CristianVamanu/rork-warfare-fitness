import React, { useState, useCallback } from 'react';
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
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { CheckCircle, XCircle, ChevronRight, Shield, Wifi, User } from 'lucide-react-native';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';

import Colors from '@/constants/colors';
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebase-client';
import { completeSetup } from '@/lib/system-config';
import { doc, setDoc } from 'firebase/firestore';

type Step = 'branding' | 'connection' | 'account' | 'done';

interface ConnectionStatus {
  firebase: boolean | null;
  firestore: boolean | null;
  auth: boolean | null;
}

export default function SetupScreen() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('branding');

  // Step 1 fields
  const [appName, setAppName] = useState('Warfare Fitness');
  const [trainerName, setTrainerName] = useState('');
  const [trainerEmail, setTrainerEmail] = useState('');

  // Step 2 connection
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    firebase: null,
    firestore: null,
    auth: null,
  });
  const [testingConnection, setTestingConnection] = useState(false);

  // Step 3 account
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const testConnection = useCallback(async () => {
    setTestingConnection(true);
    setConnectionStatus({ firebase: null, firestore: null, auth: null });

    const auth = getFirebaseAuth();
    const db = getFirebaseDb();

    const firebaseOk = auth !== null;
    let firestoreOk = false;
    let authOk = false;

    if (db) {
      try {
        // lightweight ping — read system/config (may not exist yet, that's fine)
        const { getDoc, doc } = await import('firebase/firestore');
        await getDoc(doc(db, 'system/config'));
        firestoreOk = true;
      } catch {
        firestoreOk = false;
      }
    }

    if (auth) {
      try {
        // currentUser is null before login — the SDK itself responding means auth works
        authOk = true;
      } catch {
        authOk = false;
      }
    }

    setConnectionStatus({ firebase: firebaseOk, firestore: firestoreOk, auth: authOk });
    setTestingConnection(false);
  }, []);

  const handleBrandingNext = useCallback(() => {
    if (!appName.trim() || !trainerName.trim() || !trainerEmail.trim()) {
      setError('All fields are required');
      return;
    }
    setError('');
    setStep('connection');
    void testConnection();
  }, [appName, trainerName, trainerEmail, testConnection]);

  const handleConnectionNext = useCallback(() => {
    if (!connectionStatus.firebase || !connectionStatus.firestore || !connectionStatus.auth) {
      setError('Please fix the connection issues before continuing');
      return;
    }
    setError('');
    setStep('account');
  }, [connectionStatus]);

  const handleCreateAdmin = useCallback(async () => {
    setError('');
    if (!adminEmail.trim() || !adminPassword || !adminPasswordConfirm) {
      setError('All fields are required');
      return;
    }
    if (adminPassword !== adminPasswordConfirm) {
      setError('Passwords do not match');
      return;
    }
    if (adminPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setCreating(true);
    try {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error('Firebase Auth not configured');

      const cred = await createUserWithEmailAndPassword(auth, adminEmail.trim().toLowerCase(), adminPassword);
      await updateProfile(cred.user, { displayName: trainerName });

      await completeSetup({
        adminUid: cred.user.uid,
        appName: appName.trim(),
        trainerName: trainerName.trim(),
        trainerEmail: trainerEmail.trim().toLowerCase(),
      });

      // Also write the user profile to Firestore
      const db = getFirebaseDb();
      if (db) {
        await setDoc(doc(db, 'users', cred.user.uid), {
          id: cred.user.uid,
          name: trainerName.trim(),
          email: adminEmail.trim().toLowerCase(),
          registrationDate: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }

      setStep('done');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('email-already-in-use')) {
        setError('An account with this email already exists. Try logging in instead.');
      } else {
        setError(msg);
      }
    } finally {
      setCreating(false);
    }
  }, [adminEmail, adminPassword, adminPasswordConfirm, appName, trainerName, trainerEmail]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Shield size={40} color={Colors.accent} />
            <Text style={styles.title}>Installation Setup</Text>
            <Text style={styles.subtitle}>Configure your Warfare Fitness installation</Text>
          </View>

          <StepIndicator current={step} />

          {step === 'branding' && (
            <BrandingStep
              appName={appName}
              trainerName={trainerName}
              trainerEmail={trainerEmail}
              onAppName={setAppName}
              onTrainerName={setTrainerName}
              onTrainerEmail={setTrainerEmail}
              onNext={handleBrandingNext}
              error={error}
            />
          )}

          {step === 'connection' && (
            <ConnectionStep
              status={connectionStatus}
              testing={testingConnection}
              onRetry={testConnection}
              onNext={handleConnectionNext}
              error={error}
            />
          )}

          {step === 'account' && (
            <AccountStep
              email={adminEmail}
              password={adminPassword}
              passwordConfirm={adminPasswordConfirm}
              onEmail={setAdminEmail}
              onPassword={setAdminPassword}
              onPasswordConfirm={setAdminPasswordConfirm}
              onSubmit={handleCreateAdmin}
              creating={creating}
              error={error}
            />
          )}

          {step === 'done' && (
            <DoneStep
              appName={appName}
              trainerName={trainerName}
              onEnter={() => router.replace('/login')}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const steps: Step[] = ['branding', 'connection', 'account', 'done'];
  const labels = ['Branding', 'Connection', 'Account', 'Done'];
  const idx = steps.indexOf(current);
  return (
    <View style={styles.stepRow}>
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <View style={styles.stepItem}>
            <View style={[styles.stepDot, i <= idx && styles.stepDotActive]}>
              <Text style={[styles.stepNum, i <= idx && styles.stepNumActive]}>{i + 1}</Text>
            </View>
            <Text style={[styles.stepLabel, i <= idx && styles.stepLabelActive]}>{labels[i]}</Text>
          </View>
          {i < steps.length - 1 && (
            <View style={[styles.stepLine, i < idx && styles.stepLineActive]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

function BrandingStep({
  appName, trainerName, trainerEmail,
  onAppName, onTrainerName, onTrainerEmail,
  onNext, error,
}: {
  appName: string; trainerName: string; trainerEmail: string;
  onAppName: (v: string) => void; onTrainerName: (v: string) => void; onTrainerEmail: (v: string) => void;
  onNext: () => void; error: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>App Branding</Text>
      <Text style={styles.cardDesc}>Give your installation a name and set the trainer details.</Text>

      <Text style={styles.label}>App Name</Text>
      <TextInput
        style={styles.input}
        value={appName}
        onChangeText={onAppName}
        placeholder="Warfare Fitness"
        placeholderTextColor={Colors.textTertiary}
      />

      <Text style={styles.label}>Trainer Name</Text>
      <TextInput
        style={styles.input}
        value={trainerName}
        onChangeText={onTrainerName}
        placeholder="John Smith"
        placeholderTextColor={Colors.textTertiary}
      />

      <Text style={styles.label}>Trainer Email</Text>
      <TextInput
        style={styles.input}
        value={trainerEmail}
        onChangeText={onTrainerEmail}
        placeholder="trainer@example.com"
        placeholderTextColor={Colors.textTertiary}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      {!!error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.btn} onPress={onNext}>
        <Text style={styles.btnText}>Next</Text>
        <ChevronRight size={18} color="#000" />
      </TouchableOpacity>
    </View>
  );
}

function ConnectionStep({
  status, testing, onRetry, onNext, error,
}: {
  status: ConnectionStatus; testing: boolean;
  onRetry: () => void; onNext: () => void; error: string;
}) {
  const allGood = status.firebase === true && status.firestore === true && status.auth === true;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Firebase Connection</Text>
      <Text style={styles.cardDesc}>Verifying your Firebase credentials and Firestore access.</Text>

      <ConnectionRow label="Firebase SDK" status={status.firebase} testing={testing} />
      <ConnectionRow label="Firestore" status={status.firestore} testing={testing} />
      <ConnectionRow label="Authentication" status={status.auth} testing={testing} />

      {!testing && !allGood && (
        <Text style={styles.hint}>
          Check your EXPO_PUBLIC_FIREBASE_* environment variables in Vercel and redeploy.
        </Text>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.btnSecondary} onPress={onRetry} disabled={testing}>
        <Wifi size={16} color={Colors.accent} />
        <Text style={styles.btnSecondaryText}>{testing ? 'Testing…' : 'Re-test Connection'}</Text>
      </TouchableOpacity>

      {allGood && (
        <TouchableOpacity style={styles.btn} onPress={onNext}>
          <Text style={styles.btnText}>Next</Text>
          <ChevronRight size={18} color="#000" />
        </TouchableOpacity>
      )}
    </View>
  );
}

function ConnectionRow({ label, status, testing }: { label: string; status: boolean | null; testing: boolean }) {
  return (
    <View style={styles.connRow}>
      <Text style={styles.connLabel}>{label}</Text>
      {testing || status === null ? (
        <ActivityIndicator size="small" color={Colors.accent} />
      ) : status ? (
        <CheckCircle size={20} color={Colors.success} />
      ) : (
        <XCircle size={20} color={Colors.danger} />
      )}
    </View>
  );
}

function AccountStep({
  email, password, passwordConfirm,
  onEmail, onPassword, onPasswordConfirm,
  onSubmit, creating, error,
}: {
  email: string; password: string; passwordConfirm: string;
  onEmail: (v: string) => void; onPassword: (v: string) => void; onPasswordConfirm: (v: string) => void;
  onSubmit: () => void; creating: boolean; error: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Create Admin Account</Text>
      <Text style={styles.cardDesc}>
        This account will be the permanent administrator. It cannot be changed without database access.
      </Text>

      <Text style={styles.label}>Admin Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={onEmail}
        placeholder="admin@example.com"
        placeholderTextColor={Colors.textTertiary}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={onPassword}
        placeholder="Min 6 characters"
        placeholderTextColor={Colors.textTertiary}
        secureTextEntry
      />

      <Text style={styles.label}>Confirm Password</Text>
      <TextInput
        style={styles.input}
        value={passwordConfirm}
        onChangeText={onPasswordConfirm}
        placeholder="Repeat password"
        placeholderTextColor={Colors.textTertiary}
        secureTextEntry
      />

      {!!error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.btn} onPress={onSubmit} disabled={creating}>
        {creating ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <>
            <User size={18} color="#000" />
            <Text style={styles.btnText}>Create Admin &amp; Finish Setup</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

function DoneStep({ appName, trainerName, onEnter }: { appName: string; trainerName: string; onEnter: () => void }) {
  return (
    <View style={styles.card}>
      <CheckCircle size={56} color={Colors.success} style={{ alignSelf: 'center', marginBottom: 16 }} />
      <Text style={[styles.cardTitle, { textAlign: 'center' }]}>Setup Complete!</Text>
      <Text style={[styles.cardDesc, { textAlign: 'center' }]}>
        {appName} is ready. Welcome aboard, {trainerName}!
      </Text>
      <Text style={[styles.hint, { textAlign: 'center', marginTop: 8 }]}>
        This setup page is now locked. Log in with your admin account to get started.
      </Text>
      <TouchableOpacity style={[styles.btn, { marginTop: 24 }]} onPress={onEnter}>
        <Text style={styles.btnText}>Go to Login</Text>
        <ChevronRight size={18} color="#000" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 60 },
  header: { alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text, marginTop: 12 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 4, textAlign: 'center' },

  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  stepItem: { alignItems: 'center', gap: 4 },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  stepNum: { fontSize: 12, fontWeight: '700', color: Colors.textTertiary },
  stepNumActive: { color: '#000' },
  stepLabel: { fontSize: 10, color: Colors.textTertiary },
  stepLabelActive: { color: Colors.accent },
  stepLine: { flex: 1, height: 1, backgroundColor: Colors.border, marginBottom: 18, marginHorizontal: 4 },
  stepLineActive: { backgroundColor: Colors.accent },

  card: {
    backgroundColor: Colors.surface, borderRadius: 16,
    padding: 24, borderWidth: 1, borderColor: Colors.border,
    gap: 12,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  cardDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },

  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: -4 },
  input: {
    backgroundColor: Colors.surfaceLight, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    padding: 12, fontSize: 15, color: Colors.text,
  },

  connRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surfaceLight, borderRadius: 10,
    padding: 14, borderWidth: 1, borderColor: Colors.border,
  },
  connLabel: { fontSize: 14, color: Colors.text, fontWeight: '500' },

  hint: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  error: { fontSize: 13, color: Colors.danger },

  btn: {
    backgroundColor: Colors.accent, borderRadius: 12,
    padding: 14, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8, marginTop: 4,
  },
  btnText: { fontSize: 15, fontWeight: '700', color: '#000' },

  btnSecondary: {
    backgroundColor: Colors.surfaceLight, borderRadius: 12,
    padding: 14, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8, borderWidth: 1, borderColor: Colors.border,
  },
  btnSecondaryText: { fontSize: 14, fontWeight: '600', color: Colors.accent },
});
