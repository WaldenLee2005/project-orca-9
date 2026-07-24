import { getSupabaseConfig } from "../../lib/supabase";
import { getCurrentAccessToken, getCurrentAuthSession } from "./authRepository";
import { ProfileVisibility } from "../../types/fitness";

export type SocialProfileInput = {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  profileVisibility: ProfileVisibility;
};

export type SocialProfileSettingsInput = {
  avatarUrl?: string;
  displayName: string;
  profileVisibility: ProfileVisibility;
  userId: string;
};

export type SocialProfile = SocialProfileInput & {
  updatedAt: string;
};

type SocialProfileRow = {
  avatar_url: string | null;
  display_name: string;
  handle: string;
  profile_visibility: ProfileVisibility;
  updated_at: string;
  user_id: string;
};

export function normalizeHandle(value: string) {
  return value
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
}

export function isValidHandle(handle: string) {
  return /^[a-z0-9_]{3,24}$/.test(handle);
}

export async function upsertSocialProfile(input: SocialProfileInput) {
  const normalizedHandle = normalizeHandle(input.handle);

  if (!isValidHandle(normalizedHandle)) {
    throw new Error("Use 3-24 letters, numbers, or underscores for your handle.");
  }

  const response = await authedRestFetch("social_profiles?on_conflict=user_id", {
    body: JSON.stringify({
      avatar_url: input.avatarUrl || null,
      display_name: input.displayName,
      handle: normalizedHandle,
      profile_visibility: input.profileVisibility,
      updated_at: new Date().toISOString(),
      user_id: input.userId
    }),
    headers: {
      Prefer: "resolution=merge-duplicates"
    },
    method: "POST"
  });

  if (!response.ok) {
    const error = await response.json();

    if (error.code === "23505") {
      throw new Error("That handle is already taken.");
    }

    throw new Error(error.message ?? "Could not save social profile.");
  }
}

export async function updateSocialProfileSettings(input: SocialProfileSettingsInput) {
  const response = await authedRestFetch(`social_profiles?user_id=eq.${encodeURIComponent(input.userId)}`, {
    body: JSON.stringify({
      avatar_url: input.avatarUrl || null,
      display_name: input.displayName,
      profile_visibility: input.profileVisibility,
      updated_at: new Date().toISOString()
    }),
    method: "PATCH"
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message ?? "Could not save profile settings.");
  }
}

export async function getMySocialProfile() {
  const session = await getCurrentAuthSession();

  if (!session?.user) {
    return null;
  }

  return getSocialProfileForUserId(session.user.id);
}

export async function getSocialProfileForUserId(userId: string) {
  const response = await authedRestFetch(
    `social_profiles?user_id=eq.${encodeURIComponent(userId)}&select=user_id,handle,display_name,avatar_url,profile_visibility,updated_at`,
    {
      method: "GET"
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message ?? "Could not load social profile.");
  }

  const rows = (await response.json()) as SocialProfileRow[];
  const row = rows[0];

  return row ? mapSocialProfileRow(row) : null;
}

async function authedRestFetch(path: string, init: RequestInit) {
  const { publishableKey, url } = getSupabaseConfig();
  const accessToken = await getCurrentAccessToken();

  if (!accessToken) {
    throw new Error("Sign in required.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    return await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {})
      },
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Supabase profile request timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function mapSocialProfileRow(row: SocialProfileRow): SocialProfile {
  return {
    avatarUrl: row.avatar_url ?? undefined,
    displayName: row.display_name,
    handle: row.handle,
    profileVisibility: row.profile_visibility,
    updatedAt: row.updated_at,
    userId: row.user_id
  };
}
