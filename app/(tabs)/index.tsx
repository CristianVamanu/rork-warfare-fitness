import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Users, Activity, Zap, Check, Dumbbell, Droplets, UtensilsCrossed, Settings, User, Clock, Snowflake, Medal, TrendingUp, Trophy, Bell, Calendar, ScanBarcode, ShoppingBag, Coffee, Ban, Timer } from 'lucide-react-native';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Animated, Alert, Modal, TextInput, Dimensions, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRef, useEffect, useState } from 'react';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useTraining } from '@/contexts/TrainingContext';
import { useRanking } from '@/contexts/RankingContext';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useDaysWithout } from '@/contexts/DaysWithoutContext';
import ExternalLinkDisclosure from '@/components/ExternalLinkDisclosure';



export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, streak, powerLevel, hydrationMl, hydrationTargetMl, addWater, updateHydrationTarget, resetHydration, powerMetrics, fastingState, startFasting, endFasting, logIceBathEntry, adminSettings } = useApp();
  const { workoutLogs, activeProgram, getOverallProgress, programs } = useTraining();
  const { getUnreadCount } = useNotifications();
  const { challenges, getTimeElapsed } = useDaysWithout();
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetInput, setTargetInput] = useState(String(hydrationTargetMl));
  const [showFastingModal, setShowFastingModal] = useState(false);
  const [fastingHours, setFastingHours] = useState('16');
  const [fastingTimeElapsed, setFastingTimeElapsed] = useState(0);
  const [showIceBathModal, setShowIceBathModal] = useState(false);
  const [iceBathMinutes, setIceBathMinutes] = useState('');
  const [showIceBathTimer, setShowIceBathTimer] = useState(false);
  const [iceBathTimerSeconds, setIceBathTimerSeconds] = useState(0);
  const [showCountdownModal, setShowCountdownModal] = useState(false);
  const [countdownMinutes, setCountdownMinutes] = useState('3');
  const [countdownTotalSeconds, setCountdownTotalSeconds] = useState(0);
  const [countdownRemainingSeconds, setCountdownRemainingSeconds] = useState(0);
  const [isCountdownActive, setIsCountdownActive] = useState(false);
  const [alarmTriggered, setAlarmTriggered] = useState(false);
  const [showCoffeeDisclosure, setShowCoffeeDisclosure] = useState(false);
  const [daysWithoutTime, setDaysWithoutTime] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  const handleEditTarget = () => {
    setTargetInput(String(hydrationTargetMl));
    setShowTargetModal(true);
  };

  const handleSaveTarget = () => {
    const newTarget = parseInt(targetInput, 10);
    if (newTarget > 0 && newTarget <= 10000) {
      updateHydrationTarget(newTarget);
      setShowTargetModal(false);
    } else {
      Alert.alert('Invalid Input', 'Please enter a value between 1 and 10000 ml.');
    }
  };

  const handleStartFasting = () => {
    const hours = parseInt(fastingHours, 10);
    if (hours > 0 && hours <= 72) {
      startFasting(hours);
      setShowFastingModal(false);
      Alert.alert('Fasting Started', `You've started a ${hours}-hour fast. Stay strong, soldier!`);
    } else {
      Alert.alert('Invalid Input', 'Please enter a value between 1 and 72 hours.');
    }
  };

  const handleEndFasting = async () => {
    Alert.alert(
      'End Fasting',
      'Are you sure you want to end your fast?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Fast',
          style: 'destructive',
          onPress: async () => {
            const bonus = await endFasting();
            if (bonus && bonus > 0) {
              Alert.alert('Fast Completed!', `Congratulations! You earned +${bonus} power points!`);
            } else {
              Alert.alert('Fast Ended', 'Your fast has been ended.');
            }
          },
        },
      ]
    );
  };

  const handleLogIceBath = async () => {
    const minutes = parseInt(iceBathMinutes, 10);
    if (minutes > 0 && minutes <= 60) {
      const bonus = await logIceBathEntry(minutes);
      setShowIceBathModal(false);
      setIceBathMinutes('');
      Alert.alert('Ice Bath Logged!', `Great work! You logged ${minutes} minutes and earned +${bonus} power points!`);
    } else {
      Alert.alert('Invalid Input', 'Please enter a value between 1 and 60 minutes.');
    }
  };

  const handleStartIceBathTimer = () => {
    setShowIceBathModal(false);
    setShowCountdownModal(true);
  };

  const handleStartCountdown = () => {
    const minutes = parseInt(countdownMinutes, 10);
    if (minutes > 0 && minutes <= 60) {
      const totalSec = minutes * 60;
      setCountdownTotalSeconds(totalSec);
      setCountdownRemainingSeconds(totalSec);
      setIsCountdownActive(true);
      setAlarmTriggered(false);
      setShowCountdownModal(false);
      setShowIceBathTimer(true);
      setIceBathTimerSeconds(0);
    } else {
      Alert.alert('Invalid Input', 'Please enter a value between 1 and 60 minutes.');
    }
  };

  const handleStopIceBathTimer = async () => {
    const minutes = Math.floor(iceBathTimerSeconds / 60);
    const seconds = iceBathTimerSeconds % 60;
    if (minutes > 0 || seconds >= 30) {
      const totalMinutes = minutes + (seconds >= 30 ? 1 : 0);
      const bonus = await logIceBathEntry(totalMinutes);
      setShowIceBathTimer(false);
      setIceBathTimerSeconds(0);
      setIsCountdownActive(false);
      setCountdownRemainingSeconds(0);
      setCountdownTotalSeconds(0);
      setAlarmTriggered(false);
      Alert.alert('Ice Bath Completed!', `Warrior! You lasted ${minutes}m ${seconds}s and earned +${bonus} power points!`);
    } else {
      setShowIceBathTimer(false);
      setIceBathTimerSeconds(0);
      setIsCountdownActive(false);
      setCountdownRemainingSeconds(0);
      setCountdownTotalSeconds(0);
      setAlarmTriggered(false);
      Alert.alert('Too Short', 'Ice bath must be at least 30 seconds to count.');
    }
  };

  useEffect(() => {
    if (!fastingState?.isActive) {
      return;
    }
    const interval = setInterval(() => {
      const start = new Date(fastingState.startTime);
      const now = new Date();
      const elapsed = Math.floor((now.getTime() - start.getTime()) / 1000);
      setFastingTimeElapsed(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [fastingState]);

  useEffect(() => {
    if (!showIceBathTimer) {
      return;
    }
    const interval = setInterval(() => {
      setIceBathTimerSeconds(prev => prev + 1);
      
      if (isCountdownActive) {
        setCountdownRemainingSeconds(prev => {
          const next = prev - 1;
          if (next <= 0 && !alarmTriggered) {
            return 0;
          }
          return next;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [showIceBathTimer, isCountdownActive, alarmTriggered]);

  useEffect(() => {
    const activeChallenges = challenges.filter(c => c.isActive);
    if (activeChallenges.length > 0) {
      const interval = setInterval(() => {
        const elapsed = getTimeElapsed(activeChallenges[0].startDate);
        setDaysWithoutTime(elapsed);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setDaysWithoutTime(null);
    }
  }, [challenges, getTimeElapsed]);

  useEffect(() => {
    if (isCountdownActive && countdownRemainingSeconds === 0 && !alarmTriggered && showIceBathTimer) {
      setAlarmTriggered(true);
      
      if (Platform.OS === 'web') {
        try {
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.value = 800;
          oscillator.type = 'sine';
          gainNode.gain.value = 0.3;
          
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.5);
        } catch (e) {
          console.log('Could not play alarm sound:', e);
        }
      }
      
      Alert.alert(
        '🎉 Time\'s Up!',
        'You completed your ice bath challenge! Great work, warrior!',
        [
          {
            text: 'Complete',
            onPress: () => {
              handleStopIceBathTimer();
            },
          },
        ],
        { cancelable: false }
      );
    }
  }, [isCountdownActive, countdownRemainingSeconds, alarmTriggered, showIceBathTimer]);

  const getFastingStage = (hoursElapsed: number): { stage: string; description: string } => {
    if (hoursElapsed < 4) return { stage: 'Digestion', description: 'Body is processing your last meal' };
    if (hoursElapsed < 8) return { stage: 'Blood Sugar Stabilizing', description: 'Insulin levels dropping, fat burning begins' };
    if (hoursElapsed < 12) return { stage: 'Fat Burning', description: 'Body switching to fat for energy' };
    if (hoursElapsed < 16) return { stage: 'Ketosis Beginning', description: 'Ketone production increasing' };
    if (hoursElapsed < 24) return { stage: 'Deep Ketosis', description: 'Peak fat burning and mental clarity' };
    if (hoursElapsed < 48) return { stage: 'Autophagy', description: 'Cellular repair and regeneration activated' };
    return { stage: 'Extended Fast', description: 'Maximum cellular regeneration' };
  };
  
  const calculateWorkoutStreak = () => {
    if (!activeProgram || workoutLogs.length === 0) return 0;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let currentStreak = 0;
    let checkDate = new Date(today);
    
    for (let i = 0; i < 365; i++) {
      const dateStr = checkDate.toDateString();
      const hasWorkout = workoutLogs.some(log => {
        const logDate = new Date(log.completedAt);
        logDate.setHours(0, 0, 0, 0);
        return logDate.toDateString() === dateStr;
      });
      
      if (!hasWorkout) {
        const daysSinceStart = activeProgram.startDate 
          ? Math.floor((checkDate.getTime() - new Date(activeProgram.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
          : 0;
        
        const scheduleEntry = activeProgram.schedule.find(s => s.day === daysSinceStart);
        const isRestDay = scheduleEntry?.workout === null;
        
        if (!isRestDay) {
          break;
        }
      }
      
      if (hasWorkout) {
        currentStreak++;
      }
      
      checkDate.setDate(checkDate.getDate() - 1);
    }
    
    return currentStreak;
  };
  
  const getWeekProgress = () => {
    if (!activeProgram || !activeProgram.startDate) {
      return Array.from({ length: 7 }, (_, i) => ({
        day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] as string,
        status: 'empty' as 'completed' | 'missed' | 'rest' | 'empty',
      }));
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result: Array<{ day: string; status: 'completed' | 'missed' | 'rest' | 'empty' }> = [];
    
    const todayDayOfWeek = today.getDay();
    const daysFromMonday = todayDayOfWeek === 0 ? 6 : todayDayOfWeek - 1;
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - daysFromMonday + i);
      date.setHours(0, 0, 0, 0);
      const dayOfWeek = date.getDay();
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek] as string;
      
      const programStartDate: Date = new Date(activeProgram.startDate);
      programStartDate.setHours(0, 0, 0, 0);
      const daysSinceStart = Math.floor((date.getTime() - programStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
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
      const isFutureDay = date.getTime() > today.getTime();
      
      if (isCompleted) {
        result.push({ day: dayName, status: 'completed' });
      } else if (isFutureDay) {
        result.push({ day: dayName, status: 'empty' });
      } else {
        result.push({ day: dayName, status: 'missed' });
      }
    }
    
    return result;
  };
  
  const workoutStreak = calculateWorkoutStreak();

  const getTodaysBriefing = () => {
    const briefings = adminSettings.dailyBriefings ?? [];
    if (briefings.length === 0) {
      return '"Discipline is forged in fire. Today, you enter the warzone of self-mastery. Every rep is a battle. Every decision is a mission. Your enemy is weakness. Your weapon is action."';
    }

    const today = new Date();
    const todayStr = today.toDateString();
    
    for (const briefing of briefings) {
      if (!briefing.repeatDays) {
        if (!briefing.lastShownDate) {
          return briefing.text;
        }
        continue;
      }
      
      if (!briefing.lastShownDate) {
        return briefing.text;
      }
      
      const lastShown = new Date(briefing.lastShownDate);
      const daysSince = Math.floor((today.getTime() - lastShown.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSince >= briefing.repeatDays) {
        return briefing.text;
      }
    }
    
    return briefings[0]?.text ?? '"Discipline is forged in fire. Today, you enter the warzone of self-mastery. Every rep is a battle. Every decision is a mission. Your enemy is weakness. Your weapon is action."';
  };

  const handleCoffeePress = () => {
    const coffeeLink = adminSettings.coffeeLink;
    if (!coffeeLink || coffeeLink.trim() === '') {
      return;
    }
    setShowCoffeeDisclosure(true);
  };

  const getTodaysBriefingAuthor = () => {
    const briefings = adminSettings.dailyBriefings ?? [];
    if (briefings.length === 0) {
      return 'Commander';
    }

    const today = new Date();
    const todayStr = today.toDateString();
    
    for (const briefing of briefings) {
      if (!briefing.repeatDays) {
        if (!briefing.lastShownDate) {
          return briefing.author;
        }
        continue;
      }
      
      if (!briefing.lastShownDate) {
        return briefing.author;
      }
      
      const lastShown = new Date(briefing.lastShownDate);
      const daysSince = Math.floor((today.getTime() - lastShown.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSince >= briefing.repeatDays) {
        return briefing.author;
      }
    }
    
    return briefings[0]?.author ?? 'Commander';
  };

  return (
    <View style={[styles.background, { paddingTop: insets.top }]}>
      <Modal
        visible={showTargetModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTargetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Water Target</Text>
            <Text style={styles.modalSubtitle}>Set your daily water intake goal (ml)</Text>
            <TextInput
              style={styles.modalInput}
              value={targetInput}
              onChangeText={setTargetInput}
              keyboardType="number-pad"
              placeholder="Enter target in ml"
              placeholderTextColor={Colors.textTertiary}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowTargetModal(false)}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={handleSaveTarget}
              >
                <Text style={styles.modalButtonTextSave}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['rgba(7, 150, 212, 0.2)', 'rgba(7, 150, 212, 0)']}
          style={styles.heroGradient}
        >
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1200&q=80' }}
            style={styles.heroImage}
            contentFit="cover"
          />
          <View style={styles.heroOverlay}>
            <View style={styles.heroTopBar}>
              <TouchableOpacity 
                style={styles.topIconBtn} 
                onPress={() => router.push('/notifications' as any)} 
                activeOpacity={0.7}
              >
                <Bell size={22} color={Colors.accent} strokeWidth={2.5} />
                {user && getUnreadCount(user.id) > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {getUnreadCount(user.id)}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.topIconBtn} onPress={() => router.push('/profile' as any)} activeOpacity={0.7}>
                <User size={22} color={Colors.accent} strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.topIconBtn} onPress={() => router.push('/barcode-scanner' as any)} activeOpacity={0.7}>
                <ScanBarcode size={22} color={Colors.accent} strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.topIconBtn} onPress={() => router.push('/food' as any)} activeOpacity={0.7}>
                <UtensilsCrossed size={22} color={Colors.accent} strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.topIconBtn} onPress={() => router.push('/(tabs)/training' as any)} activeOpacity={0.7}>
                <Dumbbell size={22} color={Colors.accent} strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.topIconBtn} onPress={() => router.push('/shop' as any)} activeOpacity={0.7}>
                <ShoppingBag size={22} color={Colors.accent} strokeWidth={2.5} />
              </TouchableOpacity>

            </View>
            <Text style={styles.heroTitle}>{adminSettings.heroTitle ?? 'Your Mission Awaits, Soldier'}</Text>
            <Text style={styles.heroSubtitle}>{adminSettings.heroSubtitle ?? 'Forge Strength. Crush Anxiety. Dominate Your Life.'}</Text>
          </View>
        </LinearGradient>

        <View style={styles.metricsGrid}>
          <TouchableOpacity style={styles.metricCard} activeOpacity={0.7}>
            <View style={styles.metricHeader}>
              <Zap size={18} color={Colors.accent} />
              <Text style={styles.metricLabel}>Power Level</Text>
            </View>
            <Text style={styles.metricValue}>{powerLevel}</Text>
            <View style={styles.powerBar}>
              <View style={[styles.powerBarFill, { width: `${(powerLevel % 100)}%` }]} />
            </View>
            <Text style={styles.metricSubtext}>Level {Math.floor(powerLevel / 100) + 1}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.metricCard} activeOpacity={0.7}>
            <View style={styles.metricHeader}>
              <Activity size={18} color={Colors.success} />
              <Text style={styles.metricLabel}>Workout Streak</Text>
            </View>
            <Text style={styles.metricValue}>{workoutStreak}</Text>
            <View style={styles.streakDots}>
              {Array.from({ length: 7 }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.streakDot,
                    i < (workoutStreak % 7) && styles.streakDotActive,
                  ]}
                />
              ))}
            </View>
            <Text style={styles.metricSubtext}>{workoutStreak === 0 ? 'Start!' : `${workoutStreak} days`}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.metricCard} 
            activeOpacity={0.7}
            onPress={() => router.push('/days-without' as any)}
          >
            <View style={styles.metricHeader}>
              <Ban size={18} color={Colors.danger} />
              <Text style={styles.metricLabel}>Days Without</Text>
            </View>
            {daysWithoutTime ? (
              <>
                <View style={styles.daysWithoutTimerRow}>
                  <View style={styles.daysWithoutTimeBox}>
                    <Text style={styles.daysWithoutTimeValue}>{daysWithoutTime.days}</Text>
                    <Text style={styles.daysWithoutTimeLabel}>D</Text>
                  </View>
                  <Text style={styles.daysWithoutTimeSeparator}>:</Text>
                  <View style={styles.daysWithoutTimeBox}>
                    <Text style={styles.daysWithoutTimeValue}>{daysWithoutTime.hours.toString().padStart(2, '0')}</Text>
                    <Text style={styles.daysWithoutTimeLabel}>H</Text>
                  </View>
                  <Text style={styles.daysWithoutTimeSeparator}>:</Text>
                  <View style={styles.daysWithoutTimeBox}>
                    <Text style={styles.daysWithoutTimeValue}>{daysWithoutTime.minutes.toString().padStart(2, '0')}</Text>
                    <Text style={styles.daysWithoutTimeLabel}>M</Text>
                  </View>
                </View>
                <View style={styles.daysWithoutIndicator}>
                  <View style={[styles.daysWithoutDot, { backgroundColor: Colors.success }]} />
                  <Text style={styles.daysWithoutText}>{challenges.filter(c => c.isActive)[0]?.name}</Text>
                </View>
                <Text style={styles.metricSubtext}>Active challenge</Text>
              </>
            ) : (
              <>
                <Text style={styles.metricValue}>Track</Text>
                <View style={styles.daysWithoutIndicator}>
                  <View style={styles.daysWithoutDot} />
                  <Text style={styles.daysWithoutText}>Quit Bad Habits</Text>
                </View>
                <Text style={styles.metricSubtext}>Tap to start</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Briefing</Text>
          <View style={styles.briefingCard}>
            <Text style={styles.briefingText}>
              {getTodaysBriefing()}
            </Text>
            <Text style={styles.briefingAuthor}>— {getTodaysBriefingAuthor()}</Text>
          </View>
        </View>

        {activeProgram && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <TrendingUp size={22} color={Colors.accent} />
              <Text style={styles.sectionTitle}>Week Progress</Text>
            </View>
            <View style={styles.weekProgressCard}>
              {activeProgram.startDate && (
                <View style={styles.programInfoHeader}>
                  <View style={styles.programInfoBadge}>
                    <Calendar size={14} color={Colors.accent} />
                    <Text style={styles.programInfoText}>
                      Week {Math.ceil(getOverallProgress().day / 7)} • Day {getOverallProgress().day}/{activeProgram.days}
                    </Text>
                  </View>
                  <Text style={styles.programNameText}>{activeProgram.title}</Text>
                </View>
              )}
              <View style={styles.graphContainer}>
                {getWeekProgress().map((item, index) => {
                  const height = item.status === 'empty' ? 20 : 
                               item.status === 'missed' ? 40 :
                               item.status === 'rest' ? 70 : 100;
                  const today = new Date().getDay();
                  const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(item.day);
                  const isToday = today === dayIndex;
                  
                  return (
                    <View key={index} style={styles.graphBarContainer}>
                      <View style={styles.graphBarWrapper}>
                        <View
                          style={[
                            styles.graphBar,
                            { height: `${height}%` },
                            item.status === 'completed' && styles.graphBarCompleted,
                            item.status === 'rest' && styles.graphBarRest,
                            item.status === 'missed' && styles.graphBarMissed,
                            item.status === 'empty' && styles.graphBarEmpty,
                          ]}
                        >
                          {item.status === 'completed' && (
                            <LinearGradient
                              colors={['#febf31', '#F59E0B']}
                              style={styles.graphBarGradient}
                            />
                          )}
                          {item.status === 'rest' && (
                            <View style={styles.graphBarRestFill} />
                          )}
                          {item.status === 'missed' && (
                            <View style={styles.graphBarMissedFill} />
                          )}
                          <View style={styles.graphBarTop}>
                            {item.status === 'completed' && (
                              <View style={styles.statusDot}>
                                <View style={styles.statusDotInner} />
                              </View>
                            )}
                            {item.status === 'rest' && (
                              <View style={[styles.statusDot, styles.statusDotRest]}>
                                <View style={styles.statusDotInner} />
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                      <View style={[
                        styles.dayLabelContainer,
                        isToday && styles.dayLabelContainerToday
                      ]}>
                        <Text style={[
                          styles.dayLabel,
                          isToday && styles.dayLabelToday
                        ]}>{item.day}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
              <View style={styles.graphLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.accent }]} />
                  <Text style={styles.legendText}>Completed</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#818CF8' }]} />
                  <Text style={styles.legendText}>Rest</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={styles.legendText}>Missed</Text>
                </View>
              </View>

            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsContainer}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/(tabs)/training')}
            >
              <View style={styles.actionIconContainer}>
                <Dumbbell size={24} color={Colors.accent} />
              </View>
              <Text style={styles.actionTitle}>Missions</Text>
              <Text style={styles.actionSubtitle}>Your next workouts</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/(tabs)/challenges')}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: '#F59E0B20' }]}>
                <Trophy size={24} color="#F59E0B" />
              </View>
              <Text style={styles.actionTitle}>Challenges</Text>
              <Text style={styles.actionSubtitle}>Join competitions</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/food' as any)}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: '#10B98120' }]}>
                <UtensilsCrossed size={24} color="#10B981" />
              </View>
              <Text style={styles.actionTitle}>Food Scanner</Text>
              <Text style={styles.actionSubtitle}>Track your nutrition</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => setShowIceBathModal(true)}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: '#3B82F620' }]}>
                <Snowflake size={24} color="#3B82F6" />
              </View>
              <Text style={styles.actionTitle}>Log Ice Bath</Text>
              <Text style={styles.actionSubtitle}>Track cold exposure</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Ice Bath History</Text>
            <TouchableOpacity 
              style={styles.viewAllButton}
              onPress={() => router.push('/ice-bath-tracker' as any)}
            >
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.historyCard}>
            <Snowflake size={32} color="#60A5FA" />
            <Text style={styles.historyTitle}>View Your Ice Bath Stats</Text>
            <Text style={styles.historyDescription}>Track your cold exposure journey, view stats, and see your progress over time.</Text>
            <TouchableOpacity 
              style={styles.historyButton}
              onPress={() => router.push('/ice-bath-tracker' as any)}
            >
              <Text style={styles.historyButtonText}>Open Tracker</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fasting Tracker</Text>
          {!fastingState?.isActive ? (
            <View style={styles.fastingCard}>
              <View style={styles.fastingHeader}>
                <Clock size={20} color={Colors.accent} />
                <Text style={styles.fastingTitle}>Start a Fast</Text>
              </View>
              <Text style={styles.fastingDescription}>
                Intermittent fasting enhances mental clarity, promotes fat burning, and triggers cellular repair.
              </Text>
              <TouchableOpacity
                style={styles.fastingStartBtn}
                onPress={() => setShowFastingModal(true)}
              >
                <Text style={styles.fastingStartBtnText}>Start Fasting</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.fastingCard}>
              <View style={styles.fastingHeader}>
                <Clock size={20} color={Colors.success} />
                <Text style={styles.fastingTitle}>Fast in Progress</Text>
              </View>

              <View style={styles.fastingProgress}>
                <Text style={styles.fastingTimeText}>
                  {Math.floor(fastingTimeElapsed / 3600)}h {Math.floor((fastingTimeElapsed % 3600) / 60)}m
                </Text>
                <Text style={styles.fastingGoalText}>
                  Goal: {fastingState.durationHours}h
                </Text>
              </View>
              <View style={styles.fastingProgressBar}>
                <View
                  style={[
                    styles.fastingProgressFill,
                    {
                      width: `${Math.min(100, (fastingTimeElapsed / (fastingState.durationHours * 3600)) * 100)}%`,
                    },
                  ]}
                />
              </View>
              {(() => {
                const hoursElapsed = fastingTimeElapsed / 3600;
                const stage = getFastingStage(hoursElapsed);
                return (
                  <View style={styles.fastingStage}>
                    <Text style={styles.fastingStageName}>{stage.stage}</Text>
                    <Text style={styles.fastingStageDesc}>{stage.description}</Text>
                  </View>
                );
              })()}
              <TouchableOpacity style={styles.fastingEndBtn} onPress={handleEndFasting}>
                <Text style={styles.fastingEndBtnText}>End Fast</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hydration</Text>
          <View style={styles.hydrationCard}>
            <View style={styles.hydrationHeader}>
              <Droplets size={18} color={Colors.accent} />
              <Text style={styles.hydrationText}>{hydrationMl} / {hydrationTargetMl} ml</Text>
              <TouchableOpacity onPress={handleEditTarget} style={styles.editTargetBtn}>
                <Settings size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.hydrationProgressOuter}>
              <View style={[styles.hydrationProgressInner, { width: `${Math.min(100, (hydrationMl / (hydrationTargetMl || 1)) * 100)}%` }]} />
            </View>
            <View style={styles.hydrationButtons}>
              {[250, 500, 750].map(ml => (
                <TouchableOpacity key={ml} style={styles.hydrationBtn} onPress={() => addWater(ml)}>
                  <Text style={styles.hydrationBtnText}>+{ml} ml</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.hydrationBtn, styles.hydrationResetBtn]}
                onPress={() => {
                  Alert.alert('Reset Hydration', 'Are you sure you want to reset today\'s hydration to zero?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Reset', style: 'destructive', onPress: resetHydration },
                  ]);
                }}
              >
                <Text style={styles.hydrationResetBtnText}>Reset</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showFastingModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFastingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Start Fasting</Text>
            <Text style={styles.modalSubtitle}>How many hours do you want to fast?</Text>
            <View style={styles.fastingPresets}>
              {['12', '16', '18', '24'].map(hours => (
                <TouchableOpacity
                  key={hours}
                  style={[
                    styles.fastingPreset,
                    fastingHours === hours && styles.fastingPresetActive,
                  ]}
                  onPress={() => setFastingHours(hours)}
                >
                  <Text
                    style={[
                      styles.fastingPresetText,
                      fastingHours === hours && styles.fastingPresetTextActive,
                    ]}
                  >
                    {hours}h
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.modalInput}
              value={fastingHours}
              onChangeText={setFastingHours}
              keyboardType="number-pad"
              placeholder="Custom hours"
              placeholderTextColor={Colors.textTertiary}
            />
            <View style={styles.fastingRecommendations}>
              <Text style={styles.fastingRecTitle}>Popular Fasts:</Text>
              <Text style={styles.fastingRecText}>• 12h: Beginner-friendly</Text>
              <Text style={styles.fastingRecText}>• 16h: Optimal fat burning (16:8)</Text>
              <Text style={styles.fastingRecText}>• 18h: Enhanced autophagy</Text>
              <Text style={styles.fastingRecText}>• 24h: Deep cellular repair</Text>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowFastingModal(false)}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={handleStartFasting}
              >
                <Text style={styles.modalButtonTextSave}>Start</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showIceBathModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowIceBathModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Log Ice Bath</Text>
              <Text style={styles.modalSubtitle}>How many minutes did you spend?</Text>
              <TouchableOpacity
                style={styles.timerStartButton}
                onPress={handleStartIceBathTimer}
              >
                <Clock size={24} color={Colors.text} />
                <Text style={styles.timerStartButtonText}>Start Live Timer</Text>
              </TouchableOpacity>
              <View style={styles.orDivider}>
                <View style={styles.orDividerLine} />
                <Text style={styles.orDividerText}>OR</Text>
                <View style={styles.orDividerLine} />
              </View>
              <TextInput
                style={styles.modalInput}
                value={iceBathMinutes}
                onChangeText={setIceBathMinutes}
                keyboardType="number-pad"
                placeholder="Enter duration manually (minutes)"
                placeholderTextColor={Colors.textTertiary}
              />
              <View style={styles.iceBathInfo}>
                <Text style={styles.iceBathInfoText}>💪 Builds mental resilience</Text>
                <Text style={styles.iceBathInfoText}>🔥 Boosts metabolism</Text>
                <Text style={styles.iceBathInfoText}>⚡ Increases energy</Text>
                <Text style={styles.iceBathInfoText}>🧠 Improves focus</Text>
              </View>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => {
                    setShowIceBathModal(false);
                    setIceBathMinutes('');
                  }}
                >
                  <Text style={styles.modalButtonTextCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSave]}
                  onPress={handleLogIceBath}
                >
                  <Text style={styles.modalButtonTextSave}>Log</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showCountdownModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCountdownModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set Countdown Timer</Text>
            <Text style={styles.modalSubtitle}>How many minutes for your ice bath challenge?</Text>
            <View style={styles.fastingPresets}>
              {['1', '2', '3', '5'].map(mins => (
                <TouchableOpacity
                  key={mins}
                  style={[
                    styles.fastingPreset,
                    countdownMinutes === mins && styles.fastingPresetActive,
                  ]}
                  onPress={() => setCountdownMinutes(mins)}
                >
                  <Text
                    style={[
                      styles.fastingPresetText,
                      countdownMinutes === mins && styles.fastingPresetTextActive,
                    ]}
                  >
                    {mins}m
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.modalInput}
              value={countdownMinutes}
              onChangeText={setCountdownMinutes}
              keyboardType="number-pad"
              placeholder="Custom minutes"
              placeholderTextColor={Colors.textTertiary}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowCountdownModal(false)}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={handleStartCountdown}
              >
                <Text style={styles.modalButtonTextSave}>Start</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {showIceBathTimer && (
        <View style={styles.timerOverlay}>
          <LinearGradient
            colors={['#1e3a8a', '#3b82f6', '#60a5fa']}
            style={styles.timerGradient}
          >
            <View style={styles.timerHeader}>
              <Snowflake size={32} color="#fff" />
              <Text style={styles.timerHeaderText}>ICE BATH IN PROGRESS</Text>
            </View>
            {isCountdownActive && (
              <View style={styles.countdownSection}>
                <Text style={styles.countdownLabel}>COUNTDOWN</Text>
                <View style={styles.timerDisplay}>
                  <Text style={styles.timerMinutes}>
                    {Math.floor(countdownRemainingSeconds / 60).toString().padStart(2, '0')}
                  </Text>
                  <Text style={styles.timerColon}>:</Text>
                  <Text style={styles.timerSeconds}>
                    {(countdownRemainingSeconds % 60).toString().padStart(2, '0')}
                  </Text>
                </View>
                <View style={styles.countdownProgress}>
                  <View 
                    style={[
                      styles.countdownProgressFill, 
                      { width: `${(countdownRemainingSeconds / countdownTotalSeconds) * 100}%` }
                    ]} 
                  />
                </View>
                <Text style={styles.timerLabel}>TIME REMAINING</Text>
              </View>
            )}
            <View style={styles.elapsedSection}>
              <Text style={styles.elapsedLabel}>{isCountdownActive ? 'ELAPSED TIME' : 'TIME ELAPSED'}</Text>
              <View style={[styles.timerDisplay, isCountdownActive && { marginBottom: 8 }]}>
                <Text style={[styles.timerMinutes, isCountdownActive && styles.timerMinutesSmall]}>
                  {Math.floor(iceBathTimerSeconds / 60).toString().padStart(2, '0')}
                </Text>
                <Text style={[styles.timerColon, isCountdownActive && styles.timerColonSmall]}>:</Text>
                <Text style={[styles.timerSeconds, isCountdownActive && styles.timerSecondsSmall]}>
                  {(iceBathTimerSeconds % 60).toString().padStart(2, '0')}
                </Text>
              </View>
              {!isCountdownActive && <Text style={styles.timerLabel}>MINUTES : SECONDS</Text>}
            </View>
            <View style={styles.timerStats}>
              <View style={styles.timerStat}>
                <Text style={styles.timerStatValue}>
                  {Math.floor(iceBathTimerSeconds / 60) + (iceBathTimerSeconds % 60 >= 30 ? 1 : 0)}
                </Text>
                <Text style={styles.timerStatLabel}>Power Points Earned</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.timerStopButton}
              onPress={handleStopIceBathTimer}
            >
              <Text style={styles.timerStopButtonText}>COMPLETE ICE BATH</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.timerCancelButton}
              onPress={() => {
                Alert.alert(
                  'Cancel Ice Bath?',
                  'Are you sure you want to cancel this ice bath session?',
                  [
                    { text: 'Keep Going', style: 'cancel' },
                    {
                      text: 'Cancel',
                      style: 'destructive',
                      onPress: () => {
                        setShowIceBathTimer(false);
                        setIceBathTimerSeconds(0);
                        setIsCountdownActive(false);
                        setCountdownRemainingSeconds(0);
                        setCountdownTotalSeconds(0);
                        setAlarmTriggered(false);
                      },
                    },
                  ]
                );
              }}
            >
              <Text style={styles.timerCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      )}

      {adminSettings.coffeeLink && adminSettings.coffeeLink.trim() !== '' && (
        <TouchableOpacity
          style={styles.coffeeButton}
          onPress={handleCoffeePress}
          activeOpacity={0.9}
        >
          <View style={styles.coffeeButtonGlow} />
          <View style={styles.coffeeButtonInner}>
            <Coffee size={26} color={Colors.accent} strokeWidth={2.5} />
          </View>
        </TouchableOpacity>
      )}

      <ExternalLinkDisclosure
        visible={showCoffeeDisclosure}
        onClose={() => setShowCoffeeDisclosure(false)}
        url={adminSettings.coffeeLink ?? ''}
        title="Support the App"
        description="If you enjoy this app and want to support future updates, you can buy me a coffee ☕ — it really helps! This will take you to an external website for donations."
      />
    </View>
  );
}

function getNextStreakMilestone(lastMilestone: number): number {
  const milestones = [10, 20, 30, 50, 75, 100];
  return milestones.find(m => m > lastMilestone) ?? 100;
}

interface ObjectiveItemProps {
  objective: { id: string; text: string; completed: boolean };
  onToggle: (id: string) => void;
}

function ObjectiveItem({ objective, onToggle }: ObjectiveItemProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (objective.completed) {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [objective.completed, scaleAnim]);

  return (
    <TouchableOpacity
      style={styles.objectiveItem}
      onPress={() => onToggle(objective.id)}
      activeOpacity={0.7}
    >
      <Animated.View
        style={[
          styles.objectiveCheckbox,
          objective.completed && styles.objectiveCheckboxCompleted,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        {objective.completed && <Check size={16} color={Colors.text} strokeWidth={3} />}
      </Animated.View>
      <Text
        style={[
          styles.objectiveText,
          objective.completed && styles.objectiveTextCompleted,
        ]}
      >
        {objective.text}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
  },
  heroGradient: {
    height: 280,
    width: '100%',
    position: 'relative' as const,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.4,
  },
  heroOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  heroTopBar: { position: 'absolute', top: 16, left: 0, right: 0, flexDirection: 'row', gap: 10, justifyContent: 'center' },
  topIconBtn: { 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    backgroundColor: Colors.background, 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderWidth: 2, 
    borderColor: Colors.accent, 
    shadowColor: Colors.accent, 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.6, 
    shadowRadius: 12, 
    elevation: 8,
    position: 'relative' as const,
  },
  notificationBadge: {
    position: 'absolute' as const,
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700' as const,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '800' as const,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  heroSubtitle: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  metricsGrid: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: -40,
    gap: 12,
    flexWrap: 'wrap' as const,
  },
  metricCard: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 130,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
  },
  metricValue: {
    fontSize: 36,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  powerBar: {
    height: 6,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  powerBarFill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 3,
  },
  streakDots: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  streakDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surfaceLight,
  },
  streakDotActive: {
    backgroundColor: Colors.success,
  },
  metricSubtext: {
    fontSize: 11,
    color: Colors.textTertiary,
    fontWeight: '500' as const,
  },
  daysWithoutIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  daysWithoutDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
  },
  daysWithoutText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  daysWithoutTimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  daysWithoutTimeBox: {
    alignItems: 'center',
  },
  daysWithoutTimeValue: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.danger,
    fontVariant: ['tabular-nums' as any],
  },
  daysWithoutTimeLabel: {
    fontSize: 8,
    color: Colors.textTertiary,
    fontWeight: '600' as const,
    marginTop: -2,
  },
  daysWithoutTimeSeparator: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.textTertiary,
    marginHorizontal: 2,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 16,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  briefingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    borderLeftColor: Colors.accent,
  },
  briefingText: {
    fontSize: 15,
    lineHeight: 24,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
    fontStyle: 'italic' as const,
    marginBottom: 12,
  },
  briefingAuthor: {
    fontSize: 13,
    color: Colors.accent,
    fontWeight: '600' as const,
  },
  quickActionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap' as const,
    gap: 12,
  },
  actionCard: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 3,
    textAlign: 'center',
  },
  actionSubtitle: {
    fontSize: 10,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  objectivesList: {
    gap: 12,
  },
  objectiveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  objectiveCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  objectiveCheckboxCompleted: {
    backgroundColor: Colors.accent,
  },
  objectiveText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500' as const,
    flex: 1,
  },
  objectiveTextCompleted: {
    color: Colors.textSecondary,
    textDecorationLine: 'line-through' as const,
  },
  hydrationCard: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, padding: 16 },
  hydrationHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  hydrationText: { color: Colors.text, fontWeight: '800' as const, flex: 1 },
  editTargetBtn: { padding: 4 },
  hydrationButtons: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' as const, justifyContent: 'center', alignItems: 'center' },
  hydrationBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.accent },
  hydrationBtnText: { color: Colors.text, fontWeight: '800' as const },
  hydrationResetBtn: { backgroundColor: Colors.surfaceLight },
  hydrationResetBtnText: { color: Colors.text, fontWeight: '800' as const },
  hydrationProgressOuter: { height: 10, backgroundColor: Colors.surfaceLight, borderRadius: 6, overflow: 'hidden', marginBottom: 12 },
  hydrationProgressInner: { height: '100%', backgroundColor: Colors.success },
  fastingCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 16,
  },
  fastingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  fastingTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  fastingDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  fastingStartBtn: {
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  fastingStartBtnText: {
    color: Colors.text,
    fontWeight: '800' as const,
    fontSize: 14,
  },
  fastingProgress: {
    marginBottom: 12,
  },
  fastingTimeText: {
    fontSize: 32,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  fastingGoalText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  fastingProgressBar: {
    height: 10,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
  },
  fastingProgressFill: {
    height: '100%',
    backgroundColor: Colors.success,
  },
  fastingStage: {
    backgroundColor: Colors.surfaceLight,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  fastingStageName: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.accent,
    marginBottom: 4,
  },
  fastingStageDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  fastingEndBtn: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  fastingEndBtnText: {
    color: Colors.danger,
    fontWeight: '800' as const,
    fontSize: 14,
  },
  fastingPresets: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    justifyContent: 'center',
  },
  fastingPreset: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceLight,
  },
  fastingPresetActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  fastingPresetText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  fastingPresetTextActive: {
    color: Colors.text,
  },
  fastingRecommendations: {
    marginTop: 16,
    padding: 12,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
  },
  fastingRecTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  fastingRecText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  iceBathInfo: {
    marginTop: 16,
    padding: 12,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    gap: 6,
  },
  iceBathInfoText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonCancel: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalButtonSave: {
    backgroundColor: Colors.accent,
  },
  modalButtonTextCancel: {
    color: Colors.text,
    fontWeight: '600' as const,
    fontSize: 16,
  },
  modalButtonTextSave: {
    color: Colors.text,
    fontWeight: '700' as const,
    fontSize: 16,
  },
  timerStartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  timerStartButtonText: {
    color: Colors.text,
    fontWeight: '800' as const,
    fontSize: 16,
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  orDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  orDividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    color: Colors.textTertiary,
    fontWeight: '600' as const,
  },
  timerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  timerGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  timerHeader: {
    alignItems: 'center',
    marginBottom: 48,
  },
  timerHeaderText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#fff',
    marginTop: 12,
    letterSpacing: 2,
  },
  timerDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  timerMinutes: {
    fontSize: 96,
    fontWeight: '900' as const,
    color: '#fff',
    fontVariant: ['tabular-nums' as any],
  },
  timerColon: {
    fontSize: 96,
    fontWeight: '900' as const,
    color: '#fff',
    marginHorizontal: 8,
  },
  timerSeconds: {
    fontSize: 96,
    fontWeight: '900' as const,
    color: '#fff',
    fontVariant: ['tabular-nums' as any],
  },
  timerLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: 'rgba(255, 255, 255, 0.7)',
    letterSpacing: 1,
    marginBottom: 48,
  },
  timerStats: {
    width: '100%',
    marginBottom: 48,
  },
  timerStat: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 20,
    paddingHorizontal: 32,
    borderRadius: 16,
  },
  timerStatValue: {
    fontSize: 48,
    fontWeight: '900' as const,
    color: '#fff',
    marginBottom: 8,
  },
  timerStatLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: 'rgba(255, 255, 255, 0.8)',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  timerStopButton: {
    backgroundColor: '#10B981',
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 16,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
  },
  timerStopButtonText: {
    color: '#fff',
    fontWeight: '900' as const,
    fontSize: 18,
    letterSpacing: 1,
  },
  timerCancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  timerCancelButtonText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600' as const,
    fontSize: 14,
  },
  countdownSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 32,
    paddingBottom: 32,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
  },
  countdownLabel: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#10B981',
    letterSpacing: 2,
    marginBottom: 16,
  },
  countdownProgress: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 16,
    marginBottom: 8,
  },
  countdownProgressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  elapsedSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 48,
  },
  elapsedLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 1,
    marginBottom: 12,
  },
  timerMinutesSmall: {
    fontSize: 56,
  },
  timerColonSmall: {
    fontSize: 56,
  },
  timerSecondsSmall: {
    fontSize: 56,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  viewAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.accent,
    borderRadius: 20,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  historyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  historyDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  historyButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  historyButtonText: {
    color: Colors.text,
    fontWeight: '800' as const,
    fontSize: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  weekProgressCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  programInfoHeader: {
    marginBottom: 24,
  },
  programInfoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  programInfoText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.accent,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  programNameText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
    marginLeft: 2,
  },
  graphContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 160,
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  graphBarContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  graphBarWrapper: {
    width: '100%',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 2,
  },
  graphBar: {
    width: '100%',
    minHeight: 20,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    position: 'relative' as const,
    overflow: 'hidden',
  },
  graphBarCompleted: {
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  graphBarGradient: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  graphBarRest: {
    backgroundColor: '#818CF8',
    shadowColor: '#818CF8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  graphBarRestFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#818CF8',
  },
  graphBarMissed: {
    backgroundColor: '#EF4444',
    opacity: 0.7,
  },
  graphBarMissedFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#EF4444',
  },
  graphBarEmpty: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  graphBarTop: {
    position: 'absolute' as const,
    top: -6,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  statusDotRest: {
    backgroundColor: '#818CF8',
  },
  statusDotInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.text,
  },
  dayLabelContainer: {
    marginTop: 12,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  dayLabelContainerToday: {
    backgroundColor: Colors.accent,
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  dayLabelToday: {
    color: Colors.background,
  },
  graphLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  resetWeekButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  resetWeekButtonText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  coffeeButton: {
    position: 'absolute' as const,
    right: 20,
    bottom: 85,
    zIndex: 1000,
  },
  coffeeButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.accent,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 12,
  },
  coffeeButtonGlow: {
    position: 'absolute' as const,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.accent,
    opacity: 0.2,
    top: -5,
    left: -5,
  },
});

