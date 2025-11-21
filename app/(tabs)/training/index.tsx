import React from 'react';
import { useRouter } from 'expo-router';
import { CalendarDays, Lock, Play, Timer, Dumbbell, Crown, CheckCircle2, ArrowLeft } from 'lucide-react-native';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTraining } from '@/contexts/TrainingContext';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';

export default function ProgramDashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeProgram, programs, enroll, getOverallProgress, unenroll, isTrialExpired, hasAccessToProgram, hasAccessToDay } = useTraining();
  const { adminSettings } = useApp();



  const progress = getOverallProgress();

  const headerTitle = activeProgram ? activeProgram.title : 'Select a Program';
  const trialExpired = activeProgram ? isTrialExpired(activeProgram) : false;
  const hasAccess = activeProgram ? hasAccessToProgram(activeProgram) : true;

  return (
    <View style={[styles.background, { paddingTop: insets.top }]} testID="training-dashboard">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {activeProgram && (
          <TouchableOpacity style={styles.backButton} onPress={() => unenroll()} testID="back-from-program">
            <ArrowLeft size={20} color={Colors.text} />
            <Text style={styles.backButtonText}>Back to Programs</Text>
          </TouchableOpacity>
        )}
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <Dumbbell size={20} color={Colors.accent} />
            <Text style={styles.headerLabel}>Current Program</Text>
          </View>
          <Text style={styles.programTitle}>{headerTitle}</Text>
          {activeProgram && (
            <View style={styles.progressBarOuter}>
              <View style={[styles.progressBarInner, { width: `${(progress.day / progress.total) * 100}%` }]} />
            </View>
          )}
          <Text style={styles.progressText}>
            {activeProgram ? `Day ${progress.day} of ${progress.total}` : 'Not enrolled'}
          </Text>
        </View>

        {!activeProgram && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Available Programs</Text>
            <View style={{ gap: 16 }}>
              {programs.map(p => (
                  <TouchableOpacity 
                    key={p.id} 
                    style={styles.programCard} 
                    onPress={() => enroll(p.id)} 
                    testID={`enroll-${p.id}`}
                    activeOpacity={0.7}
                  >
                    <View style={styles.programCardInner}>
                      {p.logoUrl && (
                        <View style={styles.programLogoContainer}>
                          <Image source={{ uri: p.logoUrl }} style={styles.programLogo} resizeMode="contain" />
                        </View>
                      )}
                      <View style={styles.programContent}>
                        <View style={styles.programHeader}>
                          <Text style={styles.programCardTitle} numberOfLines={1}>{p.title}</Text>
                        </View>
                        {p.description && (
                          <Text style={styles.programDescription} numberOfLines={2}>
                            {p.description}
                          </Text>
                        )}
                        <View style={styles.programMeta}>
                          <View style={styles.metaBadge}>
                            <CalendarDays size={12} color={Colors.textSecondary} />
                            <Text style={styles.metaBadgeText}>{p.days} days</Text>
                          </View>
                          <View style={styles.metaBadge}>
                            <Crown size={12} color={Colors.textSecondary} />
                            <Text style={styles.metaBadgeText}>Free</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity 
                      style={styles.programEnrollBtn}
                      onPress={() => enroll(p.id)}
                    >
                      <Text style={styles.programEnrollBtnText}>Start Program</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {activeProgram && (
          <>
            {trialExpired && !hasAccess && (
              <View style={styles.paywallCard}>
                <View style={styles.paywallIcon}>
                  <Crown size={32} color={Colors.accent} />
                </View>
                <Text style={styles.paywallTitle}>Free Trial Ended</Text>
                <Text style={styles.paywallText}>
                  Your {adminSettings.freePackage?.freeTrialDays ?? 7}-day free trial has ended. Subscribe to continue accessing all programs and features.
                </Text>
                <TouchableOpacity style={styles.upgradeBtn} onPress={() => router.push('/purchase' as any)}>
                  <Crown size={18} color={Colors.background} />
                  <Text style={styles.upgradeBtnText}>Subscribe to Continue</Text>
                </TouchableOpacity>
              </View>
            )}



            <View style={styles.section}>
              <Text style={styles.sectionTitle}>All Program Days</Text>
              <View style={{ gap: 12 }}>
                {(() => {
                  const items: { day: number; workout: typeof activeProgram.schedule[0]['workout']; date: string; isCompleted: boolean }[] = [];
                  const totalDays = activeProgram?.days ?? 90;
                  for (let i = 0; i < totalDays; i++) {
                    const d = i + 1;
                    const entry = activeProgram?.schedule.find(s => s.day === d);
                    const date = new Date(activeProgram?.startDate ?? new Date());
                    date.setDate(date.getDate() + i);
                    const isCompleted = activeProgram?.completedDays?.[d] ?? false;
                    items.push({ day: d, workout: entry?.workout ?? null, date: date.toISOString(), isCompleted });
                  }
                  return items.map(item => {
                    const dayHasAccess = activeProgram ? hasAccessToDay(activeProgram, item.day) : true;
                    
                    if (!dayHasAccess) {
                      return (
                        <View key={`${item.day}`} style={[styles.workoutCard, styles.lockedWorkoutCard]}>
                          <View style={styles.workoutHeader}>
                            <View style={styles.workoutHeaderLeft}>
                              <Lock size={16} color={Colors.textTertiary} />
                              <Text style={styles.lockedWorkoutName}>{item.workout?.name ?? 'Locked Workout'}</Text>
                            </View>
                            <Text style={styles.workoutDay}>Day {item.day}</Text>
                          </View>
                          <View style={styles.lockedWorkoutContent}>
                            <Text style={styles.lockedWorkoutText}>Subscribe to unlock this workout</Text>
                          </View>
                          <TouchableOpacity
                            style={styles.unlockDayBtn}
                            onPress={() => router.push('/purchase' as any)}
                          >
                            <Crown size={16} color={Colors.background} />
                            <Text style={styles.unlockDayBtnText}>Subscribe to Unlock</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    }

                    return (
                      <View key={`${item.day}`} style={styles.workoutCard}>
                        {item.workout ? (
                          <>
                            <View style={styles.workoutHeader}>
                              <View style={styles.workoutHeaderLeft}>
                                <Text style={styles.workoutName}>{item.workout.name}</Text>
                                {item.isCompleted && (
                                  <CheckCircle2 size={18} color={Colors.accent} strokeWidth={2.5} />
                                )}
                              </View>
                              <Text style={styles.workoutDay}>Day {item.day}</Text>
                            </View>
                            <View style={styles.workoutMetaRow}>
                              <View style={styles.metaChip}>
                                <Timer size={14} color={Colors.textSecondary} />
                                <Text style={styles.metaText}>{item.workout.durationMin} min</Text>
                              </View>
                              <View style={styles.metaChip}>
                                <Dumbbell size={14} color={Colors.textSecondary} />
                                <Text style={styles.metaText}>{item.workout.muscleGroup}</Text>
                              </View>
                              <View style={styles.metaChip}>
                                <CalendarDays size={14} color={Colors.textSecondary} />
                                <Text style={styles.metaText}>{new Date(item.date).toDateString()}</Text>
                              </View>
                            </View>
                            <TouchableOpacity
                              style={styles.startBtn}
                              onPress={() => router.push({ pathname: '/(tabs)/training/workout-preview', params: { day: String(item.day) } })}
                              testID={`start-day-${item.day}`}
                              accessibilityRole="button"
                              accessibilityLabel={`View workout details day ${item.day}`}
                            >
                              <Play size={18} color={Colors.background} />
                              <Text style={styles.startBtnText}>View Workout</Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <>
                            <View style={styles.workoutHeader}>
                              <View style={styles.workoutHeaderLeft}>
                                <Text style={styles.workoutName}>Rest Day</Text>
                                {item.isCompleted && (
                                  <CheckCircle2 size={18} color={Colors.accent} strokeWidth={2.5} />
                                )}
                              </View>
                              <Text style={styles.workoutDay}>Day {item.day}</Text>
                            </View>
                            <View style={styles.restDayContent}>
                              <Text style={styles.restDayText}>Recovery is essential. Take this time to rest and rebuild.</Text>
                            </View>
                          </>
                        )}
                      </View>
                    );
                  });
                })()}
              </View>

            </View>

            <View>
              <TouchableOpacity style={styles.dangerBtn} onPress={() => {
                Alert.alert('Quit Program', 'Are you sure you want to quit this program? You can enroll in another one anytime.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Quit', style: 'destructive', onPress: () => unenroll() },
                ]);
              }}>
                <Text style={styles.dangerBtnText}>Quit Program</Text>
              </TouchableOpacity>

              {hasAccess && (
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/(tabs)/training/progress')} testID="open-progress">
                  <Text style={styles.secondaryBtnText}>View Program Progress</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 16 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 4, marginBottom: 12 },
  backButtonText: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  headerCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  headerLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' as const, textTransform: 'uppercase' as const },
  programTitle: { color: Colors.text, fontSize: 22, fontWeight: '800' as const, marginBottom: 12 },
  progressBarOuter: { height: 10, backgroundColor: Colors.surfaceLight, borderRadius: 6, overflow: 'hidden' },
  progressBarInner: { height: '100%', backgroundColor: Colors.accent },
  progressText: { marginTop: 8, color: Colors.textSecondary, fontSize: 13, fontWeight: '600' as const },
  section: { marginTop: 24 },
  sectionTitle: { color: Colors.text, fontSize: 16, fontWeight: '800' as const, marginBottom: 16, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  
  programCard: { 
    backgroundColor: Colors.surface, 
    borderRadius: 16, 
    overflow: 'hidden',
    borderWidth: 1, 
    borderColor: Colors.border,
  },
  programCardInner: {
    flexDirection: 'row',
    padding: 16,
    gap: 16,
  },
  programLogoContainer: {
    width: 90,
    height: 90,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderWidth: 2,
    borderColor: Colors.accent + '40',
  },
  programLogo: {
    width: '100%',
    height: '100%',
  },
  programContent: {
    flex: 1,
  },
  programHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  programCardTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800' as const,
    flex: 1,
  },
  programDescription: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  programMeta: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  metaBadgeText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  programEnrollBtn: {
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  programEnrollBtnLocked: {
    backgroundColor: Colors.textTertiary,
  },
  programEnrollBtnText: {
    color: Colors.background,
    fontSize: 14,
    fontWeight: '800' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  
  workoutCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  workoutHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  workoutHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  workoutName: { color: Colors.text, fontSize: 16, fontWeight: '800' as const },
  workoutDay: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' as const },
  workoutMetaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surfaceLight, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  metaText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' as const },
  startBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.accent, paddingVertical: 12, borderRadius: 10, justifyContent: 'center' },
  startBtnText: { color: Colors.background, fontSize: 14, fontWeight: '900' as const, letterSpacing: 0.5, textTransform: 'uppercase' as const },
  lockedHint: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, marginTop: 12 },
  lockedHintText: { color: Colors.textSecondary, fontSize: 12, flex: 1 },
  secondaryBtn: { marginTop: 20, alignItems: 'center', backgroundColor: Colors.surface, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  secondaryBtnText: { color: Colors.text, fontSize: 14, fontWeight: '800' as const },
  dangerBtn: { marginTop: 12, alignItems: 'center', backgroundColor: Colors.surface, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.danger },
  dangerBtnText: { color: Colors.danger, fontSize: 14, fontWeight: '800' as const },
  paywallCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 2, borderColor: Colors.accent, marginTop: 16 },
  paywallIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.surfaceLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  paywallTitle: { color: Colors.text, fontSize: 20, fontWeight: '900' as const, marginBottom: 8, textAlign: 'center' },
  paywallText: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.accent, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  upgradeBtnText: { color: Colors.background, fontSize: 16, fontWeight: '900' as const, letterSpacing: 0.5 },
  trialBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surfaceLight, padding: 14, borderRadius: 12, marginTop: 16, borderWidth: 1, borderColor: Colors.warning },
  trialBannerText: { color: Colors.warning, fontSize: 14, fontWeight: '700' as const, flex: 1 },
  lockedCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  lockedTitle: { color: Colors.text, fontSize: 18, fontWeight: '800' as const, marginTop: 16, marginBottom: 8 },
  lockedText: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center' },
  restDayContent: { paddingVertical: 8 },
  restDayText: { color: Colors.textSecondary, fontSize: 14, fontStyle: 'italic' as const, textAlign: 'center' },
  lockedWorkoutCard: { opacity: 0.75, backgroundColor: Colors.surfaceLight },
  lockedWorkoutName: { color: Colors.textTertiary, fontSize: 16, fontWeight: '800' as const },
  lockedWorkoutContent: { paddingVertical: 12 },
  lockedWorkoutText: { color: Colors.textTertiary, fontSize: 13, fontStyle: 'italic' as const },
  unlockDayBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.accent, paddingVertical: 10, borderRadius: 10, justifyContent: 'center' },
  unlockDayBtnText: { color: Colors.background, fontSize: 13, fontWeight: '900' as const, letterSpacing: 0.5, textTransform: 'uppercase' as const },
});
