import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";
import { ACCOUNT_UNAVAILABLE_MESSAGE, createAuthClient, isAuthConfigured } from "./authClient";

const config = {
  url: process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "",
  publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ""
};

let client: ReturnType<typeof createAuthClient> = null;

export function isSupabaseConfigured() {
  return isAuthConfigured(config);
}

// No client, auth restore, or network request runs just from importing a screen.
export function getOptionalSupabaseClient() {
  if (!client) {
    client = createAuthClient(config, AsyncStorage);
    if (client && Platform.OS !== "web") {
      const auth = client.auth;
      const updateRefresh = (state: string) => {
        if (state === "active") void auth.startAutoRefresh();
        else void auth.stopAutoRefresh();
      };
      updateRefresh(AppState.currentState);
      AppState.addEventListener("change", updateRefresh);
    }
  }
  return client;
}

export function getSupabaseClient() {
  const supabase = getOptionalSupabaseClient();
  if (!supabase) throw new Error(ACCOUNT_UNAVAILABLE_MESSAGE);
  return supabase;
}

export function getSupabaseConfig() {
  if (!isSupabaseConfigured()) throw new Error(ACCOUNT_UNAVAILABLE_MESSAGE);
  return config;
}
