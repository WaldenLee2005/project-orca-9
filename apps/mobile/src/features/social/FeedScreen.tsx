import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Link, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { ScreenHeading } from "../../components/ScreenHeading";
import { getOptionalSupabaseClient, isSupabaseConfigured } from "../../lib/supabase";
import { createThemedStyles } from "../../theme/designSystem";
import { useThemeStyles } from "../../theme/ThemeProvider";
import type { ProfileVisibility } from "../../types/fitness";
import { getCurrentAuthSession } from "./authRepository";
import {
  createFeedPost, deleteFeedPost, followUser, loadConnections, loadFeed, removeFollower,
  respondToFollowRequest, searchPeople, unfollowUser, type FeedPost, type SocialPerson
} from "./feedRepository";
import { getMySocialProfile, type SocialProfile } from "./socialProfilesRepository";
import { getPRSharingPreferences, retryPersonalRecordPublishing, setPRSharingPreferences, subscribeToPRSharingChanges, suppressPersonalRecordPost } from "./prPublishing";

const audienceOptions: { value: ProfileVisibility; label: string }[] = [
  { value: "friends", label: "Followers" }, { value: "public", label: "Public" }, { value: "private", label: "Only me" }
];
type Photo = { uri: string; base64: string; mimeType: string };
type Cursor = { occurredAt: string; id: string };
const message = (error: unknown) => error instanceof Error ? error.message : "Could not connect. Please try again.";
const newEventId = () => `post:${Date.now()}:${Math.random().toString(36).slice(2)}`;

