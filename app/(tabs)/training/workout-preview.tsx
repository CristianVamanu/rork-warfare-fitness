import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Play, Timer, Dumbbell, Info, Crown, Lock } from 'lucide-react-native';
import { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTraining } from '@/contexts/TrainingContext';

const Light = {
  background: '#0d1a25',
  surface: '#1a2936',
  text: '#FFFFFF',
  textSecondary: '#94a3b8',
  border: '#2d3f50',
  accent: '#febf31',
  success: '#10B981',
};

export default function WorkoutPreviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { day: dayParam } = useLocalSearchParams<{ day?: string }>();
  const day = useMemo(() => (dayParam ? parseInt(dayParam, 10) : NaN), [dayParam]);
  const { activeProgram, hasAccessToDay } = useTraining();

  const entry = useMemo(() => activeProgram?.schedule.find(s => s.day === day), [activeProgram, day]);
  const workout = entry?.workout;
  const hasAccess = activeProgram ? hasAccessToDay(activeProgram, day) : true;

  const totalSets = useMemo(() => workout?.exercises.reduce((acc, ex) => acc + ex.sets, 0) ?? 0, [workout]);

  const totalDuration = useMemo(() => {
    if (!workout) return 0;
    return workout.exercises.reduce((total, ex) => {
      if (ex.isCardio && ex.cardioDurationMin) {
        return total + (ex.cardioDurationMin * ex.sets);
      }
      return total;
    }, 0) || workout.durationMin;
  }, [workout]);

  if (!activeProgram || Number.isNaN(day)) {
    return (
      <View style={[styles.background, { paddingTop: insets.top }]}>
        <Text style={styles.error}>Workout not found</Text>
      </View>
    );
  }

  if (!hasAccess) {
    return (
      <View style={[styles.background, { paddingTop: insets.top }]} testID="workout-preview">
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => router.back()}
              style={styles.backBtn}
              testID="back-button"
            >
              <ArrowLeft size={18} color={Light.text} />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.lockedFullCard}>
            <View style={styles.lockedIcon}>
              <Lock size={48} color="#F59E0B" />
            </View>
            <Text style={styles.lockedFullTitle}>Workout Locked</Text>
            <Text style={styles.lockedFullText}>
              Your trial period has ended. Subscribe to unlock this workout and continue your program.
            </Text>
            <TouchableOpacity style={styles.unlockBtn} onPress={() => router.push('/purchase' as any)}>
              <Crown size={18} color={Light.surface} />
              <Text style={styles.unlockBtnText}>Subscribe Now</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (!workout) {
    const scheduleEntry = activeProgram?.schedule.find(s => s.day === day);
    const isRestDay = scheduleEntry && !scheduleEntry.workout;
    
    if (isRestDay) {
      return (
        <View style={[styles.background, { paddingTop: insets.top }]} testID="workout-preview">
          <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
            <View style={styles.headerRow}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => router.back()}
                style={styles.backBtn}
                testID="back-button"
              >
                <ArrowLeft size={18} color={Light.text} />
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.restDayCard}>
              <View style={styles.restIcon}>
                <Timer size={48} color={Light.accent} />
              </View>
              <Text style={styles.restDayTitle}>Rest Day</Text>
              <Text style={styles.restDayText}>
                Today is a rest day. Take time to recover, stretch, and prepare for your next workout.
              </Text>
              <View style={styles.restTips}>
                <Text style={styles.restTipsTitle}>Recovery Tips:</Text>
                <Text style={styles.restTip}>• Stay hydrated</Text>
                <Text style={styles.restTip}>• Light stretching or yoga</Text>
                <Text style={styles.restTip}>• Get quality sleep</Text>
                <Text style={styles.restTip}>• Eat nutritious foods</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      );
    }
    
    return (
      <View style={[styles.background, { paddingTop: insets.top }]}>
        <Text style={styles.error}>Workout not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.background, { paddingTop: insets.top }]} testID="workout-preview">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.backBtn}
            testID="back-button"
          >
            <ArrowLeft size={18} color={Light.text} />
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.titleSection}>
          <Text style={styles.title}>{workout.name}</Text>
          <Text style={styles.subtitle}>Day {day} • {workout.muscleGroup}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Timer size={20} color={Light.accent} />
            <Text style={styles.statValue}>{totalDuration}</Text>
            <Text style={styles.statLabel}>Minutes</Text>
          </View>
          <View style={styles.statCard}>
            <Dumbbell size={20} color={Light.accent} />
            <Text style={styles.statValue}>{workout.exercises.length}</Text>
            <Text style={styles.statLabel}>Exercises</Text>
          </View>
          <View style={styles.statCard}>
            <Info size={20} color={Light.accent} />
            <Text style={styles.statValue}>{totalSets}</Text>
            <Text style={styles.statLabel}>Total Sets</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exercises</Text>
          <View style={{ gap: 12 }}>
            {workout.exercises.map((ex, index) => (
              <View key={ex.id} style={styles.exerciseCard}>
                <View style={styles.exerciseNumber}>
                  <Text style={styles.exerciseNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.exerciseContent}>
                  <Text style={styles.exerciseName}>{ex.name}</Text>
                  <View style={styles.exerciseDetails}>
                    {ex.isCardio && ex.cardioDurationMin ? (
                    <Text style={styles.exerciseDetail}>• {ex.cardioDurationMin} min × {ex.sets} {ex.sets > 1 ? 'rounds' : 'round'}</Text>
                  ) : (
                    <Text style={styles.exerciseDetail}>• {ex.sets} sets of {ex.reps}</Text>
                  )}
                    <Text style={styles.exerciseDetail}>• Rest: {ex.restSec}s</Text>
                    {ex.rpe && <Text style={styles.exerciseDetail}>• RPE: {ex.rpe}</Text>}
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.infoBox}>
          <Info size={16} color={Light.textSecondary} />
          <Text style={styles.infoText}>
            Make sure to warm up properly before starting. Stay hydrated throughout your workout.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.startBtn}
          onPress={() => router.push({ pathname: '/(tabs)/training/session', params: { day: String(day) } })}
          testID="start-workout-button"
        >
          <Play size={20} color={Light.surface} />
          <Text style={styles.startBtnText}>Start Workout</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: Light.background },
  container: { padding: 16 },
  error: { color: Light.text, marginTop: 60, textAlign: 'center', fontSize: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Light.border,
    backgroundColor: Light.surface,
  },
  backBtnText: { color: Light.text, fontWeight: '800' as const },
  titleSection: { marginBottom: 20 },
  title: { color: Light.text, fontSize: 28, fontWeight: '900' as const, marginBottom: 8 },
  subtitle: { color: Light.textSecondary, fontSize: 14, fontWeight: '600' as const },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: {
    flex: 1,
    backgroundColor: Light.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Light.border,
  },
  statValue: {
    color: Light.text,
    fontSize: 24,
    fontWeight: '900' as const,
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: { color: Light.textSecondary, fontSize: 11, fontWeight: '600' as const },
  section: { marginBottom: 24 },
  sectionTitle: {
    color: Light.text,
    fontSize: 16,
    fontWeight: '800' as const,
    marginBottom: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  exerciseCard: {
    backgroundColor: Light.surface,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: Light.border,
  },
  exerciseNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Light.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseNumberText: {
    color: Light.surface,
    fontSize: 14,
    fontWeight: '900' as const,
  },
  exerciseContent: { flex: 1 },
  exerciseName: {
    color: Light.text,
    fontSize: 16,
    fontWeight: '800' as const,
    marginBottom: 6,
  },
  exerciseDetails: { gap: 2 },
  exerciseDetail: {
    color: Light.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  infoBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: Light.surface,
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Light.border,
  },
  infoText: {
    flex: 1,
    color: Light.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Light.accent,
    paddingVertical: 16,
    borderRadius: 12,
    justifyContent: 'center',
  },
  startBtnText: {
    color: Light.surface,
    fontSize: 16,
    fontWeight: '900' as const,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  lockedFullCard: { backgroundColor: Light.surface, borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 2, borderColor: '#F59E0B', marginTop: 40 },
  lockedIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  lockedFullTitle: { color: Light.text, fontSize: 24, fontWeight: '900' as const, marginBottom: 12, textAlign: 'center' },
  lockedFullText: { color: Light.textSecondary, fontSize: 15, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  unlockBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F59E0B', paddingHorizontal: 28, paddingVertical: 16, borderRadius: 12 },
  unlockBtnText: { color: Light.surface, fontSize: 16, fontWeight: '900' as const, letterSpacing: 0.5 },
  restDayCard: { backgroundColor: Light.surface, borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 2, borderColor: Light.accent, marginTop: 40 },
  restIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#3d4f5e', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  restDayTitle: { color: Light.text, fontSize: 24, fontWeight: '900' as const, marginBottom: 12, textAlign: 'center' },
  restDayText: { color: Light.textSecondary, fontSize: 15, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  restTips: { width: '100%', backgroundColor: Light.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Light.border },
  restTipsTitle: { color: Light.text, fontSize: 14, fontWeight: '800' as const, marginBottom: 12, textTransform: 'uppercase' as const },
  restTip: { color: Light.textSecondary, fontSize: 14, fontWeight: '600' as const, marginBottom: 6, lineHeight: 20 },
});
