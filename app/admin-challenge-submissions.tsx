import { Stack } from 'expo-router';
import { Trophy, Clock, CheckCircle, XCircle, ExternalLink, User } from 'lucide-react-native';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Modal, Linking, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useState } from 'react';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useChallenges, ChallengeSubmission } from '@/contexts/ChallengesContext';
import { useNotifications } from '@/contexts/NotificationsContext';

export default function AdminChallengeSubmissionsScreen() {
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useApp();
  const {
    submissions,
    challenges,
    getChallengeById,
    approveSubmission,
    rejectSubmission,
  } = useChallenges();
  const { createNotification } = useNotifications();

  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [reviewingSubmission, setReviewingSubmission] = useState<ChallengeSubmission | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  if (!currentUser?.isAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.errorText}>Access Denied</Text>
      </View>
    );
  }

  const pendingSubmissions = submissions.filter(s => s.reviewStatus === 'pending');
  const reviewedSubmissions = submissions.filter(s => s.reviewStatus !== 'pending');

  const openReviewModal = (submission: ChallengeSubmission) => {
    setReviewingSubmission(submission);
    setRejectionReason('');
    setShowReviewModal(true);
  };

  const handleApprove = async () => {
    if (!reviewingSubmission || !currentUser) return;

    setIsProcessing(true);
    try {
      const success = await approveSubmission(reviewingSubmission.id, currentUser.id);
      if (success) {
        const challenge = getChallengeById(reviewingSubmission.challengeId);
        const challengeClass = challenge?.weightClasses.find(wc => wc.className === reviewingSubmission.weightClass);
        const rewardUnlocked = challengeClass ? reviewingSubmission.resultValue >= challengeClass.targetValue : false;

        await createNotification(
          reviewingSubmission.userId,
          'challenge_approved',
          rewardUnlocked ? '🎉 Challenge Completed!' : 'Challenge Reviewed',
          rewardUnlocked 
            ? `Your submission for "${challenge?.title}" has been approved! You've earned your reward!`
            : `Your submission for "${challenge?.title}" has been approved, but you didn't reach the target. Keep training!`,
          { submissionId: reviewingSubmission.id, challengeId: reviewingSubmission.challengeId }
        );

        Alert.alert('Success', 'Submission approved successfully');
        setShowReviewModal(false);
        setReviewingSubmission(null);
      } else {
        Alert.alert('Error', 'Failed to approve submission');
      }
    } catch (error) {
      console.error('[AdminSubmissions] Error approving:', error);
      Alert.alert('Error', 'Failed to approve submission');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!reviewingSubmission || !currentUser) return;

    if (!rejectionReason.trim()) {
      Alert.alert('Validation Error', 'Please provide a rejection reason');
      return;
    }

    setIsProcessing(true);
    try {
      const success = await rejectSubmission(reviewingSubmission.id, currentUser.id, rejectionReason.trim());
      if (success) {
        const challenge = getChallengeById(reviewingSubmission.challengeId);

        await createNotification(
          reviewingSubmission.userId,
          'challenge_rejected',
          '❌ Challenge Submission Rejected',
          `Your submission for "${challenge?.title}" has been rejected. Reason: ${rejectionReason.trim()}`,
          { submissionId: reviewingSubmission.id, challengeId: reviewingSubmission.challengeId }
        );

        Alert.alert('Success', 'Submission rejected');
        setShowReviewModal(false);
        setReviewingSubmission(null);
        setRejectionReason('');
      } else {
        Alert.alert('Error', 'Failed to reject submission');
      }
    } catch (error) {
      console.error('[AdminSubmissions] Error rejecting:', error);
      Alert.alert('Error', 'Failed to reject submission');
    } finally {
      setIsProcessing(false);
    }
  };

  const openProofLink = async (url: string) => {
    try {
      let correctedUrl = url.trim();

      if (!correctedUrl.match(/^[a-zA-Z]+:\/\//)) {
        correctedUrl = 'https://' + correctedUrl;
      }

      correctedUrl = correctedUrl
        .replace(/^hrrps:\/\//i, 'https://')
        .replace(/^hrtp:\/\//i, 'http://')
        .replace(/^htps:\/\//i, 'https://')
        .replace(/^htp:\/\//i, 'http://')
        .replace(/^ttps:\/\//i, 'https://')
        .replace(/^ttp:\/\//i, 'http://');

      const canOpen = await Linking.canOpenURL(correctedUrl);
      if (canOpen) {
        await Linking.openURL(correctedUrl);
      } else {
        Alert.alert(
          'Invalid URL',
          `Unable to open the link. Please check if it's a valid URL.\n\nOriginal: ${url}\nCorrected: ${correctedUrl}`,
          [
            { text: 'OK', style: 'cancel' },
            { 
              text: 'Copy Link', 
              onPress: () => {
                console.log('[AdminSubmissions] Copying URL:', correctedUrl);
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error('[AdminSubmissions] Error opening link:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert(
        'Error Opening Link',
        `Failed to open the link.\n\nURL: ${url}\n\nError: ${errorMessage}\n\nPlease verify the URL is correct.`,
        [{ text: 'OK' }]
      );
    }
  };

  const renderSubmissionCard = (submission: ChallengeSubmission) => {
    const challenge = getChallengeById(submission.challengeId);
    if (!challenge) return null;

    const statusColor = 
      submission.reviewStatus === 'pending' ? Colors.warning :
      submission.reviewStatus === 'approved' ? Colors.success : Colors.danger;

    const statusIcon = 
      submission.reviewStatus === 'pending' ? Clock :
      submission.reviewStatus === 'approved' ? CheckCircle : XCircle;

    const StatusIcon = statusIcon;

    return (
      <TouchableOpacity
        key={submission.id}
        style={styles.submissionCard}
        onPress={() => submission.reviewStatus === 'pending' && openReviewModal(submission)}
        disabled={submission.reviewStatus !== 'pending'}
      >
        <View style={styles.submissionHeader}>
          <StatusIcon size={24} color={statusColor} />
          <View style={styles.submissionHeaderContent}>
            <Text style={styles.challengeName}>{challenge.title}</Text>
            <Text style={[styles.submissionStatus, { color: statusColor }]}>
              {submission.reviewStatus === 'pending' ? '⏳ Pending Review' :
               submission.reviewStatus === 'approved' ? '✅ Approved' : '❌ Rejected'}
            </Text>
          </View>
        </View>

        <View style={styles.submissionDetails}>
          <View style={styles.detailRow}>
            <User size={16} color={Colors.textSecondary} />
            <Text style={styles.detailText}>User ID: {submission.userId.substring(0, 8)}...</Text>
          </View>
          <View style={styles.detailRow}>
            <Trophy size={16} color={Colors.textSecondary} />
            <Text style={styles.detailText}>
              Result: {submission.resultValue} {challenge.unit} ({submission.weightClass})
            </Text>
          </View>
          {submission.proofUrl && (
            <TouchableOpacity 
              style={styles.detailRow}
              onPress={() => openProofLink(submission.proofUrl!)}
            >
              <ExternalLink size={16} color={Colors.accent} />
              <Text style={[styles.detailText, { color: Colors.accent }]}>
                View Proof Link
              </Text>
            </TouchableOpacity>
          )}
          <View style={styles.detailRow}>
            <Clock size={16} color={Colors.textSecondary} />
            <Text style={styles.detailText}>
              {new Date(submission.timestamp).toLocaleString()}
            </Text>
          </View>
        </View>

        {submission.reviewStatus === 'rejected' && submission.rejectionReason && (
          <View style={styles.rejectionBox}>
            <Text style={styles.rejectionLabel}>Rejection Reason:</Text>
            <Text style={styles.rejectionText}>{submission.rejectionReason}</Text>
          </View>
        )}

        {submission.reviewStatus === 'pending' && (
          <Text style={styles.reviewPrompt}>Tap to review →</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Review Submissions',
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerShadowVisible: false,
        }}
      />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Trophy size={28} color={Colors.accent} />
          <Text style={styles.headerTitle}>Challenge Submissions</Text>
        </View>

        {pendingSubmissions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⏳ Pending Review ({pendingSubmissions.length})</Text>
            {pendingSubmissions.map(renderSubmissionCard)}
          </View>
        )}

        {reviewedSubmissions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reviewed ({reviewedSubmissions.length})</Text>
            {reviewedSubmissions.map(renderSubmissionCard)}
          </View>
        )}

        {submissions.length === 0 && (
          <View style={styles.emptyState}>
            <Trophy size={64} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>No submissions yet</Text>
            <Text style={styles.emptySubtext}>Submissions will appear here when users complete challenges</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {reviewingSubmission && (
        <Modal visible={showReviewModal} animationType="slide" transparent onRequestClose={() => setShowReviewModal(false)}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <View style={styles.modalOverlay}>
              <ScrollView 
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Review Submission</Text>

              <View style={styles.modalInfo}>
                <Text style={styles.modalInfoLabel}>Challenge</Text>
                <Text style={styles.modalInfoValue}>
                  {getChallengeById(reviewingSubmission.challengeId)?.title}
                </Text>
              </View>

              <View style={styles.modalInfo}>
                <Text style={styles.modalInfoLabel}>Result</Text>
                <Text style={styles.modalInfoValue}>
                  {reviewingSubmission.resultValue} {getChallengeById(reviewingSubmission.challengeId)?.unit}
                </Text>
              </View>

              <View style={styles.modalInfo}>
                <Text style={styles.modalInfoLabel}>Weight Class</Text>
                <Text style={styles.modalInfoValue}>{reviewingSubmission.weightClass}</Text>
              </View>

              {reviewingSubmission.proofUrl && (
                <TouchableOpacity 
                  style={styles.proofLinkButton}
                  onPress={() => openProofLink(reviewingSubmission.proofUrl!)}
                >
                  <ExternalLink size={18} color={Colors.accent} />
                  <Text style={styles.proofLinkText}>View Proof Video/Link</Text>
                </TouchableOpacity>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.approveButton]}
                  onPress={handleApprove}
                  disabled={isProcessing}
                >
                  <CheckCircle size={20} color={Colors.background} />
                  <Text style={styles.approveButtonText}>
                    {isProcessing ? 'Processing...' : 'Approve'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.rejectButton]}
                  onPress={() => {}}
                  disabled={isProcessing}
                >
                  <XCircle size={20} color={Colors.background} />
                  <Text style={styles.rejectButtonText}>Reject</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.rejectionReasonContainer}>
                <Text style={styles.rejectionReasonLabel}>Rejection Reason (required for reject):</Text>
                <TextInput
                  style={styles.rejectionReasonInput}
                  value={rejectionReason}
                  onChangeText={setRejectionReason}
                  placeholder="Enter reason for rejection..."
                  placeholderTextColor={Colors.textTertiary}
                  multiline
                  numberOfLines={3}
                />
                <TouchableOpacity
                  style={[styles.submitRejectButton, !rejectionReason.trim() && styles.submitRejectButtonDisabled]}
                  onPress={handleReject}
                  disabled={!rejectionReason.trim() || isProcessing}
                >
                  <Text style={styles.submitRejectButtonText}>Submit Rejection</Text>
                </TouchableOpacity>
              </View>

                  <TouchableOpacity
                    style={styles.modalClose}
                    onPress={() => setShowReviewModal(false)}
                    disabled={isProcessing}
                  >
                    <Text style={styles.modalCloseText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.text,
    textTransform: 'uppercase' as const,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 16,
    textTransform: 'uppercase' as const,
  },
  submissionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  submissionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  submissionHeaderContent: {
    flex: 1,
  },
  challengeName: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  submissionStatus: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  submissionDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  rejectionBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: `${Colors.danger}20`,
    borderRadius: 8,
  },
  rejectionLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.danger,
    marginBottom: 4,
  },
  rejectionText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: 'italic' as const,
  },
  reviewPrompt: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.accent,
    textAlign: 'right',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
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
    marginTop: 4,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInfo: {
    marginBottom: 16,
  },
  modalInfoLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textTertiary,
    marginBottom: 4,
  },
  modalInfoValue: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  proofLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  proofLinkText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.accent,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  approveButton: {
    backgroundColor: Colors.success,
  },
  approveButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.background,
  },
  rejectButton: {
    backgroundColor: Colors.danger,
  },
  rejectButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.background,
  },
  rejectionReasonContainer: {
    marginBottom: 20,
  },
  rejectionReasonLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  rejectionReasonInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.text,
    height: 80,
    textAlignVertical: 'top',
  },
  submitRejectButton: {
    backgroundColor: Colors.danger,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  submitRejectButtonDisabled: {
    opacity: 0.5,
  },
  submitRejectButtonText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.background,
  },
  modalClose: {
    backgroundColor: Colors.surface,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalCloseText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  errorText: {
    fontSize: 18,
    color: Colors.danger,
    fontWeight: '600' as const,
  },
});
