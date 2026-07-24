import "react-native-url-polyfill/auto";

import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn("Missing Supabase environment variables.");
}

export const supabase = createClient(supabaseUrl ?? "", supabasePublishableKey ?? "", {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: false,
    persistSession: false
  }
});

export function getSupabaseConfig() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return {
    publishableKey: supabasePublishableKey,
    url: supabaseUrl
  };
}

if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
