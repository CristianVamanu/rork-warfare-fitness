import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, ScrollView, Platform, Image, ActivityIndicator, Modal } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LogIn, X, Eye, EyeOff } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export default function LoginScreen() {
  const router = useRouter();
  const { login, adminSettings } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetPin, setResetPin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');



  return (
    <>
      <Stack.Screen options={{ title: 'Login', headerStyle: { backgroundColor: Colors.background }, headerTintColor: Colors.text, headerShadowVisible: false }} />
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps='handled'
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.root}>
            {adminSettings.appLogo ? (
              <Image source={{ uri: adminSettings.appLogo }} style={styles.logo} />
            ) : null}
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.sub}>Sign in to continue your missions</Text>
            <TextInput style={styles.input} placeholder='Email' placeholderTextColor={Colors.textTertiary} autoCapitalize='none' keyboardType='email-address' value={email} onChangeText={setEmail} />
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder='Password'
                placeholderTextColor={Colors.textTertiary}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(v => !v)}
              >
                {showPassword ? (
                  <EyeOff size={20} color={Colors.textSecondary} />
                ) : (
                  <Eye size={20} color={Colors.textSecondary} />
                )}
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.btn} onPress={async () => {
              if (!email) { Alert.alert('Missing info', 'Enter email'); return; }
              if (!isValidEmail(email)) { Alert.alert('Invalid Email', 'Please enter a valid email address'); return; }
              if (!password) { Alert.alert('Missing info', 'Enter password'); return; }
              try {
                setIsLoading(true);
                await login(email, '', password);
                setIsLoading(false);
                router.replace('/(tabs)' as any);
              } catch (error) {
                setIsLoading(false);
                Alert.alert('Login Failed', error instanceof Error ? error.message : 'Invalid credentials');
              }
            }}>
              <LogIn size={18} color={Colors.background} />
              <Text style={styles.btnText}>Login</Text>
            </TouchableOpacity>

            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.accent} />
                <Text style={styles.loadingText}>Logging in...</Text>
              </View>
            )}

            <TouchableOpacity onPress={() => setShowForgotPassword(true)}>
              <Text style={styles.forgotLink}>Forgot Password?</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/register' as any)}>
              <Text style={styles.link}>No account? Register</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showForgotPassword} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContent}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reset Password</Text>
              <TouchableOpacity onPress={() => {
                setShowForgotPassword(false);
                setResetEmail('');
                setResetPin('');
                setNewPassword('');
                setConfirmNewPassword('');
              }}>
                <X size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalDescription}>
                Enter your email and the PIN you set during registration
              </Text>
              <TextInput
                style={styles.input}
                placeholder='Email'
                placeholderTextColor={Colors.textTertiary}
                autoCapitalize='none'
                keyboardType='email-address'
                value={resetEmail}
                onChangeText={setResetEmail}
              />
              <TextInput
                style={styles.input}
                placeholder='Reset PIN'
                placeholderTextColor={Colors.textTertiary}
                keyboardType='number-pad'
                maxLength={6}
                secureTextEntry
                value={resetPin}
                onChangeText={setResetPin}
              />
              <TextInput
                style={styles.input}
                placeholder='New Password'
                placeholderTextColor={Colors.textTertiary}
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <TextInput
                style={styles.input}
                placeholder='Confirm New Password'
                placeholderTextColor={Colors.textTertiary}
                secureTextEntry
                value={confirmNewPassword}
                onChangeText={setConfirmNewPassword}
              />
              <TouchableOpacity
                style={styles.btn}
                onPress={async () => {
                  if (!resetEmail || !resetPin || !newPassword || !confirmNewPassword) {
                    Alert.alert('Missing info', 'Please fill in all fields');
                    return;
                  }
                  if (!isValidEmail(resetEmail)) {
                    Alert.alert('Invalid Email', 'Please enter a valid email address');
                    return;
                  }
                  if (newPassword !== confirmNewPassword) {
                    Alert.alert('Password Mismatch', 'Passwords do not match');
                    return;
                  }
                  if (resetPin.length < 4 || resetPin.length > 6) {
                    Alert.alert('Invalid PIN', 'PIN must be 4-6 digits');
                    return;
                  }

                  try {
                    const allUsersData = await AsyncStorage.getItem('warfare_all_users');
                    if (!allUsersData) {
                      Alert.alert('Error', 'No users found');
                      return;
                    }
                    const allUsers = JSON.parse(allUsersData);
                    const userIndex = allUsers.findIndex(
                      (u: any) => u.email === resetEmail.toLowerCase().trim() && u.resetPin === resetPin
                    );

                    if (userIndex === -1) {
                      Alert.alert('Error', 'Invalid email or PIN');
                      return;
                    }

                    allUsers[userIndex] = { ...allUsers[userIndex] };
                    await AsyncStorage.setItem('warfare_all_users', JSON.stringify(allUsers));

                    Alert.alert('Success', 'Password reset successfully! Please login with your new password.', [
                      {
                        text: 'OK',
                        onPress: () => {
                          setShowForgotPassword(false);
                          setResetEmail('');
                          setResetPin('');
                          setNewPassword('');
                          setConfirmNewPassword('');
                          setEmail(resetEmail);
                        },
                      },
                    ]);
                  } catch (error) {
                    Alert.alert('Error', 'Failed to reset password');
                    console.error('[Login] Password reset error:', error);
                  }
                }}
              >
                <Text style={styles.btnText}>Reset Password</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },
  root: { flex: 1, backgroundColor: Colors.background, padding: 16, justifyContent: 'center', minHeight: 500, alignItems: 'center' },
  logo: { width: 120, height: 120, borderRadius: 20, marginBottom: 32, alignSelf: 'center' },
  title: { color: Colors.text, fontWeight: '900' as const, fontSize: 28, textAlign: 'center', marginBottom: 8 },
  sub: { color: Colors.textSecondary, marginBottom: 32, fontWeight: '600' as const, textAlign: 'center', fontSize: 15 },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: Colors.text, marginBottom: 12, width: '100%', maxWidth: 400 },
  passwordContainer: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, marginBottom: 12, width: '100%', maxWidth: 400 },
  passwordInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, color: Colors.text, fontSize: 16 },
  eyeButton: { paddingHorizontal: 14, paddingVertical: 14 },
  btn: { backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8, width: '100%', maxWidth: 400 },
  btnText: { color: Colors.background, fontWeight: '900' as const, fontSize: 16 },
  forgotLink: { color: Colors.textSecondary, textAlign: 'center', marginTop: 12, fontWeight: '600' as const, fontSize: 14 },
  link: { color: Colors.accent, textAlign: 'center', marginTop: 8, fontWeight: '800' as const, fontSize: 15 },
  loadingContainer: { marginTop: 16, alignItems: 'center', width: '100%' },
  loadingText: { color: Colors.text, marginTop: 8, fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  modalContent: { backgroundColor: Colors.background, borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontSize: 24, fontWeight: '900' as const, color: Colors.text },
  modalDescription: { fontSize: 14, color: Colors.textSecondary, marginBottom: 24, textAlign: 'center' },
});
