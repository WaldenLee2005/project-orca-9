import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  getCurrentAuthSession,
  signInWithEmailPassword,
  signUpWithEmailPassword
} from "../../src/features/social/authRepository";
import { type AuthDiagnosticEvent } from "../../src/features/social/authRepository";
import { uploadAvatarFromUri } from "../../src/features/social/avatarUploadRepository";
import {
  getMySocialProfile,
  isValidHandle,
  normalizeHandle,
  updateSocialProfileSettings,
  upsertSocialProfile
} from "../../src/features/social/socialProfilesRepository";
import {
  getCurrentUserProfile,
  upsertUserProfile
} from "../../src/storage/profilesRepository";
import { useAppTheme } from "../../src/theme/ThemeProvider";
import { withTimeout } from "../../src/lib/withTimeout";
import { ProfileVisibility } from "../../src/types/fitness";

const VISIBILITY_OPTIONS: { label: string; value: ProfileVisibility }[] = [
  { label: "Private", value: "private" },
  { label: "Friends", value: "friends" },
  { label: "Public", value: "public" }
];

type ProfileScreenMode = "settings" | "sign_in" | "sign_up";

type AvatarUploadDraft = {
  base64: string;
  mimeType?: string;
  uri: string;
};

type CreatedProfileBackgroundInput = {
  avatarUpload: AvatarUploadDraft | null;
  avatarUrl?: string;
  displayName: string;
  email: string;
  handle: string;
  profileId?: string;
  profileVisibility: ProfileVisibility;
  userId: string;
};

