import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, Circle, ArrowLeft, Plus, Dumbbell, Timer, Info, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, TextInput, KeyboardAvoidingView, Platform, Modal, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTraining, WorkoutLog } from '@/contexts/TrainingContext';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';

type SetState = {
  exerciseId: string;
  checks: boolean[];
  weights: number[];
  reps: number[];
};

type CardioTimerState = {
  exerciseId: string;
  timerSec: number;
  isRunning: boolean;
  targetSec: number;
};

export default function WorkoutSessionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { day: dayParam } = useLocalSearchParams<{ day?: string }>();
  const day = useMemo(() => (dayParam ? parseInt(dayParam, 10) : NaN), [dayParam]);
  const { activeProgram, markDayComplete, logWorkout, workoutLogs } = useTraining();
  const { completeWorkout, user } = useApp();
  
  const weightUnit = user?.weightUnit || 'lbs';

  const entry = useMemo(() => activeProgram?.schedule.find(s => s.day === day), [activeProgram, day]);
  const workout = entry?.workout;

  const [sets, setSets] = useState<SetState[]>([]);
  const [cardioTimers, setCardioTimers] = useState<Record<string, CardioTimerState>>({});
  const [sessionStartTime] = useState<string>(new Date().toISOString());
  const [demoExercise, setDemoExercise] = useState<string | null>(null);

  useEffect(() => {
    if (workout) {
      setSets(
        workout.exercises.map(ex => {
          return {
            exerciseId: ex.id,
            checks: ex.isCardio ? [false] : Array.from({ length: ex.sets }).map(() => false),
            weights: ex.isCardio ? [0] : Array.from({ length: ex.sets }).map(() => 0),
            reps: ex.isCardio ? [0] : Array.from({ length: ex.sets }).map(() => 0),
          };
        })
      );
    }
  }, [workout]);

  useEffect(() => {
    if (!workout) return;
    const intervals: ReturnType<typeof setInterval>[] = [];
    
    for (const ex of workout.exercises) {
      if (ex.isCardio && cardioTimers[ex.id]?.isRunning) {
        const interval = setInterval(() => {
          setCardioTimers(prev => {
            const state = prev[ex.id];
            if (!state || !state.isRunning) return prev;
            
            const newSec = state.timerSec + 1;
            if (newSec >= state.targetSec) {
              Alert.alert('Time Complete!', `${ex.name} completed!`);
              return {
                ...prev,
                [ex.id]: { ...state, timerSec: newSec, isRunning: false },
              };
            }
            return {
              ...prev,
              [ex.id]: { ...state, timerSec: newSec },
            };
          });
        }, 1000);
        intervals.push(interval);
      }
    }
    
    return () => {
      intervals.forEach(i => clearInterval(i));
    };
  }, [workout, cardioTimers]);

  if (!activeProgram || !workout || Number.isNaN(day)) {
    return (
      <View style={[styles.background, { paddingTop: insets.top }]}> 
        <Text style={styles.error}>Workout not found</Text>
      </View>
    );
  }

  const totalSets = sets.reduce((acc, s) => acc + s.checks.length, 0);
  const doneSets = sets.reduce((acc, s) => acc + s.checks.filter(Boolean).length, 0);
  const progressPct = totalSets === 0 ? 0 : Math.round((doneSets / totalSets) * 100);

  const toggleSet = (exerciseId: string, idx: number) => {
    setSets(prev => prev.map(s => {
      if (s.exerciseId !== exerciseId) return s;
      const checks = s.checks.slice();
      checks[idx] = !checks[idx];
      return { ...s, checks };
    }));
  };

  const updateWeight = (exerciseId: string, idx: number, weightText: string) => {
    const w = parseFloat(weightText);
    setSets(prev => prev.map(s => {
      if (s.exerciseId !== exerciseId) return s;
      const weights = s.weights.slice();
      weights[idx] = Number.isFinite(w) && w > 0 ? w : 0;
      return { ...s, weights };
    }));
  };

  const updateReps = (exerciseId: string, idx: number, repsText: string) => {
    const r = parseInt(repsText, 10);
    setSets(prev => prev.map(s => {
      if (s.exerciseId !== exerciseId) return s;
      const reps = s.reps.slice();
      reps[idx] = Number.isFinite(r) && r > 0 ? r : 0;
      return { ...s, reps };
    }));
  };

  const addSet = (exerciseId: string) => {
    setSets(prev => prev.map(s => {
      if (s.exerciseId !== exerciseId) return s;
      return { ...s, checks: [...s.checks, false], weights: [...s.weights, 0], reps: [...s.reps, 0] };
    }));
  };

  const onFinish = async () => {
    if (doneSets !== totalSets) {
      Alert.alert('Incomplete', 'Finish all sets to complete the workout.');
      return;
    }

    const logData: Omit<WorkoutLog, 'id'> = {
      programId: activeProgram.id,
      day,
      workoutName: workout.name,
      completedAt: new Date().toISOString(),
      exercises: workout.exercises.map((ex, exIdx) => {
        const state = sets[exIdx];
        return {
          exerciseId: ex.id,
          exerciseName: ex.name,
          sets: (state?.checks ?? []).map((checked, setIdx) => ({
            weight: state?.weights[setIdx] ?? 0,
            reps: state?.reps[setIdx] ?? 10,
            completed: checked,
          })),
        };
      }),
      calories: 300 + Math.round(Math.random() * 120),
      duration: Math.round((new Date().getTime() - new Date(sessionStartTime).getTime()) / 60000),
    };

    await logWorkout(logData);
    await markDayComplete(activeProgram.id, day);
    const totalWorkouts = workoutLogs.length + 1;
    await completeWorkout(totalWorkouts);
    const calories = logData.calories;
    const duration = logData.duration;
    router.replace({ pathname: '/(tabs)/training/complete', params: { day: String(day), calories: String(calories), duration: String(duration) } });
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.background, { paddingTop: insets.top }]} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top}
      testID="workout-session"
    >
      <ScrollView 
        contentContainerStyle={styles.container} 
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              Alert.alert('Quit Workout', 'Winners finish what they start. Are you sure?', [
                { text: 'Stay and Grind', style: 'cancel' },
                { text: "Quit", style: 'destructive', onPress: () => {
                  if (router.canGoBack()) router.back();
                  else router.replace('/(tabs)/training' as any);
                }},
              ]);
            }}
            style={styles.backBtn}
            testID="quit-workout"
          >
            <ArrowLeft size={18} color={Colors.text} />
            <Text style={styles.backBtnText}>Quit</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{workout.name}</Text>
        </View>
        <Text style={styles.subtitle}>Day {day} • {workout.muscleGroup} • {workout.durationMin} min</Text>

        <View style={styles.progressWrap}>
          <View style={styles.progressBarOuter}>
            <View style={[styles.progressBarInner, { width: `${progressPct}%` }]} />
          </View>
          <Text style={styles.progressText}>{progressPct}% complete</Text>
        </View>

        <View style={{ gap: 12 }}>
          {workout.exercises.map(ex => {
            const state = sets.find(s => s.exerciseId === ex.id);
            const checks = state?.checks ?? [];
            const weights = state?.weights ?? [];
            const repsArray = state?.reps ?? [];
            
            return (
              <View key={ex.id} style={styles.exerciseCard}>
                <View style={styles.exerciseHeader}>
                  <View style={styles.exerciseNameRow}>
                    <Text style={styles.exerciseName}>{ex.name}</Text>
                    <TouchableOpacity onPress={() => setDemoExercise(ex.name)} style={styles.infoBtn}>
                      <Info size={16} color={Colors.accent} />
                    </TouchableOpacity>
                  </View>
                  {ex.isCardio ? (
                    <Text style={styles.exerciseMeta}>{ex.cardioDurationMin ?? 10} min cardio • {ex.restSec}s rest</Text>
                  ) : (
                    <Text style={styles.exerciseMeta}>{ex.sets} sets • {ex.reps} • {ex.restSec}s rest{ex.rpe ? ` • RPE ${ex.rpe}` : ''}</Text>
                  )}
                </View>
                
                {ex.isCardio ? (() => {
                  const timerState = cardioTimers[ex.id];
                  const targetMin = ex.cardioDurationMin ?? 10;
                  const targetSec = targetMin * 60;
                  
                  const elapsed = timerState?.timerSec ?? 0;
                  const remaining = Math.max(0, targetSec - elapsed);
                  const mm = Math.floor(remaining / 60).toString().padStart(2, '0');
                  const ss = (remaining % 60).toString().padStart(2, '0');
                  const progress = targetSec > 0 ? (elapsed / targetSec) * 100 : 0;
                  
                  return (
                    <View style={styles.cardioTimerContainer}>
                      <View style={styles.cardioTimerHeader}>
                        <Timer size={20} color={Colors.accent} />
                        <Text style={styles.cardioTimerTitle}>Countdown Timer</Text>
                      </View>
                      <Text style={styles.cardioTimerValue}>{mm}:{ss}</Text>
                      <View style={styles.cardioProgressBarOuter}>
                        <View style={[styles.cardioProgressBarInner, { width: `${Math.min(100, progress)}%` }]} />
                      </View>
                      <View style={styles.timerRow}>
                        <TouchableOpacity 
                          style={styles.timerBtn} 
                          onPress={() => {
                            if (!timerState) {
                              setCardioTimers(prev => ({
                                ...prev,
                                [ex.id]: { exerciseId: ex.id, timerSec: 0, isRunning: true, targetSec },
                              }));
                            } else {
                              setCardioTimers(prev => ({
                                ...prev,
                                [ex.id]: { ...timerState, isRunning: !timerState.isRunning },
                              }));
                            }
                          }}
                        >
                          <Text style={styles.timerBtnText}>
                            {timerState?.isRunning ? 'Pause' : 'Start'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.timerBtn, styles.timerBtnGhost]} 
                          onPress={() => {
                            setCardioTimers(prev => {
                              const updated = { ...prev };
                              delete updated[ex.id];
                              return updated;
                            });
                          }}
                        >
                          <Text style={styles.timerGhostText}>Reset</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity 
                        onPress={() => toggleSet(ex.id, 0)}
                        style={[styles.cardioCompleteBtn, (checks[0] ?? false) && styles.cardioCompleteBtnDone]}
                      >
                        <Text style={[styles.cardioCompleteBtnText, (checks[0] ?? false) && styles.cardioCompleteBtnTextDone]}>
                          {checks[0] ? '✓ Completed' : 'Mark as Complete'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })() : (
                  <View style={styles.setsColumn}>
                    {checks.map((c, i) => (
                      <View key={i} style={styles.setRow}>
                        <TouchableOpacity onPress={() => toggleSet(ex.id, i)} style={[styles.setCheck, c && styles.setCheckDone]} testID={`set-${ex.id}-${i}`}>
                          {c ? <CheckCircle2 size={18} color={Colors.background} /> : <Circle size={18} color={Colors.textSecondary} />}
                        </TouchableOpacity>
                        <Text style={styles.setNumber}>Set {i + 1}</Text>
                        <View style={styles.inputBox}>
                          <Dumbbell size={14} color={Colors.textSecondary} />
                          <TextInput
                            style={styles.input}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor={Colors.textSecondary}
                            value={(weights[i] ?? 0) === 0 ? '' : String(weights[i])}
                            onChangeText={(t) => updateWeight(ex.id, i, t)}
                          />
                          <Text style={styles.inputUnit}>{weightUnit}</Text>
                        </View>
                        <Text style={styles.xText}>×</Text>
                        <View style={styles.inputBox}>
                          <TextInput
                            style={styles.input}
                            keyboardType="numeric"
                            placeholder="Reps"
                            placeholderTextColor={Colors.textSecondary}
                            value={(repsArray[i] ?? 0) === 0 ? '' : String(repsArray[i])}
                            onChangeText={(t) => updateReps(ex.id, i, t)}
                          />
                        </View>
                      </View>
                    ))}
                    <TouchableOpacity onPress={() => addSet(ex.id)} style={styles.addSetBtn} testID={`addset-${ex.id}`}>
                      <Plus size={16} color={Colors.accent} />
                      <Text style={styles.addSetText}>Add set</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={[styles.finishBtn, doneSets !== totalSets && styles.finishBtnDisabled]} disabled={doneSets !== totalSets} onPress={onFinish} testID="finish-workout">
          <Text style={styles.finishBtnText}>Finish Workout</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={demoExercise !== null} transparent animationType="slide" onRequestClose={() => setDemoExercise(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{(demoExercise ?? '').toUpperCase()}</Text>
              <TouchableOpacity onPress={() => setDemoExercise(null)} style={styles.modalCloseBtn}>
                <X size={20} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSectionTitle}>HOW TO PERFORM</Text>
            {getExerciseTips(demoExercise ?? '').map((tip, i) => (
              <Text key={i} style={styles.modalTip}>• {tip}</Text>
            ))}
            <Text style={styles.modalSectionTitle}>WATCH TUTORIAL</Text>
            <TouchableOpacity
              style={styles.modalTutorialBtn}
              onPress={() => Linking.openURL(`https://www.youtube.com/results?search_query=${encodeURIComponent((demoExercise ?? '') + ' proper form tutorial')}`)}
            >
              <Text style={styles.modalTutorialBtnText}>Open YouTube Tutorial</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function getExerciseTips(name: string): string[] {
  const n = name.toLowerCase();
  if (n.includes('squat')) return [
    'Keep your chest up and back straight throughout the movement',
    'Drive your knees out in line with your toes as you descend',
    'Break parallel if mobility allows — hips below knee level',
  ];
  if (n.includes('deadlift')) return [
    'Hinge at the hips, keep the bar close to your body',
    'Engage your lats and brace your core before the pull',
    'Lock out fully at the top — hips and shoulders rise together',
  ];
  if (n.includes('bench') || n.includes('press')) return [
    'Retract your shoulder blades and keep them pinched throughout',
    'Lower the bar under control to mid-chest, elbows at ~45°',
    'Press explosively and squeeze your chest at the top',
  ];
  if (n.includes('row') || n.includes('pull')) return [
    'Initiate the movement by retracting your shoulder blades',
    'Pull with your elbows, not your hands — keep forearms neutral',
    'Pause and squeeze at peak contraction before lowering',
  ];
  if (n.includes('curl')) return [
    'Keep your elbows pinned at your sides throughout the rep',
    'Supinate (rotate) your wrists as you curl for full bicep activation',
    'Lower slowly — the eccentric phase builds more muscle',
  ];
  if (n.includes('plank')) return [
    'Maintain a straight line from head to heels — no sagging hips',
    'Squeeze your glutes, abs, and quads simultaneously',
    'Breathe steadily — inhale through nose, exhale through mouth',
  ];
  if (n.includes('push')) return [
    'Place hands slightly wider than shoulder-width apart',
    'Keep your body in a rigid plank position throughout',
    'Lower your chest to just above the floor, then press explosively',
  ];
  return [
    'Focus on controlled movement — slow down the eccentric phase',
    'Breathe out on exertion and in on the way back to start',
    'Maintain proper posture and brace your core throughout',
  ];
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 16 },
  error: { color: Colors.text, marginTop: 60, textAlign: 'center', fontSize: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  backBtnText: { color: Colors.text, fontWeight: '800' as const },
  title: { color: Colors.text, fontSize: 22, fontWeight: '900' as const },
  subtitle: { color: Colors.textSecondary, fontSize: 13, marginBottom: 16, fontWeight: '600' as const },
  progressWrap: { marginBottom: 16 },
  progressBarOuter: { height: 10, backgroundColor: Colors.surfaceLight, borderRadius: 6 },
  progressBarInner: { height: '100%', backgroundColor: Colors.accent, borderRadius: 6 },
  progressText: { color: Colors.textSecondary, fontSize: 12, marginTop: 6, fontWeight: '600' as const },
  exerciseCard: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12 },
  exerciseHeader: { marginBottom: 8 },
  exerciseName: { color: Colors.text, fontSize: 15, fontWeight: '800' as const },
  exerciseMeta: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' as const },
  setsColumn: { gap: 10 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  setCheck: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  setCheckDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  setNumber: { fontSize: 13, fontWeight: '700' as const, color: Colors.textSecondary, minWidth: 45 },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surfaceLight, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 8, height: 36, flex: 1 },
  input: { flex: 1, color: Colors.text, fontWeight: '700' as const, fontSize: 14 },
  inputUnit: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' as const },
  xText: { fontSize: 16, fontWeight: '800' as const, color: Colors.textSecondary },
  addSetBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 36, borderRadius: 8, backgroundColor: Colors.border, alignSelf: 'flex-start', marginTop: 4 },
  addSetText: { color: Colors.accent, fontWeight: '800' as const },
  finishBtn: { marginTop: 20, backgroundColor: Colors.accent, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  finishBtnDisabled: { opacity: 0.5 },
  finishBtnText: { color: Colors.background, fontSize: 16, fontWeight: '900' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  cardioTimerContainer: { marginTop: 4 },
  cardioTimerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardioTimerTitle: { color: Colors.accent, fontSize: 13, fontWeight: '800' as const, textTransform: 'uppercase' as const },
  cardioTimerValue: { color: Colors.text, fontSize: 48, fontWeight: '900' as const, textAlign: 'center', marginVertical: 12 },
  cardioProgressBarOuter: { height: 8, backgroundColor: Colors.surfaceLight, borderRadius: 4, marginBottom: 12 },
  cardioProgressBarInner: { height: '100%', backgroundColor: Colors.accent, borderRadius: 4 },
  timerRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  timerBtn: { flex: 1, backgroundColor: Colors.accent, borderRadius: 8, alignItems: 'center', paddingVertical: 12 },
  timerBtnGhost: { backgroundColor: Colors.border },
  timerBtnText: { color: Colors.background, fontWeight: '900' as const },
  timerGhostText: { color: Colors.text, fontWeight: '800' as const },
  cardioCompleteBtn: { marginTop: 12, backgroundColor: Colors.surfaceLight, borderWidth: 2, borderColor: Colors.border, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  cardioCompleteBtnDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  cardioCompleteBtnText: { color: Colors.text, fontSize: 15, fontWeight: '900' as const, textTransform: 'uppercase' as const },
  cardioCompleteBtnTextDone: { color: Colors.background },
  exerciseNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoBtn: { padding: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, borderWidth: 1, borderColor: Colors.border },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { color: Colors.accent, fontSize: 18, fontWeight: '900' as const, flex: 1 },
  modalCloseBtn: { padding: 4 },
  modalSectionTitle: { color: Colors.textSecondary, fontSize: 11, fontWeight: '800' as const, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 10, marginTop: 8 },
  modalTip: { color: Colors.text, fontSize: 14, fontWeight: '500' as const, marginBottom: 8, lineHeight: 20 },
  modalTutorialBtn: { backgroundColor: Colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 12, marginBottom: 8 },
  modalTutorialBtnText: { color: Colors.background, fontWeight: '900' as const, fontSize: 15 },
});
