import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Linking, Platform, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Crown, ExternalLink, Settings as SettingsIcon, X, Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import Colors from '@/constants/colors';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useApp } from '@/contexts/AppContext';

export default function ManageSubscriptionScreen() {
  const router = useRouter();
  const {
    subscriptionState,
    refreshSubscriptionStatus
  } = useSubscription();
  const { adminSettings } = useApp();

  const handleManageSubscription = () => {
    const portalUrl = adminSettings.stripePortalLink || adminSettings.stripePaymentLink;
    if (!portalUrl) {
      Alert.alert('Not configured', 'Billing portal URL has not been set. Please contact support.');
      return;
    }
    Linking.openURL(portalUrl);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return 'Invalid Date';
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Subscription',
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
          headerShadowVisible: false,
        }}
      />
      <View style={styles.container}>
        <LinearGradient
          colors={subscriptionState.isPremium ? ['#1a1a1a', '#0a0a0a'] : [Colors.background, Colors.background]}
          style={styles.gradient}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.statusCard}>
              {subscriptionState.isPremium ? (
                <LinearGradient
                  colors={['#FF6B00', '#FF8C00']}
                  style={styles.premiumHeader}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Crown size={48} color="#FFD700" fill="#FFD700" />
                  <Text style={styles.statusTitle}>Premium Active</Text>
                  <Text style={styles.statusSubtitle}>
                    You have full access to all features
                  </Text>
                </LinearGradient>
              ) : (
                <View style={styles.freeHeader}>
                  <View style={styles.freeIcon}>
                    <X size={32} color={Colors.textTertiary} />
                  </View>
                  <Text style={styles.statusTitle}>Free Tier</Text>
                  <Text style={styles.statusSubtitle}>
                    Upgrade to unlock all premium features
                  </Text>
                  <TouchableOpacity
                    style={styles.upgradeButton}
                    onPress={() => router.push('/paywall' as any)}
                  >
                    <Crown size={20} color="#fff" />
                    <Text style={styles.upgradeButtonText}>Upgrade Now</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {subscriptionState.isPremium && (
              <View style={styles.detailsCard}>
                <Text style={styles.sectionTitle}>Subscription Details</Text>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View style={styles.statusBadge}>
                    <Check size={16} color="#4CAF50" />
                    <Text style={styles.statusBadgeText}>Active</Text>
                  </View>
                </View>

                {subscriptionState.productIdentifier && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Plan</Text>
                    <Text style={styles.detailValue}>
                      {subscriptionState.productIdentifier.includes('monthly') ? 'Monthly' :
                       subscriptionState.productIdentifier.includes('annual') ? 'Annual' : 'Premium'}
                    </Text>
                  </View>
                )}

                {subscriptionState.expirationDate && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      {subscriptionState.willRenew ? 'Renews On' : 'Expires On'}
                    </Text>
                    <Text style={styles.detailValue}>
                      {formatDate(subscriptionState.expirationDate)}
                    </Text>
                  </View>
                )}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Auto-Renew</Text>
                  <Text style={[styles.detailValue, !subscriptionState.willRenew && styles.warningText]}>
                    {subscriptionState.willRenew ? 'Enabled' : 'Disabled'}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.actionsCard}>
              <Text style={styles.sectionTitle}>Manage Subscription</Text>

              {subscriptionState.isPremium ? (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleManageSubscription}
                >
                  <SettingsIcon size={20} color={Colors.accent} />
                  <Text style={styles.actionButtonText}>Manage via Stripe</Text>
                  <ExternalLink size={16} color={Colors.textTertiary} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
              ) : (
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    Subscribe to premium to manage your subscription through Stripe's secure billing portal.
                  </Text>
                </View>
              )}
            </View>

            {subscriptionState.stripeCustomerId && (
              <View style={styles.debugCard}>
                <Text style={styles.debugTitle}>Account Info</Text>
                <Text style={styles.debugText}>
                  Customer ID: {subscriptionState.stripeCustomerId.substring(0, 20)}...
                </Text>
                {subscriptionState.stripeSubscriptionId && (
                  <Text style={styles.debugText}>
                    Subscription ID: {subscriptionState.stripeSubscriptionId.substring(0, 20)}...
                  </Text>
                )}
              </View>
            )}
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
    padding: 20,
    paddingBottom: 40,
  },
  statusCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
  },
  premiumHeader: {
    padding: 32,
    alignItems: 'center',
  },
  freeHeader: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  freeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusTitle: {
    fontSize: 28,
    fontWeight: '900' as const,
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  statusSubtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  upgradeButton: {
    marginTop: 20,
    backgroundColor: Colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  upgradeButtonText: {
    fontSize: 16,
    fontWeight: '900' as const,
    color: '#fff',
  },
  detailsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900' as const,
    color: Colors.text,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailLabel: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  detailValue: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '700' as const,
  },
  warningText: {
    color: '#FFA500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#4CAF50',
  },
  actionsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  infoBox: {
    padding: 16,
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  debugCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  debugText: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
