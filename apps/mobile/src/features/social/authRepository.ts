import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { Session, User } from "@supabase/supabase-js";
import { getSupabaseConfig } from "../../lib/supabase";

const AUTH_SESSION_KEY = "orca9.auth.session";
const AUTH_CALLBACK_PATH = "auth/callback";

let memorySession: Session | null = null;

type StoredAuthSession = {
  accessToken: string;
  expiresAt?: number;
  refreshToken?: string;
  user: User;
};

export type AuthSignUpMetadata = {
  avatarUrl?: string;
  displayName?: string;
  handle?: string;
  profileVisibility?: string;
};

export type AuthResult = {
  session: Session | null;
  user: User | null;
};

export type AuthDiagnosticEvent = {
  elapsedMs: number;
  label: string;
};

export type AuthDiagnosticCallback = (event: AuthDiagnosticEvent) => void;

type AuthTrace = (label: string) => void;

export async function getCurrentAuthSession() {
  if (memorySession) {
    return memorySession;
  }

  const storedValue = await Promise.race([
    AsyncStorage.getItem(AUTH_SESSION_KEY),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000))
  ]);

  if (!storedValue) {
    return null;
  }

  const storedSession = JSON.parse(storedValue) as StoredAuthSession;

  memorySession = {
    access_token: storedSession.accessToken,
    expires_at: storedSession.expiresAt,
    refresh_token: storedSession.refreshToken,
    token_type: "bearer",
    user: storedSession.user
  } as Session;

  return memorySession;
}

export async function getCurrentAccessToken() {
  const session = await getCurrentAuthSession();
  return session?.access_token ?? null;
}

export async function signUpWithEmailPassword(
  email: string,
  password: string,
  onDiagnostic?: AuthDiagnosticCallback,
  metadata?: AuthSignUpMetadata
) {
  const trace = createAuthTrace(onDiagnostic);
  trace("Starting sign up request");
  const payload = await authFetch(
    `signup?redirect_to=${encodeURIComponent(getAuthCallbackUrl())}`,
    { email, password, data: mapSignUpMetadata(metadata) },
    trace
  );

  if (payload.access_token && payload.user) {
    trace("Storing returned session");
    storeAuthSession(payload);
  }

  trace("Sign up finished");

  return {
    session: payload.access_token ? mapAuthPayloadToSession(payload) : null,
    user: payload.user ?? null
  } satisfies AuthResult;
}

export async function signInWithEmailPassword(email: string, password: string, onDiagnostic?: AuthDiagnosticCallback) {
  const trace = createAuthTrace(onDiagnostic);
  trace("Starting sign in request");
  const payload = await authFetch("token?grant_type=password", { email, password }, trace);

  if (!payload.access_token || !payload.user) {
    throw new Error("Could not finish sign in.");
  }

  trace("Storing returned session");
  storeAuthSession(payload);
  trace("Sign in finished");

  return {
    session: mapAuthPayloadToSession(payload),
    user: payload.user
  } satisfies AuthResult;
}

export async function signOut() {
  memorySession = null;
  AsyncStorage.removeItem(AUTH_SESSION_KEY).catch(() => {
    // In-memory sign-out already happened.
  });
}

export async function storeAuthSessionFromCallbackUrl(callbackUrl: string) {
  const tokens = parseAuthTokensFromUrl(callbackUrl);

  if (!tokens.accessToken) {
    throw new Error(
      tokens.code
        ? "Confirmation link returned an auth code instead of a session. Use Supabase implicit email redirects for now."
        : "Confirmation link did not include an app session."
    );
  }

  const user = await getUserForAccessToken(tokens.accessToken);

  storeAuthSession({
    access_token: tokens.accessToken,
    expires_in: tokens.expiresIn,
    refresh_token: tokens.refreshToken,
    user
  });
}

export function getAuthCallbackUrl() {
  return Linking.createURL(AUTH_CALLBACK_PATH);
}

async function authFetch(path: string, body: AuthRequestBody, trace: AuthTrace) {
  const { publishableKey, url } = getSupabaseConfig();
  trace("Supabase config loaded");
  const payload = await xhrPostJson(`${url}/auth/v1/${path}`, {
    body,
    headers: {
      Authorization: `Bearer ${publishableKey}`,
      apikey: publishableKey,
      "Content-Type": "application/json"
    }
  }, trace);

  return payload;
}

