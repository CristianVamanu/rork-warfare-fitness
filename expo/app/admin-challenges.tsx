import { Stack, useRouter } from 'expo-router';
import { Plus, Trophy, Calendar, Edit, Trash2, ExternalLink, Clock, CheckCircle, XCircle, Eye, MessageSquare } from 'lucide-react-native';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useState } from 'react';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useChallenges, Challenge } from '@/contexts/ChallengesContext';

export default function AdminChallengesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const { 
    challenges, 
    createChallenge, 
    updateChallenge, 
    deleteChallenge, 
    getChallengeStatus,
    getPendingSubmissions,
    submissions,
    getSubmissionById,
    getChallengeById,
    approveSubmission,
    rejectSubmission,
  } = useChallenges();
  const { user: appUser } = useApp();
  
  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);
  const [editingChallenge, setEditingChallenge] = useState<Challenge | null>(null);
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [reviewingSubmissionId, setReviewingSubmissionId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    mediaUrl: '',
    challengeType: 'weight' as 'weight' | 'reps',
    targetValue: '',
    rewardLink: '',
    verificationType: 'manual' as 'manual' | 'video',
    startDate: '',
    endDate: '',
  });

  if (!user?.isAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.errorText}>Access Denied</Text>
      </View>
    );
  }

  const openCreateModal = () => {
    console.log('[AdminChallenges] Opening create modal');
    setEditingChallenge(null);
    setFormData({
      title: '',
      description: '',
      mediaUrl: '',
      challengeType: 'weight',
      targetValue: '',
      rewardLink: '',
      verificationType: 'manual',
      startDate: '',
      endDate: '',
    });
    setIsModalVisible(true);
    console.log('[AdminChallenges] Modal visibility set to true');
  };

  const openEditModal = (challenge: Challenge) => {
    setEditingChallenge(challenge);
    const challengeType = challenge.unit === 'reps' ? 'reps' : 'weight';
    const targetValue = challenge.weightClasses[0]?.targetValue.toString() ?? '';
    setFormData({
      title: challenge.title,
      description: challenge.description,
      mediaUrl: challenge.mediaUrl ?? '',
      challengeType,
      targetValue,
      rewardLink: challenge.rewardLink,
      verificationType: challenge.verificationType,
      startDate: challenge.startDate,
      endDate: challenge.endDate,
    });
    setIsModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.targetValue || !formData.rewardLink || !formData.startDate || !formData.endDate) {
      Alert.alert('Validation Error', 'Please fill all required fields');
      return;
    }

    const targetNum = parseFloat(formData.targetValue);
    if (isNaN(targetNum) || targetNum <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid target value');
      return;
    }

    try {
      const unit = formData.challengeType === 'reps' ? 'reps' : 'kg';
      const metricType = formData.challengeType === 'reps' ? 'Reps' : '1 Rep Max';
      
      const challengeData = {
        title: formData.title,
        description: formData.description,
        mediaUrl: formData.mediaUrl,
        metricType,
        unit,
        weightClasses: [{ className: 'All', targetValue: targetNum }],
        rewardLink: formData.rewardLink,
        verificationType: formData.verificationType,
        startDate: formData.startDate,
        endDate: formData.endDate,
      };

      if (editingChallenge) {
        await updateChallenge(editingChallenge.id, challengeData);
        Alert.alert('Success', 'Challenge updated successfully');
      } else {
        await createChallenge(challengeData);
        Alert.alert('Success', 'Challenge created successfully');
      }
      setIsModalVisible(false);
    } catch (error) {
      console.error('[AdminChallenges] Error saving challenge:', error);
      Alert.alert('Error', 'Failed to save challenge');
    }
  };

  const handleDelete = (challengeId: string) => {
    Alert.alert(
      'Delete Challenge',
      'Are you sure you want to delete this challenge?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteChallenge(challengeId);
            Alert.alert('Success', 'Challenge deleted');
          },
        },
      ]
    );
  };



  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Manage Challenges',
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerShadowVisible: false,
        }}
      />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Trophy size={28} color={Colors.accent} />
          <Text style={styles.headerTitle}>Challenge System</Text>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.createButton} onPress={openCreateModal}>
            <Plus size={20} color={Colors.background} />
            <Text style={styles.createButtonText}>Create Challenge</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.reviewButton} 
            onPress={() => router.push('/admin-challenge-submissions' as any)}
          >
            <Clock size={20} color={Colors.background} />
            <Text style={styles.reviewButtonText}>Review ({getPendingSubmissions().length})</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>All Challenges</Text>
          {challenges.length === 0 ? (
            <View style={styles.emptyState}>
              <Trophy size={48} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>No challenges yet</Text>
              <Text style={styles.emptySubtext}>Create your first challenge to get started</Text>
            </View>
          ) : (
            challenges.map((challenge) => {
              const status = getChallengeStatus(challenge);
              const statusColor =
                status === 'active' ? Colors.success : status === 'incoming' ? Colors.warning : Colors.textTertiary;
              const statusText = status === 'active' ? '🟢 Active' : status === 'incoming' ? '🟡 Incoming' : '🔴 Ended';

              return (
                <View key={challenge.id} style={styles.challengeCard}>
                  <View style={styles.challengeHeader}>
                    <View style={styles.challengeInfo}>
                      <Text style={styles.challengeTitle}>{challenge.title}</Text>
                      <Text style={[styles.challengeStatus, { color: statusColor }]}>{statusText}</Text>
                    </View>
                    <View style={styles.challengeActions}>
                      <TouchableOpacity onPress={() => openEditModal(challenge)} style={styles.actionButton}>
                        <Edit size={18} color={Colors.accent} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(challenge.id)} style={styles.actionButton}>
                        <Trash2 size={18} color={Colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.challengeDescription} numberOfLines={2}>
                    {challenge.description}
                  </Text>
                  <View style={styles.challengeMeta}>
                    <View style={styles.metaItem}>
                      <Calendar size={14} color={Colors.textSecondary} />
                      <Text style={styles.metaText}>
                        {new Date(challenge.startDate).toLocaleDateString()} -{' '}
                        {new Date(challenge.endDate).toLocaleDateString()}
                      </Text>
                    </View>
                    <View style={styles.metaItem}>
                      <ExternalLink size={14} color={Colors.textSecondary} />
                      <Text style={styles.metaText}>{challenge.metricType}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={isModalVisible} animationType="slide" transparent onRequestClose={() => setIsModalVisible(false)}>
        <KeyboardAvoidingView 
          style={styles.modalOverlay} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingChallenge ? 'Edit Challenge' : 'Create Challenge'}</Text>

            <ScrollView 
              style={styles.modalScroll} 
              showsVerticalScrollIndicator={false} 
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.formGroup}>
                <Text style={styles.label}>Title *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.title}
                  onChangeText={(text) => setFormData({ ...formData, title: text })}
                  placeholder="e.g., 1 Rep Max Challenge"
                  placeholderTextColor={Colors.textTertiary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Description *</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={formData.description}
                  onChangeText={(text) => setFormData({ ...formData, description: text })}
                  placeholder="Mission brief..."
                  placeholderTextColor={Colors.textTertiary}
                  multiline
                  numberOfLines={4}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Media URL (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={formData.mediaUrl}
                  onChangeText={(text) => setFormData({ ...formData, mediaUrl: text })}
                  placeholder="https://..."
                  placeholderTextColor={Colors.textTertiary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Challenge Type *</Text>
                <View style={styles.radioGroup}>
                  <TouchableOpacity
                    style={[styles.radioButton, formData.challengeType === 'weight' && styles.radioButtonActive]}
                    onPress={() => setFormData({ ...formData, challengeType: 'weight' })}
                  >
                    <Text
                      style={[
                        styles.radioButtonText,
                        formData.challengeType === 'weight' && styles.radioButtonTextActive,
                      ]}
                    >
                      Weight (kg)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.radioButton, formData.challengeType === 'reps' && styles.radioButtonActive]}
                    onPress={() => setFormData({ ...formData, challengeType: 'reps' })}
                  >
                    <Text
                      style={[
                        styles.radioButtonText,
                        formData.challengeType === 'reps' && styles.radioButtonTextActive,
                      ]}
                    >
                      Reps
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  {formData.challengeType === 'weight' ? 'Target Weight (kg) *' : 'Target Reps *'}
                </Text>
                <TextInput
                  style={styles.input}
                  value={formData.targetValue}
                  onChangeText={(text) => setFormData({ ...formData, targetValue: text })}
                  placeholder={formData.challengeType === 'weight' ? 'e.g., 100' : 'e.g., 50'}
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Reward Link *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.rewardLink}
                  onChangeText={(text) => setFormData({ ...formData, rewardLink: text })}
                  placeholder="https://..."
                  placeholderTextColor={Colors.textTertiary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Verification Type</Text>
                <View style={styles.radioGroup}>
                  <TouchableOpacity
                    style={[styles.radioButton, formData.verificationType === 'manual' && styles.radioButtonActive]}
                    onPress={() => setFormData({ ...formData, verificationType: 'manual' })}
                  >
                    <Text
                      style={[
                        styles.radioButtonText,
                        formData.verificationType === 'manual' && styles.radioButtonTextActive,
                      ]}
                    >
                      Manual Entry
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.radioButton, formData.verificationType === 'video' && styles.radioButtonActive]}
                    onPress={() => setFormData({ ...formData, verificationType: 'video' })}
                  >
                    <Text
                      style={[
                        styles.radioButtonText,
                        formData.verificationType === 'video' && styles.radioButtonTextActive,
                      ]}
                    >
                      Video Upload
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Start Date *</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.startDate}
                    onChangeText={(text) => setFormData({ ...formData, startDate: text })}
                    placeholder="2025-01-01"
                    placeholderTextColor={Colors.textTertiary}
                  />
                </View>

                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>End Date *</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.endDate}
                    onChangeText={(text) => setFormData({ ...formData, endDate: text })}
                    placeholder="2025-01-31"
                    placeholderTextColor={Colors.textTertiary}
                  />
                </View>
              </View>

              <View style={{ height: 100 }} />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setIsModalVisible(false)}
              >
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonPrimary]} onPress={handleSave}>
                <Text style={styles.modalButtonPrimaryText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  buttonRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 24,
  },
  createButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
  },
  reviewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.warning,
    paddingVertical: 14,
    borderRadius: 12,
  },
  reviewButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.background,
  },
  createButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.background,
  },
  section: {
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 16,
    textTransform: 'uppercase' as const,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
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
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  challengeInfo: {
    flex: 1,
  },
  challengeTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  challengeStatus: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  challengeActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: Colors.background,
  },
  challengeDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  challengeMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    maxHeight: '92%',
    flex: 1,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingBottom: 20,
  },
  formGroup: {
    marginBottom: 16,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.text,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  weightClassRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  removeButton: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.accent,
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  radioButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  radioButtonActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  radioButtonText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  radioButtonTextActive: {
    color: Colors.background,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonSecondary: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalButtonSecondaryText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  modalButtonPrimary: {
    backgroundColor: Colors.accent,
  },
  modalButtonPrimaryText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.background,
  },
  errorText: {
    fontSize: 18,
    color: Colors.danger,
    fontWeight: '600' as const,
  },
});
