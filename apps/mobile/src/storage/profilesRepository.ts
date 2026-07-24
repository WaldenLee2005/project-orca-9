import { ExperienceLevel, FitnessGoal, ProfileVisibility, UserProfile } from "../types/fitness";
import { createLocalId, getDatabase } from "./database";

type UserProfileRow = {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  handle: string | null;
  display_name: string;
  avatar_url: string | null;
  profile_visibility: ProfileVisibility | null;
  goal: FitnessGoal;
  experience_level: ExperienceLevel;
  available_equipment: string;
  preferred_schedule: string;
};

export type UserProfileInput = {
  authUserId?: string;
  email?: string;
  handle?: string;
  displayName: string;
  avatarUrl?: string;
  profileVisibility: ProfileVisibility;
  goal: FitnessGoal;
  experienceLevel: ExperienceLevel;
  availableEquipment: string[];
  preferredSchedule: string[];
};

export async function getCurrentUserProfile() {
  const database = await getDatabase();
  const row = await database.getFirstAsync<UserProfileRow>(
    `SELECT
       id,
       auth_user_id,
       email,
       handle,
       display_name,
       avatar_url,
       profile_visibility,
       goal,
       experience_level,
       available_equipment,
       preferred_schedule
     FROM user_profiles
     ORDER BY updated_at DESC
     LIMIT 1;`
  );

  return row ? mapUserProfileRow(row) : null;
}

export async function upsertUserProfile(input: UserProfileInput, existingId?: string) {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const id = existingId ?? createLocalId("profile");

  await database.runAsync(
    `INSERT INTO user_profiles (
       id,
       auth_user_id,
       email,
       handle,
       display_name,
       avatar_url,
       profile_visibility,
       goal,
       experience_level,
       available_equipment,
       preferred_schedule,
       created_at,
       updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       auth_user_id = excluded.auth_user_id,
       email = excluded.email,
       handle = excluded.handle,
       display_name = excluded.display_name,
       avatar_url = excluded.avatar_url,
       profile_visibility = excluded.profile_visibility,
       goal = excluded.goal,
       experience_level = excluded.experience_level,
       available_equipment = excluded.available_equipment,
       preferred_schedule = excluded.preferred_schedule,
       updated_at = excluded.updated_at;`,
    [
      id,
      input.authUserId ?? null,
      input.email ?? null,
      input.handle ?? null,
      input.displayName,
      input.avatarUrl ?? null,
      input.profileVisibility,
      input.goal,
      input.experienceLevel,
      JSON.stringify(input.availableEquipment),
      JSON.stringify(input.preferredSchedule),
      now,
      now
    ]
  );

  return { id, ...input };
}

function mapUserProfileRow(row: UserProfileRow): UserProfile {
  return {
    id: row.id,
    authUserId: row.auth_user_id ?? undefined,
    email: row.email ?? undefined,
    handle: row.handle ?? undefined,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ?? undefined,
    profileVisibility: row.profile_visibility ?? "private",
    goal: row.goal,
    experienceLevel: row.experience_level,
    availableEquipment: parseStringArray(row.available_equipment),
    preferredSchedule: parseStringArray(row.preferred_schedule)
  };
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
