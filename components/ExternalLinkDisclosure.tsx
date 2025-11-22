import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
} from 'react-native';
import { ExternalLink, AlertCircle } from 'lucide-react-native';
import Colors from '@/constants/colors';

interface ExternalLinkDisclosureProps {
  visible: boolean;
  onClose: () => void;
  url: string;
  title?: string;
  description?: string;
}

export default function ExternalLinkDisclosure({
  visible,
  onClose,
  url,
  title,
  description,
}: ExternalLinkDisclosureProps) {
  const handleOpenLink = async () => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        onClose();
        console.log('[ExternalLinkDisclosure] Link opened:', url);
      } else {
        Alert.alert('Error', 'Cannot open this link. Please check the URL.');
        console.error('[ExternalLinkDisclosure] URL not supported:', url);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open the link. Please try again.');
      console.error('[ExternalLinkDisclosure] Failed to open link:', error);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <ExternalLink size={32} color={Colors.accent} />
          </View>

          <Text style={styles.title}>Leaving the App</Text>

          {title && (
            <Text style={styles.itemTitle}>{title}</Text>
          )}

          <View style={styles.warningContainer}>
            <AlertCircle size={18} color="#F59E0B" />
            <Text style={styles.warningText}>
              You are about to leave this app and visit an external website
            </Text>
          </View>

          <Text style={styles.description}>
            {description || 'This link will open in your web browser. Please note that external websites have their own terms and privacy policies that are independent from this app.'}
          </Text>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Important Information:</Text>
            <Text style={styles.infoText}>
              • The content on external sites is not controlled by this app
            </Text>
            <Text style={styles.infoText}>
              • External sites may have different privacy practices
            </Text>
            <Text style={styles.infoText}>
              • This app is not responsible for external content
            </Text>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Stay in App</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.confirmButton]}
              onPress={handleOpenLink}
              activeOpacity={0.7}
            >
              <ExternalLink size={18} color={Colors.background} />
              <Text style={styles.confirmButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 450,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  title: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.accent,
    textAlign: 'center',
    marginBottom: 16,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#92400E',
    lineHeight: 18,
  },
  description: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  infoBox: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  infoText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  cancelButton: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  confirmButton: {
    backgroundColor: Colors.accent,
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.background,
  },
});
