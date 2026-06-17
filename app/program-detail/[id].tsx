import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft, Clock, Users, Star, Zap, Lock,
  CheckCircle, ChevronDown, ChevronUp,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useTrainer } from '@/contexts/TrainerContext';
import { FontSize, FontWeight } from '@/constants/typography';
import ProgramLockScreen from '@/components/ProgramLockScreen';

export default function ProgramDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { publishedPrograms, getUserAccess, startTrial, purchaseProgram } = useTrainer();
  const [expandedWeek, setExpandedWeek] = useState<number | null>(1);
  const [showLockScreen, setShowLockScreen] = useState(false);

  const program = publishedPrograms.find(p => p.id === id);

  if (!program) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.notFound}>Program not found</Text>
      </View>
    );
  }

  const access = getUserAccess(program.id);

  const handleEnroll = async () => {
    if (access.trialExpired) {
      setShowLockScreen(true);
      return;
    }
    if (program.trialDays > 0 && !access.isInTrial && !access.isPaid) {
      await startTrial(program.id, program.trialDays);
      Alert.alert('Trial Started!', `You have ${program.trialDays} days to explore this program for free.`);
    }
  };

  const handlePurchase = async () => {
    setShowLockScreen(false);
    Alert.alert(
      'Purchase Program',
      `Unlock "${program.title}" for $${program.price.toFixed(2)}/mo?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Purchase',
          onPress: async () => {
            await purchaseProgram(program.id, program.price);
            Alert.alert('Success!', 'You now have full access to this program.');
          },
        },
      ]
    );
  };

  const weeks = Array.from(new Set(program.schedule.map(d => d.weekNumber))).sort((a, b) => a - b);

  const getActionButton = () => {
    if (access.isPaid)
      return { label: 'CONTINUE PROGRAM', color: Colors.success, icon: <CheckCircle size={18} color="#000" /> };
    if (access.isInTrial)
      return { label: `CONTINUE — ${access.trialDaysLeft}D LEFT`, color: Colors.info, icon: <Zap size={18} color="#000" /> };
    if (access.trialExpired)
      return { label: 'UNLOCK FULL PROGRAM', color: Colors.accent, icon: <Lock size={18} color="#000" /> };
    if (program.trialDays > 0)
      return { label: `START ${program.trialDays}-DAY FREE TRIAL`, color: Colors.accent, icon: <Zap size={18} color="#000" /> };
    return {
      label: program.price === 0 ? 'ENROLL FREE' : `UNLOCK — $${program.price.toFixed(2)}/mo`,
      color: Colors.accent,
      icon: <Lock size={18} color="#000" />,
    };
  };

  const btn = getActionButton();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.heroContainer}>
          {program.coverImageUrl ? (
            <Image source={{ uri: program.coverImageUrl }} style={styles.heroImage} contentFit="cover" />
          ) : (
            <LinearGradient colors={['#1A1A1A', '#2A2A2A']} style={styles.heroImage} />
          )}
          <LinearGradient colors={['rgba(0,0,0,0.3)', Colors.background]} style={StyleSheet.absoluteFill} />
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>{program.title.toUpperCase()}</Text>
          <Text style={styles.trainerName}>by {program.trainerName}</Text>

          {program.trainerBio ? (
            <Text style={styles.trainerBio}>{program.trainerBio}</Text>
          ) : null}

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Clock size={16} color={Colors.accent} />
              <Text style={styles.statValue}>{program.durationWeeks}w</Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Zap size={16} color={Colors.accent} />
              <Text style={styles.statValue}>{program.workoutsPerWeek}x</Text>
              <Text style={styles.statLabel}>Per week</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Users size={16} color={Colors.accent} />
              <Text style={styles.statValue}>{program.totalEnrolled}</Text>
              <Text style={styles.statLabel}>Enrolled</Text>
            </View>
            {program.rating > 0 && (
              <>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Star size={16} color={Colors.accent} fill={Colors.accent} />
                  <Text style={styles.statValue}>{program.rating.toFixed(1)}</Text>
                  <Text style={styles.statLabel}>Rating</Text>
                </View>
              </>
            )}
          </View>

          <Text style={styles.description}>{program.description}</Text>

          {weeks.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>PROGRAM SCHEDULE</Text>
              {weeks.map(week => {
                const weekDays = program.schedule.filter(d => d.weekNumber === week);
                const isExpanded = expandedWeek === week;
                return (
                  <View key={week} style={styles.weekContainer}>
                    <TouchableOpacity
                      style={styles.weekHeader}
                      onPress={() => setExpandedWeek(isExpanded ? null : week)}
                    >
                      <Text style={styles.weekTitle}>WEEK {week}</Text>
                      {isExpanded
                        ? <ChevronUp size={18} color={Colors.textSecondary} />
                        : <ChevronDown size={18} color={Colors.textSecondary} />}
                    </TouchableOpacity>
                    {isExpanded && weekDays.map(day => (
                      <View key={day.day} style={[styles.dayRow, day.isRestDay && styles.dayRowRest]}>
                        <Text style={styles.dayNum}>Day {day.day}</Text>
                        <View style={styles.dayInfo}>
                          <Text style={[styles.dayName, day.isRestDay && { color: Colors.textSecondary }]}>
                            {day.isRestDay ? 'Rest Day' : day.workoutName}
                          </Text>
                          {!day.isRestDay && (
                            <Text style={styles.dayMeta}>
                              {day.exercises.length} exercises · {day.durationMin}min
                            </Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })}
            </>
          )}

          <View style={{ height: 120 }} />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: btn.color }]}
          onPress={access.trialExpired ? () => setShowLockScreen(true) : handleEnroll}
          activeOpacity={0.85}
        >
          {btn.icon}
          <Text style={styles.actionBtnText}>{btn.label}</Text>
        </TouchableOpacity>
      </View>

      {program && (
        <ProgramLockScreen
          program={program}
          visible={showLockScreen}
          onPurchase={handlePurchase}
          onClose={() => setShowLockScreen(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  heroContainer: { height: 280, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  backBtn: {
    position: 'absolute',
    left: 16,
    top: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
  content: { padding: 20 },
  title: {
    color: Colors.text,
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.black,
    letterSpacing: 1.5,
    lineHeight: 36,
  },
  trainerName: { color: Colors.textSecondary, fontSize: FontSize.md, marginTop: 4, marginBottom: 8 },
  trainerBio: { color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 20, marginBottom: 20 },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginVertical: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { color: Colors.text, fontWeight: FontWeight.bold, fontSize: FontSize.lg },
  statLabel: { color: Colors.textSecondary, fontSize: FontSize.xs },
  statDivider: { width: 1, height: 40, backgroundColor: Colors.border },
  description: { color: Colors.textSecondary, fontSize: FontSize.md, lineHeight: 24, marginBottom: 24 },
  sectionTitle: {
    color: Colors.text,
    fontWeight: FontWeight.black,
    fontSize: FontSize.md,
    letterSpacing: 2,
    marginBottom: 12,
  },
  weekContainer: {
    marginBottom: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  weekTitle: { color: Colors.text, fontWeight: FontWeight.bold, fontSize: FontSize.md, letterSpacing: 1 },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 14,
  },
  dayRowRest: { opacity: 0.5 },
  dayNum: { color: Colors.accent, fontWeight: FontWeight.bold, fontSize: FontSize.sm, width: 40 },
  dayInfo: { flex: 1 },
  dayName: { color: Colors.text, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  dayMeta: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnText: { color: '#000', fontWeight: FontWeight.black, fontSize: FontSize.md, letterSpacing: 0.5 },
  notFound: { color: Colors.textSecondary, textAlign: 'center', marginTop: 60, fontSize: FontSize.lg },
});
