import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';
import { X, PlayCircle, AlertCircle } from 'lucide-react-native';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';

function isValidVideoUrl(url: string): boolean {
  if (!url) return false;
  
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
    console.warn('[WelcomeVideo] YouTube links are not supported. Please use a direct video URL (mp4, m3u8, etc.)');
    return false;
  }
  
  return true;
}

export default function WelcomeVideoScreen() {
  const router = useRouter();
  const { adminSettings } = useApp();
  const [isLoading, setIsLoading] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const videoUrl = adminSettings.welcomeVideoUrl || '';
  const isValidUrl = isValidVideoUrl(videoUrl);

  const handleSkip = () => {
    router.replace('/(tabs)' as any);
  };

  const handleVideoEnd = () => {
    router.replace('/(tabs)' as any);
  };

  if (!videoUrl || !isValidUrl) {
    handleSkip();
    return null;
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <X size={24} color={Colors.text} />
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>

        <View style={styles.videoContainer}>
          {isLoading && !videoError && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.accent} />
              <Text style={styles.loadingText}>Loading welcome message...</Text>
            </View>
          )}

          {videoError ? (
            <View style={styles.errorContainer}>
              <AlertCircle size={64} color={Colors.danger} />
              <Text style={styles.errorText}>Unable to load video</Text>
              {errorMessage ? (
                <Text style={styles.errorDetails}>{errorMessage}</Text>
              ) : null}
              <TouchableOpacity style={styles.continueButton} onPress={handleSkip}>
                <Text style={styles.continueButtonText}>Continue to App</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Video
              source={{ uri: videoUrl }}
              style={styles.video}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              useNativeControls={false}
              isLooping={false}
              isMuted={false}
              onLoad={() => {
                setIsLoading(false);
                console.log('[WelcomeVideo] Video loaded successfully');
              }}
              onError={(error) => {
                console.error('[WelcomeVideo] Video error:', error);
                
                let message = 'Please check the video URL';
                if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
                  message = 'YouTube links are not supported. Please use a direct video URL (e.g., .mp4, .m3u8)';
                } else if (Platform.OS === 'android' && error) {
                  message = 'Video format may not be supported on Android. Try using MP4 format.';
                } else if (Platform.OS === 'ios' && error) {
                  message = 'Video format may not be supported on iOS. Try using MP4 or HLS (.m3u8) format.';
                } else if (error) {
                  message = 'The video could not be loaded. Please verify the URL is accessible.';
                }
                
                setErrorMessage(message);
                setVideoError(true);
                setIsLoading(false);
              }}
              onPlaybackStatusUpdate={(status) => {
                if ('didJustFinish' in status && status.didJustFinish) {
                  handleVideoEnd();
                }
                if ('error' in status && status.error) {
                  console.error('[WelcomeVideo] Playback error:', status.error);
                  setErrorMessage('The video could not be played. Please try a different format.');
                  setVideoError(true);
                  setIsLoading(false);
                }
              }}
            />
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.welcomeText}>{adminSettings.welcomeMessage || 'Welcome to Warfare Fitness, Soldier!'}</Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  skipButton: {
    position: 'absolute' as const,
    top: 60,
    right: 20,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  skipText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 32,
  },
  errorText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
    textAlign: 'center',
  },
  errorDetails: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  continueButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 16,
  },
  continueButtonText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  footer: {
    padding: 32,
    alignItems: 'center',
  },
  welcomeText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
    textAlign: 'center',
    lineHeight: 26,
  },
});
