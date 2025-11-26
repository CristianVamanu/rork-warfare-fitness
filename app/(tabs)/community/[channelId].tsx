import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Send, Smile, ChevronLeft, Hash, Clock, Reply, X, AtSign } from 'lucide-react-native';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Alert, Modal, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useState, useRef, useEffect } from 'react';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useCommunity, Message } from '@/contexts/CommunityContext';
import { getValidImageUri } from '@/lib/image-utils';

const EMOJI_REACTIONS = ['👍', '❤️', '😂', '🔥', '💪', '🎯', '⚡'];

export default function ChannelChatScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const {
    channels,
    sendMessage,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    getChannelMessages,
    banUser,
    muteUser,
  } = useCommunity();

  const [messageText, setMessageText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showUserActions, setShowUserActions] = useState<string | null>(null);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const scrollViewRef = useRef<ScrollView>(null);
  const textInputRef = useRef<TextInput>(null);
  const [allUsers, setAllUsers] = useState<Array<{ id: string; name: string; avatar?: string }>>([]);

  const channel = channels.find(ch => ch.id === channelId);
  const messages = getChannelMessages(channelId || '');

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersData = await AsyncStorage.getItem('all_users');
        if (usersData) {
          setAllUsers(JSON.parse(usersData));
        }
      } catch (error) {
        console.error('[ChannelChat] Failed to load users:', error);
      }
    };
    void loadUsers();
  }, []);

  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const extractMentions = (text: string): string[] => {
    const mentionRegex = /@(\w+)/g;
    const matches = text.match(mentionRegex);
    return matches ? matches.map(m => m.substring(1)) : [];
  };

  const handleTextChange = (text: string) => {
    setMessageText(text);

    const lastAtIndex = text.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const textAfterAt = text.substring(lastAtIndex + 1);
      if (!textAfterAt.includes(' ') && textAfterAt.length <= 20) {
        setMentionStartIndex(lastAtIndex);
        setMentionSearch(textAfterAt.toLowerCase());
        setShowMentionSuggestions(true);
        return;
      }
    }
    
    setShowMentionSuggestions(false);
    setMentionStartIndex(-1);
    setMentionSearch('');
  };

  const handleSelectMention = (userName: string) => {
    if (mentionStartIndex === -1) return;

    const beforeMention = messageText.substring(0, mentionStartIndex);
    const afterMention = messageText.substring(mentionStartIndex + mentionSearch.length + 1);
    const newText = `${beforeMention}@${userName} ${afterMention}`;
    
    setMessageText(newText);
    setShowMentionSuggestions(false);
    setMentionStartIndex(-1);
    setMentionSearch('');
    textInputRef.current?.focus();
  };

  const filteredUsers = showMentionSuggestions
    ? allUsers
        .filter(u => u.name.toLowerCase().includes(mentionSearch))
        .slice(0, 5)
    : [];

  const handleSendMessage = async () => {
    if (!messageText.trim() || !user || !channelId) return;

    try {
      const mentions = extractMentions(messageText);
      
      if (editingMessageId) {
        await editMessage(editingMessageId, messageText, user.id);
        setEditingMessageId(null);
        setReplyingTo(null);
      } else {
        await sendMessage(
          channelId,
          user.id,
          user.name,
          user.avatar || '',
          messageText,
          replyingTo?.id,
          mentions.length > 0 ? mentions : undefined
        );
        setReplyingTo(null);
      }
      setMessageText('');
    } catch (error) {
      Alert.alert('Error', String(error));
    }
  };

  const handleReplyToMessage = (message: Message) => {
    setReplyingTo(message);
    setSelectedMessage(null);
    textInputRef.current?.focus();
  };

  const handleEditMessage = (message: Message) => {
    setMessageText(message.content);
    setEditingMessageId(message.id);
    setReplyingTo(null);
    setSelectedMessage(null);
    textInputRef.current?.focus();
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!user) return;
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteMessage(messageId, user.id, user.isAdmin);
            setSelectedMessage(null);
          },
        },
      ]
    );
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    
    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    const hasReacted = message.reactions[emoji]?.includes(user.id);
    if (hasReacted) {
      await removeReaction(messageId, emoji, user.id);
    } else {
      await addReaction(messageId, emoji, user.id);
    }
    setSelectedMessage(null);
  };

  const handleBanUser = async (userId: string, userName: string) => {
    if (!user?.isAdmin || !channelId) return;
    
    Alert.alert(
      'Ban User',
      `Are you sure you want to ban ${userName} from this channel?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ban',
          style: 'destructive',
          onPress: async () => {
            await banUser(userId, channelId, 'Banned by admin');
            setShowUserActions(null);
            Alert.alert('Success', `${userName} has been banned from this channel`);
          },
        },
      ]
    );
  };

  const handleMuteUser = async (userId: string, userName: string) => {
    if (!user?.isAdmin || !channelId) return;
    
    Alert.alert(
      'Mute User',
      'How long do you want to mute this user?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: '5 minutes',
          onPress: async () => {
            await muteUser(userId, channelId, 5);
            setShowUserActions(null);
            Alert.alert('Success', `${userName} has been muted for 5 minutes`);
          },
        },
        {
          text: '1 hour',
          onPress: async () => {
            await muteUser(userId, channelId, 60);
            setShowUserActions(null);
            Alert.alert('Success', `${userName} has been muted for 1 hour`);
          },
        },
        {
          text: '24 hours',
          onPress: async () => {
            await muteUser(userId, channelId, 1440);
            setShowUserActions(null);
            Alert.alert('Success', `${userName} has been muted for 24 hours`);
          },
        },
      ]
    );
  };

  const renderMessageContent = (content: string) => {
    const parts = content.split(/(@\w+)/g);
    return (
      <Text style={styles.messageText}>
        {parts.map((part, index) => {
          if (part.startsWith('@')) {
            return (
              <Text key={index} style={styles.mention}>
                {part}
              </Text>
            );
          }
          return <Text key={index}>{part}</Text>;
        })}
      </Text>
    );
  };

  if (!channel) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Channel not found</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.channelInfo}>
          <Text style={styles.channelIcon}>{channel.icon}</Text>
          <View>
            <View style={styles.channelNameRow}>
              <Hash size={16} color={Colors.accent} />
              <Text style={styles.channelName}>{channel.name}</Text>
              {channel.slowMode > 0 && (
                <View style={styles.slowModeBadge}>
                  <Clock size={10} color={Colors.warning} />
                  <Text style={styles.slowModeText}>{channel.slowMode}s</Text>
                </View>
              )}
            </View>
            <Text style={styles.channelDescription} numberOfLines={1}>
              {channel.description}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((message) => {
          const isOwnMessage = message.userId === user?.id;
          const reactionKeys = Object.keys(message.reactions);

          return (
            <View key={message.id} style={styles.messageWrapper}>
              <TouchableOpacity
                style={[styles.messageContainer, isOwnMessage && styles.ownMessage]}
                onLongPress={() => setSelectedMessage(message.id)}
              >
                <TouchableOpacity
                  onPress={() => user?.isAdmin && setShowUserActions(message.userId)}
                >
                  <Image
                    source={{ uri: getValidImageUri(message.userAvatar) }}
                    style={styles.avatar}
                    contentFit="cover"
                  />
                </TouchableOpacity>

                <View style={styles.messageContent}>
                  <View style={styles.messageHeader}>
                    <Text style={styles.userName}>{message.userName}</Text>
                    <Text style={styles.timestamp}>
                      {new Date(message.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  
                  {message.replyToId && message.replyToUserName && (
                    <View style={styles.replyPreview}>
                      <Reply size={12} color={Colors.textTertiary} />
                      <Text style={styles.replyPreviewText} numberOfLines={1}>
                        <Text style={styles.replyPreviewUser}>@{message.replyToUserName}</Text>
                        {': '}
                        {message.replyToContent}
                      </Text>
                    </View>
                  )}

                  <View style={[styles.messageBubble, isOwnMessage && styles.ownMessageBubble]}>
                    {message.isDeleted ? (
                      <Text style={styles.deletedText}>{message.content}</Text>
                    ) : (
                      renderMessageContent(message.content)
                    )}
                    {message.isEdited && !message.isDeleted && (
                      <Text style={styles.editedLabel}>(edited)</Text>
                    )}
                  </View>
                  {reactionKeys.length > 0 && (
                    <View style={styles.reactionsContainer}>
                      {reactionKeys.map((emoji) => (
                        <TouchableOpacity
                          key={emoji}
                          style={[
                            styles.reactionBadge,
                            message.reactions[emoji]?.includes(user?.id || '') &&
                              styles.reactionBadgeActive,
                          ]}
                          onPress={() => handleReaction(message.id, emoji)}
                        >
                          <Text style={styles.reactionEmoji}>{emoji}</Text>
                          <Text style={styles.reactionCount}>
                            {message.reactions[emoji]?.length || 0}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>

      {showMentionSuggestions && filteredUsers.length > 0 && (
        <View style={styles.mentionSuggestionsContainer}>
          <View style={styles.mentionSuggestionsHeader}>
            <AtSign size={16} color={Colors.accent} />
            <Text style={styles.mentionSuggestionsTitle}>Mention User</Text>
          </View>
          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.mentionSuggestionsList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.mentionSuggestionItem}
                onPress={() => handleSelectMention(item.name)}
              >
                <Image
                  source={{ uri: getValidImageUri(item.avatar || '') }}
                  style={styles.mentionSuggestionAvatar}
                  contentFit="cover"
                />
                <Text style={styles.mentionSuggestionName}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      <View style={styles.inputContainer}>
        {replyingTo && (
          <View style={styles.replyBanner}>
            <Reply size={16} color={Colors.accent} />
            <View style={styles.replyBannerContent}>
              <Text style={styles.replyBannerUser}>Replying to @{replyingTo.userName}</Text>
              <Text style={styles.replyBannerText} numberOfLines={1}>
                {replyingTo.content}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyBannerClose}>
              <X size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
        {editingMessageId && (
          <View style={styles.editingBanner}>
            <Text style={styles.editingText}>Editing message</Text>
            <TouchableOpacity onPress={() => {
              setEditingMessageId(null);
              setMessageText('');
            }}>
              <Text style={styles.cancelEdit}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputRow}>
          <TouchableOpacity
            style={styles.emojiButton}
            onPress={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            <Smile size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TextInput
            ref={textInputRef}
            style={styles.input}
            value={messageText}
            onChangeText={handleTextChange}
            placeholder={replyingTo ? `Reply to ${replyingTo.userName}...` : `Message #${channel.name}`}
            placeholderTextColor={Colors.textTertiary}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, !messageText.trim() && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={!messageText.trim()}
          >
            <Send size={20} color={messageText.trim() ? Colors.accent : Colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={selectedMessage !== null} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedMessage(null)}
        >
          <View style={styles.messageActionsModal}>
            <Text style={styles.modalTitle}>Message Actions</Text>
            <View style={styles.reactionsRow}>
              {EMOJI_REACTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.emojiOption}
                  onPress={() => selectedMessage && handleReaction(selectedMessage, emoji)}
                >
                  <Text style={styles.emojiOptionText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedMessage && (
              <>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => {
                    const msg = messages.find(m => m.id === selectedMessage);
                    if (msg) handleReplyToMessage(msg);
                  }}
                >
                  <Reply size={18} color={Colors.accent} />
                  <Text style={styles.actionButtonText}>Reply</Text>
                </TouchableOpacity>
                {messages.find(m => m.id === selectedMessage)?.userId === user?.id && (
                  <>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => {
                        const msg = messages.find(m => m.id === selectedMessage);
                        if (msg) handleEditMessage(msg);
                      }}
                    >
                      <Text style={styles.actionButtonText}>Edit Message</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.actionButtonDanger]}
                      onPress={() => selectedMessage && handleDeleteMessage(selectedMessage)}
                    >
                      <Text style={[styles.actionButtonText, styles.actionButtonTextDanger]}>
                        Delete Message
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
                {user?.isAdmin && messages.find(m => m.id === selectedMessage)?.userId !== user.id && (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonDanger]}
                    onPress={() => selectedMessage && handleDeleteMessage(selectedMessage)}
                  >
                    <Text style={[styles.actionButtonText, styles.actionButtonTextDanger]}>
                      Delete Message (Admin)
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setSelectedMessage(null)}
            >
              <Text style={styles.actionButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showUserActions !== null} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowUserActions(null)}
        >
          <View style={styles.userActionsModal}>
            <Text style={styles.modalTitle}>User Actions</Text>
            {showUserActions && (
              <>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => {
                    const msg = messages.find(m => m.userId === showUserActions);
                    if (msg) handleMuteUser(showUserActions, msg.userName);
                  }}
                >
                  <Text style={styles.actionButtonText}>Mute User</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionButtonDanger]}
                  onPress={() => {
                    const msg = messages.find(m => m.userId === showUserActions);
                    if (msg) handleBanUser(showUserActions, msg.userName);
                  }}
                >
                  <Text style={[styles.actionButtonText, styles.actionButtonTextDanger]}>
                    Ban User
                  </Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setShowUserActions(null)}
            >
              <Text style={styles.actionButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  channelInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  channelIcon: {
    fontSize: 24,
  },
  channelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  channelName: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  slowModeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: `${Colors.warning}20`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  slowModeText: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: Colors.warning,
  },
  channelDescription: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  messageWrapper: {
    marginBottom: 16,
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  ownMessage: {
    flexDirection: 'row-reverse',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
  },
  messageContent: {
    flex: 1,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  timestamp: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: Colors.surfaceLight,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    borderRadius: 6,
    marginBottom: 4,
  },
  replyPreviewText: {
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
  },
  replyPreviewUser: {
    fontWeight: '700' as const,
    color: Colors.accent,
  },
  messageBubble: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ownMessageBubble: {
    backgroundColor: `${Colors.accent}20`,
    borderColor: Colors.accent,
  },
  messageText: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 20,
  },
  mention: {
    color: Colors.accent,
    fontWeight: '700' as const,
  },
  deletedText: {
    fontStyle: 'italic' as const,
    color: Colors.textTertiary,
    fontSize: 15,
  },
  editedLabel: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 4,
    fontStyle: 'italic' as const,
  },
  reactionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reactionBadgeActive: {
    backgroundColor: `${Colors.accent}20`,
    borderColor: Colors.accent,
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  mentionSuggestionsContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingVertical: 12,
  },
  mentionSuggestionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  mentionSuggestionsTitle: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
  },
  mentionSuggestionsList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  mentionSuggestionItem: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  mentionSuggestionAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
  },
  mentionSuggestionName: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  inputContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: `${Colors.accent}10`,
    borderBottomWidth: 1,
    borderBottomColor: Colors.accent,
  },
  replyBannerContent: {
    flex: 1,
  },
  replyBannerUser: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.accent,
  },
  replyBannerText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  replyBannerClose: {
    padding: 4,
  },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: `${Colors.accent}10`,
    borderBottomWidth: 1,
    borderBottomColor: Colors.accent,
  },
  editingText: {
    fontSize: 13,
    color: Colors.accent,
    fontWeight: '600' as const,
  },
  cancelEdit: {
    fontSize: 13,
    color: Colors.danger,
    fontWeight: '600' as const,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  emojiButton: {
    padding: 4,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  sendButtonDisabled: {
    borderColor: Colors.border,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  messageActionsModal: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  userActionsModal: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  reactionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  emojiOption: {
    padding: 8,
  },
  emojiOptionText: {
    fontSize: 32,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceLight,
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 8,
  },
  actionButtonDanger: {
    backgroundColor: `${Colors.danger}20`,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  actionButtonTextDanger: {
    color: Colors.danger,
  },
  errorText: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 40,
  },
});
