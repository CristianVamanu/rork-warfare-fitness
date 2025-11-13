import React, { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { Crown, Check } from 'lucide-react-native';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTraining } from '@/contexts/TrainingContext';

export default function PurchaseScreen() {
  const { subscriptionTier, beginCheckout, adminSettings, user, isInFreeTrial, getDaysRemainingInTrial } = useApp();
  const insets = useSafeAreaInsets();

  const prices = adminSettings.subscriptionPrices;
  const trialDays = adminSettings.subscriptionPrices?.freeTrialDays ?? 7;
  
  const daysRemaining = getDaysRemainingInTrial();
  const inTrial = isInFreeTrial();

  const tiers: { id: 'free'|'premium'; title: string; price: string; perks: string[]; badge?: string }[] = [
    { 
      id: 'free', 
      title: 'Free Trial', 
      price: '$0', 
      perks: inTrial 
        ? [`${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`, 'Access to all programs', 'All features unlocked', 'Community access', 'Progress tracking']
        : ['Trial has ended', 'Subscribe to continue'], 
      badge: inTrial ? 'Active Trial' : 'Expired'
    },
    { 
      id: 'premium', 
      title: 'Premium', 
      price: `${prices.premium}/mo`, 
      badge: subscriptionTier === 'premium' ? 'Current Plan' : undefined, 
      perks: ['Unlimited access to all programs', 'All workout days unlocked', 'Advanced analytics', 'Leaderboards', 'Progress tracking', 'Priority support', 'Cancel anytime'] 
    },
  ];

  return (
    <>
      <Stack.Screen options={{ title: 'Subscription', headerStyle: { backgroundColor: Colors.background }, headerTintColor: Colors.text, headerShadowVisible: false }} />
      <ScrollView contentContainerStyle={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.headerSection}>
          <View style={styles.iconCircle}>
            <Crown size={32} color={Colors.accent} />
          </View>
          <Text style={styles.title}>{inTrial ? 'Upgrade to Premium' : 'Subscribe to Continue'}</Text>
          <Text style={styles.sub}>
            {inTrial 
              ? `You have ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left in your free trial. Subscribe now for unlimited access.`
              : `Your ${trialDays}-day free trial has ended. Subscribe to continue accessing all features.`}
          </Text>
        </View>

        {tiers.map(t => (
          <View key={t.id} style={[styles.card, subscriptionTier === t.id && styles.cardActive]}>
            <View style={styles.rowHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.cardTitle}>{t.title}</Text>
                  {t.badge && <View style={styles.badge}><Text style={styles.badgeText}>{t.badge}</Text></View>}
                </View>
                {subscriptionTier === t.id && <Text style={styles.currentBadge}>Current Plan</Text>}
              </View>
              <Text style={styles.price}>{t.price}</Text>
            </View>
            <View style={{ gap: 8, marginTop: 12 }}>
              {t.perks.map((p, i) => (
                <View key={i} style={styles.perkRow}>
                  <Check size={16} color={Colors.accent} />
                  <Text style={styles.perk}>{p}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={[styles.btn, subscriptionTier === t.id && styles.btnActive]} onPress={() => beginCheckout(t.id)}>
              <Text style={[styles.btnText, subscriptionTier === t.id && styles.btnTextActive]}>{subscriptionTier === t.id ? 'Current Plan' : 'Select Plan'}</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { padding: 20, backgroundColor: Colors.background },
  headerSection: { alignItems: 'center', marginBottom: 24 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 2, borderColor: Colors.border },
  title: { color: Colors.text, fontSize: 26, fontWeight: '900' as const, textAlign: 'center' },
  sub: { color: Colors.textSecondary, marginTop: 8, fontSize: 14, fontWeight: '600' as const, textAlign: 'center', lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statBox: { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  statNumber: { color: Colors.accent, fontSize: 32, fontWeight: '900' as const },
  statLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' as const, marginTop: 4, textTransform: 'uppercase' as const },
  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 2, borderColor: Colors.border, padding: 18, marginBottom: 14 },
  cardActive: { borderColor: Colors.accent, backgroundColor: '#F0F9FF' },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { color: Colors.text, fontSize: 18, fontWeight: '800' as const },
  currentBadge: { color: Colors.accent, fontSize: 11, fontWeight: '800' as const, marginTop: 4, textTransform: 'uppercase' as const },
  price: { color: Colors.accent, fontWeight: '900' as const, fontSize: 20 },
  perkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  perk: { color: Colors.textSecondary, fontWeight: '600' as const, flex: 1, fontSize: 14 },
  btn: { marginTop: 16, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  btnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  btnText: { color: Colors.text, fontWeight: '900' as const, fontSize: 15 },
  btnTextActive: { color: Colors.background },
  badge: { backgroundColor: '#10B981', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' as const, textTransform: 'uppercase' as const },
});
