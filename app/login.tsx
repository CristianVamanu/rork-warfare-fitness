import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, ScrollView, Platform, Image, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LogIn } from 'lucide-react-native';

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
            <TextInput
              style={styles.input}
              placeholder='Password'
              placeholderTextColor={Colors.textTertiary}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
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

            <TouchableOpacity onPress={() => router.push('/register' as any)}>
              <Text style={styles.link}>No account? Register</Text>
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
  btn: { backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8, width: '100%', maxWidth: 400 },
  btnText: { color: Colors.background, fontWeight: '900' as const, fontSize: 16 },
  link: { color: Colors.accent, textAlign: 'center', marginTop: 20, fontWeight: '800' as const, fontSize: 15 },
  loadingContainer: { marginTop: 16, alignItems: 'center', width: '100%' },
  loadingText: { color: Colors.text, marginTop: 8, fontSize: 14 },
});
