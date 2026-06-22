import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { trpc, trpcClient } from "@/lib/trpc";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, ActivityIndicator, Text, Alert } from "react-native";

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

import { runMigrations, verifyDataIntegrity } from '@/lib/data-migration'
import { useFrameworkReady } from '@/hooks/useFrameworkReady';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient();

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

  useEffect(() => {
    if (user) {
      // RevenueCat: link the user ID so purchases are associated correctly
      void setUserId(user.id);
      // Web/Stripe: pull live subscription status from Firestore
      void syncFromFirestore(user.id);
    }
  }, [user, setUserId, syncFromFirestore]);

  useEffect(() => {
    if (isLoading) return;
    
    const currentSegment = segments[0] as string;
    const inAuthGroup = currentSegment === 'login' || currentSegment === 'register';
    
    if (!user && !inAuthGroup) {
      router.replace('/login');
    } else if (user && inAuthGroup) {
      router.replace('/');
    }
  }, [user, segments, router, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoading]);

  if (isLoading) {
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
      </Stack>
    </AuthGuard>
  );
}

export default function RootLayout() {
  useFrameworkReady();
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
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
