import { Stack } from 'expo-router';
import React from 'react';

import Colors from '@/constants/colors';

export default function ChallengesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: {
          backgroundColor: Colors.surface,
        },
        headerTintColor: Colors.text,
        headerShadowVisible: false,
      }}
    />
  );
}
