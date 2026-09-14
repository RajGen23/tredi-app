import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { LogBox, View } from "react-native";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider } from "@/src/auth";
import { ToastProvider } from "@/src/components/sheet";
import { PeriodProvider } from "@/src/period";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

export default function RootLayout() {
  const [loaded] = useFonts({
    "Manrope-Regular": require("../assets/fonts/Manrope-Regular.ttf"),
    "Manrope-Medium": require("../assets/fonts/Manrope-Medium.ttf"),
    "Manrope-SemiBold": require("../assets/fonts/Manrope-SemiBold.ttf"),
    "Manrope-Bold": require("../assets/fonts/Manrope-Bold.ttf"),
    "Manrope-ExtraBold": require("../assets/fonts/Manrope-ExtraBold.ttf"),
    "IBMPlexMono-Regular": require("../assets/fonts/IBMPlexMono-Regular.ttf"),
    "IBMPlexMono-Medium": require("../assets/fonts/IBMPlexMono-Medium.ttf"),
    "IBMPlexMono-SemiBold": require("../assets/fonts/IBMPlexMono-SemiBold.ttf"),
  });

  if (!loaded) return <View style={{ flex: 1, backgroundColor: "#00C98D" }} />;

  // One app level ErrorBoundary; a render crash shows a reload screen
  // instead of a blank app.
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <KeyboardProvider>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <PeriodProvider>
                <ToastProvider>
                  <StatusBar style="dark" />
                  <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F3F7F5" } }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="quick-sale" options={{ presentation: "fullScreenModal" }} />
                    <Stack.Screen name="invoices/new" options={{ presentation: "fullScreenModal" }} />
                    <Stack.Screen name="customers/new" options={{ presentation: "modal" }} />
                    <Stack.Screen name="stock/new" options={{ presentation: "modal" }} />
                    <Stack.Screen name="expenses/new" options={{ presentation: "modal" }} />
                    <Stack.Screen name="payments/new" options={{ presentation: "modal" }} />
                    <Stack.Screen name="suppliers/new" options={{ presentation: "modal" }} />
                    <Stack.Screen name="purchases/new" options={{ presentation: "fullScreenModal" }} />
                    <Stack.Screen name="transfers/new" options={{ presentation: "modal" }} />
                    <Stack.Screen name="quotes/new" options={{ presentation: "fullScreenModal" }} />
                    <Stack.Screen name="shops/new" options={{ presentation: "modal" }} />
                    <Stack.Screen name="businesses/new" options={{ presentation: "modal" }} />
                    <Stack.Screen name="team/invite" options={{ presentation: "modal" }} />
                    <Stack.Screen name="team/role-new" options={{ presentation: "modal" }} />
                    <Stack.Screen name="search" options={{ presentation: "modal", animation: "fade" }} />
                    <Stack.Screen name="shortcuts" options={{ presentation: "modal" }} />
                    <Stack.Screen name="lock" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
                  </Stack>
                </ToastProvider>
                </PeriodProvider>
              </AuthProvider>
            </QueryClientProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