export default function FeedScreen() {
  const { styles } = useThemeStyles(themedStyles);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const authVersion = useRef(0);
  useEffect(() => {
    const client = getOptionalSupabaseClient();
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      authVersion.current++;
      setUserId(session?.user.id ?? null); setLoading(false); setError(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useFocusEffect(useCallback(() => {
    let active = true;
    const version = authVersion.current;
    void getCurrentAuthSession().then((session) => {
      if (active && version === authVersion.current) { setUserId(session?.user.id ?? null); setLoading(false); setError(null); }
    }).catch((failure) => { if (active && version === authVersion.current) { setLoading(false); setError(message(failure)); } });
    return () => { active = false; };
  }, []));
  if (loading) return <View style={styles.center}><ActivityIndicator accessibilityLabel="Connecting your feed" /></View>;
  if (userId) return <AccountFeed key={userId} userId={userId} />;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <ScreenHeading eyebrow="Orca · Community" title="Feed" subtitle="Share your progress. Keep up with the people you train with." />
    <View style={styles.card}>
      <Ionicons name="people-outline" size={32} style={styles.blueIcon} />
      <Text style={styles.cardTitle}>Your lifting circle</Text>
      <Text style={styles.body}>Follow lifters, share a thought or photo, and celebrate new personal records.</Text>
      <Text style={styles.hint}>Your workouts and private notes stay on this device. Automatic PR sharing starts only when you turn it on.</Text>
      {isSupabaseConfigured() ? <>
        <Link href={{ pathname: "/onboarding", params: { mode: "sign_in" } }} asChild><Pressable style={styles.primary}><Text style={styles.primaryText}>Sign in</Text></Pressable></Link>
        <Link href={{ pathname: "/onboarding", params: { mode: "sign_up" } }} asChild><Pressable style={styles.button}><Text style={styles.buttonText}>Create account</Text></Pressable></Link>
      </> : <Text style={styles.hint}>The feed is unavailable in this build. Your local training is ready to use.</Text>}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  </ScrollView>;
}

function AccountFeed({ userId }: { userId: string }) {
  const { styles, colors } = useThemeStyles(themedStyles);
  const [mode, setMode] = useState<"following" | "mine">("following");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cleanupPostId, setCleanupPostId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [eventId, setEventId] = useState(newEventId);
  const [visibility, setVisibility] = useState<ProfileVisibility>("friends");
  const [sharing, setSharing] = useState({ enabled: false, visibility: "friends" as ProfileVisibility, pendingCount: 0, lastError: null as string | null });
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SocialPerson[]>([]);
  const [connections, setConnections] = useState<{ following: SocialPerson[]; followers: SocialPerson[]; requests: SocialPerson[] }>({ following: [], followers: [], requests: [] });
  const alive = useRef(true);
  const generation = useRef(0);
  const actionRunning = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);
  useEffect(() => subscribeToPRSharingChanges(() => {
    void getPRSharingPreferences(userId).then((value) => { if (alive.current) setSharing(value); }).catch(() => {});
  }), [userId]);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setRefreshing(true);
    const responses = await Promise.allSettled([loadFeed({ mode }), getMySocialProfile(), getPRSharingPreferences(userId), loadConnections()]);
    if (!alive.current || request !== generation.current) return;
    const [feed, account, prefs, people] = responses;
    if (feed.status === "fulfilled") { setPosts(feed.value.posts); setCursor(feed.value.nextCursor ?? null); }
    else { setPosts([]); setCursor(null); }
    const failed = responses.find((response) => response.status === "rejected");
    setError(failed?.status === "rejected" ? message(failed.reason) : null);
    if (account.status === "fulfilled") setProfile(account.value);
    if (prefs.status === "fulfilled") setSharing(prefs.value);
    if (people.status === "fulfilled") setConnections(people.value);
    setRefreshing(false);
  }, [mode, userId]);
  useFocusEffect(useCallback(() => { void refresh(); return () => { generation.current++; }; }, [refresh]));

  async function act(key: string, work: () => Promise<void>) {
    if (actionRunning.current) return;
    actionRunning.current = true; setBusy(key); setError(null); setNotice(null);
    try { await work(); }
    catch (failure) { if (alive.current) setError(message(failure)); }
    finally { actionRunning.current = false; if (alive.current) setBusy(null); }
  }

  async function choosePhoto() {
    await act("photo", async () => {
      if (Platform.OS !== "web") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) throw new Error("Allow photo library access to attach an image.");
      }
      const selection = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.85 });
      if (selection.canceled || !alive.current) return;
      const asset = selection.assets[0];
      if (!asset?.base64) throw new Error("Could not read that image. Choose a JPEG, PNG or WebP photo.");
      const mimeType = asset.mimeType ?? "image/jpeg";
      if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) throw new Error("Choose a JPEG, PNG or WebP photo.");
      if ((asset.fileSize ?? asset.base64.length * 0.75) > 5 * 1024 * 1024) throw new Error("Choose a photo smaller than 5 MB.");
      setEventId(newEventId()); setPhoto({ uri: asset.uri, base64: asset.base64, mimeType });
    });
  }

  async function post() {
    await act("post", async () => {
      await createFeedPost({ userId, eventId, text, visibility, image: photo ?? undefined });
      if (!alive.current) return;
      setText(""); setPhoto(null); setEventId(newEventId()); setNotice("Posted to your feed.");
      await refresh();
    });
  }

  function confirmDelete(item: FeedPost) {
    const remove = () => { void act(`delete:${item.id}`, async () => {
      if (item.clientEventId && item.eventType === "personal_record") await suppressPersonalRecordPost(userId, item.clientEventId);
      const result = await deleteFeedPost(item.id, userId);
      if (alive.current) { setPosts((current) => current.filter((entry) => entry.id !== item.id)); setCleanupPostId(result.imageCleanupPending ? item.id : null); setNotice(result.imageCleanupPending ? "Post deleted. Its photo is hidden; photo cleanup needs a retry." : "Post deleted."); }
    }); };
    if (Platform.OS === "web") { if (globalThis.confirm("Delete this post from your feed?")) remove(); }
    else Alert.alert("Delete post?", "This removes the shared post. Your workout history stays saved.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: remove }]);
  }

  async function changeSharing(enabled: boolean, audience = sharing.visibility) {
    await act("sharing", async () => {
      await setPRSharingPreferences(userId, { enabled, visibility: audience });
      const updated = await getPRSharingPreferences(userId);
      if (alive.current) setSharing(updated);
    });
  }

  async function connectionAction(key: string, work: () => Promise<unknown>) {
    await act(key, async () => {
      await work();
      const updated = await loadConnections();
      const found = query.trim() ? await searchPeople(query.trim()) : [];
      if (alive.current) { setConnections(updated); setResults(found); }
      await refresh();
    });
  }

  async function loadMore() {
    if (!cursor || refreshing || loadingMore) return;
    const request = generation.current;
    setLoadingMore(true);
    try {
      const page = await loadFeed({ mode, before: cursor });
      if (alive.current && request === generation.current) {
        setPosts((current) => { const ids = new Set(current.map((entry) => entry.id)); return [...current, ...page.posts.filter((entry) => !ids.has(entry.id))]; });
        setCursor(page.nextCursor ?? null);
      }
    } catch (failure) { if (alive.current && request === generation.current) setError(message(failure)); }
    finally { if (alive.current) setLoadingMore(false); }
  }

  const personRow = (person: SocialPerson, kind: "search" | "following" | "follower" | "request") => <View key={`${kind}:${person.userId}`} style={styles.personRow}>
    <View style={styles.personDetails}><Text style={styles.name}>{person.displayName}</Text><Text style={styles.hint}>@{person.handle}</Text></View>
    {kind === "request" ? <>
      <Pressable accessibilityLabel={`Approve @${person.handle}`} disabled={!!busy} style={styles.smallButton} onPress={() => void connectionAction(`approve:${person.userId}`, () => respondToFollowRequest(person.userId, true))}><Text style={styles.buttonText}>Approve</Text></Pressable>
      <Pressable accessibilityLabel={`Decline @${person.handle}`} disabled={!!busy} style={styles.smallButton} onPress={() => void connectionAction(`decline:${person.userId}`, () => respondToFollowRequest(person.userId, false))}><Text style={styles.mutedAction}>Decline</Text></Pressable>
    </> : kind === "follower" ? <Pressable accessibilityLabel={`Remove follower @${person.handle}`} disabled={!!busy} style={styles.smallButton} onPress={() => void connectionAction(`remove:${person.userId}`, () => removeFollower(person.userId))}><Text style={styles.mutedAction}>Remove</Text></Pressable>
      : <Pressable accessibilityLabel={`${person.relationship === "accepted" ? "Unfollow" : person.relationship === "pending" ? "Cancel request to" : "Follow"} @${person.handle}`} disabled={!!busy} style={styles.smallButton} onPress={() => void connectionAction(`follow:${person.userId}`, () => person.relationship === "none" ? followUser(person.userId) : unfollowUser(person.userId))}><Text style={styles.buttonText}>{person.relationship === "accepted" ? "Unfollow" : person.relationship === "pending" ? "Requested" : "Follow"}</Text></Pressable>}
  </View>;

  const header = <>
    <ScreenHeading eyebrow="Orca · Community" title="Feed" subtitle="Small updates. Stronger together." />
    <View style={styles.toolbar}>
      <View style={styles.segmented}>{[{ value: "following", label: "Following" }, { value: "mine", label: "Your posts" }].map((option) => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: mode === option.value, disabled: !!busy }} disabled={!!busy} style={[styles.segment, mode === option.value && styles.selected]} onPress={() => { generation.current++; setPosts([]); setCursor(null); setMode(option.value as typeof mode); }}><Text style={mode === option.value ? styles.selectedText : styles.buttonText}>{option.label}</Text></Pressable>)}</View>
      <Pressable accessibilityRole="button" style={styles.smallButton} onPress={() => setPeopleOpen((value) => !value)}><Text style={styles.buttonText}>{peopleOpen ? "Close" : `People${connections.requests.length ? ` (${connections.requests.length})` : ""}`}</Text></Pressable>
    </View>
    {peopleOpen ? <View style={styles.card}>
      <Text style={styles.cardTitle}>Find your people</Text>
      <Text style={styles.hint}>Search by handle. Enter the complete @handle to find a private account. Private accounts approve requests.</Text>
      <View style={styles.searchRow}><TextInput accessibilityLabel="Search handle" autoCapitalize="none" autoCorrect={false} placeholder="@handle" placeholderTextColor={colors.mutedText} value={query} maxLength={25} style={[styles.input, styles.searchInput]} onChangeText={setQuery} onSubmitEditing={() => void act("search", async () => { const people = await searchPeople(query.trim()); if (alive.current) setResults(people); })} />
        <Pressable accessibilityRole="button" disabled={!!busy || query.trim().replace(/^@/, "").length < 3} style={styles.smallButton} onPress={() => void act("search", async () => { const people = await searchPeople(query.trim()); if (alive.current) { setResults(people); if (!people.length) setNotice("No accounts found. Try the complete handle."); } })}><Text style={styles.buttonText}>Search</Text></Pressable></View>
      {results.filter((person) => person.userId !== userId).map((person) => personRow(person, "search"))}
      {connections.requests.length ? <><Text style={styles.sectionTitle}>Follow requests</Text>{connections.requests.map((person) => personRow(person, "request"))}</> : null}
      <Text style={styles.sectionTitle}>Following · {connections.following.length}</Text>
      {connections.following.length ? connections.following.map((person) => personRow(person, "following")) : <Text style={styles.hint}>Follow someone to see their updates here.</Text>}
      <Text style={styles.sectionTitle}>Followers · {connections.followers.length}</Text>
      {connections.followers.length ? connections.followers.map((person) => personRow(person, "follower")) : <Text style={styles.hint}>Approved followers will appear here.</Text>}
    </View> : null}
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{profile?.handle ? `Share as @${profile.handle}` : "Share an update"}</Text>
      {!profile && !refreshing ? <Link href={{ pathname: "/onboarding", params: { mode: "settings" } }} asChild><Pressable accessibilityRole="button" style={styles.button}><Text style={styles.buttonText}>Finish your social profile</Text></Pressable></Link> : null}
      <TextInput accessibilityLabel="Post text" multiline maxLength={2000} editable={!busy} placeholder="How did training go?" placeholderTextColor={colors.mutedText} value={text} onChangeText={(value) => { setEventId(newEventId()); setText(value); }} style={[styles.input, styles.composer]} />
      {photo ? <View><Image source={{ uri: photo.uri }} accessibilityLabel="Selected post photo" style={styles.postImage} /><Pressable disabled={!!busy} style={styles.smallButton} onPress={() => { setEventId(newEventId()); setPhoto(null); }}><Text style={styles.buttonText}>Remove photo</Text></Pressable></View> : null}
      <Audience value={visibility} onChange={(value) => { if (value !== visibility) setEventId(newEventId()); setVisibility(value); }} disabled={!!busy} />
      <Text style={styles.hint}>{visibility === "private" ? "Visible only to you." : visibility === "public" ? "Public when your profile is public; otherwise only approved followers." : "Visible to approved followers. Private profiles approve follow requests."}</Text>
      <View style={styles.composerActions}><Pressable accessibilityRole="button" disabled={!!busy} style={styles.button} onPress={() => void choosePhoto()}><Text style={styles.buttonText}>{photo ? "Change photo" : "Add photo"}</Text></Pressable><Text style={styles.counter}>{text.length}/2000</Text><Pressable accessibilityRole="button" disabled={!!busy || (!text.trim() && !photo)} style={[styles.primary, (!!busy || (!text.trim() && !photo)) && styles.disabled]} onPress={() => void post()}><Text style={styles.primaryText}>{busy === "post" ? "Posting…" : "Post"}</Text></Pressable></View>
    </View>
    <View style={styles.card}>
      <View style={styles.sharingRow}><View style={styles.personDetails}><Text style={styles.cardTitle}>Automatically share PRs</Text><Text style={styles.hint}>Post new weight records after saving a workout. Starts with your next workout; past history stays private.</Text></View><Switch accessibilityLabel="Automatically share personal records" disabled={!!busy} value={sharing.enabled} onValueChange={(value) => void changeSharing(value)} trackColor={{ true: colors.accent }} /></View>
      {sharing.enabled ? <Audience value={sharing.visibility} disabled={!!busy} onChange={(value) => void changeSharing(true, value)} /> : null}
      {sharing.pendingCount || sharing.lastError ? <><Text style={styles.hint}>{sharing.pendingCount} PR {sharing.pendingCount === 1 ? "post" : "posts"} waiting to share.{sharing.lastError ? ` ${sharing.lastError}` : ""}</Text><Pressable disabled={!!busy} style={styles.button} onPress={() => void act("retry", async () => { await retryPersonalRecordPublishing(); await refresh(); })}><Text style={styles.buttonText}>Retry sharing</Text></Pressable></> : null}
    </View>
    {error ? <View style={styles.status}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable style={styles.smallButton} disabled={!!busy} onPress={() => void refresh()}><Text style={styles.buttonText}>Refresh feed</Text></Pressable></View> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
    {cleanupPostId ? <Pressable accessibilityRole="button" disabled={!!busy} style={styles.button} onPress={() => void act("cleanup", async () => {
      const result = await deleteFeedPost(cleanupPostId, userId);
      if (alive.current) { if (!result.imageCleanupPending) setCleanupPostId(null); setNotice(result.imageCleanupPending ? "Photo cleanup is still pending. Try again when connected." : "Photo cleanup completed."); }
    })}><Text style={styles.buttonText}>Retry photo cleanup</Text></Pressable> : null}
    {busy && busy !== "post" ? <ActivityIndicator accessibilityLabel="Updating feed" style={styles.status} /> : null}
  </>;

  return <FlatList style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" data={posts} keyExtractor={(item) => item.id} ListHeaderComponent={header} refreshing={refreshing} onRefresh={() => void refresh()} renderItem={({ item }) => <View style={styles.card}>
    <View style={styles.postHeader}>{item.author.avatarUrl ? <Image source={{ uri: item.author.avatarUrl }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.name}>{item.author.displayName.charAt(0).toUpperCase()}</Text></View>}<View style={styles.personDetails}><Text style={styles.name}>{item.author.displayName}</Text><Text style={styles.hint}>@{item.author.handle} · {new Date(item.occurredAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text></View>{item.userId === userId ? <Pressable accessibilityRole="button" accessibilityLabel="Delete post" disabled={!!busy} style={styles.smallButton} onPress={() => confirmDelete(item)}><Ionicons name="trash-outline" size={19} color={colors.mutedText} /></Pressable> : null}</View>
    {item.eventType === "personal_record" ? <View style={styles.prBadge}><Ionicons name="trophy-outline" size={17} color={colors.warm} /><Text style={styles.prLabel}>Personal record</Text></View> : null}
    {item.eventType === "personal_record" && item.exerciseName ? <Text style={styles.cardTitle}>{item.exerciseName}</Text> : null}
    {item.summaryText ? <Text selectable style={styles.postText}>{item.summaryText}</Text> : null}
    {item.imageUrl ? <Image source={{ uri: item.imageUrl }} accessibilityLabel={`Photo shared by ${item.author.displayName}`} style={styles.postImage} /> : null}
    {item.imageUnavailable ? <Text style={styles.hint}>Photo couldn’t load. Refresh the feed to try again.</Text> : null}
    <Text style={styles.hint}>{audienceOptions.find((option) => option.value === item.visibility)?.label ?? "Followers"}</Text>
  </View>} ListEmptyComponent={!refreshing && !error ? <View style={styles.empty}><Ionicons name="chatbubble-outline" size={30} color={colors.mutedText} /><Text style={styles.cardTitle}>{mode === "mine" ? "Your first update" : "Your feed starts here"}</Text><Text style={styles.hint}>{mode === "mine" ? "Post a thought or photo, or turn on PR sharing for your next workout." : "Find a lifter in People or share your own progress."}</Text></View> : null} ListFooterComponent={cursor ? <Pressable disabled={loadingMore || refreshing} style={styles.button} onPress={() => void loadMore()}><Text style={styles.buttonText}>{loadingMore ? "Loading…" : "Load more"}</Text></Pressable> : null} />;
}

function Audience({ value, onChange, disabled }: { value: ProfileVisibility; onChange: (value: ProfileVisibility) => void; disabled: boolean }) {
  const { styles } = useThemeStyles(themedStyles);
  return <View accessibilityLabel="Post audience" style={styles.audience}>{audienceOptions.map((option) => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: value === option.value, disabled }} disabled={disabled} onPress={() => onChange(option.value)} style={[styles.audienceButton, value === option.value && styles.selected]}><Text style={value === option.value ? styles.selectedText : styles.buttonText}>{option.label}</Text></Pressable>)}</View>;
}

