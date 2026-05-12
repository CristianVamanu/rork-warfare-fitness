import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type NotificationType = 'challenge_approved' | 'challenge_rejected' | 'general';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: any;
  read: boolean;
  timestamp: string;
}

const STORAGE_KEYS = {
  NOTIFICATIONS: 'warfare_notifications',
};

export const [NotificationsProvider, useNotifications] = createContextHook(() => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('[Notifications] Loading persisted data...');
        
        const storedNotifications = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
        if (storedNotifications) {
          try {
            setNotifications(JSON.parse(storedNotifications));
            console.log('[Notifications] Loaded notifications from storage');
          } catch (err) {
            console.error('[Notifications] Failed to parse notifications:', err);
          }
        }

        console.log('[Notifications] Data loaded successfully');
      } catch (error) {
        console.error('[Notifications] Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    void loadData();
  }, []);

  const createNotification = useCallback(async (
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: any
  ) => {
    const newNotification: Notification = {
      id: 'n-' + Date.now().toString(),
      userId,
      type,
      title,
      message,
      data,
      read: false,
      timestamp: new Date().toISOString(),
    };

    const updated = [newNotification, ...(notifications || [])];
    setNotifications(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(updated));
    console.log('[Notifications] Created notification:', newNotification.id);
    return newNotification;
  }, [notifications]);

  const markAsRead = useCallback(async (notificationId: string) => {
    const updated = (notifications || []).map(n => 
      n.id === notificationId ? { ...n, read: true } : n
    );
    setNotifications(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(updated));
    console.log('[Notifications] Marked notification as read:', notificationId);
  }, [notifications]);

  const markAllAsRead = useCallback(async (userId: string) => {
    const updated = (notifications || []).map(n => 
      n.userId === userId ? { ...n, read: true } : n
    );
    setNotifications(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(updated));
    console.log('[Notifications] Marked all notifications as read for user:', userId);
  }, [notifications]);

  const getUserNotifications = useCallback((userId: string) => {
    return (notifications || []).filter(n => n.userId === userId);
  }, [notifications]);

  const getUnreadCount = useCallback((userId: string) => {
    return (notifications || []).filter(n => n.userId === userId && !n.read).length;
  }, [notifications]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    const updated = (notifications || []).filter(n => n.id !== notificationId);
    setNotifications(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(updated));
    console.log('[Notifications] Deleted notification:', notificationId);
  }, [notifications]);

  const clearUserNotifications = useCallback(async (userId: string) => {
    const updated = (notifications || []).filter(n => n.userId !== userId);
    setNotifications(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(updated));
    console.log('[Notifications] Cleared all notifications for user:', userId);
  }, [notifications]);

  return useMemo(
    () => ({
      notifications,
      isLoading,
      createNotification,
      markAsRead,
      markAllAsRead,
      getUserNotifications,
      getUnreadCount,
      deleteNotification,
      clearUserNotifications,
    }),
    [
      notifications,
      isLoading,
      createNotification,
      markAsRead,
      markAllAsRead,
      getUserNotifications,
      getUnreadCount,
      deleteNotification,
      clearUserNotifications,
    ]
  );
});

export type NotificationsContextType = ReturnType<typeof useNotifications>;
