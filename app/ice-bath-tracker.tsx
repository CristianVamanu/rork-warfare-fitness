import { useRouter } from 'expo-router';
import { Snowflake, ArrowLeft, Clock, Calendar, TrendingUp, Droplets } from 'lucide-react-native';
import { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';

export default function IceBathTrackerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { iceBaths } = useApp();

  const stats = useMemo(() => {
    const totalBaths = iceBaths.length;
    const totalMinutes = iceBaths.reduce((sum, bath) => sum + bath.durationMin, 0);
    const avgDuration = totalBaths > 0 ? Math.round(totalMinutes / totalBaths) : 0;

    const thisWeek = iceBaths.filter(bath => {
      const bathDate = new Date(bath.loggedAt);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return bathDate >= weekAgo;
    });

    const thisMonth = iceBaths.filter(bath => {
      const bathDate = new Date(bath.loggedAt);
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return bathDate >= monthAgo;
    });

    return {
      totalBaths,
      totalMinutes,
      avgDuration,
      thisWeek: thisWeek.length,
      thisMonth: thisMonth.length,
    };
  }, [iceBaths]);

  const recentBaths = useMemo(() => {
    return iceBaths.slice(0, 20).map(bath => {
      const date = new Date(bath.loggedAt);
      return {
        ...bath,
        dateStr: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        timeStr: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      };
    });
  }, [iceBaths]);

  return (
    <View style={[styles.background, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Snowflake size={24} color="#60A5FA" />
          <Text style={styles.headerTitle}>Ice Bath Tracker</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#DBEAFE' }]}>
              <Snowflake size={24} color="#60A5FA" />
            </View>
            <Text style={styles.statValue}>{stats.totalBaths}</Text>
            <Text style={styles.statLabel}>Total Baths</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#E0E7FF' }]}>
              <Clock size={24} color="#818CF8" />
            </View>
            <Text style={styles.statValue}>{stats.totalMinutes}</Text>
            <Text style={styles.statLabel}>Total Minutes</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#FEF3C7' }]}>
              <TrendingUp size={24} color="#F59E0B" />
            </View>
            <Text style={styles.statValue}>{stats.avgDuration}</Text>
            <Text style={styles.statLabel}>Avg Duration</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#D1FAE5' }]}>
              <Calendar size={24} color={Colors.success} />
            </View>
            <Text style={styles.statValue}>{stats.thisWeek}</Text>
            <Text style={styles.statLabel}>This Week</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Droplets size={20} color="#60A5FA" />
            <Text style={styles.sectionTitle}>Recent Sessions</Text>
          </View>

          {recentBaths.length === 0 && (
            <View style={styles.emptyState}>
              <Snowflake size={48} color={Colors.textTertiary} />
              <Text style={styles.emptyTitle}>No Ice Baths Yet</Text>
              <Text style={styles.emptyText}>Complete your first ice bath session to start tracking!</Text>
            </View>
          )}

          {recentBaths.length > 0 && (
            <View style={styles.bathList}>
              {recentBaths.map((bath) => (
                <View key={bath.id} style={styles.bathItem}>
                  <View style={styles.bathIconContainer}>
                    <Snowflake size={20} color="#60A5FA" />
                  </View>
                  <View style={styles.bathInfo}>
                    <Text style={styles.bathDuration}>{bath.durationMin} minutes</Text>
                    <Text style={styles.bathDate}>{bath.dateStr} at {bath.timeStr}</Text>
                  </View>
                  <View style={styles.bathBadge}>
                    <Text style={styles.bathBadgeText}>+15 ⚡</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🧊 Cold Exposure Benefits</Text>
          <Text style={styles.infoText}>
            • Reduces inflammation and muscle soreness{'\n'}
            • Boosts metabolism and fat burning{'\n'}
            • Enhances mental resilience{'\n'}
            • Improves circulation and recovery{'\n'}
            • Increases dopamine and alertness
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  container: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 12,
  },
  statCard: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  bathList: {
    gap: 10,
  },
  bathItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  bathIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bathInfo: {
    flex: 1,
  },
  bathDuration: {
    fontSize: 15,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 2,
  },
  bathDate: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  bathBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  bathBadgeText: {
    fontSize: 12,
    fontWeight: '800' as const,
    color: '#D97706',
  },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: '#DBEAFE',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: '#1E3A8A',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 22,
    fontWeight: '500' as const,
  },
});
