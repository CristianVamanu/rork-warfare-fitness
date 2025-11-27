import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Sparkles, Send, Trash2, Dumbbell } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/colors';
import { useAiTrainer } from '@/contexts/AiTrainerContext';
import { useApp } from '@/contexts/AppContext';
import { useTraining, Program } from '@/contexts/TrainingContext';
import { trpc } from '@/lib/trpc';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AiTrainerScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const { messages, isLoading: aiLoading, sendMessage, clearChat, loadMessages, getUserBehaviorData } = useAiTrainer();
  const { allPrograms } = useTraining();
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [input, setInput] = useState('');
  const [showWorkoutGen, setShowWorkoutGen] = useState(false);
  const [workoutGoal, setWorkoutGoal] = useState('');
  const [workoutDays, setWorkoutDays] = useState('30');
  
  const generateMutation = trpc.programs.generatePersonalized.useMutation();

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || aiLoading) return;
    
    const messageText = input.trim();
    setInput('');
    
    try {
      await sendMessage(messageText);
    } catch (error) {
      console.error('[AiTrainer] Send error:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    }
  };

  const handleGenerateWorkout = async () => {
    if (!workoutGoal.trim() || !user) {
      Alert.alert('Error', 'Please enter your workout goal');
      return;
    }

    try {
      const days = parseInt(workoutDays, 10) || 30;
      const behaviorData = getUserBehaviorData();
      
      const result = await generateMutation.mutateAsync({
        userId: user.id,
        goal: workoutGoal,
        userBehaviorData: behaviorData,
        days,
      });

      const id = result.title.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
      const schedule = result.schedule.map(s => ({
        day: s.day,
        workout: s.workout ? {
          ...s.workout,
          id: `${id}-day-${s.day}`,
          exercises: s.workout.exercises.map((e, idx) => ({
            ...e,
            id: `${id}-day-${s.day}-ex-${idx}`,
          })),
        } : null,
      }));

      const program: Program = {
        id,
        title: result.title,
        description: result.description,
        days: result.days,
        schedule,
        completedDays: {},
        accessLevel: 'free',
        isPaid: false,
        requiresSubscription: false,
        isAiGenerated: true,
        createdBy: user.id,
        createdAt: new Date().toISOString(),
      };

      const existingPrograms = await AsyncStorage.getItem('wf_programs');
      const currentPrograms = existingPrograms ? JSON.parse(existingPrograms) : allPrograms;
      const next = [program, ...currentPrograms];
      await AsyncStorage.setItem('wf_programs', JSON.stringify(next));
      
      setShowWorkoutGen(false);
      setWorkoutGoal('');
      setWorkoutDays('30');
      Alert.alert('Success!', `Your personalized program "${result.title}" has been created! Go to Training tab to view it.`);
    } catch (error) {
      console.error('[AiTrainer] Generate error:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to generate workout plan');
    }
  };

  if (!user) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <Stack.Screen options={{ title: 'AI Trainer', headerStyle: { backgroundColor: Colors.background }, headerTintColor: Colors.text }} />
        <Sparkles size={64} color={Colors.textTertiary} />
        <Text style={[styles.emptyText, { marginTop: 20 }]}>Please log in to use AI Trainer</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { paddingTop: insets.top }]} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen options={{ 
        title: 'AI Trainer', 
        headerStyle: { backgroundColor: Colors.background }, 
        headerTintColor: Colors.text,
        headerShadowVisible: false,
      }} />
      
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Sparkles size={24} color={Colors.accent} />
          <Text style={styles.headerTitle}>Your Personal AI Trainer</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.genWorkoutBtn} 
            onPress={() => setShowWorkoutGen(!showWorkoutGen)}
          >
            <Dumbbell size={18} color={Colors.background} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.clearBtn} onPress={() => {
            Alert.alert('Clear Chat', 'Are you sure you want to clear the conversation?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: clearChat },
            ]);
          }}>
            <Trash2 size={18} color={Colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {showWorkoutGen && (
        <View style={styles.workoutGenCard}>
          <View style={styles.workoutGenHeader}>
            <Sparkles size={20} color={Colors.accent} />
            <Text style={styles.workoutGenTitle}>Generate Personalized Workout</Text>
          </View>
          <Text style={styles.workoutGenSubtitle}>Tell me your goal, and I&apos;ll create a customized program based on your behavior and preferences</Text>
          
          <TextInput
            style={[styles.workoutInput, { minHeight: 80, textAlignVertical: 'top' }]}
            value={workoutGoal}
            onChangeText={setWorkoutGoal}
            placeholder="E.g., I want to build muscle and increase strength"
            placeholderTextColor={Colors.textTertiary}
            multiline
            numberOfLines={3}
          />
          
          <View style={styles.workoutGenRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.workoutGenLabel}>Duration (days)</Text>
              <TextInput
                style={styles.workoutGenInput}
                value={workoutDays}
                onChangeText={setWorkoutDays}
                keyboardType="numeric"
                placeholder="30"
                placeholderTextColor={Colors.textTertiary}
              />
            </View>
            <TouchableOpacity 
              style={[styles.generateBtn, generateMutation.isPending && styles.generateBtnDisabled]}
              onPress={handleGenerateWorkout}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.background} />
              ) : (
                <>
                  <Sparkles size={16} color={Colors.background} />
                  <Text style={styles.generateBtnText}>Generate</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView 
        ref={scrollViewRef}
        style={styles.chatContainer}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Sparkles size={64} color={Colors.textTertiary} />
            <Text style={styles.emptyTitle}>Your AI Trainer is Ready</Text>
            <Text style={styles.emptyText}>
              Ask me anything about fitness, nutrition, or request a personalized workout plan!
            </Text>
            <View style={styles.suggestionGrid}>
              {[
                'How can I improve my strength?',
                'Create a workout plan for me',
                'What should I eat for muscle gain?',
                'Help me overcome a plateau',
              ].map((suggestion, idx) => (
                <TouchableOpacity 
                  key={idx} 
                  style={styles.suggestionChip}
                  onPress={() => {
                    setInput(suggestion);
                    void handleSend();
                  }}
                >
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <>
            {messages.map((msg) => (
              <View 
                key={msg.id} 
                style={[
                  styles.messageCard,
                  msg.role === 'user' ? styles.userMessage : styles.assistantMessage,
                ]}
              >
                <Text style={[
                  styles.messageText,
                  msg.role === 'user' ? styles.userMessageText : styles.assistantMessageText,
                ]}>
                  {msg.content}
                </Text>
                <Text style={[
                  styles.messageTime,
                  msg.role === 'user' ? styles.userMessageTime : styles.assistantMessageTime,
                ]}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            ))}
            {aiLoading && (
              <View style={[styles.messageCard, styles.assistantMessage]}>
                <ActivityIndicator size="small" color={Colors.accent} />
                <Text style={styles.loadingText}>Thinking...</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask your AI trainer..."
          placeholderTextColor={Colors.textTertiary}
          multiline
          maxLength={500}
          editable={!aiLoading}
        />
        <TouchableOpacity 
          style={[styles.sendBtn, (!input.trim() || aiLoading) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || aiLoading}
        >
          <Send size={20} color={Colors.background} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16, 
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerContent: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 18, fontWeight: '800' as const, color: Colors.text },
  headerActions: { flexDirection: 'row', gap: 8 },
  clearBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  genWorkoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutGenCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  workoutGenHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  workoutGenTitle: { fontSize: 16, fontWeight: '800' as const, color: Colors.text },
  workoutGenSubtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: 12, lineHeight: 18 },
  workoutInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    color: Colors.text,
    fontSize: 14,
    marginBottom: 12,
  },
  workoutGenRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  workoutGenLabel: { fontSize: 12, fontWeight: '700' as const, color: Colors.textSecondary, marginBottom: 6, textTransform: 'uppercase' as const },
  workoutGenInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    color: Colors.text,
    fontSize: 14,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  generateBtnDisabled: { opacity: 0.6 },
  generateBtnText: { color: Colors.background, fontSize: 14, fontWeight: '800' as const },
  chatContainer: { flex: 1 },
  chatContent: { padding: 16, gap: 12 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 22, fontWeight: '800' as const, color: Colors.text, marginTop: 20, marginBottom: 8, textAlign: 'center' },
  emptyText: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  suggestionGrid: { gap: 10, width: '100%' },
  suggestionChip: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  suggestionText: { color: Colors.text, fontSize: 14, fontWeight: '600' as const, textAlign: 'center' },
  messageCard: {
    maxWidth: '80%',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.accent,
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userMessageText: { color: Colors.background },
  assistantMessageText: { color: Colors.text },
  messageTime: {
    fontSize: 11,
    marginTop: 6,
    fontWeight: '600' as const,
  },
  userMessageTime: { color: Colors.background, opacity: 0.7 },
  assistantMessageTime: { color: Colors.textTertiary },
  loadingText: { color: Colors.textSecondary, fontSize: 14, marginTop: 4, fontStyle: 'italic' as const },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
});
