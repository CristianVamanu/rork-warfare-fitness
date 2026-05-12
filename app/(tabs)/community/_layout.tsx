import { Stack } from "expo-router";
import React from "react";

import Colors from "@/constants/colors";

export default function CommunityLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[channelId]" />
    </Stack>
  );
}
