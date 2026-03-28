import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Platform, Linking } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Crown, Check, X, Zap, Lock, Flame, Trophy, Video, Calendar } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import Colors from '@/constants/colors';
import { useSubscription } from '@/contexts/SubscriptionContext';

const PREMIUM_FEATURES = [
  { icon: Trophy, text: 'Full access to all workout days (7+ days)' },
  { icon: Flame, text: 'Complete all challenges and earn rewards' },
  { icon: Video, text: 'Full access to ice bath protocols & videos' },
  { icon: Zap, text: 'Premium community features' },
  { icon: Lock, text: 'Early access to new features' },
];

const FREE_FEATURES = [
  { text: 'First 7 days of any program', included: true },
  { text: 'Community forum access', included: true },
  { text: 'Basic challenges (first 7 days)', included: true },
  { text: 'Days 8+ of programs', included: false },
  { text: 'Advanced challenges', included: false },
];

export default function PaywallScreen() {
  const router = useRouter();
  const {
    subscriptionState,
    getDaysRemainingInTrial
  } = useSubscription();

  const handleUpgrade = () => {
    if (Platform.OS === 'web') {
      Linking.openURL('https://billing.stripe.com/p/login/test_123');
    } else {
      Linking.openURL('https://billing.stripe.com/p/login/test_123');
    }
  };

  const handleClose = () => {
    router.back();
  };

  if (subscriptionState.isPremium) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: false,
            presentation: 'modal'
          }}
        />
        <View style={styles.container}>
          <LinearGradient
            colors={['#1a1a1a', '#0a0a0a']}
            style={styles.gradient}
          >
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <X size={24} color={Colors.text} />
            </TouchableOpacity>

            <View style={styles.successContainer}>
              <View style={styles.crownContainer}>
                <Crown size={64} color="#FFD700" fill="#FFD700" />
              </View>
              <Text style={styles.successTitle}>You&apos;re Premium!</Text>
              <Text style={styles.successSubtitle}>
                Enjoy unlimited access to all exclusive content
              </Text>

              <TouchableOpacity style={styles.continueButton} onPress={handleClose}>
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
      <Stack.Screen
        options={{
          headerShown: false,
          presentation: 'modal'
        }}
      />
      <View style={styles.container}>
        <LinearGradient
          colors={['#1a1a1a', '#0a0a0a']}
          style={styles.gradient}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <X size={24} color={Colors.text} />
            </TouchableOpacity>

            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Crown size={48} color="#FFD700" fill="#FFD700" />
              </View>
              <Text style={styles.title}>Unlock Premium</Text>
              <Text style={styles.subtitle}>
                Get full access to all workout days, challenges, ice bath protocols, and exclusive content
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
                  <Text style={styles.tierPrice}>£0</Text>
                </View>
                <View style={styles.featuresList}>
                  {FREE_FEATURES.map((feature, index) => (
                    <View key={index} style={styles.featureItem}>
                      {feature.included ? (
                        <Check size={18} color={Colors.accent} />
                      ) : (
                        <X size={18} color={Colors.textTertiary} />
                      )}
                      <Text
                        style={[
                          styles.featureText,
                          !feature.included && styles.featureTextDisabled
                        ]}
                      >
                        {feature.text}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={[styles.tierCard, styles.premiumCard]}>
                <LinearGradient
                  colors={['#FF6B00', '#FF8C00']}
                  style={styles.premiumGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View style={styles.premiumBadge}>
                    <Crown size={16} color="#000" fill="#FFD700" />
                    <Text style={styles.premiumBadgeText}>PREMIUM</Text>
                  </View>

                  <View style={styles.tierHeader}>
                    <Text style={[styles.tierName, styles.premiumTierName]}>Premium</Text>
                    <View>
                      <Text style={[styles.tierPrice, styles.premiumTierPrice]}>
                        £9.99
                      </Text>
                      <Text style={styles.tierPeriod}>per month</Text>
                      <Text style={styles.trialText}>7-day free trial included</Text>
                    </View>
                  </View>

                  <View style={styles.featuresList}>
                    {PREMIUM_FEATURES.map((Feature, index) => (
                      <View key={index} style={styles.featureItem}>
                        <Feature.icon size={18} color="#fff" />
                        <Text style={[styles.featureText, styles.premiumFeatureText]}>
                          {Feature.text}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={styles.subscribeButton}
                    onPress={handleUpgrade}
                  >
                    <Crown size={20} color="#FF6B00" fill="#FF6B00" />
                    <Text style={styles.subscribeButtonText}>Subscribe with Stripe</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            </View>

            <Text style={styles.disclaimer}>
              Cancel anytime. Subscription automatically renews unless cancelled 24 hours before the end of the current period. Payment will be processed through Stripe.
            </Text>
          </ScrollView>
        </LinearGradient>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  gradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '900' as const,
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  tiersContainer: {
    gap: 20,
    marginBottom: 24,
  },
  tierCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  premiumCard: {
    padding: 0,
    borderColor: '#FF6B00',
    overflow: 'hidden',
  },
  premiumGradient: {
    padding: 24,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
    marginBottom: 16,
  },
  premiumBadgeText: {
    fontSize: 12,
    fontWeight: '900' as const,
    color: '#000',
    letterSpacing: 1,
  },
  tierHeader: {
    marginBottom: 20,
  },
  tierName: {
    fontSize: 24,
    fontWeight: '900' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  premiumTierName: {
    color: '#fff',
  },
  tierPrice: {
    fontSize: 32,
    fontWeight: '900' as const,
    color: Colors.text,
  },
  premiumTierPrice: {
    color: '#fff',
  },
  tierPeriod: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
  },
  trialText: {
    fontSize: 12,
    color: '#FFD700',
    marginTop: 4,
    fontWeight: '700' as const,
  },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.accent + '40',
  },
  trialBannerText: {
    fontSize: 14,
    color: Colors.accent,
    fontWeight: '700' as const,
    flex: 1,
  },
  featuresList: {
    gap: 12,
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 15,
    color: Colors.text,
    flex: 1,
  },
  featureTextDisabled: {
    color: Colors.textTertiary,
    textDecorationLine: 'line-through',
  },
  premiumFeatureText: {
    color: '#fff',
  },
  subscribeButton: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  subscribeButtonText: {
    fontSize: 17,
    fontWeight: '900' as const,
    color: '#FF6B00',
  },
  disclaimer: {
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  crownContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 36,
    fontWeight: '900' as const,
    color: Colors.text,
    marginBottom: 12,
  },
  successSubtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  continueButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 12,
  },
  continueButtonText: {
    fontSize: 17,
    fontWeight: '900' as const,
    color: Colors.background,
  },
});
