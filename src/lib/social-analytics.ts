export function applyCountDelta(current: number | null | undefined, delta: number): number {
  const base = Number.isFinite(current) ? Number(current) : 0;
  return Math.max(0, base + delta);
}

type CountClient = {
  from: (table: string) => any;
  rpc?: (fn: string, args?: Record<string, unknown>) => any;
};

const VIEWER_KEY_STORAGE = "gf_viewer_key";

/**
 * A stable per-device (or per-account) identity used to de-duplicate views so
 * one person refreshing a post does not inflate its view count.
 */
export function viewerKey(userId?: string | null): string {
  if (userId) return `u:${userId}`;
  if (typeof window === "undefined") return "";
  try {
    let key = window.localStorage.getItem(VIEWER_KEY_STORAGE);
    if (!key) {
      key = `a:${crypto.randomUUID()}`;
      window.localStorage.setItem(VIEWER_KEY_STORAGE, key);
    }
    return key;
  } catch {
    return "";
  }
}

/**
 * Counts a view through a database routine. The old approach read the current
 * value and wrote it back from the browser, which row-level security blocked
 * for everyone except the post's author — so views never moved and other
 * counters could be clobbered.
 */
export async function recordStatusView(
  client: CountClient,
  statusId: string,
  userId?: string | null,
): Promise<void> {
  const key = viewerKey(userId);
  if (!statusId || !key || !client.rpc) return;
  try {
    await client.rpc("record_status_view", { _status_id: statusId, _viewer_key: key });
  } catch {
    /* view counting is best-effort and must never break the UI */
  }
}

/**
 * Likes, comments and reposts counters are maintained by database triggers.
 * Kept as a no-op so legacy call sites cannot re-introduce counter drift.
 */
export async function updateStatusCount(
  client: CountClient,
  statusId: string,
  field: "likes_count" | "comments_count" | "views_count",
  _delta: number,
) {
  if (field === "views_count") await recordStatusView(client, statusId);
  return null;
}

export async function updateEntityCount(
  client: CountClient,
  _table: string,
  id: string,
  field: "likes_count" | "comments_count" | "views_count",
  delta: number,
) {
  return updateStatusCount(client, id, field, delta);
}

export function readSavedPosts(
  storage: Pick<Storage, "getItem"> | null | undefined,
  userId: string,
): string[] {
  const storageEngine =
    storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!storageEngine?.getItem) return [];
  const raw = storageEngine.getItem(`gf_saved_posts:${userId}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function writeSavedPosts(
  storage: Pick<Storage, "setItem" | "removeItem"> | null | undefined,
  userId: string,
  savedIds: string[],
): string[] {
  const storageEngine =
    storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!storageEngine?.setItem || !storageEngine?.removeItem) return [];
  const normalized = Array.from(new Set(savedIds.filter(Boolean)));
  if (!normalized.length) {
    storageEngine.removeItem(`gf_saved_posts:${userId}`);
    return [];
  }
  storageEngine.setItem(`gf_saved_posts:${userId}`, JSON.stringify(normalized));
  return normalized;
}
