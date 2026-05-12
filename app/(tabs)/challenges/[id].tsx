import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Trophy, Calendar, Target, ExternalLink, CheckCircle, XCircle, Send, Clock } from 'lucide-react-native';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, Linking, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React from 'react';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useChallenges } from '@/contexts/ChallengesContext';

export default function ChallengeDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useApp();
  
  const {
    getChallengeById,
    getChallengeStatus,
    hasUserSubmitted,
    getUserSubmissions,
  } = useChallenges();

  const challenge = id ? getChallengeById(id) : null;
  
  if (!challenge) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <Trophy size={48} color={Colors.textTertiary} />
        <Text style={styles.errorText}>Challenge not found</Text>
      </View>
    );
  }

  const status = getChallengeStatus(challenge);
  const hasSubmitted = user ? hasUserSubmitted(user.id, challenge.id) : false;
  const userSubmissions = user ? getUserSubmissions(user.id, challenge.id) : [];
  const latestSubmission = userSubmissions[userSubmissions.length - 1];

  const statusColor =
    status === 'active' ? Colors.success : status === 'incoming' ? Colors.warning : Colors.textTertiary;
  const statusText = status === 'active' ? '✅ Challenge Active' : status === 'incoming' ? '🕓 Challenge Incoming' : '❌ Challenge Ended';

  const getCountdown = () => {
    if (status === 'incoming') {
      const now = new Date();
      const start = new Date(challenge.startDate);
      const diff = start.getTime() - now.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      return `Starts in ${days} day${days !== 1 ? 's' : ''}`;
    }
    if (status === 'active') {
      const now = new Date();
      const end = new Date(challenge.endDate);
      const diff = end.getTime() - now.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      if (days > 0) return `${days}d ${hours}h remaining`;
      if (hours > 0) return `${hours}h remaining`;
      return 'Ending soon';
    }
    return 'Challenge ended';
  };

  const handleJoinChallenge = () => {
    if (status !== 'active') {
      Alert.alert('Not Available', 'This challenge is not currently active');
      return;
    }
    router.push(`/challenges/submit?id=${challenge.id}` as any);
  };

  const handleClaimReward = async () => {
    if (!latestSubmission?.rewardUnlocked) return;
    
    try {
      const canOpen = await Linking.canOpenURL(challenge.rewardLink);
      if (canOpen) {
        await Linking.openURL(challenge.rewardLink);
      } else {
        Alert.alert('Error', 'Unable to open reward link');
      }
    } catch (error) {
      console.error('[Challenge] Error opening reward link:', error);
      Alert.alert('Error', 'Failed to open reward link');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Challenge Details',
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerShadowVisible: false,
        }}
      />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {challenge.mediaUrl && challenge.mediaUrl.trim() !== '' ? (
          <Image source={{ uri: challenge.mediaUrl }} style={styles.heroImage} />
        ) : (
          <View style={[styles.heroImage, styles.heroImagePlaceholder]}>
            <Trophy size={80} color={Colors.textTertiary} />
          </View>
        )}

        <View style={styles.content}>
          <View style={styles.statusBanner}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
            <Text style={styles.countdownText}>{getCountdown()}</Text>
          </View>

          <Text style={styles.title}>{challenge.title}</Text>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Mission Brief</Text>
            <Text style={styles.description}>{challenge.description}</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Challenge Details</Text>
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Target size={18} color={Colors.accent} />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Metric Type</Text>
                <Text style={styles.detailValue}>{challenge.metricType} ({challenge.unit})</Text>
              </View>
            </View>
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Calendar size={18} color={Colors.accent} />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Duration</Text>
                <Text style={styles.detailValue}>
                  {new Date(challenge.startDate).toLocaleDateString()} - {new Date(challenge.endDate).toLocaleDateString()}
                </Text>
              </View>
            </View>
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <ExternalLink size={18} color={Colors.accent} />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Verification</Text>
                <Text style={styles.detailValue}>
                  {challenge.verificationType === 'manual' ? 'Manual Entry' : 'Video Upload Required'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Target Metrics by Weight Class</Text>
            {challenge.weightClasses.map((wc, index) => (
              <View key={index} style={styles.weightClassRow}>
                <View style={styles.weightClassInfo}>
                  <Text style={styles.weightClassName}>{wc.className}</Text>
                  <Text style={styles.weightClassTarget}>
                    Target: {wc.targetValue} {challenge.unit}
                  </Text>
                </View>
                <View style={styles.weightClassBadge}>
                  <Trophy size={16} color={Colors.accent} />
                </View>
              </View>
            ))}
          </View>

          {hasSubmitted && latestSubmission && (
            <View style={styles.submissionCard}>
              <View style={styles.submissionHeader}>
                {latestSubmission.reviewStatus === 'pending' ? (
                  <Clock size={24} color={Colors.warning} />
                ) : latestSubmission.reviewStatus === 'approved' && latestSubmission.rewardUnlocked ? (
                  <CheckCircle size={24} color={Colors.success} />
                ) : (
                  <XCircle size={24} color={Colors.danger} />
                )}
                <Text style={styles.submissionTitle}>
                  {latestSubmission.reviewStatus === 'pending' 
                    ? 'Review Pending' 
                    : latestSubmission.reviewStatus === 'approved' && latestSubmission.rewardUnlocked
                    ? 'Mission Accomplished!'
                    : latestSubmission.reviewStatus === 'approved'
                    ? 'Target Not Reached'
                    : 'Submission Rejected'}
                </Text>
              </View>
              <Text style={styles.submissionText}>
                Your result: {latestSubmission.resultValue} {challenge.unit}
              </Text>
              <Text style={styles.submissionText}>
                Weight class: {latestSubmission.weightClass}
              </Text>
              {latestSubmission.proofUrl && (
                <Text style={styles.submissionText}>
                  Proof link: {latestSubmission.proofUrl.substring(0, 40)}...
                </Text>
              )}
              {latestSubmission.reviewStatus === 'pending' ? (
                <Text style={styles.submissionPending}>
                  ⏳ Your submission is being reviewed by an admin. You&apos;ll be notified once it&apos;s approved or rejected.
                </Text>
              ) : latestSubmission.reviewStatus === 'approved' && latestSubmission.rewardUnlocked ? (
                <>
                  <Text style={styles.submissionSuccess}>
                    You&apos;ve earned your reward! Click below to claim it.
                  </Text>
                  <TouchableOpacity style={styles.rewardButton} onPress={handleClaimReward}>
                    <ExternalLink size={18} color={Colors.background} />
                    <Text style={styles.rewardButtonText}>Claim Reward</Text>
                  </TouchableOpacity>
                </>
              ) : latestSubmission.reviewStatus === 'approved' ? (
                <Text style={styles.submissionFailed}>
                  Your submission was approved but you didn&apos;t reach the target. Train harder!
                </Text>
              ) : (
                <>
                  <Text style={styles.submissionFailed}>
                    Your submission was rejected.
                  </Text>
                  {latestSubmission.rejectionReason && (
                    <Text style={styles.rejectionReason}>
                      Reason: {latestSubmission.rejectionReason}
                    </Text>
                  )}
                </>
              )}
            </View>
          )}

          {status === 'active' && (
            <TouchableOpacity
              style={[styles.joinButton, hasSubmitted && styles.joinButtonDisabled]}
              onPress={handleJoinChallenge}
              disabled={hasSubmitted}
            >
              <Send size={20} color={hasSubmitted ? Colors.textTertiary : Colors.background} />
              <Text style={[styles.joinButtonText, hasSubmitted && styles.joinButtonTextDisabled]}>
                {hasSubmitted ? 'Already Submitted' : 'Join Challenge'}
              </Text>
            </TouchableOpacity>
          )}

          {status === 'incoming' && (
            <View style={styles.incomingBanner}>
              <Text style={styles.incomingText}>Challenge will be available soon</Text>
            </View>
          )}

          {status === 'ended' && !hasSubmitted && (
            <View style={styles.endedBanner}>
              <Text style={styles.endedText}>This challenge has ended</Text>
            </View>
          )}
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
  scrollView: {
    flex: 1,
  },
  heroImage: {
    width: '100%',
    height: 220,
  },
  heroImagePlaceholder: {
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
  },
  statusBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  countdownText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  title: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 20,
    textTransform: 'uppercase' as const,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 12,
    textTransform: 'uppercase' as const,
  },
  description: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${Colors.accent}20`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  weightClassRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  weightClassInfo: {
    flex: 1,
  },
  weightClassName: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  weightClassTarget: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  weightClassBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${Colors.accent}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submissionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.accent,
    marginBottom: 16,
  },
  submissionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  submissionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  submissionText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  submissionSuccess: {
    fontSize: 14,
    color: Colors.success,
    marginTop: 8,
    marginBottom: 12,
  },
  submissionFailed: {
    fontSize: 14,
    color: Colors.danger,
    marginTop: 8,
  },
  submissionPending: {
    fontSize: 14,
    color: Colors.warning,
    marginTop: 8,
  },
  rejectionReason: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic' as const,
  },
  rewardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.success,
    paddingVertical: 12,
    borderRadius: 12,
  },
  rewardButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.background,
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 16,
  },
  joinButtonDisabled: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  joinButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.background,
    textTransform: 'uppercase' as const,
  },
  joinButtonTextDisabled: {
    color: Colors.textTertiary,
  },
  incomingBanner: {
    backgroundColor: `${Colors.warning}20`,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  incomingText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.warning,
  },
  endedBanner: {
    backgroundColor: `${Colors.danger}20`,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  endedText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.danger,
  },
  errorText: {
    fontSize: 16,
    color: Colors.danger,
    marginTop: 12,
  },
});
