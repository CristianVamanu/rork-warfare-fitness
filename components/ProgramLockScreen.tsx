import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock, X } from 'lucide-react-native';
import Colors from '@/constants/colors';
import type { TrainerProgram } from '@/contexts/TrainerContext';

type Props = {
  program: TrainerProgram;
  visible: boolean;
  onPurchase: () => void;
  onClose: () => void;
};

const { width } = Dimensions.get('window');

export default function ProgramLockScreen({ program, visible, onPurchase, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <LinearGradient
          colors={['rgba(0,0,0,0.97)', 'rgba(10,10,10,0.99)']}
          style={styles.container}
        >
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <X size={22} color={Colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.lockIconContainer}>
            <LinearGradient colors={[Colors.accentDark, Colors.accent]} style={styles.lockCircle}>
              <Lock size={36} color="#000" />
            </LinearGradient>
          </View>

          <View style={styles.trialBadge}>
            <Text style={styles.trialBadgeText}>TRIAL ENDED</Text>
          </View>

          <Text style={styles.programTitle}>{program.title.toUpperCase()}</Text>
          <Text style={styles.trainerName}>by {program.trainerName}</Text>

          <Text style={styles.message}>
            Your free trial has ended. Unlock the full program to continue your transformation.
          </Text>

          <TouchableOpacity style={styles.purchaseBtn} onPress={onPurchase} activeOpacity={0.85}>
            <LinearGradient colors={[Colors.accent, Colors.accentDark]} style={styles.purchaseBtnGradient}>
              <Lock size={16} color="#000" />
              <Text style={styles.purchaseBtnText}>
                {program.price === 0 ? 'UNLOCK FREE' : `UNLOCK — $${program.price.toFixed(2)}/mo`}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={styles.dismissBtn}>
            <Text style={styles.dismissText}>Maybe later</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: width * 0.88,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  closeBtn: { position: 'absolute', top: 16, right: 16 },
  lockIconContainer: { marginBottom: 20, marginTop: 12 },
  lockCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trialBadge: {
    backgroundColor: Colors.danger + '22',
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 16,
  },
  trialBadgeText: {
    color: Colors.danger,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.5,
  },
  programTitle: {
    color: Colors.text,
    fontWeight: '900',
    fontSize: 22,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 4,
  },
  trainerName: { color: Colors.textSecondary, fontSize: 13, marginBottom: 20 },
  message: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  purchaseBtn: { width: '100%', borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
  purchaseBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  purchaseBtnText: { color: '#000', fontWeight: '900', fontSize: 15, letterSpacing: 0.5 },
  dismissBtn: { paddingVertical: 8 },
  dismissText: { color: Colors.textTertiary, fontSize: 13 },
});
