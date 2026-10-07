import { createThemedStyles } from "../../src/theme/designSystem";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeading } from "../../src/components/ScreenHeading";
import { Link, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { type User } from "@supabase/supabase-js";
import { getCurrentAuthSession, signOut, subscribeToAuthChanges } from "../../src/features/social/authRepository";
import { isSupabaseConfigured } from "../../src/lib/supabase";
import {
  getSocialProfileForUserId,
  isValidHandle,
  normalizeHandle,
  upsertSocialProfile
} from "../../src/features/social/socialProfilesRepository";
import { withTimeout } from "../../src/lib/withTimeout";
import { clearCurrentUserProfileCache, getCurrentUserProfile, upsertUserProfile } from "../../src/storage/profilesRepository";
import { useAppTheme, useThemeStyles } from "../../src/theme/ThemeProvider";
import { UserProfile } from "../../src/types/fitness";
import { ReminderSettings } from "../../src/features/reminders/ReminderSettings";

export default function ProfileScreen() {
  const { styles, colors, ui } = useThemeStyles(themedStyles);
  const theme = useAppTheme();
  const searchParams = useLocalSearchParams<{ authChanged?: string }>();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isSignedOut, setIsSignedOut] = useState(true);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [authRevision, setAuthRevision] = useState(0);

  useEffect(() => subscribeToAuthChanges(() => setAuthRevision((value) => value + 1)), []);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      refreshProfile((result) => {
        if (!isActive) {
          return;
        }

        setIsSignedOut(result.isSignedOut);
        setProfile(result.profile);
        setStatusText(null);
      }).catch((error) => {
        if (isActive) {
          setStatusText(error instanceof Error ? error.message : "Could not reconnect your account. Your workouts are still available.");
        }
      });

      return () => {
        isActive = false;
      };
    }, [searchParams.authChanged, authRevision])
  );

  async function handleSignOut() {
    try {
      await signOut();
      clearCurrentUserProfileCache();
      setProfile(null);
      setIsSignedOut(true);
      setStatusText(null);
    } catch {
      setStatusText("Could not sign out.");
    }
  }

  if (isSignedOut) {
    return (
      <ScrollView style={[styles.screen, { backgroundColor: theme.colors.background }]} contentContainerStyle={styles.content}>
        <ScreenHeading eyebrow="Orca · On this device" title="Profile" />
        <View style={styles.header}>
          <View style={styles.guestIcon}><Ionicons name="person-outline" size={26} color={theme.colors.accent} /></View>
          <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Your training</Text>
          <Text style={[styles.description, { color: theme.colors.secondaryText }]}>
            Saved on this device. No account required.
          </Text>
          </View>
        </View>
        <Text style={styles.sectionLabel}>TRAINING & STORAGE</Text>
        <View style={styles.settingsGroup}>
          <InfoRow label="Workout history" value="On this device" first />
          <InfoRow label="Coach suggestions" value="Review before applying" />
          <InfoRow label="Scheduled rest" value="Protects your streak" />
          <InfoRow label="Cloud sync" value="Not enabled" />
        </View>
        <Text style={styles.footnote}>Workouts, programs, and progress stay local—even when you sign in.</Text>
        <ReminderSettings />
        {statusText ? <Text accessibilityRole="alert" style={[styles.statusText, { color: theme.colors.secondaryText }]}>{statusText}</Text> : null}
        <Text style={styles.sectionLabel}>OPTIONAL ACCOUNT</Text>
        <View style={styles.actions}>
          {isSupabaseConfigured() ? (
            <>
              <Link href={{ pathname: "/onboarding", params: { mode: "sign_in" } }} asChild>
                  <Text style={StyleSheet.flatten([styles.secondaryLink, { borderColor: theme.colors.border, color: theme.colors.accent }])}>
                  Sign in (optional)
                </Text>
              </Link>
              <Link href={{ pathname: "/onboarding", params: { mode: "sign_up" } }} asChild>
                  <Text style={StyleSheet.flatten([styles.secondaryLink, { borderColor: theme.colors.border, color: theme.colors.accent }])}>
                  Create account
                </Text>
              </Link>
            </>
          ) : (
            <Text style={[styles.description, { color: theme.colors.secondaryText }]}>Accounts are unavailable in this build. You can keep training here.</Text>
          )}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      <ScreenHeading eyebrow="Orca · Your account" title="Profile" />
      <View style={styles.header}>
        {profile?.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={[styles.avatar, { borderColor: theme.colors.border }]} />
        ) : (
          <View style={[styles.avatarFallback, { borderColor: theme.colors.border }]}>
            <Text style={[styles.avatarInitial, { color: theme.colors.text }]}>
              {(profile?.displayName ?? "O").charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        <View style={{ flex: 1 }}><Text style={[styles.title, { color: theme.colors.text }]}>{profile?.displayName ?? "Your profile"}</Text>
        <Text style={[styles.description, { color: theme.colors.secondaryText }]}>
          {isSignedOut
            ? "Sign in to manage your profile."
            : profile?.handle
              ? `@${profile.handle} / ${formatProfileValue(profile.profileVisibility)}`
              : "Finish setting up your profile."}
        </Text></View>
      </View>

      <View style={[styles.panel, { borderColor: theme.colors.border }]}>
        {[
          profile?.displayName ?? "Not set",
          profile?.handle ? `@${profile.handle}` : "No handle",
          profile ? formatProfileValue(profile.profileVisibility) : isSignedOut ? "Signed out" : "Profile needed"
        ].map((item, index) => (
          <View
            key={`${item}-${index}`}
            style={[
              styles.highlightRow,
              {
                borderTopColor: theme.colors.border,
                borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth
              }
            ]}
          >
            <Text style={styles.rowLabel}>{["Name", "Handle", "Visibility"][index]}</Text>
            <Text style={[styles.highlightText, { color: theme.colors.secondaryText }]}>{item}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>TRAINING & STORAGE</Text>
      <View style={styles.settingsGroup}>
        <InfoRow label="Workout history" value="On this device" first />
        <InfoRow label="Coach suggestions" value="Review before applying" />
        <InfoRow label="Cloud sync" value="Not enabled" />
      </View>
      <Text style={styles.footnote}>Your workout history and programs stay on this device. Manage following, posts and optional PR sharing in Feed.</Text>
      <ReminderSettings />

      {statusText ? <Text style={[styles.statusText, { color: theme.colors.secondaryText }]}>{statusText}</Text> : null}

      {isSignedOut ? (
        <View style={styles.actions}>
          <Link href={{ pathname: "/onboarding", params: { mode: "sign_in" } }} asChild>
            <Text style={StyleSheet.flatten([styles.link, { backgroundColor: theme.colors.accent, color: theme.colors.onAccent }])}>
              Sign In
            </Text>
          </Link>
          <Link href={{ pathname: "/onboarding", params: { mode: "sign_up" } }} asChild>
            <Text style={StyleSheet.flatten([styles.secondaryLink, { borderColor: theme.colors.border, color: theme.colors.secondaryText }])}>
              Create Account
            </Text>
          </Link>
        </View>
      ) : (
        <View style={styles.actions}>
          <Link href={{ pathname: "/onboarding", params: { mode: "settings" } }} asChild>
            <Text style={StyleSheet.flatten([styles.link, { backgroundColor: theme.colors.accent, color: theme.colors.onAccent }])}>
              Settings
            </Text>
          </Link>
          <Pressable
            accessibilityRole="button"
            onPress={handleSignOut}
            style={({ pressed }) => [
              styles.signOutButton,
              {
                borderColor: theme.colors.border,
                opacity: pressed ? 0.72 : 1
              }
            ]}
          >
            <Text style={[styles.signOutText, { color: theme.colors.secondaryText }]}>Sign Out</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function InfoRow({ label, value, first = false }: { label: string; value: string; first?: boolean }) {
  const { styles } = useThemeStyles(themedStyles);
  return <View style={[styles.settingsRow, first && { borderTopWidth: 0 }]}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>;
}

async function refreshProfile(
  onProfileState: (result: { isSignedOut: boolean; profile: UserProfile | null }) => void
) {
  const session = await getCurrentAuthSession();

  if (!session?.user) {
    onProfileState({ isSignedOut: true, profile: null });
    return;
  }

  const fallbackProfile = createSessionProfile(session.user);
  onProfileState({ isSignedOut: false, profile: fallbackProfile });
  loadLocalProfileFallback(session.user.id, session.user.email).then((localProfile) => {
    if (localProfile) {
      onProfileState({ isSignedOut: false, profile: { ...fallbackProfile, ...localProfile } });
    }
  });

  const socialProfile = await withTimeout(
    getSocialProfileForUserId(session.user.id),
    "Profile lookup timed out.",
    8000
  ).catch(() => null);

  if (!socialProfile) {
    repairSocialProfileFromMetadata(fallbackProfile);
    return;
  }

  const profile: UserProfile = {
    ...fallbackProfile,
    avatarUrl: socialProfile.avatarUrl,
    displayName: socialProfile.displayName,
    handle: socialProfile.handle,
    profileVisibility: socialProfile.profileVisibility
  };
  onProfileState({ isSignedOut: false, profile });
  persistProfileInBackground(profile);
}

async function loadLocalProfileFallback(userId: string, email?: string) {
  const localProfile = await withTimeout(getCurrentUserProfile(), "Local profile lookup timed out.", 700).catch(() => null);

  if (!isLocalProfileForSession(localProfile, userId, email)) {
    return null;
  }

  return localProfile;
}

function isLocalProfileForSession(profile: UserProfile | null, userId: string, email?: string) {
  if (!profile) {
    return false;
  }

  return profile.authUserId === userId || (!profile.authUserId && profile.email === email);
}

function createSessionProfile(user: User): UserProfile {
  const metadata = user.user_metadata ?? {};
  const metadataHandle = normalizeHandle(readStringMetadata(metadata, "handle"));
  const metadataVisibility = readProfileVisibility(metadata);

  return {
    id: user.id,
    authUserId: user.id,
    email: user.email,
    displayName: readStringMetadata(metadata, "display_name") || user.email?.split("@")[0] || "Lifter",
    handle: isValidHandle(metadataHandle) ? metadataHandle : undefined,
    avatarUrl: readStringMetadata(metadata, "avatar_url") || undefined,
    profileVisibility: metadataVisibility,
    goal: "general_fitness",
    experienceLevel: "beginner",
    availableEquipment: [],
    preferredSchedule: []
  };
}

async function repairSocialProfileFromMetadata(profile: UserProfile) {
  if (!profile.authUserId || !profile.handle || !isValidHandle(profile.handle)) {
    return;
  }

  await upsertSocialProfile({
    userId: profile.authUserId,
    handle: profile.handle,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    profileVisibility: profile.profileVisibility
  }).catch(() => {
    // The profile still renders from auth metadata; repair can retry later.
  });
}

function readStringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function readProfileVisibility(metadata: Record<string, unknown>) {
  const value = readStringMetadata(metadata, "profile_visibility");
  return value === "friends" || value === "public" ? value : "private";
}

function persistProfileInBackground(profile: UserProfile) {
  getCurrentUserProfile()
    .then((storedProfile) => {
      return upsertUserProfile(
        {
          authUserId: profile.authUserId,
          email: profile.email,
          handle: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          profileVisibility: profile.profileVisibility,
          goal: storedProfile?.goal ?? profile.goal,
          experienceLevel: storedProfile?.experienceLevel ?? profile.experienceLevel,
          availableEquipment: storedProfile?.availableEquipment ?? profile.availableEquipment,
          preferredSchedule: storedProfile?.preferredSchedule ?? profile.preferredSchedule
        },
        storedProfile?.id
      );
    })
    .catch(() => {
      // Profile is already rendered from auth/social data; local persistence can retry later.
    });
}

function formatProfileValue(value: string) {
  if (value === "friends") return "Followers";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const themedStyles = createThemedStyles((colors, ui) => ({
  sectionLabel: { color: colors.mutedText, fontSize: 12, fontWeight: "500", letterSpacing: 0.7, marginTop: 28, marginBottom: 10, paddingHorizontal: 4 },
  settingsGroup: { ...ui.group, paddingHorizontal: 16 },
  settingsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, paddingVertical: 17, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: { color: colors.text, fontSize: 15, flexShrink: 1 },
  rowValue: { color: colors.mutedText, fontSize: 13, textAlign: "right", flexShrink: 1, maxWidth: "53%" },
  footnote: { color: colors.mutedText, fontSize: 12, lineHeight: 19, marginTop: 10, paddingHorizontal: 4 },
  guestIcon: { backgroundColor: colors.accentSoft, width: 56, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actions: {
    ...ui.group,
    overflow: "hidden",
    marginTop: 8,
    maxWidth: 720,
    width: "100%"
  },
  avatar: {
    borderRadius: 42,
    borderWidth: 3,
    height: 84,
    width: 84,
    borderColor: colors.surface,
  },
  avatarFallback: {
    ...ui.input,
    alignItems: "center",
    borderRadius: 42,
    borderWidth: 0,
    height: 84,
    justifyContent: "center",
    width: 84
  },
  avatarInitial: {
    fontSize: 30,
    fontWeight: "700"
  },
  content: {
    ...ui.content,
    alignItems: "stretch",
  },
  description: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 23,
    marginTop: 5,
    maxWidth: 340,
    textAlign: "left"
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.3,
    marginTop: 18,
    textAlign: "center",
    textTransform: "uppercase",
  },
  header: {
    ...ui.group,
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    width: "100%",
    padding: 18,
  },
  highlightRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 17,
    width: "100%"
  },
  highlightText: {
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 20,
    textAlign: "right",
    flexShrink: 1,
    textTransform: "none"
  },
  link: {
    ...ui.primary,
    fontSize: 15,
    fontWeight: "600",
    minHeight: 52,
    overflow: "visible",
    paddingHorizontal: 18,
    paddingVertical: 16,
    textAlign: "center",
    textTransform: "none",
    width: "100%"
  },
  panel: {
    ...ui.group,
    borderWidth: 0,
    marginTop: 28,
    maxWidth: 720,
    paddingHorizontal: 20,
    width: "100%"
  },
  screen: {
    flex: 1
  },
  secondaryLink: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    fontSize: 15,
    fontWeight: "500",
    minHeight: 52,
    overflow: "visible",
    paddingHorizontal: 18,
    paddingVertical: 16,
    textAlign: "left",
    textTransform: "none",
    width: "100%"
  },
  signOutButton: {
    ...ui.control,
    alignItems: "center",
    borderWidth: 0,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
    width: "100%",
    borderRadius: 18,
  },
  signOutText: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    textTransform: "none"
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 18,
    textAlign: "center",
    textTransform: "none"
  },
  title: {
    fontSize: 21,
    fontWeight: "600",
    letterSpacing: -0.7,
    marginTop: 0,
    textAlign: "left",
    textTransform: "none"
  }
}));
