import { getSupabaseConfig } from '../../lib/supabase';
import { getCurrentAuthSession } from './authRepository';
import { createFeedClient } from './feedClient';

const feed = createFeedClient({ getConfig: getSupabaseConfig, getSession: getCurrentAuthSession });
export const loadFeed = feed.loadFeed;
export const searchPeople = feed.searchPeople;
export const loadConnections = feed.loadConnections;
export const followUser = feed.followUser;
export const unfollowUser = feed.unfollowUser;
export const respondToFollowRequest = feed.respondToFollowRequest;
export const removeFollower = feed.removeFollower;
export const createFeedPost = feed.createFeedPost;
export const publishPersonalRecord = feed.publishPersonalRecord;
export const deleteFeedPost = feed.deleteFeedPost;
export { FEED_TEXT_LIMIT, FEED_IMAGE_LIMIT_BYTES, validateFeedImage } from './feedClient';
export type { FeedVisibility, SocialPerson, FeedPost, FeedCursor, FeedPage, FeedImageInput, CreateFeedPostInput, PublishPersonalRecordInput } from './feedClient';
