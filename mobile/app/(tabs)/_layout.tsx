import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, CalendarRange, History, Home, Settings, Wallet } from "lucide-react-native";
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
      {/*
        Client request 2026-08-04: exactly four tabs, in this order — Home,
        Wallet, Shifts, Settings. The order is the client's and is not
        alphabetical or arbitrary: a driver opens Wallet far more often than
        Shifts, so it sits next to Home.

        Notifications came off the bar in the same request and did NOT go away.
        It is a row inside Settings, and the screen is still routable at
        /alerts, so a push notification that deep-links there still lands. Four
        is the ceiling on a phone and Settings had to be reachable without the
        gear on Home, which is the thing drivers were not finding.

        "alerts" not "notifications" as the route name: the web build serves the
        route's chunk from a path carrying the segment, and blockers match
        "notifications", which would render a blank screen in production while
        the server happily returned 200.
      */}
      <Tabs.Screen name="home" options={{ title: tr("tabs.home"), tabBarIcon: ({ color }) => <Home size={24} color={color} /> }} />
      <Tabs.Screen name="wallet" options={{ title: tr("tabs.wallet"), tabBarIcon: ({ color }) => <Wallet size={24} color={color} /> }} />
      <Tabs.Screen name="shifts" options={{ title: tr("tabs.shifts"), tabBarIcon: ({ color }) => <CalendarRange size={24} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: tr("tabs.settings"), tabBarIcon: ({ color }) => <Settings size={24} color={color} /> }} />
      {/* Off the bar, still routable. `href: null` keeps the route mounted in
          the group so /alerts and /history resolve; it only removes the button. */}
      <Tabs.Screen name="alerts" options={{ href: null, title: tr("tabs.alerts"), tabBarIcon: ({ color }) => <Bell size={24} color={color} /> }} />
      <Tabs.Screen name="history" options={{ href: null, title: tr("tabs.history"), tabBarIcon: ({ color }) => <History size={24} color={color} /> }} />
    </Tabs>
  );
}
