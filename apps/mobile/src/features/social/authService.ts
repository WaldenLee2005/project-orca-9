import { isAuthRetryableFetchError, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";

export type AuthSignUpMetadata = {
  avatarUrl?: string;
  displayName?: string;
  handle?: string;
  profileVisibility?: string;
};
export type AuthResult = { session: Session | null; user: User | null };
export type AuthDiagnosticEvent = { elapsedMs: number; label: string };
export type AuthDiagnosticCallback = (event: AuthDiagnosticEvent) => void;

export function createAuthService(dependencies: {
  getOptionalClient(): SupabaseClient | null;
  getClient(): SupabaseClient;
  getCallbackUrl(): string;
}) {
  async function getCurrentAuthSession() {
    const client = dependencies.getOptionalClient();
    if (!client) return null;
    // getSession restores persisted sessions and refreshes expiring tokens.
    const { data, error } = await client.auth.getSession();
    if (error) {
      if (isAuthRetryableFetchError(error)) {
        throw new Error("Could not reconnect your account. Check your connection and try again. Your workouts are still available.");
      }
      throw error;
    }
    return data.session;
  }

  async function getCurrentAccessToken() {
    const session = await getCurrentAuthSession();
    if (session?.expires_at && session.expires_at <= Math.floor(Date.now() / 1000)) {
      throw new Error("Your session expired. Reconnect or sign in again. Your workouts are still available.");
    }
    return session?.access_token ?? null;
  }

  return {
    getCurrentAuthSession,
    getCurrentAccessToken,
    async signInWithEmailPassword(email: string, password: string, diagnostic?: AuthDiagnosticCallback): Promise<AuthResult> {
      const startedAt = Date.now();
      diagnostic?.({ elapsedMs: 0, label: "Starting sign in" });
      const { data, error } = await dependencies.getClient().auth.signInWithPassword({ email, password });
      if (error) throw error;
      diagnostic?.({ elapsedMs: Date.now() - startedAt, label: "Session saved" });
      return data;
    },
    async signUpWithEmailPassword(
      email: string,
      password: string,
      diagnostic?: AuthDiagnosticCallback,
      metadata?: AuthSignUpMetadata
    ): Promise<AuthResult> {
      const startedAt = Date.now();
      diagnostic?.({ elapsedMs: 0, label: "Starting sign up" });
      const { data, error } = await dependencies.getClient().auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: dependencies.getCallbackUrl(),
          data: {
            avatar_url: metadata?.avatarUrl,
            display_name: metadata?.displayName,
            handle: metadata?.handle,
            profile_visibility: metadata?.profileVisibility
          }
        }
      });
      if (error) throw error;
      diagnostic?.({ elapsedMs: Date.now() - startedAt, label: data.session ? "Session saved" : "Check your email to confirm" });
      return data;
    },
    async signOut() {
      const client = dependencies.getOptionalClient();
      if (!client) return;
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
    },
    subscribeToAuthChanges(onChange: () => void) {
      const client = dependencies.getOptionalClient();
      if (!client) return () => {};
      const { data } = client.auth.onAuthStateChange(() => {
        // Never await another SDK operation inside the auth callback.
        onChange();
      });
      return () => data.subscription.unsubscribe();
    },
    async storeAuthSessionFromCallbackUrl(callbackUrl: string) {
      const url = new URL(callbackUrl);
      const params = new URLSearchParams(url.hash.slice(1));
      url.searchParams.forEach((value, key) => {
        if (!params.has(key)) params.set(key, value);
      });
      if (params.has("error_description") || params.has("error")) {
        throw new Error(params.get("error_description") ?? "That confirmation link could not be used. Please sign in again.");
      }
      const client = dependencies.getClient();
      const code = params.get("code");
      if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) throw error;
        return;
      }
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (!accessToken || !refreshToken) {
        throw new Error("Confirmation link did not include a complete session. Please sign in again.");
      }
      const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) throw error;
    }
  };
}
