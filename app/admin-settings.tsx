import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  Image,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Settings, DollarSign, Palette, Bell, Shield, Brain, Plus, Trash2, FileText, PlayCircle, Cloud, Server, Upload, Image as ImageIcon } from 'lucide-react-native';

import Colors from '@/constants/colors';
import { useApp, DailyBriefing, FreePackageFeatures } from '@/contexts/AppContext';
import { useFirebase, FirebaseConfig } from '@/contexts/FirebaseContext';

export default function AdminSettingsScreen() {
  const router = useRouter();
  const { adminSettings, updateAdminSettings } = useApp();
  const { config, isConfigured, saveFirebaseConfig, clearFirebaseConfig, registerForPushNotifications } = useFirebase();
  const [enableNotifications, setEnableNotifications] = useState<boolean>(adminSettings.enableNotifications);
  const [requireVerification, setRequireVerification] = useState<boolean>(adminSettings.requireVerification);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const [freePackage, setFreePackage] = useState<FreePackageFeatures>(adminSettings.freePackage ?? {
    trainingPrograms: true,
    freeTrialDays: 7,
    community: true,
    leaderboard: true,
    profile: true,
    nutrition: true,
    hydration: true,
    missions: true,
    iceBath: true,
  });

  const [appSettings, setAppSettings] = useState({
    appName: adminSettings.appName,
    tagline: adminSettings.tagline,
    supportEmail: adminSettings.supportEmail,
    welcomeMessage: adminSettings.welcomeMessage ?? 'Welcome to Warfare Fitness, Soldier!',
    welcomeVideoUrl: adminSettings.welcomeVideoUrl ?? '',
    dailyMessage: adminSettings.dailyMessage ?? 'Today is your day to dominate. No excuses.',
    aiApiKey: adminSettings.aiApiKey ?? '',
    heroTitle: adminSettings.heroTitle ?? 'Your Mission Awaits, Soldier',
    heroSubtitle: adminSettings.heroSubtitle ?? 'Forge Strength. Crush Anxiety. Dominate Your Life.',
    appLogo: adminSettings.appLogo ?? '',
    coffeeLink: adminSettings.coffeeLink ?? '',
  });

  const [dailyBriefings, setDailyBriefings] = useState<DailyBriefing[]>(adminSettings.dailyBriefings ?? [
    {
      id: 'default',
      text: '"Discipline is forged in fire. Today, you enter the warzone of self-mastery. Every rep is a battle. Every decision is a mission. Your enemy is weakness. Your weapon is action."',
      author: 'Commander',
      order: 0,
    },
  ]);

  const [payments, setPayments] = useState({
    stripePublicKey: adminSettings.payments.stripePublicKey ?? '',
    stripeSecretKey: adminSettings.payments.stripeSecretKey ?? '',
    paypalClientId: adminSettings.payments.paypalClientId ?? '',
    activeProvider: adminSettings.payments.activeProvider ?? 'stripe',
  });

  const [firebaseConfig, setFirebaseConfig] = useState<FirebaseConfig>({
    apiKey: config?.apiKey ?? '',
    authDomain: config?.authDomain ?? '',
    projectId: config?.projectId ?? '',
    storageBucket: config?.storageBucket ?? '',
    messagingSenderId: config?.messagingSenderId ?? '',
    appId: config?.appId ?? '',
    measurementId: config?.measurementId ?? '',
  });

  const handleAddBriefing = () => {
    const newBriefing: DailyBriefing = {
      id: Date.now().toString(),
      text: '',
      author: 'Commander',
      order: dailyBriefings.length,
    };
    setDailyBriefings([...dailyBriefings, newBriefing]);
  };

  const handleRemoveBriefing = (id: string) => {
    setDailyBriefings(dailyBriefings.filter(b => b.id !== id));
  };

  const handleUpdateBriefing = (id: string, updates: Partial<DailyBriefing>) => {
    setDailyBriefings(dailyBriefings.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const handleSaveFirebaseConfig = async () => {
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
      Alert.alert('Validation Error', 'Please fill in all required Firebase fields (API Key, Project ID, App ID)');
      return;
    }

    const success = await saveFirebaseConfig(firebaseConfig);
    if (success) {
      Alert.alert('Success', 'Firebase configuration saved and initialized successfully');
      await registerForPushNotifications();
    } else {
      Alert.alert('Error', 'Failed to save Firebase configuration. Please check your credentials.');
    }
  };

  const handleClearFirebaseConfig = () => {
    Alert.alert(
      'Clear Firebase Config',
      'Are you sure you want to clear Firebase configuration? This will disable push notifications and file uploads.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearFirebaseConfig();
            setFirebaseConfig({
              apiKey: '',
              authDomain: '',
              projectId: '',
              storageBucket: '',
              messagingSenderId: '',
              appId: '',
              measurementId: '',
            });
            Alert.alert('Success', 'Firebase configuration cleared');
          },
        },
      ]
    );
  };

  const handleUploadLogo = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload a logo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setAppSettings({ ...appSettings, appLogo: result.assets[0].uri });
      console.log('[Admin] Logo uploaded:', result.assets[0].uri);
    }
  };

  const handleRemoveLogo = () => {
    Alert.alert(
      'Remove Logo',
      'Are you sure you want to remove the app logo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setAppSettings({ ...appSettings, appLogo: '' });
            console.log('[Admin] Logo removed');
          },
        },
      ]
    );
  };

  const handleSaveSettings = () => {
    updateAdminSettings({
      enableNotifications,
      requireVerification,
      freePackage,
      appName: appSettings.appName,
      tagline: appSettings.tagline,
      supportEmail: appSettings.supportEmail,
      welcomeMessage: appSettings.welcomeMessage,
      welcomeVideoUrl: appSettings.welcomeVideoUrl,
      dailyMessage: appSettings.dailyMessage,
      aiApiKey: appSettings.aiApiKey,
      heroTitle: appSettings.heroTitle,
      heroSubtitle: appSettings.heroSubtitle,
      appLogo: appSettings.appLogo,
      coffeeLink: appSettings.coffeeLink,
      dailyBriefings,
      payments: {
        stripePublicKey: payments.stripePublicKey || undefined,
        stripeSecretKey: payments.stripeSecretKey || undefined,
        paypalClientId: payments.paypalClientId || undefined,
        activeProvider: payments.activeProvider,
      },
    });
    Alert.alert('Success', 'Settings saved successfully');
    console.log('[Admin] Settings updated:', appSettings);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Settings',
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
          headerShadowVisible: false,
        }}
      />

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Settings size={32} color={Colors.accent} />
          <Text style={styles.headerTitle}>App Configuration</Text>
          <Text style={styles.headerSubtitle}>Manage app-wide settings</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Palette size={20} color={Colors.accent} />
            <Text style={styles.sectionTitle}>App Identity</Text>
          </View>

          <Text style={styles.label}>App Name</Text>
          <TextInput
            style={styles.input}
            value={appSettings.appName}
            onChangeText={(text) =>
              setAppSettings({ ...appSettings, appName: text })
            }
            placeholder="App name"
            placeholderTextColor={Colors.textTertiary}
          />

          <Text style={styles.label}>Tagline</Text>
          <TextInput
            style={styles.input}
            value={appSettings.tagline}
            onChangeText={(text) =>
              setAppSettings({ ...appSettings, tagline: text })
            }
            placeholder="App tagline"
            placeholderTextColor={Colors.textTertiary}
          />

          <Text style={styles.label}>Support Email</Text>
          <TextInput
            style={styles.input}
            value={appSettings.supportEmail}
            onChangeText={(text) =>
              setAppSettings({ ...appSettings, supportEmail: text })
            }
            placeholder="support@example.com"
            placeholderTextColor={Colors.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Welcome Message</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={appSettings.welcomeMessage}
            onChangeText={(text) =>
              setAppSettings({ ...appSettings, welcomeMessage: text })
            }
            placeholder="Welcome message for new users"
            placeholderTextColor={Colors.textTertiary}
            multiline
            numberOfLines={3}
          />

          <Text style={styles.label}>Welcome Video URL (Optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={appSettings.welcomeVideoUrl}
            onChangeText={(text) =>
              setAppSettings({ ...appSettings, welcomeVideoUrl: text })
            }
            placeholder="https://example.com/video.mp4 or https://example.com/video.m3u8"
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
            multiline
            numberOfLines={2}
          />
          <Text style={styles.helpText}>⚠️ Use direct video URLs only. YouTube links are not supported. Recommended formats: MP4, M3U8 (HLS). Try hosting on Cloudflare Stream, Vimeo, or your own server.</Text>
          <View style={styles.videoInputRow}>
            {appSettings.welcomeVideoUrl && (
              <TouchableOpacity 
                style={styles.previewButton}
                onPress={() => {
                  const url = appSettings.welcomeVideoUrl.trim();
                  if (url.includes('youtube.com') || url.includes('youtu.be')) {
                    Alert.alert(
                      'Invalid Video URL',
                      'YouTube links are not supported. Please use a direct video URL (e.g., .mp4, .m3u8). Consider hosting on Cloudflare Stream, Vimeo, or your own server.',
                      [{ text: 'OK' }]
                    );
                    return;
                  }
                  updateAdminSettings({ welcomeVideoUrl: url });
                  router.push('/welcome-video' as any);
                }}
              >
                <PlayCircle size={20} color={Colors.accent} />
                <Text style={styles.previewButtonText}>Preview Video</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.label}>Daily Message</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={appSettings.dailyMessage}
            onChangeText={(text) =>
              setAppSettings({ ...appSettings, dailyMessage: text })
            }
            placeholder="Daily motivational message"
            placeholderTextColor={Colors.textTertiary}
            multiline
            numberOfLines={2}
          />

          <Text style={styles.label}>Home Screen Hero Title</Text>
          <TextInput
            style={styles.input}
            value={appSettings.heroTitle}
            onChangeText={(text) =>
              setAppSettings({ ...appSettings, heroTitle: text })
            }
            placeholder="Your Mission Awaits, Soldier"
            placeholderTextColor={Colors.textTertiary}
          />

          <Text style={styles.label}>Home Screen Hero Subtitle</Text>
          <TextInput
            style={styles.input}
            value={appSettings.heroSubtitle}
            onChangeText={(text) =>
              setAppSettings({ ...appSettings, heroSubtitle: text })
            }
            placeholder="Forge Strength. Crush Anxiety. Dominate Your Life."
            placeholderTextColor={Colors.textTertiary}
          />

          <Text style={styles.label}>App Logo</Text>
          {appSettings.appLogo ? (
            <View style={styles.logoPreviewContainer}>
              <Image source={{ uri: appSettings.appLogo }} style={styles.logoPreview} />
              <View style={styles.logoActions}>
                <TouchableOpacity style={styles.logoUploadBtn} onPress={handleUploadLogo}>
                  <Upload size={16} color={Colors.accent} />
                  <Text style={styles.logoUploadText}>Change Logo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.logoRemoveBtn} onPress={handleRemoveLogo}>
                  <Trash2 size={16} color={Colors.danger} />
                  <Text style={styles.logoRemoveText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.logoUploadBox} onPress={handleUploadLogo}>
              <ImageIcon size={48} color={Colors.textTertiary} />
              <Text style={styles.logoUploadBoxText}>Tap to upload app logo</Text>
              <Text style={styles.logoUploadBoxSubtext}>Recommended: Square image, 512x512 or higher</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.helpText}>This logo will be displayed on the login and registration screens.</Text>

          <Text style={styles.label}>Buy Me a Coffee Link (Optional)</Text>
          <TextInput
            style={styles.input}
            value={appSettings.coffeeLink}
            onChangeText={(text) =>
              setAppSettings({ ...appSettings, coffeeLink: text })
            }
            placeholder="https://www.buymeacoffee.com/yourusername"
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
          />
          <Text style={styles.helpText}>Add your Buy Me a Coffee link. A floating button will appear on the home screen for users to support you.</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FileText size={20} color={Colors.accent} />
            <Text style={styles.sectionTitle}>Daily Briefings</Text>
          </View>
          <Text style={styles.helpText}>Create multiple briefings that will be shown on the home screen. If a briefing has repeat days set, it will show again after X days.</Text>
          
          {dailyBriefings.map((briefing, index) => (
            <View key={briefing.id} style={styles.briefingCard}>
              <View style={styles.briefingHeader}>
                <Text style={styles.briefingNumber}>Briefing #{index + 1}</Text>
                {dailyBriefings.length > 1 && (
                  <TouchableOpacity onPress={() => handleRemoveBriefing(briefing.id)}>
                    <Trash2 size={18} color={Colors.danger} />
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.label}>Briefing Text</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={briefing.text}
                onChangeText={(text) => handleUpdateBriefing(briefing.id, { text })}
                placeholder='"Discipline is forged in fire..."'
                placeholderTextColor={Colors.textTertiary}
                multiline
                numberOfLines={4}
              />

              <Text style={styles.label}>Author</Text>
              <TextInput
                style={styles.input}
                value={briefing.author}
                onChangeText={(text) => handleUpdateBriefing(briefing.id, { author: text })}
                placeholder="Commander"
                placeholderTextColor={Colors.textTertiary}
              />

              <Text style={styles.label}>Repeat Every X Days (Optional)</Text>
              <TextInput
                style={styles.input}
                value={briefing.repeatDays?.toString() ?? ''}
                onChangeText={(text) => {
                  const days = text === '' ? undefined : parseInt(text, 10);
                  handleUpdateBriefing(briefing.id, { repeatDays: days });
                }}
                placeholder="Leave empty to show once, or enter days (e.g., 7 for weekly)"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="numeric"
              />
              <Text style={styles.helpText}>If set, this briefing will repeat every X days. Leave empty to show only once.</Text>
            </View>
          ))}

          <TouchableOpacity style={styles.addBriefingBtn} onPress={handleAddBriefing}>
            <Plus size={18} color={Colors.background} />
            <Text style={styles.addBriefingText}>Add Briefing</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Brain size={20} color={Colors.accent} />
            <Text style={styles.sectionTitle}>AI Configuration</Text>
          </View>

          <Text style={styles.label}>ChatGPT API Key (Optional)</Text>
          <TextInput
            style={styles.input}
            value={appSettings.aiApiKey}
            onChangeText={(text) =>
              setAppSettings({ ...appSettings, aiApiKey: text })
            }
            placeholder="sk-..."
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
            secureTextEntry
          />
          <Text style={styles.helpText}>Leave empty to use default AI service. Add your own key for unlimited usage.</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Cloud size={20} color={Colors.accent} />
            <Text style={styles.sectionTitle}>Firebase Configuration</Text>
          </View>
          <Text style={styles.helpText}>Configure Firebase for push notifications and file uploads. Your credentials are encrypted and stored securely.</Text>
          
          {isConfigured && (
            <View style={styles.statusBanner}>
              <Server size={16} color={Colors.success} />
              <Text style={styles.statusBannerText}>Firebase is configured and active</Text>
            </View>
          )}

          <Text style={styles.label}>API Key *</Text>
          <TextInput
            style={styles.input}
            value={firebaseConfig.apiKey}
            onChangeText={(text) => setFirebaseConfig({ ...firebaseConfig, apiKey: text })}
            placeholder="AIza...."
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
            secureTextEntry
          />

          <Text style={styles.label}>Auth Domain</Text>
          <TextInput
            style={styles.input}
            value={firebaseConfig.authDomain}
            onChangeText={(text) => setFirebaseConfig({ ...firebaseConfig, authDomain: text })}
            placeholder="your-project.firebaseapp.com"
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Project ID *</Text>
          <TextInput
            style={styles.input}
            value={firebaseConfig.projectId}
            onChangeText={(text) => setFirebaseConfig({ ...firebaseConfig, projectId: text })}
            placeholder="your-project-id"
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Storage Bucket</Text>
          <TextInput
            style={styles.input}
            value={firebaseConfig.storageBucket}
            onChangeText={(text) => setFirebaseConfig({ ...firebaseConfig, storageBucket: text })}
            placeholder="your-project.appspot.com"
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Messaging Sender ID</Text>
          <TextInput
            style={styles.input}
            value={firebaseConfig.messagingSenderId}
            onChangeText={(text) => setFirebaseConfig({ ...firebaseConfig, messagingSenderId: text })}
            placeholder="123456789"
            placeholderTextColor={Colors.textTertiary}
            keyboardType="numeric"
          />

          <Text style={styles.label}>App ID *</Text>
          <TextInput
            style={styles.input}
            value={firebaseConfig.appId}
            onChangeText={(text) => setFirebaseConfig({ ...firebaseConfig, appId: text })}
            placeholder="1:123456789:web:abc123"
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Measurement ID (Optional)</Text>
          <TextInput
            style={styles.input}
            value={firebaseConfig.measurementId}
            onChangeText={(text) => setFirebaseConfig({ ...firebaseConfig, measurementId: text })}
            placeholder="G-XXXXXXXXXX"
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
          />

          <View style={styles.firebaseActions}>
            <TouchableOpacity style={styles.firebaseSaveBtn} onPress={handleSaveFirebaseConfig}>
              <Text style={styles.firebaseSaveBtnText}>Save Firebase Config</Text>
            </TouchableOpacity>
            {isConfigured && (
              <TouchableOpacity style={styles.firebaseClearBtn} onPress={handleClearFirebaseConfig}>
                <Text style={styles.firebaseClearBtnText}>Clear Config</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <DollarSign size={20} color={Colors.success} />
            <Text style={styles.sectionTitle}>Free Package Configuration</Text>
          </View>
          <Text style={styles.helpText}>Configure what features are available in the free tier. Unchecked features will show "Subscribe to Unlock" message.</Text>

          <Text style={styles.label}>Free Trial Duration (Days)</Text>
          <TextInput
            style={styles.input}
            value={String(freePackage.freeTrialDays ?? 7)}
            onChangeText={(text) => {
              if (text === '') {
                setFreePackage({ ...freePackage, freeTrialDays: 7 });
                return;
              }
              const days = parseInt(text, 10);
              if (!isNaN(days)) {
                setFreePackage({ ...freePackage, freeTrialDays: Math.max(1, days) });
              }
            }}
            placeholder="7"
            placeholderTextColor={Colors.textTertiary}
            keyboardType="numeric"
          />
          <Text style={styles.helpText}>Days users can access programs during free trial before subscription is required.</Text>

          <Text style={styles.featuresSectionTitle}>Free Tier Features</Text>
          <View style={styles.featuresGrid}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Training Programs</Text>
                <Text style={styles.settingDescription}>
                  Access to workout programs with trial period
                </Text>
              </View>
              <Switch
                value={freePackage.trainingPrograms}
                onValueChange={(v) => setFreePackage({ ...freePackage, trainingPrograms: v })}
                trackColor={{ false: Colors.border, true: Colors.accent }}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Community</Text>
                <Text style={styles.settingDescription}>
                  Access to community feed and posts
                </Text>
              </View>
              <Switch
                value={freePackage.community}
                onValueChange={(v) => setFreePackage({ ...freePackage, community: v })}
                trackColor={{ false: Colors.border, true: Colors.accent }}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Leaderboard</Text>
                <Text style={styles.settingDescription}>
                  Access to rankings and leaderboard
                </Text>
              </View>
              <Switch
                value={freePackage.leaderboard}
                onValueChange={(v) => setFreePackage({ ...freePackage, leaderboard: v })}
                trackColor={{ false: Colors.border, true: Colors.accent }}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Profile</Text>
                <Text style={styles.settingDescription}>
                  User profile and statistics
                </Text>
              </View>
              <Switch
                value={freePackage.profile}
                onValueChange={(v) => setFreePackage({ ...freePackage, profile: v })}
                trackColor={{ false: Colors.border, true: Colors.accent }}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Nutrition Tracking</Text>
                <Text style={styles.settingDescription}>
                  Food logging and calorie tracking
                </Text>
              </View>
              <Switch
                value={freePackage.nutrition}
                onValueChange={(v) => setFreePackage({ ...freePackage, nutrition: v })}
                trackColor={{ false: Colors.border, true: Colors.accent }}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Hydration Tracking</Text>
                <Text style={styles.settingDescription}>
                  Water intake tracking
                </Text>
              </View>
              <Switch
                value={freePackage.hydration}
                onValueChange={(v) => setFreePackage({ ...freePackage, hydration: v })}
                trackColor={{ false: Colors.border, true: Colors.accent }}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Missions</Text>
                <Text style={styles.settingDescription}>
                  Daily missions and challenges
                </Text>
              </View>
              <Switch
                value={freePackage.missions}
                onValueChange={(v) => setFreePackage({ ...freePackage, missions: v })}
                trackColor={{ false: Colors.border, true: Colors.accent }}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Ice Bath Tracker</Text>
                <Text style={styles.settingDescription}>
                  Cold exposure tracking
                </Text>
              </View>
              <Switch
                value={freePackage.iceBath}
                onValueChange={(v) => setFreePackage({ ...freePackage, iceBath: v })}
                trackColor={{ false: Colors.border, true: Colors.accent }}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <DollarSign size={20} color={Colors.success} />
            <Text style={styles.sectionTitle}>Support Payments</Text>
          </View>

          <Text style={styles.label}>Stripe Publishable Key</Text>
          <TextInput
            style={styles.input}
            value={payments.stripePublicKey}
            onChangeText={(text) => setPayments({ ...payments, stripePublicKey: text })}
            placeholder="pk_live_..."
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Stripe Secret Key</Text>
          <TextInput
            style={styles.input}
            value={payments.stripeSecretKey}
            onChangeText={(text) => setPayments({ ...payments, stripeSecretKey: text })}
            placeholder="sk_live_..."
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
            secureTextEntry
          />
          <Text style={styles.helpText}>⚠️ Keep this secret! Never share or expose in client code.</Text>

          <Text style={styles.label}>PayPal Client ID</Text>
          <TextInput
            style={styles.input}
            value={payments.paypalClientId}
            onChangeText={(text) => setPayments({ ...payments, paypalClientId: text })}
            placeholder="A...B"
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Active Payment Provider</Text>
          <View style={styles.providerSelection}>
            <TouchableOpacity
              style={[
                styles.providerOption,
                payments.activeProvider === 'stripe' && styles.providerOptionActive,
              ]}
              onPress={() => setPayments({ ...payments, activeProvider: 'stripe' })}
            >
              <View
                style={[
                  styles.providerRadio,
                  payments.activeProvider === 'stripe' && styles.providerRadioActive,
                ]}
              />
              <View style={styles.providerInfo}>
                <Text style={styles.providerTitle}>Stripe</Text>
                <Text style={styles.providerDesc}>Credit card payments</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.providerOption,
                payments.activeProvider === 'paypal' && styles.providerOptionActive,
              ]}
              onPress={() => setPayments({ ...payments, activeProvider: 'paypal' })}
            >
              <View
                style={[
                  styles.providerRadio,
                  payments.activeProvider === 'paypal' && styles.providerRadioActive,
                ]}
              />
              <View style={styles.providerInfo}>
                <Text style={styles.providerTitle}>PayPal</Text>
                <Text style={styles.providerDesc}>PayPal & credit cards</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Bell size={20} color={Colors.warning} />
            <Text style={styles.sectionTitle}>Features</Text>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Push Notifications</Text>
              <Text style={styles.settingDescription}>
                Enable tactical briefings
              </Text>
            </View>
            <Switch
              value={enableNotifications}
              onValueChange={setEnableNotifications}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Require Verification</Text>
              <Text style={styles.settingDescription}>
                Require proof for mission completion
              </Text>
            </View>
            <Switch
              value={requireVerification}
              onValueChange={setRequireVerification}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Shield size={20} color={Colors.danger} />
            <Text style={styles.sectionTitle}>Advanced</Text>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Maintenance Mode</Text>
              <Text style={styles.settingDescription}>
                Disable app for users during updates
              </Text>
            </View>
            <Switch
              value={maintenanceMode}
              onValueChange={(value) => {
                if (value) {
                  Alert.alert(
                    'Enable Maintenance Mode',
                    'This will prevent all users from accessing the app. Continue?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Enable',
                        style: 'destructive',
                        onPress: () => setMaintenanceMode(true),
                      },
                    ]
                  );
                } else {
                  setMaintenanceMode(false);
                }
              }}
              trackColor={{ false: Colors.border, true: Colors.danger }}
            />
          </View>
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSaveSettings}>
          <Text style={styles.saveButtonText}>Save All Settings</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.text,
    marginTop: 12,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.text,
    marginBottom: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  saveButton: {
    marginHorizontal: 20,
    marginTop: 32,
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  providerSelection: {
    gap: 12,
    marginBottom: 16,
  },
  providerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
  },
  providerOptionActive: {
    borderColor: Colors.accent,
    backgroundColor: '#EFF6FF',
  },
  providerRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  providerRadioActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  providerInfo: {
    flex: 1,
  },
  providerTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 2,
  },
  providerDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  helpText: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  briefingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 16,
  },
  briefingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  briefingNumber: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  addBriefingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 8,
  },
  addBriefingText: {
    color: Colors.background,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  videoInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  featuresSectionTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    marginTop: 16,
    marginBottom: 12,
  },
  featuresGrid: {
    gap: 12,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  previewButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.accent,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surfaceLight,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  statusBannerText: {
    color: Colors.success,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  firebaseActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  firebaseSaveBtn: {
    flex: 1,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  firebaseSaveBtnText: {
    color: Colors.background,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  firebaseClearBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  firebaseClearBtnText: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  logoUploadBox: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 12,
    borderStyle: 'dashed' as const,
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  logoUploadBoxText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
    marginTop: 12,
  },
  logoUploadBoxSubtext: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  logoPreviewContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  logoPreview: {
    width: 120,
    height: 120,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  logoActions: {
    flexDirection: 'row',
    gap: 12,
  },
  logoUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  logoUploadText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.accent,
  },
  logoRemoveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  logoRemoveText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.danger,
  },
});
