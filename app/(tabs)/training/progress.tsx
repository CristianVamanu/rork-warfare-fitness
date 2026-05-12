import { useRouter } from 'expo-router';
import { Lock, Check, ArrowLeft, Crown } from 'lucide-react-native';
import { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTraining } from '@/contexts/TrainingContext';

const { width } = Dimensions.get('window');
const COLS = 7;
const GAP = 8;
const SIZE = Math.floor((width - 16 * 2 - GAP * (COLS - 1)) / COLS);

const Light = {
  background: '#0d1a25',
  surface: '#162636',
  text: '#FFFFFF',
  textSecondary: '#94A3B8',
  border: '#1e3a52',
  accent: '#febf31',
  success: '#10B981',
  muted: '#CBD5E1',
};

export default function ProgramProgressScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeProgram, getOverallProgress, hasAccessToDay } = useTraining();

  const progress = getOverallProgress();
  const totalDays = activeProgram?.days ?? 90;

  const days = useMemo(() => Array.from({ length: totalDays }).map((_, i) => i + 1), [totalDays]);

  if (!activeProgram) {
    return (
      <View style={[styles.background, { paddingTop: insets.top }]}> 
        <Text style={styles.error}>No active program</Text>
      </View>
    );
  }

  const maxUnlockedDay = totalDays;

  const canOpen = (day: number) => {
    const hasAccess = hasAccessToDay(activeProgram, day);
    if (!hasAccess) return false;
    return day >= progress.day && day <= Math.min(totalDays, maxUnlockedDay);
  };

  return (
    <View style={[styles.background, { paddingTop: insets.top }]} testID="program-progress">
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} testID="back-button">
          <ArrowLeft size={24} color={Light.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Program Progress</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{activeProgram.title}</Text>
        <Text style={styles.subtitle}>Day {progress.day} of {totalDays}</Text>

        <View style={styles.grid}>
          {days.map(d => {
            const scheduleEntry = activeProgram.schedule.find(s => s.day === d);
            const isRestDay = !scheduleEntry?.workout;
            const completed = !!activeProgram.completedDays[d];
            const hasAccess = hasAccessToDay(activeProgram, d);
            const maxUnlockedDay = totalDays;
            const locked = d > maxUnlockedDay || !hasAccess;
            const upcoming = d > progress.day && d <= maxUnlockedDay && hasAccess && !completed;
            const premiumLocked = !hasAccess;
            return (
              <View key={d} style={{ position: 'relative' as const }}>
                <TouchableOpacity
                  disabled={!canOpen(d)}
                  style={[styles.cell, completed && styles.cellDone, upcoming && styles.cellUpcoming, locked && styles.cellLocked, premiumLocked && styles.cellPremium]}
                  onPress={() => {
                    if (premiumLocked) {
                      router.push('/purchase' as any);
                    } else if (isRestDay) {
                      return;
                    } else {
                      router.push({ pathname: '/(tabs)/training/workout-preview', params: { day: String(d) } });
                    }
                  }}
                  testID={`day-${d}`}
                >
                  {isRestDay ? (
                    <Text style={[styles.cellLabel, { fontSize: 10, color: Light.textSecondary }]}>REST</Text>
                  ) : completed ? (
                    <Check size={18} color={'#FFFFFF'} />
                  ) : premiumLocked ? (
                    <Crown size={16} color='#F59E0B' />
                  ) : locked ? (
                    <Lock size={18} color={Light.textSecondary} />
                  ) : (
                    <Text style={[styles.cellLabel, (upcoming || d === progress.day) && styles.cellLabelActive]}>{d}</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        <View style={[styles.upgradeBox, { backgroundColor: '#D1FAE5', borderColor: '#10B981' }]}>
          <Check size={20} color='#10B981' />
          <Text style={[styles.upgradeText, { color: '#065F46' }]}>All {totalDays} days unlocked!</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: Light.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Light.border },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: Light.text, fontSize: 18, fontWeight: '800' as const },
  container: { padding: 16 },
  error: { color: Light.text, marginTop: 60, textAlign: 'center', fontSize: 16 },
  title: { color: Light.text, fontSize: 20, fontWeight: '900' as const },
  subtitle: { color: Light.textSecondary, fontSize: 13, marginTop: 4, marginBottom: 12, fontWeight: '700' as const },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginBottom: 20 },
  cell: { width: SIZE, height: SIZE, borderRadius: 10, backgroundColor: '#1e3a52', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2d4a62' },
  cellDone: { backgroundColor: Light.success, borderColor: Light.success },
  cellUpcoming: { backgroundColor: '#DBEAFE', borderColor: '#BFDBFE' },
  cellLocked: { backgroundColor: '#E2E8F0', borderColor: '#CBD5E1', opacity: 0.8 },
  cellPremium: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D', opacity: 1 },
  cellLabel: { color: Light.textSecondary, fontSize: 12, fontWeight: '800' as const },
  cellLabelActive: { color: Light.accent },
  upgradeBox: { backgroundColor: '#FEF3C7', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 2, borderColor: '#F59E0B', marginTop: 12 },
  upgradeText: { color: '#92400E', fontSize: 14, fontWeight: '700' as const, marginTop: 8, marginBottom: 16, textAlign: 'center' },
  upgradeBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  upgradeBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
});
