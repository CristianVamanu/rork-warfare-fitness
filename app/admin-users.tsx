import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { User, Search, Shield, Ban, TrendingUp, Trash2, Crown } from 'lucide-react-native';

import Colors from '@/constants/colors';
import { AVATAR_OPTIONS } from '@/constants/avatars';
import { getValidImageUri } from '@/lib/image-utils';

interface UserData {
  id: string;
  name: string;
  email: string;
  rank: string;
  powerLevel: number;
  streak: number;
  status: 'Active' | 'Inactive' | 'Banned';
  joinedDate: string;
}

const MOCK_USERS: UserData[] = [
  {
    id: '1',
    name: 'Alex Warrior',
    email: 'alex@warfare.com',
    rank: 'Elite Commander',
    powerLevel: 892,
    streak: 45,
    status: 'Active',
    joinedDate: '2024-01-15',
  },
  {
    id: '2',
    name: 'Marcus Steel',
    email: 'marcus@warfare.com',
    rank: 'Warrior',
    powerLevel: 645,
    streak: 28,
    status: 'Active',
    joinedDate: '2024-02-20',
  },
  {
    id: '3',
    name: 'Sarah Phoenix',
    email: 'sarah@warfare.com',
    rank: 'Commander',
    powerLevel: 723,
    streak: 32,
    status: 'Active',
    joinedDate: '2024-01-08',
  },
  {
    id: '4',
    name: 'Jake Hunter',
    email: 'jake@warfare.com',
    rank: 'Recruit',
    powerLevel: 234,
    streak: 7,
    status: 'Active',
    joinedDate: '2024-03-10',
  },
  {
    id: '5',
    name: 'Emma Blaze',
    email: 'emma@warfare.com',
    rank: 'Warrior',
    powerLevel: 567,
    streak: 21,
    status: 'Inactive',
    joinedDate: '2024-02-05',
  },
];

