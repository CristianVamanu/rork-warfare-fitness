import { Shield, Users, Target, TrendingUp, Bell, Settings, MessageCircle, Award, Dumbbell, Camera, Trophy, Crown, ShoppingBag, Brain } from 'lucide-react-native';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useTraining } from '@/contexts/TrainingContext';
import { useLeaderboard } from '@/contexts/LeaderboardContext';
import React from "react";

export default function AdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { missions, powerLevel, user } = useApp();
  const { workoutLogs, exercisePerformances, achievements } = useTraining();
  const { getGlobalLeaderboard } = useLeaderboard();

  if (!user?.isAdmin) {
    return (
      <View style={[styles.background, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <Shield size={64} color={Colors.textTertiary} />
        <Text style={[styles.headerTitle, { marginTop: 20, textAlign: 'center' }]}>Access Denied</Text>
        <Text style={[styles.headerSubtitle, { marginTop: 8, textAlign: 'center' }]}>You need admin privileges to access this area</Text>
      </View>
    );
  }

  const leaderboard = getGlobalLeaderboard('all-time');
  const totalUsers = leaderboard.length;
  const activeUsers = leaderboard.filter(entry => entry.workoutsLogged > 0).length;
  const totalMissions = missions.length;
  const completedMissions = missions.filter(m => m.completed).length;
  const totalWorkouts = workoutLogs.length;
  const safePowerLevel = isNaN(powerLevel) || !isFinite(powerLevel) ? 0 : powerLevel;
  const totalVolume = exercisePerformances.reduce((sum, p) => sum + (p.weight * p.reps), 0);
  const avgWorkoutsPerUser = totalUsers > 0 ? Math.round(totalWorkouts / totalUsers) : 0;

  const stats = [
    {
      id: '1',
      icon: Users,
      label: 'Total Users',
      value: totalUsers.toString(),
      subtitle: `${activeUsers} active`,
      color: Colors.accent,
    },
    {
      id: '2',
      icon: Target,
      label: 'Missions',
      value: totalMissions.toString(),
      subtitle: `${completedMissions} completed`,
      color: Colors.success,
    },
    {
      id: '3',
      icon: TrendingUp,
      label: 'Total Workouts',
      value: totalWorkouts.toString(),
      subtitle: `Avg ${avgWorkoutsPerUser} per user`,
      color: Colors.warning,
    },
    {
      id: '4',
      icon: Award,
      label: 'Achievements',
      value: achievements.length.toString(),
      subtitle: 'PRs earned',
      color: Colors.success,
    },
  ];

  const adminActions = [
    {
      id: '1',
      title: 'Manage Programs',
      description: 'Create, edit, delete programs',
      icon: Dumbbell,
      color: Colors.accent,
      route: '/admin-programs',
    },
    {
      id: '2',
      title: 'Manage Challenges',
      description: 'Create and manage challenges',
      icon: Trophy,
      color: Colors.warning,
      route: '/admin-challenges',
    },
    {
      id: '4',
      title: 'User Management',
      description: 'View and manage users',
      icon: Users,
      color: Colors.warning,
      route: '/admin-users',
    },
    {
      id: '5',
      title: 'AI Food Scanner',
      description: 'Analyze food nutrition',
      icon: Camera,
      color: Colors.success,
      route: '/food',
    },
    {
      id: '6',
      title: 'Send Notification',
      description: 'Broadcast to all users',
      icon: Bell,
      color: Colors.danger,
      route: '/admin-notifications',
    },
    {
      id: '8',
      title: 'Shop & Affiliates',
      description: 'Manage affiliate links',
      icon: ShoppingBag,
      color: Colors.success,
      route: '/admin-shop',
    },
    {
      id: '7',
      title: 'Settings',
      description: 'App & Coffee link config',
      icon: Settings,
      color: Colors.textSecondary,
      route: '/admin-settings',
    },
    {
      title: 'Trainers',
      description: 'Manage trainer accounts & revenue',
      icon: Crown,
      color: Colors.accent,
      route: '/admin-trainers',
    },
    {
      id: '9',
      title: 'AI Trainer',
      description: 'Chat with Commander AI',
      icon: Brain,
      color: Colors.accent,
      route: '/ai-trainer',
    },
  ];

  return (
    <View style={[styles.background, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Shield size={32} color={Colors.accent} />
          <Text style={styles.headerTitle}>Admin Dashboard</Text>
        </View>
        <Text style={styles.headerSubtitle}>Full control over Warfare Fitness</Text>
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.statsGrid}>
          {stats.map((stat) => {
            const IconComponent = stat.icon;
            return (
              <View key={stat.id} style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: `${stat.color}20` }]}>
                  <IconComponent size={20} color={stat.color} />
                </View>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={styles.statSubtitle}>{stat.subtitle}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            {adminActions.map((action) => {
              const IconComponent = action.icon;
              return (
                <TouchableOpacity
                  key={action.id}
                  style={styles.actionCard}
                  onPress={() => router.push(action.route as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionIcon, { backgroundColor: `${action.color}20` }]}>
                    <IconComponent size={24} color={action.color} />
                  </View>
                  <View style={styles.actionContent}>
                    <Text style={styles.actionTitle}>{action.title}</Text>
                    <Text style={styles.actionDescription}>{action.description}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <View style={styles.activityCard}>
            {achievements.slice(0, 4).map((achievement, index) => {
              const timeAgo = getTimeAgo(achievement.timestamp);
              return (
                <ActivityItem
                  key={achievement.id}
                  icon={Award}
                  color={Colors.success}
                  text={`${achievement.userName} - ${achievement.title}: ${achievement.description}`}
                  time={timeAgo}
                />
              );
            })}
            {achievements.length === 0 && (
              <Text style={styles.emptyActivityText}>No recent achievements</Text>
            )}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

interface ActivityItemProps {
  icon: React.ComponentType<{ size: number; color: string }>;
  color: string;
  text: string;
  time: string;
}

function ActivityItem({ icon: Icon, color, text, time }: ActivityItemProps) {
  return (
    <View style={styles.activityItem}>
      <View style={[styles.activityIcon, { backgroundColor: `${color}20` }]}>
        <Icon size={16} color={color} />
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityText} numberOfLines={2}>{text}</Text>
        <Text style={styles.activityTime}>{time}</Text>
      </View>
    </View>
  );
}

function getTimeAgo(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 16,
  },
  devSection: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  devTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 2,
  },
  devSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  devBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  devBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  devBtnText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.accent,
  },
  devBtnTextActive: {
    color: Colors.background,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  container: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 12,
  },
  statCard: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  statSubtitle: {
    fontSize: 10,
    color: Colors.textTertiary,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  actionsGrid: {
    gap: 12,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  activityCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 16,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500' as const,
    marginBottom: 2,
  },
  activityTime: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  emptyActivityText: {
    fontSize: 13,
    color: Colors.textTertiary,
    textAlign: 'center',
    padding: 20,
  },
});
