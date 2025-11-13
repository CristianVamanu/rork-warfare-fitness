import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Check, Zap, CreditCard, Shield } from 'lucide-react-native';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';

export default function ManageSubscriptionScreen() {
  const { subscriptionTier, beginCheckout, adminSettings, user, processPaymentSuccess } = useApp();

  const handleTestPayment = () => {
    Alert.alert(
      'Test Payment',
      'Simulate a successful payment for testing purposes? This will activate premium subscription.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate Premium',
          onPress: () => {
            const tierPrice = parseFloat(adminSettings.subscriptionPrices.premium) || 49;
            processPaymentSuccess('premium', tierPrice);
          }
        },
      ]
    );
  };

  const tiers: { id: 'free'|'premium'; title: string; price: string; perks: string[] }[] = [
    { id: 'free', title: 'Free', price: '$0', perks: ['Limited access', 'First 7 days only', 'Community access'] },
    { id: 'premium', title: 'Premium', price: '$49/mo', perks: ['7-day free trial', 'Unlock all programs', 'Full access to all days', 'Advanced analytics', 'Priority support'] },
  ];

  return (
    <>
      <Stack.Screen options={{ title: 'Manage Subscription', headerStyle: { backgroundColor: Colors.background }, headerTintColor: Colors.text, headerShadowVisible: false }} />
      <ScrollView style={styles.root}>
        {tiers.map(t => (
          <View key={t.id} style={[styles.card, subscriptionTier === t.id && styles.cardActive]}>
            <View style={styles.rowHeader}>
              <Text style={styles.cardTitle}>{t.title}</Text>
              <Text style={styles.price}>{t.price}</Text>
            </View>
            <View style={{ gap: 4, marginTop: 6 }}>
              {t.perks.map((p, i) => (
                <Text key={i} style={styles.perk}><Check size={12} color={Colors.accent} /> {p}</Text>
              ))}
            </View>
            <TouchableOpacity style={[styles.btn, subscriptionTier === t.id && styles.btnActive]} onPress={() => beginCheckout(t.id)}>
              <Text style={[styles.btnText, subscriptionTier === t.id && styles.btnTextActive]}>{subscriptionTier === t.id ? 'Current Plan' : 'Switch'}</Text>
            </TouchableOpacity>
          </View>
        ))}
        <View style={styles.paymentInfo}>
          <CreditCard size={18} color={Colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.paymentTitle}>Payment Provider</Text>
            <Text style={styles.paymentText}>
              {adminSettings.payments.activeProvider === 'paypal' ? 'PayPal' : 'Stripe'}
            </Text>
          </View>
        </View>
        <View style={styles.hintRow}><Zap size={16} color={Colors.accent} /><Text style={styles.hint}>Upgrading unlocks more programs instantly.</Text></View>
        
        {user?.isAdmin && (
          <View style={styles.adminSection}>
            <View style={styles.adminHeader}>
              <Shield size={18} color='#F59E0B' />
              <Text style={styles.adminTitle}>Admin Testing</Text>
            </View>
            <Text style={styles.adminDesc}>For testing: Simulate successful payment without Stripe</Text>
            <TouchableOpacity style={styles.testBtn} onPress={handleTestPayment}>
              <Text style={styles.testBtnText}>Test: Activate Premium</Text>
            </TouchableOpacity>
          </View>
        )}
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background, padding: 16 },
  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 12 },
  cardActive: { borderColor: Colors.accent },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: Colors.text, fontSize: 16, fontWeight: '800' as const },
  price: { color: Colors.accent, fontWeight: '900' as const },
  perk: { color: Colors.textSecondary, fontWeight: '600' as const },
  btn: { marginTop: 12, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  btnText: { color: Colors.text, fontWeight: '900' as const },
  btnTextActive: { color: Colors.background },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  hint: { color: Colors.textSecondary, fontWeight: '700' as const },
  paymentInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, marginTop: 12 },
  paymentTitle: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' as const, textTransform: 'uppercase' as const },
  paymentText: { color: Colors.text, fontSize: 15, fontWeight: '800' as const, marginTop: 2 },
  adminSection: { backgroundColor: '#FEF3C7', borderRadius: 12, borderWidth: 2, borderColor: '#F59E0B', padding: 16, marginTop: 20 },
  adminHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  adminTitle: { color: '#92400E', fontSize: 16, fontWeight: '800' as const },
  adminDesc: { color: '#92400E', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  testBtn: { backgroundColor: '#F59E0B', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  testBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' as const },
});
