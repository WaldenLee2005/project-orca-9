import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AuthStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type AuthConfig = { url: string; publishableKey: string };
export const LEGACY_AUTH_SESSION_KEY = "orca9.auth.session";
export const ACCOUNT_UNAVAILABLE_MESSAGE = "Accounts are unavailable right now. You can still log workouts without an account.";

export function isAuthConfigured(config: AuthConfig) {
  try {
    const url = new URL(config.url);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      url.hostname !== "your-project-id.supabase.co" &&
      Boolean(config.publishableKey) &&
      config.publishableKey !== "your-publishable-key"
    );
  } catch {
    return false;
  }
}

export function getAuthStorageKey(url: string) {
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

// The SDK owns persistence and token rotation. Import a previous installation's
// custom session once, without changing local profiles or workout data.
export function createAuthStorage(storage: AuthStorage, config: AuthConfig): AuthStorage {
  const sessionKey = getAuthStorageKey(config.url);
  return {
    async getItem(key) {
      const stored = await storage.getItem(key);
      if (stored !== null || key !== sessionKey) return stored;

      const legacy = await storage.getItem(LEGACY_AUTH_SESSION_KEY);
      if (!legacy) return null;
      let session;
      try {
        const parsed = JSON.parse(legacy);
        if (typeof parsed?.accessToken !== "string" || typeof parsed?.refreshToken !== "string" || !parsed?.user?.id) {
          return null;
        }
        const payload = parsed.accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
        if (claims.iss !== `${config.url.replace(/\/$/, "")}/auth/v1`) return null;
        const expiresAt = Number.isFinite(parsed.expiresAt) ? parsed.expiresAt : claims.exp;
        session = {
          access_token: parsed.accessToken,
          refresh_token: parsed.refreshToken,
          expires_at: Number.isFinite(expiresAt) ? expiresAt : 1,
          expires_in: Math.max(0, (expiresAt || 1) - Math.floor(Date.now() / 1000)),
          token_type: "bearer",
          user: parsed.user
        };
      } catch {
        return null;
      }

      const migrated = JSON.stringify(session);
      await storage.setItem(key, migrated);
      await storage.removeItem(LEGACY_AUTH_SESSION_KEY);
      return migrated;
    },
    setItem: (key, value) => storage.setItem(key, value),
    async removeItem(key) {
      // Remove the import source first so signing out can never resurrect it.
      if (key === sessionKey) await storage.removeItem(LEGACY_AUTH_SESSION_KEY);
      await storage.removeItem(key);
    }
  };
}

export function createFetchWithTimeout(fetcher: typeof fetch, timeoutMs = 8000): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const signal = init?.signal ?? (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined);
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      return await fetcher(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  };
}

export function createAuthClient(
  config: AuthConfig,
  storage: AuthStorage,
  fetcher: typeof fetch = (...args) => fetch(...args)
): SupabaseClient | null {
  if (!isAuthConfigured(config)) return null;
  return createClient(config.url, config.publishableKey, {
    auth: {
      storage: createAuthStorage(storage, config),
      storageKey: getAuthStorageKey(config.url),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
    },
    global: { fetch: createFetchWithTimeout(fetcher) }
  });
}
