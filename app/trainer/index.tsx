import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus, Edit2, Trash2, Eye, EyeOff, Users, DollarSign, TrendingUp, Zap } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';
import { useTrainer } from '@/contexts/TrainerContext';
import { useApp } from '@/contexts/AppContext';
import { FontSize, FontWeight } from '@/constants/typography';

export default function TrainerDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { myPrograms, deleteProgram, updateProgram } = useTrainer();
  const { user } = useApp();

  const totalEnrolled = myPrograms.reduce((sum, p) => sum + p.totalEnrolled, 0);
  const estimatedEarnings = myPrograms.reduce(
    (sum, p) => sum + p.price * p.totalEnrolled * ((user?.trainerRevenueSplit ?? 70) / 100),
    0
  );

  const handleDelete = (id: string, title: string) => {
    Alert.alert('Delete Program', `Delete "${title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteProgram(id) },
    ]);
  };

  const togglePublish = async (id: string, current: boolean) => {
    await updateProgram(id, { isPublished: !current });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>TRAINER HQ</Text>
          <Text style={styles.headerSub}>Welcome back, {user?.name || 'Trainer'}</Text>
        </View>
        <Zap size={26} color={Colors.accent} />
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <TrendingUp size={18} color={Colors.accent} />
          <Text style={styles.statValue}>{myPrograms.length}</Text>
          <Text style={styles.statLabel}>Programs</Text>
        </View>
        <View style={styles.statCard}>
          <Users size={18} color={Colors.info} />
          <Text style={[styles.statValue, { color: Colors.info }]}>{totalEnrolled}</Text>
          <Text style={styles.statLabel}>Enrolled</Text>
        </View>
        <View style={styles.statCard}>
          <DollarSign size={18} color={Colors.success} />
          <Text style={[styles.statValue, { color: Colors.success }]}>${estimatedEarnings.toFixed(0)}</Text>
          <Text style={styles.statLabel}>Est. Earnings</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.createBtn}
        onPress={() => router.push('/trainer/create-program')}
        activeOpacity={0.85}
      >
        <LinearGradient colors={[Colors.accent, Colors.accentDark]} style={styles.createBtnGradient}>
          <Plus size={20} color="#000" />
          <Text style={styles.createBtnText}>CREATE PROGRAM</Text>
        </LinearGradient>
      </TouchableOpacity>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {myPrograms.length === 0 ? (
          <View style={styles.empty}>
            <Zap size={44} color={Colors.textTertiary} />
            <Text style={styles.emptyTitle}>No Programs Yet</Text>
            <Text style={styles.emptySub}>
              Create your first program and start building your audience.
            </Text>
          </View>
        ) : (
          myPrograms.map(program => (
            <View key={program.id} style={styles.programCard}>
              <View style={styles.programInfo}>
                <Text style={styles.programTitle}>{program.title}</Text>
                <Text style={styles.programMeta}>
                  {program.durationWeeks}w · {program.totalEnrolled} enrolled · {program.isPublished ? 'Published' : 'Draft'}
                </Text>
                <Text style={styles.programPrice}>
                  {program.price === 0 ? 'Free' : `$${program.price.toFixed(2)}/mo`} · {program.trialDays}d trial
                </Text>
              </View>
              <View style={styles.programActions}>
                <TouchableOpacity onPress={() => togglePublish(program.id, program.isPublished)} style={styles.iconBtn}>
                  {program.isPublished
                    ? <EyeOff size={18} color={Colors.textSecondary} />
                    : <Eye size={18} color={Colors.success} />}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(program.id, program.title)} style={styles.iconBtn}>
                  <Trash2 size={18} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
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
  headerTitle: { color: Colors.text, fontSize: FontSize.xxl, fontWeight: FontWeight.black, letterSpacing: 2 },
  headerSub: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: { color: Colors.accent, fontWeight: FontWeight.black, fontSize: FontSize.xl },
  statLabel: { color: Colors.textSecondary, fontSize: FontSize.xs },
  createBtn: { marginHorizontal: 16, marginBottom: 20, borderRadius: 12, overflow: 'hidden' },
  createBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  createBtnText: { color: '#000', fontWeight: FontWeight.black, fontSize: FontSize.md, letterSpacing: 1 },
  list: { flex: 1, paddingHorizontal: 16 },
  programCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  programInfo: { flex: 1 },
  programTitle: { color: Colors.text, fontWeight: FontWeight.bold, fontSize: FontSize.md },
  programMeta: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2 },
  programPrice: { color: Colors.accent, fontSize: FontSize.xs, marginTop: 4, fontWeight: FontWeight.semibold },
  programActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 6 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { color: Colors.text, fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  emptySub: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center' },
});
