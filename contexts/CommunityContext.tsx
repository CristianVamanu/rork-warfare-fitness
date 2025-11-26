import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  timestamp: string;
  reactions: Record<string, string[]>;
  isEdited: boolean;
  isDeleted: boolean;
  replyToId?: string;
  replyToUserName?: string;
  replyToContent?: string;
  mentions?: string[];
}

export interface Channel {
  id: string;
  name: string;
  description: string;
  icon: string;
  isPrivate: boolean;
  slowMode: number;
  members: string[];
  bannedUsers: string[];
  mutedUsers: Record<string, number>;
  createdAt: string;
  createdBy: string;
}

export interface UserStatus {
  userId: string;
  isBanned: boolean;
  isMuted: boolean;
  mutedUntil?: number;
  bannedReason?: string;
}

const STORAGE_KEYS = {
  CHANNELS: 'community_channels',
  MESSAGES: 'community_messages',
  USER_STATUSES: 'community_user_statuses',
};

export const [CommunityProvider, useCommunity] = createContextHook(() => {
  const [channels, setChannels] = useState<Channel[]>([
    {
      id: 'general',
      name: 'general',
      description: 'General discussion for all warriors',
      icon: '💬',
      isPrivate: false,
      slowMode: 0,
      members: [],
      bannedUsers: [],
      mutedUsers: {},
      createdAt: new Date().toISOString(),
      createdBy: 'admin',
    },
  ]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userStatuses, setUserStatuses] = useState<Record<string, UserStatus>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('[Community] Loading data...');
        
        const storedChannels = await AsyncStorage.getItem(STORAGE_KEYS.CHANNELS);
        if (storedChannels) {
          setChannels(JSON.parse(storedChannels));
        }

        const storedMessages = await AsyncStorage.getItem(STORAGE_KEYS.MESSAGES);
        if (storedMessages) {
          setMessages(JSON.parse(storedMessages));
        }

        const storedStatuses = await AsyncStorage.getItem(STORAGE_KEYS.USER_STATUSES);
        if (storedStatuses) {
          setUserStatuses(JSON.parse(storedStatuses));
        }

        console.log('[Community] Data loaded');
      } catch (error) {
        console.error('[Community] Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
  }, []);

  const createChannel = useCallback(async (
    name: string,
    description: string,
    icon: string,
    isPrivate: boolean,
    createdBy: string
  ) => {
    const newChannel: Channel = {
      id: `ch-${Date.now()}`,
      name: name.toLowerCase().replace(/\s+/g, '-'),
      description,
      icon,
      isPrivate,
      slowMode: 0,
      members: [],
      bannedUsers: [],
      mutedUsers: {},
      createdAt: new Date().toISOString(),
      createdBy,
    };

    const updated = [...channels, newChannel];
    setChannels(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.CHANNELS, JSON.stringify(updated));
    console.log('[Community] Channel created:', newChannel.id);
    return newChannel;
  }, [channels]);

  const updateChannel = useCallback(async (channelId: string, updates: Partial<Channel>) => {
    const updated = channels.map(ch => ch.id === channelId ? { ...ch, ...updates } : ch);
    setChannels(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.CHANNELS, JSON.stringify(updated));
    console.log('[Community] Channel updated:', channelId);
  }, [channels]);

  const deleteChannel = useCallback(async (channelId: string) => {
    const updated = channels.filter(ch => ch.id !== channelId);
    setChannels(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.CHANNELS, JSON.stringify(updated));
    
    const updatedMessages = messages.filter(m => m.channelId !== channelId);
    setMessages(updatedMessages);
    await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(updatedMessages));
    
    console.log('[Community] Channel deleted:', channelId);
  }, [channels, messages]);

  const sendMessage = useCallback(async (
    channelId: string,
    userId: string,
    userName: string,
    userAvatar: string,
    content: string,
    replyToId?: string,
    mentions?: string[]
  ) => {
    const channel = channels.find(ch => ch.id === channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    if (channel.bannedUsers.includes(userId)) {
      throw new Error('You are banned from this channel');
    }

    const userStatus = userStatuses[userId];
    if (userStatus?.isMuted) {
      if (userStatus.mutedUntil && Date.now() < userStatus.mutedUntil) {
        throw new Error('You are muted');
      }
    }

    const mutedUntil = channel.mutedUsers[userId];
    if (mutedUntil && Date.now() < mutedUntil) {
      throw new Error('You are muted in this channel');
    }

    if (channel.slowMode > 0) {
      const userLastMessage = messages
        .filter(m => m.channelId === channelId && m.userId === userId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      
      if (userLastMessage) {
        const timeSinceLastMessage = Date.now() - new Date(userLastMessage.timestamp).getTime();
        if (timeSinceLastMessage < channel.slowMode * 1000) {
          const remaining = Math.ceil((channel.slowMode * 1000 - timeSinceLastMessage) / 1000);
          throw new Error(`Slow mode: Wait ${remaining}s before posting again`);
        }
      }
    }

    const replyToMessage = replyToId ? messages.find(m => m.id === replyToId) : undefined;

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      channelId,
      userId,
      userName,
      userAvatar,
      content,
      timestamp: new Date().toISOString(),
      reactions: {},
      isEdited: false,
      isDeleted: false,
      replyToId,
      replyToUserName: replyToMessage?.userName,
      replyToContent: replyToMessage?.content,
      mentions,
    };

    const updated = [...messages, newMessage];
    setMessages(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(updated));
    console.log('[Community] Message sent:', newMessage.id);
    return newMessage;
  }, [channels, messages, userStatuses]);

  const editMessage = useCallback(async (messageId: string, newContent: string, userId: string) => {
    const updated = messages.map(m => {
      if (m.id === messageId && m.userId === userId) {
        return { ...m, content: newContent, isEdited: true };
      }
      return m;
    });
    setMessages(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(updated));
    console.log('[Community] Message edited:', messageId);
  }, [messages]);

  const deleteMessage = useCallback(async (messageId: string, userId: string, isAdmin: boolean) => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    if (message.userId !== userId && !isAdmin) {
      throw new Error('You can only delete your own messages');
    }

    const updated = messages.map(m => {
      if (m.id === messageId) {
        return { ...m, content: '[Deleted]', isDeleted: true };
      }
      return m;
    });
    setMessages(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(updated));
    console.log('[Community] Message deleted:', messageId);
  }, [messages]);

  const addReaction = useCallback(async (messageId: string, emoji: string, userId: string) => {
    const updated = messages.map(m => {
      if (m.id === messageId) {
        const reactions = { ...m.reactions };
        if (!reactions[emoji]) {
          reactions[emoji] = [];
        }
        if (!reactions[emoji].includes(userId)) {
          reactions[emoji] = [...reactions[emoji], userId];
        }
        return { ...m, reactions };
      }
      return m;
    });
    setMessages(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(updated));
  }, [messages]);

  const removeReaction = useCallback(async (messageId: string, emoji: string, userId: string) => {
    const updated = messages.map(m => {
      if (m.id === messageId) {
        const reactions = { ...m.reactions };
        if (reactions[emoji]) {
          reactions[emoji] = reactions[emoji].filter(id => id !== userId);
          if (reactions[emoji].length === 0) {
            delete reactions[emoji];
          }
        }
        return { ...m, reactions };
      }
      return m;
    });
    setMessages(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(updated));
  }, [messages]);

  const banUser = useCallback(async (userId: string, channelId: string, reason?: string) => {
    const updated = channels.map(ch => {
      if (ch.id === channelId) {
        return {
          ...ch,
          bannedUsers: [...ch.bannedUsers, userId],
        };
      }
      return ch;
    });
    setChannels(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.CHANNELS, JSON.stringify(updated));

    const updatedStatuses = {
      ...userStatuses,
      [userId]: {
        userId,
        isBanned: true,
        isMuted: false,
        bannedReason: reason,
      },
    };
    setUserStatuses(updatedStatuses);
    await AsyncStorage.setItem(STORAGE_KEYS.USER_STATUSES, JSON.stringify(updatedStatuses));
    
    console.log('[Community] User banned:', userId);
  }, [channels, userStatuses]);

  const unbanUser = useCallback(async (userId: string, channelId: string) => {
    const updated = channels.map(ch => {
      if (ch.id === channelId) {
        return {
          ...ch,
          bannedUsers: ch.bannedUsers.filter(id => id !== userId),
        };
      }
      return ch;
    });
    setChannels(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.CHANNELS, JSON.stringify(updated));

    const updatedStatuses = { ...userStatuses };
    if (updatedStatuses[userId]) {
      updatedStatuses[userId] = {
        ...updatedStatuses[userId],
        isBanned: false,
        bannedReason: undefined,
      };
    }
    setUserStatuses(updatedStatuses);
    await AsyncStorage.setItem(STORAGE_KEYS.USER_STATUSES, JSON.stringify(updatedStatuses));
    
    console.log('[Community] User unbanned:', userId);
  }, [channels, userStatuses]);

  const muteUser = useCallback(async (userId: string, channelId: string, durationMinutes: number) => {
    const mutedUntil = Date.now() + (durationMinutes * 60 * 1000);
    
    const updated = channels.map(ch => {
      if (ch.id === channelId) {
        return {
          ...ch,
          mutedUsers: {
            ...ch.mutedUsers,
            [userId]: mutedUntil,
          },
        };
      }
      return ch;
    });
    setChannels(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.CHANNELS, JSON.stringify(updated));

    const updatedStatuses = {
      ...userStatuses,
      [userId]: {
        ...(userStatuses[userId] || { userId, isBanned: false, isMuted: false }),
        isMuted: true,
        mutedUntil,
      },
    };
    setUserStatuses(updatedStatuses);
    await AsyncStorage.setItem(STORAGE_KEYS.USER_STATUSES, JSON.stringify(updatedStatuses));
    
    console.log('[Community] User muted:', userId, 'until', new Date(mutedUntil));
  }, [channels, userStatuses]);

  const unmuteUser = useCallback(async (userId: string, channelId: string) => {
    const updated = channels.map(ch => {
      if (ch.id === channelId) {
        const mutedUsers = { ...ch.mutedUsers };
        delete mutedUsers[userId];
        return {
          ...ch,
          mutedUsers,
        };
      }
      return ch;
    });
    setChannels(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.CHANNELS, JSON.stringify(updated));

    const updatedStatuses = { ...userStatuses };
    if (updatedStatuses[userId]) {
      updatedStatuses[userId] = {
        ...updatedStatuses[userId],
        isMuted: false,
        mutedUntil: undefined,
      };
    }
    setUserStatuses(updatedStatuses);
    await AsyncStorage.setItem(STORAGE_KEYS.USER_STATUSES, JSON.stringify(updatedStatuses));
    
    console.log('[Community] User unmuted:', userId);
  }, [channels, userStatuses]);

  const setSlowMode = useCallback(async (channelId: string, seconds: number) => {
    await updateChannel(channelId, { slowMode: seconds });
    console.log('[Community] Slow mode set:', channelId, seconds);
  }, [updateChannel]);

  const getChannelMessages = useCallback((channelId: string) => {
    return messages
      .filter(m => m.channelId === channelId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [messages]);

  const getUserStatus = useCallback((userId: string) => {
    return userStatuses[userId] || { userId, isBanned: false, isMuted: false };
  }, [userStatuses]);

  return useMemo(
    () => ({
      isLoading,
      channels,
      messages,
      userStatuses,
      createChannel,
      updateChannel,
      deleteChannel,
      sendMessage,
      editMessage,
      deleteMessage,
      addReaction,
      removeReaction,
      banUser,
      unbanUser,
      muteUser,
      unmuteUser,
      setSlowMode,
      getChannelMessages,
      getUserStatus,
    }),
    [
      isLoading,
      channels,
      messages,
      userStatuses,
      createChannel,
      updateChannel,
      deleteChannel,
      sendMessage,
      editMessage,
      deleteMessage,
      addReaction,
      removeReaction,
      banUser,
      unbanUser,
      muteUser,
      unmuteUser,
      setSlowMode,
      getChannelMessages,
      getUserStatus,
    ]
  );
});

export type CommunityContextType = ReturnType<typeof useCommunity>;
