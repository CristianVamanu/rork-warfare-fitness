import { Tabs } from "expo-router";
import { Home, Shield, Dumbbell, Trophy, Users } from "lucide-react-native";
import React from "react";
import { Text } from "react-native";

import Colors from "@/constants/colors";
import { useApp } from "@/contexts/AppContext";

const baseLabelStyle = {
  fontSize: 10,
  fontWeight: '600' as const,
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
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          paddingTop: 4,
          paddingBottom: 8,
          height: 60,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Home size={20} color={color} />,
          tabBarLabel: renderTabLabel("Home"),
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: "Missions",
          tabBarIcon: ({ color }) => <Dumbbell size={20} color={color} />,
          tabBarLabel: renderTabLabel("Missions"),
        }}
      />
      <Tabs.Screen
        name="challenges"
        options={{
          title: "Challenges",
          tabBarIcon: ({ color }) => <Trophy size={20} color={color} />,
          tabBarLabel: renderTabLabel("Challenges"),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: "Community",
          tabBarIcon: ({ color }) => <Users size={22} color={color} />,
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
          tabBarIcon: ({ color }) => <Shield size={20} color={color} />,
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
