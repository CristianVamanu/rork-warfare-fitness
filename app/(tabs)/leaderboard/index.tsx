import { Stack, useRouter } from 'expo-router';
import { Trophy, Medal, TrendingUp, Filter, ChevronDown, Crown } from 'lucide-react-native';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useState, useMemo } from 'react';
import { Image } from 'expo-image';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useLeaderboard, TimeFilter } from '@/contexts/LeaderboardContext';
import { useRanking, RANK_THRESHOLDS } from '@/contexts/RankingContext';
import { getValidImageUri } from '@/lib/image-utils';
import { getWeightDisplay } from '@/lib/weight-utils';

type TabType = 'global' | 'exercises';

export default function LeaderboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const {
    getGlobalLeaderboard,
    getAllExerciseNames,
    getTopPerformersForExercise,
  } = useLeaderboard();
  const { userRankData, getRankColor } = useRanking();

  const [activeTab, setActiveTab] = useState<TabType>('global');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all-time');
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState<boolean>(false);

  const globalLeaderboard = useMemo(() => getGlobalLeaderboard(timeFilter), [getGlobalLeaderboard, timeFilter]);
  const exerciseNames = useMemo(() => getAllExerciseNames(), [getAllExerciseNames]);
  
  const exerciseLeaderboard = useMemo(() => {
    if (!selectedExercise) return [];
    return getTopPerformersForExercise(selectedExercise, 50, timeFilter);
  }, [selectedExercise, getTopPerformersForExercise, timeFilter]);

  const currentExercise = selectedExercise ?? (exerciseNames.length > 0 ? exerciseNames[0] : null);

  const getRankBadgeColor = (rank: number): string => {
    if (rank === 1) return '#FFD700';
    if (rank === 2) return '#C0C0C0';
    if (rank === 3) return '#CD7F32';
    return Colors.textTertiary;
  };

  const renderGlobalLeaderboard = () => {
    if (globalLeaderboard.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Trophy size={64} color={Colors.textTertiary} />
          <Text style={styles.emptyText}>No rankings yet</Text>
          <Text style={styles.emptySubtext}>Complete workouts to see rankings</Text>
        </View>
      );
    }

    return (
      <View style={styles.leaderboardList}>
        {globalLeaderboard.map((entry, index) => {
          const isCurrentUser = entry.userId === user?.id;
          const rankColor = getRankColor(entry.militaryRank as any);
          const badgeColor = getRankBadgeColor(entry.rank);

          return (
            <TouchableOpacity
              key={entry.userId}
              style={[
                styles.leaderboardCard,
                isCurrentUser && styles.leaderboardCardHighlight,
              ]}
              onPress={() => router.push(`/user-profile/${entry.userId}` as any)}
            >
              <View style={styles.rankBadgeContainer}>
                <View style={styles.rankBadge}>
                  <Text style={[styles.rankNumber, { color: badgeColor }]}>#{entry.rank}</Text>
                </View>
              </View>

              <View style={styles.avatarWrapper}>
                <Image
                  source={{ uri: getValidImageUri(entry.avatar) }}
                  style={[
                    styles.leaderboardAvatar,
                    entry.rank === 1 && !entry.isAdmin && styles.leaderboardAvatarFirst,
                    entry.isAdmin && styles.leaderboardAvatarAdmin,
                  ]}
                  contentFit="cover"
                />
              </View>

              <View style={styles.leaderboardContent}>
                <View style={styles.userInfo}>
                  <Text style={[styles.userName, isCurrentUser && styles.userNameHighlight]}>
                    {entry.userName}
                    {isCurrentUser && ' (You)'}
                  </Text>
                  <View style={[styles.militaryRankBadge, { backgroundColor: `${rankColor}20` }]}>
                    <Medal size={12} color={rankColor} />
                    <Text style={[styles.militaryRankText, { color: rankColor }]}>
                      {entry.militaryRank}
                    </Text>
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Score</Text>
                    <Text style={styles.statValue}>{entry.rankScore.toLocaleString()}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Volume</Text>
                    <Text style={styles.statValue}>{getWeightDisplay(entry.totalVolume, user?.weightUnit)}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Workouts</Text>
                    <Text style={styles.statValue}>{entry.workoutsLogged}</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderExerciseLeaderboard = () => {
    if (!currentExercise) {
      return (
        <View style={styles.emptyState}>
          <Trophy size={64} color={Colors.textTertiary} />
          <Text style={styles.emptyText}>No exercises tracked</Text>
          <Text style={styles.emptySubtext}>Log workouts to see exercise rankings</Text>
        </View>
      );
    }

    return (
      <View style={styles.leaderboardList}>
        <View style={styles.exerciseSelector}>
          <Text style={styles.exerciseSelectorLabel}>Exercise:</Text>
          <TouchableOpacity
            style={styles.exerciseDropdown}
            onPress={() => setShowFilters(true)}
          >
            <Text style={styles.exerciseDropdownText} numberOfLines={1}>
              {currentExercise}
            </Text>
            <ChevronDown size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {exerciseLeaderboard.length === 0 ? (
          <View style={styles.emptyState}>
            <Trophy size={48} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>No data for this exercise</Text>
          </View>
        ) : (
          exerciseLeaderboard.map((entry) => {
            const isCurrentUser = entry.userId === user?.id;
            const badgeColor = getRankBadgeColor(entry.rank);

            return (
              <TouchableOpacity
                key={entry.userId}
                style={[
                  styles.leaderboardCard,
                  isCurrentUser && styles.leaderboardCardHighlight,
                ]}
                onPress={() => router.push(`/user-profile/${entry.userId}` as any)}
              >
                <View style={styles.rankBadgeContainer}>
                  <View style={styles.rankBadge}>
                    <Text style={[styles.rankNumber, { color: badgeColor }]}>#{entry.rank}</Text>
                  </View>
                </View>

                <View style={styles.avatarWrapper}>
                  <Image
                    source={{ uri: getValidImageUri(entry.avatar) }}
                    style={[
                      styles.leaderboardAvatar,
                      entry.rank === 1 && !entry.isAdmin && styles.leaderboardAvatarFirst,
                      entry.isAdmin && styles.leaderboardAvatarAdmin,
                    ]}
                    contentFit="cover"
                  />
                </View>

                <View style={styles.leaderboardContent}>
                  <Text style={[styles.userName, isCurrentUser && styles.userNameHighlight]}>
                    {entry.userName}
                    {isCurrentUser && ' (You)'}
                  </Text>

                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Weight</Text>
                      <Text style={styles.statValue}>{getWeightDisplay(entry.weight, user?.weightUnit)}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Reps</Text>
                      <Text style={styles.statValue}>{entry.reps}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Volume</Text>
                      <Text style={styles.statValue}>{getWeightDisplay(entry.totalVolume, user?.weightUnit)}</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Trophy size={28} color={Colors.accent} />
          <Text style={styles.headerTitle}>Leaderboard</Text>
        </View>
        <TouchableOpacity
          style={styles.myRankButton}
          onPress={() => router.push('/my-rank' as any)}
        >
          <TrendingUp size={20} color={Colors.accent} />
          <Text style={styles.myRankButtonText}>My Rank</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'global' && styles.tabActive]}
          onPress={() => setActiveTab('global')}
        >
          <Crown size={18} color={activeTab === 'global' ? Colors.accent : Colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'global' && styles.tabTextActive]}>
            Global
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'exercises' && styles.tabActive]}
          onPress={() => setActiveTab('exercises')}
        >
          <Medal size={18} color={activeTab === 'exercises' ? Colors.accent : Colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'exercises' && styles.tabTextActive]}>
            Exercises
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, timeFilter === 'week' && styles.filterChipActive]}
          onPress={() => setTimeFilter('week')}
        >
          <Text style={[styles.filterChipText, timeFilter === 'week' && styles.filterChipTextActive]}>
            Week
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, timeFilter === 'month' && styles.filterChipActive]}
          onPress={() => setTimeFilter('month')}
        >
          <Text style={[styles.filterChipText, timeFilter === 'month' && styles.filterChipTextActive]}>
            Month
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, timeFilter === 'all-time' && styles.filterChipActive]}
          onPress={() => setTimeFilter('all-time')}
        >
          <Text style={[styles.filterChipText, timeFilter === 'all-time' && styles.filterChipTextActive]}>
            All Time
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {activeTab === 'global' ? renderGlobalLeaderboard() : renderExerciseLeaderboard()}
        <View style={{ height: 40 }} />
      </ScrollView>

      {showFilters && activeTab === 'exercises' && (
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Exercise</Text>
            <ScrollView style={styles.exerciseList}>
              {exerciseNames.map((name) => (
                <TouchableOpacity
                  key={name}
                  style={[
                    styles.exerciseOption,
                    name === currentExercise && styles.exerciseOptionActive,
                  ]}
                  onPress={() => {
                    setSelectedExercise(name);
                    setShowFilters(false);
                  }}
                >
                  <Text
                    style={[
                      styles.exerciseOptionText,
                      name === currentExercise && styles.exerciseOptionTextActive,
                    ]}
                  >
                    {name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowFilters(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.text,
    textTransform: 'uppercase' as const,
  },
  myRankButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  myRankButtonText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.accent,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: {
    backgroundColor: `${Colors.accent}20`,
    borderColor: Colors.accent,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.accent,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.background,
  },
  scrollView: {
    flex: 1,
    marginTop: 16,
  },
  leaderboardList: {
    paddingHorizontal: 20,
  },
  leaderboardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  leaderboardCardHighlight: {
    borderColor: Colors.accent,
    borderWidth: 2,
    backgroundColor: `${Colors.accent}10`,
  },
  rankBadgeContainer: {
    marginRight: 8,
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatarWrapper: {
    marginRight: 12,
  },
  leaderboardAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  leaderboardAvatarFirst: {
    borderWidth: 3,
    borderColor: '#FFD700',
  },
  leaderboardAvatarAdmin: {
    borderWidth: 3,
    borderColor: '#FFD700',
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: '800' as const,
  },
  leaderboardContent: {
    flex: 1,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  userName: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
    flex: 1,
  },
  userNameHighlight: {
    color: Colors.accent,
  },
  militaryRankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  militaryRankText: {
    fontSize: 11,
    fontWeight: '700' as const,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statItem: {
    minWidth: 60,
    alignItems: 'flex-start',
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  exerciseSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  exerciseSelectorLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  exerciseDropdown: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  exerciseDropdownText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  modal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  exerciseList: {
    maxHeight: 400,
  },
  exerciseOption: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  exerciseOptionActive: {
    backgroundColor: `${Colors.accent}20`,
  },
  exerciseOptionText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  exerciseOptionTextActive: {
    color: Colors.accent,
  },
  modalClose: {
    marginHorizontal: 24,
    marginTop: 16,
    paddingVertical: 14,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.background,
  },
});
