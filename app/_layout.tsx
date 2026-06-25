import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { trpc, trpcClient } from "@/lib/trpc";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState, useRef, useCallback } from "react";
import { logFirebaseDiagnostic } from '@/lib/firebase-client';
import FirebaseDiagnostic from '@/components/FirebaseDiagnostic';
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, ActivityIndicator, Text, Alert } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppProvider, useApp } from '@/contexts/AppContext';
import { TrainingProvider } from '@/contexts/TrainingContext';
import { FirebaseProvider } from '@/contexts/FirebaseContext';
import { ChallengesProvider } from '@/contexts/ChallengesContext';
import { RankingProvider } from '@/contexts/RankingContext';
import { LeaderboardProvider } from '@/contexts/LeaderboardContext';
import { NotificationsProvider } from '@/contexts/NotificationsContext';
import { ShopProvider } from '@/contexts/ShopContext';
import { DaysWithoutProvider } from '@/contexts/DaysWithoutContext';
import { CommunityProvider } from '@/contexts/CommunityContext';
import { SubscriptionProvider, useSubscription } from '@/contexts/SubscriptionContext';
import { TrainerProvider } from '@/contexts/TrainerContext';
import AdminSettingsSync from '@/components/AdminSettingsSync';
import { isSetupComplete } from '@/lib/system-config';

import { runMigrations, verifyDataIntegrity } from '@/lib/data-migration'
import { useFrameworkReady } from '@/hooks/useFrameworkReady';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient();

// AsyncStorage key for caching setup status between sessions
const SETUP_CACHE_KEY = 'warfare_system_setup_complete';