function parseAuthTokensFromUrl(callbackUrl: string) {
  const [, fragment = ""] = callbackUrl.split("#");
  const query = callbackUrl.includes("?") ? callbackUrl.split("?")[1]?.split("#")[0] ?? "" : "";
  const params = new URLSearchParams(fragment || query);
  const expiresIn = params.get("expires_in");

  return {
    accessToken: params.get("access_token") ?? undefined,
    code: params.get("code") ?? undefined,
    expiresIn: expiresIn ? Number(expiresIn) : undefined,
    refreshToken: params.get("refresh_token") ?? undefined
  };
}

async function getUserForAccessToken(accessToken: string) {
  const { publishableKey, url } = getSupabaseConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error("Could not load confirmed user.");
  }

  return (await response.json()) as User;
}

function xhrPostJson(
  url: string,
  init: {
    body: AuthRequestBody;
    headers: Record<string, string>;
  },
  trace: AuthTrace,
  timeoutMs = 8000
) {
  return new Promise<{
    access_token?: string;
    expires_at?: number;
    expires_in?: number;
    refresh_token?: string;
    user?: User;
  }>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open("POST", url);
    trace("Auth request opened");
    request.timeout = timeoutMs;

    Object.entries(init.headers).forEach(([key, value]) => {
      request.setRequestHeader(key, value);
    });

    request.onload = () => {
      trace(`Auth response received (${request.status})`);
      let payload: {
        access_token?: string;
        error_description?: string;
        expires_at?: number;
        expires_in?: number;
        message?: string;
        msg?: string;
        refresh_token?: string;
        user?: User;
      } = {};

      try {
        payload = request.responseText ? JSON.parse(request.responseText) : {};
        trace("Auth response JSON parsed");
      } catch {
        reject(new Error("Supabase auth returned an unreadable response."));
        return;
      }

      if (request.status < 200 || request.status >= 300) {
        reject(new Error(payload.error_description ?? payload.msg ?? payload.message ?? "Supabase auth failed."));
        return;
      }

      resolve(payload);
    };

    request.onerror = () => {
      trace("Auth request network error");
      reject(new Error("Could not reach Supabase auth."));
    };
    request.ontimeout = () => {
      trace("Auth request timed out");
      reject(new Error("Supabase auth timed out."));
    };
    trace("Auth request sending");
    request.send(JSON.stringify(init.body));
  });
}

type AuthRequestBody = {
  data?: Record<string, string>;
  email: string;
  password: string;
};

function mapSignUpMetadata(metadata?: AuthSignUpMetadata) {
  if (!metadata) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries({
      avatar_url: metadata.avatarUrl,
      display_name: metadata.displayName,
      handle: metadata.handle,
      profile_visibility: metadata.profileVisibility
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
  );
}

function createAuthTrace(onDiagnostic?: AuthDiagnosticCallback) {
  const startedAt = Date.now();

  return (label: string) => {
    const event = {
      elapsedMs: Date.now() - startedAt,
      label
    };

    console.log(`[auth] +${event.elapsedMs}ms ${event.label}`);
    onDiagnostic?.(event);
  };
}

function storeAuthSession(payload: {
  access_token?: string;
  expires_at?: number;
  expires_in?: number;
  refresh_token?: string;
  user?: User;
}) {
  if (!payload.access_token || !payload.user) {
    return;
  }

  const expiresAt = payload.expires_at ?? (payload.expires_in ? Math.floor(Date.now() / 1000) + payload.expires_in : undefined);

  memorySession = {
    access_token: payload.access_token,
    expires_at: expiresAt,
    expires_in: payload.expires_in,
    refresh_token: payload.refresh_token,
    token_type: "bearer",
    user: payload.user
  } as Session;

  AsyncStorage.setItem(
    AUTH_SESSION_KEY,
    JSON.stringify({
      accessToken: payload.access_token,
      expiresAt,
      refreshToken: payload.refresh_token,
      user: payload.user
    } satisfies StoredAuthSession)
  ).catch(() => {
    // In-memory auth still works for the current app session.
  });
}

function mapAuthPayloadToSession(payload: {
  access_token?: string;
  expires_at?: number;
  expires_in?: number;
  refresh_token?: string;
  user?: User;
}) {
  const expiresAt = payload.expires_at ?? (payload.expires_in ? Math.floor(Date.now() / 1000) + payload.expires_in : undefined);

  return {
    access_token: payload.access_token,
    expires_at: expiresAt,
    expires_in: payload.expires_in,
    refresh_token: payload.refresh_token,
    token_type: "bearer",
    user: payload.user
  } as Session;
}
