import * as Linking from "expo-linking";
import { getOptionalSupabaseClient, getSupabaseClient } from "../../lib/supabase";
import { createAuthService } from "./authService";

export type { AuthSignUpMetadata, AuthResult, AuthDiagnosticEvent, AuthDiagnosticCallback } from "./authService";

const auth = createAuthService({
  getOptionalClient: getOptionalSupabaseClient,
  getClient: getSupabaseClient,
  getCallbackUrl: () => Linking.createURL("auth/callback")
});

export const getCurrentAuthSession = auth.getCurrentAuthSession;
export const getCurrentAccessToken = auth.getCurrentAccessToken;
export const signInWithEmailPassword = auth.signInWithEmailPassword;
export const signUpWithEmailPassword = auth.signUpWithEmailPassword;
export const signOut = auth.signOut;
export const storeAuthSessionFromCallbackUrl = auth.storeAuthSessionFromCallbackUrl;
export const subscribeToAuthChanges = auth.subscribeToAuthChanges;
