import * as Linking from "expo-linking";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { storeAuthSessionFromCallbackUrl } from "../../src/features/social/authRepository";
import { useAppTheme } from "../../src/theme/ThemeProvider";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const url = Linking.useURL();
  const [statusText, setStatusText] = useState("Confirming email...");

  useEffect(() => {
    let isMounted = true;

    async function confirmEmail() {
      try {
        const callbackUrl = url ?? await Linking.getInitialURL();

        if (!callbackUrl) {
          throw new Error("Could not read confirmation link.");
        }

        await storeAuthSessionFromCallbackUrl(callbackUrl);

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
        <ActivityIndicator color={theme.colors.accent} />
        <Text style={[styles.statusText, { color: theme.colors.secondaryText }]}>{statusText}</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    flex: 1,
    gap: 16,
    justifyContent: "center",
    padding: 24
  },
  statusText: {
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    textAlign: "center",
    textTransform: "uppercase"
  }
});
