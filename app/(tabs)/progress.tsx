import { useRouter } from 'expo-router';
import { TrendingUp, Flame, Target, Award, Calendar, Zap, User } from 'lucide-react-native';
import { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, Dimensions, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useTraining } from '@/contexts/TrainingContext';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { powerLevel, streak, missions, powerMetrics } = useApp();
  const { activeProgram, getOverallProgress } = useTraining();
  
  const missionsCompleted = useMemo(
    () => missions.filter(m => m.completed).length,
    [missions]
  );
  const totalWorkouts = powerMetrics.totalWorkoutsCompleted;
  
  const progress = getOverallProgress();
  
  const weekProgress = useMemo(() => {
    if (!activeProgram) {
      return Array.from({ length: 7 }, (_, i) => ({
        day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
        status: 'empty' as 'completed' | 'missed' | 'rest' | 'empty',
      }));
    }
    
    const today = new Date();
    const currentDay = progress.day;
    const result: Array<{ day: string; status: 'completed' | 'missed' | 'rest' | 'empty' }> = [];
    
    const todayDayOfWeek = today.getDay();
    const daysFromMonday = todayDayOfWeek === 0 ? 6 : todayDayOfWeek - 1;
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - daysFromMonday + i);
      const dayOfWeek = date.getDay();
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek];
      
      const daysSinceStart = activeProgram.startDate 
        ? Math.floor((date.getTime() - new Date(activeProgram.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
        : 0;
      
      if (daysSinceStart < 1 || daysSinceStart > activeProgram.days) {
        result.push({ day: dayName, status: 'empty' });
        continue;
      }
      
      const scheduleEntry = activeProgram.schedule.find(s => s.day === daysSinceStart);
      
      if (!scheduleEntry) {
        result.push({ day: dayName, status: 'empty' });
        continue;
      }
      
      if (scheduleEntry.workout === null) {
        result.push({ day: dayName, status: 'rest' });
        continue;
      }
      
      const isCompleted = activeProgram.completedDays[daysSinceStart] === true;
      const isPastDay = daysSinceStart < currentDay;
      
      if (isCompleted) {
        result.push({ day: dayName, status: 'completed' });
      } else if (isPastDay) {
        result.push({ day: dayName, status: 'missed' });
      } else {
        result.push({ day: dayName, status: 'empty' });
      }
    }
    
    return result;
  }, [activeProgram, progress]);

  const stats = [
    {
      id: '1',
      icon: Zap,
      label: 'Power Level',
      value: powerLevel.toString(),
      subtitle: `Level ${Math.floor(powerLevel / 100) + 1}`,
      color: Colors.accent,
    },
    {
      id: '2',
      icon: Flame,
      label: 'Current Streak',
      value: `${streak}`,
      subtitle: 'Days in a row',
      color: Colors.warning,
    },
    {
      id: '3',
      icon: Target,
      label: 'Missions',
      value: missionsCompleted.toString(),
      subtitle: 'Completed',
      color: Colors.success,
    },
    {
      id: '4',
      icon: Award,
      label: 'Total Workouts',
      value: totalWorkouts.toString(),
      subtitle: 'All time',
      color: Colors.accent,
    },
  ];



  const achievements = useMemo(() => {
    const eliteMissionsTotal = missions.filter(m => m.difficulty === 'Elite').length;
    const eliteMissionsCompleted = missions.filter(m => m.difficulty === 'Elite' && m.completed).length;
    
    return [
      {
        id: '1',
        title: 'First Mission',
        description: 'Complete your first mission',
        unlocked: missionsCompleted >= 1,
        icon: '🎯',
      },
      {
        id: '2',
        title: '7 Day Warrior',
        description: 'Maintain a 7-day streak',
        unlocked: streak >= 7,
        icon: '🔥',
      },
      {
        id: '3',
        title: 'Power Level 300',
        description: 'Reach Power Level 300',
        unlocked: powerLevel >= 300,
        icon: '⚡',
      },
      {
        id: '4',
        title: 'Elite Commander',
        description: 'Complete all elite missions',
        unlocked: eliteMissionsTotal > 0 && eliteMissionsCompleted === eliteMissionsTotal,
        icon: '👑',
      },
      {
        id: '5',
        title: 'Workout Warrior',
        description: 'Complete 10 workouts',
        unlocked: totalWorkouts >= 10,
        icon: '💪',
      },
      {
        id: '6',
        title: 'Century Club',
        description: 'Reach Power Level 100',
        unlocked: powerLevel >= 100,
        icon: '🎖️',
      },
    ];
  }, [missionsCompleted, streak, powerLevel, missions, totalWorkouts]);

  return (
    <View style={[styles.background, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Mission Log</Text>
          <Text style={styles.headerSubtitle}>Track your warrior journey</Text>
        </View>
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => router.push('/profile' as any)}
        >
          <User size={20} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.statsGrid}>
          {stats.map((stat) => {
            const IconComponent = stat.icon;
            return (
              <View key={stat.id} style={[styles.statCard, { width: CARD_WIDTH }]}>
                <View style={[styles.statIcon, { backgroundColor: `${stat.color}20` }]}>
                  <IconComponent size={24} color={stat.color} />
                </View>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={styles.statSubtitle}>{stat.subtitle}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Calendar size={20} color={Colors.accent} />
            <Text style={styles.sectionTitle}>Week Progress</Text>
          </View>
          <View style={styles.weekContainer}>
            {weekProgress.map((item, index) => (
              <View key={index} style={styles.dayColumn}>
                <View
                  style={[
                    styles.dayIndicator,
                    item.status === 'completed' && styles.dayIndicatorCompleted,
                    item.status === 'rest' && styles.dayIndicatorRest,
                    item.status === 'missed' && styles.dayIndicatorMissed,
                  ]}
                >
                  {item.status === 'completed' && <Text style={styles.statusEmoji}>✅</Text>}
                  {item.status === 'missed' && <Text style={styles.statusEmoji}>❌</Text>}
                  {item.status === 'rest' && <Text style={styles.statusEmoji}>🛏️</Text>}
                </View>
                <Text style={styles.dayLabel}>{item.day}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <TrendingUp size={20} color={Colors.accent} />
            <Text style={styles.sectionTitle}>Power Level Progress</Text>
          </View>
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressValue}>{powerLevel}</Text>
              <Text style={styles.progressTarget}>/ 400</Text>
            </View>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarFill, { width: `${(powerLevel / 400) * 100}%` }]} />
            </View>
            <Text style={styles.progressSubtext}>
              {400 - powerLevel} points to next level
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Award size={20} color={Colors.accent} />
            <Text style={styles.sectionTitle}>Achievements</Text>
          </View>
          <View style={styles.achievementsGrid}>
            {achievements.map((achievement) => (
              <View
                key={achievement.id}
                style={[
                  styles.achievementCard,
                  !achievement.unlocked && styles.achievementCardLocked,
                ]}
              >
                <View style={styles.achievementIconContainer}>
                  <Text style={styles.achievementIcon}>{achievement.icon}</Text>
                  {!achievement.unlocked && <View style={styles.achievementLock} />}
                </View>
                <Text style={[styles.achievementTitle, !achievement.unlocked && styles.achievementTitleLocked]}>
                  {achievement.title}
                </Text>
                <Text style={styles.achievementDescription}>{achievement.description}</Text>
              </View>
            ))}
          </View>
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
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800' as const,
    color: Colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  container: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
  },
  statCard: {
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
    marginBottom: 2,
  },
  statSubtitle: {
    fontSize: 10,
    color: Colors.textTertiary,
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
  weekContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'space-between',
  },
  dayColumn: {
    alignItems: 'center',
    gap: 12,
  },
  dayIndicator: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayIndicatorCompleted: {
    backgroundColor: '#DCFCE7',
    borderColor: Colors.success,
  },
  dayIndicatorMissed: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  dayIndicatorRest: {
    backgroundColor: '#E0E7FF',
    borderColor: '#818CF8',
  },
  statusEmoji: {
    fontSize: 20,
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  progressCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  progressValue: {
    fontSize: 36,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  progressTarget: {
    fontSize: 20,
    fontWeight: '600' as const,
    color: Colors.textTertiary,
    marginLeft: 4,
  },
  progressBarContainer: {
    height: 12,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 6,
  },
  progressSubtext: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  achievementCard: {
    width: (width - 44) / 2,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  achievementCardLocked: {
    opacity: 0.5,
  },
  achievementIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    position: 'relative' as const,
  },
  achievementIcon: {
    fontSize: 32,
  },
  achievementLock: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 32,
  },
  achievementTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  achievementTitleLocked: {
    color: Colors.textSecondary,
  },
  achievementDescription: {
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 16,
  },
});
