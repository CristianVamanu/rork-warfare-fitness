import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  ArrowLeft,
  Shield,
  Database,
  Key,
  HardDrive,
  Info,
} from 'lucide-react-native';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { getFirebaseApp, getFirebaseAuth, getFirebaseDb, getFirebaseStorage } from '@/lib/firebase-client';
import { getSystemConfig, SystemConfig } from '@/lib/system-config';

const APP_VERSION = '1.0.0';

interface HealthCheck {
  label: string;
  status: 'ok' | 'fail' | 'loading';
  detail?: string;
}

export default function AdminSystemScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useApp();

  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const runChecks = useCallback(async () => {
    setLoading(true);
    setChecks([
      { label: 'Firebase SDK', status: 'loading' },
      { label: 'Firestore', status: 'loading' },
      { label: 'Authentication', status: 'loading' },
      { label: 'Storage', status: 'loading' },
    ]);

    const results: HealthCheck[] = [];

    // Firebase SDK
    const app = getFirebaseApp();
    results.push({
      label: 'Firebase SDK',
      status: app ? 'ok' : 'fail',
      detail: app ? `Project: ${app.options.projectId}` : 'Missing EXPO_PUBLIC_FIREBASE_* env vars',
    });

    // Firestore
    const db = getFirebaseDb();
    let sysConfig: SystemConfig | null = null;
    if (db) {
      try {
        sysConfig = await getSystemConfig();
        results.push({
          label: 'Firestore',
          status: 'ok',
          detail: sysConfig ? 'Connected — system/config found' : 'Connected — no system/config yet',
        });
      } catch (e) {
        results.push({ label: 'Firestore', status: 'fail', detail: String(e) });
      }
    } else {
      results.push({ label: 'Firestore', status: 'fail', detail: 'Not initialised' });
    }

    // Auth
    const auth = getFirebaseAuth();
    results.push({
      label: 'Authentication',
      status: auth ? 'ok' : 'fail',
      detail: auth ? (auth.currentUser ? `Signed in as ${auth.currentUser.email}` : 'SDK ready') : 'Not initialised',
    });

    // Storage
    const storage = getFirebaseStorage();
    results.push({
      label: 'Storage',
      status: storage ? 'ok' : 'fail',
      detail: storage ? 'SDK ready' : 'Not initialised',
    });

    setChecks(results);
    setConfig(sysConfig);
    setLoading(false);
  }, []);

  useEffect(() => { void runChecks(); }, [runChecks]);

  if (!user?.isAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <Shield size={48} color={Colors.textTertiary} />
        <Text style={styles.denied}>Admin access required</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>System Health</Text>
          <TouchableOpacity onPress={runChecks} style={styles.refreshBtn} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color={Colors.accent} /> : <RefreshCw size={18} color={Colors.accent} />}
          </TouchableOpacity>
        </View>

        {/* Health checks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Services</Text>
          {checks.map((c) => (
            <View key={c.label} style={styles.row}>
              <StatusIcon status={c.status} />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{c.label}</Text>
                {!!c.detail && <Text style={styles.rowDetail}>{c.detail}</Text>}
              </View>
            </View>
          ))}
        </View>

        {/* Installation info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Installation</Text>

          <InfoRow icon={<Shield size={16} color={Colors.accent} />} label="Admin UID" value={config?.adminUid ?? user.id ?? '—'} mono />
          <InfoRow icon={<Key size={16} color={Colors.accent} />} label="App Name" value={config?.appName ?? '—'} />
          <InfoRow icon={<Database size={16} color={Colors.accent} />} label="Trainer Name" value={config?.trainerName ?? '—'} />
          <InfoRow icon={<Database size={16} color={Colors.accent} />} label="Trainer Email" value={config?.trainerEmail ?? '—'} />
          <InfoRow icon={<HardDrive size={16} color={Colors.accent} />} label="Setup Completed" value={config?.setupCompleted ? 'Yes' : 'No'} />
          <InfoRow icon={<Info size={16} color={Colors.accent} />} label="Installed At" value={config?.createdAt ? new Date(config.createdAt).toLocaleDateString() : '—'} />
          <InfoRow icon={<Info size={16} color={Colors.accent} />} label="App Version" value={APP_VERSION} />
        </View>

        {/* Current session */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Session</Text>
          <InfoRow icon={<Key size={16} color={Colors.accent} />} label="UID" value={user.id} mono />
          <InfoRow icon={<Info size={16} color={Colors.accent} />} label="Email" value={user.email} />
          <InfoRow icon={<Shield size={16} color={Colors.accent} />} label="Role" value={user.isAdmin ? 'Administrator' : 'Member'} />
        </View>
      </ScrollView>
    </>
  );
}

function StatusIcon({ status }: { status: HealthCheck['status'] }) {
  if (status === 'loading') return <ActivityIndicator size="small" color={Colors.accent} style={{ width: 24 }} />;
  if (status === 'ok') return <CheckCircle size={22} color={Colors.success} />;
  return <XCircle size={22} color={Colors.danger} />;
}

function InfoRow({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>{icon}</View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, mono && styles.mono]} numberOfLines={1} ellipsizeMode="middle">
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, gap: 20 },
  denied: { color: Colors.textSecondary, marginTop: 12, fontSize: 15 },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 4,
  },
  backBtn: { padding: 8 },
  refreshBtn: { padding: 8 },
  title: { fontSize: 20, fontWeight: '700', color: Colors.text },

  section: {
    backgroundColor: Colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: Colors.textTertiary,
    textTransform: 'uppercase', letterSpacing: 1,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
  },

  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  rowDetail: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  infoIcon: { width: 20, alignItems: 'center' },
  infoLabel: { fontSize: 13, color: Colors.textSecondary, width: 110 },
  infoValue: { flex: 1, fontSize: 13, color: Colors.text, textAlign: 'right' },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 11 },
});

import { Platform } from 'react-native';
