import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Save, User, Mail, Calendar, Weight, Target as TargetIcon, Edit2, Shield, Zap, TrendingUp, DollarSign, Flame, Check, Video as VideoIcon, LogOut, CreditCard, Scale, Bell, Package } from 'lucide-react-native';
import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/colors';
import { useApp, getUserRank } from '@/contexts/AppContext';
import { useTraining } from '@/contexts/TrainingContext';
import { getValidImageUri } from '@/lib/image-utils';
import { AVATAR_OPTIONS } from '@/constants/avatars';
import { useNotifications } from '@/contexts/NotificationsContext';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { powerLevel, streak, missions, logout, user, updateUserAvatar, updateUserProfile, powerMetrics, adminSettings } = useApp();
  const { workoutLogs } = useTraining();
  const { getUnreadCount } = useNotifications();

  const unreadNotificationsCount = user ? getUnreadCount(user.id) : 0;

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || user?.email?.split('@')[0] || '');
  const [email, setEmail] = useState(user?.email || '');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [weightUnit, setWeightUnit] = useState<'lbs' | 'kg'>(user?.weightUnit || 'lbs');

  useEffect(() => {
    if (user) {
      setName(user.name || user.email?.split('@')[0] || '');
      setEmail(user.email || '');
      setWeightUnit(user.weightUnit || 'lbs');
    }
  }, [user]);

  const totalWorkouts = powerMetrics.totalWorkoutsCompleted;
  const rank = getUserRank(totalWorkouts);
  const completedMissions = (missions || []).filter(m => m.completed).length;

  const handleSave = async () => {
    await updateUserProfile({ name, email, weightUnit });
    setIsEditing(false);
    Alert.alert('Success', 'Profile updated successfully');
  };

  return (
    <View style={[styles.background, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity
          onPress={() => (isEditing ? handleSave() : setIsEditing(true))}
          style={styles.editButton}
        >
          {isEditing ? (
            <Save size={20} color={Colors.accent} />
          ) : (
            <Edit2 size={20} color={Colors.accent} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <Image
              source={{ uri: getValidImageUri(user?.avatar) }}
              style={[styles.avatar, user?.isAdmin && styles.adminAvatar]}
              contentFit="cover"
            />
            {isEditing && !user?.isAdmin && (
              <TouchableOpacity 
                style={styles.changeAvatarButton}
                onPress={() => setShowAvatarPicker(true)}
              >
                <Text style={styles.changeAvatarText}>Change</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <View style={styles.rankBadge}>
            <Shield size={16} color={user?.isAdmin ? Colors.warning : Colors.accent} />
            <Text style={styles.rankText}>{user?.isAdmin ? 'Admin' : rank}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Zap size={16} color={Colors.accent} />
            <Text style={styles.statValue}>{totalWorkouts}</Text>
            <Text style={styles.statLabel}>Workouts</Text>
          </View>
          <View style={styles.statBox}>
            <Package size={16} color={Colors.accent} />
            <Text style={styles.statValue}>{powerMetrics.totalWorkoutsCompleted}</Text>
            <Text style={styles.statLabel}>Total Weight</Text>
          </View>
          <View style={styles.statBox}>
            <Flame size={16} color={Colors.accent} />
            <Text style={styles.statValue}>{49}</Text>
            <Text style={styles.statLabel}>Total Reps</Text>
          </View>
        </View>

        <View style={styles.statsDetailRow}>
          <View style={styles.statDetailBox}>
            <Text style={styles.statDetailLabel}>Total Weight (lbs)</Text>
            <Text style={styles.statDetailValue}>{powerMetrics.totalWorkoutsCompleted.toLocaleString()} lbs</Text>
          </View>
          <View style={styles.statDetailBox}>
            <Text style={styles.statDetailLabel}>Total Weight (kg)</Text>
            <Text style={styles.statDetailValue}>{Math.round(powerMetrics.totalWorkoutsCompleted / 2.20462).toLocaleString()} kg</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          
          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <User size={16} color={Colors.accent} />
              <Text style={styles.inputLabelText}>Name</Text>
            </View>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholderTextColor={Colors.textTertiary}
              />
            ) : (
              <Text style={styles.inputValue}>{name}</Text>
            )}
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <Mail size={16} color={Colors.accent} />
              <Text style={styles.inputLabelText}>Email</Text>
            </View>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor={Colors.textTertiary}
              />
            ) : (
              <Text style={styles.inputValue}>{email}</Text>
            )}
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <Scale size={16} color={Colors.accent} />
              <Text style={styles.inputLabelText}>Measurement Unit</Text>
            </View>
            {isEditing ? (
              <View style={styles.unitSelector}>
                <TouchableOpacity
                  style={[
                    styles.unitOption,
                    weightUnit === 'lbs' && styles.unitOptionActive,
                  ]}
                  onPress={() => setWeightUnit('lbs')}
                >
                  <Text
                    style={[
                      styles.unitOptionText,
                      weightUnit === 'lbs' && styles.unitOptionTextActive,
                    ]}
                  >
                    Imperial (lbs)
                  </Text>
                  {weightUnit === 'lbs' && <Check size={16} color={Colors.background} />}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.unitOption,
                    weightUnit === 'kg' && styles.unitOptionActive,
                  ]}
                  onPress={() => setWeightUnit('kg')}
                >
                  <Text
                    style={[
                      styles.unitOptionText,
                      weightUnit === 'kg' && styles.unitOptionTextActive,
                    ]}
                  >
                    Metric (kg)
                  </Text>
                  {weightUnit === 'kg' && <Check size={16} color={Colors.background} />}
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.inputValue}>{weightUnit === 'lbs' ? 'Imperial (lbs)' : 'Metric (kg)'}</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Zap size={20} color={Colors.accent} />
            <Text style={styles.sectionTitle}>Power Metrics</Text>
          </View>
          <View style={styles.powerMetricsGrid}>
            <View style={styles.metricCard}>
              <Flame size={20} color={Colors.warning} />
              <Text style={styles.metricValue}>{streak}</Text>
              <Text style={styles.metricLabel}>Login Streak</Text>
            </View>
            <View style={styles.metricCard}>
              <TrendingUp size={20} color={Colors.accent} />
              <Text style={styles.metricValue}>{powerMetrics.totalWorkoutsCompleted}</Text>
              <Text style={styles.metricLabel}>Total Workouts</Text>
            </View>
            <View style={styles.metricCard}>
              <DollarSign size={20} color={Colors.success} />
              <Text style={styles.metricValue}>${(powerMetrics.totalSpent ?? 0).toFixed(0)}</Text>
              <Text style={styles.metricLabel}>Total Spent</Text>
            </View>
          </View>
          <View style={styles.streakMilestoneCard}>
            <Text style={styles.streakMilestoneTitle}>Next Streak Milestone</Text>
            <Text style={styles.streakMilestoneText}>
              {powerMetrics.lastStreakMilestone >= 100
                ? '🏆 All milestones completed!'
                : `${getNextMilestone(powerMetrics.lastStreakMilestone)} days → +${getMilestoneBonus(getNextMilestone(powerMetrics.lastStreakMilestone))} power`}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity Summary</Text>
          <View style={styles.summaryCard}>
            <SummaryItem label="Total Workouts" value={totalWorkouts.toString()} />
            <SummaryItem label="Best Streak" value={`${streak} days`} />
            <SummaryItem label="Member Since" value="Jan 2024" />
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.manageBtn, unreadNotificationsCount > 0 && { backgroundColor: Colors.warning }]} 
          onPress={() => router.push('/notifications' as any)}
        >
          <Bell size={18} color={Colors.background} />
          <Text style={styles.manageText}>Notifications {unreadNotificationsCount > 0 && `(${unreadNotificationsCount})`}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.manageBtn} onPress={() => router.push('/manage-subscription' as any)}>
          <CreditCard size={18} color={Colors.background} />
          <Text style={styles.manageText}>Manage Subscription</Text>
        </TouchableOpacity>

        {adminSettings.welcomeVideoUrl && (
          <TouchableOpacity style={[styles.manageBtn, { backgroundColor: Colors.accent }]} onPress={() => router.push('/welcome-video' as any)}>
            <VideoIcon size={18} color={Colors.background} />
            <Text style={styles.manageText}>View Welcome Message</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.manageBtn, { backgroundColor: Colors.danger }]} onPress={() => { logout(); router.replace('/login' as any); }}>
          <LogOut size={18} color={Colors.background} />
          <Text style={styles.manageText}>Logout</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showAvatarPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAvatarPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.avatarPickerModal}>
            <Text style={styles.avatarPickerTitle}>Choose Your Avatar</Text>
            <ScrollView style={styles.avatarGrid} showsVerticalScrollIndicator={false}>
              <View style={styles.avatarGridInner}>
                {AVATAR_OPTIONS.map((avatar) => (
                  <TouchableOpacity
                    key={avatar.id}
                    style={styles.avatarOption}
                    onPress={async () => {
                      await updateUserAvatar(avatar.url);
                      setShowAvatarPicker(false);
                      Alert.alert('Success', 'Avatar updated!');
                    }}
                  >
                    <Image
                      source={{ uri: avatar.url }}
                      style={styles.avatarOptionImage}
                      contentFit="cover"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity
              style={styles.avatarPickerClose}
              onPress={() => setShowAvatarPicker(false)}
            >
              <Text style={styles.avatarPickerCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

interface SummaryItemProps {
  label: string;
  value: string;
}

function SummaryItem({ label, value }: SummaryItemProps) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function getNextMilestone(lastMilestone: number): number {
  const milestones = [10, 20, 30, 50, 75, 100];
  return milestones.find(m => m > lastMilestone) ?? 100;
}

function getMilestoneBonus(milestone: number): number {
  const bonuses: Record<number, number> = { 10: 50, 20: 100, 30: 200, 50: 350, 75: 500, 100: 1000 };
  return bonuses[milestone] ?? 0;
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: {
    fontSize: 28,
    color: Colors.text,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
    textTransform: 'uppercase' as const,
  },
  editButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  avatarContainer: {
    position: 'relative' as const,
    marginBottom: 16,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: Colors.accent,
  },
  adminAvatar: {
    borderColor: '#FFD700',
    borderWidth: 4,
  },
  changeAvatarButton: {
    position: 'absolute' as const,
    bottom: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  changeAvatarText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.background,
    textTransform: 'uppercase' as const,
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rankText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.warning,
    textTransform: 'uppercase' as const,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  statsDetailRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  statDetailBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statDetailLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    fontWeight: '600' as const,
    marginBottom: 6,
    textAlign: 'center',
  },
  statDetailValue: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.accent,
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  inputLabelText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputValue: {
    fontSize: 15,
    color: Colors.text,
    padding: 14,
  },
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 16,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  summaryValue: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '700' as const,
  },
  manageBtn: { 
    marginHorizontal: 16, 
    marginTop: 8, 
    backgroundColor: Colors.accent, 
    paddingVertical: 14, 
    borderRadius: 12, 
    alignItems: 'center', 
    flexDirection: 'row', 
    justifyContent: 'center', 
    gap: 8 
  },
  manageText: { 
    color: Colors.background, 
    fontWeight: '900' as const 
  },
  powerMetricsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
    marginTop: 6,
  },
  metricLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
    marginTop: 4,
    textAlign: 'center',
  },
  streakMilestoneCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  streakMilestoneTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    marginBottom: 6,
  },
  streakMilestoneText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.accent,
  },
  unitSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  unitOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unitOptionActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  unitOptionText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  unitOptionTextActive: {
    color: Colors.background,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  avatarPickerModal: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  avatarPickerTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 20,
    textTransform: 'uppercase' as const,
  },
  avatarGrid: {
    maxHeight: 400,
  },
  avatarGridInner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
  },
  avatarOption: {
    width: '18%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: Colors.border,
  },
  avatarOptionImage: {
    width: '100%',
    height: '100%',
  },
  avatarPickerClose: {
    marginHorizontal: 24,
    marginTop: 20,
    paddingVertical: 14,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    alignItems: 'center',
  },
  avatarPickerCloseText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.background,
  },
});
