import { Stack, useRouter } from 'expo-router';
import { MessageSquare, Plus, Hash, Lock, Clock, Users, UserPlus, UserMinus } from 'lucide-react-native';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
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
  const [newChannelSlowMode, setNewChannelSlowMode] = useState(false);
  const [slowModeDuration, setSlowModeDuration] = useState('10');
  const [slowModeUnit, setSlowModeUnit] = useState<'seconds' | 'minutes' | 'hours' | 'days'>('seconds');
  const [allowImages, setAllowImages] = useState(true);
  const [allowVideos, setAllowVideos] = useState(true);
  const [maxImageSize, setMaxImageSize] = useState('10');
  const [maxVideoSize, setMaxVideoSize] = useState('50');
  const [maxVideoDuration, setMaxVideoDuration] = useState('60');

  const { createChannel, joinChannel, leaveChannel } = useCommunity();

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
        user.id,
        {
          slowMode: newChannelSlowMode ? parseInt(slowModeDuration) || 0 : 0,
          slowModeUnit,
          allowImages,
          allowVideos,
          maxImageSizeMB: parseInt(maxImageSize) || 10,
          maxVideoSizeMB: parseInt(maxVideoSize) || 50,
          maxVideoDurationSeconds: parseInt(maxVideoDuration) || 60,
        }
      );
      
      setShowCreateModal(false);
      setNewChannelName('');
      setNewChannelDescription('');
      setNewChannelIcon('💬');
      setNewChannelIsPrivate(false);
      setNewChannelSlowMode(false);
      setSlowModeDuration('10');
      setSlowModeUnit('seconds');
      setAllowImages(true);
      setAllowVideos(true);
      setMaxImageSize('10');
      setMaxVideoSize('50');
      setMaxVideoDuration('60');
      
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

  const handleJoinChannel = async (channelId: string) => {
    if (!user?.id) return;
    try {
      await joinChannel(channelId, user.id);
      Alert.alert('Success', 'You have joined the channel!');
    } catch (error) {
      Alert.alert('Error', 'Failed to join channel');
      console.error('[Community] Failed to join channel:', error);
    }
  };

  const handleLeaveChannel = async (channelId: string) => {
    if (!user?.id) return;
    Alert.alert(
      'Leave Channel',
      'Are you sure you want to leave this channel?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveChannel(channelId, user.id);
              Alert.alert('Success', 'You have left the channel');
            } catch (error) {
              Alert.alert('Error', 'Failed to leave channel');
              console.error('[Community] Failed to leave channel:', error);
            }
          },
        },
      ]
    );
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
            const isMember = user?.id ? channel.members.includes(user.id) : false;

            return (
              <View key={channel.id} style={styles.channelCardWrapper}>
                <TouchableOpacity
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
                            <Text style={styles.slowModeText}>
                              {channel.slowMode}{channel.slowModeUnit[0]}
                            </Text>
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
                      {isMember && (
                        <View style={styles.memberBadge}>
                          <Text style={styles.memberBadgeText}>JOINED</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
                {user && !user.isAdmin && (
                  <TouchableOpacity
                    style={[styles.joinButton, isMember && styles.leaveButton]}
                    onPress={() => isMember ? handleLeaveChannel(channel.id) : handleJoinChannel(channel.id)}
                  >
                    {isMember ? (
                      <UserMinus size={16} color={Colors.danger} />
                    ) : (
                      <UserPlus size={16} color={Colors.accent} />
                    )}
                  </TouchableOpacity>
                )}
              </View>
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
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={styles.modalOverlayTouchable}
            activeOpacity={1}
            onPress={() => setShowCreateModal(false)}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <ScrollView
                style={styles.modalScrollView}
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
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

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setNewChannelSlowMode(!newChannelSlowMode)}
            >
              <View style={[styles.checkbox, newChannelSlowMode && styles.checkboxActive]}>
                {newChannelSlowMode && <View style={styles.checkboxCheck} />}
              </View>
              <Text style={styles.checkboxLabel}>Enable Slow Mode</Text>
            </TouchableOpacity>

            {newChannelSlowMode && (
              <>
                <Text style={styles.label}>Slow Mode Unit</Text>
                <View style={styles.slowModeSelector}>
                  {(['seconds', 'minutes', 'hours', 'days'] as const).map((unit) => (
                    <TouchableOpacity
                      key={unit}
                      style={[
                        styles.durationOption,
                        slowModeUnit === unit && styles.durationOptionActive,
                      ]}
                      onPress={() => setSlowModeUnit(unit)}
                    >
                      <Text
                        style={[
                          styles.durationText,
                          slowModeUnit === unit && styles.durationTextActive,
                        ]}
                      >
                        {unit}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>Slow Mode Duration</Text>
                <TextInput
                  style={styles.input}
                  value={slowModeDuration}
                  onChangeText={setSlowModeDuration}
                  placeholder={`Duration in ${slowModeUnit}`}
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="numeric"
                />
                <Text style={styles.slowModeHint}>
                  Users can post once every {slowModeDuration} {slowModeUnit}
                </Text>
              </>
            )}

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setAllowImages(!allowImages)}
            >
              <View style={[styles.checkbox, allowImages && styles.checkboxActive]}>
                {allowImages && <View style={styles.checkboxCheck} />}
              </View>
              <Text style={styles.checkboxLabel}>Allow Image Uploads</Text>
            </TouchableOpacity>

            {allowImages && (
              <>
                <Text style={styles.label}>Max Image Size (MB)</Text>
                <TextInput
                  style={styles.input}
                  value={maxImageSize}
                  onChangeText={setMaxImageSize}
                  placeholder="Max size in MB"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="numeric"
                />
              </>
            )}

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setAllowVideos(!allowVideos)}
            >
              <View style={[styles.checkbox, allowVideos && styles.checkboxActive]}>
                {allowVideos && <View style={styles.checkboxCheck} />}
              </View>
              <Text style={styles.checkboxLabel}>Allow Video Uploads</Text>
            </TouchableOpacity>

            {allowVideos && (
              <>
                <Text style={styles.label}>Max Video Size (MB)</Text>
                <TextInput
                  style={styles.input}
                  value={maxVideoSize}
                  onChangeText={setMaxVideoSize}
                  placeholder="Max size in MB"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="numeric"
                />
                <Text style={styles.label}>Max Video Duration (seconds)</Text>
                <TextInput
                  style={styles.input}
                  value={maxVideoDuration}
                  onChangeText={setMaxVideoDuration}
                  placeholder="Max duration in seconds"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="numeric"
                />
              </>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowCreateModal(false);
                  setNewChannelName('');
                  setNewChannelDescription('');
                  setNewChannelIcon('💬');
                  setNewChannelIsPrivate(false);
                  setNewChannelSlowMode(false);
                  setSlowModeDuration('10');
                  setSlowModeUnit('seconds');
                  setAllowImages(true);
                  setAllowVideos(true);
                  setMaxImageSize('10');
                  setMaxVideoSize('50');
                  setMaxVideoDuration('60');
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
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
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
  channelCardWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
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
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
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
  memberBadge: {
    backgroundColor: `${Colors.accent}20`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  memberBadgeText: {
    fontSize: 9,
    fontWeight: '700' as const,
    color: Colors.accent,
  },
  joinButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveButton: {
    borderColor: Colors.danger,
  },
  modalOverlay: {
    flex: 1,
  },
  modalOverlayTouchable: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalScrollView: {
    maxHeight: '80%',
  },
  modalScrollContent: {
    justifyContent: 'center',
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
  slowModeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  durationOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  durationOptionActive: {
    borderColor: Colors.accent,
    backgroundColor: `${Colors.accent}20`,
  },
  durationText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  durationTextActive: {
    color: Colors.accent,
    fontWeight: '700' as const,
  },
  slowModeHint: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginBottom: 16,
    fontStyle: 'italic' as const,
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
});
