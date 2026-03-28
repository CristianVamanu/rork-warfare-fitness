import { Stack } from 'expo-router';
import React from 'react';

export default function TrainingStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="session" />
      <Stack.Screen name="complete" />
      <Stack.Screen name="progress" />
    </Stack>
  );
}
