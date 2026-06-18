import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';
import { useTrainer } from '@/contexts/TrainerContext';
import { useApp } from '@/contexts/AppContext';
import { FontSize, FontWeight } from '@/constants/typography';

const CATEGORIES = [
  'strength', 'cardio', 'hiit', 'calisthenics',
  'yoga', 'mobility', 'powerlifting', 'bodybuilding',
] as const;
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced', 'elite'] as const;
const TRIAL_OPTIONS = [0, 3, 7, 14, 30];

type Category = typeof CATEGORIES[number];
type Difficulty = typeof DIFFICULTIES[number];

export default function CreateProgramScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { createProgram } = useTrainer();
  const { user } = useApp();

  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 3;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('strength');
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner');
  const [durationWeeks, setDurationWeeks] = useState('8');
  const [workoutsPerWeek, setWorkoutsPerWeek] = useState('4');
  const [price, setPrice] = useState('0');
  const [trialDays, setTrialDays] = useState(7);

  const handleNext = () => {
    if (step === 1 && (!title.trim() || !description.trim())) {
      Alert.alert('Missing Info', 'Please fill in title and description.');
      return;
    }
    if (step < TOTAL_STEPS) setStep(s => s + 1);
  };

  const handleSave = async (publish: boolean) => {
    if (!user) return;
    try {
      await createProgram({
        trainerId: user.id,
        trainerName: user.name || user.email,
        trainerAvatar: user.avatar,
        trainerBio: user.trainerBio,
        title,
        description,
        category,
        difficulty,
        durationWeeks: parseInt(durationWeeks) || 8,
        workoutsPerWeek: parseInt(workoutsPerWeek) || 4,
        price: parseFloat(price) || 0,
        trialDays,
        isPublished: publish,
        schedule: [],
        tags: [category, difficulty],
        coverImageUrl: undefined,
      });
      Alert.alert('Success!', publish ? 'Program published to marketplace!' : 'Program saved as draft.');
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save program. Please try again.');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (step > 1 ? setStep(s => s - 1) : router.back())}>
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CREATE PROGRAM</Text>
        <Text style={styles.stepText}>{step}/{TOTAL_STEPS}</Text>
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>BASIC INFO</Text>

            <Text style={styles.label}>Program Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Alpha Strength 8-Week"
              placeholderTextColor={Colors.textTertiary}
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your program..."
              placeholderTextColor={Colors.textTertiary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <Text style={styles.label}>Category</Text>
            <View style={styles.chipGrid}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.chip, category === cat && styles.chipActive]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Difficulty</Text>
            <View style={styles.chipGrid}>
              {DIFFICULTIES.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.chip, difficulty === d && styles.chipActive]}
                  onPress={() => setDifficulty(d)}
                >
                  <Text style={[styles.chipText, difficulty === d && styles.chipTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Duration (weeks)</Text>
                <TextInput
                  style={styles.input}
                  value={durationWeeks}
                  onChangeText={setDurationWeeks}
                  keyboardType="numeric"
                  placeholder="8"
                  placeholderTextColor={Colors.textTertiary}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Workouts/week</Text>
                <TextInput
                  style={styles.input}
                  value={workoutsPerWeek}
                  onChangeText={setWorkoutsPerWeek}
                  keyboardType="numeric"
                  placeholder="4"
                  placeholderTextColor={Colors.textTertiary}
                />
              </View>
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>PRICING & TRIAL</Text>

            <Text style={styles.label}>Monthly Price ($)</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              placeholder="0.00 = Free"
              placeholderTextColor={Colors.textTertiary}
            />
            <Text style={styles.hint}>Set to 0 for a completely free program.</Text>

            <Text style={styles.label}>Free Trial Days</Text>
            <View style={styles.chipGrid}>
              {TRIAL_OPTIONS.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.chip, trialDays === d && styles.chipActive]}
                  onPress={() => setTrialDays(d)}
                >
                  <Text style={[styles.chipText, trialDays === d && styles.chipTextActive]}>
                    {d === 0 ? 'No Trial' : `${d} Days`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.hint}>
              Users can try your program free for this many days before being asked to pay.
            </Text>
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>REVIEW & PUBLISH</Text>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>{title || 'Untitled Program'}</Text>
              <Text style={styles.summaryRow}>Category: <Text style={styles.summaryVal}>{category}</Text></Text>
              <Text style={styles.summaryRow}>Difficulty: <Text style={styles.summaryVal}>{difficulty}</Text></Text>
              <Text style={styles.summaryRow}>Duration: <Text style={styles.summaryVal}>{durationWeeks} weeks</Text></Text>
              <Text style={styles.summaryRow}>Workouts/week: <Text style={styles.summaryVal}>{workoutsPerWeek}</Text></Text>
              <Text style={styles.summaryRow}>
                Price: <Text style={styles.summaryVal}>{parseFloat(price) === 0 ? 'Free' : `$${price}/mo`}</Text>
              </Text>
              <Text style={styles.summaryRow}>
                Trial: <Text style={styles.summaryVal}>{trialDays === 0 ? 'No trial' : `${trialDays} days free`}</Text>
              </Text>
            </View>

            <TouchableOpacity style={styles.publishBtn} onPress={() => handleSave(true)} activeOpacity={0.85}>
              <LinearGradient colors={[Colors.accent, Colors.accentDark]} style={styles.publishBtnGradient}>
                <Check size={18} color="#000" />
                <Text style={styles.publishBtnText}>PUBLISH TO MARKETPLACE</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.draftBtn} onPress={() => handleSave(false)}>
              <Text style={styles.draftBtnText}>Save as Draft</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={{ height: 80 }} />
      </ScrollView>

      {step < TOTAL_STEPS && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
            <LinearGradient colors={[Colors.accent, Colors.accentDark]} style={styles.nextBtnGradient}>
              <Text style={styles.nextBtnText}>NEXT</Text>
              <ChevronRight size={18} color="#000" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: { color: Colors.text, fontWeight: FontWeight.black, fontSize: FontSize.lg, letterSpacing: 1.5 },
  stepText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  progressBar: { height: 3, backgroundColor: Colors.surface, marginHorizontal: 20, borderRadius: 2, marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: Colors.accent, borderRadius: 2 },
  content: { flex: 1, paddingHorizontal: 20 },
  stepContent: { paddingTop: 16 },
  stepTitle: {
    color: Colors.accent,
    fontWeight: FontWeight.black,
    fontSize: FontSize.md,
    letterSpacing: 2,
    marginBottom: 24,
  },
  label: { color: Colors.text, fontWeight: FontWeight.semibold, fontSize: FontSize.sm, marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    color: Colors.text,
    fontSize: FontSize.md,
  },
  textArea: { height: 100 },
  hint: { color: Colors.textTertiary, fontSize: FontSize.xs, marginTop: 6 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { color: Colors.textSecondary, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  chipTextActive: { color: '#000' },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
  },
  summaryTitle: { color: Colors.text, fontWeight: FontWeight.black, fontSize: FontSize.xl, marginBottom: 8 },
  summaryRow: { color: Colors.textSecondary, fontSize: FontSize.sm },
  summaryVal: { color: Colors.text, fontWeight: FontWeight.semibold },
  publishBtn: { borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  publishBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  publishBtnText: { color: '#000', fontWeight: FontWeight.black, fontSize: FontSize.md, letterSpacing: 0.5 },
  draftBtn: { alignItems: 'center', paddingVertical: 14 },
  draftBtnText: { color: Colors.textSecondary, fontSize: FontSize.md },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  nextBtn: { borderRadius: 12, overflow: 'hidden' },
  nextBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
  },
  nextBtnText: { color: '#000', fontWeight: FontWeight.black, fontSize: FontSize.md, letterSpacing: 1 },
});
