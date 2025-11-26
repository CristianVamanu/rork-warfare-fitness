import { Stack, useRouter } from 'expo-router';
import { MessageSquare, Plus, Hash, Lock, Clock, Users } from 'lucide-react-native';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useState } from 'react';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useCommunity } from '@/contexts/CommunityContext';

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const { channels } = useCommunity();

  const [selectedChannel, setSelectedChannel] = useState<string>('general');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDescription, setNewChannelDescription] = useState('');
  const [newChannelIcon, setNewChannelIcon] = useState('💬');
  const [newChannelIsPrivate, setNewChannelIsPrivate] = useState(false);

  const { createChannel } = useCommunity();

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) {
      Alert.alert('Error', 'Please enter a channel name');
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'You must be logged in to create a channel');
      return;
    }

    try {
      await createChannel(
        newChannelName.trim(),
        newChannelDescription.trim() || 'No description',
        newChannelIcon,
        newChannelIsPrivate,
        user.id
      );
      
      setShowCreateModal(false);
      setNewChannelName('');
      setNewChannelDescription('');
      setNewChannelIcon('💬');
      setNewChannelIsPrivate(false);
      
      Alert.alert('Success', 'Channel created successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to create channel');
      console.error('[Community] Failed to create channel:', error);
    }
  };

  const handleChannelPress = (channelId: string) => {
    setSelectedChannel(channelId);
    router.push(`/(tabs)/community/${channelId}` as any);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MessageSquare size={28} color={Colors.accent} />
          <Text style={styles.headerTitle}>Community</Text>
        </View>
        {user?.isAdmin && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowCreateModal(true)}
          >
            <Plus size={20} color={Colors.accent} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.channelsList}>
          <Text style={styles.sectionLabel}>CHANNELS</Text>
          {channels.map((channel) => {
            const messageCount = 0;
            const isActive = channel.id === selectedChannel;

            return (
              <TouchableOpacity
                key={channel.id}
                style={[styles.channelCard, isActive && styles.channelCardActive]}
                onPress={() => handleChannelPress(channel.id)}
              >
                <View style={styles.channelIcon}>
                  <Text style={styles.channelIconText}>{channel.icon}</Text>
                </View>

                <View style={styles.channelContent}>
                  <View style={styles.channelHeader}>
                    <View style={styles.channelNameRow}>
                      {channel.isPrivate ? (
                        <Lock size={14} color={Colors.textSecondary} />
                      ) : (
                        <Hash size={14} color={Colors.textSecondary} />
                      )}
                      <Text style={styles.channelName}>{channel.name}</Text>
                      {channel.slowMode > 0 && (
                        <View style={styles.slowModeBadge}>
                          <Clock size={10} color={Colors.warning} />
                          <Text style={styles.slowModeText}>{channel.slowMode}s</Text>
                        </View>
                      )}
                    </View>
                    {messageCount > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>{messageCount}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.channelDescription} numberOfLines={1}>
                    {channel.description}
                  </Text>
                  <View style={styles.channelMeta}>
                    <Users size={12} color={Colors.textTertiary} />
                    <Text style={styles.channelMetaText}>
                      {channel.members.length} members
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Channel</Text>

            <Text style={styles.label}>Channel Icon</Text>
            <View style={styles.iconSelector}>
              {['💬', '🎮', '💪', '🔥', '⚡', '🎯', '🏆', '📢'].map((icon) => (
                <TouchableOpacity
                  key={icon}
                  style={[styles.iconOption, newChannelIcon === icon && styles.iconOptionActive]}
                  onPress={() => setNewChannelIcon(icon)}
                >
                  <Text style={styles.iconText}>{icon}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Channel Name</Text>
            <TextInput
              style={styles.input}
              value={newChannelName}
              onChangeText={setNewChannelName}
              placeholder="e.g., announcements, off-topic..."
              placeholderTextColor={Colors.textTertiary}
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={newChannelDescription}
              onChangeText={setNewChannelDescription}
              placeholder="What is this channel about?"
              placeholderTextColor={Colors.textTertiary}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setNewChannelIsPrivate(!newChannelIsPrivate)}
            >
              <View style={[styles.checkbox, newChannelIsPrivate && styles.checkboxActive]}>
                {newChannelIsPrivate && <View style={styles.checkboxCheck} />}
              </View>
              <Text style={styles.checkboxLabel}>Private Channel</Text>
            </TouchableOpacity>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowCreateModal(false);
                  setNewChannelName('');
                  setNewChannelDescription('');
                  setNewChannelIcon('💬');
                  setNewChannelIsPrivate(false);
                }}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={handleCreateChannel}
              >
                <Text style={styles.modalButtonTextSave}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.text,
    textTransform: 'uppercase' as const,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  channelsList: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textTertiary,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 12,
  },
  channelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  channelCardActive: {
    borderColor: Colors.accent,
    backgroundColor: `${Colors.accent}10`,
  },
  channelIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  channelIconText: {
    fontSize: 24,
  },
  channelContent: {
    flex: 1,
  },
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  channelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  channelName: {
    fontSize: 16,
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
  unreadBadge: {
    backgroundColor: Colors.danger,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#fff',
  },
  channelDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  channelMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  channelMetaText: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
  },
  iconSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  iconOptionActive: {
    borderColor: Colors.accent,
    backgroundColor: `${Colors.accent}20`,
  },
  iconText: {
    fontSize: 20,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.text,
    marginBottom: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  checkboxCheck: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: Colors.text,
  },
  checkboxLabel: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '600' as const,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalButtonSave: {
    backgroundColor: Colors.accent,
  },
  modalButtonTextCancel: {
    color: Colors.text,
    fontWeight: '600' as const,
    fontSize: 16,
  },
  modalButtonTextSave: {
    color: Colors.text,
    fontWeight: '800' as const,
    fontSize: 16,
  },
});
