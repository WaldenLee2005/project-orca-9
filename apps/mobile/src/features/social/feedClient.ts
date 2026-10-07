/** Cloud social operations share the SDK session; this module has no device imports. */
export type FeedVisibility = 'private' | 'friends' | 'public';
export type SocialPerson = {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  profileVisibility: FeedVisibility;
  relationship: 'none' | 'pending' | 'accepted';
  isFollower: boolean;
};
export type FeedPost = {
  id: string;
  userId: string;
  clientEventId?: string;
  eventType: 'user_post' | 'personal_record' | 'completed_session' | 'weekly_consistency';
  summaryText: string;
  visibility: FeedVisibility;
  occurredAt: string;
  createdAt: string;
  exerciseName?: string;
  imageUrl?: string;
  imageUnavailable?: boolean;
  author: Pick<SocialPerson, 'userId' | 'handle' | 'displayName' | 'avatarUrl' | 'profileVisibility'>;
};
export type FeedCursor = { occurredAt: string; id: string };
export type FeedPage = { posts: FeedPost[]; nextCursor?: FeedCursor };
export type FeedImageInput = { base64: string; mimeType: string; uri?: string };
export type CreateFeedPostInput = { userId: string; eventId: string; text: string; visibility: FeedVisibility; image?: FeedImageInput };
export type PublishPersonalRecordInput = {
  userId: string;
  eventId: string;
  workoutSessionId: string;
  exerciseName: string;
  summaryText: string;
  occurredAt: string;
  visibility: FeedVisibility;
};
type Session = { user: { id: string }; access_token: string; expires_at?: number };
type PersonRow = { user_id: string; handle: string; display_name: string; avatar_url: string | null; profile_visibility: FeedVisibility; relationship?: SocialPerson['relationship']; is_follower?: boolean };
type PostRow = {
  id: string; user_id: string; client_event_id: string | null; event_type: FeedPost['eventType'];
  summary_text: string; visibility: FeedVisibility; occurred_at: string; created_at: string;
  exercise_name_snapshot: string | null; image_path: string | null; author: PersonRow;
};

export const FEED_TEXT_LIMIT = 2000;
export const FEED_IMAGE_LIMIT_BYTES = 5 * 1024 * 1024;
export const FEED_IMAGE_SIGNED_URL_SECONDS = 60;
export const SOCIAL_ACCOUNT_CHANGED_MESSAGE = 'Your account changed. Refresh the feed and try again.';
export const SOCIAL_SETUP_REQUIRED_MESSAGE = 'The feed is unavailable right now. Please try again later. Your workouts are still saved.';

export function validateFeedImage(image: FeedImageInput) {
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[image.mimeType];
  if (!extension) throw new Error('Choose a JPEG, PNG, or WebP photo.');
  // Reject oversize encoded input before allocating its decoded byte array.
  if (!image.base64 || image.base64.length > Math.ceil(FEED_IMAGE_LIMIT_BYTES / 3) * 4 + 4
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64)) throw new Error('Choose a photo smaller than 5 MB.');
  let binary: string;
  try { binary = globalThis.atob(image.base64); } catch { throw new Error('That photo could not be read. Choose another photo.'); }
  if (!binary.length || binary.length > FEED_IMAGE_LIMIT_BYTES) throw new Error('Choose a photo smaller than 5 MB.');
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const matches = image.mimeType === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : image.mimeType === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
    : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!matches) throw new Error('Choose a valid JPEG, PNG, or WebP photo.');
  return { bytes, extension, contentType: image.mimeType };
}

