import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { History, Home, Wallet } from "lucide-react-native";
import { t as tr } from "../../src/i18n/strings";
import { useTheme, fonts } from "../../src/theme";

export default function TabLayout() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: c.systemBackground,
          borderTopColor: c.separator,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 58 + insets.bottom,
          paddingTop: 9,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 9,
        },
        tabBarLabelStyle: { fontFamily: fonts.bodySemibold, fontSize: 10, letterSpacing: 0.2 },
        tabBarActiveTintColor: c.tint,
        tabBarInactiveTintColor: c.gray,
        sceneStyle: { backgroundColor: c.systemBackground },
      }}
    >
      <Tabs.Screen name="home" options={{ title: tr("tabs.home"), tabBarIcon: ({ color }) => <Home size={24} color={color} /> }} />
      <Tabs.Screen name="wallet" options={{ title: tr("tabs.wallet"), tabBarIcon: ({ color }) => <Wallet size={24} color={color} /> }} />
      {/* v1 slim-down: History stays routable but off the tab bar (set href to
          "/history" to restore). Drivers live in Home + Wallet. */}
      <Tabs.Screen name="history" options={{ href: null, title: tr("tabs.history"), tabBarIcon: ({ color }) => <History size={24} color={color} /> }} />
    </Tabs>
  );
}
