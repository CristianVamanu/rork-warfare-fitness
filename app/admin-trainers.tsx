import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, UserCheck, UserX, Shield } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { FontSize, FontWeight } from '@/constants/typography';

export default function AdminTrainersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { allUsers, promoteToTrainer, revokeTrainer } = useApp();

  const trainers = allUsers.filter(u => u.isTrainer);
  const regularUsers = allUsers.filter(u => !u.isTrainer && !u.isAdmin);

  const handlePromote = (userId: string, name: string) => {
    Alert.alert('Promote to Trainer', `Give trainer access to ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Promote', onPress: () => promoteToTrainer(userId) },
    ]);
  };

  const handleRevoke = (userId: string, name: string) => {
    Alert.alert('Revoke Trainer', `Remove trainer access from ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Revoke', style: 'destructive', onPress: () => revokeTrainer(userId) },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>MANAGE TRAINERS</Text>
        <Shield size={22} color={Colors.accent} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>ACTIVE TRAINERS ({trainers.length})</Text>
        {trainers.length === 0 && (
          <Text style={styles.empty}>No trainers yet. Promote users below.</Text>
        )}
        {trainers.map(u => (
          <View key={u.id} style={styles.userCard}>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{u.name || u.email}</Text>
              <Text style={styles.userEmail}>{u.email}</Text>
              <Text style={styles.userRevenue}>Revenue split: {u.trainerRevenueSplit ?? 70}%</Text>
            </View>
            <TouchableOpacity style={styles.revokeBtn} onPress={() => handleRevoke(u.id, u.name || u.email)}>
              <UserX size={16} color={Colors.danger} />
              <Text style={styles.revokeBtnText}>Revoke</Text>
            </TouchableOpacity>
          </View>
        ))}

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
          ALL USERS ({regularUsers.length})
        </Text>
        {regularUsers.length === 0 && (
          <Text style={styles.empty}>No users registered yet.</Text>
        )}
        {regularUsers.map(u => (
          <View key={u.id} style={styles.userCard}>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{u.name || u.email}</Text>
              <Text style={styles.userEmail}>{u.email}</Text>
            </View>
            <TouchableOpacity style={styles.promoteBtn} onPress={() => handlePromote(u.id, u.name || u.email)}>
              <UserCheck size={14} color={Colors.accent} />
              <Text style={styles.promoteBtnText}>Promote</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: { color: Colors.text, fontWeight: FontWeight.black, fontSize: FontSize.xl, letterSpacing: 1.5 },
  content: { flex: 1, paddingHorizontal: 16 },
  sectionTitle: {
    color: Colors.accent,
    fontWeight: FontWeight.black,
    fontSize: FontSize.sm,
    letterSpacing: 2,
    marginBottom: 10,
  },
  empty: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: 16 },
  userCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  userInfo: { flex: 1 },
  userName: { color: Colors.text, fontWeight: FontWeight.semibold, fontSize: FontSize.md },
  userEmail: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2 },
  userRevenue: { color: Colors.accent, fontSize: FontSize.xs, marginTop: 4 },
  promoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.accent + '22',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  promoteBtnText: { color: Colors.accent, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  revokeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.danger + '22',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  revokeBtnText: { color: Colors.danger, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
});
