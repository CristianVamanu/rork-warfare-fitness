import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Target, Plus, Edit2, Trash2, X } from 'lucide-react-native';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { Mission } from '@/constants/missions';

export default function AdminMissionsScreen() {
  const router = useRouter();
  const { missions, createMission, updateMission, deleteMission } = useApp();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMission, setEditingMission] = useState<Mission | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    briefing: '',
    duration: '',
    difficulty: 'Recruit' as 'Recruit' | 'Warrior' | 'Elite',
    category: '',
    imageUrl: '',
    objectives: ['', '', '', '', ''],
  });

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      briefing: '',
      duration: '',
      difficulty: 'Recruit',
      category: '',
      imageUrl: '',
      objectives: ['', '', '', '', ''],
    });
    setEditingMission(null);
  };

  const handleEdit = (mission: Mission) => {
    setEditingMission(mission);
    setFormData({
      title: mission.title,
      description: mission.description,
      briefing: mission.briefing,
      duration: mission.duration,
      difficulty: mission.difficulty,
      category: mission.category,
      imageUrl: mission.imageUrl,
      objectives: [...mission.objectives, '', '', '', '', ''].slice(0, 5),
    });
    setShowCreateModal(true);
  };

  const handleDelete = (missionId: string, missionTitle: string) => {
    Alert.alert(
      'Delete Mission',
      `Are you sure you want to delete "${missionTitle}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteMission(missionId);
            Alert.alert('Success', 'Mission deleted successfully');
          },
        },
      ]
    );
  };

  const handleSave = () => {
    if (!formData.title || !formData.description) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    const filteredObjectives = formData.objectives.filter(obj => obj.trim() !== '');

    if (editingMission) {
      updateMission(editingMission.id, {
        title: formData.title,
        description: formData.description,
        briefing: formData.briefing,
        duration: formData.duration,
        difficulty: formData.difficulty,
        category: formData.category,
        imageUrl: formData.imageUrl,
        objectives: filteredObjectives,
      });
    } else {
      createMission({
        title: formData.title,
        description: formData.description,
        briefing: formData.briefing,
        duration: formData.duration,
        difficulty: formData.difficulty,
        category: formData.category,
        imageUrl: formData.imageUrl,
        objectives: filteredObjectives,
      });
    }

    Alert.alert(
      'Success',
      editingMission ? 'Mission updated successfully' : 'Mission created successfully'
    );
    setShowCreateModal(false);
    resetForm();
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Manage Missions',
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
          headerShadowVisible: false,
        }}
      />

      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Mission Control</Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => {
              resetForm();
              setShowCreateModal(true);
            }}
          >
            <Plus size={20} color={Colors.background} />
            <Text style={styles.createButtonText}>Create Mission</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {missions.map((mission) => (
            <View key={mission.id} style={styles.missionCard}>
              <View style={styles.missionHeader}>
                <View style={styles.missionInfo}>
                  <Text style={styles.missionTitle}>{mission.title}</Text>
                  <Text style={styles.missionSubtitle}>
                    {mission.difficulty} • {mission.duration} • {mission.category}
                  </Text>
                </View>
                <View style={styles.missionActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleEdit(mission)}
                  >
                    <Edit2 size={18} color={Colors.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleDelete(mission.id, mission.title)}
                  >
                    <Trash2 size={18} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.missionDescription} numberOfLines={2}>
                {mission.description}
              </Text>
              <View style={styles.missionStats}>
                <Text style={styles.statText}>
                  Progress: {mission.progress}%
                </Text>
                <Text style={styles.statText}>
                  Status: {mission.completed ? 'Completed' : 'Active'}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowCreateModal(false);
          resetForm();
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingMission ? 'Edit Mission' : 'Create New Mission'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowCreateModal(false);
                resetForm();
              }}
            >
              <X size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Title *</Text>
            <TextInput
              style={styles.input}
              value={formData.title}
              onChangeText={(text) => setFormData({ ...formData, title: text })}
              placeholder="e.g., The War Path"
              placeholderTextColor={Colors.textTertiary}
            />

            <Text style={styles.label}>Description *</Text>
            <TextInput
              style={styles.input}
              value={formData.description}
              onChangeText={(text) => setFormData({ ...formData, description: text })}
              placeholder="Brief description"
              placeholderTextColor={Colors.textTertiary}
            />

            <Text style={styles.label}>Mission Briefing</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.briefing}
              onChangeText={(text) => setFormData({ ...formData, briefing: text })}
              placeholder="Full mission briefing..."
              placeholderTextColor={Colors.textTertiary}
              multiline
              numberOfLines={4}
            />

            <Text style={styles.label}>Duration</Text>
            <TextInput
              style={styles.input}
              value={formData.duration}
              onChangeText={(text) => setFormData({ ...formData, duration: text })}
              placeholder="e.g., 30 Days"
              placeholderTextColor={Colors.textTertiary}
            />

            <Text style={styles.label}>Difficulty</Text>
            <View style={styles.difficultyButtons}>
              {(['Recruit', 'Warrior', 'Elite'] as const).map((diff) => (
                <TouchableOpacity
                  key={diff}
                  style={[
                    styles.difficultyButton,
                    formData.difficulty === diff && styles.difficultyButtonActive,
                  ]}
                  onPress={() => setFormData({ ...formData, difficulty: diff })}
                >
                  <Text
                    style={[
                      styles.difficultyText,
                      formData.difficulty === diff && styles.difficultyTextActive,
                    ]}
                  >
                    {diff}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Category</Text>
            <TextInput
              style={styles.input}
              value={formData.category}
              onChangeText={(text) => setFormData({ ...formData, category: text })}
              placeholder="e.g., Full Body"
              placeholderTextColor={Colors.textTertiary}
            />

            <Text style={styles.label}>Image URL</Text>
            <TextInput
              style={styles.input}
              value={formData.imageUrl}
              onChangeText={(text) => setFormData({ ...formData, imageUrl: text })}
              placeholder="https://..."
              placeholderTextColor={Colors.textTertiary}
            />

            <Text style={styles.label}>Objectives (up to 5)</Text>
            {formData.objectives.map((obj, index) => (
              <TextInput
                key={index}
                style={styles.input}
                value={obj}
                onChangeText={(text) => {
                  const newObjectives = [...formData.objectives];
                  newObjectives[index] = text;
                  setFormData({ ...formData, objectives: newObjectives });
                }}
                placeholder={`Objective ${index + 1}`}
                placeholderTextColor={Colors.textTertiary}
              />
            ))}

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>
                {editingMission ? 'Update Mission' : 'Create Mission'}
              </Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.text,
    textTransform: 'uppercase' as const,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  createButtonText: {
    color: Colors.background,
    fontWeight: '700' as const,
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  missionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  missionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  missionInfo: {
    flex: 1,
  },
  missionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  missionSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  missionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  missionStats: {
    flexDirection: 'row',
    gap: 16,
  },
  statText: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
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
    minHeight: 100,
    textAlignVertical: 'top',
  },
  difficultyButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  difficultyButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  difficultyButtonActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  difficultyText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  difficultyTextActive: {
    color: Colors.background,
  },
  saveButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '700' as const,
  },
});
