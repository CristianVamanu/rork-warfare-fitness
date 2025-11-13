import { Stack, useRouter } from 'expo-router';
import { Medal, TrendingUp, Award, Target, ChevronLeft, Crown, Zap } from 'lucide-react-native';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React from 'react';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useRanking, RANK_THRESHOLDS } from '@/contexts/RankingContext';
import { useLeaderboard } from '@/contexts/LeaderboardContext';
import { useTraining } from '@/contexts/TrainingContext';
import { getWeightDisplay } from '@/lib/weight-utils';

export default function MyRankScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const {
    userRankData,
    getRankColor,
    getNextRank,
    getProgressToNextRank,
    getUserGlobalRank,
    getTopPercentile,
  } = useRanking();
  const { getUserPosition } = useLeaderboard();
  const { workoutLogs } = useTraining();

  if (!user || !userRankData) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.emptyState}>
          <Medal size={64} color={Colors.textTertiary} />
          <Text style={styles.emptyText}>No rank data available</Text>
          <Text style={styles.emptySubtext}>Complete workouts to earn your rank</Text>
        </View>
      </View>
    );
  }

  const rankColor = getRankColor(userRankData.rank);
  const nextRank = getNextRank(userRankData.rank);
  const progressPercent = getProgressToNextRank(userRankData.rankScore, userRankData.rank);
  const globalRank = getUserGlobalRank(user.id);
  const percentile = getTopPercentile(user.id);
  const position = getUserPosition();

  const recentWorkouts = workoutLogs.slice(0, 7).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Rank</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={[styles.rankCard, { borderColor: rankColor }]}>
          <View style={[styles.rankBadge, { backgroundColor: `${rankColor}20` }]}>
            <Crown size={48} color={rankColor} />
          </View>
          <Text style={[styles.rankTitle, { color: rankColor }]}>{userRankData.rank}</Text>
          <Text style={styles.rankSubtitle}>Military Rank</Text>
          
          <View style={styles.globalRankRow}>
            <Text style={styles.globalRankText}>Global Rank:</Text>
            <Text style={[styles.globalRankValue, { color: rankColor }]}>#{globalRank}</Text>
          </View>
          <Text style={styles.percentileText}>{percentile}</Text>
        </View>

        {nextRank && (
          <View style={styles.progressCard}>
            <Text style={styles.progressTitle}>Progress to {nextRank.rank}</Text>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, { width: `${progressPercent}%`, backgroundColor: rankColor }]} />
            </View>
            <View style={styles.progressStats}>
              <Text style={styles.progressText}>
                {userRankData.rankScore.toLocaleString()} / {nextRank.minScore.toLocaleString()}
              </Text>
              <Text style={styles.progressPercent}>{Math.floor(progressPercent)}%</Text>
            </View>
          </View>
        )}

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Zap size={24} color={Colors.accent} />
            <Text style={styles.statValue}>{userRankData.rankScore.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Rank Score</Text>
          </View>

          <View style={styles.statCard}>
            <TrendingUp size={24} color={Colors.success} />
            <Text style={styles.statValue} numberOfLines={1}>{getWeightDisplay(userRankData.totalVolume, user.weightUnit)}</Text>
            <Text style={styles.statLabel}>Total Volume</Text>
          </View>

          <View style={styles.statCard}>
            <Target size={24} color={Colors.warning} />
            <Text style={styles.statValue}>{userRankData.workoutsLogged}</Text>
            <Text style={styles.statLabel}>Workouts Logged</Text>
          </View>

          <View style={styles.statCard}>
            <Award size={24} color={Colors.primary} />
            <Text style={styles.statValue}>{userRankData.consistencyFactor.toFixed(1)}x</Text>
            <Text style={styles.statLabel}>Consistency</Text>
          </View>
        </View>

        <View style={styles.rankListCard}>
          <Text style={styles.rankListTitle}>All Military Ranks</Text>
          {RANK_THRESHOLDS.map((threshold, index) => {
            const isCurrentRank = threshold.rank === userRankData.rank;
            const isUnlocked = userRankData.rankScore >= threshold.minScore;
            const thresholdColor = threshold.color;

            return (
              <View
                key={threshold.rank}
                style={[
                  styles.rankListItem,
                  isCurrentRank && styles.rankListItemCurrent,
                  { borderLeftColor: thresholdColor },
                ]}
              >
                <View style={[styles.rankListBadge, { backgroundColor: `${thresholdColor}20` }]}>
                  <Medal size={20} color={thresholdColor} />
                </View>
                <View style={styles.rankListContent}>
                  <Text
                    style={[
                      styles.rankListName,
                      isCurrentRank && { color: thresholdColor },
                      !isUnlocked && styles.rankListNameLocked,
                    ]}
                  >
                    {threshold.rank}
                    {isCurrentRank && ' (Current)'}
                  </Text>
                  <Text style={styles.rankListScore}>
                    {threshold.minScore.toLocaleString()} Score Required
                  </Text>
                </View>
                {!isUnlocked && (
                  <View style={styles.lockedBadge}>
                    <Text style={styles.lockedText}>Locked</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>How to Rank Up</Text>
          <View style={styles.tipItem}>
            <View style={styles.tipBullet} />
            <Text style={styles.tipText}>Log more workouts with higher weights and reps</Text>
          </View>
          <View style={styles.tipItem}>
            <View style={styles.tipBullet} />
            <Text style={styles.tipText}>Maintain consistency by working out regularly</Text>
          </View>
          <View style={styles.tipItem}>
            <View style={styles.tipBullet} />
            <Text style={styles.tipText}>Complete challenges to boost your score</Text>
          </View>
          <View style={styles.tipItem}>
            <View style={styles.tipBullet} />
            <Text style={styles.tipText}>Focus on compound movements for maximum volume</Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  scrollView: {
    flex: 1,
  },
  rankCard: {
    margin: 20,
    padding: 24,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 2,
  },
  rankBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  rankTitle: {
    fontSize: 32,
    fontWeight: '900' as const,
    textAlign: 'center',
    textTransform: 'uppercase' as const,
  },
  rankSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
    marginBottom: 16,
  },
  globalRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  globalRankText: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  globalRankValue: {
    fontSize: 20,
    fontWeight: '800' as const,
  },
  percentileText: {
    fontSize: 14,
    color: Colors.textTertiary,
    fontWeight: '600' as const,
  },
  progressCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 12,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: Colors.background,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  progressPercent: {
    fontSize: 13,
    color: Colors.accent,
    fontWeight: '700' as const,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.text,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 4,
    textAlign: 'center',
  },
  rankListCard: {
    marginHorizontal: 20,
    padding: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rankListTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 16,
  },
  rankListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderLeftWidth: 3,
    paddingLeft: 12,
    marginBottom: 8,
  },
  rankListItemCurrent: {
    backgroundColor: `${Colors.accent}10`,
    borderRadius: 12,
    paddingRight: 12,
  },
  rankListBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankListContent: {
    flex: 1,
  },
  rankListName: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  rankListNameLocked: {
    opacity: 0.5,
  },
  rankListScore: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  lockedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Colors.background,
    borderRadius: 8,
  },
  lockedText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textTertiary,
  },
  tipsCard: {
    marginHorizontal: 20,
    padding: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 12,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  tipBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
    marginTop: 6,
    marginRight: 10,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.textTertiary,
    marginTop: 8,
    textAlign: 'center',
  },
});
