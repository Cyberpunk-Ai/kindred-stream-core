export {
  GAMEFLEX_BUCKETS,
  GAMEFLEX_BUCKET_LIST,
  GAMEFLEX_BUCKET_REGISTRY,
  getBucketConfig,
  isGameflexBucket,
} from "@/storage/buckets";

/**
 * Canonical storage bucket names aligned with src/storage/buckets.ts
 * Legacy aliases kept for backward compatibility during migration
 */
export const STORAGE_BUCKETS = {
  AVATARS: "avatars",
  POSTS: "posts",
  STORIES: "stories",
  SHORT_VIDEOS: "short-videos",
  MESSAGES: "messages",
  TOURNAMENTS: "tournaments",
  ACHIEVEMENTS: "achievements",
  REWARDS: "rewards",
  MARKETPLACE: "marketplace",
  SUPPORT: "support",
  BACKUPS: "backups",
  // Legacy aliases for backward compatibility
  STATUS_MEDIA: "stories",
  TOURNAMENT_IMAGES: "tournaments",
  FLEX: "posts",
} as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];
