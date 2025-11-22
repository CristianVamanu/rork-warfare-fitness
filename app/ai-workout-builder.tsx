import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Sparkles, Upload, X, Dumbbell, Image as ImageIcon, Target, Ruler, Weight, Calendar } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/colors';

import { useTraining } from '@/contexts/TrainingContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateText } from '@rork-ai/toolkit-sdk';

export default function AiWorkoutBuilderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { programs } = useTraining();

  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [age, setAge] = useState('');
  const [goals, setGoals] = useState('');
  const [experience, setExperience] = useState('');
  const [programDays, setProgramDays] = useState('90');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [useImageInput, setUseImageInput] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
  };

  const parseWorkoutFromText = (text: string, days: number) => {
    console.log('[AI Workout Builder] Parsing text response:', text.substring(0, 200));
    console.log('[AI Workout Builder] Full text length:', text.length);
    
    if (typeof text !== 'string') {
      console.error('[AI Workout Builder] Invalid text type:', typeof text);
      throw new Error('Invalid response format from AI');
    }
    
    const lines = text.split('\n').filter(line => line.trim());
    let title = 'AI-Generated Workout Program';
    let description = 'Personalized workout program';
    const schedule: any[] = [];

    for (let i = 0; i < days; i++) {
      schedule.push({ day: i + 1, workout: null });
    }

    let currentDay = -1;
    let currentWorkout: any = null;
    let currentExercises: any[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.match(/^#+ /) || line.match(/^Title:/i)) {
        const titleMatch = line.replace(/^#+ /, '').replace(/^Title:/i, '').trim();
        if (titleMatch && !titleMatch.match(/Day \d+/i)) {
          title = titleMatch;
        }
      }
      
      if (line.match(/^Description:/i)) {
        description = line.replace(/^Description:/i, '').trim();
      }

      const dayMatch = line.match(/Day (\d+):/i);
      if (dayMatch) {
        if (currentWorkout && currentExercises.length > 0) {
          currentWorkout.exercises = currentExercises;
          schedule[currentDay - 1].workout = currentWorkout;
        }
        
        currentDay = parseInt(dayMatch[1], 10);
        currentWorkout = {
          name: 'Training Session',
          durationMin: 60,
          muscleGroup: 'Full Body',
          exercises: [],
        };
        currentExercises = [];
        
        const workoutNameMatch = line.match(/Day \d+:\s*(.+?)(?:\s*\(|\s*-|$)/i);
        if (workoutNameMatch && workoutNameMatch[1]) {
          currentWorkout.name = workoutNameMatch[1].trim();
        }
        continue;
      }

      if (line.match(/rest|off/i) && currentDay > 0) {
        schedule[currentDay - 1].workout = null;
        currentWorkout = null;
        currentExercises = [];
        continue;
      }

      if (currentWorkout && line.match(/^\d+\.|^-|^\*|^[A-Z]/)) {
        const exerciseLine = line.replace(/^\d+\.\s*|^-\s*|^\*\s*/, '');
        const nameMatch = exerciseLine.match(/^([^:]+?)(?:\s*[-:]\s*|\s+\d+)/i);
        
        if (nameMatch) {
          const exerciseName = nameMatch[1].trim();
          const setsMatch = exerciseLine.match(/(\d+)\s*(?:sets?|x)/i);
          const repsMatch = exerciseLine.match(/x?\s*(\d+(?:-\d+)?|AMRAP)\s*(?:reps?|$)/i);
          const restMatch = exerciseLine.match(/(\d+)\s*(?:sec|s|seconds?)/i);
          
          currentExercises.push({
            id: `ex-${Date.now()}-${currentExercises.length}`,
            name: exerciseName,
            sets: setsMatch ? parseInt(setsMatch[1], 10) : 3,
            reps: repsMatch ? repsMatch[1] : '8-12',
            restSec: restMatch ? parseInt(restMatch[1], 10) : 90,
            rpe: '7-9',
            isCardio: false,
          });
        }
      }
    }

    if (currentWorkout && currentExercises.length > 0) {
      currentWorkout.exercises = currentExercises;
      if (currentDay > 0 && currentDay <= schedule.length) {
        schedule[currentDay - 1].workout = currentWorkout;
      }
    }

    if (schedule.every(s => s.workout === null)) {
      const defaultWorkout = {
        name: 'Full Body Workout',
        durationMin: 60,
        muscleGroup: 'Full Body',
        exercises: [
          { id: 'ex-1', name: 'Squats', sets: 3, reps: '10-12', restSec: 90, rpe: '7-9', isCardio: false },
          { id: 'ex-2', name: 'Push-ups', sets: 3, reps: '10-15', restSec: 60, rpe: '7-9', isCardio: false },
          { id: 'ex-3', name: 'Rows', sets: 3, reps: '10-12', restSec: 90, rpe: '7-9', isCardio: false },
          { id: 'ex-4', name: 'Plank', sets: 3, reps: '30-60s', restSec: 60, rpe: '7-9', isCardio: false },
        ],
      };
      
      for (let i = 0; i < schedule.length; i++) {
        if ((i + 1) % 4 !== 0) {
          schedule[i].workout = { ...defaultWorkout };
        }
      }
    }

    return { title, description, schedule };
  };

  const handleGenerate = async () => {
    if (useImageInput && !selectedImage && !goals.trim()) {
      Alert.alert('Error', 'Please upload an image and describe your goals.');
      return;
    }

    if (!useImageInput && (!height.trim() || !weight.trim() || !goals.trim())) {
      Alert.alert('Error', 'Please fill in your height, weight, and goals.');
      return;
    }

    setIsGenerating(true);

    try {
      const days = parseInt(programDays, 10) || 90;

      let responseText: string;

      if (useImageInput && selectedImage) {
        const base64Image = selectedImage.startsWith('data:') 
          ? selectedImage.split(',')[1] 
          : selectedImage.includes('base64,') 
            ? selectedImage.split('base64,')[1] 
            : selectedImage;
            
        const prompt = `You are a professional fitness expert. Analyze this person's physique in the image and create a comprehensive ${days}-day workout program based on their goals.

Goals: ${goals}

Please create a detailed program with:
- A descriptive title
- A brief description
- A ${days}-day schedule with strategic rest days

Format each day like this:
Day 1: [Workout Name]
- Exercise 1: 3 sets x 10-12 reps, 90 sec rest
- Exercise 2: 3 sets x 8-10 reps, 90 sec rest
...

Day X: Rest

Base the program on the person's current physique visible in the image and their stated goals. Be detailed and specific!`;

        console.log('[AI Workout Builder] Generating with image...');
        
        responseText = await generateText({
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image', image: `data:image/jpeg;base64,${base64Image}` },
              ],
            },
          ],
        });
        
        console.log('[AI Workout Builder] Image generation complete');
        console.log('[AI Workout Builder] Response type:', typeof responseText);
        console.log('[AI Workout Builder] Response value:', String(responseText).substring(0, 100));
      } else {
        const prompt = `You are a professional fitness expert. Create a comprehensive ${days}-day workout program for someone with these characteristics:

- Height: ${height}
- Weight: ${weight}
${age ? `- Age: ${age}` : ''}
${experience ? `- Experience Level: ${experience}` : ''}
- Goals: ${goals}

Please create a detailed program with:
- A descriptive title
- A brief description  
- A ${days}-day schedule with strategic rest days (typically 1-2 rest days per week)

Format each day like this:
Day 1: [Workout Name - e.g., Upper Body Strength]
- Exercise 1 name: 3 sets x 10-12 reps, 90 sec rest
- Exercise 2 name: 3 sets x 8-10 reps, 90 sec rest
- Exercise 3 name: 4 sets x 12-15 reps, 60 sec rest
...

Day X: Rest

Be specific with exercise names and details. Include 4-6 exercises per training day. Ensure proper progression and variety!`;

        console.log('[AI Workout Builder] Generating with stats...');
        
        responseText = await generateText({ 
          messages: [{ role: 'user', content: prompt }],
        });
        
        console.log('[AI Workout Builder] Stats generation complete');
        console.log('[AI Workout Builder] Response type:', typeof responseText);
        console.log('[AI Workout Builder] Response value:', String(responseText).substring(0, 100));
      }
      
      if (typeof responseText !== 'string') {
        console.error('[AI Workout Builder] Response is not a string, attempting to convert');
        responseText = String(responseText);
      }

      console.log('[AI Workout Builder] Final response type:', typeof responseText);
      console.log('[AI Workout Builder] Final response sample:', String(responseText).substring(0, 300));
      console.log('[AI Workout Builder] Full response length:', String(responseText).length);
      
      const finalText = String(responseText).trim();
      
      if (!finalText || finalText.length === 0) {
        throw new Error('AI returned an empty response. Please try again.');
      }
      
      const parsedProgram = parseWorkoutFromText(finalText, days);
      await saveProgram(parsedProgram, days, useImageInput && !!selectedImage);
      
    } catch (error) {
      console.error('[AI Workout Builder] Error:', error);
      
      let errorMessage = 'Failed to generate workout program. Please try again.';
      
      if (error instanceof Error) {
        console.error('[AI Workout Builder] Error message:', error.message);
        console.error('[AI Workout Builder] Error stack:', error.stack);
        
        if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage = 'Network error. Please check your internet connection and try again.';
        } else {
          errorMessage = error.message;
        }
      }
      
      Alert.alert('Generation Notice', errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const saveProgram = async (result: any, days: number, isImageBased: boolean) => {
    try {
      console.log('[AI Workout Builder] Processing AI result:', result.title);
      
      if (!result.title || !result.schedule || !Array.isArray(result.schedule)) {
        throw new Error('Invalid program structure received from AI');
      }

      const id = result.title.toLowerCase().replace(/\s+/g, '-') + '-ai-' + Date.now();
      const schedule = result.schedule.map((s: any) => ({
        day: s.day,
        workout: s.workout ? {
          ...s.workout,
          id: `${id}-day-${s.day}`,
          exercises: s.workout.exercises.map((e: any, idx: number) => ({
            ...e,
            id: `${id}-day-${s.day}-ex-${idx}`,
            isCardio: e.isCardio ?? false,
            cardioDurationMin: e.cardioDurationMin,
          })),
        } : null,
      }));

      const program = {
        id,
        title: result.title,
        description: result.description || `AI-generated ${days}-day program`,
        days: result.schedule.length,
        schedule,
        completedDays: {},
        accessLevel: 'free' as const,
        isPaid: false,
        requiresSubscription: false,
        isAiGenerated: true,
      };

      const existingPrograms = await AsyncStorage.getItem('wf_programs');
      const currentPrograms = existingPrograms ? JSON.parse(existingPrograms) : programs;
      const next = [program, ...currentPrograms];
      await AsyncStorage.setItem('wf_programs', JSON.stringify(next));

      Alert.alert(
        'Success!',
        `Your AI workout program "${result.title}" has been created! Go to the Training tab to view and start it.`,
        [
          {
            text: 'View Program',
            onPress: () => {
              router.back();
              router.push('/(tabs)/training' as any);
            },
          },
          { text: 'Create Another', style: 'cancel' },
        ]
      );

      setHeight('');
      setWeight('');
      setAge('');
      setGoals('');
      setExperience('');
      setProgramDays('90');
      setSelectedImage(null);
    } catch (error) {
      console.error('[AI Workout Builder] Save error:', error);
      throw new Error(`Failed to save workout program. Please try again.`);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'AI Workout Builder',
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
          headerShadowVisible: false,
        }}
      />

      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Sparkles size={40} color={Colors.accent} />
            </View>
            <Text style={styles.title}>AI Workout Builder</Text>
            <Text style={styles.subtitle}>
              Let AI create a personalized workout program based on your goals
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Choose Input Method</Text>
            <View style={styles.methodSelector}>
              <TouchableOpacity
                style={[styles.methodOption, !useImageInput && styles.methodOptionActive]}
                onPress={() => setUseImageInput(false)}
              >
                <Dumbbell size={24} color={!useImageInput ? Colors.accent : Colors.textSecondary} />
                <Text style={[styles.methodText, !useImageInput && styles.methodTextActive]}>
                  Enter Stats
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.methodOption, useImageInput && styles.methodOptionActive]}
                onPress={() => setUseImageInput(true)}
              >
                <ImageIcon size={24} color={useImageInput ? Colors.accent : Colors.textSecondary} />
                <Text style={[styles.methodText, useImageInput && styles.methodTextActive]}>
                  Upload Photo
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {!useImageInput ? (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Your Stats</Text>
                
                <View style={styles.inputGroup}>
                  <View style={styles.iconLabel}>
                    <Ruler size={18} color={Colors.accent} />
                    <Text style={styles.label}>Height</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    value={height}
                    onChangeText={setHeight}
                    placeholder={'e.g., 5\'10" or 178cm'}
                    placeholderTextColor={Colors.textTertiary}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.iconLabel}>
                    <Weight size={18} color={Colors.accent} />
                    <Text style={styles.label}>Weight</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    value={weight}
                    onChangeText={setWeight}
                    placeholder="e.g., 180lbs or 82kg"
                    placeholderTextColor={Colors.textTertiary}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.iconLabel}>
                    <Calendar size={18} color={Colors.accent} />
                    <Text style={styles.label}>Age (Optional)</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    value={age}
                    onChangeText={setAge}
                    placeholder="e.g., 25"
                    placeholderTextColor={Colors.textTertiary}
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.iconLabel}>
                    <Dumbbell size={18} color={Colors.accent} />
                    <Text style={styles.label}>Experience Level (Optional)</Text>
                  </View>
                  <View style={styles.experienceSelector}>
                    {['Beginner', 'Intermediate', 'Advanced'].map((level) => (
                      <TouchableOpacity
                        key={level}
                        style={[
                          styles.experienceOption,
                          experience === level && styles.experienceOptionActive,
                        ]}
                        onPress={() => setExperience(level)}
                      >
                        <Text
                          style={[
                            styles.experienceText,
                            experience === level && styles.experienceTextActive,
                          ]}
                        >
                          {level}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Upload Your Photo</Text>
              <Text style={styles.helpText}>
                Upload a photo of yourself to help AI analyze your current physique and create a tailored program
              </Text>

              {selectedImage ? (
                <View style={styles.imagePreviewContainer}>
                  <Image source={{ uri: selectedImage }} style={styles.imagePreview} />
                  <TouchableOpacity style={styles.removeImageBtn} onPress={handleRemoveImage}>
                    <X size={20} color={Colors.background} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.uploadBox} onPress={handlePickImage}>
                  <Upload size={48} color={Colors.textTertiary} />
                  <Text style={styles.uploadText}>Tap to upload photo</Text>
                  <Text style={styles.uploadSubtext}>JPEG or PNG</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.iconLabel}>
              <Target size={18} color={Colors.accent} />
              <Text style={styles.sectionTitle}>Your Goals</Text>
            </View>
            <Text style={styles.helpText}>
              Describe what you want to achieve (e.g., build muscle, lose fat, improve endurance, get stronger)
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={goals}
              onChangeText={setGoals}
              placeholder="e.g., I want to build lean muscle, lose 15lbs of fat, and improve my cardiovascular endurance. I can workout 5 days a week."
              placeholderTextColor={Colors.textTertiary}
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Program Duration (Days)</Text>
            <TextInput
              style={styles.input}
              value={programDays}
              onChangeText={setProgramDays}
              placeholder="90"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="numeric"
            />
            <Text style={styles.helpText}>Recommended: 30, 60, or 90 days</Text>
          </View>



          <TouchableOpacity
            style={[styles.generateBtn, isGenerating && styles.generateBtnDisabled]}
            onPress={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <ActivityIndicator size="small" color={Colors.background} />
                <Text style={styles.generateBtnText}>Generating...</Text>
              </>
            ) : (
              <>
                <Sparkles size={20} color={Colors.background} />
                <Text style={styles.generateBtnText}>Generate My Program</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: Colors.accent + '40',
  },
  title: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 16,
  },
  iconLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.text,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  helpText: {
    fontSize: 13,
    color: Colors.textTertiary,
    marginBottom: 12,
    lineHeight: 18,
  },
  methodSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  methodOption: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 20,
  },
  methodOptionActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.surfaceLight,
  },
  methodText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  methodTextActive: {
    color: Colors.accent,
    fontWeight: '700' as const,
  },
  uploadBox: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed' as const,
    borderRadius: 16,
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
    marginTop: 16,
  },
  uploadSubtext: {
    fontSize: 13,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  imagePreviewContainer: {
    position: 'relative',
    alignSelf: 'center',
    marginTop: 12,
  },
  imagePreview: {
    width: 200,
    height: 200,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  removeImageBtn: {
    position: 'absolute' as const,
    top: -8,
    right: -8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.danger,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  experienceSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  experienceOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  experienceOptionActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  experienceText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  experienceTextActive: {
    color: Colors.background,
    fontWeight: '700' as const,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#8B5CF6',
    paddingVertical: 18,
    borderRadius: 12,
    marginTop: 8,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  generateBtnDisabled: {
    opacity: 0.6,
  },
  generateBtnText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '800' as const,
    letterSpacing: 0.5,
  },
  warningCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  warningText: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '600' as const,
    lineHeight: 18,
  },
});
