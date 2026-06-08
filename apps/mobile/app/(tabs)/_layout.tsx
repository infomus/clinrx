import { Tabs } from "expo-router";
import {
  Headphones,
  Search,
  ShieldAlert,
  Trophy,
} from "lucide-react-native";

import { ProtectedRoute } from "@/components/ProtectedRoute";

const iconColor = {
  active: "#1d6b57",
  inactive: "#6e7974",
};

export default function TabsLayout() {
  return (
    <ProtectedRoute>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: iconColor.active,
          tabBarInactiveTintColor: iconColor.inactive,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
          },
          tabBarStyle: {
            backgroundColor: "#ffffff",
            borderTopColor: "rgba(23, 33, 31, 0.1)",
            height: 68,
            paddingBottom: 10,
            paddingTop: 8,
          },
        }}
      >
        <Tabs.Screen
          name="interactions"
          options={{
            title: "Interactions",
            tabBarIcon: ({ color, size }) => (
              <ShieldAlert color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: "CPS Search",
            tabBarIcon: ({ color, size }) => <Search color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="quiz"
          options={{
            title: "Quiz",
            tabBarIcon: ({ color, size }) => <Trophy color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="prep"
          options={{
            title: "Audio/OSCE",
            tabBarIcon: ({ color, size }) => (
              <Headphones color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </ProtectedRoute>
  );
}
