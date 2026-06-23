import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNotifications } from './NotificationsContext';
import { getFirebaseDb } from '@/lib/firebase-client';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';

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
  media?: {
    type: 'image' | 'video';
    uri: string;
    width?: number;
    height?: number;
  };
}

export interface Channel {
  id: string;
  name: string;
  description: string;
  icon: string;
  isPrivate: boolean;
  slowMode: number;
  slowModeUnit: 'seconds' | 'minutes' | 'hours' | 'days';
  members: string[];
  bannedUsers: string[];
  mutedUsers: Record<string, number>;
  createdAt: string;
  createdBy: string;
  allowImages: boolean;
  allowVideos: boolean;
  maxImageSizeMB: number;
  maxVideoSizeMB: number;
  maxVideoDurationSeconds: number;
  autoDeleteMedia: boolean;
  autoDeleteDuration: number;
  autoDeleteUnit: 'hours' | 'days';
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

const FS_CHANNELS = 'channels';
const fsMessagesPath = (channelId: string) => `${FS_CHANNELS}/${channelId}/messages`;

export const [CommunityProvider, useCommunity] = createContextHook(() => {
  const { createNotification } = useNotifications();
  const [channels, setChannels] = useState<Channel[]>([
    {
      id: 'general',
      name: 'general',
      description: 'General discussion for all warriors',
      icon: '💬',
      isPrivate: false,
      slowMode: 0,
      slowModeUnit: 'seconds',
      members: [],
      bannedUsers: [],
      mutedUsers: {},
      createdAt: new Date().toISOString(),
      createdBy: 'admin',
      allowImages: true,
      allowVideos: true,
      maxImageSizeMB: 10,
      maxVideoSizeMB: 50,
      maxVideoDurationSeconds: 60,
      autoDeleteMedia: false,
      autoDeleteDuration: 24,
      autoDeleteUnit: 'hours',
    },
  ]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userStatuses, setUserStatuses] = useState<Record<string, UserStatus>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('[Community] Loading data...');
        const db = getFirebaseDb();

        // Load channels — prefer Firestore, fall back to AsyncStorage
        let channelsLoaded = false;
        if (db) {
          try {
            const snap = await getDocs(collection(db, FS_CHANNELS));
            if (!snap.empty) {
              const fsChannels = snap.docs.map(d => d.data() as Channel);
              setChannels(fsChannels);
              await AsyncStorage.setItem(STORAGE_KEYS.CHANNELS, JSON.stringify(fsChannels));
              channelsLoaded = true;
            }
          } catch (e) {
            console.error('[Community] Firestore channels load failed:', e);
          }
        }
        if (!channelsLoaded) {
          const stored = await AsyncStorage.getItem(STORAGE_KEYS.CHANNELS);
          if (stored) setChannels(JSON.parse(stored));
        }

        // Load messages — prefer Firestore (last 500 across all channels), fall back to AsyncStorage
        let messagesLoaded = false;
        if (db) {
          try {
            // Load messages from each channel
            const channelSnap = await getDocs(collection(db, FS_CHANNELS));
            const allMessages: Message[] = [];
            for (const channelDoc of channelSnap.docs) {
              const msgSnap = await getDocs(
                query(collection(db, fsMessagesPath(channelDoc.id)), orderBy('timestamp', 'asc'), limit(200))
              );
              msgSnap.docs.forEach(d => allMessages.push(d.data() as Message));
            }
            if (allMessages.length > 0) {
              setMessages(allMessages);
              await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(allMessages));
              messagesLoaded = true;
            }
          } catch (e) {
            console.error('[Community] Firestore messages load failed:', e);
          }
        }
        if (!messagesLoaded) {
          const stored = await AsyncStorage.getItem(STORAGE_KEYS.MESSAGES);
          if (stored) setMessages(JSON.parse(stored));
        }

        // User statuses — AsyncStorage only (admin-managed)
        const storedStatuses = await AsyncStorage.getItem(STORAGE_KEYS.USER_STATUSES);
        if (storedStatuses) setUserStatuses(JSON.parse(storedStatuses));

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
    createdBy: string,
    options?: {
      slowMode?: number;
      slowModeUnit?: 'seconds' | 'minutes' | 'hours' | 'days';
      allowImages?: boolean;
      allowVideos?: boolean;
      maxImageSizeMB?: number;
      maxVideoSizeMB?: number;
      maxVideoDurationSeconds?: number;
      autoDeleteMedia?: boolean;
      autoDeleteDuration?: number;
      autoDeleteUnit?: 'hours' | 'days';
    }
  ) => {
    const newChannel: Channel = {
      id: `ch-${Date.now()}`,
      name: name.toLowerCase().replace(/\s+/g, '-'),
      description,
      icon,
      isPrivate,
      slowMode: options?.slowMode || 0,
      slowModeUnit: options?.slowModeUnit || 'seconds',
      members: [],
      bannedUsers: [],
      mutedUsers: {},
      createdAt: new Date().toISOString(),
      createdBy,
      allowImages: options?.allowImages ?? true,
      allowVideos: options?.allowVideos ?? true,
      maxImageSizeMB: options?.maxImageSizeMB || 10,
      maxVideoSizeMB: options?.maxVideoSizeMB || 50,
      maxVideoDurationSeconds: options?.maxVideoDurationSeconds || 60,
      autoDeleteMedia: options?.autoDeleteMedia ?? false,
      autoDeleteDuration: options?.autoDeleteDuration || 24,
      autoDeleteUnit: options?.autoDeleteUnit || 'hours',
    };

    const updated = [...channels, newChannel];
    setChannels(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.CHANNELS, JSON.stringify(updated));
    const db = getFirebaseDb();
    if (db) {
      try {
        await setDoc(doc(db, FS_CHANNELS, newChannel.id), { ...newChannel, _syncedAt: new Date().toISOString() });
      } catch (e) {
        console.error('[Community] Firestore channel create failed:', e);
      }
    }
    console.log('[Community] Channel created:', newChannel.id);
    return newChannel;
  }, [channels]);

  const updateChannel = useCallback(async (channelId: string, updates: Partial<Channel>) => {
    const updated = channels.map(ch => ch.id === channelId ? { ...ch, ...updates } : ch);
    setChannels(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.CHANNELS, JSON.stringify(updated));
    const db = getFirebaseDb();
    if (db) {
      try {
        await setDoc(doc(db, FS_CHANNELS, channelId), { ...updates, _syncedAt: new Date().toISOString() }, { merge: true });
      } catch (e) {
        console.error('[Community] Firestore channel update failed:', e);
      }
    }
    console.log('[Community] Channel updated:', channelId);
    return updated.find(ch => ch.id === channelId);
  }, [channels]);

  const deleteChannel = useCallback(async (channelId: string) => {
    const updated = channels.filter(ch => ch.id !== channelId);
    setChannels(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.CHANNELS, JSON.stringify(updated));

    const updatedMessages = messages.filter(m => m.channelId !== channelId);
    setMessages(updatedMessages);
    await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(updatedMessages));

    const db = getFirebaseDb();
    if (db) {
      try {
        await deleteDoc(doc(db, FS_CHANNELS, channelId));
      } catch (e) {
        console.error('[Community] Firestore channel delete failed:', e);
      }
    }

    console.log('[Community] Channel deleted:', channelId);
  }, [channels, messages]);

  const sendMessage = useCallback(async (
    channelId: string,
    userId: string,
    userName: string,
    userAvatar: string,
    content: string,
    replyToId?: string,
    mentions?: string[],
    media?: {
      type: 'image' | 'video';
      uri: string;
      width?: number;
      height?: number;
    }
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
        
        let slowModeMs = channel.slowMode * 1000;
        switch (channel.slowModeUnit) {
          case 'minutes':
            slowModeMs = channel.slowMode * 60 * 1000;
            break;
          case 'hours':
            slowModeMs = channel.slowMode * 60 * 60 * 1000;
            break;
          case 'days':
            slowModeMs = channel.slowMode * 24 * 60 * 60 * 1000;
            break;
          case 'seconds':
          default:
            slowModeMs = channel.slowMode * 1000;
            break;
        }
        
        if (timeSinceLastMessage < slowModeMs) {
          const remainingMs = slowModeMs - timeSinceLastMessage;
          const remainingSeconds = Math.ceil(remainingMs / 1000);
          const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
          const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
          const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
          
          let errorMessage = '';
          switch (channel.slowModeUnit) {
            case 'days':
              errorMessage = `Slow mode: Wait ${remainingDays} day${remainingDays > 1 ? 's' : ''} before posting again`;
              break;
            case 'hours':
              errorMessage = `Slow mode: Wait ${remainingHours} hour${remainingHours > 1 ? 's' : ''} before posting again`;
              break;
            case 'minutes':
              errorMessage = `Slow mode: Wait ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''} before posting again`;
              break;
            case 'seconds':
            default:
              errorMessage = `Slow mode: Wait ${remainingSeconds}s before posting again`;
              break;
          }
          
          throw new Error(errorMessage);
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
      media,
    };

    const updated = [...messages, newMessage];
    setMessages(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(updated));
    const db = getFirebaseDb();
    if (db) {
      try {
        await setDoc(
          doc(db, fsMessagesPath(channelId), newMessage.id),
          { ...newMessage, _syncedAt: new Date().toISOString() }
        );
      } catch (e) {
        console.error('[Community] Firestore message send failed:', e);
      }
    }
    console.log('[Community] Message sent:', newMessage.id);

    const channelMembers = channel.members.filter(memberId => memberId !== userId);
    for (const memberId of channelMembers) {
      try {
        await createNotification(
          memberId,
          'general',
          `New message in #${channel.name}`,
          `${userName}: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`,
          {
            channelId,
            messageId: newMessage.id,
            type: 'channel_message',
          }
        );
      } catch (error) {
        console.error('[Community] Failed to send notification:', error);
      }
    }

    if (mentions && mentions.length > 0) {
      for (const mentionName of mentions) {
        const mentionedUserData = await AsyncStorage.getItem('all_users');
        if (mentionedUserData) {
          const allUsers = JSON.parse(mentionedUserData);
          const mentionedUser = allUsers.find((u: any) => u.name === mentionName);
          if (mentionedUser && mentionedUser.id !== userId) {
            try {
              await createNotification(
                mentionedUser.id,
                'general',
                `You were mentioned in #${channel.name}`,
                `${userName} mentioned you: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`,
                {
                  channelId,
                  messageId: newMessage.id,
                  type: 'mention',
                }
              );
            } catch (error) {
              console.error('[Community] Failed to send mention notification:', error);
            }
          }
        }
      }
    }

    return newMessage;
  }, [channels, messages, userStatuses, createNotification]);

  const editMessage = useCallback(async (messageId: string, newContent: string, userId: string) => {
    const target = messages.find(m => m.id === messageId);
    const updated = messages.map(m => {
      if (m.id === messageId && m.userId === userId) {
        return { ...m, content: newContent, isEdited: true };
      }
      return m;
    });
    setMessages(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(updated));
    if (target) {
      const db = getFirebaseDb();
      if (db) {
        try {
          await updateDoc(doc(db, fsMessagesPath(target.channelId), messageId), { content: newContent, isEdited: true, _syncedAt: new Date().toISOString() });
        } catch (e) {
          console.error('[Community] Firestore message edit failed:', e);
        }
      }
    }
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
    const db = getFirebaseDb();
    if (db) {
      try {
        await updateDoc(doc(db, fsMessagesPath(message.channelId), messageId), { content: '[Deleted]', isDeleted: true, _syncedAt: new Date().toISOString() });
      } catch (e) {
        console.error('[Community] Firestore message delete failed:', e);
      }
    }
    console.log('[Community] Message deleted:', messageId);
  }, [messages]);

  const addReaction = useCallback(async (messageId: string, emoji: string, userId: string) => {
    let target: Message | undefined;
    const updated = messages.map(m => {
      if (m.id === messageId) {
        const reactions = { ...m.reactions };
        if (!reactions[emoji]) reactions[emoji] = [];
        if (!reactions[emoji].includes(userId)) reactions[emoji] = [...reactions[emoji], userId];
        target = { ...m, reactions };
        return target;
      }
      return m;
    });
    setMessages(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(updated));
    if (target) {
      const db = getFirebaseDb();
      if (db) {
        try {
          await updateDoc(doc(db, fsMessagesPath(target.channelId), messageId), { reactions: target.reactions, _syncedAt: new Date().toISOString() });
        } catch (e) {
          console.error('[Community] Firestore reaction add failed:', e);
        }
      }
    }
  }, [messages]);

  const removeReaction = useCallback(async (messageId: string, emoji: string, userId: string) => {
    let target: Message | undefined;
    const updated = messages.map(m => {
      if (m.id === messageId) {
        const reactions = { ...m.reactions };
        if (reactions[emoji]) {
          reactions[emoji] = reactions[emoji].filter(id => id !== userId);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        }
        target = { ...m, reactions };
        return target;
      }
      return m;
    });
    setMessages(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(updated));
    if (target) {
      const db = getFirebaseDb();
      if (db) {
        try {
          await updateDoc(doc(db, fsMessagesPath(target.channelId), messageId), { reactions: target.reactions, _syncedAt: new Date().toISOString() });
        } catch (e) {
          console.error('[Community] Firestore reaction remove failed:', e);
        }
      }
    }
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

  const setSlowMode = useCallback(async (
    channelId: string,
    value: number,
    unit: 'seconds' | 'minutes' | 'hours' | 'days'
  ) => {
    await updateChannel(channelId, { slowMode: value, slowModeUnit: unit });
    console.log('[Community] Slow mode set:', channelId, value, unit);
  }, [updateChannel]);

  const joinChannel = useCallback(async (channelId: string, userId: string) => {
    const channel = channels.find(ch => ch.id === channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    if (channel.members.includes(userId)) {
      console.log('[Community] User already in channel');
      return;
    }

    const updatedMembers = [...channel.members, userId];
    await updateChannel(channelId, { members: updatedMembers });
    console.log('[Community] User joined channel:', userId, channelId);
  }, [channels, updateChannel]);

  const leaveChannel = useCallback(async (channelId: string, userId: string) => {
    const channel = channels.find(ch => ch.id === channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    const updatedMembers = channel.members.filter(id => id !== userId);
    await updateChannel(channelId, { members: updatedMembers });
    console.log('[Community] User left channel:', userId, channelId);
  }, [channels, updateChannel]);

  const getChannelMessages = useCallback((channelId: string) => {
    return messages
      .filter(m => m.channelId === channelId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [messages]);

  const getUserStatus = useCallback((userId: string) => {
    return userStatuses[userId] || { userId, isBanned: false, isMuted: false };
  }, [userStatuses]);

  const cleanupOldMedia = useCallback(async () => {
    console.log('[Community] Running media cleanup...');
    
    const now = Date.now();
    let deletedCount = 0;
    
    const updatedMessages = messages.map(message => {
      if (!message.media) return message;
      
      const channel = channels.find(ch => ch.id === message.channelId);
      if (!channel || !channel.autoDeleteMedia) return message;
      
      const messageTime = new Date(message.timestamp).getTime();
      const durationMs = channel.autoDeleteUnit === 'hours'
        ? channel.autoDeleteDuration * 60 * 60 * 1000
        : channel.autoDeleteDuration * 24 * 60 * 60 * 1000;
      
      if (now - messageTime > durationMs) {
        console.log(`[Community] Deleting media from message ${message.id} (age: ${Math.floor((now - messageTime) / 1000 / 60)} minutes)`);
        deletedCount++;
        return { ...message, media: undefined };
      }
      
      return message;
    });
    
    if (deletedCount > 0) {
      setMessages(updatedMessages);
      await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(updatedMessages));
      console.log(`[Community] Deleted ${deletedCount} media files`);
    } else {
      console.log('[Community] No media files to delete');
    }
    
    return deletedCount;
  }, [messages, channels]);

  useEffect(() => {
    const interval = setInterval(() => {
      void cleanupOldMedia();
    }, 60 * 1000);

    void cleanupOldMedia();

    return () => clearInterval(interval);
  }, [cleanupOldMedia]);

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
      joinChannel,
      leaveChannel,
      getChannelMessages,
      getUserStatus,
      cleanupOldMedia,
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
      joinChannel,
      leaveChannel,
      getChannelMessages,
      getUserStatus,
      cleanupOldMedia,
    ]
  );
});

export type CommunityContextType = ReturnType<typeof useCommunity>;
