import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, ScrollView, Platform, Image, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { UserPlus, Eye, EyeOff } from 'lucide-react-native';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useTraining } from '@/contexts/TrainingContext';


function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export default function RegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ trainer?: string }>();
  const trainerCode = params.trainer?.toUpperCase();
  const { login, adminSettings } = useApp();
  const { resetTrainingData } = useTraining();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [weightUnit, setWeightUnit] = useState<'lbs' | 'kg'>('lbs');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [resetPin, setResetPin] = useState('');
  const [confirmResetPin, setConfirmResetPin] = useState('');



  return (
    <>
      <Stack.Screen options={{ title: 'Register', headerStyle: { backgroundColor: Colors.background }, headerTintColor: Colors.text, headerShadowVisible: false }} />
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
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.sub}>Join the brotherhood</Text>
            <TextInput 
              style={styles.input} 
              placeholder='Full Name' 
              placeholderTextColor={Colors.textTertiary} 
              autoCapitalize='words' 
              value={name} 
              onChangeText={setName} 
            />
            <TextInput 
              style={styles.input} 
              placeholder='Username' 
              placeholderTextColor={Colors.textTertiary} 
              autoCapitalize='none' 
              value={username} 
              onChangeText={setUsername} 
            />
            <TextInput 
              style={styles.input} 
              placeholder='Email' 
              placeholderTextColor={Colors.textTertiary} 
              autoCapitalize='none' 
              keyboardType='email-address' 
              value={email} 
              onChangeText={setEmail} 
            />
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder='Password'
                placeholderTextColor={Colors.textTertiary}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(v => !v)}>
                {showPassword ? <EyeOff size={20} color={Colors.textSecondary} /> : <Eye size={20} color={Colors.textSecondary} />}
              </TouchableOpacity>
            </View>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder='Confirm Password'
                placeholderTextColor={Colors.textTertiary}
                secureTextEntry={!showPassword}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(v => !v)}>
                {showPassword ? <EyeOff size={20} color={Colors.textSecondary} /> : <Eye size={20} color={Colors.textSecondary} />}
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>Password Reset PIN (4-6 digits)</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder='PIN'
                placeholderTextColor={Colors.textTertiary}
                keyboardType='number-pad'
                maxLength={6}
                secureTextEntry
                value={resetPin}
                onChangeText={setResetPin}
              />
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder='Confirm PIN'
                placeholderTextColor={Colors.textTertiary}
                keyboardType='number-pad'
                maxLength={6}
                secureTextEntry
                value={confirmResetPin}
                onChangeText={setConfirmResetPin}
              />
            </View>

            <View style={styles.metricSelector}>
              <Text style={styles.metricLabel}>Measurement System</Text>
              <View style={styles.metricButtons}>
                <TouchableOpacity
                  style={[styles.metricButton, weightUnit === 'lbs' && styles.metricButtonActive]}
                  onPress={() => setWeightUnit('lbs')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.metricButtonText, weightUnit === 'lbs' && styles.metricButtonTextActive]}>Imperial (lbs)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.metricButton, weightUnit === 'kg' && styles.metricButtonActive]}
                  onPress={() => setWeightUnit('kg')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.metricButtonText, weightUnit === 'kg' && styles.metricButtonTextActive]}>Metric (kg)</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.btn} onPress={async () => {
              if (!name || !username || !email || !password || !confirmPassword) { 
                Alert.alert('Missing info', 'Please fill in all fields'); 
                return; 
              }
              
              if (password !== confirmPassword) {
                Alert.alert('Password Mismatch', 'Passwords do not match. Please try again.');
                return;
              }

              if (!resetPin || !confirmResetPin) {
                Alert.alert('Missing PIN', 'Please set a reset PIN for password recovery');
                return;
              }

              if (resetPin.length < 4 || resetPin.length > 6) {
                Alert.alert('Invalid PIN', 'PIN must be 4-6 digits');
                return;
              }

              if (resetPin !== confirmResetPin) {
                Alert.alert('PIN Mismatch', 'PINs do not match. Please try again.');
                return;
              }
              
              if (!isValidEmail(email)) { 
                Alert.alert('Invalid Email', 'Please enter a valid email address'); 
                return; 
              }
              
              try {
                setIsLoading(true);
                await resetTrainingData();
                
                await login(email, name, password, true, username, weightUnit, '', '', '', '', trainerCode ?? undefined, resetPin);
                
                setIsLoading(false);
                router.replace('/onboarding' as any);
              } catch (error) {
                setIsLoading(false);
                Alert.alert('Registration Failed', error instanceof Error ? error.message : 'An error occurred');
              }
            }}>
              <UserPlus size={18} color={Colors.background} />
              <Text style={styles.btnText}>Register</Text>
            </TouchableOpacity>

            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.accent} />
                <Text style={styles.loadingText}>Creating account...</Text>
              </View>
            )}

            <TouchableOpacity onPress={() => router.replace('/login' as any)}>
              <Text style={styles.link}>Have an account? Login</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  unitSelector: { marginBottom: 16, marginTop: 4, width: '100%', maxWidth: 400 },
  unitLabel: { color: Colors.text, fontSize: 14, fontWeight: '600' as const, marginBottom: 8, textAlign: 'center' },
  unitButtons: { flexDirection: 'row', gap: 12 },
  unitButton: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center' },
  unitButtonActive: { borderColor: Colors.accent, backgroundColor: Colors.accent },
  unitButtonText: { color: Colors.textSecondary, fontWeight: '700' as const, fontSize: 14 },
  unitButtonTextActive: { color: Colors.background },
  metricSelector: { marginBottom: 16, width: '100%', maxWidth: 400 },
  metricLabel: { color: Colors.text, fontSize: 14, fontWeight: '600' as const, marginBottom: 8, textAlign: 'center' },
  metricButtons: { flexDirection: 'row', gap: 12 },
  metricButton: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center' },
  metricButtonActive: { borderColor: Colors.accent, backgroundColor: Colors.accent },
  metricButtonText: { color: Colors.textSecondary, fontWeight: '700' as const, fontSize: 14 },
  metricButtonTextActive: { color: Colors.background },
  sectionLabel: { color: Colors.text, fontSize: 14, fontWeight: '600' as const, marginBottom: 8, marginTop: 12, textAlign: 'center', maxWidth: 400, width: '100%' },
  inputRow: { flexDirection: 'row', gap: 12, marginBottom: 12, width: '100%', maxWidth: 400 },
  halfInput: { flex: 1, marginBottom: 0 },
  btn: { backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8, width: '100%', maxWidth: 400 },
  btnText: { color: Colors.background, fontWeight: '900' as const, fontSize: 16 },
  link: { color: Colors.accent, textAlign: 'center', marginTop: 20, fontWeight: '800' as const, fontSize: 15 },
  loadingContainer: { marginTop: 16, alignItems: 'center', width: '100%' },
  loadingText: { color: Colors.text, marginTop: 8, fontSize: 14 },
});
