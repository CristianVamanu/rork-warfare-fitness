import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Switch, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { Plus, Trash2, X, Copy, Edit2, Calendar, Sparkles } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/colors';
import { useTraining, Workout, Exercise, Program } from '@/contexts/TrainingContext';
import { useApp } from '@/contexts/AppContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Shield } from 'lucide-react-native';
import { trpc } from '@/lib/trpc';

export default function AdminProgramsScreen() {
  const insets = useSafeAreaInsets();
  const { user, adminSettings } = useApp();
  const { programs, createProgram, deleteProgram, setWorkoutForDay, updateProgramAccess, updateProgramMeta, addDayToProgram, cloneWeek } = useTraining();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('New Program');
  const [newDays, setNewDays] = useState('90');
  const [newAccess, setNewAccess] = useState<Program['accessLevel']>('free');
  const [newIsPaid, setNewIsPaid] = useState(false);
  const [editing, setEditing] = useState<{ programId: string; day: number } | null>(null);
  const [editingProgram, setEditingProgram] = useState<string | null>(null);
  const [workoutForm, setWorkoutForm] = useState<Workout | null>(null);
  const [programEditForm, setProgramEditForm] = useState<{ title: string; description: string; isPaid: boolean; requiresSubscription: boolean; logoUrl: string } | null>(null);
  const [cloneWeekModal, setCloneWeekModal] = useState<{ programId: string; weekNumber: string } | null>(null);
  const [showAiGenerate, setShowAiGenerate] = useState(false);
  const [aiDescription, setAiDescription] = useState('');
  const [aiDays, setAiDays] = useState('90');
  const [aiAccess, setAiAccess] = useState<Program['accessLevel']>('free');
  const [aiIsPaid, setAiIsPaid] = useState(false);
  
  const generateMutation = trpc.programs.generateWithAi.useMutation();

  if (!user?.isAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <Stack.Screen options={{ title: 'Admin Programs', headerStyle: { backgroundColor: Colors.background }, headerTintColor: Colors.text }} />
        <Shield size={64} color={Colors.textTertiary} />
        <Text style={[styles.headerTitle, { marginTop: 20, textAlign: 'center' }]}>Access Denied</Text>
        <Text style={[styles.programSub, { marginTop: 8, textAlign: 'center', paddingHorizontal: 40 }]}>Admin privileges required</Text>
      </View>
    );
  }

  const openEdit = (programId: string, day: number, base: Workout | null) => {
    setEditing({ programId, day });
    if (base) {
      setWorkoutForm({ ...base, exercises: base.exercises.map(e => ({ ...e })) });
    } else {
      const defaultWorkout: Workout = {
        id: `${programId}-day-${day}`,
        name: `Day ${day} Workout`,
        durationMin: 45,
        muscleGroup: 'Full Body',
        exercises: [],
      };
      setWorkoutForm(defaultWorkout);
    }
  };

  const openProgramEdit = (programId: string) => {
    const program = programs.find(p => p.id === programId);
    if (!program) return;
    setEditingProgram(programId);
    setProgramEditForm({
      title: program.title,
      description: program.description ?? '',
      isPaid: program.isPaid ?? false,
      requiresSubscription: program.requiresSubscription ?? false,
      logoUrl: program.logoUrl ?? '',
    });
  };

  const saveProgramEdit = () => {
    if (!editingProgram || !programEditForm) return;
    updateProgramMeta(editingProgram, programEditForm);
    setEditingProgram(null);
    setProgramEditForm(null);
    Alert.alert('Saved', 'Program settings updated');
  };

  const saveWorkout = () => {
    if (!editing || !workoutForm) return;
    setWorkoutForDay(editing.programId, editing.day, workoutForm);
    setEditing(null);
    setWorkoutForm(null);
    Alert.alert('Saved', 'Workout updated');
  };

  const markAsRestDay = () => {
    if (!editing) return;
    setWorkoutForDay(editing.programId, editing.day, null);
    setEditing(null);
    setWorkoutForm(null);
    Alert.alert('Saved', 'Marked as rest day');
  };

  const addExercise = () => {
    if (!workoutForm) return;
    const ex: Exercise = { id: `${workoutForm.id}-ex-${Date.now()}`, name: 'New Exercise', sets: 3, reps: '8-12', restSec: 90, rpe: '7-9', isCardio: false };
    setWorkoutForm({ ...workoutForm, exercises: [...workoutForm.exercises, ex] });
  };

  const removeExercise = (id: string) => {
    if (!workoutForm) return;
    setWorkoutForm({ ...workoutForm, exercises: workoutForm.exercises.filter(e => e.id !== id) });
  };

  const handleCloneWeek = () => {
    if (!cloneWeekModal) return;
    const weekNum = parseInt(cloneWeekModal.weekNumber, 10);
    if (isNaN(weekNum) || weekNum < 1) {
      Alert.alert('Error', 'Please enter a valid week number');
      return;
    }
    cloneWeek(cloneWeekModal.programId, weekNum);
    setCloneWeekModal(null);
    Alert.alert('Success', `Week ${weekNum} has been cloned and added to the program`);
  };

  const handleAiGenerate = async () => {
    if (!aiDescription.trim()) {
      Alert.alert('Error', 'Please provide a program description');
      return;
    }

    const apiKey = adminSettings.aiApiKey;
    if (!apiKey || apiKey.trim().length === 0) {
      Alert.alert('Error', 'OpenAI API key is not configured. Please set it in Admin Settings.');
      return;
    }

    try {
      const days = parseInt(aiDays, 10) || 90;
      const result = await generateMutation.mutateAsync({
        programDescription: aiDescription,
        apiKey,
        days,
      });

      const id = result.title.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
      const schedule = result.schedule.map(s => ({
        day: s.day,
        workout: s.workout ? {
          ...s.workout,
          id: `${id}-day-${s.day}`,
          exercises: s.workout.exercises.map((e, idx) => ({
            ...e,
            id: `${id}-day-${s.day}-ex-${idx}`,
          })),
        } : null,
      }));

      const program: Program = {
        id,
        title: result.title,
        days: result.days,
        schedule,
        completedDays: {},
        accessLevel: aiAccess,
        isPaid: aiIsPaid,
        requiresSubscription: aiIsPaid,
      };

      const existingPrograms = await AsyncStorage.getItem('wf_programs');
      const currentPrograms = existingPrograms ? JSON.parse(existingPrograms) : programs;
      const next = [program, ...currentPrograms];
      await AsyncStorage.setItem('wf_programs', JSON.stringify(next));
      setShowAiGenerate(false);
      setAiDescription('');
      setAiDays('90');
      Alert.alert('Success', `AI-generated program "${result.title}" created! Please refresh the page to see it.`);
    } catch (error) {
      console.error('[AI Generate] Error:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to generate program');
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Manage Programs', headerStyle: { backgroundColor: Colors.background }, headerTintColor: Colors.text, headerShadowVisible: false }} />
      <View style={[styles.container, { paddingTop: insets.top }]}>

        <View style={styles.header}>
          <Text style={styles.headerTitle}>Programs</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.aiBtn} onPress={() => setShowAiGenerate(true)}>
              <Sparkles size={18} color={Colors.background} />
              <Text style={styles.createText}>AI Generate</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)}>
              <Plus size={18} color={Colors.background} />
              <Text style={styles.createText}>Create</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {programs.map(p => (
            <View key={p.id} style={styles.programCard}>
              <View style={styles.programTop}>
                <View style={styles.programInfo}>
                  <Text style={styles.programTitle}>{p.title}</Text>
                  <Text style={styles.programSub}>
                    {p.days} days • {p.isPaid ? 'Paid' : 'Free'} • Access: {p.accessLevel ?? 'free'}
                  </Text>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => openProgramEdit(p.id)}>
                    <Edit2 size={16} color={Colors.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => {
                    Alert.alert('Delete Program', `Delete "${p.title}"?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: async () => {
                        try {
                          await deleteProgram(p.id);
                          Alert.alert('Success', 'Program deleted successfully');
                        } catch (error) {
                          console.error('[Admin] Delete program error:', error);
                          Alert.alert('Error', 'Failed to delete program. Please try again.');
                        }
                      }},
                    ]);
                  }}>
                    <Trash2 size={16} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.programActions}>
                <TouchableOpacity style={styles.smallBtn} onPress={() => addDayToProgram(p.id)}>
                  <Plus size={14} color={Colors.accent} />
                  <Text style={styles.smallBtnText}>Add Day</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallBtn} onPress={() => setCloneWeekModal({ programId: p.id, weekNumber: '1' })}>
                  <Copy size={14} color={Colors.accent} />
                  <Text style={styles.smallBtnText}>Clone Week</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.daysLabel}>Days (tap to edit):</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysRow}>
                {p.schedule.map(s => (
                  <TouchableOpacity key={s.day} style={[styles.dayChip, !s.workout && styles.dayChipRest]} onPress={() => openEdit(p.id, s.day, s.workout)}>
                    <Text style={[styles.dayChipText, !s.workout && styles.dayChipTextRest]}>
                      {s.workout ? `Day ${s.day}` : `Rest ${s.day}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.row2}>
                {(['free','premium'] as const).map(level => (
                  <TouchableOpacity key={level} style={[styles.levelChip, (p.accessLevel ?? 'free') === level && styles.levelChipActive]} onPress={() => updateProgramAccess(p.id, level)}>
                    <Text style={[styles.levelText, (p.accessLevel ?? 'free') === level && styles.levelTextActive]}>{level}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
          <View style={{ height: 60 }} />
        </ScrollView>
      </View>

      <Modal visible={showCreate} animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create Program</Text>
            <TouchableOpacity onPress={() => setShowCreate(false)}><X size={22} color={Colors.text} /></TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.label}>Title</Text>
            <TextInput style={styles.input} value={newTitle} onChangeText={setNewTitle} placeholder="Program title" placeholderTextColor={Colors.textSecondary} />
            
            <Text style={styles.label}>Number of Days</Text>
            <TextInput style={styles.input} value={newDays} onChangeText={setNewDays} keyboardType="numeric" placeholder="90" placeholderTextColor={Colors.textSecondary} />
            
            <View style={styles.switchRow}>
              <Text style={styles.label}>Paid Program (requires subscription)</Text>
              <Switch value={newIsPaid} onValueChange={setNewIsPaid} trackColor={{ false: Colors.border, true: Colors.accent }} />
            </View>
            
            <Text style={styles.label}>Access Level</Text>
            <View style={styles.row2}>
              {(['free','premium'] as const).map(level => (
                <TouchableOpacity key={level} style={[styles.levelChip, newAccess === level && styles.levelChipActive]} onPress={() => setNewAccess(level)}>
                  <Text style={[styles.levelText, newAccess === level && styles.levelTextActive]}>{level}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={() => {
              const days = parseInt(newDays, 10) || 90;
              void createProgram(newTitle, days, newAccess, newIsPaid);
              setShowCreate(false);
              setNewTitle('New Program');
              setNewDays('90');
              setNewIsPaid(false);
              Alert.alert('Created', 'Program created');
            }}>
              <Text style={styles.saveText}>Create</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreate(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!editingProgram} animationType="slide" onRequestClose={() => setEditingProgram(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Program Settings</Text>
            <TouchableOpacity onPress={() => setEditingProgram(null)}><X size={22} color={Colors.text} /></TouchableOpacity>
          </View>
          {programEditForm && (
            <ScrollView style={styles.modalBody}>
              <Text style={styles.label}>Program Title</Text>
              <TextInput style={styles.input} value={programEditForm.title} onChangeText={(t) => setProgramEditForm({ ...programEditForm, title: t })} />

              <Text style={styles.label}>Program Description</Text>
              <TextInput 
                style={[styles.input, styles.textArea]} 
                value={programEditForm.description} 
                onChangeText={(t) => setProgramEditForm({ ...programEditForm, description: t })} 
                placeholder="Describe this program (e.g., 'Build lean muscle with progressive overload...')"
                placeholderTextColor={Colors.textTertiary}
                multiline
                numberOfLines={4}
              />

              <Text style={styles.label}>Program Logo/Badge URL</Text>
              <TextInput 
                style={styles.input} 
                value={programEditForm.logoUrl} 
                onChangeText={(t) => setProgramEditForm({ ...programEditForm, logoUrl: t })} 
                placeholder="https://example.com/logo.png"
                placeholderTextColor={Colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Paid Program</Text>
                  <Text style={styles.helpText}>Requires subscription after 1-week trial</Text>
                </View>
                <Switch
                  value={programEditForm.isPaid}
                  onValueChange={(v) => setProgramEditForm({ ...programEditForm, isPaid: v, requiresSubscription: v })}
                  trackColor={{ false: Colors.border, true: Colors.accent }}
                />
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={saveProgramEdit}>
                <Text style={styles.saveText}>Save Changes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingProgram(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Day {editing?.day}</Text>
            <TouchableOpacity onPress={() => setEditing(null)}><X size={22} color={Colors.text} /></TouchableOpacity>
          </View>
          {workoutForm && (
            <ScrollView style={styles.modalBody}>
              <Text style={styles.label}>Workout Name</Text>
              <TextInput style={styles.input} value={workoutForm.name} onChangeText={(t) => setWorkoutForm({ ...workoutForm, name: t })} />

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Duration (min)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={String(workoutForm.durationMin)} onChangeText={(t) => setWorkoutForm({ ...workoutForm, durationMin: parseInt(t || '0', 10) })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Muscle Group</Text>
                  <TextInput style={styles.input} value={workoutForm.muscleGroup} onChangeText={(t) => setWorkoutForm({ ...workoutForm, muscleGroup: t })} />
                </View>
              </View>

              <View style={styles.exHeader}>
                <Text style={styles.sectionTitle}>Exercises</Text>
                <TouchableOpacity style={styles.addBtn} onPress={addExercise}>
                  <Plus size={16} color={Colors.background} />
                  <Text style={styles.addText}>Add Exercise</Text>
                </TouchableOpacity>
              </View>

              {workoutForm.exercises.map((e, idx) => (
                <View key={e.id} style={styles.exerciseRow}>
                  <View style={styles.row2}>
                    <TextInput style={[styles.input, { flex: 2 }]} value={e.name} onChangeText={(t) => {
                      const ex = [...workoutForm.exercises]; ex[idx] = { ...e, name: t }; setWorkoutForm({ ...workoutForm, exercises: ex });
                    }} placeholder="Exercise name" placeholderTextColor={Colors.textSecondary} />
                  </View>
                  
                  <View style={styles.switchRow}>
                    <Text style={styles.label}>Cardio Exercise (time-based)</Text>
                    <Switch 
                      value={e.isCardio ?? false} 
                      onValueChange={(v) => {
                        const ex = [...workoutForm.exercises];
                        ex[idx] = { ...e, isCardio: v, cardioDurationMin: v ? 10 : undefined };
                        setWorkoutForm({ ...workoutForm, exercises: ex });
                      }}
                      trackColor={{ false: Colors.border, true: Colors.accent }}
                    />
                  </View>

                  {e.isCardio ? (
                    <View style={styles.row2}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>Duration (min)</Text>
                        <TextInput 
                          style={styles.input} 
                          keyboardType="numeric" 
                          value={String(e.cardioDurationMin ?? 10)} 
                          onChangeText={(t) => {
                            const ex = [...workoutForm.exercises];
                            ex[idx] = { ...e, cardioDurationMin: parseInt(t || '10', 10) };
                            setWorkoutForm({ ...workoutForm, exercises: ex });
                          }} 
                          placeholder="Duration" 
                          placeholderTextColor={Colors.textSecondary} 
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>Rest (sec)</Text>
                        <TextInput 
                          style={styles.input} 
                          keyboardType="numeric" 
                          value={String(e.restSec)} 
                          onChangeText={(t) => {
                            const ex = [...workoutForm.exercises];
                            ex[idx] = { ...e, restSec: parseInt(t || '0', 10) };
                            setWorkoutForm({ ...workoutForm, exercises: ex });
                          }} 
                          placeholder="Rest sec" 
                          placeholderTextColor={Colors.textSecondary} 
                        />
                      </View>
                    </View>
                  ) : (
                    <>
                      <View style={styles.row2}>
                        <TextInput style={[styles.input, { flex: 1 }]} keyboardType="numeric" value={String(e.sets)} onChangeText={(t) => {
                          const ex = [...workoutForm.exercises]; ex[idx] = { ...e, sets: parseInt(t || '0', 10) }; setWorkoutForm({ ...workoutForm, exercises: ex });
                        }} placeholder="Sets" placeholderTextColor={Colors.textSecondary} />
                        <TextInput style={[styles.input, { flex: 1 }]} value={e.reps} onChangeText={(t) => {
                          const ex = [...workoutForm.exercises]; ex[idx] = { ...e, reps: t }; setWorkoutForm({ ...workoutForm, exercises: ex });
                        }} placeholder="Reps" placeholderTextColor={Colors.textSecondary} />
                      </View>
                      <View style={styles.row2}>
                        <TextInput style={[styles.input, { flex: 1 }]} keyboardType="numeric" value={String(e.restSec)} onChangeText={(t) => {
                          const ex = [...workoutForm.exercises]; ex[idx] = { ...e, restSec: parseInt(t || '0', 10) }; setWorkoutForm({ ...workoutForm, exercises: ex });
                        }} placeholder="Rest sec" placeholderTextColor={Colors.textSecondary} />
                        <TextInput style={[styles.input, { flex: 1 }]} value={e.rpe ?? ''} onChangeText={(t) => {
                          const ex = [...workoutForm.exercises]; ex[idx] = { ...e, rpe: t }; setWorkoutForm({ ...workoutForm, exercises: ex });
                        }} placeholder="RPE" placeholderTextColor={Colors.textSecondary} />
                      </View>
                    </>
                  )}

                  <TouchableOpacity style={styles.removeBtn} onPress={() => removeExercise(e.id)}>
                    <Trash2 size={16} color={Colors.danger} />
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity style={styles.saveBtn} onPress={saveWorkout}><Text style={styles.saveText}>Save Workout</Text></TouchableOpacity>
              <TouchableOpacity style={styles.restBtn} onPress={markAsRestDay}>
                <Calendar size={16} color={Colors.textSecondary} />
                <Text style={styles.restBtnText}>Mark as Rest Day</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(null)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
            </ScrollView>
          )}
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showAiGenerate} animationType="slide" onRequestClose={() => setShowAiGenerate(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>AI Program Generator</Text>
            <TouchableOpacity onPress={() => setShowAiGenerate(false)}><X size={22} color={Colors.text} /></TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <View style={styles.aiHeaderCard}>
              <Sparkles size={24} color={Colors.accent} />
              <Text style={styles.aiHeaderText}>Describe your program and let AI create a complete workout plan</Text>
            </View>

            <Text style={styles.label}>Program Description</Text>
            <TextInput
              style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
              value={aiDescription}
              onChangeText={setAiDescription}
              placeholder="E.g., Create a 90-day program for building muscle and losing fat. Focus on compound movements, include HIIT cardio, and add mobility work."
              placeholderTextColor={Colors.textTertiary}
              multiline
              numberOfLines={4}
            />
            
            <Text style={styles.label}>Number of Days</Text>
            <TextInput style={styles.input} value={aiDays} onChangeText={setAiDays} keyboardType="numeric" placeholder="90" placeholderTextColor={Colors.textSecondary} />
            
            <View style={styles.switchRow}>
              <Text style={styles.label}>Paid Program (requires subscription)</Text>
              <Switch value={aiIsPaid} onValueChange={setAiIsPaid} trackColor={{ false: Colors.border, true: Colors.accent }} />
            </View>
            
            <Text style={styles.label}>Access Level</Text>
            <View style={styles.row2}>
              {(['free','premium'] as const).map(level => (
                <TouchableOpacity key={level} style={[styles.levelChip, aiAccess === level && styles.levelChipActive]} onPress={() => setAiAccess(level)}>
                  <Text style={[styles.levelText, aiAccess === level && styles.levelTextActive]}>{level}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {!adminSettings.aiApiKey && (
              <View style={styles.warningCard}>
                <Text style={styles.warningText}>⚠️  OpenAI API key not configured. Set it in Admin Settings first.</Text>
              </View>
            )}

            <TouchableOpacity 
              style={[styles.saveBtn, styles.aiGenerateBtn, generateMutation.isPending && styles.aiGenerateBtnDisabled]} 
              onPress={handleAiGenerate}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.background} />
              ) : (
                <>
                  <Sparkles size={18} color={Colors.background} />
                  <Text style={styles.saveText}>Generate Program</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAiGenerate(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!cloneWeekModal} animationType="fade" transparent onRequestClose={() => setCloneWeekModal(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.overlayModal}>
          <View style={styles.smallModalCard}>
            <Text style={styles.smallModalTitle}>Clone Week</Text>
            <Text style={styles.smallModalSub}>Enter week number to clone (e.g., 1 for days 1-7)</Text>
            <TextInput
              style={styles.input}
              value={cloneWeekModal?.weekNumber ?? ''}
              onChangeText={(t) => cloneWeekModal && setCloneWeekModal({ ...cloneWeekModal, weekNumber: t })}
              keyboardType="numeric"
              placeholder="Week number"
              placeholderTextColor={Colors.textSecondary}
            />
            <View style={styles.modalButtonRow}>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setCloneWeekModal(null)}>
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonConfirm]} onPress={handleCloneWeek}>
                <Text style={styles.modalButtonTextConfirm}>Clone</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: 24, fontWeight: '800' as const, color: Colors.text },
  createBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  createText: { color: Colors.background, fontWeight: '800' as const },
  scroll: { flex: 1, padding: 20 },
  programCard: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 12 },
  programTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  programInfo: { flex: 1, marginRight: 12 },
  programTitle: { color: Colors.text, fontWeight: '800' as const, fontSize: 16 },
  programSub: { color: Colors.textSecondary, marginTop: 4, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  programActions: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: Colors.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  smallBtnText: { color: Colors.accent, fontWeight: '700' as const, fontSize: 12 },
  daysLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' as const, marginBottom: 8, textTransform: 'uppercase' as const },
  daysRow: { gap: 8, paddingBottom: 12 },
  dayChip: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: Colors.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  dayChipRest: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' },
  dayChipText: { color: Colors.text, fontWeight: '800' as const },
  dayChipTextRest: { color: '#92400E' },

  modalRoot: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { color: Colors.text, fontSize: 20, fontWeight: '800' as const },
  modalBody: { padding: 20 },
  label: { color: Colors.text, fontWeight: '700' as const, marginBottom: 8 },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: Colors.text, marginBottom: 12 },
  row2: { flexDirection: 'row', gap: 8 },
  exHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 8 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.accent, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  addText: { color: Colors.background, fontWeight: '800' as const },
  exerciseRow: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 10, marginBottom: 10 },
  removeBtn: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  removeText: { color: Colors.danger, fontWeight: '800' as const },
  saveBtn: { backgroundColor: Colors.accent, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  saveText: { color: Colors.background, fontWeight: '900' as const },
  cancelBtn: { backgroundColor: Colors.background, paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.text, fontWeight: '800' as const },
  restBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FEF3C7', paddingVertical: 12, borderRadius: 10, marginTop: 8, borderWidth: 1, borderColor: '#FCD34D' },
  restBtnText: { color: '#92400E', fontWeight: '800' as const },
  sectionTitle: { color: Colors.text, fontSize: 16, fontWeight: '800' as const },
  levelChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  levelChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  levelText: { color: Colors.text, fontWeight: '800' as const, fontSize: 12 },
  levelTextActive: { color: Colors.background },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  helpText: { color: Colors.textTertiary, fontSize: 12, marginTop: 2 },
  overlayModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  smallModalCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 20, width: '100%', maxWidth: 400 },
  smallModalTitle: { color: Colors.text, fontSize: 18, fontWeight: '800' as const, marginBottom: 8 },
  smallModalSub: { color: Colors.textSecondary, fontSize: 14, marginBottom: 16 },
  modalButtonRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalButtonCancel: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  modalButtonConfirm: { backgroundColor: Colors.accent },
  modalButtonTextCancel: { color: Colors.text, fontWeight: '800' as const },
  modalButtonTextConfirm: { color: Colors.background, fontWeight: '800' as const },
  headerActions: { flexDirection: 'row', gap: 8 },
  aiBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#8B5CF6', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  aiHeaderCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surfaceLight, borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: Colors.border },
  aiHeaderText: { flex: 1, color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  aiGenerateBtn: { flexDirection: 'row', gap: 8, backgroundColor: '#8B5CF6' },
  aiGenerateBtnDisabled: { opacity: 0.6 },
  warningCard: { backgroundColor: '#FEF3C7', borderRadius: 12, padding: 16, marginTop: 8, marginBottom: 16, borderWidth: 1, borderColor: '#FCD34D' },
  warningText: { color: '#92400E', fontSize: 13, fontWeight: '600' as const },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  miniLabel: { color: Colors.textSecondary, fontSize: 11, fontWeight: '700' as const, marginBottom: 4, textTransform: 'uppercase' as const },
});
