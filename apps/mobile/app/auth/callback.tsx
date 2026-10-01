import { createThemedStyles } from "../../src/theme/designSystem";
import * as Linking from "expo-linking";
import { Stack, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { storeAuthSessionFromCallbackUrl } from "../../src/features/social/authRepository";
import { useAppTheme, useThemeStyles } from "../../src/theme/ThemeProvider";

export default function AuthCallbackScreen() {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  const router = useRouter();
  const theme = useAppTheme();
  const url = Linking.useURL();
  const [statusText, setStatusText] = useState("Confirming email...");
  const [isConfirming, setIsConfirming] = useState(true);
  const pending = useRef<{ url: string; promise: Promise<void> } | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function confirmEmail() {
      try {
        const callbackUrl = url ?? await Linking.getInitialURL();

        if (!callbackUrl) {
          throw new Error("Could not read confirmation link.");
        }

        if (pending.current?.url !== callbackUrl) {
          pending.current = { url: callbackUrl, promise: storeAuthSessionFromCallbackUrl(callbackUrl) };
        }
        await pending.current.promise;

        if (!isMounted) {
          return;
        }

        setStatusText("Email confirmed.");
        router.replace({
          pathname: "/profile",
          params: { authChanged: Date.now().toString() }
        });
      } catch (error) {
        if (isMounted) {
          setIsConfirming(false);
          setStatusText(error instanceof Error ? error.message : "Could not confirm email.");
        }
      }
    }

    confirmEmail();

    return () => {
      isMounted = false;
    };
  }, [router, url]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        {isConfirming ? <ActivityIndicator color={theme.colors.accent} /> : null}
        <Text style={[styles.statusText, { color: theme.colors.secondaryText }]}>{statusText}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace("/workouts")} style={styles.continueButton}>
          <Text style={[styles.statusText, { color: theme.colors.text }]}>Continue to workouts</Text>
        </Pressable>
      </View>
    </>
  );
}

const themedStyles = createThemedStyles((colors, ui) => ({
  continueButton: {
    ...ui.control,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 16
  },
  screen: {
    alignItems: "center",
    flex: 1,
    gap: 16,
    justifyContent: "center",
    padding: 24
  },
  statusText: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
    textAlign: "center",
    textTransform: "none"
  }
}));
