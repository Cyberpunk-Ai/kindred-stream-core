import { backend } from "@/backend";

/**
 * Cursor-based social feed reads.
 *
 * Everything is keyset paginated on `(created_at, id)` — never OFFSET — so the
 * cost of page N is constant as content grows, and no row is ever returned
 * twice or skipped while new posts arrive at the head of the feed.
 *
 * Hydration (author profile + the viewer's like/save/repost/follow state) is
 * done with one batched query per relation for the whole page, so a page of
 * 12 posts costs a fixed handful of queries instead of 12×N.
 */

export type FeedMode = "foryou" | "trending" | "following";

export interface FeedCursor {
  createdAt: string;
  id: string;
}

export interface FeedPost {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  media_urls: string[];
  media_type: string | null;
  likes_count: number;
  comments_count: number;
  views_count: number;
  reposts_count: number;
  created_at: string;
  expires_at: string | null;
  profile?: { user_id: string; username: string; avatar_url: string | null } | null;
  isLiked: boolean;
  isSaved: boolean;
  isReposted: boolean;
  isFollowing: boolean;
  score?: number;
}

export interface FeedPage {
  items: FeedPost[];
  nextCursor: FeedCursor | null;
}

export const FEED_PAGE_SIZE = 12;

function encodeCursor(cursor: FeedCursor): string {
  return `${cursor.createdAt}|${cursor.id}`;
}

export function parseCursor(value?: string | null): FeedCursor | null {
  if (!value) return null;
  const [createdAt, id] = value.split("|");
  return createdAt && id ? { createdAt, id } : null;
}

export function cursorOf(post: { created_at: string; id: string }): string {
  return encodeCursor({ createdAt: post.created_at, id: post.id });
}

function normalizeMediaUrls(row: Record<string, unknown>): string[] {
  const raw = row["media_urls"];
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === "string");
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

const SELECT_COLUMNS =
  "id, user_id, content, media_url, media_urls, media_type, likes_count, comments_count, views_count, reposts_count, created_at, expires_at";

export class FeedService {
  /** Ids the viewer follows — cached per call site by react-query. */
  async getFollowingIds(userId: string): Promise<string[]> {
    const { data } = await backend
      .from("user_follows")
      .select("following_id")
      .eq("follower_id", userId);
    return (data ?? []).map((row: { following_id: string }) => row.following_id);
  }

  /**
   * Hydrates a page of raw rows with author profiles and viewer state using a
   * fixed number of batched queries.
   */
  async hydrate(rows: Record<string, any>[], viewerId?: string | null): Promise<FeedPost[]> {
    if (!rows.length) return [];
    const postIds = rows.map((r) => r["id"] as string);
    const authorIds = [...new Set(rows.map((r) => r["user_id"] as string))];

    const [profilesRes, likesRes, savesRes, repostsRes, followsRes] = await Promise.all([
      backend.from("profiles").select("user_id, username, avatar_url").in("user_id", authorIds),
      viewerId
        ? backend
            .from("status_likes")
            .select("status_id")
            .eq("user_id", viewerId)
            .in("status_id", postIds)
        : Promise.resolve({ data: [] as { status_id: string }[] }),
      viewerId
        ? backend
            .from("status_saves")
            .select("status_id")
            .eq("user_id", viewerId)
            .in("status_id", postIds)
            .then(
              (r: any) => r,
              () => ({ data: [] as { status_id: string }[] }),
            )
        : Promise.resolve({ data: [] as { status_id: string }[] }),
      viewerId
        ? backend
            .from("status_reposts")
            .select("status_id")
            .eq("user_id", viewerId)
            .in("status_id", postIds)
            .then(
              (r: any) => r,
              () => ({ data: [] as { status_id: string }[] }),
            )
        : Promise.resolve({ data: [] as { status_id: string }[] }),
      viewerId
        ? backend
            .from("user_follows")
            .select("following_id")
            .eq("follower_id", viewerId)
            .in("following_id", authorIds)
        : Promise.resolve({ data: [] as { following_id: string }[] }),
    ]);

    const profileMap = new Map((profilesRes.data ?? []).map((p: any) => [p.user_id, p] as const));
    const liked = new Set((likesRes.data ?? []).map((r: any) => r.status_id));
    const saved = new Set((savesRes.data ?? []).map((r: any) => r.status_id));
    const reposted = new Set((repostsRes.data ?? []).map((r: any) => r.status_id));
    const following = new Set((followsRes.data ?? []).map((r: any) => r.following_id));

    return rows.map((row) => ({
      id: row["id"],
      user_id: row["user_id"],
      content: row["content"] ?? null,
      media_url: row["media_url"] ?? null,
      media_urls: normalizeMediaUrls(row),
      media_type: row["media_type"] ?? null,
      likes_count: row["likes_count"] ?? 0,
      comments_count: row["comments_count"] ?? 0,
      views_count: row["views_count"] ?? 0,
      reposts_count: row["reposts_count"] ?? 0,
      created_at: row["created_at"],
      expires_at: row["expires_at"] ?? null,
      profile: profileMap.get(row["user_id"]) ?? null,
      isLiked: liked.has(row["id"]),
      isSaved: saved.has(row["id"]),
      isReposted: reposted.has(row["id"]),
      isFollowing: following.has(row["user_id"]),
      score: typeof row["score"] === "number" ? row["score"] : undefined,
    }));
  }

  /** One keyset-paginated page of the feed. */
  async getPage(options: {
    mode: FeedMode;
    viewerId?: string | null;
    cursor?: string | null;
    limit?: number;
  }): Promise<FeedPage> {
    const limit = options.limit ?? FEED_PAGE_SIZE;
    const cursor = parseCursor(options.cursor);

    let query = backend
      .from("user_statuses")
      .select(SELECT_COLUMNS)
      .is("expires_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (options.mode === "trending") {
      const since = new Date(Date.now() - 72 * 3_600_000).toISOString();
      query = query.gte("created_at", since);
    }

    if (options.mode === "following") {
      if (!options.viewerId) return { items: [], nextCursor: null };
      const ids = await this.getFollowingIds(options.viewerId);
      if (!ids.length) return { items: [], nextCursor: null };
      query = query.in("user_id", ids);
    }

    if (cursor) {
      // Keyset: strictly older than the cursor, tie-broken by id.
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as Record<string, any>[];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = await this.hydrate(pageRows, options.viewerId);

    if (options.mode === "trending") {
      items.sort(
        (a, b) =>
          b.likes_count * 5 +
          b.comments_count * 4 +
          b.views_count * 0.2 -
          (a.likes_count * 5 + a.comments_count * 4 + a.views_count * 0.2),
      );
    }

    const last = pageRows[pageRows.length - 1];
    return {
      items,
      nextCursor: hasMore && last ? { createdAt: last["created_at"], id: last["id"] } : null,
    };
  }

  /** A user's own posts, keyset paginated (profile grid). */
  async getUserPage(userId: string, cursor?: string | null, limit = 18): Promise<FeedPage> {
    const parsed = parseCursor(cursor);
    let query = backend
      .from("user_statuses")
      .select(SELECT_COLUMNS)
      .eq("user_id", userId)
      .is("expires_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (parsed) {
      query = query.or(
        `created_at.lt.${parsed.createdAt},and(created_at.eq.${parsed.createdAt},id.lt.${parsed.id})`,
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as Record<string, any>[];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      items: await this.hydrate(pageRows, userId),
      nextCursor: hasMore && last ? { createdAt: last["created_at"], id: last["id"] } : null,
    };
  }
}

export const feedService = new FeedService();
