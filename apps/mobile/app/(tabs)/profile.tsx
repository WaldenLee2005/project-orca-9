import { Link, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { type User } from "@supabase/supabase-js";
import { getCurrentAuthSession, signOut } from "../../src/features/social/authRepository";
import {
  getSocialProfileForUserId,
  isValidHandle,
  normalizeHandle,
  upsertSocialProfile
} from "../../src/features/social/socialProfilesRepository";
import { withTimeout } from "../../src/lib/withTimeout";
import { getCurrentUserProfile, upsertUserProfile } from "../../src/storage/profilesRepository";
import { useAppTheme } from "../../src/theme/ThemeProvider";
import { UserProfile } from "../../src/types/fitness";

export default function ProfileScreen() {
  const theme = useAppTheme();
  const searchParams = useLocalSearchParams<{ authChanged?: string }>();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isSignedOut, setIsSignedOut] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

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
      }).catch(() => {
        if (isActive) {
          setStatusText("Could not refresh profile.");
        }
      });

      return () => {
        isActive = false;
      };
    }, [searchParams.authChanged])
  );

  async function handleSignOut() {
    try {
      await signOut();
      setProfile(null);
      setIsSignedOut(true);
      setStatusText(null);
    } catch {
      setStatusText("Could not sign out.");
    }
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
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

        <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>You</Text>
        <Text style={[styles.title, { color: theme.colors.text }]}>Profile</Text>
        <Text style={[styles.description, { color: theme.colors.secondaryText }]}>
          {isSignedOut
            ? "Sign in to manage your profile."
            : profile?.handle
              ? `@${profile.handle} / ${formatProfileValue(profile.profileVisibility)}`
              : "Finish setting up your profile."}
        </Text>
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
            <Text style={[styles.highlightText, { color: theme.colors.secondaryText }]}>{item}</Text>
          </View>
        ))}
      </View>

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
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const styles = StyleSheet.create({
  actions: {
    gap: 10,
    marginTop: 22,
    maxWidth: 380,
    width: "100%"
  },
  avatar: {
    borderRadius: 42,
    borderWidth: StyleSheet.hairlineWidth,
    height: 84,
    width: 84
  },
  avatarFallback: {
    alignItems: "center",
    borderRadius: 42,
    borderWidth: StyleSheet.hairlineWidth,
    height: 84,
    justifyContent: "center",
    width: 84
  },
  avatarInitial: {
    fontSize: 30,
    fontWeight: "900"
  },
  content: {
    alignItems: "center",
    paddingBottom: 118,
    paddingHorizontal: 24,
    paddingTop: 72
  },
  description: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22,
    marginTop: 12,
    maxWidth: 340,
    textAlign: "center"
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0,
    marginTop: 18,
    textAlign: "center",
    textTransform: "uppercase"
  },
  header: {
    alignItems: "center",
    width: "100%"
  },
  highlightRow: {
    alignItems: "center",
    paddingVertical: 14,
    width: "100%"
  },
  highlightText: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
    textAlign: "center",
    textTransform: "uppercase"
  },
  link: {
    fontSize: 14,
    fontWeight: "900",
    minHeight: 52,
    overflow: "hidden",
    paddingHorizontal: 18,
    paddingVertical: 16,
    textAlign: "center",
    textTransform: "uppercase",
    width: "100%"
  },
  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 28,
    maxWidth: 380,
    paddingHorizontal: 20,
    width: "100%"
  },
  screen: {
    flex: 1
  },
  secondaryLink: {
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 14,
    fontWeight: "900",
    minHeight: 52,
    overflow: "hidden",
    paddingHorizontal: 18,
    paddingVertical: 16,
    textAlign: "center",
    textTransform: "uppercase",
    width: "100%"
  },
  signOutButton: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
    width: "100%"
  },
  signOutText: {
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "uppercase"
  },
  statusText: {
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 18,
    textAlign: "center",
    textTransform: "uppercase"
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 0,
    marginTop: 8,
    textAlign: "center",
    textTransform: "uppercase"
  }
});
