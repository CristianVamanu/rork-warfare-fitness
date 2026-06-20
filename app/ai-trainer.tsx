import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Brain, ArrowLeft, Send } from 'lucide-react-native';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { trpc } from '@/lib/trpc';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

const QUICK_PROMPTS = [
  'Create me a workout',
  'Best foods for muscle gain',
  'How to recover faster',
  'Motivation for today',
  'Fix my squat form',
];

const WELCOME_MESSAGE: Message = {
  role: 'assistant',
  content: 'At ease, Soldier. I\'m Commander AI — your elite fitness coach. What\'s your mission today?',
};

export default function AITrainerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, adminSettings } = useApp();
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const chatMutation = trpc.aiTrainer.chat.useMutation();

  const userContext = {
    age: user?.age,
    height: user?.height,
    weight: user?.weight,
    goal: user?.goal,
    role: user?.isTrainer ? 'trainer' : 'warrior',
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || isTyping) return;
    const userMsg: Message = { role: 'user', content: content.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText('');
    setIsTyping(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const allUserMessages = updatedMessages.filter(m => m.role === 'user' || m.role === 'assistant');
      const result = await chatMutation.mutateAsync({
        messages: allUserMessages,
        userContext,
        apiKey: adminSettings.aiApiKey || undefined,
      });
      const aiMsg: Message = { role: 'assistant', content: result.message };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e: any) {
      const errMsg: Message = {
        role: 'assistant',
        content: `Mission failed, Soldier. ${e?.message ?? 'Unable to connect to Commander AI. Check your API key in settings.'}`,
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsTyping(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const showQuickPrompts = messages.length === 1;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Brain size={28} color={Colors.accent} />
          <View>
            <Text style={styles.headerTitle}>COMMANDER AI</Text>
            <Text style={styles.headerSubtitle}>Your Elite AI Coach</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.messagesArea}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {showQuickPrompts && (
          <View style={styles.quickPromptsContainer}>
            <Text style={styles.quickPromptsTitle}>QUICK MISSIONS</Text>
            <View style={styles.quickPromptsRow}>
              {QUICK_PROMPTS.map(prompt => (
                <TouchableOpacity
                  key={prompt}
                  style={styles.quickPromptChip}
                  onPress={() => sendMessage(prompt)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickPromptText}>{prompt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {messages.map((msg, i) => (
          <View key={i} style={[styles.messageBubbleWrapper, msg.role === 'user' ? styles.userWrapper : styles.aiWrapper]}>
            {msg.role === 'assistant' && (
              <View style={styles.botAvatar}>
                <Text style={styles.botAvatarText}>⚔️</Text>
              </View>
            )}
            <View style={[styles.messageBubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
              <Text style={[styles.messageText, msg.role === 'user' ? styles.userMessageText : styles.aiMessageText]}>
                {msg.content}
              </Text>
            </View>
          </View>
        ))}

        {isTyping && (
          <View style={[styles.messageBubbleWrapper, styles.aiWrapper]}>
            <View style={styles.botAvatar}>
              <Text style={styles.botAvatarText}>⚔️</Text>
            </View>
            <View style={[styles.messageBubble, styles.aiBubble, styles.typingBubble]}>
              <ActivityIndicator size="small" color={Colors.accent} />
              <Text style={styles.typingText}>typing...</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.textInput}
          placeholder="Ask Commander AI..."
          placeholderTextColor={Colors.textTertiary}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={500}
          onSubmitEditing={() => sendMessage(inputText)}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!inputText.trim() || isTyping) && styles.sendBtnDisabled]}
          onPress={() => sendMessage(inputText)}
          disabled={!inputText.trim() || isTyping}
          activeOpacity={0.8}
        >
          <Send size={20} color={Colors.background} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { color: Colors.text, fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  headerSubtitle: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  messagesArea: { flex: 1 },
  messagesContent: { padding: 16, gap: 12 },
  quickPromptsContainer: { marginBottom: 8 },
  quickPromptsTitle: { color: Colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  quickPromptsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickPromptChip: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickPromptText: { color: Colors.accent, fontSize: 13, fontWeight: '700' },
  messageBubbleWrapper: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  userWrapper: { justifyContent: 'flex-end' },
  aiWrapper: { justifyContent: 'flex-start' },
  botAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botAvatarText: { fontSize: 16 },
  messageBubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: Colors.accent,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderBottomLeftRadius: 4,
  },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  messageText: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  userMessageText: { color: Colors.background },
  aiMessageText: { color: Colors.text },
  typingText: { color: Colors.textSecondary, fontSize: 13, fontStyle: 'italic' },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 10,
    backgroundColor: Colors.background,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
});
