import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, FirebaseApp, getApps, getApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, FirebaseStorage } from 'firebase/storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';

const STORAGE_KEYS = {
  FIREBASE_CONFIG: 'wf_firebase_config_encrypted',
  ENCRYPTION_KEY: 'wf_firebase_encryption_key',
  PUSH_TOKEN: 'wf_push_token',
};

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

async function generateEncryptionKey(): Promise<string> {
  const stored = await AsyncStorage.getItem(STORAGE_KEYS.ENCRYPTION_KEY);
  if (stored) return stored;
  
  const key = await Crypto.getRandomBytesAsync(32);
  const keyStr = Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('');
  await AsyncStorage.setItem(STORAGE_KEYS.ENCRYPTION_KEY, keyStr);
  return keyStr;
}

async function encryptConfig(config: FirebaseConfig): Promise<string> {
  const key = await generateEncryptionKey();
  const configStr = JSON.stringify(config);
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    configStr + key
  );
  return JSON.stringify({ data: configStr, hash: digest });
}

async function decryptConfig(encrypted: string): Promise<FirebaseConfig | null> {
  try {
    const key = await generateEncryptionKey();
    const { data, hash } = JSON.parse(encrypted);
    const verifyHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      data + key
    );
    
    if (hash !== verifyHash) {
      console.error('[Firebase] Config integrity check failed');
      return null;
    }
    
    return JSON.parse(data);
  } catch (error) {
    console.error('[Firebase] Decryption failed:', error);
    return null;
  }
}

const appOwnership = Constants.appOwnership ?? 'standalone';
const isExpoGo = appOwnership === 'expo';

