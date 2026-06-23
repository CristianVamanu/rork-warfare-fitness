/**
 * FirebaseContext — Storage operations and push notifications only.
 * Firebase is initialized exclusively from environment variables via
 * lib/firebase-client.ts. There is no runtime config, no admin override,
 * no AsyncStorage-based Firebase initialization.
 */
import createContextHook from '@nkzw/create-context-hook';
import { useState, useCallback, useMemo } from 'react';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

import { isFirebaseConfigured, getFirebaseApp, getFirebaseStorage } from '@/lib/firebase-client';

// Re-export for consumers that check isConfigured without importing firebase-client directly
export { isFirebaseConfigured };

// Kept for backward-compat with admin-settings imports; no longer stores any data.
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

interface FileUpload {
  uri: string;
  name: string;
  type: string;
}

interface NotificationData {
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: boolean;
  priority?: 'default' | 'high' | 'max';
}

Notifications.setNotificationHandler({
  handleNotification: async (): Promise<Notifications.NotificationBehavior> => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const appOwnership = Constants.appOwnership ?? 'standalone';
const isExpoGo = appOwnership === 'expo';

export const [FirebaseProvider, useFirebase] = createContextHook(() => {
  const [pushToken, setPushToken] = useState<string | null>(null);

  const isConfigured = isFirebaseConfigured();
  const firebaseApp = getFirebaseApp();

  const registerForPushNotifications = useCallback(async (): Promise<string | null> => {
    try {
      if (Platform.OS === 'web' || isExpoGo) {
        console.log('[Notifications] Push notifications require a native development build.');
        return null;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('[Notifications] Permission denied');
        return null;
      }

      const expoProjectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!expoProjectId) {
        console.log('[Notifications] Missing EAS projectId in app.json extra.eas.projectId');
        return null;
      }

      const token = (await Notifications.getExpoPushTokenAsync({ projectId: expoProjectId })).data;
      setPushToken(token);
      console.log('[Notifications] Push token:', token);
      return token;
    } catch (error) {
      console.error('[Notifications] Registration failed:', error);
      return null;
    }
  }, []);

  const sendLocalNotification = useCallback(async (notification: NotificationData) => {
    try {
      if (Platform.OS === 'web') return;
      await Notifications.scheduleNotificationAsync({
        content: { title: notification.title, body: notification.body, data: notification.data ?? {}, sound: notification.sound ?? true },
        trigger: null,
      });
    } catch (error) {
      console.error('[Notifications] Failed to send local notification:', error);
    }
  }, []);

  const schedulePushNotification = useCallback(async (
    notification: NotificationData,
    trigger: Date | number
  ) => {
    try {
      if (Platform.OS === 'web') return null;
      const triggerDate = (typeof trigger === 'number'
        ? { type: 'timeInterval' as const, seconds: trigger, repeats: false }
        : { type: 'date' as const, date: trigger }) as Notifications.NotificationTriggerInput;
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: notification.title, body: notification.body, data: notification.data ?? {}, sound: notification.sound ?? true },
        trigger: triggerDate,
      });
      return id;
    } catch (error) {
      console.error('[Notifications] Failed to schedule notification:', error);
      return null;
    }
  }, []);

  const cancelScheduledNotification = useCallback(async (notificationId: string) => {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.error('[Notifications] Failed to cancel notification:', error);
    }
  }, []);

  const uploadFile = useCallback(async (file: FileUpload, path: string): Promise<string | null> => {
    const storage = getFirebaseStorage();
    if (!storage) {
      console.error('[Storage] Firebase not configured — cannot upload file');
      return null;
    }
    try {
      const response = await fetch(file.uri);
      const blob = await response.blob();
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error('[Storage] Upload failed:', error);
      return null;
    }
  }, []);

  const deleteFile = useCallback(async (path: string): Promise<boolean> => {
    const storage = getFirebaseStorage();
    if (!storage) {
      console.error('[Storage] Firebase not configured — cannot delete file');
      return false;
    }
    try {
      await deleteObject(ref(storage, path));
      return true;
    } catch (error) {
      console.error('[Storage] Delete failed:', error);
      return false;
    }
  }, []);

  const getFileUrl = useCallback(async (path: string): Promise<string | null> => {
    const storage = getFirebaseStorage();
    if (!storage) return null;
    try {
      return await getDownloadURL(ref(storage, path));
    } catch (error) {
      console.error('[Storage] Failed to get URL:', error);
      return null;
    }
  }, []);

  return useMemo(
    () => ({
      firebaseApp,
      isConfigured,
      pushToken,
      registerForPushNotifications,
      sendLocalNotification,
      schedulePushNotification,
      cancelScheduledNotification,
      uploadFile,
      deleteFile,
      getFileUrl,
    }),
    [
      firebaseApp,
      isConfigured,
      pushToken,
      registerForPushNotifications,
      sendLocalNotification,
      schedulePushNotification,
      cancelScheduledNotification,
      uploadFile,
      deleteFile,
      getFileUrl,
    ]
  );
});

export type FirebaseContextType = ReturnType<typeof useFirebase>;
