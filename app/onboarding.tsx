import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Animated,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';

const FITNESS_GOALS = ['Lose Fat', 'Build Muscle', 'Get Stronger', 'Improve Endurance', 'General Fitness'];
const EXPERIENCE_LEVELS = ['Complete Beginner', 'Some Experience', 'Intermediate', 'Advanced', 'Elite'];

const TRAINER_SPECIALTIES = ['strength', 'cardio', 'hiit', 'nutrition', 'mobility', 'sports'] as const;
const TRAINER_EXPERIENCE_LEVELS = ['1-2 years', '3-5 years', '5-10 years', '10+ years'] as const;
type TrainerSpecialty = typeof TRAINER_SPECIALTIES[number];
type TrainerExperienceLevel = typeof TRAINER_EXPERIENCE_LEVELS[number];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, updateUserProfile } = useApp();

  const [step, setStep] = useState(0);
  const [role, setRole] = useState<'warrior' | 'trainer' | null>(null);
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState<'lbs' | 'kg'>(user?.weightUnit ?? 'lbs');
  const [goal, setGoal] = useState('');
  const [experience, setExperience] = useState('');
  const [waiverChecked, setWaiverChecked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Trainer-specific fields
  const [trainerSpecialty, setTrainerSpecialty] = useState<TrainerSpecialty | ''>('');
  const [trainerExperience, setTrainerExperience] = useState<TrainerExperienceLevel | ''>('');
  const [trainerBio, setTrainerBio] = useState('');
  const [trainerCertifications, setTrainerCertifications] = useState('');

  const crownScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (step === 3) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(crownScale, { toValue: 1.15, duration: 700, useNativeDriver: true }),
          Animated.timing(crownScale, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [step]);

  const canAdvance = () => {
    if (step === 0) return role !== null;
    if (step === 1) {
      if (role === 'trainer') return trainerSpecialty.length > 0 && trainerExperience.length > 0 && trainerBio.length > 0;
      return age.length > 0 && height.length > 0 && weight.length > 0 && goal.length > 0 && experience.length > 0;
    }
    if (step === 2) return waiverChecked;
    return true;
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  const handleFinish = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await updateUserProfile({
        age,
        height,
        weight,
        goal,
        weightUnit,
        isTrainer: role === 'trainer',
        ...(role === 'trainer' ? {
          trainerSpecialty,
          trainerBio,
          trainerExperience,
        } : {}),
      });
      await AsyncStorage.setItem('onboarding_complete', 'true');
      router.replace('/(tabs)' as any);
    } catch (e) {
      Alert.alert('Error', 'Could not save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Progress dots */}
      <View style={styles.dotsRow}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {step === 0 && <StepRole role={role} setRole={setRole} />}
        {step === 1 && role === 'warrior' && (
          <StepStats
            age={age} setAge={setAge}
            height={height} setHeight={setHeight}
            weight={weight} setWeight={setWeight}
            weightUnit={weightUnit} setWeightUnit={setWeightUnit}
            goal={goal} setGoal={setGoal}
            experience={experience} setExperience={setExperience}
          />
        )}
        {step === 1 && role === 'trainer' && (
          <StepTrainerProfile
            specialty={trainerSpecialty}
            setSpecialty={setTrainerSpecialty}
            experienceLevel={trainerExperience}
            setExperienceLevel={setTrainerExperience}
            bio={trainerBio}
            setBio={setTrainerBio}
            certifications={trainerCertifications}
            setCertifications={setTrainerCertifications}
          />
        )}
        {step === 2 && <StepWaiver checked={waiverChecked} setChecked={setWaiverChecked} />}
        {step === 3 && (
          <StepReady
            crownScale={crownScale}
            role={role}
            age={age}
            height={height}
            weight={weight}
            weightUnit={weightUnit}
            goal={goal}
            experience={experience}
            trainerSpecialty={trainerSpecialty}
            trainerBio={trainerBio}
            trainerExperience={trainerExperience}
            onFinish={handleFinish}
            isSaving={isSaving}
          />
        )}
      </ScrollView>

      {step < 3 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          {step > 0 && (
            <TouchableOpacity style={styles.backBtn} onPress={() => setStep(step - 1)}>
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.nextBtn, !canAdvance() && styles.nextBtnDisabled]}
            disabled={!canAdvance()}
            onPress={handleNext}
          >
            <Text style={styles.nextBtnText}>{step === 2 ? 'PROCEED' : 'NEXT'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function StepRole({ role, setRole }: { role: 'warrior' | 'trainer' | null; setRole: (r: 'warrior' | 'trainer') => void }) {
  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>I AM A...</Text>
      <TouchableOpacity
        style={[styles.roleCard, role === 'warrior' && styles.roleCardActive]}
        onPress={() => setRole('warrior')}
        activeOpacity={0.8}
      >
        <Text style={styles.roleEmoji}>💪</Text>
        <Text style={styles.roleLabel}>WARRIOR</Text>
        <Text style={styles.roleDesc}>I'm here to train, follow programs, and transform my body</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.roleCard, role === 'trainer' && styles.roleCardActive]}
        onPress={() => setRole('trainer')}
        activeOpacity={0.8}
      >
        <Text style={styles.roleEmoji}>⚔️</Text>
        <Text style={styles.roleLabel}>TRAINER</Text>
        <Text style={styles.roleDesc}>I create programs, coach clients, and build my fitness brand</Text>
      </TouchableOpacity>
      {role === 'trainer' && (
        <View style={styles.trainerNote}>
          <Text style={styles.trainerNoteText}>Trainer accounts require admin approval before you can publish programs</Text>
        </View>
      )}
    </View>
  );
}

function StepStats({
  age, setAge, height, setHeight, weight, setWeight,
  weightUnit, setWeightUnit, goal, setGoal, experience, setExperience
}: {
  age: string; setAge: (v: string) => void;
  height: string; setHeight: (v: string) => void;
  weight: string; setWeight: (v: string) => void;
  weightUnit: 'lbs' | 'kg'; setWeightUnit: (v: 'lbs' | 'kg') => void;
  goal: string; setGoal: (v: string) => void;
  experience: string; setExperience: (v: string) => void;
}) {
  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>BUILD YOUR PROFILE</Text>
      <TextInput
        style={styles.input}
        placeholder="Age"
        placeholderTextColor={Colors.textTertiary}
        keyboardType="numeric"
        value={age}
        onChangeText={setAge}
      />
      <TextInput
        style={styles.input}
        placeholder={`Height (e.g. 5'11" or 180cm)`}
        placeholderTextColor={Colors.textTertiary}
        value={height}
        onChangeText={setHeight}
      />
      <View style={styles.weightRow}>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          placeholder="Weight"
          placeholderTextColor={Colors.textTertiary}
          keyboardType="numeric"
          value={weight}
          onChangeText={setWeight}
        />
        <TouchableOpacity
          style={[styles.unitBtn, weightUnit === 'lbs' && styles.unitBtnActive]}
          onPress={() => setWeightUnit('lbs')}
        >
          <Text style={[styles.unitBtnText, weightUnit === 'lbs' && styles.unitBtnTextActive]}>lbs</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.unitBtn, weightUnit === 'kg' && styles.unitBtnActive]}
          onPress={() => setWeightUnit('kg')}
        >
          <Text style={[styles.unitBtnText, weightUnit === 'kg' && styles.unitBtnTextActive]}>kg</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>FITNESS GOAL</Text>
      <View style={styles.chipsRow}>
        {FITNESS_GOALS.map(g => (
          <TouchableOpacity
            key={g}
            style={[styles.chip, goal === g && styles.chipActive]}
            onPress={() => setGoal(g)}
          >
            <Text style={[styles.chipText, goal === g && styles.chipTextActive]}>{g}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>EXPERIENCE</Text>
      <View style={styles.chipsRow}>
        {EXPERIENCE_LEVELS.map(e => (
          <TouchableOpacity
            key={e}
            style={[styles.chip, experience === e && styles.chipActive]}
            onPress={() => setExperience(e)}
          >
            <Text style={[styles.chipText, experience === e && styles.chipTextActive]}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function StepTrainerProfile({
  specialty, setSpecialty, experienceLevel, setExperienceLevel, bio, setBio, certifications, setCertifications,
}: {
  specialty: string; setSpecialty: (v: TrainerSpecialty) => void;
  experienceLevel: string; setExperienceLevel: (v: TrainerExperienceLevel) => void;
  bio: string; setBio: (v: string) => void;
  certifications: string; setCertifications: (v: string) => void;
}) {
  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>YOUR TRAINER PROFILE</Text>

      <Text style={styles.sectionLabel}>SPECIALTY</Text>
      <View style={styles.chipsRow}>
        {TRAINER_SPECIALTIES.map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.chip, specialty === s && styles.chipActive]}
            onPress={() => setSpecialty(s)}
          >
            <Text style={[styles.chipText, specialty === s && styles.chipTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>YEARS OF EXPERIENCE</Text>
      <View style={styles.chipsRow}>
        {TRAINER_EXPERIENCE_LEVELS.map(e => (
          <TouchableOpacity
            key={e}
            style={[styles.chip, experienceLevel === e && styles.chipActive]}
            onPress={() => setExperienceLevel(e)}
          >
            <Text style={[styles.chipText, experienceLevel === e && styles.chipTextActive]}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>BIO</Text>
      <TextInput
        style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
        placeholder="Tell potential clients about yourself (2-3 sentences)"
        placeholderTextColor={Colors.textTertiary}
        value={bio}
        onChangeText={setBio}
        multiline
        numberOfLines={3}
      />

      <Text style={styles.sectionLabel}>CERTIFICATIONS (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. NASM-CPT, CSCS, ACE"
        placeholderTextColor={Colors.textTertiary}
        value={certifications}
        onChangeText={setCertifications}
      />
    </View>
  );
}

function StepWaiver({ checked, setChecked }: { checked: boolean; setChecked: (v: boolean) => void }) {
  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>BEFORE WE BEGIN</Text>
      <Text style={styles.waiverHeader}>⚠️ IMPORTANT DISCLAIMER</Text>
      <Text style={styles.waiverText}>
        {`Warfare Fitness and its trainers are not medical professionals. All workout programs and advice provided are for informational and educational purposes only and do not constitute medical advice.\n\nBy using this app you acknowledge:\n• You participate in all activities at your own risk\n• Warfare Fitness and its trainers accept no liability for injuries, illness, or adverse effects\n• You should consult a qualified medical professional before starting any exercise program\n• You must use common sense and caution at all times\n• This app does not replace professional medical, nutritional, or psychological advice\n• You are solely responsible for your own safety and wellbeing`}
      </Text>
      <TouchableOpacity style={styles.checkboxRow} onPress={() => setChecked(!checked)} activeOpacity={0.8}>
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked && <Text style={styles.checkboxTick}>✓</Text>}
        </View>
        <Text style={styles.checkboxLabel}>I have read, understood, and agree to the above disclaimer. I take full responsibility for my own safety.</Text>
      </TouchableOpacity>
    </View>
  );
}

function StepReady({
  crownScale, role, age, height, weight, weightUnit, goal, experience,
  trainerSpecialty, trainerBio, trainerExperience,
  onFinish, isSaving,
}: {
  crownScale: Animated.Value;
  role: 'warrior' | 'trainer' | null;
  age: string; height: string; weight: string; weightUnit: string;
  goal: string; experience: string;
  trainerSpecialty?: string; trainerBio?: string; trainerExperience?: string;
  onFinish: () => void;
  isSaving: boolean;
}) {
  return (
    <View style={[styles.stepContainer, { alignItems: 'center' }]}>
      <Text style={styles.stepTitle}>YOU'RE READY, SOLDIER</Text>
      <Text style={styles.readySubtitle}>Your mission begins now</Text>
      <Animated.Text style={[styles.crownIcon, { transform: [{ scale: crownScale }] }]}>👑</Animated.Text>
      <View style={styles.summaryCard}>
        <SummaryRow label="ROLE" value={role === 'trainer' ? '⚔️ Trainer' : '💪 Warrior'} />
        {role === 'trainer' ? (
          <>
            <SummaryRow label="SPECIALTY" value={trainerSpecialty ?? ''} />
            <SummaryRow label="EXPERIENCE" value={trainerExperience ?? ''} />
            <SummaryRow label="BIO" value={(trainerBio ?? '').slice(0, 60) + ((trainerBio?.length ?? 0) > 60 ? '…' : '')} />
          </>
        ) : (
          <>
            <SummaryRow label="AGE" value={age} />
            <SummaryRow label="HEIGHT" value={height} />
            <SummaryRow label="WEIGHT" value={`${weight} ${weightUnit}`} />
            <SummaryRow label="GOAL" value={goal} />
            <SummaryRow label="EXPERIENCE" value={experience} />
          </>
        )}
      </View>
      <TouchableOpacity style={styles.startBtn} onPress={onFinish} disabled={isSaving} activeOpacity={0.85}>
        <Text style={styles.startBtnText}>{isSaving ? 'DEPLOYING...' : 'START MY MISSION'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingTop: 16, paddingBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  dotActive: { backgroundColor: Colors.accent, width: 24 },
  scroll: { padding: 20, paddingBottom: 40 },
  stepContainer: { gap: 16 },
  stepTitle: { color: Colors.text, fontSize: 28, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  roleCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 20, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', gap: 8 },
  roleCardActive: { borderColor: Colors.accent },
  roleEmoji: { fontSize: 40 },
  roleLabel: { color: Colors.text, fontSize: 20, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  roleDesc: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', fontWeight: '500' },
  trainerNote: { backgroundColor: `${Colors.warning}20`, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.warning },
  trainerNoteText: { color: Colors.warning, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: Colors.text, fontSize: 15, marginBottom: 12 },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  unitBtn: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.surface },
  unitBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent },
  unitBtnText: { color: Colors.textSecondary, fontWeight: '700', fontSize: 14 },
  unitBtnTextActive: { color: Colors.background },
  sectionLabel: { color: Colors.textSecondary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4, marginBottom: 4 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipActive: { borderColor: Colors.accent, backgroundColor: `${Colors.accent}20` },
  chipText: { color: Colors.textSecondary, fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: Colors.accent },
  waiverHeader: { color: Colors.warning, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  waiverText: { color: Colors.text, fontSize: 15, lineHeight: 24, fontWeight: '400' },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 8 },
  checkbox: { width: 28, height: 28, borderRadius: 6, borderWidth: 3, borderColor: Colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxChecked: { backgroundColor: Colors.accent },
  checkboxTick: { color: Colors.background, fontWeight: '900', fontSize: 16 },
  checkboxLabel: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '600', lineHeight: 22 },
  readySubtitle: { color: Colors.textSecondary, fontSize: 16, fontWeight: '600', textAlign: 'center', marginTop: -8 },
  crownIcon: { fontSize: 80, textAlign: 'center', marginVertical: 16 },
  summaryCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, width: '100%', gap: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { color: Colors.textSecondary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  summaryValue: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  startBtn: { backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 18, alignItems: 'center', width: '100%', marginTop: 8 },
  startBtnText: { color: Colors.background, fontSize: 18, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  footer: { paddingHorizontal: 20, paddingTop: 8, flexDirection: 'row', gap: 12 },
  backBtn: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20 },
  backBtnText: { color: Colors.text, fontWeight: '800', fontSize: 15 },
  nextBtn: { flex: 1, backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: Colors.background, fontWeight: '900', fontSize: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
});