export const [FirebaseProvider, useFirebase] = createContextHook(() => {
  const [firebaseApp, setFirebaseApp] = useState<FirebaseApp | null>(null);
  const [firebaseStorage, setFirebaseStorage] = useState<FirebaseStorage | null>(null);
  const [config, setConfig] = useState<FirebaseConfig | null>(null);
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [pushToken, setPushToken] = useState<string | null>(null);

  const initializeFirebaseRef = useCallback(async (fbConfig: FirebaseConfig) => {
    try {
      let app: FirebaseApp;
      
      if (getApps().length === 0) {
        app = initializeApp(fbConfig);
      } else {
        app = getApp();
      }
      
      const storage = getStorage(app);
      
      setFirebaseApp(app);
      setFirebaseStorage(storage);
      setIsConfigured(true);
      
      console.log('[Firebase] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[Firebase] Initialization failed:', error);
      setIsConfigured(false);
      return false;
    }
  }, []);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const encrypted = await AsyncStorage.getItem(STORAGE_KEYS.FIREBASE_CONFIG);
        if (encrypted) {
          const decrypted = await decryptConfig(encrypted);
          if (decrypted) {
            setConfig(decrypted);
            await initializeFirebaseRef(decrypted);
          }
        }
      } catch (error) {
        console.error('[Firebase] Failed to load config:', error);
      } finally {
        setIsInitializing(false);
      }
    };

    void loadConfig();
  }, [initializeFirebaseRef]);



  const saveFirebaseConfig = useCallback(async (fbConfig: FirebaseConfig) => {
    try {
      const encrypted = await encryptConfig(fbConfig);
      await AsyncStorage.setItem(STORAGE_KEYS.FIREBASE_CONFIG, encrypted);
      
      setConfig(fbConfig);
      const success = await initializeFirebaseRef(fbConfig);
      
      if (success) {
        console.log('[Firebase] Config saved and initialized');
        return true;
      }
      return false;
    } catch (error) {
      console.error('[Firebase] Failed to save config:', error);
      return false;
    }
  }, [initializeFirebaseRef]);

  const clearFirebaseConfig = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.FIREBASE_CONFIG);
      setConfig(null);
      setFirebaseApp(null);
      setFirebaseStorage(null);
      setIsConfigured(false);
      console.log('[Firebase] Config cleared');
    } catch (error) {
      console.error('[Firebase] Failed to clear config:', error);
    }
  }, []);

  const registerForPushNotifications = useCallback(async (): Promise<string | null> => {
    try {
      if (Platform.OS === 'web' || isExpoGo) {
        console.log('[Notifications] Push notifications not supported in this environment. Use a development build instead of Expo Go.');
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
        console.log('[Notifications] Missing Expo project ID. Configure EAS projectId to request push tokens.');
        return null;
      }

      const token = (await Notifications.getExpoPushTokenAsync({
        projectId: expoProjectId,
      })).data;

      await AsyncStorage.setItem(STORAGE_KEYS.PUSH_TOKEN, token);
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
      if (Platform.OS === 'web') {
        console.log('[Notifications] Local notifications not supported on web');
        return;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: notification.data ?? {},
          sound: notification.sound ?? true,
        },
        trigger: null,
      });

      console.log('[Notifications] Local notification sent:', notification.title);
    } catch (error) {
      console.error('[Notifications] Failed to send local notification:', error);
    }
  }, []);

  const schedulePushNotification = useCallback(async (
    notification: NotificationData,
    trigger: Date | number
  ) => {
    try {
      if (Platform.OS === 'web') {
        console.log('[Notifications] Scheduled notifications not supported on web');
        return null;
      }

      const triggerDate = (typeof trigger === 'number'
        ? { seconds: trigger, repeats: false }
        : { date: trigger }) as Notifications.NotificationTriggerInput;

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: notification.data ?? {},
          sound: notification.sound ?? true,
        },
        trigger: triggerDate,
      });

      console.log('[Notifications] Scheduled notification:', id);
      return id;
    } catch (error) {
      console.error('[Notifications] Failed to schedule notification:', error);
      return null;
    }
  }, []);

  const cancelScheduledNotification = useCallback(async (notificationId: string) => {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      console.log('[Notifications] Cancelled notification:', notificationId);
    } catch (error) {
      console.error('[Notifications] Failed to cancel notification:', error);
    }
  }, []);

  const uploadFile = useCallback(async (
    file: FileUpload,
    path: string
  ): Promise<string | null> => {
    if (!firebaseStorage || !isConfigured) {
      console.error('[Storage] Firebase not configured');
      return null;
    }

    try {
      const response = await fetch(file.uri);
      const blob = await response.blob();
      
      const storageRef = ref(firebaseStorage, path);
      await uploadBytes(storageRef, blob);
      
      const downloadURL = await getDownloadURL(storageRef);
      console.log('[Storage] File uploaded:', downloadURL);
      
      return downloadURL;
    } catch (error) {
      console.error('[Storage] Upload failed:', error);
      return null;
    }
  }, [firebaseStorage, isConfigured]);

  const deleteFile = useCallback(async (path: string): Promise<boolean> => {
    if (!firebaseStorage || !isConfigured) {
      console.error('[Storage] Firebase not configured');
      return false;
    }

    try {
      const storageRef = ref(firebaseStorage, path);
      await deleteObject(storageRef);
      console.log('[Storage] File deleted:', path);
      return true;
    } catch (error) {
      console.error('[Storage] Delete failed:', error);
      return false;
    }
  }, [firebaseStorage, isConfigured]);

  const getFileUrl = useCallback(async (path: string): Promise<string | null> => {
    if (!firebaseStorage || !isConfigured) {
      console.error('[Storage] Firebase not configured');
      return null;
    }

    try {
      const storageRef = ref(firebaseStorage, path);
      const url = await getDownloadURL(storageRef);
      return url;
    } catch (error) {
      console.error('[Storage] Failed to get URL:', error);
      return null;
    }
  }, [firebaseStorage, isConfigured]);

  return useMemo(
    () => ({
      firebaseApp,
      firebaseStorage,
      config,
      isConfigured,
      isInitializing,
      pushToken,
      saveFirebaseConfig,
      clearFirebaseConfig,
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
      firebaseStorage,
      config,
      isConfigured,
      isInitializing,
      pushToken,
      saveFirebaseConfig,
      clearFirebaseConfig,
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