const themedStyles = createThemedStyles((colors, ui) => ({
  screen: { flex: 1, backgroundColor: colors.background }, content: { ...ui.content, paddingHorizontal: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  card: { ...ui.group, padding: 16, gap: 12, marginBottom: 14 },
  cardTitle: { fontSize: 17, lineHeight: 23, fontWeight: "600", color: colors.text },
  body: { fontSize: 16, lineHeight: 24, color: colors.secondaryText }, hint: { fontSize: 13, lineHeight: 19, color: colors.mutedText },
  name: { fontSize: 15, lineHeight: 21, fontWeight: "600", color: colors.text },
  primary: { ...ui.primary, minHeight: 44, paddingHorizontal: 18, justifyContent: "center", alignItems: "center" },
  primaryText: { color: colors.onAccent, fontSize: 15, fontWeight: "600" },
  button: { ...ui.control, minHeight: 44, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  smallButton: { minHeight: 44, paddingHorizontal: 9, alignItems: "center", justifyContent: "center" },
  buttonText: { color: colors.accent, fontSize: 14, fontWeight: "600" }, mutedAction: { color: colors.mutedText, fontSize: 13 },
  input: { ...ui.input, padding: 12, color: colors.text, fontSize: 16, minHeight: 44 },
  composer: { minHeight: 100, textAlignVertical: "top", lineHeight: 23 },
  composerActions: { flexDirection: "row", gap: 8, alignItems: "center" }, counter: { flex: 1, color: colors.mutedText, fontSize: 11, textAlign: "right" },
  audience: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, audienceButton: { ...ui.input, minHeight: 44, paddingHorizontal: 12, justifyContent: "center" },
  selected: { backgroundColor: colors.accentSoft }, selectedText: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  disabled: { opacity: 0.5 }, toolbar: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 16 },
  segmented: { ...ui.group, flexDirection: "row", flex: 1, padding: 4, gap: 4 }, segment: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  searchRow: { flexDirection: "row", gap: 4, alignItems: "center" }, searchInput: { flex: 1 },
  personRow: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 5, borderTopColor: colors.border, borderTopWidth: 0.5 },
  personDetails: { flex: 1, gap: 2 }, sectionTitle: { color: colors.secondaryText, fontSize: 13, fontWeight: "600", marginTop: 8 },
  sharingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20 }, avatarFallback: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceInset, alignItems: "center", justifyContent: "center" },
  postText: { color: colors.text, fontSize: 16, lineHeight: 24 }, postImage: { width: "100%", aspectRatio: 4 / 3, borderRadius: 10, backgroundColor: colors.surfaceInset, resizeMode: "cover" },
  prBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.warmSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  prLabel: { color: colors.warm, fontWeight: "600", fontSize: 13 }, blueIcon: { color: colors.accent },
  status: { marginBottom: 14, gap: 6 }, error: { color: colors.danger, fontSize: 14, lineHeight: 21 }, notice: { color: colors.secondaryText, fontSize: 14, lineHeight: 21, marginBottom: 14 },
  empty: { gap: 10, padding: 24, alignItems: "center" }
}));
