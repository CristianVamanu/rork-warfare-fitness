import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ShoppingBag, Star, Users, Clock, ChevronRight } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useTrainer, TrainerProgram } from '@/contexts/TrainerContext';
import { FontSize, FontWeight } from '@/constants/typography';

const CATEGORIES = ['All', 'Strength', 'Cardio', 'HIIT', 'Calisthenics', 'Yoga', 'Powerlifting', 'Bodybuilding'];

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: Colors.success,
  intermediate: Colors.warning,
  advanced: Colors.danger,
  elite: Colors.accent,
};

export default function MarketplaceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { publishedPrograms, getUserAccess } = useTrainer();
  const [selectedCategory, setSelectedCategory] = useState('All');

  const filtered = useMemo(() => {
    if (selectedCategory === 'All') return publishedPrograms;
    return publishedPrograms.filter(
      p => p.category.toLowerCase() === selectedCategory.toLowerCase()
    );
  }, [publishedPrograms, selectedCategory]);

  const renderProgram = ({ item }: { item: TrainerProgram }) => {
    const access = getUserAccess(item.id);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => router.push(`/program-detail/${item.id}`)}
      >
        <View style={styles.cardImageContainer}>
          {item.coverImageUrl ? (
            <Image source={{ uri: item.coverImageUrl }} style={styles.cardImage} contentFit="cover" />
          ) : (
            <LinearGradient colors={['#1A1A1A', '#2A2A2A']} style={styles.cardImage} />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.9)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.cardBadgeRow}>
            <View style={[styles.diffBadge, {
              backgroundColor: DIFFICULTY_COLORS[item.difficulty] + '33',
              borderColor: DIFFICULTY_COLORS[item.difficulty],
            }]}>
              <Text style={[styles.diffBadgeText, { color: DIFFICULTY_COLORS[item.difficulty] }]}>
                {item.difficulty.toUpperCase()}
              </Text>
            </View>
            {item.trialDays > 0 && !access.isPaid && !access.trialExpired && !access.isInTrial && (
              <View style={styles.trialBadge}>
                <Text style={styles.trialBadgeText}>{item.trialDays}D FREE</Text>
              </View>
            )}
            {access.isInTrial && (
              <View style={[styles.trialBadge, { backgroundColor: Colors.info + '33', borderColor: Colors.info }]}>
                <Text style={[styles.trialBadgeText, { color: Colors.info }]}>{access.trialDaysLeft}D LEFT</Text>
              </View>
            )}
            {access.isPaid && (
              <View style={[styles.trialBadge, { backgroundColor: Colors.success + '33', borderColor: Colors.success }]}>
                <Text style={[styles.trialBadgeText, { color: Colors.success }]}>OWNED</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{item.title.toUpperCase()}</Text>
          <Text style={styles.cardTrainer}>by {item.trainerName}</Text>
          <View style={styles.cardMeta}>
            <View style={styles.metaItem}>
              <Clock size={12} color={Colors.textSecondary} />
              <Text style={styles.metaText}>{item.durationWeeks}w</Text>
            </View>
            <View style={styles.metaItem}>
              <Users size={12} color={Colors.textSecondary} />
              <Text style={styles.metaText}>{item.totalEnrolled}</Text>
            </View>
            {item.rating > 0 && (
              <View style={styles.metaItem}>
                <Star size={12} color={Colors.accent} fill={Colors.accent} />
                <Text style={styles.metaText}>{item.rating.toFixed(1)}</Text>
              </View>
            )}
          </View>
          <View style={styles.cardFooter}>
            <Text style={styles.priceText}>
              {item.price === 0 ? 'FREE' : `$${item.price.toFixed(2)}/mo`}
            </Text>
            <View style={styles.viewBtn}>
              <Text style={styles.viewBtnText}>VIEW</Text>
              <ChevronRight size={14} color={Colors.accent} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>MARKETPLACE</Text>
          <Text style={styles.headerSub}>Programs by certified trainers</Text>
        </View>
        <ShoppingBag size={24} color={Colors.accent} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryContent}
      >
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.catChip, selectedCategory === cat && styles.catChipActive]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text style={[styles.catChipText, selectedCategory === cat && styles.catChipTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <ShoppingBag size={48} color={Colors.textTertiary} />
          <Text style={styles.emptyTitle}>No Programs Yet</Text>
          <Text style={styles.emptySub}>
            Trainers haven't published programs in this category yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderProgram}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
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
  headerTitle: {
    color: Colors.text,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    letterSpacing: 2,
  },
  headerSub: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
  categoryScroll: { maxHeight: 52 },
  categoryContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  catChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  catChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  catChipText: { color: Colors.textSecondary, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  catChipTextActive: { color: '#000' },
  list: { padding: 16, gap: 16 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardImageContainer: { height: 180, position: 'relative' },
  cardImage: { width: '100%', height: '100%' },
  cardBadgeRow: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 8 },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, borderWidth: 1 },
  diffBadgeText: { fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  trialBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    backgroundColor: Colors.accent + '33',
    borderColor: Colors.accent,
  },
  trialBadgeText: { fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.5, color: Colors.accent },
  cardBody: { padding: 16 },
  cardTitle: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.black,
    letterSpacing: 1,
    marginBottom: 2,
  },
  cardTrainer: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: 10 },
  cardMeta: { flexDirection: 'row', gap: 14, marginBottom: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: Colors.textSecondary, fontSize: FontSize.xs },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceText: { color: Colors.accent, fontWeight: FontWeight.black, fontSize: FontSize.lg },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewBtnText: { color: Colors.accent, fontWeight: FontWeight.bold, fontSize: FontSize.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle: { color: Colors.text, fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  emptySub: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center' },
});
