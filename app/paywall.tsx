import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Platform, Linking, ActivityIndicator, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Crown, Check, X, Zap, Lock, Flame, Trophy, Video, Calendar } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import Colors from '@/constants/colors';
import { useSubscription, RC_MONTHLY_ID } from '@/contexts/SubscriptionContext';

const PREMIUM_FEATURES = [
  { icon: Trophy, text: 'Full access to all workout days' },
  { icon: Flame, text: 'Complete all challenges & earn rewards' },
  { icon: Video, text: 'Ice bath protocols & videos' },
  { icon: Zap, text: 'Premium community features' },
  { icon: Lock, text: 'Trainer programs with no paywall' },
];

const FREE_FEATURES = [
  { text: 'First 7 days of any program', included: true },
  { text: 'Community forum access', included: true },
  { text: 'Basic challenges', included: true },
  { text: 'Days 8+ of programs', included: false },
  { text: 'Advanced challenges', included: false },
];

export default function PaywallScreen() {
  const router = useRouter();
  const { subscriptionState, getDaysRemainingInTrial, purchaseNative, restorePurchases } = useSubscription();
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    if (Platform.OS === 'web') {
      // On web: redirect to Stripe checkout (set this URL in your Stripe dashboard)
      Linking.openURL('https://buy.stripe.com/YOUR_STRIPE_PAYMENT_LINK');
      return;
    }
    setLoading(true);
    try {
      const success = await purchaseNative(RC_MONTHLY_ID);
      if (success) router.back();
    } catch {
      Alert.alert('Error', 'Purchase failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    const restored = await restorePurchases();
    setLoading(false);
    if (restored) {
      Alert.alert('Restored!', 'Your subscription has been restored.');
      router.back();
    } else {
      Alert.alert('Nothing to restore', 'No active subscription found.');
    }
  };

  if (subscriptionState.isPremium) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
        <View style={styles.container}>
          <LinearGradient colors={['#1a1a1a', '#0a0a0a']} style={styles.gradient}>
            <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
              <X size={24} color={Colors.text} />
            </TouchableOpacity>
            <View style={styles.successContainer}>
              <Crown size={64} color="#FFD700" fill="#FFD700" />
              <Text style={styles.successTitle}>You're Premium!</Text>
              <Text style={styles.successSubtitle}>Enjoy unlimited access to all content</Text>
              <TouchableOpacity style={styles.continueButton} onPress={() => router.back()}>
                <Text style={styles.continueButtonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <View style={styles.container}>
        <LinearGradient colors={['#1a1a1a', '#0a0a0a']} style={styles.gradient}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
              <X size={24} color={Colors.text} />
            </TouchableOpacity>

            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Crown size={48} color="#FFD700" fill="#FFD700" />
              </View>
              <Text style={styles.title}>Unlock Premium</Text>
              <Text style={styles.subtitle}>
                Full access to all workouts, challenges, ice bath protocols, and exclusive content
              </Text>
              {subscriptionState.isInTrialPeriod && getDaysRemainingInTrial() !== null && (
                <View style={styles.trialBanner}>
                  <Calendar size={18} color={Colors.accent} />
                  <Text style={styles.trialBannerText}>
                    {getDaysRemainingInTrial()} {getDaysRemainingInTrial() === 1 ? 'day' : 'days'} left in your free trial
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.tiersContainer}>
              <View style={styles.tierCard}>
                <View style={styles.tierHeader}>
                  <Text style={styles.tierName}>Free</Text>
                  <Text style={styles.tierPrice}>$0</Text>
                </View>
                {FREE_FEATURES.map((f, i) => (
                  <View key={i} style={styles.featureItem}>
                    {f.included ? <Check size={18} color={Colors.accent} /> : <X size={18} color={Colors.textTertiary} />}
                    <Text style={[styles.featureText, !f.included && styles.featureTextDisabled]}>{f.text}</Text>
                  </View>
                ))}
              </View>

              <View style={[styles.tierCard, styles.premiumCard]}>
                <LinearGradient colors={[Colors.accentDark, Colors.accent]} style={styles.premiumGradient}>
                  <View style={styles.premiumBadge}>
                    <Crown size={14} color="#000" fill="#000" />
                    <Text style={styles.premiumBadgeText}>PREMIUM</Text>
                  </View>
                  <View style={styles.tierHeader}>
                    <Text style={[styles.tierName, { color: '#000' }]}>Premium</Text>
                    <View>
                      <Text style={[styles.tierPrice, { color: '#000' }]}>$9.99</Text>
                      <Text style={[styles.tierPeriod, { color: 'rgba(0,0,0,0.6)' }]}>per month</Text>
                      <Text style={[styles.trialText, { color: '#000' }]}>7-day free trial</Text>
                    </View>
                  </View>
                  {PREMIUM_FEATURES.map((F, i) => (
                    <View key={i} style={styles.featureItem}>
                      <F.icon size={18} color="#000" />
                      <Text style={[styles.featureText, { color: '#000' }]}>{F.text}</Text>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.subscribeButton} onPress={handleUpgrade} disabled={loading}>
                    {loading
                      ? <ActivityIndicator color={Colors.accent} />
                      : <>
                          <Crown size={20} color={Colors.accent} fill={Colors.accent} />
                          <Text style={styles.subscribeButtonText}>
                            {Platform.OS === 'web' ? 'Subscribe — $9.99/mo' : 'Start Free Trial'}
                          </Text>
                        </>
                    }
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            </View>

            {Platform.OS !== 'web' && (
              <TouchableOpacity onPress={handleRestore} style={styles.restoreBtn}>
                <Text style={styles.restoreText}>Restore purchases</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.disclaimer}>
              {Platform.OS === 'web'
                ? 'Payment processed securely via Stripe. Cancel anytime.'
                : 'Payment charged to your App Store / Google Play account. Cancel anytime in your device settings.'}
            </Text>
          </ScrollView>
        </LinearGradient>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  gradient: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
  closeButton: { position: 'absolute', top: 16, right: 20, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', marginBottom: 32 },
  iconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,215,0,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 32, fontWeight: '900' as const, color: Colors.text, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 16, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
  trialBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(245,166,35,0.15)', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, marginTop: 16, borderWidth: 1, borderColor: Colors.accent + '40' },
  trialBannerText: { fontSize: 14, color: Colors.accent, fontWeight: '700' as const },
  tiersContainer: { gap: 20, marginBottom: 24 },
  tierCard: { backgroundColor: Colors.surface, borderRadius: 20, padding: 24, borderWidth: 2, borderColor: Colors.border, gap: 12 },
  premiumCard: { padding: 0, borderColor: Colors.accent, overflow: 'hidden' },
  premiumGradient: { padding: 24, gap: 12 },
  premiumBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#000', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 4 },
  premiumBadgeText: { fontSize: 12, fontWeight: '900' as const, color: Colors.accent, letterSpacing: 1 },
  tierHeader: { marginBottom: 8 },
  tierName: { fontSize: 24, fontWeight: '900' as const, color: Colors.text, marginBottom: 4 },
  tierPrice: { fontSize: 32, fontWeight: '900' as const, color: Colors.text },
  tierPeriod: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  trialText: { fontSize: 12, color: Colors.accent, marginTop: 4, fontWeight: '700' as const },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontSize: 15, color: Colors.text, flex: 1 },
  featureTextDisabled: { color: Colors.textTertiary, textDecorationLine: 'line-through' },
  subscribeButton: { backgroundColor: '#000', paddingVertical: 16, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  subscribeButtonText: { fontSize: 17, fontWeight: '900' as const, color: Colors.accent },
  restoreBtn: { alignItems: 'center', paddingVertical: 12 },
  restoreText: { color: Colors.textSecondary, fontSize: 14 },
  disclaimer: { fontSize: 12, color: Colors.textTertiary, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 16 },
  successTitle: { fontSize: 36, fontWeight: '900' as const, color: Colors.text },
  successSubtitle: { fontSize: 16, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  continueButton: { backgroundColor: Colors.accent, paddingHorizontal: 48, paddingVertical: 16, borderRadius: 12, marginTop: 16 },
  continueButtonText: { fontSize: 17, fontWeight: '900' as const, color: Colors.background },
});
