import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Users, Crown, Mail, Trash2, Ban, Volume2, VolumeX, Check } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '@/contexts/AppContext';

import Colors from '@/constants/colors';


interface StoredUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  subscriptionTier?: 'free' | 'premium';
  isBanned?: boolean;
  isMuted?: boolean;
  freeTrialActive?: boolean;
}

const USERS_STORAGE_KEY = 'warfare_all_users';

export default function AdminSubscriptionsScreen() {
  const { setTier } = useApp();
  const [allUsers, setAllUsers] = useState<StoredUser[]>([]);
  const [premiumUsers, setPremiumUsers] = useState<StoredUser[]>([]);
  const [freeTrialUsers, setFreeTrialUsers] = useState<StoredUser[]>([]);
  const [freeUsers, setFreeUsers] = useState<StoredUser[]>([]);

  const loadUsers = async () => {
    try {
      const usersData = await AsyncStorage.getItem(USERS_STORAGE_KEY);
      if (usersData) {
        const users: StoredUser[] = JSON.parse(usersData);
        setAllUsers(users);
        const paying = users.filter(u => u.subscriptionTier === 'premium' && !u.freeTrialActive);
        const trial = users.filter(u => u.freeTrialActive === true);
        const free = users.filter(u => (u.subscriptionTier === 'free' || !u.subscriptionTier) && !u.freeTrialActive);
        setPremiumUsers(paying);
        setFreeTrialUsers(trial);
        setFreeUsers(free);
        console.log('[Admin] Loaded', paying.length, 'premium,', trial.length, 'trial,', free.length, 'free users');
      }
    } catch (error) {
      console.error('[Admin] Error loading users:', error);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleBanUser = async (user: StoredUser) => {
    Alert.alert(
      'Ban User',
      `Are you sure you want to ban ${user.name}? They will not be able to access the app.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ban',
          style: 'destructive',
          onPress: async () => {
            try {
              const usersData = await AsyncStorage.getItem(USERS_STORAGE_KEY);
              if (usersData) {
                const allUsers: StoredUser[] = JSON.parse(usersData);
                const updated = allUsers.map(u => 
                  u.id === user.id ? { ...u, isBanned: true } : u
                );
                await AsyncStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
                await loadUsers();
                Alert.alert('Success', `${user.name} has been banned.`);
                console.log('[Admin] Banned user:', user.email);
              }
            } catch (error) {
              console.error('[Admin] Error banning user:', error);
              Alert.alert('Error', 'Failed to ban user.');
            }
          },
        },
      ]
    );
  };

  const handleMuteUser = async (user: StoredUser) => {
    const action = user.isMuted ? 'unmute' : 'mute';
    Alert.alert(
      `${action.charAt(0).toUpperCase() + action.slice(1)} User`,
      `Are you sure you want to ${action} ${user.name}? ${user.isMuted ? 'They will be able to post and comment again.' : 'They will not be able to post or comment.'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action.charAt(0).toUpperCase() + action.slice(1),
          style: user.isMuted ? 'default' : 'destructive',
          onPress: async () => {
            try {
              const usersData = await AsyncStorage.getItem(USERS_STORAGE_KEY);
              if (usersData) {
                const allUsers: StoredUser[] = JSON.parse(usersData);
                const updated = allUsers.map(u => 
                  u.id === user.id ? { ...u, isMuted: !u.isMuted } : u
                );
                await AsyncStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
                await loadUsers();
                Alert.alert('Success', `${user.name} has been ${action}d.`);
                console.log(`[Admin] ${action}d user:`, user.email);
              }
            } catch (error) {
              console.error(`[Admin] Error ${action}ing user:`, error);
              Alert.alert('Error', `Failed to ${action} user.`);
            }
          },
        },
      ]
    );
  };

  const handleDeleteUser = async (user: StoredUser) => {
    Alert.alert(
      'Delete User Account',
      `Are you sure you want to permanently delete ${user.name}'s account? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const usersData = await AsyncStorage.getItem(USERS_STORAGE_KEY);
              if (usersData) {
                const allUsers: StoredUser[] = JSON.parse(usersData);
                const updated = allUsers.filter(u => u.id !== user.id);
                await AsyncStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
                await loadUsers();
                Alert.alert('Success', `${user.name}'s account has been deleted.`);
                console.log('[Admin] Deleted user:', user.email);
              }
            } catch (error) {
              console.error('[Admin] Error deleting user:', error);
              Alert.alert('Error', 'Failed to delete user.');
            }
          },
        },
      ]
    );
  };

  const handleUpgradeToPremium = async (user: StoredUser) => {
    Alert.alert(
      'Upgrade to Premium',
      `Grant ${user.name} premium access? This will give them full access to all features.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Grant Premium',
          style: 'default',
          onPress: async () => {
            try {
              const usersData = await AsyncStorage.getItem(USERS_STORAGE_KEY);
              if (usersData) {
                const users: StoredUser[] = JSON.parse(usersData);
                const updated = users.map(u => 
                  u.id === user.id ? { ...u, subscriptionTier: 'premium' as const, freeTrialActive: false } : u
                );
                await AsyncStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
                
                const tierKey = 'warfare_subscription_tier';
                await AsyncStorage.setItem(tierKey, 'premium');
                
                await loadUsers();
                Alert.alert('Success', `${user.name} now has premium access!`);
                console.log('[Admin] Upgraded user to premium:', user.email);
              }
            } catch (error) {
              console.error('[Admin] Error upgrading user:', error);
              Alert.alert('Error', 'Failed to upgrade user.');
            }
          },
        },
      ]
    );
  };

  const handleDowngradeToFree = async (user: StoredUser) => {
    Alert.alert(
      'Downgrade to Free',
      `Remove premium access from ${user.name}? They will lose access to premium features.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Downgrade',
          style: 'destructive',
          onPress: async () => {
            try {
              const usersData = await AsyncStorage.getItem(USERS_STORAGE_KEY);
              if (usersData) {
                const users: StoredUser[] = JSON.parse(usersData);
                const updated = users.map(u => 
                  u.id === user.id ? { ...u, subscriptionTier: 'free' as const, freeTrialActive: false } : u
                );
                await AsyncStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
                await loadUsers();
                Alert.alert('Success', `${user.name} has been downgraded to free tier.`);
                console.log('[Admin] Downgraded user to free:', user.email);
              }
            } catch (error) {
              console.error('[Admin] Error downgrading user:', error);
              Alert.alert('Error', 'Failed to downgrade user.');
            }
          },
        },
      ]
    );
  };



  const renderUserCard = (user: StoredUser, showUpgrade: boolean = false) => (
    <View key={user.id} style={styles.userCard}>
      <View style={styles.userInfo}>
        <Crown size={16} color={user.subscriptionTier === 'premium' ? '#10B981' : '#F59E0B'} />
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>{user.name}</Text>
          <View style={styles.userEmailRow}>
            <Mail size={12} color={Colors.textTertiary} />
            <Text style={styles.userEmail}>{user.email}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <Text style={[styles.tierBadge, user.subscriptionTier === 'premium' && styles.tierBadgePremium]}>
              {user.subscriptionTier === 'premium' ? '👑 Premium' : '🆓 Free'}
            </Text>
            {user.isBanned && <Text style={styles.statusBadge}>🚫 Banned</Text>}
            {user.isMuted && <Text style={styles.statusBadge}>🔇 Muted</Text>}
          </View>
        </View>
      </View>
      <View style={styles.actions}>
        {showUpgrade ? (
          <TouchableOpacity 
            style={[styles.actionBtn, styles.upgradeBtn]} 
            onPress={() => handleUpgradeToPremium(user)}
          >
            <Check size={18} color={Colors.background} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={styles.actionBtn} 
            onPress={() => handleDowngradeToFree(user)}
          >
            <Crown size={18} color={Colors.warning} />
          </TouchableOpacity>
        )}
        <TouchableOpacity 
          style={styles.actionBtn} 
          onPress={() => handleMuteUser(user)}
        >
          {user.isMuted ? (
            <Volume2 size={18} color={Colors.textSecondary} />
          ) : (
            <VolumeX size={18} color={Colors.warning} />
          )}
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.actionBtn} 
          onPress={() => handleBanUser(user)}
        >
          <Ban size={18} color={Colors.danger} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.actionBtn} 
          onPress={() => handleDeleteUser(user)}
        >
          <Trash2 size={18} color={Colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Site Users', headerStyle: { backgroundColor: Colors.background }, headerTintColor: Colors.text, headerShadowVisible: false }} />
      <ScrollView style={styles.root}>
        <View style={styles.headerInfo}>
          <Users size={24} color={Colors.accent} />
          <Text style={styles.headerText}>Manage all registered site users, including paying subscribers and free trial users.</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{allUsers.length}</Text>
            <Text style={styles.statLabel}>Total Users</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#10B981' }]}>{premiumUsers.length}</Text>
            <Text style={styles.statLabel}>Premium</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: Colors.warning }]}>{freeUsers.length}</Text>
            <Text style={styles.statLabel}>Free</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <Crown size={20} color="#10B981" />
            <Text style={styles.title}>Premium Users</Text>
          </View>
          <Text style={styles.subtitle}>Users with active premium access</Text>
          {premiumUsers.length === 0 ? (
            <View style={styles.emptyState}>
              <Crown size={32} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>No premium users yet</Text>
            </View>
          ) : (
            <View style={{ gap: 8, marginTop: 12 }}>
              {premiumUsers.map(user => renderUserCard(user, false))}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <Users size={20} color={Colors.accent} />
            <Text style={styles.title}>Free Users</Text>
          </View>
          <Text style={styles.subtitle}>Users on free tier (can be upgraded to premium)</Text>
          {freeUsers.length === 0 ? (
            <View style={styles.emptyState}>
              <Users size={32} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>No free users</Text>
            </View>
          ) : (
            <View style={{ gap: 8, marginTop: 12 }}>
              {freeUsers.map(user => renderUserCard(user, true))}
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background, padding: 16 },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  headerText: { flex: 1, color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  title: { color: Colors.text, fontWeight: '900' as const, fontSize: 18 },
  subtitle: { color: Colors.textSecondary, fontSize: 13, marginTop: 4 },

  emptyState: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { color: Colors.textTertiary, fontSize: 14, marginTop: 12 },
  userCard: { backgroundColor: Colors.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  userName: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  userEmailRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  userEmail: { color: Colors.textTertiary, fontSize: 12 },
  tierBadge: { color: Colors.warning, fontSize: 11, fontWeight: '700' as const, backgroundColor: Colors.surfaceLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  tierBadgePremium: { color: '#10B981', backgroundColor: '#10B98110' },
  statusBadge: { color: Colors.warning, fontSize: 11, fontWeight: '700' as const, backgroundColor: Colors.surfaceLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  actions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  actionBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  upgradeBtn: { backgroundColor: '#10B981', borderColor: '#10B981' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  statNumber: { color: Colors.accent, fontSize: 28, fontWeight: '900' as const },
  statLabel: { color: Colors.textSecondary, fontSize: 11, fontWeight: '700' as const, marginTop: 4, textTransform: 'uppercase' as const },
});