export default function OnboardingScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ mode?: string }>();
  const theme = useAppTheme();
  const [authMode, setAuthMode] = useState<ProfileScreenMode>("sign_in");
  const [profileId, setProfileId] = useState<string | undefined>();
  const [authUserId, setAuthUserId] = useState<string | undefined>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUpload, setAvatarUpload] = useState<AvatarUploadDraft | null>(null);
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>("private");
  const [canSetHandle, setCanSetHandle] = useState(false);
  const [hasSocialProfile, setHasSocialProfile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [authDiagnostics, setAuthDiagnostics] = useState<AuthDiagnosticEvent[]>([]);
  const authDiagnosticsRef = useRef<AuthDiagnosticEvent[]>([]);

  useEffect(() => {
    if (searchParams.mode === "settings" || searchParams.mode === "sign_in" || searchParams.mode === "sign_up") {
      setAuthMode(searchParams.mode);
    }
  }, [searchParams.mode]);

  useEffect(() => {
    let isMounted = true;

    getCurrentAuthSession()
      .then(async (session) => {
        if (!isMounted) {
          return;
        }

        if (session?.user) {
          setAuthMode("settings");
          setAuthUserId(session.user.id);
          setEmail(session.user.email ?? "");
          const metadata = session.user.user_metadata ?? {};
          const metadataHandle = normalizeHandle(readStringMetadata(metadata, "handle"));
          const metadataName = readStringMetadata(metadata, "display_name");
          const metadataAvatarUrl = readStringMetadata(metadata, "avatar_url");

          if (isValidHandle(metadataHandle)) {
            setHandle(metadataHandle);
          }

          if (metadataName) {
            setDisplayName(metadataName);
          }

          if (metadataAvatarUrl) {
            setAvatarUrl(metadataAvatarUrl);
          }

          setProfileVisibility(readProfileVisibility(metadata));
        }

        if (!session?.user) {
          return;
        }

        const socialProfile = await getMySocialProfile();

        if (!isMounted) {
          return;
        }

        if (!socialProfile) {
          setCanSetHandle(!isValidHandle(normalizeHandle(readStringMetadata(session.user.user_metadata ?? {}, "handle"))));
          setHasSocialProfile(false);
          return;
        }

        setCanSetHandle(false);
        setHasSocialProfile(true);
        setHandle(socialProfile.handle);
        setDisplayName(socialProfile.displayName);
        setAvatarUrl(socialProfile.avatarUrl ?? "");
        setProfileVisibility(socialProfile.profileVisibility);
      })
      .catch(() => {
        if (isMounted) {
          setSaveError("Could not load profile.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [searchParams.mode]);

  async function chooseProfilePicture() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setSaveError("Photo library access is needed to upload a profile picture.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      base64: true,
      mediaTypes: ["images"],
      quality: 0.82
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];

    if (!asset?.base64) {
      setSaveError("Could not read that image.");
      return;
    }

    setAvatarUpload({
      base64: asset.base64,
      mimeType: asset.mimeType,
      uri: asset.uri
    });
    setAvatarUrl(asset.uri);
    setSaveError(null);
  }

  async function saveProfile() {
    if (isSubmitting) {
      return;
    }

    const trimmedName = displayName.trim() || "Lifter";
    const normalizedHandle = normalizeHandle(handle);
    const trimmedEmail = email.trim().toLowerCase();

    if (authMode === "settings") {
      const session = await getCurrentAuthSession();

      if (!session?.user) {
        setSaveError("Sign in required.");
        return;
      }

      if (isSubmitting) {
        return;
      }

      try {
        setIsSubmitting(true);
        setSaveError(null);
        setSaveNotice(null);

        const finalAvatarUrl = avatarUpload
          ? await uploadAvatarFromUri({
              userId: session.user.id,
              ...avatarUpload
            })
          : avatarUrl || undefined;

        if (hasSocialProfile) {
          await withTimeout(
            updateSocialProfileSettings({
              userId: session.user.id,
              displayName: trimmedName,
              avatarUrl: finalAvatarUrl,
              profileVisibility
            }),
            "Profile settings save timed out."
          );
        } else {
          if (!isValidHandle(normalizedHandle)) {
            setSaveError("Use 3-24 letters, numbers, or underscores for your handle.");
            return;
          }

          await withTimeout(
            upsertSocialProfile({
              userId: session.user.id,
              handle: normalizedHandle,
              displayName: trimmedName,
              avatarUrl: finalAvatarUrl,
              profileVisibility
            }),
            "Profile settings save timed out."
          );

          setCanSetHandle(false);
          setHasSocialProfile(true);
        }

        getCurrentUserProfile()
          .then((existingProfile) => {
            return upsertUserProfile(
              {
                authUserId: session.user.id,
                email: session.user.email,
                handle: handle || existingProfile?.handle,
                displayName: trimmedName,
                avatarUrl: finalAvatarUrl,
                profileVisibility,
                goal: existingProfile?.goal ?? "general_fitness",
                experienceLevel: existingProfile?.experienceLevel ?? "beginner",
                availableEquipment: existingProfile?.availableEquipment ?? [],
                preferredSchedule: existingProfile?.preferredSchedule ?? []
              },
              existingProfile?.id
            );
          })
          .catch(() => {
            // Cloud profile is saved; local cache can retry later.
          });

        router.replace({
          pathname: "/profile",
          params: { authChanged: Date.now().toString() }
        });
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Could not save settings.");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!trimmedEmail || !password) {
      setSaveError("Email and password are required.");
      setSaveNotice(null);
      return;
    }

    const authStartedAt = Date.now();
    const recordAuthDiagnostic = (event: AuthDiagnosticEvent) => {
      authDiagnosticsRef.current = [...authDiagnosticsRef.current.slice(-7), event];
      setAuthDiagnostics(authDiagnosticsRef.current);
    };
    const recordLocalDiagnostic = (label: string) => {
      recordAuthDiagnostic({
        elapsedMs: Date.now() - authStartedAt,
        label
      });
    };

    const watchdog = setTimeout(() => {
      const lastStep = authDiagnosticsRef.current.at(-1);
      setIsSubmitting(false);
      setSaveError(
        lastStep
          ? `That request is taking too long. Last auth step: ${lastStep.label} (+${lastStep.elapsedMs}ms).`
          : "That request is taking too long before auth reported a step."
      );
    }, 10000);

    try {
      setIsSubmitting(true);
      setSaveError(null);
      setSaveNotice(null);
      authDiagnosticsRef.current = [];
      setAuthDiagnostics([]);

      if (authMode === "sign_in") {
        const authResult = await withTimeout(
          signInWithEmailPassword(trimmedEmail, password, recordAuthDiagnostic),
          "Sign in timed out. Check your connection and Supabase settings."
        );
        const resolvedAuthUserId = authResult.user?.id ?? authUserId;

        if (!resolvedAuthUserId) {
          setSaveError("Could not finish sign in.");
          return;
        }

        recordLocalDiagnostic("Navigating to profile");
        setSaveError(null);
        router.replace({
          pathname: "/profile",
          params: { authChanged: Date.now().toString() }
        });
        return;
      }

      if (!isValidHandle(normalizedHandle)) {
        setSaveError("Use 3-24 letters, numbers, or underscores for your handle.");
        return;
      }

      const authResult = await withTimeout(
        signUpWithEmailPassword(trimmedEmail, password, recordAuthDiagnostic, {
          avatarUrl: avatarUrl || undefined,
          displayName: trimmedName,
          handle: normalizedHandle,
          profileVisibility
        }),
        "Create account timed out. Check your connection and Supabase settings."
      );

      const resolvedAuthUserId = authResult.user?.id ?? authUserId;

      if (!resolvedAuthUserId) {
        setSaveError("Check your email, then sign in to finish profile setup.");
        return;
      }

      if (!authResult.session) {
        saveCreatedProfileInBackground({
          avatarUpload,
          avatarUrl: avatarUrl || undefined,
          displayName: trimmedName,
          email: trimmedEmail,
          handle: normalizedHandle,
          profileId,
          profileVisibility,
          userId: resolvedAuthUserId
        });
        setSaveError(null);
        setSaveNotice("Check your email to confirm your account, then sign in with your email and password.");
        setAuthMode("sign_in");
        setPassword("");
        return;
      }

      saveCreatedProfileInBackground({
        avatarUpload,
        avatarUrl: avatarUrl || undefined,
        displayName: trimmedName,
        email: trimmedEmail,
        handle: normalizedHandle,
        profileId,
        profileVisibility,
        userId: resolvedAuthUserId
      });
      recordLocalDiagnostic("Navigating to profile");
      setSaveError(null);
      router.replace({
        pathname: "/profile",
        params: { authChanged: Date.now().toString() }
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : authMode === "sign_in" ? "Could not sign in." : "Could not save profile.");
    } finally {
      clearTimeout(watchdog);
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={[styles.screen, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.content}
      >
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
          <Text style={[styles.backText, { color: theme.colors.text }]}>Profile</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>
            {authMode === "settings" ? "Settings" : "Setup"}
          </Text>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {authMode === "settings" ? "Profile Settings" : "Lift Profile"}
          </Text>
          <Text style={[styles.copy, { color: theme.colors.secondaryText }]}>
            {authMode === "settings"
              ? "Update your name, photo, and privacy."
              : "Create your account, choose a handle, and keep sharing private by default."}
          </Text>
        </View>

        <View style={styles.form}>
          {authMode !== "settings" ? (
            <Field label="Account">
              <View style={styles.optionGrid}>
                {[
                  { label: "Create", value: "sign_up" },
                  { label: "Sign In", value: "sign_in" }
                ].map((option) => {
                  const isSelected = authMode === option.value;

                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={option.value}
                      onPress={() => {
                        setAuthMode(option.value as ProfileScreenMode);
                        setSaveError(null);
                        setSaveNotice(null);
                      }}
                      style={[
                        styles.optionButton,
                        {
                          backgroundColor: isSelected ? theme.colors.accent : theme.colors.background,
                          borderColor: theme.colors.border
                        }
                      ]}
                    >
                      <Text style={[styles.optionText, { color: isSelected ? theme.colors.onAccent : theme.colors.text }]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>
          ) : null}

          {authMode !== "settings" ? (
            <>
              <Field label="Email">
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={theme.colors.mutedText}
                  style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
                  value={email}
                />
              </Field>

              <Field label="Password">
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={theme.colors.mutedText}
                  secureTextEntry
                  style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
                  value={password}
                />
              </Field>
            </>
          ) : null}

          {authMode === "sign_up" || authMode === "settings" ? (
            <>
              <Field label="Handle">
                {authMode === "settings" && !canSetHandle ? (
                  <View style={[styles.lockedHandleRow, { borderColor: theme.colors.border }]}>
                    <Text style={[styles.lockedHandleText, { color: theme.colors.secondaryText }]}>
                      {handle ? `@${handle}` : "No handle"}
                    </Text>
                    <Ionicons name="lock-closed-outline" size={18} color={theme.colors.secondaryText} />
                  </View>
                ) : (
                  <View style={[styles.handleInputRow, { borderColor: theme.colors.border }]}>
                    <Text style={[styles.handlePrefix, { color: theme.colors.secondaryText }]}>@</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={(value) => setHandle(normalizeHandle(value))}
                      placeholder="orca_lifter"
                      placeholderTextColor={theme.colors.mutedText}
                      style={[styles.handleInput, { color: theme.colors.text }]}
                      value={handle}
                    />
                  </View>
                )}
              </Field>

              <Field label="Name">
                <TextInput
                  autoCapitalize="words"
                  onChangeText={setDisplayName}
                  placeholder="Lifter"
                  placeholderTextColor={theme.colors.mutedText}
                  style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
                  value={displayName}
                />
              </Field>

              <Field label="Profile Picture">
                <Pressable
                  accessibilityRole="button"
                  onPress={chooseProfilePicture}
                  style={({ pressed }) => [
                    styles.uploadButton,
                    {
                      borderColor: theme.colors.border,
                      opacity: pressed ? 0.72 : 1
                    }
                  ]}
                >
                  {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarPreview} /> : null}
                  <View style={styles.uploadTextGroup}>
                    <Text style={[styles.uploadTitle, { color: theme.colors.text }]}>Upload Photo</Text>
                    <Text style={[styles.uploadCopy, { color: theme.colors.secondaryText }]}>
                      Choose a square profile picture.
                    </Text>
                  </View>
                  <Ionicons name="image-outline" size={22} color={theme.colors.text} />
                </Pressable>
              </Field>

              <OptionGroup label="Privacy" options={VISIBILITY_OPTIONS} value={profileVisibility} onChange={setProfileVisibility} />
            </>
          ) : null}
        </View>

        {saveError || saveNotice ? (
          <Text style={[styles.feedbackText, { color: saveError ? theme.colors.accent : theme.colors.secondaryText }]}>
            {saveError ?? saveNotice}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={saveProfile}
          style={({ pressed }) => [
            styles.saveButton,
            {
              backgroundColor: theme.colors.accent,
              opacity: pressed || isSubmitting ? 0.82 : 1
            }
          ]}
        >
          <Text style={[styles.saveButtonText, { color: theme.colors.onAccent }]}>
            {isSubmitting ? "Working..." : authMode === "settings" ? "Save Settings" : authMode === "sign_up" ? "Create Account" : "Sign In"}
          </Text>
        </Pressable>
        {authDiagnostics.length > 0 ? (
          <View style={[styles.debugPanel, { borderColor: theme.colors.border }]}>
            <Text style={[styles.debugTitle, { color: theme.colors.secondaryText }]}>Auth Trace</Text>
            {authDiagnostics.map((event, index) => (
              <Text key={`${event.label}-${event.elapsedMs}-${index}`} style={[styles.debugLine, { color: theme.colors.secondaryText }]}>
                +{event.elapsedMs}ms {event.label}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}

function saveCreatedProfileInBackground(input: CreatedProfileBackgroundInput) {
  saveCreatedProfile(input).catch((error) => {
    console.warn("Could not finish background profile save.", error);
  });
}

async function saveCreatedProfile(input: CreatedProfileBackgroundInput) {
  const finalAvatarUrl = input.avatarUpload
    ? await withTimeout(
        uploadAvatarFromUri({
          userId: input.userId,
          ...input.avatarUpload
        }),
        "Avatar upload timed out.",
        8000
      )
    : input.avatarUrl;

  await withTimeout(
    upsertSocialProfile({
      userId: input.userId,
      handle: input.handle,
      displayName: input.displayName,
      avatarUrl: finalAvatarUrl,
      profileVisibility: input.profileVisibility
    }),
    "Social profile save timed out.",
    8000
  );

  await withTimeout(
    upsertUserProfile(
      {
        authUserId: input.userId,
        email: input.email,
        handle: input.handle,
        displayName: input.displayName,
        avatarUrl: finalAvatarUrl,
        profileVisibility: input.profileVisibility,
        goal: "general_fitness",
        experienceLevel: "beginner",
        availableEquipment: [],
        preferredSchedule: []
      },
      input.profileId
    ),
    "Local profile save timed out.",
    800
  ).catch(() => {
    // Cloud profile is the source for social identity; local cache can retry later.
  });
}

type FieldProps = {
  children: React.ReactNode;
  label: string;
};

function Field({ children, label }: FieldProps) {
  const theme = useAppTheme();

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.secondaryText }]}>{label}</Text>
      {children}
    </View>
  );
}

type OptionGroupProps<T extends string> = {
  label: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
};

function OptionGroup<T extends string>({ label, options, value, onChange }: OptionGroupProps<T>) {
  const theme = useAppTheme();

  return (
    <Field label={label}>
      <View style={styles.optionGrid}>
        {options.map((option) => {
          const isSelected = option.value === value;

          return (
            <Pressable
              accessibilityRole="button"
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[
                styles.optionButton,
                {
                  backgroundColor: isSelected ? theme.colors.accent : theme.colors.background,
                  borderColor: theme.colors.border
                }
              ]}
            >
              <Text style={[styles.optionText, { color: isSelected ? theme.colors.onAccent : theme.colors.text }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Field>
  );
}

function readStringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function readProfileVisibility(metadata: Record<string, unknown>) {
  const value = readStringMetadata(metadata, "profile_visibility");
  return value === "friends" || value === "public" ? value : "private";
}

const styles = StyleSheet.create({
  avatarPreview: {
    borderRadius: 24,
    height: 48,
    width: 48
  },
  backButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 4,
    minHeight: 44,
    paddingRight: 12
  },
  backText: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  content: {
    paddingBottom: 48,
    paddingHorizontal: 20,
    paddingTop: 32
  },
  copy: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22
  },
  debugLine: {
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16
  },
  debugPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
    marginTop: 16,
    padding: 12
  },
  debugTitle: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  errorText: {
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 4,
    textTransform: "uppercase"
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  field: {
    gap: 10
  },
  form: {
    gap: 20,
    marginTop: 28
  },
  handleInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: "800",
    minHeight: 54,
    paddingRight: 14,
    paddingVertical: 12
  },
  handleInputRow: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 54
  },
  handlePrefix: {
    fontSize: 17,
    fontWeight: "900",
    paddingLeft: 14,
    paddingRight: 2
  },
  header: {
    gap: 10,
    marginTop: 10
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 20,
    textTransform: "uppercase"
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 17,
    fontWeight: "800",
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  lockedHandleRow: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 54,
    paddingHorizontal: 14
  },
  lockedHandleText: {
    fontSize: 17,
    fontWeight: "800"
  },
  optionButton: {
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  optionText: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  saveButton: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
    minHeight: 56,
    paddingHorizontal: 22,
    paddingVertical: 14
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  screen: {
    flex: 1
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 39,
    textTransform: "uppercase"
  },
  uploadButton: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 72,
    padding: 12
  },
  uploadCopy: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    marginTop: 4
  },
  uploadTextGroup: {
    flex: 1
  },
  uploadTitle: {
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase"
  }
});
