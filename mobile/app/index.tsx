import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";

export default function SplashScreen() {
  const router = useRouter();

  // Demo build: the whole app runs on mock data, so skip enrollment and go
  // straight to the dashboard. (To restore live enrollment, route to
  // "/enrollment" when no agent_token is stored.)
  useEffect(() => {
    router.replace("/(tabs)/dashboard");
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#1A1A2E" }}>
      <ActivityIndicator size="large" color="#F97316" />
    </View>
  );
}
