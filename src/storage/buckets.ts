export const GAMEFLEX_BUCKETS = {
  avatars: "avatars",
  posts: "posts",
  stories: "stories",
  shortVideos: "short-videos",
  messages: "messages",
  tournaments: "tournaments",
  achievements: "achievements",
  rewards: "rewards",
  marketplace: "marketplace",
  support: "support",
  backups: "backups",
} as const;

export type GameflexBucket = (typeof GAMEFLEX_BUCKETS)[keyof typeof GAMEFLEX_BUCKETS];

export const GAMEFLEX_BUCKET_LIST = Object.values(GAMEFLEX_BUCKETS) as GameflexBucket[];

export const GAMEFLEX_BUCKET_REGISTRY: Record<
  GameflexBucket,
  {
    id: GameflexBucket;
    purpose: string;
    visibility: "public" | "private";
    allowedMimeTypes: string[];
    maxBytes: number;
    objectKeyPattern: string;
  }
> = {
  avatars: {
    id: "avatars",
    purpose: "User profile and identity media",
    visibility: "public",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    maxBytes: 10 * 1024 * 1024,
    objectKeyPattern: "avatars/{userId}/{objectId}.{ext}",
  },
  posts: {
    id: "posts",
    purpose: "Feed posts and article-style media",
    visibility: "public",
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/webm",
      "image/gif",
    ],
    maxBytes: 10 * 1024 * 1024,
    objectKeyPattern: "posts/{userId}/{objectId}.{ext}",
  },
  stories: {
    id: "stories",
    purpose: "Short-lived social stories",
    visibility: "public",
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/webm",
      "image/gif",
    ],
    maxBytes: 25 * 1024 * 1024,
    objectKeyPattern: "stories/{userId}/{objectId}.{ext}",
  },
  "short-videos": {
    id: "short-videos",
    purpose: "Short-form video content",
    visibility: "public",
    allowedMimeTypes: ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"],
    maxBytes: 10 * 1024 * 1024,
    objectKeyPattern: "short-videos/{userId}/{objectId}.{ext}",
  },
  messages: {
    id: "messages",
    purpose: "Private chat attachments and media",
    visibility: "private",
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
      "application/pdf",
    ],
    maxBytes: 10 * 1024 * 1024,
    objectKeyPattern: "messages/{userId}/{conversationId}/{objectId}.{ext}",
  },
  tournaments: {
    id: "tournaments",
    purpose: "Tournament artwork and event media",
    visibility: "public",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    maxBytes: 10 * 1024 * 1024,
    objectKeyPattern: "tournaments/{objectId}.{ext}",
  },
  achievements: {
    id: "achievements",
    purpose: "Achievement badges and unlock artwork",
    visibility: "public",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    maxBytes: 10 * 1024 * 1024,
    objectKeyPattern: "achievements/{objectId}.{ext}",
  },
  rewards: {
    id: "rewards",
    purpose: "Reward cards and promo media",
    visibility: "public",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    maxBytes: 10 * 1024 * 1024,
    objectKeyPattern: "rewards/{objectId}.{ext}",
  },
  marketplace: {
    id: "marketplace",
    purpose: "Marketplace item images",
    visibility: "public",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    maxBytes: 10 * 1024 * 1024,
    objectKeyPattern: "marketplace/{sellerId}/{objectId}.{ext}",
  },
  support: {
    id: "support",
    purpose: "Support tickets and sensitive support attachments",
    visibility: "private",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"],
    maxBytes: 10 * 1024 * 1024,
    objectKeyPattern: "support/{userId}/{ticketId}/{objectId}.{ext}",
  },
  backups: {
    id: "backups",
    purpose: "Administrative backups and recovery artifacts",
    visibility: "private",
    allowedMimeTypes: [],
    maxBytes: 10 * 1024 * 1024,
    objectKeyPattern: "backups/{date}/{objectId}",
  },
} as const;

export function isGameflexBucket(value: string): value is GameflexBucket {
  return GAMEFLEX_BUCKET_LIST.includes(value as GameflexBucket);
}

export function getBucketConfig(bucket: string) {
  if (!isGameflexBucket(bucket)) {
    throw new Error(`Unsupported GameFlex bucket: ${bucket}`);
  }
  return GAMEFLEX_BUCKET_REGISTRY[bucket];
}
