import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { X, Plus, Clock, Target, TrendingUp, RotateCcw, Trash2, Shield } from 'lucide-react-native';
import { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/colors';
import { useDaysWithout } from '@/contexts/DaysWithoutContext';

const MOTIVATIONAL_TEXTS = [
  "Every day clean is a victory. You're rewriting your story.",
  "Your willpower is your superpower. Keep pushing forward.",
  "Discipline today, freedom tomorrow. Stay strong, warrior.",
  "The hardest battles have the greatest rewards. You've got this.",
  "One day at a time. You're building an unbreakable version of yourself.",
  "Your future self is counting on you. Don't let them down.",
  "Champions aren't made in comfort zones. Embrace the challenge.",
  "Progress, not perfection. Every moment clean is progress.",
];

export default function DaysWithoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { 
    challenges, 
    addChallenge, 
    resetChallenge, 
    deleteChallenge, 
    getDaysCount, 
    getTimeElapsed, 
    getTargetDaysCount,
    suggestedChallenges 
  } = useDaysWithout();

  const [showAddModal, setShowAddModal] = useState(false);
  const [challengeName, setChallengeName] = useState('');
  const [targetDays, setTargetDays] = useState('');
  const [targetUnit, setTargetUnit] = useState<'days' | 'weeks' | 'months'>('days');
  const [motivationalText] = useState(() => 
    MOTIVATIONAL_TEXTS[Math.floor(Math.random() * MOTIVATIONAL_TEXTS.length)]
  );
  const [realtimeUpdates, setRealtimeUpdates] = useState<{ [key: string]: { days: number; hours: number; minutes: number; seconds: number } }>({});

  useEffect(() => {
    const interval = setInterval(() => {
      const updates: typeof realtimeUpdates = {};
      challenges.forEach(challenge => {
        updates[challenge.id] = getTimeElapsed(challenge.startDate);
      });
      setRealtimeUpdates(updates);
    }, 1000);

    return () => clearInterval(interval);
  }, [challenges, getTimeElapsed]);

  const handleAddChallenge = async () => {
    if (!challengeName.trim()) {
      Alert.alert('Error', 'Please enter a challenge name');
      return;
    }

    const target = targetDays ? parseInt(targetDays, 10) : undefined;
    if (targetDays && (isNaN(target!) || target! <= 0)) {
      Alert.alert('Error', 'Please enter a valid target');
      return;
    }

    await addChallenge(challengeName.trim(), target, target ? targetUnit : undefined);
    setShowAddModal(false);
    setChallengeName('');
    setTargetDays('');
    setTargetUnit('days');
  };

  const handleReset = (challengeId: string, challengeName: string) => {
    Alert.alert(
      'Reset Challenge?',
      `Are you sure you want to reset "${challengeName}"? Your current streak will be saved as your best streak.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => resetChallenge(challengeId),
        },
      ]
    );
  };

  const handleDelete = (challengeId: string, challengeName: string) => {
    Alert.alert(
      'Delete Challenge?',
      `Are you sure you want to delete "${challengeName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteChallenge(challengeId),
        },
      ]
    );
  };

  const getProgressPercentage = (challenge: typeof challenges[0]) => {
    const targetDaysTotal = getTargetDaysCount(challenge.targetDays, challenge.targetUnit);
    if (!targetDaysTotal) return 100;
    
    const currentDays = getDaysCount(challenge.startDate);
    return Math.min(100, (currentDays / targetDaysTotal) * 100);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={['rgba(239, 68, 68, 0.15)', 'rgba(239, 68, 68, 0)']}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <X size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Days Without</Text>
            <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.addButton}>
              <Plus size={24} color={Colors.accent} />
            </TouchableOpacity>
          </View>
          <Text style={styles.headerSubtitle}>Track your journey to freedom</Text>
        </View>
      </LinearGradient>

      <View style={styles.motivationalContainer}>
        <Shield size={24} color={Colors.accent} />
        <Text style={styles.motivationalText}>{motivationalText}</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {challenges.length === 0 ? (
          <View style={styles.emptyState}>
            <Shield size={64} color={Colors.textTertiary} />
            <Text style={styles.emptyTitle}>No Challenges Yet</Text>
            <Text style={styles.emptyDescription}>
              Start your journey by creating a &quot;Days Without&quot; challenge. Stay committed, track your progress, and celebrate your victories.
            </Text>
            <TouchableOpacity style={styles.addFirstButton} onPress={() => setShowAddModal(true)}>
              <Text style={styles.addFirstButtonText}>Create Your First Challenge</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.challengesList}>
            {challenges.map((challenge) => {
              const elapsed = realtimeUpdates[challenge.id] || getTimeElapsed(challenge.startDate);
              const targetDaysTotal = getTargetDaysCount(challenge.targetDays, challenge.targetUnit);
              const progressPercentage = getProgressPercentage(challenge);

              return (
                <View key={challenge.id} style={styles.challengeCard}>
                  <View style={styles.challengeHeader}>
                    <Text style={styles.challengeName}>{challenge.name}</Text>
                    <View style={styles.challengeActions}>
                      <TouchableOpacity 
                        onPress={() => handleReset(challenge.id, challenge.name)}
                        style={styles.actionButton}
                      >
                        <RotateCcw size={18} color={Colors.warning} />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={() => handleDelete(challenge.id, challenge.name)}
                        style={styles.actionButton}
                      >
                        <Trash2 size={18} color={Colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.timerContainer}>
                    <View style={styles.timerBox}>
                      <Text style={styles.timerValue}>{elapsed.days}</Text>
                      <Text style={styles.timerLabel}>Days</Text>
                    </View>
                    <Text style={styles.timerSeparator}>:</Text>
                    <View style={styles.timerBox}>
                      <Text style={styles.timerValue}>{elapsed.hours.toString().padStart(2, '0')}</Text>
                      <Text style={styles.timerLabel}>Hours</Text>
                    </View>
                    <Text style={styles.timerSeparator}>:</Text>
                    <View style={styles.timerBox}>
                      <Text style={styles.timerValue}>{elapsed.minutes.toString().padStart(2, '0')}</Text>
                      <Text style={styles.timerLabel}>Mins</Text>
                    </View>
                    <Text style={styles.timerSeparator}>:</Text>
                    <View style={styles.timerBox}>
                      <Text style={styles.timerValue}>{elapsed.seconds.toString().padStart(2, '0')}</Text>
                      <Text style={styles.timerLabel}>Secs</Text>
                    </View>
                  </View>

                  {targetDaysTotal && (
                    <View style={styles.progressContainer}>
                      <View style={styles.progressHeader}>
                        <Text style={styles.progressText}>
                          {elapsed.days} / {targetDaysTotal} days
                        </Text>
                        <Text style={styles.progressPercentage}>{Math.floor(progressPercentage)}%</Text>
                      </View>
                      <View style={styles.progressBar}>
                        <LinearGradient
                          colors={progressPercentage >= 100 ? ['#10B981', '#059669'] : [Colors.accent, '#F59E0B']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[styles.progressBarFill, { width: `${progressPercentage}%` }]}
                        />
                      </View>
                    </View>
                  )}

                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <TrendingUp size={16} color={Colors.success} />
                      <Text style={styles.statLabel}>Best Streak</Text>
                      <Text style={styles.statValue}>{challenge.bestStreak} days</Text>
                    </View>
                    <View style={styles.statItem}>
                      <RotateCcw size={16} color={Colors.textSecondary} />
                      <Text style={styles.statLabel}>Total Resets</Text>
                      <Text style={styles.statValue}>{challenge.totalResets}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>New Challenge</Text>
              <Text style={styles.modalSubtitle}>What are you committing to quit?</Text>

              <TextInput
                style={styles.input}
                value={challengeName}
                onChangeText={setChallengeName}
                placeholder="e.g., Smoking, Porn, Drinking..."
                placeholderTextColor={Colors.textTertiary}
              />

              <View style={styles.suggestionsContainer}>
                <Text style={styles.suggestionsLabel}>Quick Select:</Text>
                <View style={styles.suggestionsGrid}>
                  {suggestedChallenges.map((suggestion) => (
                    <TouchableOpacity
                      key={suggestion}
                      style={[styles.suggestionChip, challengeName === suggestion && styles.suggestionChipActive]}
                      onPress={() => setChallengeName(suggestion)}
                    >
                      <Text style={[styles.suggestionText, challengeName === suggestion && styles.suggestionTextActive]}>
                        {suggestion}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.targetContainer}>
                <Target size={18} color={Colors.accent} />
                <Text style={styles.targetLabel}>Set a Target (Optional)</Text>
              </View>

              <View style={styles.targetInputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={targetDays}
                  onChangeText={setTargetDays}
                  placeholder="e.g., 30"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="number-pad"
                />
                <View style={styles.unitSelector}>
                  {(['days', 'weeks', 'months'] as const).map((unit) => (
                    <TouchableOpacity
                      key={unit}
                      style={[styles.unitButton, targetUnit === unit && styles.unitButtonActive]}
                      onPress={() => setTargetUnit(unit)}
                    >
                      <Text style={[styles.unitText, targetUnit === unit && styles.unitTextActive]}>
                        {unit}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => {
                    setShowAddModal(false);
                    setChallengeName('');
                    setTargetDays('');
                    setTargetUnit('days');
                  }}
                >
                  <Text style={styles.modalButtonTextCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSave]}
                  onPress={handleAddChallenge}
                >
                  <Text style={styles.modalButtonTextSave}>Start Challenge</Text>
                </TouchableOpacity>
              </View>
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
  header: {
    paddingBottom: 24,
  },
  headerContent: {
    paddingHorizontal: 16,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  motivationalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    borderLeftColor: Colors.accent,
  },
  motivationalText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
    fontStyle: 'italic' as const,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  addFirstButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  addFirstButtonText: {
    color: Colors.text,
    fontWeight: '800' as const,
    fontSize: 15,
  },
  challengesList: {
    gap: 16,
  },
  challengeCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  challengeName: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    flex: 1,
  },
  challengeActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  timerBox: {
    alignItems: 'center',
    minWidth: 50,
  },
  timerValue: {
    fontSize: 28,
    fontWeight: '900' as const,
    color: Colors.accent,
    fontVariant: ['tabular-nums' as any],
  },
  timerLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    marginTop: 2,
  },
  timerSeparator: {
    fontSize: 28,
    fontWeight: '900' as const,
    color: Colors.textTertiary,
    marginHorizontal: 4,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  progressPercentage: {
    fontSize: 12,
    color: Colors.accent,
    fontWeight: '700' as const,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statItem: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
  },
  statValue: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '800' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
    marginBottom: 16,
  },
  suggestionsContainer: {
    marginBottom: 20,
  },
  suggestionsLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    marginBottom: 10,
  },
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  suggestionChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  suggestionText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  suggestionTextActive: {
    color: Colors.text,
    fontWeight: '700' as const,
  },
  targetContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  targetLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  targetInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  unitSelector: {
    flexDirection: 'row',
    gap: 4,
  },
  unitButton: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unitButtonActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  unitText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  unitTextActive: {
    color: Colors.text,
    fontWeight: '700' as const,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalButtonSave: {
    backgroundColor: Colors.accent,
  },
  modalButtonTextCancel: {
    color: Colors.text,
    fontWeight: '600' as const,
    fontSize: 16,
  },
  modalButtonTextSave: {
    color: Colors.text,
    fontWeight: '800' as const,
    fontSize: 16,
  },
});
