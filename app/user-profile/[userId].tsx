import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Shield, TrendingUp, Zap, Flame } from 'lucide-react-native';
import { useEffect, useState, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import Colors from '@/constants/colors';
import { useTraining } from '@/contexts/TrainingContext';
import { useRanking } from '@/contexts/RankingContext';
import { getValidImageUri } from '@/lib/image-utils';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  avatar?: string;
  weightUnit?: 'lbs' | 'kg';
  registrationDate?: string;
  height?: string;
  weight?: string;
  age?: string;
  goal?: string;
}

export default function UserProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { workoutLogs, exercisePerformances } = useTraining();
  const { getAllUsersRankData, getRankColor } = useRanking();
  
  const [user, setUser] = useState<UserProfile | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedUnit, setSelectedUnit] = useState<'lbs' | 'kg'>('lbs');

  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        setIsLoading(true);
        const allUsersData = await AsyncStorage.getItem('warfare_all_users');
        if (allUsersData) {
          const allUsers = JSON.parse(allUsersData) as UserProfile[];
          const foundUser = allUsers.find(u => u.id === userId);
          if (foundUser) {
            setUser(foundUser);
          }
        }
      } catch (error) {
        console.error('[UserProfile] Error loading user:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (userId) {
      void loadUserProfile();
    }
  }, [userId]);

  const userStats = useMemo(() => {
    if (!user || !userId) return null;

    const userWorkouts = (workoutLogs || []).filter(w => w.exercises && w.exercises.length > 0);
    const userPerformances = (exercisePerformances || []).filter(p => p.userId === userId);
    
    const totalWorkouts = userWorkouts.length;
    const totalWeight = userPerformances.reduce((sum, p) => sum + (p.weight * p.reps), 0);
    const totalReps = userPerformances.reduce((sum, p) => sum + p.reps, 0);
    
    const allRankData = getAllUsersRankData();
    const userRankData = allRankData.find(r => r.userId === userId);
    
    return {
      totalWorkouts,
      totalWeight,
      totalReps,
      rank: userRankData?.rank || 'Recruit',
      rankScore: userRankData?.rankScore || 0,
      rankColor: getRankColor(userRankData?.rank || 'Recruit'),
    };
  }, [user, userId, workoutLogs, exercisePerformances, getAllUsersRankData, getRankColor]);

  if (isLoading) {
    return (
      <View style={[styles.background, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.background, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>User Profile</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyText}>User not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.background, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <Image
              source={{ uri: getValidImageUri(user.avatar) }}
              style={[styles.avatar, user.isAdmin && styles.adminAvatar]}
              contentFit="cover"
            />
          </View>
          
          <View style={styles.rankBadge}>
            <Shield size={16} color={user.isAdmin ? Colors.warning : userStats?.rankColor} />
            <Text style={[styles.rankText, { color: userStats?.rankColor }]}>
              {user.isAdmin ? 'Admin' : userStats?.rank}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Zap size={20} color={Colors.accent} />
            <Text style={styles.sectionTitle}>Performance Metrics</Text>
          </View>

          <View style={styles.unitToggle}>
            <Pressable 
              style={[styles.unitButton, selectedUnit === 'lbs' && styles.unitButtonActive]}
              onPress={() => setSelectedUnit('lbs')}
            >
              <Text style={[styles.unitButtonText, selectedUnit === 'lbs' && styles.unitButtonTextActive]}>LBS</Text>
            </Pressable>
            <Pressable 
              style={[styles.unitButton, selectedUnit === 'kg' && styles.unitButtonActive]}
              onPress={() => setSelectedUnit('kg')}
            >
              <Text style={[styles.unitButtonText, selectedUnit === 'kg' && styles.unitButtonTextActive]}>KG</Text>
            </Pressable>
          </View>

          <View style={styles.performanceMetricsGrid}>
            <View style={styles.metricCard}>
              <TrendingUp size={20} color={Colors.accent} />
              <Text style={styles.metricValue}>{userStats?.totalWorkouts || 0}</Text>
              <Text style={styles.metricLabel}>Completed{"\n"}Workouts</Text>
            </View>
            <View style={styles.metricCard}>
              <Flame size={20} color={Colors.warning} />
              <Text style={styles.metricValue}>
                {selectedUnit === 'lbs' 
                  ? (userStats?.totalWeight || 0).toLocaleString()
                  : Math.round((userStats?.totalWeight || 0) / 2.20462).toLocaleString()}
              </Text>
              <Text style={styles.metricLabel}>Total Weight{"\n"}Lifted ({selectedUnit})</Text>
            </View>
            <View style={styles.metricCard}>
              <Zap size={20} color={Colors.success} />
              <Text style={styles.metricValue}>{userStats?.totalReps || 0}</Text>
              <Text style={styles.metricLabel}>Total{"\n"}Reps</Text>
            </View>
          </View>
          <View style={styles.rankCard}>
            <Text style={styles.rankCardTitle}>Military Rank</Text>
            <Text style={[styles.rankCardValue, { color: userStats?.rankColor }]}>
              {userStats?.rank}
            </Text>
            <Text style={styles.rankCardSubtitle}>
              Rank Score: {userStats?.rankScore.toLocaleString()}
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
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
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  emptyText: {
    fontSize: 18,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  avatarContainer: {
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
    textTransform: 'uppercase' as const,
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 4,
    gap: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unitButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  unitButtonActive: {
    backgroundColor: Colors.accent,
  },
  unitButtonText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  unitButtonTextActive: {
    color: Colors.background,
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
  },
  performanceMetricsGrid: {
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
    fontSize: 15,
    fontWeight: '800' as const,
    color: Colors.text,
    marginTop: 6,
  },
  metricLabel: {
    fontSize: 8,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 10,
  },
  rankCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  rankCardTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    marginBottom: 8,
  },
  rankCardValue: {
    fontSize: 24,
    fontWeight: '900' as const,
    marginBottom: 4,
  },
  rankCardSubtitle: {
    fontSize: 13,
    color: Colors.textTertiary,
    fontWeight: '600' as const,
  },
});
