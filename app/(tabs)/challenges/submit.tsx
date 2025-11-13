import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Send, Link2 } from 'lucide-react-native';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useState } from 'react';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useChallenges } from '@/contexts/ChallengesContext';

export default function SubmitChallengeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useApp();
  const { getChallengeById, submitChallenge, getChallengeStatus } = useChallenges();

  const challenge = id ? getChallengeById(id) : null;

  const [selectedWeightClass, setSelectedWeightClass] = useState<string>('');

  React.useEffect(() => {
    if (challenge && challenge.weightClasses.length === 1) {
      setSelectedWeightClass(challenge.weightClasses[0].className);
    }
  }, [challenge]);
  const [resultValue, setResultValue] = useState<string>('');
  const [proofLink, setProofLink] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!challenge) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.errorText}>Challenge not found</Text>
      </View>
    );
  }

  const status = getChallengeStatus(challenge);
  if (status !== 'active') {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.errorText}>This challenge is not currently active</Text>
      </View>
    );
  }



  const handleSubmit = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to submit');
      return;
    }

    if (!selectedWeightClass) {
      Alert.alert('Validation Error', 'Please select your weight class');
      return;
    }

    const result = parseFloat(resultValue);
    if (isNaN(result) || result <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid result');
      return;
    }

    if (challenge.verificationType === 'video' && !proofLink.trim()) {
      Alert.alert('Proof Required', 'This challenge requires video proof. Please add a link to your video.');
      return;
    }

    setIsSubmitting(true);

    try {
      const submission = await submitChallenge(
        user.id,
        challenge.id,
        selectedWeightClass,
        result,
        proofLink.trim() || ''
      );

      if (!submission) {
        Alert.alert('Error', 'Failed to submit challenge');
        return;
      }

      Alert.alert(
        '✅ Submission Received!',
        'Your submission has been received and is pending admin review. You\'ll be notified once it\'s reviewed.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error) {
      console.error('[Challenge] Submission error:', error);
      Alert.alert('Error', 'Failed to submit challenge');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTargetForWeightClass = (className: string): number => {
    const wc = challenge.weightClasses.find(w => w.className === className);
    return wc?.targetValue ?? 0;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Submit Attempt',
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerShadowVisible: false,
        }}
      />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text style={styles.title}>{challenge.title}</Text>
          <Text style={styles.subtitle}>Complete the challenge and earn your reward</Text>

          {challenge.weightClasses.length > 1 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Select Your Weight Class</Text>
              {challenge.weightClasses.map((wc) => (
                <TouchableOpacity
                  key={wc.className}
                  style={[
                    styles.weightClassButton,
                    selectedWeightClass === wc.className && styles.weightClassButtonActive,
                  ]}
                  onPress={() => setSelectedWeightClass(wc.className)}
                >
                  <View style={styles.weightClassInfo}>
                    <Text
                      style={[
                        styles.weightClassText,
                        selectedWeightClass === wc.className && styles.weightClassTextActive,
                      ]}
                    >
                      {wc.className}
                    </Text>
                    <Text
                      style={[
                        styles.weightClassTarget,
                        selectedWeightClass === wc.className && styles.weightClassTargetActive,
                      ]}
                    >
                      Target: {wc.targetValue} {challenge.unit}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.radioCircle,
                      selectedWeightClass === wc.className && styles.radioCircleActive,
                    ]}
                  >
                    {selectedWeightClass === wc.className && <View style={styles.radioCircleInner} />}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Enter Your Result</Text>
            <Text style={styles.sectionSubtitle}>
              Target: {challenge.weightClasses[0]?.targetValue} {challenge.unit}
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={resultValue}
                onChangeText={setResultValue}
                placeholder={`Your ${challenge.metricType}`}
                placeholderTextColor={Colors.textTertiary}
                keyboardType="numeric"
              />
              <Text style={styles.inputUnit}>{challenge.unit}</Text>
            </View>
            {resultValue && selectedWeightClass && (
              <View style={styles.targetHint}>
                {parseFloat(resultValue) >= getTargetForWeightClass(selectedWeightClass) ? (
                  <Text style={styles.targetHintSuccess}>✅ Target reached! You'll unlock the reward!</Text>
                ) : (
                  <Text style={styles.targetHintText}>
                    ⚠️ You need {getTargetForWeightClass(selectedWeightClass) - parseFloat(resultValue)} more {challenge.unit} to reach the target
                  </Text>
                )}
              </View>
            )}
          </View>

          {challenge.verificationType === 'video' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Video Proof Link (Required)</Text>
              <Text style={styles.sectionSubtitle}>Paste link to your video from YouTube, Instagram, or other social media</Text>
              <Text style={styles.infoText}>📹 Post your video on social media and paste the link below. Admin will review your submission.</Text>
              
              <View style={styles.linkInputContainer}>
                <Link2 size={20} color={Colors.textTertiary} style={styles.linkIcon} />
                <TextInput
                  style={styles.linkInput}
                  value={proofLink}
                  onChangeText={setProofLink}
                  placeholder="https://youtube.com/..."
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {proofLink.trim() && (
                <View style={styles.proofPreview}>
                  <Text style={styles.proofPreviewText}>✅ Link added</Text>
                </View>
              )}
            </View>
          )}

          {challenge.verificationType === 'manual' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Video Proof Link (Optional)</Text>
              <Text style={styles.sectionSubtitle}>Paste link to your video for verification</Text>
              <Text style={styles.infoText}>📹 Add a link to your video from YouTube, Instagram, or other social media. Admin will review it.</Text>
              
              <View style={styles.linkInputContainer}>
                <Link2 size={20} color={Colors.textTertiary} style={styles.linkIcon} />
                <TextInput
                  style={styles.linkInput}
                  value={proofLink}
                  onChangeText={setProofLink}
                  placeholder="https://youtube.com/..."
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {proofLink.trim() && (
                <View style={styles.proofPreview}>
                  <Text style={styles.proofPreviewText}>✅ Link added</Text>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <ActivityIndicator color={Colors.background} />
                <Text style={styles.submitButtonText}>Submitting...</Text>
              </>
            ) : (
              <>
                <Send size={20} color={Colors.background} />
                <Text style={styles.submitButtonText}>Submit Attempt</Text>
              </>
            )}
          </TouchableOpacity>
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
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  weightClassButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  weightClassButtonActive: {
    borderColor: Colors.accent,
    backgroundColor: `${Colors.accent}10`,
  },
  weightClassInfo: {
    flex: 1,
  },
  weightClassText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  weightClassTextActive: {
    color: Colors.accent,
  },
  weightClassTarget: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  weightClassTargetActive: {
    color: Colors.accent,
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: Colors.accent,
  },
  radioCircleInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.accent,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  inputUnit: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    marginLeft: 8,
  },
  targetHint: {
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  targetHintText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  targetHintSuccess: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.success,
    marginTop: 4,
  },
  infoText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 8,
    lineHeight: 18,
  },
  linkInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  linkIcon: {
    marginRight: 8,
  },
  linkInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 14,
    color: Colors.text,
  },
  proofPreview: {
    backgroundColor: `${Colors.success}20`,
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  proofPreviewText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.success,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.background,
    textTransform: 'uppercase' as const,
  },
  errorText: {
    fontSize: 16,
    color: Colors.danger,
  },
});