function DataMigrationGuard({ children }: { children: React.ReactNode }) {
  const [migrationStatus, setMigrationStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [migrationError, setMigrationError] = useState<string | null>(null);

  useEffect(() => {
    async function performMigration() {
      try {
        console.log('[App] Starting data migration check...');
        
        const migrationResult = await runMigrations();
        
        if (!migrationResult.success) {
          console.error('[App] Migration failed:', migrationResult.errors);
          setMigrationError(migrationResult.errors.join(', '));
          setMigrationStatus('error');
          
          Alert.alert(
            'Data Migration Error',
            'There was an issue migrating your data. Your data has been restored from backup. Please contact support if this persists.',
            [{ text: 'OK' }]
          );
          return;
        }
        
        if (migrationResult.migratedKeys.length > 0) {
          console.log('[App] Migration successful. Keys migrated:', migrationResult.migratedKeys.length);
        }
        
        const integrity = await verifyDataIntegrity();
        if (!integrity.valid) {
          console.error('[App] Data integrity check failed');
          setMigrationError('Data integrity check failed');
          setMigrationStatus('error');
          
          Alert.alert(
            'Data Integrity Warning',
            'Some data may be corrupted. Your progress is preserved in backup. Please contact support.',
            [{ text: 'OK' }]
          );
          return;
        }
        
        console.log('[App] Data migration and integrity check passed');
        setMigrationStatus('success');
      } catch (error) {
        console.error('[App] Migration process error:', error);
        setMigrationError(String(error));
        setMigrationStatus('error');
      }
    }

    void performMigration();
  }, []);

  if (migrationStatus === 'pending') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={{ color: '#fff', marginTop: 16, fontSize: 16 }}>Preparing your data...</Text>
      </View>
    );
  }

  if (migrationStatus === 'error') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', padding: 20 }}>
        <Text style={{ color: '#ff4444', fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>Migration Error</Text>
        <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 16 }}>
          {migrationError ?? 'Unknown error occurred'}
        </Text>
        <Text style={{ color: '#888', fontSize: 12, textAlign: 'center' }}>
          Your data has been preserved. Please restart the app.
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useApp();
  const { setUserId, syncFromFirestore } = useSubscription();
  const segments = useSegments();
  const router = useRouter();

  // isSystemLoading: true until Firestore confirms setup status.
  // NO route decisions are made while this is true.
  const [isSystemLoading, setIsSystemLoading] = useState(true);

  // setupDone: safe default is FALSE — never skip the installer by accident.
  const [setupDone, setSetupDone] = useState(false);

  // Track the previous segment so we can detect when the user leaves /install.
  const prevSegmentRef = useRef<string | null>(null);

  // Loads system/config from Firestore (source of truth).
  // Caches result in AsyncStorage so subsequent cold-starts don't flicker.
  const loadSystemConfig = useCallback(async (reason: string) => {
    console.log('[SystemConfig] Loading — reason:', reason);
    setIsSystemLoading(true);
    try {
      // Fast path: serve cached value immediately so the UI doesn't wait
      const cached = await AsyncStorage.getItem(SETUP_CACHE_KEY);
      if (cached === 'true') {
        console.log('[SystemConfig] Cache hit: setupCompleted=true');
        setSetupDone(true);
        // Keep isSystemLoading=true — Firestore check below is the authority
      }

      // Always verify against Firestore — cache can be stale after an install
      const done = await isSetupComplete();
      console.log('[SystemConfig] Firestore: setupCompleted=', done, '(reason:', reason + ')');

      setSetupDone(done);

      if (done) {
        await AsyncStorage.setItem(SETUP_CACHE_KEY, 'true');
      } else {
        await AsyncStorage.removeItem(SETUP_CACHE_KEY);
      }
    } catch (e) {
      console.error('[SystemConfig] load failed:', e);
      // On error keep setupDone=false (safer: will redirect to /install rather
      // than silently skipping it)
    } finally {
      setIsSystemLoading(false);
    }
  }, []);

  // Initial load on mount
  useEffect(() => {
    void loadSystemConfig('mount');
  }, [loadSystemConfig]);

  // Critical fix: re-fetch when the user navigates AWAY from /install.
  // Without this, setupDone stays false after the installer writes system/config
  // and calls router.replace('/login'), causing an immediate redirect back.
  useEffect(() => {
    const currentSegment = segments[0] as string;
    if (prevSegmentRef.current === 'install' && currentSegment !== 'install') {
      console.log('[SystemConfig] Left /install → re-fetching system config');
      void loadSystemConfig('left-install');
    }
    prevSegmentRef.current = currentSegment;
  }, [segments, loadSystemConfig]);

  useEffect(() => {
    if (user) {
      void setUserId(user.id);
      void syncFromFirestore(user.id);
    }
  }, [user, setUserId, syncFromFirestore]);

  // Route guard — runs only after BOTH app auth state AND system config are resolved.
  useEffect(() => {
    if (isLoading || isSystemLoading) {
      console.log('[AuthGuard] Waiting — isLoading:', isLoading, 'isSystemLoading:', isSystemLoading);
      return;
    }

    const currentSegment = segments[0] as string;
    const inInstall = currentSegment === 'install';
    const inAuthGroup = currentSegment === 'login' || currentSegment === 'register';

    console.log('[AuthGuard] Decision — setupDone:', setupDone, 'segment:', currentSegment, 'user:', !!user);

    if (!setupDone && !inInstall) {
      console.log('[AuthGuard] → /install (setup not complete)');
      router.replace('/install');
      return;
    }

    if (setupDone && inInstall) {
      console.log('[AuthGuard] → / (installer already done, /install is locked)');
      router.replace('/');
      return;
    }

    if (!user && !inAuthGroup && !inInstall) {
      console.log('[AuthGuard] → /login (not authenticated)');
      router.replace('/login');
    } else if (user && inAuthGroup) {
      console.log('[AuthGuard] → / (already authenticated)');
      router.replace('/');
    }
  }, [user, segments, router, isLoading, isSystemLoading, setupDone]);

  useEffect(() => {
    if (!isLoading && !isSystemLoading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoading, isSystemLoading]);

  if (isLoading || isSystemLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <AuthGuard>
      <Stack screenOptions={{ headerBackTitle: "Back" }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="ice-bath-tracker" options={{ headerShown: false }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="marketplace" options={{ headerShown: false }} />
        <Stack.Screen name="trainer" options={{ headerShown: false }} />
        <Stack.Screen name="program-detail" options={{ headerShown: false }} />
        <Stack.Screen name="admin-trainers" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="ai-trainer" options={{ headerShown: false }} />
        <Stack.Screen name="install" options={{ headerShown: false }} />
        <Stack.Screen name="admin-system" options={{ headerShown: false }} />
      </Stack>
    </AuthGuard>
  );
}

export default function RootLayout() {
  useFrameworkReady();
  useEffect(() => { logFirebaseDiagnostic(); }, []);
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <FirebaseDiagnostic />
        <DataMigrationGuard>
          <AppProvider>
            <FirebaseProvider>
              <AdminSettingsSync />
              <SubscriptionProvider>
                <TrainerProvider>
                <TrainingProvider>
                  <RankingProvider>
                    <LeaderboardProvider>
                      <ChallengesProvider>
                        <NotificationsProvider>
                          <ShopProvider>
                            <DaysWithoutProvider>
                              <CommunityProvider>
                                <GestureHandlerRootView style={{ flex: 1 }}>
                                  <StatusBar style="light" />
                                  <RootLayoutNav />
                                </GestureHandlerRootView>
                              </CommunityProvider>
                            </DaysWithoutProvider>
                          </ShopProvider>
                        </NotificationsProvider>
                      </ChallengesProvider>
                    </LeaderboardProvider>
                  </RankingProvider>
                </TrainingProvider>
              </TrainerProvider>
              </SubscriptionProvider>
            </FirebaseProvider>
          </AppProvider>
        </DataMigrationGuard>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
