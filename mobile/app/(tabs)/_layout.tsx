import { Tabs } from "expo-router";
import { Home, Trophy, Ticket } from "lucide-react-native";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: {
        backgroundColor: "#fff",
        borderTopColor: "#e5e5ea",
        height: 84,
        paddingTop: 8,
        paddingBottom: 24,
      },
      tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      tabBarActiveTintColor: "#007A3D",
      tabBarInactiveTintColor: "#8e8e93",
    }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="points"
        options={{
          title: "Score",
          tabBarIcon: ({ color, size }) => <Trophy size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: "Tickets",
          tabBarIcon: ({ color, size }) => <Ticket size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