export default function AdminUsersScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [users] = useState<UserData[]>(MOCK_USERS);

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleBanUser = (user: UserData) => {
    Alert.alert(
      'Ban User',
      `Are you sure you want to ban ${user.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ban',
          style: 'destructive',
          onPress: () => {
            console.log('Banning user:', user.id);
            Alert.alert('Success', `${user.name} has been banned`);
          },
        },
      ]
    );
  };

  const handleDeleteUser = (user: UserData) => {
    Alert.alert(
      'Delete User',
      `Are you sure you want to permanently delete ${user.name}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            console.log('Deleting user:', user.id);
            Alert.alert('Success', `${user.name} has been deleted`);
          },
        },
      ]
    );
  };

  const [adjustingUser, setAdjustingUser] = useState<UserData | null>(null);
  const [newPL, setNewPL] = useState<string>('');
  const [grantingPremiumUser, setGrantingPremiumUser] = useState<UserData | null>(null);
  const [premiumMonths, setPremiumMonths] = useState<string>('');
  const [changingAvatarUser, setChangingAvatarUser] = useState<UserData | null>(null);

  const handleAdjustPowerLevel = (user: UserData) => {
    setAdjustingUser(user);
    setNewPL(String(user.powerLevel));
  };

  const handleGrantPremium = (user: UserData) => {
    setGrantingPremiumUser(user);
    setPremiumMonths('');
  };

  const handleChangeAvatar = (user: UserData) => {
    setChangingAvatarUser(user);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'User Management',
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
          headerShadowVisible: false,
        }}
      />

      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>User Management</Text>
          <Text style={styles.headerSubtitle}>
            {filteredUsers.length} total users
          </Text>
        </View>

        <View style={styles.searchContainer}>
          <Search size={18} color={Colors.textTertiary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search users..."
            placeholderTextColor={Colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {filteredUsers.map((user) => (
            <View key={user.id} style={styles.userCard}>
              <View style={styles.userHeader}>
                <TouchableOpacity 
                  style={styles.avatarWrapper}
                  onPress={() => handleChangeAvatar(user)}
                >
                  <Image
                    source={{ uri: getValidImageUri(undefined) }}
                    style={styles.userAvatar}
                    contentFit="cover"
                  />
                </TouchableOpacity>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{user.name}</Text>
                  <Text style={styles.userEmail}>{user.email}</Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        user.status === 'Active'
                          ? `${Colors.success}20`
                          : user.status === 'Inactive'
                          ? `${Colors.warning}20`
                          : `${Colors.danger}20`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      {
                        color:
                          user.status === 'Active'
                            ? Colors.success
                            : user.status === 'Inactive'
                            ? Colors.warning
                            : Colors.danger,
                      },
                    ]}
                  >
                    {user.status}
                  </Text>
                </View>
              </View>

              <View style={styles.userStats}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Rank</Text>
                  <Text style={styles.statValue}>{user.rank}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Power Level</Text>
                  <Text style={styles.statValue}>{user.powerLevel}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Streak</Text>
                  <Text style={styles.statValue}>{user.streak} days</Text>
                </View>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleAdjustPowerLevel(user)}
                >
                  <TrendingUp size={16} color={Colors.success} />
                  <Text style={styles.actionText}>Adjust PL</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleChangeAvatar(user)}
                >
                  <User size={16} color={Colors.accent} />
                  <Text style={styles.actionText}>Avatar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleGrantPremium(user)}
                >
                  <Crown size={16} color={Colors.warning} />
                  <Text style={styles.actionText}>Premium</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleBanUser(user)}
                >
                  <Ban size={16} color={Colors.warning} />
                  <Text style={styles.actionText}>Ban</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleDeleteUser(user)}
                >
                  <Trash2 size={16} color={Colors.danger} />
                  <Text style={styles.actionText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {grantingPremiumUser && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Grant Premium</Text>
            <Text style={styles.modalSub}>User: {grantingPremiumUser.name}</Text>
            <Text style={styles.inputLabel}>Number of months:</Text>
            <TextInput
              style={styles.input}
              value={premiumMonths}
              onChangeText={setPremiumMonths}
              keyboardType="numeric"
              placeholder="Enter months (e.g., 3, 6, 12)"
              placeholderTextColor={Colors.textTertiary}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setGrantingPremiumUser(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.confirmBtn]}
                onPress={() => {
                  if (!premiumMonths || parseInt(premiumMonths) <= 0) {
                    Alert.alert('Invalid Input', 'Please enter a valid number of months');
                    return;
                  }
                  console.log('Granting premium:', grantingPremiumUser.id, premiumMonths, 'months');
                  Alert.alert('Success', `Granted ${premiumMonths} months of premium to ${grantingPremiumUser.name}`);
                  setGrantingPremiumUser(null);
                  setPremiumMonths('');
                }}
              >
                <Text style={styles.confirmText}>Grant Premium</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {changingAvatarUser && (
        <Modal
          visible={true}
          transparent
          animationType="slide"
          onRequestClose={() => setChangingAvatarUser(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.avatarPickerModal}>
              <Text style={styles.modalTitle}>Choose Avatar for {changingAvatarUser.name}</Text>
              <ScrollView style={styles.avatarScrollView} showsVerticalScrollIndicator={false}>
                <View style={styles.avatarGridContainer}>
                  {AVATAR_OPTIONS.map((avatar) => (
                    <TouchableOpacity
                      key={avatar.id}
                      style={styles.avatarOptionItem}
                      onPress={() => {
                        console.log('Avatar selected for user:', changingAvatarUser.id, avatar.name);
                        Alert.alert('Success', `Avatar "${avatar.name}" assigned to ${changingAvatarUser.name}`);
                        setChangingAvatarUser(null);
                      }}
                    >
                      <Image
                        source={{ uri: avatar.url }}
                        style={styles.avatarOptionImage}
                        contentFit="cover"
                      />
                      <Text style={styles.avatarOptionName}>{avatar.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setChangingAvatarUser(null)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {adjustingUser && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Adjust Power Level</Text>
            <Text style={styles.modalSub}>User: {adjustingUser.name}</Text>
            <TextInput
              style={styles.input}
              value={newPL}
              onChangeText={setNewPL}
              keyboardType="numeric"
              placeholderTextColor={Colors.textTertiary}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setAdjustingUser(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.confirmBtn]}
                onPress={() => {
                  console.log('Updating power level:', adjustingUser.id, newPL);
                  Alert.alert('Success', `Power level updated to ${newPL}`);
                  setAdjustingUser(null);
                }}
              >
                <Text style={styles.confirmText}>Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  searchIcon: {
    position: 'absolute',
    left: 32,
    zIndex: 1,
  },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingLeft: 38,
    paddingRight: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.text,
  },
  inputLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 8,
    marginTop: 8,
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  userCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  userIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${Colors.accent}20`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  userStats: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  modalSub: {
    marginTop: 4,
    marginBottom: 12,
    color: Colors.textSecondary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  modalBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  cancelBtn: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  confirmBtn: {
    backgroundColor: Colors.accent,
  },
  cancelText: {
    color: Colors.text,
    fontWeight: '700' as const,
  },
  confirmText: {
    color: Colors.background,
    fontWeight: '800' as const,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.background,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  avatarWrapper: {
    marginRight: 12,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  avatarPickerModal: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  avatarScrollView: {
    maxHeight: 400,
    marginVertical: 20,
  },
  avatarGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'center',
  },
  avatarOptionItem: {
    width: 80,
    alignItems: 'center',
  },
  avatarOptionImage: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    borderColor: Colors.border,
    marginBottom: 6,
  },
  avatarOptionName: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
    textAlign: 'center',
  },
});
