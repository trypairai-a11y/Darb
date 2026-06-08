import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { Home, Trophy, Package, Ticket } from "lucide-react-native";
import { useTheme, fontFamily } from "../../src/theme";

export default function TabLayout() {
  const { c } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: c.systemBackground,
          borderTopColor: c.separator,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 84,
          paddingTop: 8,
          paddingBottom: 26,
        },
        tabBarLabelStyle: { fontFamily, fontSize: 10, fontWeight: "500", letterSpacing: 0.07 },
        tabBarActiveTintColor: c.tint,
        tabBarInactiveTintColor: c.secondaryLabel,
        tabBarItemStyle: { paddingTop: 2 },
        sceneStyle: { backgroundColor: c.groupedBackground },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Home", tabBarIcon: ({ color, focused }) => <Home size={26} color={color} strokeWidth={focused ? 2.4 : 2} /> }} />
      <Tabs.Screen name="points" options={{ title: "Score", tabBarIcon: ({ color, focused }) => <Trophy size={26} color={color} strokeWidth={focused ? 2.4 : 2} /> }} />
      <Tabs.Screen name="equipment" options={{ title: "Equipment", tabBarIcon: ({ color, focused }) => <Package size={26} color={color} strokeWidth={focused ? 2.4 : 2} /> }} />
      <Tabs.Screen name="tickets" options={{ title: "Tickets", tabBarIcon: ({ color, focused }) => <Ticket size={26} color={color} strokeWidth={focused ? 2.4 : 2} /> }} />
    </Tabs>
  );
}
