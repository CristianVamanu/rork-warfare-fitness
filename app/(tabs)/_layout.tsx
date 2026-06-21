import { Tabs } from "expo-router";
import { Home, Shield, Dumbbell, Trophy, Users, ShoppingBag, Zap } from "lucide-react-native";
import React from "react";
import { Text } from "react-native";

import Colors from "@/constants/colors";
import { useApp } from "@/contexts/AppContext";

const baseLabelStyle = {
  fontSize: 10,
  fontWeight: '600' as const,
  marginTop: 4,
  letterSpacing: 0.3 as const,
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
  const isTrainerOrAdmin = user?.isTrainer || user?.isAdmin;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textTertiary,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0A0A0A',
          borderTopColor: 'rgba(245,166,35,0.15)',
          borderTopWidth: 1,
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
          title: "Programs",
          tabBarIcon: ({ color }) => <Dumbbell size={22} color={color} strokeWidth={2} />,
          tabBarLabel: renderTabLabel("Programs"),
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
        options={{ href: null }}
      />
      <Tabs.Screen
        name="progress"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile"
        options={{ href: null }}
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
    </Tabs>
  );
}
