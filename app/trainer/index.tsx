import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Share, Platform, Modal, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus, Trash2, Eye, EyeOff, Users, DollarSign, TrendingUp, Zap, Link2, Copy, Crown, Check, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';
import { useTrainer } from '@/contexts/TrainerContext';
import { useApp } from '@/contexts/AppContext';
import { trpc } from '@/lib/trpc';
import { FontSize, FontWeight } from '@/constants/typography';
import * as Clipboard from 'expo-clipboard';

const PLANS = [
  {
    id: 'free' as const,
    name: 'Free',
    price: '$0',
    features: ['1 program', '5 clients max', 'Basic analytics'],
    color: Colors.textSecondary,
    maxClients: 5,
    maxPrograms: 1,
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    price: '$29/mo',
    features: ['Unlimited programs', '50 clients', 'AI workout generator', 'Invite link', 'Revenue share 70%'],
    color: Colors.accent,
    maxClients: 50,
    maxPrograms: 999,
  },
  {
    id: 'elite' as const,
    name: 'Elite',
    price: '$79/mo',
    features: ['Everything in Pro', 'Unlimited clients', 'Custom branding', 'Priority support', 'Revenue share 80%'],
    color: '#9b59b6',
    maxClients: 999,
    maxPrograms: 999,
  },
];

