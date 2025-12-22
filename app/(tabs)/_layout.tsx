import { Tabs } from "expo-router";
import { Home, Shield, Dumbbell, Trophy, Users } from "lucide-react-native";
import React from "react";
import { Text } from "react-native";

import Colors from "@/constants/colors";
import { useApp } from "@/contexts/AppContext";

const baseLabelStyle = {
  fontSize: 11,
  fontWeight: '500' as const,
  marginTop: 4,
};

const renderTabLabel = (title: string) => {
  const Label = ({ color }: { color: string }) => (
    <Text
      testID={`tab-label-${title.toLowerCase().replace(/\s+/g, '-')}`}
      style={[baseLabelStyle, { color }]}
    >
      {title}
    </Text>
  );
  Label.displayName = `${title}TabLabel`;
  return Label;
};

export default function TabLayout() {
  const { user } = useApp();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textSecondary,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.background,
          borderTopColor: 'transparent',
          borderTopWidth: 0,
          paddingTop: 8,
          paddingBottom: 8,
          height: 65,
          elevation: 0,
          shadowOpacity: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Home size={22} color={color} strokeWidth={2} />,
          tabBarLabel: renderTabLabel("Home"),
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: "Missions",
          tabBarIcon: ({ color }) => <Dumbbell size={22} color={color} strokeWidth={2} />,
          tabBarLabel: renderTabLabel("Missions"),
        }}
      />
      <Tabs.Screen
        name="challenges"
        options={{
          title: "Challenges",
          tabBarIcon: ({ color }) => <Trophy size={22} color={color} strokeWidth={2} />,
          tabBarLabel: renderTabLabel("Challenges"),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: "Community",
          tabBarIcon: ({ color }) => <Users size={22} color={color} strokeWidth={2} />,
          tabBarLabel: renderTabLabel("Community"),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          tabBarIcon: ({ color }) => <Shield size={22} color={color} strokeWidth={2} />,
          tabBarLabel: renderTabLabel("Admin"),
          href: user?.isAdmin ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
