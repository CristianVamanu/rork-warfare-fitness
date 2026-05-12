import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import { Bell, Send, Clock, CheckCircle, AlertCircle, Calendar } from 'lucide-react-native';

import Colors from '@/constants/colors';
import { useFirebase } from '@/contexts/FirebaseContext';
import DateTimePicker from '@react-native-community/datetimepicker';

interface Notification {
  id: string;
  title: string;
  message: string;
  sentAt: string;
  recipients: number;
}

const RECENT_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    title: 'New Mission Available',
    message: 'The War Path mission is now live. Start your journey, soldier.',
    sentAt: '2 hours ago',
    recipients: 1247,
  },
  {
    id: '2',
    title: 'Community Challenge',
    message: '7-day cold exposure challenge starts tomorrow. Join the brotherhood.',
    sentAt: '1 day ago',
    recipients: 892,
  },
  {
    id: '3',
    title: 'Weekly Briefing',
    message: 'Your weekly progress report is ready. Review and dominate.',
    sentAt: '3 days ago',
    recipients: 1247,
  },
];

export default function AdminNotificationsScreen() {
  const { isConfigured, sendLocalNotification, schedulePushNotification, cancelScheduledNotification } = useFirebase();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [recentNotifications] = useState<Notification[]>(RECENT_NOTIFICATIONS);
  const [isScheduled, setIsScheduled] = useState<boolean>(false);
  const [scheduledDate, setScheduledDate] = useState<Date>(new Date(Date.now() + 3600000));
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [scheduledNotificationIds, setScheduledNotificationIds] = useState<string[]>([]);

  const handleSendNotification = async () => {
    if (!title.trim() || !message.trim()) {
      Alert.alert('Error', 'Please enter both title and message');
      return;
    }

    if (!isConfigured) {
      Alert.alert(
        'Firebase Not Configured',
        'Please configure Firebase in Admin Settings to send push notifications.',
        [{ text: 'OK' }]
      );
      return;
    }

    const notificationData = {
      title: title.trim(),
      body: message.trim(),
      sound: true,
      priority: 'high' as const,
    };

    if (isScheduled) {
      if (scheduledDate.getTime() <= Date.now()) {
        Alert.alert('Error', 'Scheduled time must be in the future');
        return;
      }

      Alert.alert(
        'Schedule Notification',
        `Schedule "${title}" for ${scheduledDate.toLocaleString()}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Schedule',
            onPress: async () => {
              const notificationId = await schedulePushNotification(notificationData, scheduledDate);
              if (notificationId) {
                setScheduledNotificationIds([...scheduledNotificationIds, notificationId]);
                Alert.alert('Success', `Notification scheduled for ${scheduledDate.toLocaleString()}`);
                setTitle('');
                setMessage('');
                setIsScheduled(false);
                setScheduledDate(new Date(Date.now() + 3600000));
              } else {
                Alert.alert('Error', 'Failed to schedule notification');
              }
            },
          },
        ]
      );
    } else {
      Alert.alert(
        'Send Notification',
        `Send "${title}" to all users now?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Send',
            onPress: async () => {
              await sendLocalNotification(notificationData);
              Alert.alert('Success', 'Notification sent to all users');
              setTitle('');
              setMessage('');
            },
          },
        ]
      );
    }
  };

  const applyTemplate = (templateTitle: string, templateMessage: string) => {
    setTitle(templateTitle);
    setMessage(templateMessage);
  };

  const templates = [
    {
      title: 'Daily Motivation',
      message: 'Day {X} – Stay in the fight. Crush fear. Dominate your mission.',
    },
    {
      title: 'Mission Reminder',
      message: 'Your mission awaits, soldier. Complete today\'s objectives.',
    },
    {
      title: 'Streak Alert',
      message: 'Don\'t break the chain! Log your workout to maintain your streak.',
    },
    {
      title: 'New Challenge',
      message: 'A new community challenge has been posted. Join the brotherhood.',
    },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Send Notifications',
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
          headerShadowVisible: false,
        }}
      />

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Bell size={32} color={Colors.accent} />
          <Text style={styles.headerTitle}>Broadcast Notification</Text>
          <Text style={styles.headerSubtitle}>
            Send tactical briefings to all users
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Notification Title</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Mission Update"
            placeholderTextColor={Colors.textTertiary}
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.label}>Message</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Your tactical briefing..."
            placeholderTextColor={Colors.textTertiary}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={6}
          />

          {!isConfigured && (
            <View style={styles.warningBanner}>
              <AlertCircle size={16} color={Colors.warning} />
              <Text style={styles.warningText}>
                Firebase not configured. Configure in Admin Settings to enable push notifications.
              </Text>
            </View>
          )}

          <View style={styles.scheduleToggle}>
            <TouchableOpacity
              style={[styles.toggleButton, !isScheduled && styles.toggleButtonActive]}
              onPress={() => setIsScheduled(false)}
            >
              <Text style={[styles.toggleButtonText, !isScheduled && styles.toggleButtonTextActive]}>
                Send Now
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, isScheduled && styles.toggleButtonActive]}
              onPress={() => setIsScheduled(true)}
            >
              <Text style={[styles.toggleButtonText, isScheduled && styles.toggleButtonTextActive]}>
                Schedule
              </Text>
            </TouchableOpacity>
          </View>

          {isScheduled && (
            <>
              <Text style={styles.label}>Schedule Date & Time</Text>
              <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
                <Calendar size={18} color={Colors.accent} />
                <Text style={styles.dateButtonText}>{scheduledDate.toLocaleString()}</Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={scheduledDate}
                  mode="datetime"
                  display="default"
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(false);
                    if (selectedDate) {
                      setScheduledDate(selectedDate);
                    }
                  }}
                  minimumDate={new Date()}
                />
              )}
            </>
          )}

          <TouchableOpacity 
            style={[styles.sendButton, !isConfigured && styles.sendButtonDisabled]} 
            onPress={handleSendNotification}
            disabled={!isConfigured}
          >
            <Send size={20} color={isConfigured ? Colors.background : Colors.textTertiary} />
            <Text style={[styles.sendButtonText, !isConfigured && styles.sendButtonTextDisabled]}>
              {isScheduled ? 'Schedule Notification' : 'Send to All Users'}
            </Text>
          </TouchableOpacity>

          {scheduledNotificationIds.length > 0 && (
            <View style={styles.scheduledInfo}>
              <Text style={styles.scheduledInfoText}>
                {scheduledNotificationIds.length} notification(s) scheduled
              </Text>
              <TouchableOpacity
                onPress={async () => {
                  Alert.alert(
                    'Cancel Scheduled Notifications',
                    'Cancel all scheduled notifications?',
                    [
                      { text: 'No', style: 'cancel' },
                      {
                        text: 'Yes',
                        style: 'destructive',
                        onPress: async () => {
                          for (const id of scheduledNotificationIds) {
                            await cancelScheduledNotification(id);
                          }
                          setScheduledNotificationIds([]);
                          Alert.alert('Success', 'All scheduled notifications cancelled');
                        },
                      },
                    ]
                  );
                }}
              >
                <Text style={styles.cancelLink}>Cancel All</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Templates</Text>
          <View style={styles.templatesGrid}>
            {templates.map((template, index) => (
              <TouchableOpacity
                key={index}
                style={styles.templateCard}
                onPress={() => applyTemplate(template.title, template.message)}
              >
                <Text style={styles.templateTitle}>{template.title}</Text>
                <Text style={styles.templateMessage} numberOfLines={2}>
                  {template.message}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Notifications</Text>
          {recentNotifications.map((notification) => (
            <View key={notification.id} style={styles.notificationCard}>
              <View style={styles.notificationHeader}>
                <CheckCircle size={18} color={Colors.success} />
                <Text style={styles.notificationTitle}>{notification.title}</Text>
              </View>
              <Text style={styles.notificationMessage}>{notification.message}</Text>
              <View style={styles.notificationFooter}>
                <View style={styles.footerItem}>
                  <Clock size={12} color={Colors.textTertiary} />
                  <Text style={styles.footerText}>{notification.sentAt}</Text>
                </View>
                <Text style={styles.footerText}>
                  {notification.recipients} recipients
                </Text>
              </View>
            </View>
          ))}
        </View>

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
  form: {
    padding: 20,
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
    minHeight: 120,
    textAlignVertical: 'top',
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 8,
  },
  sendButtonText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  templatesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  templateCard: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  templateTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 6,
  },
  templateMessage: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  notificationCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  notificationMessage: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  notificationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surfaceLight,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  warningText: {
    flex: 1,
    color: Colors.warning,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  scheduleToggle: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  toggleButtonActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + '20',
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  toggleButtonTextActive: {
    color: Colors.accent,
    fontWeight: '700' as const,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },
  dateButtonText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '600' as const,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.surfaceLight,
  },
  sendButtonTextDisabled: {
    color: Colors.textTertiary,
  },
  scheduledInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
  },
  scheduledInfoText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  cancelLink: {
    fontSize: 13,
    color: Colors.danger,
    fontWeight: '700' as const,
  },
});
