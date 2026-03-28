import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Crown, Lock } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import Colors from '@/constants/colors';
import { useSubscription } from '@/contexts/SubscriptionContext';

interface PremiumGateProps {
  children: React.ReactNode;
  feature?: string;
  message?: string;
}

export function PremiumGate({ children, feature, message }: PremiumGateProps) {
  const router = useRouter();
  const { subscriptionState } = useSubscription();

  if (subscriptionState.isPremium) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(255, 107, 0, 0.1)', 'rgba(255, 140, 0, 0.1)']}
        style={styles.gradient}
      >
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Crown size={48} color="#FFD700" fill="#FFD700" />
            <View style={styles.lockBadge}>
              <Lock size={20} color="#fff" />
            </View>
          </View>
          
          <Text style={styles.title}>Premium Feature</Text>
          
          <Text style={styles.message}>
            {message ?? `Unlock ${feature ?? 'this content'} with Premium`}
          </Text>

          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={() => router.push('/paywall' as any)}
          >
            <Crown size={20} color="#fff" fill="#fff" />
            <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
          </TouchableOpacity>

          <Text style={styles.price}>Starting at £9.99/month</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

export function usePremiumFeature() {
  const router = useRouter();
  const { subscriptionState } = useSubscription();

  const requirePremium = (onSuccess: () => void) => {
    if (subscriptionState.isPremium) {
      onSuccess();
    } else {
      router.push('/paywall' as any);
    }
  };

  return {
    isPremium: subscriptionState.isPremium,
    requirePremium,
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    maxWidth: 400,
  },
  iconContainer: {
    position: 'relative',
    marginBottom: 24,
  },
  lockBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.background,
  },
  title: {
    fontSize: 28,
    fontWeight: '900' as const,
    color: Colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  upgradeButton: {
    backgroundColor: Colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  upgradeButtonText: {
    fontSize: 17,
    fontWeight: '900' as const,
    color: '#fff',
  },
  price: {
    fontSize: 14,
    color: Colors.textTertiary,
  },
});
