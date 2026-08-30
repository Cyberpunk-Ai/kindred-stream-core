export const APP_NAME = "GameFlex";
export const APP_TAGLINE = "The World's Premier Gaming Ecosystem";
export const APP_DESCRIPTION =
  "Join tournaments, build your legacy, and compete in the modern gaming ecosystem.";

export const CURRENCY = "KES";
export const CURRENCY_SYMBOL = "KES";

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
};

export const CACHE = {
  STALE_TIME_DEFAULT: 5 * 60 * 1000,
  STALE_TIME_LEADERBOARD: 60 * 1000,
  STALE_TIME_TOURNAMENTS: 2 * 60 * 1000,
};

/**
 * Canonical storage bucket names aligned with src/storage/buckets.ts
 * Legacy bucket names (tournament-images, flex, etc.) are aliased to canonical names
 * in the storage layer for backward compatibility.
 */
export const SUPABASE_BUCKETS = {
  AVATARS: "avatars",
  POSTS: "posts",
  STORIES: "stories",
  SHORT_VIDEOS: "short-videos",
  TOURNAMENTS: "tournaments",
  ACHIEVEMENTS: "achievements",
  REWARDS: "rewards",
  MARKETPLACE: "marketplace",
  MESSAGES: "messages",
  SUPPORT: "support",
  BACKUPS: "backups",
};

export const REALTIME_CHANNELS = {
  MESSAGES: "messages",
  NOTIFICATIONS: "notifications",
  PRESENCE: "presence",
  TOURNAMENTS: "tournaments",
};

export const STORAGE = {
  MAX_AVATAR_SIZE_MB: 2,
  MAX_IMAGE_SIZE_MB: 5,
  MAX_VIDEO_SIZE_MB: 50,
};

export const ANALYTICS = {
  SESSION_KEY: "gf_session_id",
};
