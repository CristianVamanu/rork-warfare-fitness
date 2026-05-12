import { useLocalSearchParams, useRouter } from 'expo-router';
import { Trophy, Target, TrendingUp, Zap, Award, Dumbbell } from 'lucide-react-native';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTraining } from '@/contexts/TrainingContext';
import { useApp } from '@/contexts/AppContext';

const Light = {
  background: '#0d1a25',
  surface: '#162636',
  text: '#FFFFFF',
  textSecondary: '#94A3B8',
  border: '#1e3a52',
  accent: '#febf31',
  success: '#10B981',
};

export default function WorkoutCompleteScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { day, calories, duration } = useLocalSearchParams<{ day?: string; calories?: string; duration?: string }>();
  const { workoutLogs } = useTraining();
  const { user } = useApp();

  const weightUnit = user?.weightUnit || 'lbs';
  const latestLog = workoutLogs[0];

  let totalSets = 0;
  let totalReps = 0;
  let totalWeight = 0;

  if (latestLog) {
    latestLog.exercises.forEach(ex => {
      ex.sets.forEach(set => {
        if (set.completed) {
          totalSets++;
          totalReps += set.reps;
          totalWeight += set.weight;
        }
      });
    });
  }

  return (
    <View style={[styles.background, { paddingTop: insets.top }]} testID="workout-complete">
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <View style={styles.headerSection}>
            <View style={styles.trophyBadge}>
              <Trophy size={36} color={Light.success} />
            </View>
            <Text style={styles.missionTitle}>MISSION COMPLETE</Text>
            <Text style={styles.dayBadge}>DAY {day}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.reportSection}>
            <Text style={styles.reportTitle}>MISSION REPORT</Text>
            
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <Target size={20} color={Light.accent} />
                </View>
                <Text style={styles.statValue}>{totalSets}</Text>
                <Text style={styles.statLabel}>TOTAL SETS</Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <TrendingUp size={20} color={Light.accent} />
                </View>
                <Text style={styles.statValue}>{totalReps}</Text>
                <Text style={styles.statLabel}>TOTAL REPS</Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <Dumbbell size={20} color={Light.accent} />
                </View>
                <Text style={styles.statValue}>{totalWeight.toFixed(0)}</Text>
                <Text style={styles.statLabel}>TOTAL {weightUnit.toUpperCase()}</Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <Zap size={20} color={Light.accent} />
                </View>
                <Text style={styles.statValue}>{duration ?? '—'}</Text>
                <Text style={styles.statLabel}>MINUTES</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.achievementSection}>
            <Award size={24} color={Light.success} />
            <Text style={styles.achievementText}>+10 POWER EARNED</Text>
          </View>

          <TouchableOpacity 
            style={styles.primaryBtn} 
            onPress={() => router.replace('/training')} 
            testID="back-dashboard"
          >
            <Text style={styles.primaryBtnText}>RETURN TO BASE</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: Light.background },
  container: { padding: 16, flexGrow: 1, justifyContent: 'center' },
  card: { 
    backgroundColor: Light.surface, 
    borderRadius: 20, 
    borderWidth: 2, 
    borderColor: Light.border, 
    padding: 24,
    shadowColor: Light.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  trophyBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${Light.success}20`,
    borderWidth: 3,
    borderColor: Light.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  missionTitle: {
    color: Light.success,
    fontSize: 28,
    fontWeight: '900' as const,
    letterSpacing: 2,
    textAlign: 'center',
  },
  dayBadge: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: Light.accent,
    borderRadius: 20,
    color: Light.background,
    fontSize: 13,
    fontWeight: '900' as const,
    letterSpacing: 1,
  },
  divider: {
    height: 1,
    backgroundColor: Light.border,
    marginVertical: 20,
  },
  reportSection: {
    marginBottom: 8,
  },
  reportTitle: {
    color: Light.accent,
    fontSize: 16,
    fontWeight: '900' as const,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  statCard: {
    width: '47%',
    backgroundColor: '#1e3a52',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Light.border,
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${Light.accent}20`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    color: Light.text,
    fontSize: 28,
    fontWeight: '900' as const,
    marginTop: 4,
  },
  statLabel: {
    color: Light.textSecondary,
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1,
    marginTop: 4,
  },
  achievementSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: `${Light.success}15`,
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Light.success,
  },
  achievementText: {
    color: Light.success,
    fontSize: 16,
    fontWeight: '900' as const,
    letterSpacing: 1.5,
  },
  primaryBtn: { 
    backgroundColor: Light.accent, 
    paddingVertical: 16, 
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: { 
    color: '#0d1a25', 
    fontSize: 15, 
    fontWeight: '900' as const, 
    textTransform: 'uppercase' as const, 
    letterSpacing: 2,
  },
});
