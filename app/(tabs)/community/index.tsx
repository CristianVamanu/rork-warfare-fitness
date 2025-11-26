import { Stack, useRouter } from 'expo-router';
import { MessageSquare, Plus, Hash, Lock, Clock, Users } from 'lucide-react-native';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
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
            onPress={() => router.push('/admin-community' as any)}
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
});