export function createFeedClient(dependencies: {
  getConfig(): { url: string; publishableKey: string };
  getSession(): Promise<Session | null>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}) {
  const fetcher = dependencies.fetch ?? globalThis.fetch;

  async function requireSession(expectedUserId?: string) {
    const session = await dependencies.getSession();
    if (!session?.user?.id || !session.access_token) throw new Error(expectedUserId ? SOCIAL_ACCOUNT_CHANGED_MESSAGE : 'Sign in to use the social feed.');
    if (expectedUserId && session.user.id !== expectedUserId) throw new Error(SOCIAL_ACCOUNT_CHANGED_MESSAGE);
    if (session.expires_at && session.expires_at <= Date.now() / 1000) throw new Error('Your session expired. Sign in again.');
    return session;
  }

  async function request(path: string, init: RequestInit, expectedUserId: string) {
    const session = await requireSession(expectedUserId);
    const { url, publishableKey } = dependencies.getConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 15000);
    try {
      const response = await fetcher(`${url.replace(/\/$/, '')}/${path}`, {
        ...init, signal: controller.signal,
        headers: { apikey: publishableKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', ...init.headers }
      });
      const result: unknown = response.status === 204 ? null : await response.json();
      // Never hand an old account's data or continuation back to the new account.
      await requireSession(expectedUserId);
      if (!response.ok) {
        const error = result as { code?: string; message?: string; error?: string } | null;
        if (['PGRST202', 'PGRST204', '42P01', '42883'].includes(error?.code ?? '')) throw new Error(SOCIAL_SETUP_REQUIRED_MESSAGE);
        if (path.includes('rpc/') && response.status === 404) throw new Error(SOCIAL_SETUP_REQUIRED_MESSAGE);
        throw new Error(error?.message ?? error?.error ?? 'Could not connect to the social feed. Try again.');
      }
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('The social feed request timed out. Check your connection and try again.');
      throw error;
    } finally { clearTimeout(timeout); }
  }

  async function rpc(name: string, body: Record<string, unknown>, userId: string) {
    return request(`rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(body) }, userId);
  }

  async function signImage(path: string, userId: string) {
    const data = await request(`storage/v1/object/sign/feed-images/${encodePath(path)}`, {
      method: 'POST', body: JSON.stringify({ expiresIn: FEED_IMAGE_SIGNED_URL_SECONDS })
    }, userId) as { signedURL?: string; signedUrl?: string };
    const signed = data.signedURL ?? data.signedUrl;
    if (!signed) throw new Error('Photo is unavailable.');
    const { url } = dependencies.getConfig();
    if (signed.startsWith('https://') || signed.startsWith('http://')) return signed;
    return `${url.replace(/\/$/, '')}${signed.startsWith('/storage/v1/') ? signed : `/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`}`;
  }

  async function mapPost(row: PostRow, userId: string): Promise<FeedPost> {
    const result: FeedPost = {
      id: row.id, userId: row.user_id, clientEventId: row.client_event_id ?? undefined,
      eventType: row.event_type, summaryText: row.summary_text, visibility: row.visibility,
      occurredAt: row.occurred_at, createdAt: row.created_at, exerciseName: row.exercise_name_snapshot ?? undefined,
      author: mapPerson(row.author)
    };
    if (row.image_path) {
      try { result.imageUrl = await signImage(row.image_path, userId); }
      catch (error) {
        await requireSession(userId);
        if (error instanceof Error && error.message === SOCIAL_ACCOUNT_CHANGED_MESSAGE) throw error;
        result.imageUnavailable = true;
      }
    }
    return result;
  }

  return {
    async loadFeed(input: { mode: 'following' | 'mine' | 'discover'; before?: FeedCursor; limit?: number } = { mode: 'following' }): Promise<FeedPage> {
      const { user } = await requireSession();
      const limit = Math.min(50, Math.max(1, Math.floor(input.limit ?? 20)));
      const rows = await rpc('orca_feed', {
        p_mode: input.mode, p_limit: limit + 1, p_before_time: input.before?.occurredAt ?? null, p_before_id: input.before?.id ?? null
      }, user.id) as PostRow[];
      const page = rows.slice(0, limit);
      const posts = await Promise.all(page.map((row) => mapPost(row, user.id)));
      await requireSession(user.id);
      const last = page.at(-1);
      return { posts, nextCursor: rows.length > limit && last ? { occurredAt: last.occurred_at, id: last.id } : undefined };
    },
    async searchPeople(query: string): Promise<SocialPerson[]> {
      const { user } = await requireSession();
      const rows = await rpc('orca_search_people', { p_query: query.trim().slice(0, 80) }, user.id) as PersonRow[];
      return rows.map(mapPerson);
    },
    async loadConnections(): Promise<{ following: SocialPerson[]; followers: SocialPerson[]; requests: SocialPerson[] }> {
      const { user } = await requireSession();
      const data = await rpc('orca_connections', {}, user.id) as Record<'following' | 'followers' | 'requests', PersonRow[]>;
      return { following: data.following.map(mapPerson), followers: data.followers.map(mapPerson), requests: data.requests.map(mapPerson) };
    },
    async followUser(userId: string): Promise<'pending' | 'accepted'> {
      const { user } = await requireSession();
      if (userId === user.id) throw new Error('You cannot follow yourself.');
      return await rpc('orca_follow', { p_user_id: userId }, user.id) as 'pending' | 'accepted';
    },
    async unfollowUser(userId: string) {
      const { user } = await requireSession();
      await rpc('orca_unfollow', { p_user_id: userId }, user.id);
    },
    async respondToFollowRequest(userId: string, accept: boolean) {
      const { user } = await requireSession();
      await rpc('orca_respond_follow', { p_user_id: userId, p_accept: accept }, user.id);
    },
    async removeFollower(userId: string) {
      const { user } = await requireSession();
      await rpc('orca_remove_follower', { p_user_id: userId }, user.id);
    },
    async createFeedPost(input: CreateFeedPostInput): Promise<FeedPost> {
      await requireSession(input.userId);
      validateIdentity(input.eventId);
      validateAudience(input.visibility);
      const text = input.text.trim();
      if (text.length > FEED_TEXT_LIMIT || (!text && !input.image)) throw new Error('Write up to 2000 characters or add a photo.');
      let imagePath: string | null = null;
      if (input.image) {
        const image = validateFeedImage(input.image);
        imagePath = `${input.userId}/${encodeURIComponent(input.eventId)}.${image.extension}`;
        // Immutable, deterministic path makes an uncertain upload safe to retry.
        try {
          await request(`storage/v1/object/feed-images/${encodePath(imagePath)}`, {
            method: 'POST', body: image.bytes as unknown as BodyInit,
            headers: { 'Content-Type': image.contentType, 'x-upsert': 'false' }
          }, input.userId);
        } catch (error) {
          if (!(error instanceof Error) || !/already exists|duplicate/i.test(error.message)) throw error;
          await requireSession(input.userId);
        }
      }
      const row = await rpc('orca_create_post', {
        p_client_event_id: input.eventId, p_text: text, p_visibility: input.visibility, p_image_path: imagePath
      }, input.userId) as PostRow;
      return mapPost(row, input.userId);
    },
    async publishPersonalRecord(input: PublishPersonalRecordInput): Promise<void> {
      await requireSession(input.userId);
      validateIdentity(input.eventId);
      validateIdentity(input.workoutSessionId);
      validateAudience(input.visibility);
      if (!input.exerciseName.trim() || input.exerciseName.trim().length > 200 || !input.summaryText.trim()
        || input.summaryText.trim().length > FEED_TEXT_LIMIT || !Number.isFinite(Date.parse(input.occurredAt))) throw new Error('Invalid PR summary.');
      await rpc('orca_publish_pr', {
        p_client_event_id: input.eventId, p_workout_session_id: input.workoutSessionId,
        p_exercise_name: input.exerciseName.trim(), p_summary_text: input.summaryText.trim(),
        p_occurred_at: input.occurredAt, p_visibility: input.visibility
      }, input.userId);
    },
    async deleteFeedPost(postId: string, userId: string): Promise<{ imageCleanupPending: boolean }> {
      await requireSession(userId);
      const result = await rpc('orca_delete_post', { p_post_id: postId }, userId) as { image_path: string | null };
      if (!result.image_path) return { imageCleanupPending: false };
      // Delete the row first: new photo reads lose authorization immediately.
      try {
        await request('storage/v1/object/feed-images', { method: 'DELETE', body: JSON.stringify({ prefixes: [result.image_path] }) }, userId);
        return { imageCleanupPending: false };
      } catch {
        await requireSession(userId);
        return { imageCleanupPending: true };
      }
    }
  };
}

function encodePath(path: string) { return path.split('/').map(encodeURIComponent).join('/'); }
function validateIdentity(value: string) {
  if (!value || value.length > 240) throw new Error('Invalid post identity.');
}
function validateAudience(value: string) {
  if (!['private', 'friends', 'public'].includes(value)) throw new Error('Choose a post audience.');
}
function mapPerson(row: PersonRow): SocialPerson {
  return { userId: row.user_id, handle: row.handle, displayName: row.display_name, avatarUrl: row.avatar_url ?? undefined,
    profileVisibility: row.profile_visibility, relationship: row.relationship ?? 'none', isFollower: row.is_follower ?? false };
}