export default function TrainerDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { myPrograms, deleteProgram, updateProgram } = useTrainer();
  const { user, updateUserProfile } = useApp();
  const [showPlans, setShowPlans] = useState(false);
  const [copied, setCopied] = useState(false);

  const plan = user?.trainerPlan ?? 'free';
  const currentPlan = PLANS.find(p => p.id === plan) ?? PLANS[0];
  const inviteCode = user?.trainerInviteCode ?? user?.referralCode ?? user?.id?.slice(-6).toUpperCase() ?? 'XXXXXX';
  const inviteLink = `https://warfare.fitness/register?trainer=${inviteCode}`;

  // Register trainer's invite code on the server
  const registerCode = trpc.trainer.registerCode.useMutation();
  useEffect(() => {
    if (user?.isTrainer && user.id) {
      registerCode.mutate({
        trainerId: user.id,
        trainerName: user.name,
        inviteCode: inviteCode,
      });
    }
  }, [user?.id]);

  const { data: clientIds } = trpc.trainer.getClients.useQuery(
    { trainerId: user?.id ?? '' },
    { enabled: !!user?.id, refetchInterval: 30_000 }
  );

  const totalEnrolled = myPrograms.reduce((sum, p) => sum + p.totalEnrolled, 0);
  const revenueSplit = plan === 'elite' ? 0.80 : 0.70;
  const estimatedEarnings = myPrograms.reduce(
    (sum, p) => sum + p.price * p.totalEnrolled * revenueSplit,
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

  const copyInviteLink = async () => {
    await Clipboard.setStringAsync(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareInviteLink = async () => {
    try {
      await Share.share({ message: `Join my training on Warfare Fitness! Use my invite link: ${inviteLink}`, url: inviteLink });
    } catch {
      copyInviteLink();
    }
  };

  const upgradePlan = async (planId: 'free' | 'pro' | 'elite') => {
    if (planId === 'free') return;
    Alert.alert(
      `Upgrade to ${planId.charAt(0).toUpperCase() + planId.slice(1)}`,
      `This will unlock ${planId === 'pro' ? '50 clients and unlimited programs' : 'unlimited everything + custom branding'}.\n\nConnect Stripe in admin settings to enable billing.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate',
          onPress: async () => {
            await updateUserProfile({ trainerPlan: planId });
            setShowPlans(false);
          },
        },
      ]
    );
  };

  const canCreateMore = myPrograms.length < currentPlan.maxPrograms;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>TRAINER HQ</Text>
          <Text style={styles.headerSub}>Welcome back, {user?.name || 'Trainer'}</Text>
        </View>
        <TouchableOpacity onPress={() => setShowPlans(true)} style={styles.planBadge}>
          <Crown size={14} color={plan === 'elite' ? '#9b59b6' : plan === 'pro' ? Colors.accent : Colors.textSecondary} />
          <Text style={[styles.planBadgeText, { color: plan === 'elite' ? '#9b59b6' : plan === 'pro' ? Colors.accent : Colors.textSecondary }]}>
            {plan.toUpperCase()}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <TrendingUp size={18} color={Colors.accent} />
            <Text style={styles.statValue}>{myPrograms.length}</Text>
            <Text style={styles.statLabel}>Programs</Text>
          </View>
          <View style={styles.statCard}>
            <Users size={18} color={Colors.info} />
            <Text style={[styles.statValue, { color: Colors.info }]}>{clientIds?.length ?? 0}</Text>
            <Text style={styles.statLabel}>Clients</Text>
          </View>
          <View style={styles.statCard}>
            <DollarSign size={18} color={Colors.success} />
            <Text style={[styles.statValue, { color: Colors.success }]}>${estimatedEarnings.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Earnings</Text>
          </View>
        </View>

        {/* Invite Link Card */}
        <View style={styles.inviteCard}>
          <View style={styles.inviteHeader}>
            <Link2 size={18} color={Colors.accent} />
            <Text style={styles.inviteTitle}>YOUR INVITE LINK</Text>
          </View>
          <Text style={styles.inviteCode}>Code: <Text style={styles.inviteCodeValue}>{inviteCode}</Text></Text>
          <Text style={styles.inviteUrl} numberOfLines={1}>{inviteLink}</Text>
          <View style={styles.inviteBtns}>
            <TouchableOpacity style={styles.inviteBtn} onPress={copyInviteLink}>
              {copied ? <Check size={16} color={Colors.success} /> : <Copy size={16} color={Colors.background} />}
              <Text style={styles.inviteBtnText}>{copied ? 'Copied!' : 'Copy'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.inviteBtn, styles.inviteBtnShare]} onPress={shareInviteLink}>
              <Link2 size={16} color={Colors.accent} />
              <Text style={[styles.inviteBtnText, { color: Colors.accent }]}>Share</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.inviteHint}>Warriors who register with your link are automatically linked to you.</Text>
        </View>

        {/* Create Program */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.createBtn, !canCreateMore && styles.createBtnDisabled]}
            onPress={() => {
              if (!canCreateMore) {
                Alert.alert('Upgrade Required', `Your ${plan} plan allows ${currentPlan.maxPrograms} program(s). Upgrade to create more.`, [
                  { text: 'Upgrade', onPress: () => setShowPlans(true) },
                  { text: 'Cancel', style: 'cancel' },
                ]);
                return;
              }
              router.push('/trainer/create-program');
            }}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={canCreateMore ? [Colors.accent, Colors.accentDark] : [Colors.surface, Colors.surface]}
              style={styles.createBtnGradient}
            >
              <Plus size={20} color={canCreateMore ? '#000' : Colors.textSecondary} />
              <Text style={[styles.createBtnText, !canCreateMore && { color: Colors.textSecondary }]}>CREATE PROGRAM</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Programs list */}
          {myPrograms.length === 0 ? (
            <View style={styles.empty}>
              <Zap size={44} color={Colors.textTertiary} />
              <Text style={styles.emptyTitle}>No Programs Yet</Text>
              <Text style={styles.emptySub}>Create your first program and start building your audience.</Text>
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
        </View>

        {/* Clients */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MY CLIENTS</Text>
          {(clientIds?.length ?? 0) === 0 ? (
            <View style={styles.clientsEmpty}>
              <Users size={32} color={Colors.textTertiary} />
              <Text style={styles.clientsEmptyText}>No clients yet</Text>
              <Text style={styles.clientsEmptySub}>Share your invite link to bring clients in.</Text>
            </View>
          ) : (
            clientIds!.map(id => (
              <View key={id} style={styles.clientRow}>
                <View style={styles.clientAvatar}><Text style={styles.clientAvatarText}>{id.slice(0, 2).toUpperCase()}</Text></View>
                <Text style={styles.clientId}>Client {id.slice(-6)}</Text>
              </View>
            ))
          )}
          {plan === 'free' && (clientIds?.length ?? 0) >= 5 && (
            <TouchableOpacity style={styles.upgradeHint} onPress={() => setShowPlans(true)}>
              <Crown size={14} color={Colors.accent} />
              <Text style={styles.upgradeHintText}>Upgrade to Pro for up to 50 clients</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Plans Modal */}
      <Modal visible={showPlans} animationType="slide" transparent onRequestClose={() => setShowPlans(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>TRAINER PLANS</Text>
              <TouchableOpacity onPress={() => setShowPlans(false)}><X size={22} color={Colors.text} /></TouchableOpacity>
            </View>
            <ScrollView>
              {PLANS.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.planCard, plan === p.id && { borderColor: p.color }]}
                  onPress={() => upgradePlan(p.id)}
                  activeOpacity={0.85}
                >
                  <View style={styles.planHeader}>
                    <Text style={[styles.planName, { color: p.color }]}>{p.name}</Text>
                    <Text style={[styles.planPrice, { color: p.color }]}>{p.price}</Text>
                  </View>
                  {p.features.map(f => (
                    <View key={f} style={styles.planFeature}>
                      <Check size={13} color={p.color} />
                      <Text style={styles.planFeatureText}>{f}</Text>
                    </View>
                  ))}
                  {plan === p.id && (
                    <View style={[styles.currentBadge, { backgroundColor: p.color }]}>
                      <Text style={styles.currentBadgeText}>CURRENT</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle: { color: Colors.text, fontSize: FontSize.xxl, fontWeight: FontWeight.black, letterSpacing: 2 },
  headerSub: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
  planBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.surface, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border },
  planBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.black, letterSpacing: 1 },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Colors.border },
  statValue: { color: Colors.accent, fontWeight: FontWeight.black, fontSize: FontSize.xl },
  statLabel: { color: Colors.textSecondary, fontSize: FontSize.xs },
  inviteCard: { marginHorizontal: 16, marginBottom: 16, backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  inviteTitle: { color: Colors.text, fontSize: FontSize.sm, fontWeight: FontWeight.black, letterSpacing: 1.5 },
  inviteCode: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: 4 },
  inviteCodeValue: { color: Colors.accent, fontWeight: FontWeight.black },
  inviteUrl: { color: Colors.textTertiary, fontSize: FontSize.xs, marginBottom: 12 },
  inviteBtns: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  inviteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.accent, borderRadius: 10, paddingVertical: 10 },
  inviteBtnShare: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.accent },
  inviteBtnText: { color: Colors.background, fontWeight: FontWeight.bold, fontSize: FontSize.sm },
  inviteHint: { color: Colors.textTertiary, fontSize: FontSize.xs, textAlign: 'center' as const },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: FontWeight.black, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: 10 },
  createBtn: { marginBottom: 14, borderRadius: 12, overflow: 'hidden' },
  createBtnDisabled: { opacity: 0.6 },
  createBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  createBtnText: { color: '#000', fontWeight: FontWeight.black, fontSize: FontSize.md, letterSpacing: 1 },
  programCard: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  programInfo: { flex: 1 },
  programTitle: { color: Colors.text, fontWeight: FontWeight.bold, fontSize: FontSize.md },
  programMeta: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2 },
  programPrice: { color: Colors.accent, fontSize: FontSize.xs, marginTop: 4, fontWeight: FontWeight.semibold },
  programActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 6 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTitle: { color: Colors.text, fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  emptySub: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center' as const },
  clientsEmpty: { backgroundColor: Colors.surface, borderRadius: 12, padding: 20, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: Colors.border },
  clientsEmptyText: { color: Colors.text, fontWeight: FontWeight.semibold, fontSize: FontSize.md },
  clientsEmptySub: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center' as const },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  clientAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  clientAvatarText: { color: Colors.background, fontWeight: FontWeight.black, fontSize: FontSize.xs },
  clientId: { color: Colors.text, fontWeight: FontWeight.semibold },
  upgradeHint: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.accent, marginTop: 8 },
  upgradeHintText: { color: Colors.accent, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%', borderWidth: 1, borderColor: Colors.border },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { color: Colors.text, fontSize: FontSize.xl, fontWeight: FontWeight.black, letterSpacing: 2 },
  planCard: { backgroundColor: Colors.background, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: Colors.border },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  planName: { fontSize: FontSize.lg, fontWeight: FontWeight.black },
  planPrice: { fontSize: FontSize.lg, fontWeight: FontWeight.black },
  planFeature: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  planFeatureText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  currentBadge: { alignSelf: 'flex-start' as const, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 8 },
  currentBadgeText: { color: '#000', fontSize: FontSize.xs, fontWeight: FontWeight.black },
});
