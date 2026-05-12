import { Stack, useRouter } from 'expo-router';
import { Trophy, Calendar, Clock, Target, ChevronRight } from 'lucide-react-native';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React from 'react';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useChallenges, Challenge, ChallengeStatus } from '@/contexts/ChallengesContext';

export default function ChallengesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const {
    getChallengeStatus,
    getActiveChallenges,
    getIncomingChallenges,
    getEndedChallenges,
    hasUserSubmitted,
  } = useChallenges();

  const activeChallenges = getActiveChallenges();
  const incomingChallenges = getIncomingChallenges();
  const endedChallenges = getEndedChallenges();

  const getTimeRemaining = (endDate: string) => {
    const now = new Date();
    const end = new Date(endDate);
    const diff = end.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h`;
    return 'Ending soon';
  };

  const getTimeUntilStart = (startDate: string) => {
    const now = new Date();
    const start = new Date(startDate);
    const diff = start.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days > 0) return `Starts in ${days}d`;
    return 'Starts soon';
  };

  const renderChallengeCard = (challenge: Challenge, status: ChallengeStatus) => {
    const statusColor =
      status === 'active' ? Colors.success : status === 'incoming' ? Colors.warning : Colors.textTertiary;
    const statusText = status === 'active' ? '✅ Active' : status === 'incoming' ? '🕓 Incoming' : '❌ Ended';
    const hasSubmitted = user ? hasUserSubmitted(user.id, challenge.id) : false;

    return (
      <TouchableOpacity
        key={challenge.id}
        style={styles.challengeCard}
        onPress={() => router.push(`/challenges/${challenge.id}` as any)}
        activeOpacity={0.7}
      >
        {challenge.mediaUrl && challenge.mediaUrl.trim() !== '' ? (
          <Image source={{ uri: challenge.mediaUrl }} style={styles.challengeImage} />
        ) : (
          <View style={[styles.challengeImage, styles.challengeImagePlaceholder]}>
            <Trophy size={48} color={Colors.textTertiary} />
          </View>
        )}

        <View style={styles.challengeContent}>
          <View style={styles.challengeHeader}>
            <Text style={[styles.challengeStatus, { color: statusColor }]}>{statusText}</Text>
            {status === 'active' && (
              <View style={styles.timeTag}>
                <Clock size={12} color={Colors.textSecondary} />
                <Text style={styles.timeText}>{getTimeRemaining(challenge.endDate)}</Text>
              </View>
            )}
            {status === 'incoming' && (
              <View style={styles.timeTag}>
                <Calendar size={12} color={Colors.textSecondary} />
                <Text style={styles.timeText}>{getTimeUntilStart(challenge.startDate)}</Text>
              </View>
            )}
          </View>

          <Text style={styles.challengeTitle}>{challenge.title}</Text>
          <Text style={styles.challengeDescription} numberOfLines={2}>
            {challenge.description}
          </Text>

          <View style={styles.challengeMeta}>
            <View style={styles.metaItem}>
              <Target size={14} color={Colors.accent} />
              <Text style={styles.metaText}>
                {challenge.metricType} ({challenge.unit})
              </Text>
            </View>
            {hasSubmitted && (
              <View style={[styles.metaItem, { backgroundColor: `${Colors.success}20` }]}>
                <Text style={[styles.metaText, { color: Colors.success }]}>Submitted</Text>
              </View>
            )}
          </View>

          <View style={styles.challengeFooter}>
            <Text style={styles.viewDetailsText}>View Details</Text>
            <ChevronRight size={18} color={Colors.accent} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <View style={styles.header}>
        <Trophy size={28} color={Colors.accent} />
        <Text style={styles.headerTitle}>Challenges</Text>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {activeChallenges.length === 0 && incomingChallenges.length === 0 && endedChallenges.length === 0 ? (
          <View style={styles.emptyState}>
            <Trophy size={64} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>No challenges available</Text>
            <Text style={styles.emptySubtext}>Check back soon for new challenges</Text>
          </View>
        ) : (
          <>
            {activeChallenges.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🟢 Active Challenges</Text>
                <Text style={styles.sectionSubtitle}>Join now and earn rewards</Text>
                {activeChallenges.map((challenge) => renderChallengeCard(challenge, 'active'))}
              </View>
            )}

            {incomingChallenges.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🟡 Incoming Challenges</Text>
                <Text style={styles.sectionSubtitle}>Get ready for these upcoming challenges</Text>
                {incomingChallenges.map((challenge) => renderChallengeCard(challenge, 'incoming'))}
              </View>
            )}

            {endedChallenges.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🔴 Ended Challenges</Text>
                <Text style={styles.sectionSubtitle}>Past challenges and results</Text>
                {endedChallenges.map((challenge) => renderChallengeCard(challenge, 'ended'))}
              </View>
            )}
          </>
        )}

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
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.text,
    textTransform: 'uppercase' as const,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
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
  challengeCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  challengeImage: {
    width: '100%',
    height: 160,
  },
  challengeImagePlaceholder: {
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeContent: {
    padding: 16,
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  challengeStatus: {
    fontSize: 13,
    fontWeight: '700' as const,
  },
  timeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  challengeTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  challengeDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  challengeMeta: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  challengeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  viewDetailsText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.accent,
  },
});
